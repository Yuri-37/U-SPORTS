import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Client } from 'pg'

// One-off helper to apply a single migration file directly against the
// pooler connection when `supabase db push` isn't available in this
// environment. Usage: tsx src/scripts/applyMigration.ts <filename-in-supabase/migrations>
async function main() {
  const filename = process.argv[2]
  if (!filename) {
    console.error('Usage: tsx src/scripts/applyMigration.ts <filename>')
    process.exit(1)
  }
  const filePath = path.resolve(__dirname, '../../../../supabase/migrations', filename)
  const sql = fs.readFileSync(filePath, 'utf8')

  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    await client.query(sql)
    console.log(`Applied ${filename}`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
