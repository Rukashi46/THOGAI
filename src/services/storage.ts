export type TransactionType = 'income' | 'expense' | 'due'
export type Period = 'monthly'
export type ThemeId = 'midnight' | 'cream' | 'cyan' | 'liquid' | 'navy'
export interface SplitShare {
  id: string
  person: string
  amount: number
  convertedToMyExpense?: number
}

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  category: string
  account?: string
  description: string
  date: string
  notes: string
  recurring: boolean
  createdAt: string
  updatedAt: string
  /**
   * personalShare: legacy field — how much of this expense counts toward your budget.
   * Undefined = full amount. Kept for backwards compat.
   */
  personalShare?: number
  /** v4 split model */
  paidFor?: 'myself' | 'others'
  myShare?: number
  splits?: SplitShare[]
  repaymentFor?: { person: string; splitId?: string; originatingTxId?: string }
}
export interface Budget { id: string; category: string; limit: number; period: Period; createdAt: string; updatedAt: string }

// ─── Reconciliation Types ─────────────────────────────────────────────────────
export interface StatementTransaction {
  id: string
  date: string
  description: string
  amount: number
  direction: 'debit' | 'credit'
  runningBalance?: number
  reference?: string
  rawNarration?: string
}

export type ReconciliationMatchType =
  | 'matched'
  | 'needs_review'
  | 'amount_mismatch'
  | 'date_mismatch'
  | 'missing_in_thogai'
  | 'missing_from_statement'
  | 'possible_duplicate'

export interface ReconciliationMatch {
  id: string
  statementTx?: StatementTransaction
  thogaiTx?: Transaction
  matchType: ReconciliationMatchType
  verified: boolean
  confidence: number
}

export interface ReconciliationSession {
  id: string
  account: string
  startDate: string
  endDate: string
  statementOpeningBalance?: number
  statementClosingBalance?: number
  statementTransactions: StatementTransaction[]
  matches: ReconciliationMatch[]
  status: 'selecting' | 'uploading' | 'reviewing' | 'completed'
  createdAt: string
}

export interface ReconciliationRecord {
  id: string
  account: string
  startDate: string
  endDate: string
  reconciliationDate: string
  statementClosingBalance: number
  thogaiReconciledBalance: number
  difference: number
  transactionsChecked: number
  transactionsMatched: number
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export interface Settings {
  name: string
  currency: string
  theme: ThemeId
  /** The user's chosen default theme — stored device-locally, never overwritten by cloud sync */
  defaultTheme: ThemeId | null
  monthlyBudget: number
  startingBalance: number
  defaultCategory: string
  hideBalance: boolean
  notifications: { budget: boolean; dues: boolean; summary: boolean }
  biometricLock: boolean
  appLock: boolean
  appLockPin: string
  categories: string[]
  incomeCategories: string[]
  accounts: string[]
  accountBalances: Record<string, number>
  defaultAccount: string
  onboardingCompleted: boolean
  nickname: string
}

/** Read the pinned default theme from a separate localStorage key (device-only, never synced) */
export const DEFAULT_THEME_KEY = 'thogai.defaultTheme'
export function getDefaultTheme(): ThemeId | null {
  try {
    const v = localStorage.getItem(DEFAULT_THEME_KEY)
    const valid: ThemeId[] = ['midnight', 'cream', 'cyan', 'liquid', 'navy']
    return v && valid.includes(v as ThemeId) ? (v as ThemeId) : null
  } catch { return null }
}
export function setDefaultTheme(id: ThemeId | null): void {
  try {
    if (id) localStorage.setItem(DEFAULT_THEME_KEY, id)
    else localStorage.removeItem(DEFAULT_THEME_KEY)
  } catch {}
}
export interface FinanceData { transactions: Transaction[]; budgets: Budget[]; settings: Settings }

export const defaultExpenseCategories: string[] = [
  'Food & Dining',
  'Groceries',
  'Fuel',
  'Transport',
  'Shopping',
  'Rent',
  'Electricity',
  'Water',
  'Internet',
  'Mobile Recharge',
  'EMI',
  'Insurance',
  'Medical',
  'Education',
  'Entertainment',
  'Travel',
  'Investment',
  'Family',
  'Subscription',
  'Personal Care',
  'Miscellaneous',
  'Snacks',
  'Food Bill'
]

export const defaultIncomeCategories: string[] = [
  'Salary',
  'Freelance',
  'Business Income',
  'Refund',
  'Cashback',
  'Interest',
  'Bonus',
  'Gift',
  'Friend Repayment',
  'Asset Sale',
  'Other'
]

export const defaultCategories: string[] = defaultExpenseCategories

export const defaultAccounts: string[] = [
  'Cash',
  'SBI',
  'HDFC',
  'ICICI',
  'Axis',
  'UPI',
  'Indian Bank',
  'Wallet',
  'Credit Card'
]

export const defaultSettings: Settings = {
  name: '',
  currency: 'INR',
  theme: 'midnight',
  defaultTheme: null,
  monthlyBudget: 0,
  startingBalance: 0,
  defaultCategory: 'Food & Dining',
  hideBalance: false,
  notifications: { budget: true, dues: true, summary: false },
  biometricLock: false,
  appLock: false,
  appLockPin: '',
  categories: defaultExpenseCategories,
  incomeCategories: defaultIncomeCategories,
  accounts: defaultAccounts,
  accountBalances: {},
  defaultAccount: 'Cash',
  onboardingCompleted: false,
  nickname: ''
}
const KEY = 'thogai.finance.v1'
const fallback: FinanceData = { transactions: [], budgets: [], settings: defaultSettings }
const validThemes: ThemeId[] = ['midnight', 'cream', 'cyan', 'liquid', 'navy']
export const sanitizeTheme = (theme?: unknown): ThemeId => (typeof theme === 'string' && (validThemes as string[]).includes(theme)) ? (theme as ThemeId) : 'midnight'

export function safeMergeItems(existing: unknown, defaults: string[]): string[] {
  if (!Array.isArray(existing) || existing.length === 0) {
    return [...defaults]
  }
  const norm = (s: string) => String(s).trim().toLowerCase()
  const result: string[] = [...defaults]
  for (const item of existing) {
    if (typeof item === 'string' && item.trim()) {
      const trimmed = item.trim()
      const exists = result.some((r) => norm(r) === norm(trimmed))
      if (!exists) {
        result.push(trimmed)
      }
    }
  }
  return result
}

export const storage = {
  read(): FinanceData {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return fallback
      const data = JSON.parse(raw) as FinanceData

      const resolvedExpenseCategories = safeMergeItems(
        data.settings?.categories,
        defaultExpenseCategories
      )
      const resolvedIncomeCategories = safeMergeItems(
        data.settings?.incomeCategories,
        defaultIncomeCategories
      )
      const resolvedAccounts = safeMergeItems(
        data.settings?.accounts,
        defaultAccounts
      )

      // Migrate legacy startingBalance into accountBalances if needed
      const rawBalances: Record<string, number> =
        data.settings?.accountBalances && typeof data.settings.accountBalances === 'object'
          ? { ...data.settings.accountBalances }
          : {}
      const legacyBalance = Number(data.settings?.startingBalance ?? 0)
      if (legacyBalance !== 0 && Object.keys(rawBalances).length === 0) {
        // First run after migration: seed the default account with the legacy balance
        const defAcc = (data.settings?.defaultAccount && resolvedAccounts.includes(data.settings.defaultAccount))
          ? data.settings.defaultAccount
          : 'Cash'
        rawBalances[defAcc] = legacyBalance
      }

      return {
        ...fallback,
        ...data,
        settings: {
          ...defaultSettings,
          ...data.settings,
          theme: sanitizeTheme(data.settings?.theme),
          categories: resolvedExpenseCategories,
          incomeCategories: resolvedIncomeCategories,
          accounts: resolvedAccounts,
          accountBalances: rawBalances,
          defaultCategory:
            data.settings?.defaultCategory && resolvedExpenseCategories.includes(data.settings.defaultCategory)
              ? data.settings.defaultCategory
              : 'Food & Dining',
          defaultAccount:
            data.settings?.defaultAccount && resolvedAccounts.includes(data.settings.defaultAccount)
              ? data.settings.defaultAccount
              : 'Cash'
        },
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        budgets: Array.isArray(data.budgets) ? data.budgets : []
      }
    } catch {
      return fallback
    }
  },
  write(data: FinanceData) {
    localStorage.setItem(KEY, JSON.stringify(data))
  },
  clear() {
    localStorage.removeItem(KEY)
  },
  export(data: FinanceData) {
    return JSON.stringify(
      { app: 'THOGAI', version: 1, exportedAt: new Date().toISOString(), data },
      null,
      2
    )
  },
  import(raw: string): FinanceData {
    const parsed = JSON.parse(raw)
    const data = parsed.data ?? parsed
    if (!Array.isArray(data.transactions) || !Array.isArray(data.budgets))
      throw new Error('This file is not a valid THOGAI export.')

    const resolvedExpense = safeMergeItems(data.settings?.categories, defaultExpenseCategories)
    const resolvedIncome = safeMergeItems(data.settings?.incomeCategories, defaultIncomeCategories)
    const resolvedAccs = safeMergeItems(data.settings?.accounts, defaultAccounts)

    const importedBalances: Record<string, number> =
      data.settings?.accountBalances && typeof data.settings.accountBalances === 'object'
        ? { ...data.settings.accountBalances }
        : {}
    const importedLegacy = Number(data.settings?.startingBalance ?? 0)
    if (importedLegacy !== 0 && Object.keys(importedBalances).length === 0) {
      const defAcc = (data.settings?.defaultAccount && resolvedAccs.includes(data.settings.defaultAccount))
        ? data.settings.defaultAccount
        : 'Cash'
      importedBalances[defAcc] = importedLegacy
    }

    return {
      ...fallback,
      ...data,
      settings: {
        ...defaultSettings,
        ...data.settings,
        theme: sanitizeTheme(data.settings?.theme),
        categories: resolvedExpense,
        incomeCategories: resolvedIncome,
        accounts: resolvedAccs,
        accountBalances: importedBalances,
        defaultCategory:
          data.settings?.defaultCategory && resolvedExpense.includes(data.settings.defaultCategory)
            ? data.settings.defaultCategory
            : 'Food & Dining',
        defaultAccount:
          data.settings?.defaultAccount && resolvedAccs.includes(data.settings.defaultAccount)
            ? data.settings.defaultAccount
            : 'Cash'
      }
    }
  }
}
