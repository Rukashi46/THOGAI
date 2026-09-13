export type TransactionType = 'income' | 'expense' | 'due'
export type Period = 'monthly'
export type ThemeId = 'midnight' | 'cream' | 'amoled'
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
  defaultAccount: string
  onboardingCompleted: boolean
  nickname: string
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
  defaultAccount: 'Cash',
  onboardingCompleted: false,
  nickname: ''
}
const KEY = 'thogai.finance.v1'
const fallback: FinanceData = { transactions: [], budgets: [], settings: defaultSettings }
const validThemes: ThemeId[] = ['midnight', 'cream', 'amoled']
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
