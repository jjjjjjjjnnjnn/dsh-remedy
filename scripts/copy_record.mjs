#!/usr/bin/env node
/**
 * Record one outward file from prose written in this session.
 *
 * The copy channel's transport (a subprocess call to a model CLI) is retired:
 * the session that does the work also writes the outward text. What the channel
 * was protecting — every number traceable to the fact pack, no stale artifact —
 * is enforced by `gate_copy` and `lib/copy-policy.mjs` instead of by the identity
 * of the author.
 *
 * Usage:
 *
 *   node scripts/copy_record.mjs --name readme --out README.md --file .tmp/readme.draft
 *   node scripts/copy_record.mjs --name templates --split --file .tmp/templates.draft
 *
 * `--file` is the draft (stdin if omitted). The draft is validated before it is
 * written: a number the fact pack does not carry, or a surviving placeholder,
 * is refused here rather than discovered by the gate later.
 *
 * `--split` expects `<<<FILE: path>>>` markers, one per target.
 *
 * `--freeze` turns an existing entry into a frozen release record: it keeps the
 * recorded bytes and hashes and only adds `frozen_at`, because a page that has
 * just been published must stop tracking the fact pack (rewriting a public page
 * every time the pack moves is the failure `frozen_at` exists to prevent). The
 * freeze is a recorded operation rather than a hand edit to the manifest.
 *
 * Every recorded entry carries `writer`, `facts_sha256` and `output_sha256`, and
 * the draft is kept under `docs/copy/raw/` so a later reader can see both the
 * input and the validated output.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { abs, isoStamp } from './lib/kit.mjs'
import { hasPlaceholder, unknownNumbers, WRITERS } from './lib/copy-policy.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}
const has = (name) => argv.includes(`--${name}`)

const name = flag('name', null)
const outPath = flag('out', null)
const draftPath = flag('file', null)
const split = has('split')
const force = has('force')
const freeze = has('freeze')

// Freezing is its own operation: it must not require a draft (nothing is written)
// and it must refuse to freeze anything it has no recorded bytes for.
if (freeze) {
  if (name === null) {
    process.stderr.write('copy_record: --freeze needs --name\n')
    process.exit(2)
  }
  const manifestPath = 'docs/copy/manifest.json'
  if (!existsSync(abs(manifestPath))) {
    process.stderr.write('copy_record: no docs/copy/manifest.json to freeze an entry in\n')
    process.exit(3)
  }
  const manifest = JSON.parse(readFileSync(abs(manifestPath), 'utf8'))
  const entries = Array.isArray(manifest.entries) ? manifest.entries : []
  const index = entries.findIndex((entry) => entry.name === name)
  if (index === -1) {
    process.stderr.write(`copy_record: no entry named ${name} to freeze\n`)
    process.exit(3)
  }
  const entry = entries[index]
  if (typeof entry.frozen_at === 'string') {
    process.stdout.write(`ALREADY FROZEN ${name} at ${entry.frozen_at}\n`)
    process.exit(0)
  }
  if (!existsSync(abs(entry.target))) {
    process.stderr.write(`copy_record: entry ${name} points at a missing file ${entry.target}; nothing to freeze\n`)
    process.exit(3)
  }
  const text = readFileSync(abs(entry.target), 'utf8')
  const actual = createHash('sha256').update(text).digest('hex')
  // The recorded bytes must be the bytes on disk: freezing a page whose bytes have
  // drifted would hide a drift behind the "already public" exemption instead of
  // reporting it.
  if (actual !== entry.output_sha256) {
    process.stderr.write(
      `copy_record: ${name} is ${actual.slice(0, 12)}… but the manifest records ${String(entry.output_sha256).slice(0, 12)}…; ` +
        're-register it before freezing, so the frozen record is the published page\n',
    )
    process.exit(1)
  }
  entry.frozen_at = isoStamp(new Date().toISOString())
  entry.channel = entry.channel ?? 'retired-external-model'
  manifest.updated_at = isoStamp(new Date().toISOString())
  writeFileSync(abs(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  process.stdout.write(`FROZE ${name} at ${entry.frozen_at}\n`)
  process.exit(0)
}

if (name === null) {
  process.stderr.write('copy_record: --name is required\n')
  process.exit(2)
}
if (draftPath === null) {
  process.stderr.write('copy_record: --file is required (the draft must exist as bytes)\n')
  process.exit(2)
}
if (!existsSync(abs(draftPath))) {
  process.stderr.write(`copy_record: no draft at ${draftPath}\n`)
  process.exit(3)
}

const factsPath = 'docs/copy/facts/public-repo-facts.md'
const facts = readFileSync(abs(factsPath), 'utf8')
const factsHash = createHash('sha256').update(facts).digest('hex')
const draft = readFileSync(abs(draftPath), 'utf8')
if (draft.trim() === '') {
  process.stderr.write('copy_record: the draft is empty\n')
  process.exit(1)
}
const started = new Date().toISOString()

const marker = /^<<<FILE:\s*(.+?)\s*>>>$/gm
const parts = []
if (split) {
  const matches = [...draft.matchAll(marker)]
  if (matches.length === 0) {
    process.stderr.write('copy_record: --split but no <<<FILE: path>>> markers\n')
    process.exit(1)
  }
  for (const [index, match] of matches.entries()) {
    const start = match.index + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index : draft.length
    parts.push({ target: match[1], content: draft.slice(start, end).trim() })
  }
} else {
  if (outPath === null) {
    process.stderr.write('copy_record: --out is required without --split\n')
    process.exit(2)
  }
  parts.push({ target: outPath, content: draft.trim() })
}

// Validate every part before writing anything, so a refusal leaves no half-state.
for (const part of parts) {
  if (part.target.endsWith('.md') && hasPlaceholder(part.content)) {
    process.stderr.write(`copy_record: ${part.target} still carries a placeholder token\n`)
    process.exit(1)
  }
  const extra = unknownNumbers(part.content, facts)
  if (extra.length > 0) {
    process.stderr.write(`copy_record: ${part.target} has numbers the fact pack does not carry: ${extra.join(', ')}\n`)
    process.exit(1)
  }
  if (existsSync(abs(part.target)) && !force) {
    process.stderr.write(`copy_record: refusing to overwrite ${part.target} (pass --force)\n`)
    process.exit(2)
  }
}

const rawDir = 'docs/copy/raw'
mkdirSync(abs(rawDir), { recursive: true })
writeFileSync(abs(join(rawDir, `${name}.txt`)), draft, 'utf8')

const manifestPath = 'docs/copy/manifest.json'
const manifest = existsSync(abs(manifestPath))
  ? JSON.parse(readFileSync(abs(manifestPath), 'utf8'))
  : { schema_version: 1, model_default: WRITERS.inSession, entries: [] }
manifest.model_default = WRITERS.inSession

for (const part of parts) {
  const target = part.target.replaceAll('\\', '/')
  const content = `${part.content}\n`
  mkdirSync(abs(join(target, '..')), { recursive: true })
  writeFileSync(abs(target), content, 'utf8')
  const entry = {
    name: parts.length === 1 ? name : `${name}:${target}`,
    target,
    model: WRITERS.inSession,
    generated_at: started,
    facts_sha256: factsHash,
    draft_sha256: createHash('sha256').update(draft).digest('hex'),
    output_sha256: createHash('sha256').update(content).digest('hex'),
  }
  manifest.entries = manifest.entries.filter((item) => item.name !== entry.name)
  manifest.entries.push(entry)
  process.stdout.write(`WROTE ${target} (${content.length} bytes)\n`)
}

manifest.updated_at = isoStamp(new Date().toISOString())
writeFileSync(abs(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(`RECORDED ${manifestPath} · ${parts.length} file(s) · writer ${WRITERS.inSession}\n`)
