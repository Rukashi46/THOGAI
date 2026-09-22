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


// ─── Split share types (for MoneyOwedModal) ───────────────────────────────────

export interface SplitShare {
  id: string
  person: string
  amount: number
  convertedToMyExpense?: number
}

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

export const normalizePersonName = (n: string) => n.trim().toLowerCase()

/**
 * Derive outstanding receivables from legacy split transactions AND
 * from any repayments recorded against them.
 * Works with both the old paidFor/splits model and the new personalShare model.
 */
export function getOutstandingReceivables(transactions: Transaction[]): PersonReceivable[] {
  const allDebts: DebtItem[] = []
  const displayNames = new Map<string, string>()
  const sorted = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  )

  // Gather debts from legacy split transactions (paidFor=others with splits array)
  sorted.forEach(t => {
    const splits = (t as any).splits as SplitShare[] | undefined
    if (t.type === 'expense' && Array.isArray(splits) && (t as any).paidFor === 'others') {
      splits.forEach(s => {
        const name = (s.person || '').trim()
        if (!name) return
        const key = normalizePersonName(name)
        if (!displayNames.has(key)) displayNames.set(key, name)
        const orig = Math.max(0, Number(s.amount) || 0)
        const conv = Math.max(0, Number(s.convertedToMyExpense) || 0)
        allDebts.push({
          txId: t.id,
          splitId: s.id,
          person: displayNames.get(key) || name,
          date: t.date,
          description: t.description || t.category || 'Shared expense',
          category: t.category,
          originalAmount: orig,
          convertedToMyExpense: conv,
          repaidAmount: 0,
          remainingAmount: Math.max(0, orig - conv),
        })
      })
    }
  })

  // Apply Friend Repayment income against debts
  const repayments = sorted.filter(
    t => t.type === 'income' && t.category === 'Friend Repayment' && t.amount > 0
  )
  repayments.forEach(rep => {
    let left = rep.amount
    const repFor = (rep as any).repaymentFor as { person?: string; splitId?: string; originatingTxId?: string } | undefined
    const repKey = repFor?.person ? normalizePersonName(repFor.person) : ''
    const targetSplit = repFor?.splitId
    const targetTx = repFor?.originatingTxId

    // Priority: exact split/tx match first
    if (targetSplit || targetTx) {
      const match = allDebts.find(
        d => (targetSplit && d.splitId === targetSplit) || (targetTx && d.txId === targetTx)
      )
      if (match && match.remainingAmount > 0) {
        const applied = Math.min(match.remainingAmount, left)
        match.repaidAmount += applied
        match.remainingAmount -= applied
        left -= applied
      }
    }
    // Fallback: oldest outstanding for this person
    if (left > 0 && repKey) {
      allDebts
        .filter(d => normalizePersonName(d.person) === repKey && d.remainingAmount > 0)
        .forEach(d => {
          if (left <= 0) return
          const applied = Math.min(d.remainingAmount, left)
          d.repaidAmount += applied
          d.remainingAmount -= applied
          left -= applied
        })
    }
  })

  // Group by person
  const grouped = new Map<string, PersonReceivable>()
  allDebts.forEach(debt => {
    const key = normalizePersonName(debt.person)
    const name = displayNames.get(key) || debt.person
    if (!grouped.has(key)) grouped.set(key, { person: name, totalOwed: 0, items: [] })
    const g = grouped.get(key)!
    g.items.push(debt)
    g.totalOwed += debt.remainingAmount
  })

  return Array.from(grouped.values())
    .map(p => ({ ...p, items: p.items.sort((a, b) => b.date.localeCompare(a.date)) }))
    .filter(p => p.totalOwed > 0)
}
