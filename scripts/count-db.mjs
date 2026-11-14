import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = fs.readFileSync('.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    let val = match[2] || ''
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[match[1]] = val.trim()
  }
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { count, error } = await supabase.from('transactions').select('*', { count: 'exact', head: true })
  console.log('Total transactions in DB (unauthenticated anon query):', { count, error })

  const { count: uCount, error: uErr } = await supabase.from('user_settings').select('*', { count: 'exact', head: true })
  console.log('Total user_settings in DB:', { count: uCount, error: uErr })
}

run().catch(console.error)

