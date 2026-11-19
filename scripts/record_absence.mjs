#!/usr/bin/env node
/**
 * R72 · why the two completed-turn findings are absent from this corpus.
 *
 *   node scripts/record_absence.mjs --stamp <ISO>
 *
 * P-0047 (`completed_without_answer`) and P-0052 (`completed_on_tool_call`)
 * were each reproduced with a probe, never with a real session on this host.
 * This recorder refuses to write unless the real-corpus census reports both
 * as zero, and carries the host source lines that explain why: the adapter's
 * stop guard counts blocks, and the chat renderer accepts only a final step
 * with no tool-call block. Both quotations come from the patch documents,
 * which cite the measured file and line in the host source.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_absence: --stamp must be ISO-8601\n')
  process.exit(2)
}

const censusPath = 'data/results/live-census-2026-11-18T22-00-00.000Z.json'
const docs = [
  'docs/patches/P-0047-completed-without-answer.md',
  'docs/patches/P-0052-completed-on-tool-call.md',
]
if (!existsSync(abs(censusPath)) || docs.some((path) => !existsSync(abs(path)))) {
  process.stderr.write('record_absence: the census or a patch document is missing\n')
  process.exit(3)
}
const census = JSON.parse(readFileSync(abs(censusPath), 'utf8'))
const p47 = readFileSync(abs(docs[0]), 'utf8')
const p52 = readFileSync(abs(docs[1]), 'utf8')

const cwa = Number(census.scan?.completed_without_answer ?? -1)
const cotc = Number(census.scan?.completed_on_tool_call ?? -1)
const problems = []
if (cwa !== 0) problems.push(`completed_without_answer is ${cwa}, expected 0`)
if (cotc !== 0) problems.push(`completed_on_tool_call is ${cotc}, expected 0`)
if (!/mapStopReason|content\.length/.test(p47)) problems.push('P-0047 no longer cites the adapter stop guard')
if (!/dsh-agent-loop\/src\/agent\.ts:592-603/.test(p52)) problems.push('P-0052 no longer cites the concludeTurn source')
if (!/turn-process\.ts:160-161/.test(p52)) problems.push('P-0052 no longer cites the UI final-step rule')
if (problems.length > 0) {
  process.stderr.write(`record_absence: ${problems.join('; ')}\n`)
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_absence.mjs',
  generated_at: stamp,
  question: 'Why do the two completed-turn findings have no real case in this corpus?',
  census: {
    artifact: censusPath,
    completed_without_answer: cwa,
    completed_on_tool_call: cotc,
  },
  why_absent: {
    P0047: {
      reader: '`scan` asks whether a completed turn answered anyone by looking at the last step for text or a tool call (core/answer.ts, P-0044).',
      host_half:
        'The adapter decides to end a turn on block count: `mapStopReason` treats `message.content.length === 0` as empty, so a turn whose only assistant content is a reasoning block ends as a normal `completed` stop. P-0047 names that consequence; it does not fix the adapter.',
      source: 'quoted in docs/patches/P-0047-completed-without-answer.md (host file and line cited there)',
    },
    P0052: {
      reader: '`scan` also counts a completed turn whose last step still carries a tool-call block; `explain` prints TOOLCALL (P-0052).',
      host_half:
        'The loop only ends a step with tool calls when a tool result carries `concludesTurn` (dsh-agent-loop/src/agent.ts:592-603), and the chat UI renders only a final step with no tool-call block as an answer (dsh-client-ui-chat .../turn-process.ts:160-161). The two rules can disagree, which is the upstream #12741 shape.',
      source: 'quoted in docs/patches/P-0052-completed-on-tool-call.md (host file and line cited there)',
    },
  },
  not_proven: [
    'no user on this machine hit either shape in the measured corpus; both rules are exercised by probes, not by a real session',
    'the host source is quoted from the patch documents that read it at the cited line, not re-downloaded by this recorder',
    'a different host, provider route or UI build may produce the shape; absence here is not absence everywhere',
  ],
  sources: {
    census: sha256(readFileSync(abs(censusPath))),
    'P-0047 doc': sha256(readFileSync(abs(docs[0]))),
    'P-0052 doc': sha256(readFileSync(abs(docs[1]))),
  },
}
const artifact = `${JSON.stringify(payload, null, 2)}\n`
const out = flag('out') ?? `data/results/live-absence-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_absence: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${createHash('sha256').update(artifact).digest('hex')}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
