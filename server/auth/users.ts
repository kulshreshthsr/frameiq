import type { AdminUser } from '../../shared/admin.ts'
import { query, queryOne, run, type Executor } from '../db/client.ts'
import { hashPassword } from './password.ts'

/** The row as stored — includes the password hash, which `AdminUser` never does. */
export interface UserRow extends AdminUser {
  passwordHash: string
}

type Row = Record<string, unknown>

function rowToUser(row: Row): UserRow {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: String(row.role),
    active: Number(row.active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  }
}

export async function countUsers(ex: Executor): Promise<number> {
  const row = await queryOne(ex, 'SELECT COUNT(*) AS n FROM users')
  return Number(row?.n ?? 0)
}

export async function findUserByEmail(ex: Executor, email: string): Promise<UserRow | null> {
  const row = await queryOne(ex, 'SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()])
  return row ? rowToUser(row as unknown as Row) : null
}

export async function findUserById(ex: Executor, id: string): Promise<UserRow | null> {
  const row = await queryOne(ex, 'SELECT * FROM users WHERE id = ?', [id])
  return row ? rowToUser(row as unknown as Row) : null
}

export async function listUsers(ex: Executor): Promise<UserRow[]> {
  return (await query(ex, 'SELECT * FROM users ORDER BY created_at')).map((r) => rowToUser(r as unknown as Row))
}

export interface CreateUserInput {
  id: string
  name: string
  email: string
  password: string
  role: string
  now: Date
}

/** Creates an account, or replaces the password of one that already exists
 * with this email (how `npm run admin:create` doubles as a password reset). */
export async function upsertUser(ex: Executor, input: CreateUserInput): Promise<UserRow> {
  const email = input.email.trim().toLowerCase()
  const passwordHash = await hashPassword(input.password)
  const now = input.now.toISOString()
  const existing = await findUserByEmail(ex, email)
  if (existing) {
    await run(ex, 'UPDATE users SET name = ?, password_hash = ?, role = ?, active = 1, updated_at = ? WHERE id = ?', [input.name, passwordHash, input.role, now, existing.id])
    return (await findUserById(ex, existing.id))!
  }
  await run(ex, 'INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)', [
    input.id,
    input.name,
    email,
    passwordHash,
    input.role,
    now,
    now,
  ])
  return (await findUserByEmail(ex, email))!
}

export async function touchLastLogin(ex: Executor, userId: string, now: Date): Promise<void> {
  await run(ex, 'UPDATE users SET last_login_at = ? WHERE id = ?', [now.toISOString(), userId])
}

export function toAdminUser(row: UserRow): AdminUser {
  const { passwordHash: _hash, ...user } = row
  return user
}
