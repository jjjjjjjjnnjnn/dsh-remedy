#!/usr/bin/env node
/**
 * R53 · the runtime version comes from the runtime's own file, never from prose.
 *
 * `record_live_mount.mjs` carried `dsh_version: '0.2.2-rc.1'` as a literal for
 * eleven releases. Every artifact it produced from 0.2.2-rc.3 onward therefore
 * named a runtime that was not the one that ran — the same family of drift R52
 * had to sweep out of the handoff. The installed runtime writes its version in
 * `resources/runtime/primary-runtime/runtime.json`, and the copy under
 * `~/.dsh/dsh-runtimes` lags it until the app is relaunched, so a recorder must
 * say which file it read.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The desktop version a `runtime.json` declares.
 *
 * @param parsed - the parsed file, or anything else.
 * @returns the version string, or `null` when the file carries none. Never a guess.
 */
export function desktopVersionOf(parsed) {
  if (parsed === null || typeof parsed !== 'object') return null
  const value = parsed.desktopVersion
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Read the installed runtime's version from the first candidate that answers.
 *
 * @param candidates - absolute paths to `runtime.json`, in priority order.
 * @returns `{ version, source, sha256 }`, or nulls when none of them carries a version.
 */
export function readRuntimeVersion(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate === '' || !existsSync(candidate)) continue
    let parsed
    try {
      parsed = JSON.parse(readFileSync(candidate, 'utf8'))
    } catch {
      continue
    }
    const version = desktopVersionOf(parsed)
    if (version === null) continue
    return {
      version,
      source: candidate,
      sha256: createHash('sha256').update(readFileSync(candidate)).digest('hex'),
    }
  }
  return { version: null, source: null, sha256: null }
}

/**
 * The default candidates on this platform: the installed app first, the
 * per-profile copy second (that copy lags until the app is relaunched).
 *
 * @param env - environment to read (`process.env` in production).
 * @param home - the DSH home whose `dsh-runtimes` copy is the fallback.
 * @returns absolute candidate paths.
 */
export function runtimeCandidates(env = process.env, home) {
  const out = []
  if (typeof env.LOCALAPPDATA === 'string' && env.LOCALAPPDATA !== '') {
    out.push(join(env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'primary-runtime', 'runtime.json'))
  }
  if (typeof home === 'string' && home !== '') out.push(join(home, 'dsh-runtimes', 'dsh-primary-runtime', 'runtime.json'))
  return out
}
