// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnvFile } from './env.ts'

/**
 * `backend/` runs as an npm workspace (cwd=backend/), while `.env`
 * conventionally lives at the monorepo root next to `.env.example` — this is
 * exactly the kind of path assumption that silently breaks in a restructure,
 * so it gets its own test rather than relying on someone noticing `dev:api`
 * stopped reading their `.env`.
 */

let dir: string
let originalCwd: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'framengine-env-'))
  originalCwd = process.cwd()
})
afterEach(() => {
  process.chdir(originalCwd)
  rmSync(dir, { recursive: true, force: true })
})

describe('loadEnvFile', () => {
  it('reads KEY=VALUE lines, skipping blanks and comments, and strips quotes', () => {
    const target: Record<string, string | undefined> = {}
    loadEnvFile(join(dir, 'x.env'), target)
    writeFileSync(join(dir, 'x.env'), '# a comment\n\nFOO=bar\nQUOTED="with quotes"\nSINGLE=\'also quoted\'\n')
    loadEnvFile(join(dir, 'x.env'), target)
    expect(target).toEqual({ FOO: 'bar', QUOTED: 'with quotes', SINGLE: 'also quoted' })
  })

  it('never overrides a variable that is already set — real env vars win', () => {
    writeFileSync(join(dir, 'x.env'), 'FOO=from-file')
    const target: Record<string, string | undefined> = { FOO: 'from-real-env' }
    loadEnvFile(join(dir, 'x.env'), target)
    expect(target.FOO).toBe('from-real-env')
  })

  it('does nothing, without throwing, when the file does not exist', () => {
    const target: Record<string, string | undefined> = {}
    expect(() => loadEnvFile(join(dir, 'nope.env'), target)).not.toThrow()
    expect(target).toEqual({})
  })

  it('with no path given, prefers a `.env` in the current directory', () => {
    process.chdir(dir)
    writeFileSync(join(dir, '.env'), 'FOO=local')
    const target: Record<string, string | undefined> = {}
    loadEnvFile(undefined, target)
    expect(target.FOO).toBe('local')
  })

  it('with no path given and no local `.env`, falls back to the parent directory — the shape backend/ actually runs in', () => {
    const workspaceDir = join(dir, 'backend')
    mkdirSync(workspaceDir)
    writeFileSync(join(dir, '.env'), 'FOO=from-monorepo-root')
    process.chdir(workspaceDir)
    const target: Record<string, string | undefined> = {}
    loadEnvFile(undefined, target)
    expect(target.FOO).toBe('from-monorepo-root')
  })
})
