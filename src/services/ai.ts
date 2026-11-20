import type { Budget, Settings, Transaction } from './storage'
import { formatMoney, monthKey, snapshot } from '../lib/finance'
import { getApiBaseUrl, getApiUrl } from '../lib/api'

export interface FinancialContext {
  currency: string
  today: string
  dayOfWeek: string
  income: number
  expenses: number
  remaining: number
  budget: number
  budgetUsed: number
  budgetRemaining: number
  categoryTotals: Record<string, number>
  largestCategories: [string, number][]
  recentTransactions: { date: string; category: string; amount: number; description: string; type: string; account?: string }[]
  dailySpending: Record<string, { total: number; count: number; items: { description: string; category: string; amount: number; account?: string }[] }>
  previousDues: number
  recurringCount: number
  fiftyThirtyTwenty: {
    needs: number
    wants: number
    savings: number
  }
}

export interface ParsedTransactionAi {
  amount?: number
  description?: string
  category?: string
  account?: string
  type?: 'expense' | 'income' | 'due'
  date?: string
  notes?: string
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

  // Provide up to 50 recent transactions so the AI can inspect exact spending across any recent date
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const recent = sorted.slice(0, 50).map(t => ({
    date: t.date,
    category: t.category,
    amount: t.amount,
    description: t.description || t.category,
    type: t.type,
    account: t.account
  }))

  // Build daily spending index for exact date queries
  const dailySpending: Record<string, { total: number; count: number; items: { description: string; category: string; amount: number; account?: string }[] }> = {}
  sorted.filter(t => t.type === 'expense').forEach(t => {
    if (!dailySpending[t.date]) {
      dailySpending[t.date] = { total: 0, count: 0, items: [] }
    }
    dailySpending[t.date].total += t.amount
    dailySpending[t.date].count += 1
    dailySpending[t.date].items.push({
      description: t.description || t.category,
      category: t.category,
      amount: t.amount,
      account: t.account
    })
  })

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' })

  const recurringCount = transactions.filter(t => t.recurring).length
  const income = s.income || 0

  return {
    currency: settings.currency,
    today: todayStr,
    dayOfWeek,
    income,
    expenses: s.expenses,
    remaining: s.balance,
    budget: s.budget,
    budgetUsed: Math.round(s.budgetUsed),
    budgetRemaining: s.budgetRemaining,
    categoryTotals,
    largestCategories,
    recentTransactions: recent,
    dailySpending,
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

  // 1. Date / Day-specific spending inquiries (e.g. "what is my spending today", "spending on yesterday", "spending on 20th", "spending on Friday")
  const isDayQuery = lower.includes('today') || lower.includes('yesterday') ||
    lower.includes('particular day') || lower.includes('that day') ||
    /(?:spending|spent|expenses?)\s+(?:on|for|in)?\s*(today|yesterday|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?(?:\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?)/i.test(lower) ||
    lower.includes('how much did i spend') || lower.includes('how much spent') ||
    /\b(20\d\d-\d\d-\d\d|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i.test(lower)

  if (isDayQuery) {
    let targetDate = ctx.today
    let targetLabel = `Today (${ctx.today})`

    if (lower.includes('yesterday')) {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      targetDate = d.toISOString().slice(0, 10)
      targetLabel = `Yesterday (${targetDate})`
    } else {
      const isoMatch = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/)
      if (isoMatch) {
        targetDate = isoMatch[1]
        targetLabel = targetDate
      } else {
        const dayMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/)
        if (dayMatch) {
          const dayNum = dayMatch[1].padStart(2, '0')
          const monthPrefix = ctx.today.slice(0, 7)
          const candidate = `${monthPrefix}-${dayNum}`
          if (ctx.dailySpending[candidate]) {
            targetDate = candidate
            targetLabel = candidate
          }
        }
      }
    }

    const dayData = ctx.dailySpending[targetDate]
    if (!dayData || dayData.items.length === 0) {
      const availableDates = Object.keys(ctx.dailySpending).sort().reverse().slice(0, 5)
      let out = `### 📅 Spending for ${targetLabel}\n\n`
      out += `• **Total Spent**: **${f(0)}**\n`
      out += `• No expense transactions were logged for this date.\n\n`
      if (availableDates.length > 0) {
        out += `**Recent Days with Recorded Spending**:\n`
        availableDates.forEach(dt => {
          out += `• **${dt}**: ${f(ctx.dailySpending[dt].total)} (${ctx.dailySpending[dt].count} item${ctx.dailySpending[dt].count > 1 ? 's' : ''})\n`
        })
      }
      return out
    }

    let out = `### 📅 Spending for ${targetLabel}\n\n`
    out += `• **Total Spent**: **${f(dayData.total)}** across **${dayData.count} transaction${dayData.count > 1 ? 's' : ''}**.\n\n`
    out += `**Itemized Transactions**:\n`
    dayData.items.forEach(it => {
      out += `• **${it.description}**: **${f(it.amount)}** · *${it.category}*`
      if (it.account) out += ` · (${it.account})`
      out += `\n`
    })
    return out
  }

  // 2. 50/30/20 Budget analysis
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

  // 3. Predictive Cash Flow & Burn Rate Analysis
  if (lower.includes('burn') || lower.includes('forecast') || lower.includes('velocity') || lower.includes('project') || lower.includes('runway')) {
    const now = new Date()
    const day = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysRemaining = Math.max(1, daysInMonth - day)
    const dailyVelocity = day > 0 ? Math.round(ctx.expenses / day) : 0
    const projectedSpend = Math.round(ctx.expenses + (dailyVelocity * daysRemaining))
    const budgetCeiling = ctx.budget > 0 ? ctx.budget : (ctx.income > 0 ? ctx.income : 0)

    let out = `### ⚡ Cash Flow & Burn Rate Forecast\n\n`
    out += `• **Current Velocity**: Spending **${f(dailyVelocity)}/day** on average (${day} of ${daysInMonth} days elapsed).\n`
    out += `• **Projected Month-End Outflow**: **${f(projectedSpend)}**\n`
    if (budgetCeiling > 0) {
      const diff = budgetCeiling - projectedSpend
      if (diff >= 0) {
        out += `• **Surplus Outlook**: ✅ On track to retain **${f(diff)}** by month-end.\n`
        out += `• **Recommended Daily Cap**: To preserve this cushion, keep daily spending below **${f(Math.round((budgetCeiling - ctx.expenses) / daysRemaining))}/day** for the remaining ${daysRemaining} days.\n`
      } else {
        out += `• **Deficit Risk**: ⚠️ At this pace, you will exceed your ceiling by **${f(Math.abs(diff))}**.\n`
        out += `• **Adjustment Target**: Restrict discretionary outlays to **${f(Math.max(0, Math.round((budgetCeiling - ctx.expenses) / daysRemaining)))}/day** over the next ${daysRemaining} days to break even.\n`
      }
    }
    return out
  }

  // 4. Savings Goal Simulation
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

  // 5. Help / Greeting
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('help')) {
    return `### 👋 Welcome to THOGAI Financial AI\n\n` +
      `I am your private personal finance advisor. Here is a snapshot of where you stand right now:\n\n` +
      `• **Current Retained Balance**: **${f(ctx.remaining)}**\n` +
      `• **Monthly Income**: ${f(ctx.income)}\n` +
      `• **Monthly Outflows**: ${f(ctx.expenses)}\n` +
      (ctx.budget ? `• **Budget Allocation**: ${ctx.budgetUsed}% utilized (${f(ctx.budgetRemaining)} remaining)\n` : '') +
      `\n**You can ask me anything, such as**:\n` +
      `1. *"How is my 50/30/20 budget looking?"*\n` +
      `2. *"Analyze my highest expenses and spending patterns."*\n` +
      `3. *"How can I save ₹1,00,000 this year?"*\n` +
      `4. *"What is the best strategy to settle my pending dues?"*`
  }

  // 6. Default overview
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
 * Direct Gemini API call for mobile/Capacitor environments where a local serverless
 * backend is not running on localhost.
 */
async function callDirectGemini(
  message: string,
  conversationHistory: ConversationTurn[],
  financialContext: FinancialContext
): Promise<string | null> {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()

  if (!apiKey) return null

  const preferredModel = (import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite').trim()
  const candidateModels = Array.from(new Set([
    preferredModel,
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ]))

  const ctxString = JSON.stringify(financialContext, null, 2)
  const systemInstructionText = `You are THOGAI AI, an expert personal financial advisor embedded directly inside the user's private personal finance application (THOGAI).
The user's current live financial snapshot is:
${ctxString}

Guidelines:
1. Provide personalized financial guidance referencing the user's exact figures above (currency, expenses, income, budget status, dues).
2. If the user asks about their spending on a particular day, date, 'today', or 'yesterday', check dailySpending or recentTransactions for that exact date, state the total amount, and list each transaction itemized with its category and account.
3. For 50/30/20 budgets, break down actual income into 50% Needs, 30% Wants, 20% Savings with specific amounts.
4. For spending analysis, focus on their top spending categories and burn rate.
5. For savings goals and debt payoffs, provide structured, realistic milestones based on their actual available surplus and outstanding dues.
6. Format your answer cleanly in markdown using bullet points, numbered lists, and bold numbers.
7. Keep recommendations actionable, practical, and empathetic. Do not invent debt or transactions not present in the context.`

  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  for (const turn of conversationHistory) {
    if (turn.text && turn.text.trim()) {
      contents.push({
        role: turn.role === 'model' ? 'model' : 'user',
        parts: [{ text: turn.text.trim() }]
      })
    }
  }
  contents.push({
    role: 'user',
    parts: [{ text: message.trim() }]
  })

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents
  }

  for (const model of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        continue
      }

      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text && typeof text === 'string') {
        return text.trim()
      }
    } catch {
      // try next model
    }
  }

  return null
}

/**
 * Communicates with the secure THOGAI server endpoint or directly via Gemini API
 * when running on mobile (Capacitor/APK).
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

  const hasConfiguredApiUrl = Boolean(getApiBaseUrl())

  // 1. If backend URL is explicitly configured, try serverless route first
  if (hasConfiguredApiUrl) {
    try {
      const res = await fetch(getApiUrl('/api/ai'), {
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
    } catch {
      // fallback to direct Gemini call below
    }
  }

  // 2. Direct Gemini call (Primary path on mobile/Capacitor APK & fallback for web)
  try {
    const directText = await callDirectGemini(message, conversationHistory, financialContext)
    if (directText) {
      return {
        text: directText,
        isOffline: false
      }
    }
  } catch {
    // fallback to local deterministic advisor
  }

  // 3. Fall back cleanly to deterministic financial advisor logic
  const localFallback = generateLocalAiResponse(message, financialContext)
  return {
    text: localFallback || 'Unable to get advice right now. Please try again.',
    isOffline: true
  }
}

/**
 * Parses user natural language statement (e.g. "Paid 350 for dinner at Sri Ayyappa using Indian Bank")
 * or speech input into structured transaction fields.
 * Uses live Gemini when available and falls back to deterministic regex parser offline.
 */
export async function parseNaturalLanguageExpense(
  prompt: string,
  categories: string[],
  accounts: string[]
): Promise<ParsedTransactionAi> {
  const clean = prompt.trim()
  if (!clean) return {}

  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  const preferredModel = (import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite').trim()
  const candidateModels = Array.from(new Set([
    preferredModel,
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash'
  ]))

  const todayStr = new Date().toISOString().slice(0, 10)
  const systemInstruction = `You are a financial parsing assistant. The user enters a natural language expense or income statement.
Extract and return STRICT JSON with these keys:
- amount: (number > 0)
- description: (short clean merchant/purpose, e.g. "Sri Ayyappa Restaurant", "Petrol at Indian Oil", "Salary")
- category: (choose closest from: ${JSON.stringify(categories)})
- account: (choose closest from: ${JSON.stringify(accounts)})
- type: ("expense" | "income" | "due", default "expense")
- date: (YYYY-MM-DD, today is ${todayStr})
- notes: (optional brief notes)

Output ONLY valid JSON.`

  if (apiKey && typeof navigator !== 'undefined' && navigator.onLine) {
    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: clean }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        })
        if (res.ok) {
          const data = await res.json()
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            const parsed = JSON.parse(text)
            return {
              amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : undefined,
              description: parsed.description ? String(parsed.description) : undefined,
              category: categories.find(c => c.toLowerCase() === String(parsed.category || '').toLowerCase()) || parsed.category,
              account: accounts.find(a => a.toLowerCase() === String(parsed.account || '').toLowerCase()) || parsed.account,
              type: parsed.type === 'income' || parsed.type === 'due' ? parsed.type : 'expense',
              date: parsed.date || todayStr,
              notes: parsed.notes
            }
          }
        }
      } catch {
        // try next candidate model
      }
    }
  }

  // Deterministic local regex fallback (works 100% offline)
  return fallbackParseNaturalLanguage(clean, categories, accounts, todayStr)
}

/**
 * Parses receipt/bill/payment confirmation image using Gemini Vision Multimodal OCR.
 */
export async function parseReceiptImage(
  base64Data: string,
  mimeType: string,
  categories: string[],
  accounts: string[]
): Promise<ParsedTransactionAi> {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('Gemini API key is required for receipt scanning.')
  }

  const preferredModel = (import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite').trim()
  const candidateModels = Array.from(new Set([
    preferredModel,
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash'
  ]))

  const todayStr = new Date().toISOString().slice(0, 10)
  const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data

  const systemInstruction = `You are a financial receipt and bill OCR assistant.
Analyze this image of a receipt, invoice, bill, or payment confirmation screen.
Extract and return STRICT JSON with these keys:
- amount: (number, the total paid or due amount)
- description: (clean merchant name or store name)
- category: (choose closest from: ${JSON.stringify(categories)})
- account: (choose closest from: ${JSON.stringify(accounts)})
- type: ("expense" | "income")
- date: (YYYY-MM-DD if found on receipt, otherwise default to "${todayStr}")
- notes: (summary of itemized purchases or bill reference)

Output ONLY valid JSON.`

  for (const model of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{
            parts: [
              { text: 'Extract receipt financial data' },
              { inlineData: { mimeType, data: cleanBase64 } }
            ]
          }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      })

      if (res.ok) {
        const data = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          const parsed = JSON.parse(text)
          return {
            amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : undefined,
            description: parsed.description ? String(parsed.description) : undefined,
            category: categories.find(c => c.toLowerCase() === String(parsed.category || '').toLowerCase()) || parsed.category,
            account: accounts.find(a => a.toLowerCase() === String(parsed.account || '').toLowerCase()) || parsed.account,
            type: parsed.type === 'income' ? 'income' : 'expense',
            date: parsed.date || todayStr,
            notes: parsed.notes
          }
        }
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error('Could not parse receipt image. Please enter details manually.')
}

/**
 * Deterministic offline rule-based natural language parser.
 */
function fallbackParseNaturalLanguage(
  text: string,
  categories: string[],
  accounts: string[],
  todayStr: string
): ParsedTransactionAi {
  const lower = text.toLowerCase()

  // 1. Amount detection
  let amount: number | undefined
  const amtMatch = text.match(/(?:(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?))|([\d,]+(?:\.\d+)?)\s*(?:rs\.?|inr|₹)?/i)
  if (amtMatch) {
    const rawNum = amtMatch[1] || amtMatch[2]
    const parsedNum = parseFloat(rawNum.replace(/,/g, ''))
    if (!isNaN(parsedNum) && parsedNum > 0) {
      amount = parsedNum
    }
  }

  // 2. Type detection
  let type: 'expense' | 'income' | 'due' = 'expense'
  if (lower.includes('received') || lower.includes('salary') || lower.includes('earned') || lower.includes('credited')) {
    type = 'income'
  } else if (lower.includes('due') || lower.includes('borrowed') || lower.includes('loan')) {
    type = 'due'
  }

  // 3. Category matching
  let category: string | undefined
  for (const cat of categories) {
    if (lower.includes(cat.toLowerCase())) {
      category = cat
      break
    }
  }
  if (!category) {
    if (lower.includes('dinner') || lower.includes('lunch') || lower.includes('breakfast') || lower.includes('food') || lower.includes('coffee') || lower.includes('restaurant') || lower.includes('hotel') || lower.includes('swiggy') || lower.includes('zomato')) {
      category = categories.find(c => /food|dining|snack/i.test(c)) || 'Food & Dining'
    } else if (lower.includes('petrol') || lower.includes('diesel') || lower.includes('fuel')) {
      category = categories.find(c => /fuel|vehicle/i.test(c)) || 'Vehicle & Fuel'
    } else if (lower.includes('grocer') || lower.includes('milk') || lower.includes('veg') || lower.includes('supermarket')) {
      category = categories.find(c => /grocer/i.test(c)) || 'Groceries'
    } else if (lower.includes('cab') || lower.includes('uber') || lower.includes('ola') || lower.includes('auto') || lower.includes('bus') || lower.includes('metro') || lower.includes('train')) {
      category = categories.find(c => /transport/i.test(c)) || 'Transportation'
    }
  }

  // 4. Account matching
  let account: string | undefined
  for (const acc of accounts) {
    if (lower.includes(acc.toLowerCase())) {
      account = acc
      break
    }
  }

  // 5. Clean description
  let description = text
    .replace(/(?:(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d+)?)|(?:[\d,]+(?:\.\d+)?\s*(?:rs\.?|inr|₹)?)/gi, '')
    .replace(/\b(paid|spent|bought|for|using|with|via|from|at|in|today|yesterday|on)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!description) {
    description = category || (type === 'income' ? 'Income' : 'Expense')
  }

  return {
    amount,
    description: description.charAt(0).toUpperCase() + description.slice(1),
    category,
    account,
    type,
    date: todayStr
  }
}
