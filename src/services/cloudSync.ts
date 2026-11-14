import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { idbStorage, type QueuedSync } from './idb'
import {
  storage,
  getDefaultTheme,
  defaultSettings,
  defaultExpenseCategories,
  defaultIncomeCategories,
  defaultAccounts,
  type Budget,
  type FinanceData,
  type ReconciliationRecord,
  type Settings,
  type Transaction
} from './storage'
import type { AuthUser } from './auth'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

const META_TAG_PREFIX = '<!--thogai-meta:'
const META_TAG_SUFFIX = '-->'

export function encodeTransactionNotes(tx: Transaction): string {
  const baseNotes = (tx.notes || '').replace(/<!--thogai-meta:.*?-->/gs, '').trim()
  const meta: Record<string, any> = {}
  if (tx.personalShare !== undefined) meta.personalShare = tx.personalShare
  // v4 split fields — must be round-tripped through cloud so money-owed logic survives sync
  if (tx.paidFor !== undefined) meta.paidFor = tx.paidFor
  if (tx.myShare !== undefined) meta.myShare = tx.myShare
  if (Array.isArray(tx.splits) && tx.splits.length > 0) meta.splits = tx.splits
  if (tx.repaymentFor !== undefined) meta.repaymentFor = tx.repaymentFor

  if (Object.keys(meta).length === 0) {
    return baseNotes
  }
  const metaJson = JSON.stringify(meta)
  return baseNotes ? `${baseNotes}\n${META_TAG_PREFIX}${metaJson}${META_TAG_SUFFIX}` : `${META_TAG_PREFIX}${metaJson}${META_TAG_SUFFIX}`
}

export function decodeTransactionNotes(rawNotes: string = ''): {
  notes: string
  personalShare?: number
  paidFor?: 'myself' | 'others'
  myShare?: number
  splits?: Array<{ id: string; person: string; amount: number; convertedToMyExpense?: number }>
  repaymentFor?: { person: string; splitId?: string; originatingTxId?: string }
} {
  const match = rawNotes.match(/<!--thogai-meta:(.*?)-->/s)
  const cleanNotes = rawNotes.replace(/<!--thogai-meta:.*?-->/gs, '').trim()
  if (!match) {
    return { notes: cleanNotes }
  }
  try {
    const meta = JSON.parse(match[1])
    return {
      notes: cleanNotes,
      personalShare: typeof meta.personalShare === 'number' ? meta.personalShare : undefined,
      paidFor: meta.paidFor === 'myself' || meta.paidFor === 'others' ? meta.paidFor : undefined,
      myShare: typeof meta.myShare === 'number' ? meta.myShare : undefined,
      splits: Array.isArray(meta.splits) ? meta.splits : undefined,
      repaymentFor: meta.repaymentFor && typeof meta.repaymentFor.person === 'string' ? meta.repaymentFor : undefined,
    }
  } catch {
    return { notes: cleanNotes }
  }
}

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
    if (!isSupabaseConfigured()) return localData

    try {
      this.setSyncState('syncing')

      const [
        { data: cloudTx, error: txErr },
        { data: cloudBudgets, error: bErr },
        { data: cloudSettings, error: sErr }
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false }),
        supabase.from('budgets').select('*').eq('user_id', user.id),
        supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
      ])

      if (txErr) throw txErr
      if (bErr) throw bErr
      if (sErr) throw sErr

      // Load tombstones so deleted transactions don't get re-added from cloud
      const tombstones = await idbStorage.getDeletedTombstones(user.id)

      // Map cloud transactions to local format
      const mappedCloudTx: Transaction[] = (cloudTx || []).map((t: any) => {
        const decoded = decodeTransactionNotes(t.notes || '')
        return {
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          category: t.category,
          account: t.account || 'Cash',
          description: t.description || '',
          date: t.date,
          notes: decoded.notes,
          personalShare: decoded.personalShare,
          // v4 split fields restored from encoded notes
          ...(decoded.paidFor !== undefined && { paidFor: decoded.paidFor }),
          ...(decoded.myShare !== undefined && { myShare: decoded.myShare }),
          ...(decoded.splits !== undefined && { splits: decoded.splits }),
          ...(decoded.repaymentFor !== undefined && { repaymentFor: decoded.repaymentFor }),
          recurring: Boolean(t.recurring),
          createdAt: t.created_at,
          updatedAt: t.updated_at
        }
      })

      // 1. Transactions from cloud are the authoritative source of truth for the account
      const txMap = new Map<string, Transaction>()
      mappedCloudTx.forEach((ct) => {
        // If this id was deleted locally more recently than the cloud copy, keep it gone
        const tombstone = tombstones[ct.id]
        if (tombstone) {
          const cloudTime = new Date(ct.updatedAt).getTime()
          const deletedTime = new Date(tombstone).getTime()
          if (deletedTime >= cloudTime) return // local delete wins — skip re-adding
        }
        txMap.set(ct.id, ct)
      })

      // 2. Budgets from cloud
      const mappedCloudBudgets: Budget[] = (cloudBudgets || []).map((b: any) => ({
        id: b.id,
        category: b.category,
        limit: Number(b.limit_amount),
        period: b.period || 'monthly',
        createdAt: b.created_at,
        updatedAt: b.updated_at
      }))

      const budgetMap = new Map<string, Budget>()
      mappedCloudBudgets.forEach((cb) => {
        budgetMap.set(cb.id, cb)
      })

      // 3. Settings from cloud: restore balance, currency, budget, theme, etc.
      // Explicitly EXCLUDE pin and app lock so a fresh install or second device is never locked by an old PIN!
      let mergedSettings: Settings = { ...defaultSettings }
      if (cloudSettings) {
        const pinnedDefault = getDefaultTheme()
        const resolvedTheme = pinnedDefault ?? cloudSettings.theme ?? 'navy'
        const rawNotifs = cloudSettings.notifications || {}
        const incomeCats = Array.isArray(cloudSettings.income_categories) && cloudSettings.income_categories.length > 0
          ? cloudSettings.income_categories
          : Array.isArray(rawNotifs._income_categories) && rawNotifs._income_categories.length > 0
            ? rawNotifs._income_categories
            : defaultIncomeCategories

        mergedSettings = {
          name: user.name || rawNotifs._nickname || cloudSettings.nickname || 'User',
          currency: cloudSettings.currency || 'USD',
          monthlyBudget: Number(cloudSettings.monthly_budget ?? 0),
          startingBalance: Number(cloudSettings.starting_balance ?? 0),
          defaultCategory: cloudSettings.default_category || 'Food & Dining',
          defaultAccount: cloudSettings.default_account || 'Cash',
          theme: resolvedTheme,
          defaultTheme: pinnedDefault,
          categories: Array.isArray(cloudSettings.categories) && cloudSettings.categories.length > 0 ? cloudSettings.categories : defaultExpenseCategories,
          incomeCategories: incomeCats,
          accounts: Array.isArray(cloudSettings.accounts) && cloudSettings.accounts.length > 0 ? cloudSettings.accounts : defaultAccounts,
          notifications: {
            budget: rawNotifs.budget ?? true,
            dues: rawNotifs.dues ?? true,
            summary: rawNotifs.summary ?? false
          },
          onboardingCompleted: cloudSettings.onboarding_completed ?? rawNotifs._onboarding_completed ?? true,
          nickname: rawNotifs._nickname || cloudSettings.nickname || '',
          // Explicitly do NOT restore PIN or app lock from cloud or other devices:
          appLock: false,
          appLockPin: '',
          biometricLock: false,
          hideBalance: false
        }
      } else {
        mergedSettings = {
          ...defaultSettings,
          name: user.name || 'User',
          appLock: false,
          appLockPin: '',
          biometricLock: false,
          hideBalance: false
        }
      }

      const mergedData: FinanceData = {
        transactions: Array.from(txMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
        budgets: Array.from(budgetMap.values()),
        settings: mergedSettings
      }

      // Persist merged data to user's scoped IndexedDB and active storage
      await idbStorage.saveUserData(user.id, mergedData)
      storage.write(mergedData)
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
      if (op === 'DELETE') {
        await idbStorage.addDeletedTombstone(user.id, tx.id)
      }
      await this.enqueue(user.id, 'transaction', tx.id, op, tx)
      this.setSyncState('offline')
      return
    }

    this.setSyncState('syncing')
    try {
      if (op === 'DELETE') {
        // Record a tombstone so this id is never re-added by a subsequent pull()
        await idbStorage.addDeletedTombstone(user.id, tx.id)
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
          notes: encodeTransactionNotes(tx),
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
      const rawNotifs = (settings.notifications || { budget: true, dues: true, summary: true }) as any
      const row = {
        user_id: user.id,
        currency: settings.currency,
        monthly_budget: settings.monthlyBudget,
        starting_balance: settings.startingBalance,
        default_category: settings.defaultCategory,
        default_account: settings.defaultAccount,
        theme: settings.theme,
        categories: settings.categories,
        accounts: settings.accounts,
        notifications: {
          budget: rawNotifs.budget ?? true,
          dues: rawNotifs.dues ?? true,
          summary: rawNotifs.summary ?? false,
          _income_categories: settings.incomeCategories,
          _onboarding_completed: settings.onboardingCompleted,
          _nickname: settings.nickname
        },
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
                notes: encodeTransactionNotes(tx),
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
            const rawNotifs = (s.notifications || { budget: true, dues: true, summary: true }) as any
            await supabase.from('user_settings').upsert({
              user_id: user.id,
              currency: s.currency,
              monthly_budget: s.monthlyBudget,
              starting_balance: s.startingBalance,
              default_category: s.defaultCategory,
              default_account: s.defaultAccount,
              theme: s.theme,
              categories: s.categories,
              accounts: s.accounts,
              notifications: {
                budget: rawNotifs.budget ?? true,
                dues: rawNotifs.dues ?? true,
                summary: rawNotifs.summary ?? false,
                _income_categories: s.incomeCategories,
                _onboarding_completed: s.onboardingCompleted,
                _nickname: s.nickname
              },
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
      // Even with no transactions/budgets, still upload settings so startingBalance etc. syncs
      await this.syncSettings(guestData.settings, user)
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
        notes: encodeTransactionNotes(tx),
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

      // 3. Upload settings (startingBalance, currency, accounts, etc.)
      await this.syncSettings(guestData.settings, user)

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
   * Delete ALL cloud data for a user (transactions, budgets, settings).
   * Called when the user chooses "Clear all data" while signed in.
   */
  public async deleteAllUserData(user: AuthUser): Promise<void> {
    if (!isSupabaseConfigured()) return
    this.setSyncState('syncing')
    try {
      await Promise.all([
        supabase.from('transactions').delete().eq('user_id', user.id),
        supabase.from('budgets').delete().eq('user_id', user.id),
        supabase.from('user_settings').delete().eq('user_id', user.id),
      ])
      // Also clear any pending offline queue so wiped items don't get re-pushed
      await idbStorage.saveQueuedSyncs(user.id, [])
      this.setSyncState('synced')
    } catch (err) {
      if (import.meta.env.DEV) console.error('deleteAllUserData failed:', err)
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
