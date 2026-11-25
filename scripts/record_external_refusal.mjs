#!/usr/bin/env node
/**
 * R87 / external lead #14168: the reported shape is ONE call's arguments split
 * across three `function_call` items, not two calls concatenated. The failure
 * message this side receives carries only the first fragment (`{`), so the
 * honest outcome is a refusal, not a guess.
 *
 *   node scripts/record_external_refusal.mjs --stamp <ISO>
 *
 * The fragments below are the public report's example. This proves the engine's
 * boundary on the bytes that actually reach the seam; it does not drive the
 * reporter's provider or their OpenAI Responses route.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { repairToolCallArguments, splitTopLevelJsonObjects } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_external_refusal: --stamp must be ISO-8601\n')
  process.exit(2)
}

const source = {
  url: 'https://github.com/deepseek-ai/deepseek-harness/discussions/14168',
  reported: '2026-11-25',
  host: '0.2.2-rc.5 (macOS arm64, openai-responses, kimi-k3.1-pro)',
  shape: 'one ask_user_question call split across three function_call items; the per-item guard throws on the first fragment',
}

const first = '{'
const second = '"questions":[{"header":"Meal","id":"meal","question":"What should we eat tomorrow?"}]'
const third = '}'
const full = first + second + third

const parses = (text) => {
  try { JSON.parse(text); return true } catch { return false }
}
const decision = (text) => {
  const result = repairToolCallArguments({ id: 'call_1', name: 'ask_user_question', arguments: text }, {})
  return {
    status: result.status,
    code: result.code ?? null,
    calls: result.status === 'repaired' ? result.calls.length : 0,
    parses: parses(text),
  }
}

const cases = [
  { label: 'fragment-1 (the only bytes the failure message carries)', text: first, expect: 'rejected' },
  { label: 'fragment-1+2', text: first + second, expect: 'rejected' },
  { label: 'all three fragments joined', text: full, expect: 'unchanged' },
]

const problems = []
const measured = []
for (const item of cases) {
  const got = decision(item.text)
  measured.push({ ...item, ...got })
  if (got.status !== item.expect) problems.push(`${item.label}: ${got.status}, expected ${item.expect}`)
  if (got.status === 'rejected' && got.code !== 'not-an-object-sequence') {
    problems.push(`${item.label}: refused with ${got.code}, expected not-an-object-sequence`)
  }
}
if (measured[0]?.parses !== false) problems.push('fragment-1 unexpectedly parsed')
if (!measured[2]?.parses) problems.push('the joined text did not parse')
const split = splitTopLevelJsonObjects(first)
if (split.ok) problems.push('the splitter accepted a lone "{"')

if (problems.length > 0) {
  process.stderr.write(`record_external_refusal: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_external_refusal.mjs',
  generated_at: stamp,
  claim: 'the reported split-call shape reaches this seam as an unprovable fragment, and the shipped engine refuses it instead of guessing a boundary',
  source,
  measured,
  why_refusal_is_the_answer:
    'the three fragments belong to one call; the adapter rejects each item separately and the failure text this side sees contains only the first fragment. Any boundary between fragments would be a guess, which this project forbids (P-0037’s rule: repair only when the proof is unique).',
  not_proven: [
    'the reporter’s OpenAI Responses route was not driven from this machine; their stable replay is theirs',
    'the adapter-side per-item validation and the host default retry list are out-of-seam',
    'a future adapter that forwards the joined text would change this case, and the recorder would then need a new stamp',
  ],
}
const artifact = `${JSON.stringify(payload, null, 2)}\n`
const out = `data/results/live-external-refusal-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_external_refusal: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${createHash('sha256').update(artifact).digest('hex')}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
