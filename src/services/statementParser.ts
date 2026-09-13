/**
 * THOGAI Client-Side Statement Parser
 *
 * Extracts raw text/tabular data from PDF, CSV, and Excel files.
 * Sends extracted text to /api/reconcile for AI interpretation.
 * Validates AI response deterministically.
 */

import type { StatementTransaction } from './storage'
import { newId } from '../lib/finance'

// ─── File Type Detection ──────────────────────────────────────────────────────

type StatementFormat = 'csv' | 'excel' | 'pdf' | 'unknown'

function detectFormat(file: File): StatementFormat {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (name.endsWith('.csv') || type === 'text/csv') return 'csv'
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || type.includes('spreadsheet') || type.includes('excel')) return 'excel'
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf'
  return 'unknown'
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSVText(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  return lines.map(line => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  })
}

async function extractCSV(file: File): Promise<string> {
  const text = await file.text()
  const rows = parseCSVText(text)
  return rows.map(r => r.join(' | ')).join('\n')
}

// ─── Excel Parser ─────────────────────────────────────────────────────────────

async function extractExcel(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const lines: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    for (const row of rows) {
      if (row.some(cell => cell != null && String(cell).trim())) {
        lines.push(row.map(c => String(c ?? '').trim()).join(' | '))
      }
    }
    // Only process first sheet for bank statements
    break
  }
  return lines.join('\n')
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────

async function extractPDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  // Use bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ')
    if (pageText.trim()) {
      lines.push(pageText.trim())
    }
  }
  return lines.join('\n')
}

// ─── Main Extract Function ────────────────────────────────────────────────────

async function extractTextFromFile(file: File): Promise<{ text: string; format: StatementFormat }> {
  const format = detectFormat(file)
  if (format === 'unknown') {
    throw new Error('Unsupported file format. Please use PDF, CSV, or Excel.')
  }

  let text: string
  switch (format) {
    case 'csv':
      text = await extractCSV(file)
      break
    case 'excel':
      text = await extractExcel(file)
      break
    case 'pdf':
      text = await extractPDF(file)
      break
    default:
      throw new Error('Unsupported file format.')
  }

  if (!text.trim()) {
    throw new Error('The file appears to be empty or could not be read.')
  }

  return { text, format }
}

// ─── AI Statement Interpretation ──────────────────────────────────────────────

interface AIStatementResponse {
  transactions: Array<{
    date?: string
    description?: string
    amount?: number
    direction?: 'debit' | 'credit'
    runningBalance?: number
    reference?: string
  }>
  openingBalance?: number
  closingBalance?: number
}

/**
 * Send extracted text to server for AI interpretation.
 * The server holds the API key; the client never sees it.
 */
async function interpretStatement(
  extractedText: string,
  account: string,
  startDate: string,
  endDate: string
): Promise<AIStatementResponse> {
  const response = await fetch('/api/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statementText: extractedText,
      account,
      startDate,
      endDate,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data?.transactions) {
    throw new Error(
      data?.message || "THOGAI couldn't read this statement. Please check the file and try again."
    )
  }

  return data as AIStatementResponse
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Deterministically validate and sanitize AI-extracted transactions */
function validateTransactions(raw: AIStatementResponse['transactions']): StatementTransaction[] {
  const validated: StatementTransaction[] = []

  for (const tx of raw) {
    // Amount must be a valid positive number
    const amount = Number(tx.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue

    // Direction must be debit or credit
    const direction = tx.direction === 'credit' ? 'credit' : 'debit'

    // Date must be valid
    let date = String(tx.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Try to parse common date formats
      const parsed = new Date(date)
      if (isNaN(parsed.getTime())) continue
      date = parsed.toISOString().slice(0, 10)
    }

    validated.push({
      id: newId(),
      date,
      description: String(tx.description || '').trim().slice(0, 500),
      amount: Math.round(amount * 100) / 100,
      direction,
      runningBalance: tx.runningBalance != null && Number.isFinite(Number(tx.runningBalance))
        ? Math.round(Number(tx.runningBalance) * 100) / 100
        : undefined,
      reference: tx.reference ? String(tx.reference).trim().slice(0, 100) : undefined,
      rawNarration: String(tx.description || '').trim().slice(0, 500),
    })
  }

  return validated
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParsedStatement {
  transactions: StatementTransaction[]
  openingBalance?: number
  closingBalance?: number
  format: StatementFormat
}

/**
 * Parse a bank statement file (PDF, CSV, Excel).
 *
 * 1. Extract raw text client-side
 * 2. Send text to server-side AI for interpretation
 * 3. Validate response deterministically
 *
 * Never exposes API keys or raw errors to the user.
 */
export async function parseStatement(
  file: File,
  account: string,
  startDate: string,
  endDate: string
): Promise<ParsedStatement> {
  try {
    // Step 1: Extract text from file
    const { text, format } = await extractTextFromFile(file)

    // Step 2: AI interpretation (server-side)
    const aiResponse = await interpretStatement(text, account, startDate, endDate)

    // Step 3: Deterministic validation
    const transactions = validateTransactions(aiResponse.transactions || [])

    if (transactions.length === 0) {
      throw new Error(
        "THOGAI couldn't find any transactions in this statement. Please check the file and try again."
      )
    }

    return {
      transactions,
      openingBalance: aiResponse.openingBalance != null && Number.isFinite(Number(aiResponse.openingBalance))
        ? Math.round(Number(aiResponse.openingBalance) * 100) / 100
        : undefined,
      closingBalance: aiResponse.closingBalance != null && Number.isFinite(Number(aiResponse.closingBalance))
        ? Math.round(Number(aiResponse.closingBalance) * 100) / 100
        : undefined,
      format,
    }
  } catch (err: any) {
    // Never expose technical errors to user
    const msg = err?.message || ''
    if (
      msg.includes('THOGAI') ||
      msg.includes('Unsupported') ||
      msg.includes('empty')
    ) {
      throw err
    }
    throw new Error(
      "THOGAI couldn't read this statement. Please check the file and try again."
    )
  }
}
