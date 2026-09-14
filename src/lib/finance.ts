import type { Budget, Settings, Transaction } from '../services/storage'
export const currencies = [{code:'INR',symbol:'₹',name:'Indian Rupee',locale:'en-IN'},{code:'USD',symbol:'$',name:'US Dollar',locale:'en-US'},{code:'EUR',symbol:'€',name:'Euro',locale:'de-DE'},{code:'GBP',symbol:'£',name:'British Pound',locale:'en-GB'},{code:'AED',symbol:'د.إ',name:'UAE Dirham',locale:'en-AE'},{code:'CAD',symbol:'CA$',name:'Canadian Dollar',locale:'en-CA'},{code:'AUD',symbol:'A$',name:'Australian Dollar',locale:'en-AU'},{code:'SGD',symbol:'S$',name:'Singapore Dollar',locale:'en-SG'}] as const
export const formatMoney = (amount: number, currency = 'INR', compact = false) => { const c = currencies.find(x => x.code === currency) ?? currencies[0]; const safe = Number.isFinite(amount) ? amount : 0; return new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.code, currencyDisplay: 'narrowSymbol', notation: compact ? 'compact' : 'standard', maximumFractionDigits: safe % 1 ? 2 : 0 }).format(safe) }
export const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`
export const isInMonth = (date: string, key = monthKey()) => date.slice(0,7) === key
export interface DebtItem {
  txId: string
  splitId: string
  person: string
  date: string
  description: string
  category: string
  originalAmount: number
  convertedToMyExpense: number
  repaidAmount: number
  remainingAmount: number
}

export interface PersonReceivable {
  person: string
  totalOwed: number
  items: DebtItem[]
}

export const normalizePersonName = (name: string): string => name.trim().toLowerCase()

/**
 * 1. ACCOUNT CASH FLOW
 * Actual cash entering or leaving an account.
 */
export const getCashFlowAmount = (t: Transaction): number => {
  return Number.isFinite(t.amount) ? Math.max(0, t.amount) : 0
}

/**
 * 2. PERSONAL SPENDING
 * What the user actually consumed, counting toward budget & expense analytics.
 * If paid for others, uses myShare plus any split portions converted to personal expense.
 */
export const getPersonalExpenseAmount = (t: Transaction): number => {
  if (t.type !== 'expense') return 0
  if (t.paidFor === 'others') {
    const myShare = Number.isFinite(t.myShare) ? Math.max(0, t.myShare!) : 0
    const converted = (t.splits || []).reduce((acc, s) => acc + (Number.isFinite(s.convertedToMyExpense) ? Math.max(0, s.convertedToMyExpense!) : 0), 0)
    return myShare + converted
  }
  return Number.isFinite(t.amount) ? Math.max(0, t.amount) : 0
}

/**
 * 3. EARNED INCOME
 * Real earned income. Friend Repayment is recovery of advanced funds, NOT earned income.
 */
export const getEarnedIncomeAmount = (t: Transaction): number => {
  if (t.type !== 'income') return 0
  if (t.category === 'Friend Repayment') return 0
  return Number.isFinite(t.amount) ? Math.max(0, t.amount) : 0
}

/**
 * 4. RECOVERABLE AMOUNT
 * Amount advanced for others on an expense.
 */
export const getRecoverableAmount = (t: Transaction): number => {
  if (t.type !== 'expense' || t.paidFor !== 'others' || !t.splits) return 0
  return t.splits.reduce((acc, s) => {
    const amt = Number.isFinite(s.amount) ? Math.max(0, s.amount) : 0
    const converted = Number.isFinite(s.convertedToMyExpense) ? Math.max(0, s.convertedToMyExpense!) : 0
    return acc + Math.max(0, amt - converted)
  }, 0)
}

/**
 * MONEY OWED CALCULATION
 * Dynamically derives outstanding amounts by person from transactions and repayments.
 */
export function getOutstandingReceivables(transactions: Transaction[]): PersonReceivable[] {
  // 1. Gather all debts from expense transactions with splits
  const allDebts: DebtItem[] = []
  const displayNames = new Map<string, string>()

  const sortedTxs = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

  sortedTxs.forEach((t) => {
    if (t.type === 'expense' && t.paidFor === 'others' && Array.isArray(t.splits)) {
      t.splits.forEach((s) => {
        const trimmed = (s.person || '').trim()
        if (!trimmed) return
        const normKey = normalizePersonName(trimmed)
        if (!displayNames.has(normKey)) {
          displayNames.set(normKey, trimmed)
        }
        const origAmt = Number.isFinite(s.amount) ? Math.max(0, s.amount) : 0
        const convAmt = Number.isFinite(s.convertedToMyExpense) ? Math.max(0, s.convertedToMyExpense!) : 0

        allDebts.push({
          txId: t.id,
          splitId: s.id,
          person: displayNames.get(normKey) || trimmed,
          date: t.date,
          description: t.description || t.category || 'Shared expense',
          category: t.category,
          originalAmount: origAmt,
          convertedToMyExpense: convAmt,
          repaidAmount: 0,
          remainingAmount: Math.max(0, origAmt - convAmt)
        })
      })
    }
  })

  // 2. Gather repayments (income with category 'Friend Repayment')
  const repayments = sortedTxs.filter(
    (t) => t.type === 'income' && t.category === 'Friend Repayment' && t.amount > 0
  )

  // Track remaining amounts on each debt item
  repayments.forEach((rep) => {
    let repAmount = rep.amount
    const repPersonNorm = rep.repaymentFor?.person ? normalizePersonName(rep.repaymentFor.person) : ''
    const targetSplitId = rep.repaymentFor?.splitId
    const targetTxId = rep.repaymentFor?.originatingTxId

    // Priority 1: match specific split or originating tx
    if (targetSplitId || targetTxId) {
      const match = allDebts.find(
        (d) => (targetSplitId && d.splitId === targetSplitId) || (targetTxId && d.txId === targetTxId)
      )
      if (match && match.remainingAmount > 0) {
        const applied = Math.min(match.remainingAmount, repAmount)
        match.repaidAmount += applied
        match.remainingAmount -= applied
        repAmount -= applied
      }
    }

    // Priority 2: deterministic allocation to oldest outstanding debt for this person
    if (repAmount > 0 && repPersonNorm) {
      const personDebts = allDebts.filter(
        (d) => normalizePersonName(d.person) === repPersonNorm && d.remainingAmount > 0
      )
      for (const d of personDebts) {
        if (repAmount <= 0) break
        const applied = Math.min(d.remainingAmount, repAmount)
        d.repaidAmount += applied
        d.remainingAmount -= applied
        repAmount -= applied
      }
    }
  })

  // 3. Group by person
  const grouped = new Map<string, PersonReceivable>()

  allDebts.forEach((debt) => {
    const normKey = normalizePersonName(debt.person)
    const canonicalName = displayNames.get(normKey) || debt.person
    if (!grouped.has(normKey)) {
      grouped.set(normKey, {
        person: canonicalName,
        totalOwed: 0,
        items: []
      })
    }
    const grp = grouped.get(normKey)!
    grp.items.push(debt)
    grp.totalOwed += debt.remainingAmount
  })

  // Return persons sorted with those who owe money first
  return Array.from(grouped.values())
    .map((p) => ({
      ...p,
      items: p.items.sort((a, b) => b.date.localeCompare(a.date))
    }))
    .filter((p) => p.totalOwed > 0)
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

