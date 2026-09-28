/**
 * Creates the owner admin account, or resets its password if the email
 * already exists. This — or the `OWNER_BOOTSTRAP_*` environment variables in
 * `server/bootstrap.ts` — is the ONLY way an owner account is created; there
 * is no public sign-up endpoint.
 *
 *   npm run admin:create -- --email you@example.com --password "…" [--name "Jane"]
 *
 * The password is never printed or logged; only its (salted, slow-hashed)
 * form is stored. Run this again with the same email to change the password.
 */
import { OWNER_ROLE } from '../../shared/admin.ts'
import { MIN_PASSWORD_LENGTH } from '../server/auth/password.ts'
import { upsertUser } from '../server/auth/users.ts'
import { loadConfig } from '../server/config.ts'
import { migrate, openDb } from '../server/db/client.ts'
import { loadEnvFile } from '../server/env.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  loadEnvFile()
  const email = (flag('email') ?? '').trim().toLowerCase()
  const password = flag('password') ?? ''
  const name = flag('name') ?? 'Owner'

  if (!email || !email.includes('@')) {
    console.error('Usage: npm run admin:create -- --email you@example.com --password "…" [--name "Jane"]')
    process.exit(1)
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`--password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
    process.exit(1)
  }

  const config = loadConfig()
  const db = await openDb(config.databaseUrl)
  await migrate(db)

  const user = await upsertUser(db, { id: `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, name, email, password, role: OWNER_ROLE, now: new Date() })
  console.log(`Owner account ready: ${user.email} (${user.name}). Database: ${config.databaseUrl}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
