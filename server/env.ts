import { existsSync, readFileSync } from 'node:fs'

/**
 * Minimal `.env` loader (Node 20 has no built-in optional env-file support).
 * Reads KEY=VALUE lines, ignores comments and blanks, strips surrounding
 * quotes, and never overrides a variable that is already set — so real
 * environment variables always win over the file.
 */
export function loadEnvFile(path = '.env', target: Record<string, string | undefined> = process.env): void {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
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
