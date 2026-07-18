import 'dotenv/config'
import type { Config } from 'drizzle-kit'

export default {
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/lib/db/schema.ts',
  verbose: true,
} satisfies Config
