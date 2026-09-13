import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { idbStorage, type QueuedSync } from './idb'
import { storage, type Budget, type FinanceData, type ReconciliationRecord, type Settings, type Transaction } from './storage'
import type { AuthUser } from './auth'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

type SyncListener = (state: SyncState, lastSyncedAt: Date | null) => void

class CloudSyncService {
  private syncState: SyncState = 'idle'
  private lastSyncedAt: Date | null = null
  private listeners: Set<SyncListener> = new Set()
  private isDraining = false
  private currentUser: AuthUser | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.syncState === 'offline') {
          this.setSyncState('idle')
          this.drainQueue()
        }
      })
      window.addEventListener('offline', () => {
        this.setSyncState('offline')
      })
    }
  }

  public subscribe(listener: SyncListener) {
    this.listeners.add(listener)
    listener(this.syncState, this.lastSyncedAt)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setSyncState(state: SyncState) {
    this.syncState = state
    if (state === 'synced') {
      this.lastSyncedAt = new Date()
    }
    this.listeners.forEach((l) => l(this.syncState, this.lastSyncedAt))
  }

  public getStatus() {
    return { state: this.syncState, lastSyncedAt: this.lastSyncedAt }
  }

  public setUser(user: AuthUser | null) {
    this.currentUser = user
    if (!user) {
      this.setSyncState('idle')
    }
  }

  /**
   * Pull all cloud data for the authenticated user and merge with local IndexedDB (Last-Write-Wins).
   */
  public async pull(user: AuthUser, localData: FinanceData): Promise<FinanceData> {
    if (!isSupabaseConfigured()) {
      return localData
    }
    if (!navigator.onLine) {
      this.setSyncState('offline')
      return localData
    }

    this.setSyncState('syncing')
    try {
      // 1. Fetch Cloud Transactions
      const { data: cloudTx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)

      if (txErr) throw txErr

      // 2. Fetch Cloud Budgets
      const { data: cloudBudgets, error: bErr } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)

      if (bErr) throw bErr

      // 3. Fetch Cloud Settings
      const { data: cloudSettings, error: sErr } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (sErr) throw sErr

      // Map cloud transactions to local format
      const mappedCloudTx: Transaction[] = (cloudTx || []).map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        category: t.category,
        account: t.account || 'Cash',
        description: t.description || '',
        date: t.date,
        notes: t.notes || '',
        recurring: Boolean(t.recurring),
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }))

      // Merge transactions with Last-Write-Wins based on updatedAt
      const txMap = new Map<string, Transaction>()
      localData.transactions.forEach((t) => txMap.set(t.id, t))
      mappedCloudTx.forEach((ct) => {
        const local = txMap.get(ct.id)
        if (!local) {
          txMap.set(ct.id, ct)
        } else {
          // Last-Write-Wins
          const localTime = new Date(local.updatedAt).getTime()
          const cloudTime = new Date(ct.updatedAt).getTime()
          if (cloudTime >= localTime) {
            txMap.set(ct.id, ct)
          }
        }
      })

      // Map cloud budgets to local format
      const mappedCloudBudgets: Budget[] = (cloudBudgets || []).map((b: any) => ({
        id: b.id,
        category: b.category,
        limit: Number(b.limit_amount),
        period: b.period || 'monthly',
        createdAt: b.created_at,
        updatedAt: b.updated_at
      }))

      const budgetMap = new Map<string, Budget>()
      localData.budgets.forEach((b) => budgetMap.set(b.id, b))
      mappedCloudBudgets.forEach((cb) => {
        const local = budgetMap.get(cb.id)
        if (!local) {
          budgetMap.set(cb.id, cb)
        } else {
          const localTime = new Date(local.updatedAt).getTime()
          const cloudTime = new Date(cb.updatedAt).getTime()
          if (cloudTime >= localTime) {
            budgetMap.set(cb.id, cb)
          }
        }
      })

      // Merge Settings
      let mergedSettings = { ...localData.settings }
      if (cloudSettings) {
        mergedSettings = {
          ...mergedSettings,
          currency: cloudSettings.currency || mergedSettings.currency,
          monthlyBudget: Number(cloudSettings.monthly_budget ?? mergedSettings.monthlyBudget),
          startingBalance: Number(cloudSettings.starting_balance ?? mergedSettings.startingBalance),
          defaultCategory: cloudSettings.default_category || mergedSettings.defaultCategory,
          defaultAccount: cloudSettings.default_account || mergedSettings.defaultAccount,
          theme: cloudSettings.theme || mergedSettings.theme,
          categories: Array.isArray(cloudSettings.categories) ? cloudSettings.categories : mergedSettings.categories,
          incomeCategories: Array.isArray(cloudSettings.income_categories) ? cloudSettings.income_categories : mergedSettings.incomeCategories,
          accounts: Array.isArray(cloudSettings.accounts) ? cloudSettings.accounts : mergedSettings.accounts,
          notifications: cloudSettings.notifications || mergedSettings.notifications,
          onboardingCompleted: cloudSettings.onboarding_completed ?? mergedSettings.onboardingCompleted,
          nickname: cloudSettings.nickname || mergedSettings.nickname,
        }
      }

      const mergedData: FinanceData = {
        transactions: Array.from(txMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
        budgets: Array.from(budgetMap.values()),
        settings: mergedSettings
      }

      // Persist merged data to user's scoped IndexedDB
      await idbStorage.saveUserData(user.id, mergedData)
      this.setSyncState('synced')

      // Drain any queued offline mutations
      setTimeout(() => this.drainQueue(), 100)

      return mergedData
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Cloud pull failed:', err)
      }
      this.setSyncState('error')
      return localData
    }
  }

  /**
   * Save a transaction locally and push to cloud (or queue if offline).
   */
  public async syncTransaction(
    op: 'CREATE' | 'UPDATE' | 'DELETE',
    tx: Transaction,
    user: AuthUser | null
  ): Promise<void> {
    if (!user || !isSupabaseConfigured()) {
      return
    }

    if (!navigator.onLine) {
      await this.enqueue(user.id, 'transaction', tx.id, op, tx)
      this.setSyncState('offline')
      return
    }

    this.setSyncState('syncing')
    try {
      if (op === 'DELETE') {
        const { error } = await supabase.from('transactions').delete().eq('id', tx.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const row = {
          id: tx.id,
          user_id: user.id,
          type: tx.type,
          amount: tx.amount,
          category: tx.category,
          account: tx.account || 'Cash',
          description: tx.description || '',
          date: tx.date,
          notes: tx.notes || '',
          recurring: tx.recurring || false,
          created_at: tx.createdAt,
          updated_at: tx.updatedAt
        }
        const { error } = await supabase.from('transactions').upsert(row)
        if (error) throw error
      }
      this.setSyncState('synced')
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to sync transaction, enqueueing:', err)
      }
      await this.enqueue(user.id, 'transaction', tx.id, op, tx)
      this.setSyncState('error')
    }
  }

  /**
   * Save a budget locally and push to cloud.
   */
  public async syncBudget(
    op: 'CREATE' | 'UPDATE' | 'DELETE',
    budget: Budget,
    user: AuthUser | null
  ): Promise<void> {
    if (!user || !isSupabaseConfigured()) return

    if (!navigator.onLine) {
      await this.enqueue(user.id, 'budget', budget.id, op, budget)
      this.setSyncState('offline')
      return
    }

    this.setSyncState('syncing')
    try {
      if (op === 'DELETE') {
        const { error } = await supabase.from('budgets').delete().eq('id', budget.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const row = {
          id: budget.id,
          user_id: user.id,
          category: budget.category,
          limit_amount: budget.limit,
          period: budget.period,
          created_at: budget.createdAt,
          updated_at: budget.updatedAt
        }
        const { error } = await supabase.from('budgets').upsert(row)
        if (error) throw error
      }
      this.setSyncState('synced')
    } catch (err) {
      await this.enqueue(user.id, 'budget', budget.id, op, budget)
      this.setSyncState('error')
    }
  }

  /**
   * Sync user settings to cloud.
   */
  public async syncSettings(settings: Settings, user: AuthUser | null): Promise<void> {
    if (!user || !isSupabaseConfigured()) return

    if (!navigator.onLine) {
      await this.enqueue(user.id, 'settings', user.id, 'UPDATE', settings)
      this.setSyncState('offline')
      return
    }

    this.setSyncState('syncing')
    try {
      const row = {
        user_id: user.id,
        currency: settings.currency,
        monthly_budget: settings.monthlyBudget,
        starting_balance: settings.startingBalance,
        default_category: settings.defaultCategory,
        default_account: settings.defaultAccount,
        theme: settings.theme,
        categories: settings.categories,
        income_categories: settings.incomeCategories,
        accounts: settings.accounts,
        notifications: settings.notifications,
        onboarding_completed: settings.onboardingCompleted,
        nickname: settings.nickname,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('user_settings').upsert(row)
      if (error) throw error
      this.setSyncState('synced')
    } catch (err) {
      await this.enqueue(user.id, 'settings', user.id, 'UPDATE', settings)
      this.setSyncState('error')
    }
  }

  private async enqueue(
    userId: string,
    entityType: 'transaction' | 'budget' | 'settings',
    entityId: string,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: any
  ) {
    const queue = await idbStorage.getQueuedSyncs(userId)
    // Avoid duplicate operations on same entity
    const filtered = queue.filter((q) => !(q.entityId === entityId && q.entityType === entityType))
    filtered.push({
      operationId: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      entityType,
      entityId,
      operation,
      payload,
      createdAt: new Date().toISOString()
    })
    await idbStorage.saveQueuedSyncs(userId, filtered)
  }

  /**
   * Drain the offline queue when connection returns.
   */
  public async drainQueue(): Promise<void> {
    if (this.isDraining || !this.currentUser || !isSupabaseConfigured() || !navigator.onLine) {
      return
    }

    this.isDraining = true
    const user = this.currentUser
    try {
      const queue = await idbStorage.getQueuedSyncs(user.id)
      if (queue.length === 0) {
        this.isDraining = false
        return
      }

      this.setSyncState('syncing')
      const remaining: QueuedSync[] = []

      for (const item of queue) {
        try {
          if (item.entityType === 'transaction') {
            if (item.operation === 'DELETE') {
              await supabase.from('transactions').delete().eq('id', item.entityId).eq('user_id', user.id)
            } else {
              const tx = item.payload as Transaction
              await supabase.from('transactions').upsert({
                id: tx.id,
                user_id: user.id,
                type: tx.type,
                amount: tx.amount,
                category: tx.category,
                account: tx.account || 'Cash',
                description: tx.description || '',
                date: tx.date,
                notes: tx.notes || '',
                recurring: tx.recurring || false,
                created_at: tx.createdAt,
                updated_at: tx.updatedAt
              })
            }
          } else if (item.entityType === 'budget') {
            if (item.operation === 'DELETE') {
              await supabase.from('budgets').delete().eq('id', item.entityId).eq('user_id', user.id)
            } else {
              const b = item.payload as Budget
              await supabase.from('budgets').upsert({
                id: b.id,
                user_id: user.id,
                category: b.category,
                limit_amount: b.limit,
                period: b.period,
                created_at: b.createdAt,
                updated_at: b.updatedAt
              })
            }
          } else if (item.entityType === 'settings') {
            const s = item.payload as Settings
            await supabase.from('user_settings').upsert({
              user_id: user.id,
              currency: s.currency,
              monthly_budget: s.monthlyBudget,
              starting_balance: s.startingBalance,
              default_category: s.defaultCategory,
              default_account: s.defaultAccount,
              theme: s.theme,
              categories: s.categories,
              income_categories: s.incomeCategories,
              accounts: s.accounts,
              notifications: s.notifications,
              onboarding_completed: s.onboardingCompleted,
              nickname: s.nickname,
              updated_at: new Date().toISOString()
            })
          }
        } catch {
          remaining.push(item)
        }
      }

      await idbStorage.saveQueuedSyncs(user.id, remaining)
      if (remaining.length === 0) {
        this.setSyncState('synced')
      } else {
        this.setSyncState('error')
      }
    } finally {
      this.isDraining = false
    }
  }

  /**
   * Check if pre-existing guest data exists on this device that has not been imported.
   */
  public async checkGuestDataForMigration(userId: string): Promise<number> {
    const alreadyMigrated = await idbStorage.isDataMigrated(userId)
    if (alreadyMigrated) return 0
    const guestData = storage.read()
    return guestData.transactions.length
  }

  /**
   * Migrate existing local guest data into the user's Supabase cloud account.
   */
  public async migrateGuestData(user: AuthUser): Promise<number> {
    const guestData = storage.read()
    if (!guestData.transactions.length && !guestData.budgets.length) {
      await idbStorage.markDataMigrated(user.id)
      return 0
    }

    this.setSyncState('syncing')
    try {
      // 1. Upload transactions
      const txRows = guestData.transactions.map((tx) => ({
        id: tx.id,
        user_id: user.id,
        type: tx.type,
        amount: tx.amount,
        category: tx.category,
        account: tx.account || 'Cash',
        description: tx.description || '',
        date: tx.date,
        notes: tx.notes || '',
        recurring: tx.recurring || false,
        created_at: tx.createdAt,
        updated_at: tx.updatedAt
      }))

      if (txRows.length > 0) {
        await supabase.from('transactions').upsert(txRows)
      }

      // 2. Upload budgets
      const budgetRows = guestData.budgets.map((b) => ({
        id: b.id,
        user_id: user.id,
        category: b.category,
        limit_amount: b.limit,
        period: b.period,
        created_at: b.createdAt,
        updated_at: b.updatedAt
      }))

      if (budgetRows.length > 0) {
        await supabase.from('budgets').upsert(budgetRows)
      }

      await idbStorage.markDataMigrated(user.id)
      this.setSyncState('synced')
      return txRows.length
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Migration failed:', err)
      }
      this.setSyncState('error')
      throw err
    }
  }

  /**
   * Save a reconciliation record to cloud.
   */
  public async syncReconciliationRecord(
    record: ReconciliationRecord,
    user: AuthUser | null
  ): Promise<void> {
    if (!user || !isSupabaseConfigured() || !navigator.onLine) return
    try {
      await supabase.from('reconciliation_history').upsert({
        id: record.id,
        user_id: user.id,
        account: record.account,
        start_date: record.startDate,
        end_date: record.endDate,
        reconciliation_date: record.reconciliationDate,
        statement_closing_balance: record.statementClosingBalance,
        thogai_reconciled_balance: record.thogaiReconciledBalance,
        difference: record.difference,
        transactions_checked: record.transactionsChecked,
        transactions_matched: record.transactionsMatched,
      })
    } catch {}
  }

  /**
   * Fetch reconciliation history from cloud.
   */
  public async fetchReconciliationHistory(
    user: AuthUser | null
  ): Promise<ReconciliationRecord[]> {
    if (!user || !isSupabaseConfigured() || !navigator.onLine) return []
    try {
      const { data, error } = await supabase
        .from('reconciliation_history')
        .select('*')
        .eq('user_id', user.id)
        .order('reconciliation_date', { ascending: false })
      if (error || !data) return []
      return data.map((r: any) => ({
        id: r.id,
        account: r.account,
        startDate: r.start_date,
        endDate: r.end_date,
        reconciliationDate: r.reconciliation_date,
        statementClosingBalance: Number(r.statement_closing_balance),
        thogaiReconciledBalance: Number(r.thogai_reconciled_balance),
        difference: Number(r.difference),
        transactionsChecked: r.transactions_checked,
        transactionsMatched: r.transactions_matched,
      }))
    } catch { return [] }
  }
}

export const cloudSync = new CloudSyncService()
