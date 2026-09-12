import type { IncomingMessage, ServerResponse } from 'http'

interface RequestPayload {
    message: string
    conversationHistory?: { role: 'user' | 'model'; text: string }[]
    financialContext?: Record<string, unknown>
}

export async function handleAiRequest(
    payload: RequestPayload,
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
                message: 'Unable to get advice right now. Please try again.'
            }
        }
    }

    const { message, conversationHistory = [], financialContext = {} } = payload
    if (!message || typeof message !== 'string' || !message.trim()) {
        return {
            status: 400,
            body: { error: 'INVALID_REQUEST', message: 'A user message is required.' }
        }
    }

    // Format financial context into a concise, structured system instruction
    const ctxString = JSON.stringify(financialContext, null, 2)
    const systemInstructionText = `You are THOGAI AI, an expert personal financial advisor embedded directly inside the user's private personal finance application (THOGAI).
The user's current live financial snapshot is:
${ctxString}

Guidelines:
1. Provide personalized financial guidance referencing the user's exact figures above (currency, expenses, income, budget status, dues).
2. For 50/30/20 budgets, break down actual income into 50% Needs, 30% Wants, 20% Savings with specific amounts.
3. For spending analysis, focus on their top spending categories and burn rate.
4. For savings goals and debt payoffs, provide structured, realistic milestones based on their actual available surplus and outstanding dues.
5. Format your answer cleanly in markdown using bullet points, numbered lists, and bold numbers.
6. Keep recommendations actionable, practical, and empathetic. Do not invent debt or transactions not present in the context.`

    // Build Gemini contents array preserving multi-turn conversational history
    const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = []

    for (const turn of conversationHistory) {
        if (turn.text && turn.text.trim()) {
            contents.push({
                role: turn.role === 'model' ? 'model' : 'user',
                parts: [{ text: turn.text.trim() }]
            })
        }
    }

    // Append current message
    contents.push({
        role: 'user',
        parts: [{ text: message.trim() }]
    })

    const geminiPayload = {
        systemInstruction: {
            parts: [{ text: systemInstructionText }]
        },
        contents
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.trim())}:generateContent?key=${apiKey.trim()}`

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        })

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            const errMsg = errData?.error?.message || `API error ${res.status}`
            console.error('Gemini API error status:', res.status, errMsg)
            return {
                status: res.status >= 400 && res.status < 500 ? 400 : 502,
                body: {
                    error: 'SERVICE_ERROR',
                    message: 'Unable to get advice right now. Please try again.'
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
                    message: 'Unable to get advice right now. Please try again.'
                }
            }
        }

        return {
            status: 200,
            body: { text: responseText }
        }
    } catch {
        return {
            status: 503,
            body: {
                error: 'NETWORK_ERROR',
                message: 'Unable to get advice right now. Please try again.'
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
        const body: RequestPayload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
        const result = await handleAiRequest(body)
        return res.status(result.status).json(result.body)
    } catch (e) {
        return res.status(400).json({ error: 'INVALID_JSON', message: 'Invalid JSON payload.' })
    }
}
