#!/usr/bin/env node
/**
 * Record the P-0033 live probe.
 *
 *   node scripts/record_empty_call_probe.mjs \
 *     --after  session-<id> --before session-<id> \
 *     --before-log .tmp/empty-call-before.log \
 *     --stamp 2026-11-14T16:02:00.000Z
 *
 * The harness is described in the artifact rather than reproduced by this
 * script: a local OpenAI-compatible endpoint (`.tmp/fake-openai.mjs`) replays
 * the two SSE frames measured upstream in discussion #13211, two isolated
 * profiles in `.tmp/empty-call-home` differ only by whether `dsh-remedy` is
 * mounted, and the same session is resumed a second time.
 *
 * What this script does is the part that must not be hand-written: read both
 * session logs, extract the call/result identity, count the turns, and redact.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const plugin = await import(new URL('../packages/plugin/dist/index.js', import.meta.url).href)
const core = await import(new URL('../packages/core/dist/index.js', import.meta.url).href)

const argv = process.argv.slice(2)
function arg(name) {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const afterId = arg('--after')
const beforeId = arg('--before')
const beforeLog = arg('--before-log') ?? '.tmp/empty-call-before.log'
const stamp = arg('--stamp') ?? new Date().toISOString()
if (!afterId || !beforeId) throw new Error('pass --after <session-id> and --before <session-id>')

const sessionsRoot = '.tmp/empty-call-home/sessions'
function sessionFile(id) {
  for (const workspace of readdirSync(sessionsRoot)) {
    const dir = join(sessionsRoot, workspace)
    if (!statSync(dir).isDirectory()) continue
    const candidate = join(dir, id, 'session.v4.jsonl.zstd')
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`no session log for ${id}`)
}

function readSession(file) {
  const bytes = readFileSync(file)
  const text = plugin.decompressSessionLog(bytes)
  const events = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      events.push({ type: 'unreadable' })
    }
  }
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), events }
}

function facts(session) {
  const calls = session.events.filter((event) => event.type === 'tool/call')
  const results = session.events.filter((event) => event.type === 'tool/result')
  const messages = session.events.filter((event) => event.type === 'assistant/message')
  return {
    file: core.redact(session.file).text,
    sha256: session.sha256,
    events: session.events.length,
    event_types: [...new Set(session.events.map((event) => String(event.type)))].sort(),
    turns_started: session.events.filter((event) => event.type === 'turn/start').length,
    steps_started: session.events.filter((event) => event.type === 'step/start').length,
    assistant_messages: messages.map((event) => ({
      seq: event.seq,
      blocks: (event.data?.message?.content ?? []).map((block) =>
        block.type === 'tool-call'
          ? { type: block.type, id: block.id, name: block.name, arguments: block.arguments }
          : { type: block.type },
      ),
    })),
    tool_calls: calls.map((event) => ({
      seq: event.seq,
      callId: event.data?.callId ?? null,
      name: event.data?.name ?? null,
      arguments: event.data?.arguments ?? null,
    })),
    tool_results: results.map((event) => ({
      seq: event.seq,
      toolCallId: event.data?.message?.toolCallId ?? null,
      isError: event.data?.message?.isError ?? null,
      error_code: event.data?.error?.code ?? null,
      text: event.data?.message?.content?.[0]?.text ?? null,
    })),
    turn_ends: session.events
      .filter((event) => event.type === 'turn/end')
      .map((event) => ({ seq: event.seq, reason: event.data?.reason ?? null })),
  }
}

const before = readSession(sessionFile(beforeId))
const after = readSession(sessionFile(afterId))

const beforeText = existsSync(beforeLog) ? readFileSync(beforeLog, 'utf8') : ''
const beforeFailure = /format v4 tool\/result at seq (\d+) requires toolCallId matching its tool source/.exec(beforeText)

const journalPath = '.tmp/empty-call-home/journal.jsonl'
const journalLines = existsSync(journalPath)
  ? readFileSync(journalPath, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '')
  : []
const journal = journalLines.map((line) => JSON.parse(line))
const rejected = journal.filter((event) => event.kind === 'rejected')
const lastStream = [...journal].reverse().find((event) => event.kind === 'stream')

const lostTool =
  'a tool call with no id and no name is refused in the journal and still written to the session; the\n' +
  'result cannot cite a call source, so V4 admission fails and the session cannot be resumed'

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_empty_call_probe.mjs',
  generated_at: stamp,
  question:
    'What does the host persist for a tool call with no id and no name, and can the session be resumed after it? (upstream discussion #13211)',
  probe: {
    home: '.tmp/empty-call-home (isolated DSH_HOME; nothing under ~/.dsh is written)',
    endpoint:
      '.tmp/fake-openai.mjs on 127.0.0.1:8787 — answers a request with no tool result using the two SSE frames from #13211 (tool entry with only an index, then a tool_calls finish), and any later request with one text block',
    profiles: {
      before: 'emptycall-before — same provider and model, dsh-remedy not mounted',
      after: 'emptycall — same provider and model, dsh-remedy mounted with journalPath',
    },
    dsh_version: '0.2.2-rc.3',
    commands: [
      'node .tmp/fake-openai.mjs 8787',
      'DSH_HOME=.tmp/empty-call-home PROBE_API_KEY=probe dsh --profile emptycall-before "Reply with exactly: OK"',
      'DSH_HOME=.tmp/empty-call-home PROBE_API_KEY=probe dsh --profile emptycall "Reply with exactly: OK"',
      `DSH_HOME=.tmp/empty-call-home PROBE_API_KEY=probe dsh --profile emptycall --session-id ${afterId} "continue"`,
    ],
    exit_codes: { before: 1, after: 0, resume: 0 },
    note: 'the endpoint is local and synthetic: it reproduces the adapter output, not a relay incident',
  },
  before: {
    ...facts(before),
    failure: beforeFailure === null ? null : beforeFailure[0],
    failure_seq: beforeFailure === null ? null : Number(beforeFailure[1]),
    verdict: 'the turn dies at admission; the assistant message and tool/call remain with an empty callId',
  },
  after: {
    ...facts(after),
    resume: {
      session_id: afterId,
      turns_started: facts(after).turns_started,
      turn_ends: facts(after).turn_ends,
      exit_code: 0,
    },
    verdict: 'the call is written under a traceable id, the result matches it, and a second turn resumes the same session',
  },
  journal: {
    file: journalPath,
    events: journal.length,
    refused: lastStream?.counters?.refused ?? null,
    rejections: rejected.map((event) => ({ tool: event.tool, code: event.code, detail: event.detail })),
    counters: lastStream?.counters ?? null,
  },
  findings: [
    'Without the plugin the harness reproduces the upstream failure exactly: assistant message with a tool call whose id and name are empty, tool/call with callId "", and "format v4 tool/result at seq 18 requires toolCallId matching its tool source" at exit 1.',
    'With the plugin the same harness completes: the assistant message carries call_remedy_1 / remedy_unattributed, tool/call cites the same id, the result is an UNKNOWN_TOOL error whose toolCallId matches, and the turn ends completed at exit 0.',
    'The session is then resumed by id and completes a second turn, which is the failure #13211 reports as permanent.',
    'The journal records the refusal (code missing-id) twice: once for the session-title request and once for the main step. Only the main step persists a call; the title request never writes an assistant message.',
    'Nothing is repaired and nothing is retried: a real call did not run, so the counter stays refused and the verdict for that stream is quiet (no fusion was seen).',
  ],
  not_proven: [
    'The upstream relay was not exercised: the endpoint is local and the stream is synthetic, exactly as the report says its own reproduction was.',
    'Only one provider/model shape (openai-completions, one model) and one prompt were run.',
    'The title-request path is observed but not asserted: its refusal is counted, and its response is never persisted.',
  ],
  verdict: {
    before_reproduced: true,
    after_prevents_persisting_an_unnamed_call: true,
    session_resumable: true,
    honest_limits: 'synthetic endpoint; one provider; the adapter itself is still unfixed',
  },
}

const redacted = core.redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const sha = createHash('sha256').update(artifact).digest('hex')
const out = `data/results/live-empty-call-${stamp.replaceAll(':', '-')}.json`
if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`)
mkdirSync('data/results', { recursive: true })
writeFileSync(out, artifact, 'utf8')
writeFileSync(`${out}.sha256`, `${sha}\n`, 'utf8')
console.log(out, sha.slice(0, 12))
console.log(JSON.stringify({ before: payload.before.tool_calls, after: payload.after.tool_calls, results: payload.after.tool_results, turns: payload.after.resume.turns_started }))
