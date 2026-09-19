import type { Budget, Settings, Transaction } from '../services/storage'
export const currencies = [{code:'INR',symbol:'₹',name:'Indian Rupee',locale:'en-IN'},{code:'USD',symbol:'$',name:'US Dollar',locale:'en-US'},{code:'EUR',symbol:'€',name:'Euro',locale:'de-DE'},{code:'GBP',symbol:'£',name:'British Pound',locale:'en-GB'},{code:'AED',symbol:'د.إ',name:'UAE Dirham',locale:'en-AE'},{code:'CAD',symbol:'CA$',name:'Canadian Dollar',locale:'en-CA'},{code:'AUD',symbol:'A$',name:'Australian Dollar',locale:'en-AU'},{code:'SGD',symbol:'S$',name:'Singapore Dollar',locale:'en-SG'}] as const
export const formatMoney = (amount: number, currency = 'INR', compact = false) => { const c = currencies.find(x => x.code === currency) ?? currencies[0]; const safe = Number.isFinite(amount) ? amount : 0; return new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.code, currencyDisplay: 'narrowSymbol', notation: compact ? 'compact' : 'standard', maximumFractionDigits: safe % 1 ? 2 : 0 }).format(safe) }
export const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`
export const isInMonth = (date: string, key = monthKey()) => date.slice(0,7) === key
/**
 * PERSONAL EXPENSE AMOUNT
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns how much of an expense counts toward YOUR budget.
 *
 * personalShare is set when you pay for a group but only part is yours:
 *   - Paid ₹2000 for a group meal, your share ₹200  → budget sees ₹200
 *   - Collected ₹900 before paying ₹1200            → set personalShare: 300
 *   - If personalShare is not set, full amount is yours.
 *
 * Balance (cash flow) always uses the FULL amount regardless — it reflects
 * actual money that left your account.
 */
export const getPersonalExpenseAmount = (t: Transaction): number => {
  if (t.type !== 'expense') return 0
  const safe = (n: number | undefined) => (Number.isFinite(n) && n! >= 0) ? n! : undefined
  const share = safe(t.personalShare)
  if (share !== undefined) return share
  return Number.isFinite(t.amount) ? Math.max(0, t.amount) : 0
}

/**
 * CASH FLOW AMOUNT
 * Full amount that actually left (or entered) the account.
 * Always the raw transaction amount — personalShare doesn't affect this.
 */
export const getCashFlowAmount = (t: Transaction): number => {
  return Number.isFinite(t.amount) ? Math.max(0, t.amount) : 0
}

/**
 * EARNED INCOME AMOUNT
 * Income that represents real earnings (not a transfer or refund).
 */
export const getEarnedIncomeAmount = (t: Transaction): number => {
  if (t.type !== 'income') return 0
  return Number.isFinite(t.amount) ? Math.max(0, t.amount) : 0
}

export const sum = (items: Transaction[], type: Transaction['type'], key = monthKey()) =>
  items
    .filter((t) => t.type === type && isInMonth(t.date, key))
    .reduce((n, t) => n + (type === 'expense' ? getPersonalExpenseAmount(t) : getCashFlowAmount(t)), 0)

export function snapshot(transactions: Transaction[], settings: Settings, key = monthKey(), budgets: Budget[] = []) {
  // Monthly cash movement
  const cashInflow = transactions
    .filter((t) => t.type === 'income' && isInMonth(t.date, key))
    .reduce((n, t) => n + getCashFlowAmount(t), 0)
  const cashOutflow = transactions
    .filter((t) => t.type === 'expense' && isInMonth(t.date, key))
    .reduce((n, t) => n + getCashFlowAmount(t), 0)
  const dues = transactions
    .filter((t) => t.type === 'due' && isInMonth(t.date, key))
    .reduce((n, t) => n + t.amount, 0)

  // Earned income (excluding friend repayments)
  const earnedIncome = transactions
    .filter((t) => t.type === 'income' && isInMonth(t.date, key))
    .reduce((n, t) => n + getEarnedIncomeAmount(t), 0)

  // Personal spending
  const personalExpenses = transactions
    .filter((t) => t.type === 'expense' && isInMonth(t.date, key))
    .reduce((n, t) => n + getPersonalExpenseAmount(t), 0)

  const totalCategoryBudget = (budgets || []).reduce((acc, b) => acc + (b.limit || 0), 0)
  const budget = settings.monthlyBudget > 0 ? settings.monthlyBudget : totalCategoryBudget

  // True account balance from full cash flows
  const allCashInflow = transactions
    .filter((t) => t.type === 'income')
    .reduce((n, t) => n + getCashFlowAmount(t), 0)
  const allCashOutflow = transactions
    .filter((t) => t.type === 'expense')
    .reduce((n, t) => n + getCashFlowAmount(t), 0)
  const allDues = transactions
    .filter((t) => t.type === 'due')
    .reduce((n, t) => n + t.amount, 0)
  const balance = settings.startingBalance + allCashInflow - allCashOutflow - allDues

  return {
    income: cashInflow,
    earnedIncome,
    expenses: personalExpenses,
    cashOutflow,
    dues,
    paidOut: cashOutflow + dues,
    balance,
    budget,
    budgetUsed: budget ? (personalExpenses / budget) * 100 : 0,
    budgetRemaining: Math.max(0, budget - personalExpenses)
  }
}

export const categorySpend = (transactions: Transaction[], category: string, key = monthKey()) =>
  transactions
    .filter((t) => t.type === 'expense' && t.category === category && isInMonth(t.date, key))
    .reduce((n, t) => n + getPersonalExpenseAmount(t), 0)

export const budgetState = (spent: number, limit: number) =>
  limit <= 0 ? 'normal' : spent / limit >= 1 ? 'over' : spent / limit >= 0.85 ? 'near' : spent / limit >= 0.65 ? 'warning' : 'normal'

export const groupByDate = (items: Transaction[]) =>
  items.reduce<Record<string, Transaction[]>>((all, t) => {
    ;(all[t.date] ??= []).push(t)
    return all
  }, {})

export const labelDate = (value: string) => {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (value === today) return 'Today'
  if (value === yesterday) return 'Yesterday'
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const seedBudgets = (categories: string[]): Budget[] => {
  const now = new Date().toISOString()
  return categories.map((category, i) => ({
    id: newId(),
    category,
    limit: [7000, 4000, 8000, 5000, 3000][i] ?? 3000,
    period: 'monthly',
    createdAt: now,
    updatedAt: now
  }))
}

