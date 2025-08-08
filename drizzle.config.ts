// drizzle.config.ts
import 'dotenv/config'        // ← this must be first!
import type { Config } from 'drizzle-kit'

const databaseUrl = process.env.TURSO_DB_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!databaseUrl) {
  throw new Error('TURSO_DATABASE_URL is not set in your .env')
}

export default {
  schema: './src/models/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: databaseUrl,
    authToken: authToken,
  }

  // for drizzle-kit v0.29+, you can do either:


  // — or, if you’re on a newer version that uses dbCredentials:
  // dbCredentials: { url: databaseUrl, authToken },
} satisfies Config
