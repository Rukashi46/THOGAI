import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { handleAiRequest } from './api/ai.ts'

function aiApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'thogai-api-ai',
    configureServer(server) {
      server.middlewares.use('/api/ai', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }))
          return
        }

        let bodyRaw = ''
        req.on('data', (chunk: Buffer | string) => {
          bodyRaw += chunk.toString()
        })

        req.on('end', async () => {
          try {
            const payload = JSON.parse(bodyRaw || '{}')
            const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''
            const model = env.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash'
            const result = await handleAiRequest(payload, apiKey, model)

            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.body))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'INVALID_JSON', message: 'Malformed JSON payload.' }))
          }
        })
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      aiApiPlugin(env)
    ],
    server: {
      host: '0.0.0.0',
      port: 5173
    }
  }
})
