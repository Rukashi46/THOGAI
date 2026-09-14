import type { Budget, Settings, Transaction } from './storage'
import { formatMoney, monthKey, snapshot } from '../lib/finance'

export interface FinancialContext {
  currency: string
  income: number
  expenses: number
  remaining: number
  budget: number
  budgetUsed: number
  budgetRemaining: number
  categoryTotals: Record<string, number>
  largestCategories: [string, number][]
  recentTransactions: { date: string; category: string; amount: number; description: string; type: string }[]
  previousDues: number
  recurringCount: number
  fiftyThirtyTwenty: {
    needs: number
    wants: number
    savings: number
  }
}

export interface ConversationTurn {
  role: 'user' | 'model'
  text: string
}

export function buildFinancialContext(transactions: Transaction[], budgets: Budget[], settings: Settings): FinancialContext {
  const currentKey = monthKey()
  const s = snapshot(transactions, settings, currentKey, budgets)
  const currentExpenses = transactions.filter(t => t.type === 'expense' && t.date.slice(0, 7) === currentKey)

  const categoryTotals: Record<string, number> = {}
  currentExpenses.forEach(t => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount
  })

  const largestCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(t => ({
    date: t.date,
    category: t.category,
    amount: t.amount,
    description: t.description || t.category,
    type: t.type
  }))

  const recurringCount = transactions.filter(t => t.recurring).length
  const income = s.income || 0

  return {
    currency: settings.currency,
    income,
    expenses: s.expenses,
    remaining: s.balance,
    budget: s.budget,
    budgetUsed: Math.round(s.budgetUsed),
    budgetRemaining: s.budgetRemaining,
    categoryTotals,
    largestCategories,
    recentTransactions: recent,
    previousDues: s.dues,
    recurringCount,
    fiftyThirtyTwenty: {
      needs: Math.round(income * 0.5),
      wants: Math.round(income * 0.3),
      savings: Math.round(income * 0.2)
    }
  }
}

/**
 * Deterministic local fallback advisor for offline resilience.
 * Always works without internet or API configuration.
 */
export function generateLocalAiResponse(prompt: string, ctx: FinancialContext): string {
  const lower = prompt.toLowerCase()
  const f = (n: number) => formatMoney(n, ctx.currency)

  // 1. 50/30/20 Budget analysis
  if (lower.includes('50/30/20') || lower.includes('50-30-20') || (lower.includes('budget') && lower.includes('plan'))) {
    if (ctx.income === 0) {
      return `### 💡 50/30/20 Budget Blueprint\n\n` +
        `• **Needs (50%)**: Essential commitments (housing, utilities, groceries, health).\n` +
        `• **Wants (30%)**: Lifestyle, leisure, dining out, personal hobbies.\n` +
        `• **Savings & Debt (20%)**: Emergency fund, debt prepayment, retirement.\n\n` +
        `*Tip: Log your monthly income to see your exact 50/30/20 rupee allocation calculated automatically!*`
    }
    const { needs, wants, savings } = ctx.fiftyThirtyTwenty
    return `### 📊 Your Personalized 50/30/20 Budget\n\n` +
      `Based on your total income of **${f(ctx.income)}** this month:\n\n` +
      `• **Needs (50%)**: **${f(needs)}** *(rent, utilities, essentials, groceries)*\n` +
      `• **Wants (30%)**: **${f(wants)}** *(dining out, leisure, shopping)*\n` +
      `• **Savings & Debt (20%)**: **${f(savings)}** *(emergency reserve, investments)*\n\n` +
      `**Current Actual Spend**: You have spent **${f(ctx.expenses)}** so far. ` +
      (ctx.expenses > needs + wants
        ? `⚠️ You are currently exceeding the combined Needs + Wants ceiling.`
        : `✅ Your total spending remains within healthy thresholds.`)
  }

  // 2. Spending Analysis
  if (lower.includes('analyze') || lower.includes('spending') || lower.includes('overspend') || lower.includes('trend')) {
    if (ctx.expenses === 0) {
      return `You haven't recorded any expenses for this month yet. Once you add transactions, I will analyze category weights, highest spend areas, and daily burn rates.`
    }
    const top = ctx.largestCategories[0]
    const second = ctx.largestCategories[1]
    const topPct = Math.round((top[1] / ctx.expenses) * 100)

    let out = `### 📊 Monthly Spending Breakdown\n\n`
    out += `• **Total Spent**: ${f(ctx.expenses)} across ${Object.keys(ctx.categoryTotals).length} categories.\n`
    out += `• **Primary Driver**: **${top[0]}** accounts for **${f(top[1])}** (${topPct}% of all expenses).\n`
    if (second) {
      const secondPct = Math.round((second[1] / ctx.expenses) * 100)
      out += `• **Secondary Driver**: **${second[0]}** represents **${f(second[1])}** (${secondPct}%).\n`
    }
    if (ctx.income > 0) {
      const burnRate = Math.round((ctx.expenses / ctx.income) * 100)
      out += `• **Income Burn Rate**: You have utilized **${burnRate}%** of your incoming cashflow.\n`
    }
    out += `\n**Recommendation**: Keeping **${top[0]}** controlled over the coming days offers the strongest leverage to boost your month-end surplus.`
    return out
  }

  // 3. Savings Goal Simulation
  if (lower.includes('goal') || lower.includes('simulate') || lower.includes('save 1') || lower.includes('1,00,000') || lower.includes('100000')) {
    const targetAmount = 100000
    const months = 12
    const monthlyNeeded = Math.round(targetAmount / months)
    const canAfford = ctx.remaining >= monthlyNeeded

    return `### 🎯 12-Month Savings Goal: ${f(targetAmount)}\n\n` +
      `• **Monthly Savings Target**: **${f(monthlyNeeded)}/month**\n` +
      `• **Current Retained Balance**: ${f(ctx.remaining)}\n` +
      `• **Status**: ${canAfford ? '✅ On Track! Your current monthly surplus covers this target.' : '⚠️ Stretch Target. You need to identify extra savings of ' + f(monthlyNeeded - Math.max(0, ctx.remaining)) + '/month.'}\n\n` +
      `**Strategy**:\n` +
      `1. Automate an automated transfer of ${f(monthlyNeeded)} immediately upon receiving your monthly income.\n` +
      `2. Protect this reserve in a separate high-yield account or fixed deposit.`
  }

  // 4. Debt Payoff Strategy
  if (lower.includes('debt') || lower.includes('due') || lower.includes('payoff') || lower.includes('obligation')) {
    return `### 🏛️ Debt & Dues Settlement Strategy\n\n` +
      `• **Dues Settled this Month**: ${f(ctx.previousDues)}\n` +
      `• **Current Available Cashflow**: ${f(ctx.remaining)}\n\n` +
      `**Recommended Approach**:\n` +
      `1. **Avalanche Method**: Direct surplus funds toward the highest-interest obligation first to minimize total interest paid.\n` +
      `2. **Snowball Method**: Alternatively, eliminate the smallest outstanding balance first for quick psychological momentum.\n` +
      `3. Always ensure minimum obligations are satisfied before expanding discretionary spend.`
  }

  // 5. Default overview
  const top = ctx.largestCategories[0]
  let summary = `### 🤖 THOGAI Financial Overview\n\n`
  summary += `• **Current Balance**: ${f(ctx.remaining)}\n`
  summary += `• **This Month's Inflows**: ${f(ctx.income)}\n`
  summary += `• **Total Expenses**: ${f(ctx.expenses)}\n`
  if (top) {
    summary += `• **Largest Outflow**: ${top[0]} (${f(top[1])})\n`
  }
  if (ctx.budget) {
    summary += `• **Budget Status**: ${ctx.budgetUsed}% used (${f(ctx.budgetRemaining)} remaining)\n`
  }
  summary += `\n**Quick Inquiries**:\n- *"Generate 50/30/20 Budget"*\n- *"Analyze spending trends"*\n- *"Simulate savings goal"*\n- *"Debt payoff strategy"*`
  return summary
}

/**
 * Communicates with the secure THOGAI server endpoint (/api/ai).
 * Automatically preserves multi-turn conversation history.
 * Falls back to deterministic local offline advisor if unavailable.
 */
export async function queryAiAdvisor(
  message: string,
  conversationHistory: ConversationTurn[],
  financialContext: FinancialContext
): Promise<{ text: string; isOffline: boolean }> {
  // If browser is explicitly offline, immediately run local advisor
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      text: generateLocalAiResponse(message, financialContext),
      isOffline: true
    }
  }

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversationHistory,
        financialContext
      })
    })

    const data = await res.json().catch(() => ({}))

    if (res.ok && data?.text) {
      return {
        text: data.text,
        isOffline: false
      }
    }

    // Fall back cleanly to deterministic financial advisor logic
    const localFallback = generateLocalAiResponse(message, financialContext)
    return {
      text: localFallback || 'Unable to get advice right now. Please try again.',
      isOffline: true
    }
  } catch {
    const localFallback = generateLocalAiResponse(message, financialContext)
    return {
      text: localFallback || 'Unable to get advice right now. Please try again.',
      isOffline: true
    }
  }
}
