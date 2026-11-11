#!/usr/bin/env node
/**
 * Repair evidence artifacts that leaked a home path before the redactor could
 * see it.
 *
 * WHY THIS EXISTS: `redact()` only matched `C:\\Users\\<name>` with one
 * backslash. A session path reaches an artifact in three other shapes — JSON
 * escaped (`C:\\\\Users\\\\<name>`), slashed (`C:/Users/<name>`) and encoded
 * into a directory name (`--C-Users-<name>-Desktop-…--`). Three artifacts were
 * written before the rule covered those shapes, so their `session.file` /
 * `journal.file` fields carried the account name into the public repository.
 *
 * WHAT IT DOES: applies the current `redact()` to every string in each
 * artifact under `data/results/`, rewrites the file only when something
 * changed, and rewrites the sibling `.sha256`. `produced_by` and `generated_at`
 * are NOT touched: this is a redaction repair, not a re-production, and
 * pretending otherwise would break the provenance the ssot gate checks.
 *
 * Refuses to run without `--write` so a dry run is the default.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const RESULTS = join(ROOT, 'data', 'results')
const write = process.argv.includes('--write')

const core = await import(pathToFileURL(join(ROOT, 'packages', 'core', 'dist', 'index.js')).href).catch(() => null)
if (core === null) {
  process.stderr.write('redact_artifacts: packages/core/dist/index.js is missing; run pnpm run build\n')
  process.exit(3)
}

const files = readdirSync(RESULTS)
  .filter((name) => name.endsWith('.json'))
  .sort()

let changed = 0
for (const name of files) {
  const path = join(RESULTS, name)
  const text = readFileSync(path, 'utf8')
  const payload = JSON.parse(text)
  const redacted = core.redactValue(payload)
  const next = `${JSON.stringify(redacted.value, null, 2)}\n`
  if (next === text) {
    process.stdout.write(`clean    ${name}\n`)
    continue
  }
  changed += 1
  process.stdout.write(
    `redacted ${name}  (${String(redacted.summary.replacements)} replacement(s): ${redacted.summary.kinds.join(', ') || 'none'})\n`,
  )
  if (!write) continue
  writeFileSync(path, next, 'utf8')
  const digest = createHash('sha256').update(next).digest('hex')
  writeFileSync(`${path}.sha256`, `${digest}  ${basename(path)}\n`, 'utf8')
}

process.stdout.write(
  write
    ? `\n${String(changed)} artifact(s) rewritten under data/results/\n`
    : `\n${String(changed)} artifact(s) would change; re-run with --write\n`,
)
process.exitCode = changed === 0 || write ? 0 : 1
