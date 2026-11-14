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

// Use test user credentials if known or inspect auth
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function run() {
  console.log('Testing test insert with non-uuid:')
  const testId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  console.log('Generated testId:', testId)

  // Test insert into transactions without auth (will fail RLS or type)
  const { error } = await supabase.from('transactions').insert({
    id: testId,
    user_id: '00000000-0000-0000-0000-000000000000',
    type: 'expense',
    amount: 100,
    category: 'Food',
    date: '2026-11-13'
  })
  console.log('Insert error result:', error)
}

run().catch(console.error)

