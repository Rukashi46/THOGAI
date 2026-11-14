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
  console.log('Testing Supabase query...')
  const { data: txs, error: txErr } = await supabase.from('transactions').select('id, user_id, amount, description, date').limit(10)
  console.log('Transactions:', { count: txs?.length, error: txErr, sample: txs })

  const { data: st, error: stErr } = await supabase.from('user_settings').select('*').limit(10)
  console.log('Settings:', { count: st?.length, error: stErr, rows: st })

  const { data: b, error: bErr } = await supabase.from('budgets').select('*').limit(10)
  console.log('Budgets:', { count: b?.length, error: bErr, rows: b })
}

run().catch(console.error)
