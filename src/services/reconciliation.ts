/**
 * THOGAI Deterministic Reconciliation Engine
 *
 * Pure deterministic matching and balance calculations.
 * AI is used ONLY for statement interpretation (server-side).
 * All financial arithmetic and final match decisions are deterministic.
 */

import type {
  Transaction,
  StatementTransaction,
  ReconciliationMatch,
  ReconciliationMatchType,
  ReconciliationRecord,
} from './storage'
import { newId } from '../lib/finance'

// ─── Text Normalization ───────────────────────────────────────────────────────

/** Strip UPI IDs, bank codes, masked accounts, extra whitespace */
function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\/\\|@]/g, ' ')
    .replace(/\b[a-z]{4}0\d{6}\b/gi, '') // IFSC codes
    .replace(/\bx{3,}\d{2,4}\b/gi, '')   // masked account numbers
    .replace(/\bupi\b/gi, '')
    .replace(/\b(neft|rtgs|imps|ref|txn|utr)\b/gi, '')
    .replace(/\d{10,}/g, '')             // long reference numbers
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Compute simple word-overlap similarity between 0 and 1 */
function descriptionSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeDescription(a).split(' ').filter(w => w.length > 2))
  const wordsB = new Set(normalizeDescription(b).split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  wordsA.forEach(w => { if (wordsB.has(w)) overlap++ })
  return overlap / Math.max(wordsA.size, wordsB.size)
}

/** Parse a date string to epoch ms for comparison */
function dateMs(d: string): number {
  return new Date(d + 'T12:00:00').getTime()
}

/** Check if two dates are within N days */
function datesWithinDays(a: string, b: string, days: number): boolean {
  const diff = Math.abs(dateMs(a) - dateMs(b))
  return diff <= days * 86400000
}

// ─── Matching Engine ──────────────────────────────────────────────────────────

interface MatchCandidate {
  stmtIdx: number
  thogaiIdx: number
  confidence: number
  matchType: ReconciliationMatchType
}

/**
 * Map transaction type to debit/credit direction for bank statement comparison.
 * expense/due = debit (money leaving account)
 * income = credit (money entering account)
 */
function txDirection(tx: Transaction): 'debit' | 'credit' {
  return tx.type === 'income' ? 'credit' : 'debit'
}

/**
 * Given statement transactions and THOGAI transactions filtered to the
 * reconciliation account and date range, produce ReconciliationMatch[].
 *
 * Matching signals (roughly ordered by importance):
 * 1. direction (debit/credit)
 * 2. amount (exact match)
 * 3. date (exact or within 1–2 days)
 * 4. reference/transaction ID
 * 5. description similarity
 */
export function matchTransactions(
  statementTxs: StatementTransaction[],
  thogaiTxs: Transaction[]
): ReconciliationMatch[] {
  const candidates: MatchCandidate[] = []

  // Build candidate matrix
  for (let si = 0; si < statementTxs.length; si++) {
    const stx = statementTxs[si]
    for (let ti = 0; ti < thogaiTxs.length; ti++) {
      const ttx = thogaiTxs[ti]
      const dir = txDirection(ttx)

      // Direction must match
      if (stx.direction !== dir) continue

      let confidence = 0
      let matchType: ReconciliationMatchType = 'needs_review'

      // Amount match
      const amountMatch = Math.abs(stx.amount - ttx.amount) < 0.01
      const amountClose = Math.abs(stx.amount - ttx.amount) / Math.max(stx.amount, 1) < 0.05
      if (amountMatch) confidence += 0.4
      else if (amountClose) confidence += 0.15

      // Date match
      const dateExact = stx.date === ttx.date
      const dateClose = datesWithinDays(stx.date, ttx.date, 2)
      if (dateExact) confidence += 0.25
      else if (dateClose) confidence += 0.1

      // Reference match
      if (stx.reference && ttx.notes) {
        const refNorm = stx.reference.toLowerCase().trim()
        const notesNorm = ttx.notes.toLowerCase().trim()
        if (refNorm && notesNorm && (notesNorm.includes(refNorm) || refNorm.includes(notesNorm))) {
          confidence += 0.2
        }
      }

      // Description similarity
      const descSim = descriptionSimilarity(
        stx.description || stx.rawNarration || '',
        `${ttx.description} ${ttx.category} ${ttx.notes}`
      )
      confidence += descSim * 0.15

      // Determine match type
      if (amountMatch && dateExact) {
        matchType = 'matched'
      } else if (amountMatch && dateClose) {
        matchType = 'date_mismatch'
      } else if (!amountMatch && dateExact) {
        matchType = 'amount_mismatch'
      } else if (confidence >= 0.35) {
        matchType = 'needs_review'
      }

      // Only include reasonable candidates
      if (confidence >= 0.25) {
        candidates.push({ stmtIdx: si, thogaiIdx: ti, confidence, matchType })
      }
    }
  }

  // Greedy assignment: best confidence first, each tx matched at most once
  candidates.sort((a, b) => b.confidence - a.confidence)
  const usedStmt = new Set<number>()
  const usedThogai = new Set<number>()
  const matches: ReconciliationMatch[] = []

  for (const c of candidates) {
    if (usedStmt.has(c.stmtIdx) || usedThogai.has(c.thogaiIdx)) continue
    usedStmt.add(c.stmtIdx)
    usedThogai.add(c.thogaiIdx)
    matches.push({
      id: newId(),
      statementTx: statementTxs[c.stmtIdx],
      thogaiTx: thogaiTxs[c.thogaiIdx],
      matchType: c.matchType,
      verified: false,
      confidence: c.confidence,
    })
  }

  // Unmatched statement transactions → missing_in_thogai
  for (let si = 0; si < statementTxs.length; si++) {
    if (!usedStmt.has(si)) {
      matches.push({
        id: newId(),
        statementTx: statementTxs[si],
        thogaiTx: undefined,
        matchType: 'missing_in_thogai',
        verified: false,
        confidence: 0,
      })
    }
  }

  // Unmatched THOGAI transactions → missing_from_statement
  for (let ti = 0; ti < thogaiTxs.length; ti++) {
    if (!usedThogai.has(ti)) {
      matches.push({
        id: newId(),
        statementTx: undefined,
        thogaiTx: thogaiTxs[ti],
        matchType: 'missing_from_statement',
        verified: false,
        confidence: 0,
      })
    }
  }

  // Detect possible duplicates within THOGAI (same amount, date, direction)
  for (let i = 0; i < thogaiTxs.length; i++) {
    for (let j = i + 1; j < thogaiTxs.length; j++) {
      const a = thogaiTxs[i], b = thogaiTxs[j]
      if (
        a.amount === b.amount &&
        a.date === b.date &&
        a.type === b.type &&
        a.category === b.category
      ) {
        // Mark the second as a possible duplicate (if not already matched)
        const existingMatch = matches.find(m => m.thogaiTx?.id === b.id)
        if (existingMatch && existingMatch.matchType !== 'matched') {
          existingMatch.matchType = 'possible_duplicate'
        }
      }
    }
  }

  return matches
}

// ─── Balance Reconciliation ───────────────────────────────────────────────────

export interface BalanceReconciliation {
  statementOpeningBalance: number | null
  statementClosingBalance: number | null
  statementCredits: number
  statementDebits: number
  expectedClosingBalance: number | null
  thogaiBalance: number
  verifiedBalance: number
  difference: number | null
  transactionsChecked: number
  transactionsMatched: number
  transactionsVerified: number
  needsReview: number
  isReconciled: boolean
}

export function calculateReconciliation(
  matches: ReconciliationMatch[],
  openingBalance?: number,
  closingBalance?: number,
  allThogaiTxsInRange?: Transaction[],
  startingBalance?: number
): BalanceReconciliation {
  const stmtCredits = matches
    .filter(m => m.statementTx?.direction === 'credit')
    .reduce((sum, m) => sum + (m.statementTx?.amount || 0), 0)

  const stmtDebits = matches
    .filter(m => m.statementTx?.direction === 'debit')
    .reduce((sum, m) => sum + (m.statementTx?.amount || 0), 0)

  const expectedClosing = openingBalance != null
    ? openingBalance + stmtCredits - stmtDebits
    : null

  // THOGAI balance for the period
  const thogaiIncome = (allThogaiTxsInRange || [])
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0)
  const thogaiExpenses = (allThogaiTxsInRange || [])
    .filter(t => t.type === 'expense' || t.type === 'due')
    .reduce((s, t) => s + t.amount, 0)
  const thogaiBalance = (startingBalance || 0) + thogaiIncome - thogaiExpenses

  // Verified balance (only confirmed matches)
  const verifiedCredits = matches
    .filter(m => m.verified && m.statementTx?.direction === 'credit')
    .reduce((s, m) => s + (m.statementTx?.amount || 0), 0)
  const verifiedDebits = matches
    .filter(m => m.verified && m.statementTx?.direction === 'debit')
    .reduce((s, m) => s + (m.statementTx?.amount || 0), 0)
  const verifiedBalance = (openingBalance || 0) + verifiedCredits - verifiedDebits

  const checked = matches.filter(m => m.statementTx || m.thogaiTx).length
  const matched = matches.filter(m => m.matchType === 'matched').length
  const verified = matches.filter(m => m.verified).length
  const needsReview = matches.filter(m =>
    !m.verified && m.matchType !== 'matched'
  ).length

  const difference = closingBalance != null
    ? Math.round((closingBalance - thogaiBalance) * 100) / 100
    : null

  return {
    statementOpeningBalance: openingBalance ?? null,
    statementClosingBalance: closingBalance ?? null,
    statementCredits: Math.round(stmtCredits * 100) / 100,
    statementDebits: Math.round(stmtDebits * 100) / 100,
    expectedClosingBalance: expectedClosing != null
      ? Math.round(expectedClosing * 100) / 100
      : null,
    thogaiBalance: Math.round(thogaiBalance * 100) / 100,
    verifiedBalance: Math.round(verifiedBalance * 100) / 100,
    difference,
    transactionsChecked: checked,
    transactionsMatched: matched,
    transactionsVerified: verified,
    needsReview,
    isReconciled: difference != null ? Math.abs(difference) < 0.01 && needsReview === 0 : needsReview === 0,
  }
}

/** Filter THOGAI transactions by account and date range */
export function filterTransactionsForReconciliation(
  transactions: Transaction[],
  account: string,
  startDate: string,
  endDate: string
): Transaction[] {
  return transactions.filter(t => {
    const matchesAccount = !account || account === 'all' || t.account === account
    const inRange = t.date >= startDate && t.date <= endDate
    return matchesAccount && inRange
  })
}

/** Build a reconciliation record from a completed session */
export function buildReconciliationRecord(
  session: {
    account: string
    startDate: string
    endDate: string
    matches: ReconciliationMatch[]
  },
  closingBalance: number,
  thogaiBalance: number
): ReconciliationRecord {
  const matched = session.matches.filter(m => m.matchType === 'matched' || m.verified).length
  return {
    id: newId(),
    account: session.account,
    startDate: session.startDate,
    endDate: session.endDate,
    reconciliationDate: new Date().toISOString().slice(0, 10),
    statementClosingBalance: closingBalance,
    thogaiReconciledBalance: thogaiBalance,
    difference: Math.round((closingBalance - thogaiBalance) * 100) / 100,
    transactionsChecked: session.matches.length,
    transactionsMatched: matched,
  }
}
