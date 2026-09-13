/**
 * THOGAI Server-Side AI Statement Reader
 *
 * Vercel Serverless Function: /api/reconcile
 *
 * Receives extracted text from bank statements and uses Gemini AI
 * to interpret the structure and extract normalized transactions.
 *
 * Security:
 * - API key stays server-side
 * - Statement text is NOT sent to the normal AI Advisor conversation
 * - Separate endpoint, separate system prompt
 * - Never returns raw API errors to client
 */

interface ReconcilePayload {
  statementText: string
  account?: string
  startDate?: string
  endDate?: string
}

export async function handleReconcileRequest(
  payload: ReconcilePayload,
  envApiKey?: string,
  envModel?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const apiKey = envApiKey || process.env.GEMINI_API_KEY || ''
  const model = envModel || process.env.GEMINI_MODEL || 'gemini-3.6-flash'

  if (!apiKey || !apiKey.trim()) {
    return {
      status: 400,
      body: {
        error: 'SERVICE_UNAVAILABLE',
        message: "THOGAI couldn't read this statement. Please try again later."
      }
    }
  }

  const { statementText } = payload
  if (!statementText || typeof statementText !== 'string' || !statementText.trim()) {
    return {
      status: 400,
      body: {
        error: 'INVALID_REQUEST',
        message: "No statement content provided."
      }
    }
  }

  // Limit text to prevent abuse (max ~100KB of text)
  const truncatedText = statementText.slice(0, 100_000)

  const systemPrompt = `You are a bank statement parser. Your ONLY job is to extract transaction data from the provided bank statement text.

RULES:
1. Extract EVERY transaction you can identify from the statement text.
2. For each transaction, extract: date, description/narration, amount, direction (debit or credit).
3. Also extract: running balance (if available), reference/UTR/transaction ID (if available).
4. Recognize common column header variations:
   - Date: Date, Txn Date, Transaction Date, Value Date, Posting Date
   - Description: Description, Narration, Transaction Details, Particulars, Remarks
   - Debit: Debit, Withdrawal, Dr, Dr Amount, Debit Amount
   - Credit: Credit, Deposit, Cr, Cr Amount, Credit Amount
   - Balance: Balance, Running Balance, Available Balance, Closing Balance
   - Reference: Reference, UTR, Transaction ID, Ref No, Chq No
5. Handle multiline descriptions (UPI IDs, bank codes, reference numbers in narration).
6. If you can identify the opening balance and closing balance, include them.
7. Dates should be in YYYY-MM-DD format.
8. Amounts should be plain numbers (no currency symbols, no commas).

CRITICAL - YOU MUST NOT:
- Invent transactions that don't exist in the statement
- Invent or modify amounts
- Guess missing information
- Add transactions not present in the text

Respond ONLY with valid JSON in this exact structure:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "transaction description/narration",
      "amount": 123.45,
      "direction": "debit" or "credit",
      "runningBalance": 1234.56,
      "reference": "UTR/ref number if available"
    }
  ],
  "openingBalance": 5000.00,
  "closingBalance": 4500.00
}

If you cannot identify opening/closing balance, omit those fields.
If a field is not available for a transaction, omit it (except date, description, amount, direction which are required).`

  const contents = [
    {
      role: 'user' as const,
      parts: [{ text: `Parse this bank statement and extract all transactions:\n\n${truncatedText}` }]
    }
  ]

  const geminiPayload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1 // Low temperature for accurate extraction
    }
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.trim())}:generateContent?key=${apiKey.trim()}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    })

    if (!res.ok) {
      return {
        status: 502,
        body: {
          error: 'SERVICE_ERROR',
          message: "THOGAI couldn't read this statement. Please try again."
        }
      }
    }

    const data = await res.json()
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!responseText) {
      return {
        status: 502,
        body: {
          error: 'EMPTY_RESPONSE',
          message: "THOGAI couldn't read this statement. Please try again."
        }
      }
    }

    // Parse the JSON response
    let parsed: any
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText)
    } catch {
      return {
        status: 502,
        body: {
          error: 'PARSE_ERROR',
          message: "THOGAI couldn't interpret this statement format. Please try a different file."
        }
      }
    }

    // Validate structure
    if (!parsed?.transactions || !Array.isArray(parsed.transactions)) {
      return {
        status: 502,
        body: {
          error: 'INVALID_STRUCTURE',
          message: "THOGAI couldn't find transactions in this statement. Please check the file."
        }
      }
    }

    return {
      status: 200,
      body: {
        transactions: parsed.transactions,
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance
      }
    }
  } catch {
    return {
      status: 503,
      body: {
        error: 'NETWORK_ERROR',
        message: "THOGAI couldn't read this statement. Please check your connection and try again."
      }
    }
  }
}

// Vercel Serverless Function entry point
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' })
  }

  try {
    const body: ReconcilePayload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const result = await handleReconcileRequest(body)
    return res.status(result.status).json(result.body)
  } catch {
    return res.status(400).json({ error: 'INVALID_JSON', message: 'Invalid request.' })
  }
}
