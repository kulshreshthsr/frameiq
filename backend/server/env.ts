import { existsSync, readFileSync } from 'node:fs'

/**
 * Minimal `.env` loader (Node 20 has no built-in optional env-file support).
 * Reads KEY=VALUE lines, ignores comments and blanks, strips surrounding
 * quotes, and never overrides a variable that is already set — so real
 * environment variables always win over the file.
 *
 * `backend/` is a workspace: every script that calls this (`server/index.ts`,
 * `scripts/*`) runs with its cwd set to `backend/` (`npm run … --workspace=backend`),
 * but `.env` conventionally lives at the repo root next to `.env.example`. So
 * this checks `./.env` first (lets a `backend/.env` override, if one is ever
 * added) and falls back to the monorepo root's `../.env`.
 */
export function loadEnvFile(path?: string, target: Record<string, string | undefined> = process.env): void {
  const candidate = path ?? (existsSync('.env') ? '.env' : '../.env')
  if (!existsSync(candidate)) return
  for (const rawLine of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (target[key] === undefined) target[key] = value
  }
}
