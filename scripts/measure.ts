// Cold-syncs one account through a PowerSync service and prints what it received.
//   PS_URL=http://localhost:58100 AUTH_URL=http://localhost:8000 ANON_KEY=... EMAIL=... PW=... npx tsx scripts/measure.ts
import { PsClient, signIn } from './powersync/client'

function env(name: string): string {
  const value = process.env[name]
  if (value == null) throw new Error(`${name} is not set`)
  return value
}

const token = await signIn({
  anonKey: env('ANON_KEY'),
  authUrl: env('AUTH_URL'),
  email: env('EMAIL'),
  password: env('PW'),
})
const client = new PsClient({ endpoint: env('PS_URL'), token })
const started = Date.now()
await client.connect()
const tables: Record<string, number> = {}
for (const key of client.rows.keys()) {
  const table = key.split('/')[0]
  tables[table] = (tables[table] ?? 0) + 1
}
console.log(JSON.stringify({ bytes: client.bytes, ms: Date.now() - started, ops: client.ops, tables }, null, 2))
client.disconnect()
