#!/usr/bin/env node
/**
 * Record what the harness UI draws for a rejected `agent/pre-step` turn, next to
 * a control turn that was allowed to run.
 *
 * The session logs are the measurement; the screenshots are the rendering. Both
 * are hashed into one artifact so the claim "the window says completed" can be
 * checked without trusting this script's prose.
 *
 * Usage:
 *   node scripts/record_prestep_ui.mjs --stamp 2026-11-13T12:20:00.000Z \
 *     --reject-session <session.v4.jsonl.zstd> --control-session <...> \
 *     --passthrough-session <...> --reject-shot <png> --control-shot <png>
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'

const plugin = await import(new URL('../packages/plugin/dist/index.js', import.meta.url).href)
const core = await import(new URL('../packages/core/dist/index.js', import.meta.url).href)

const flag = (name) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const stamp = flag('stamp')
if (stamp === undefined || !/^\d{4}-\d{2}-\d{2}T/.test(stamp)) {
  throw new Error('--stamp <ISO> is required; the stamp is the artifact identity')
}

const paths = {
  reject: flag('reject-session'),
  control: flag('control-session'),
  passthrough: flag('passthrough-session'),
  rejectShot: flag('reject-shot'),
  controlShot: flag('control-shot'),
}
for (const [name, path] of Object.entries(paths)) {
  if (path === undefined || !existsSync(path)) throw new Error(`--${name} is missing or does not exist`)
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function readSession(file) {
  const bytes = readFileSync(file)
  const text = plugin.decompressSessionLog(bytes)
  const events = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    events.push(JSON.parse(line))
  }
  return { file, bytes, events, sha: sha256(bytes) }
}

function summarize(run) {
  const of = (type) => run.events.filter((event) => event.type === type)
  const splices = of('agent/inbox/spliced')
  // A claim is a splice that removes the queued input and inserts nothing. In the
  // control run the same claim is followed by a committed user/message; in the
  // reject run nothing follows, which is the difference this artifact measures.
  const claims = splices.filter(
    (event) => (event.data?.removedCount ?? 0) > 0 && (event.data?.inserted ?? []).length === 0,
  )
  const assistant = run.events
    .filter((event) => event.type === 'assistant/message')
    .flatMap((event) => event.data?.message?.content ?? [])
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.text))
  return {
    session_file: core.redact(run.file).text,
    session_sha256: run.sha,
    events: run.events.length,
    event_types: [...new Set(run.events.map((event) => event.type))].sort(),
    turn_end_reason: of('turn/end')[0]?.data?.reason ?? null,
    step_starts: of('step/start').length,
    user_messages: of('user/message').length,
    assistant_messages: of('assistant/message').length,
    assistant_text: assistant,
    claims_without_insert: claims.length,
  }
}

const reject = readSession(paths.reject)
const control = readSession(paths.control)
const passthrough = readSession(paths.passthrough)

const rejectSummary = summarize(reject)
const controlSummary = summarize(control)
const passthroughSummary = summarize(passthrough)

// The measurement is only worth recording if it has the shape it claims.
if (rejectSummary.turn_end_reason?.kind !== 'blocked') throw new Error('reject run did not end blocked')
if (rejectSummary.step_starts !== 0) throw new Error('reject run opened a step')
if (rejectSummary.user_messages !== 0) throw new Error('reject run committed a user message')
if (rejectSummary.claims_without_insert !== 1) throw new Error('reject run did not claim exactly once')
if (controlSummary.turn_end_reason?.kind !== 'completed') throw new Error('control run did not complete')
if (controlSummary.step_starts < 1) throw new Error('control run opened no step')
if (controlSummary.assistant_text.join('').trim() !== 'OK') throw new Error('control run did not answer OK')
if (passthroughSummary.turn_end_reason?.kind !== 'error') throw new Error('passthrough run did not end in error')
if (!String(passthroughSummary.turn_end_reason?.error?.message ?? '').includes('next is not a function')) {
  throw new Error('passthrough run did not fail with next is not a function')
}

mkdirSync('data/results', { recursive: true })
const slug = stamp.replaceAll(':', '-')
const rejectShot = `data/results/prestep-ui-${slug}-reject.png`
const controlShot = `data/results/prestep-ui-${slug}-control.png`
copyFileSync(paths.rejectShot, rejectShot)
copyFileSync(paths.controlShot, controlShot)

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_prestep_ui.mjs',
  generated_at: stamp,
  question:
    'When an agent/pre-step listener returns {kind:"reject"}, what does the harness UI draw for that turn? BS-17 asked this after R23 measured only the headless profile.',
  probe: {
    home: '.tmp/prestep-web-home (DSH_HOME, isolated: nothing under ~/.dsh is written)',
    profiles: { reject: 'probe-web-reject', control: 'probe-web-ok' },
    bundle: '.tmp/prestep-probe (one inserted row, id probe-pre-step, name prestep-probe)',
    renderer:
      'the @deepseek-ai/dsh-web-app bundle the desktop shell loads, served by `dsh web` and driven through the Chrome DevTools Protocol in a headless Chrome',
    command: 'dsh --profile <profile> --no-open --host 127.0.0.1 --port 0',
    prompt: 'Reply with exactly: OK',
  },
  runs: {
    reject: {
      ...rejectSummary,
      screenshot: { file: rejectShot, sha256: sha256(readFileSync(rejectShot)) },
      observed_rendering:
        'one line: "已完成，用时 1秒" (completed, 1s). No user bubble, no assistant bubble, no error, no reason. The typed message is not shown because the claim was consumed.',
    },
    control: {
      ...controlSummary,
      screenshot: { file: controlShot, sha256: sha256(readFileSync(controlShot)) },
      observed_rendering:
        'the user bubble "Reply with exactly: OK", then "已完成，用时 7秒", then the assistant bubble "OK".',
    },
    passthrough: {
      ...passthroughSummary,
      observed_rendering:
        'the user bubble and the assistant "OK" are drawn, then the turn ends with "处理失败 / 本轮运行失败 next is not a function / UNKNOWN".',
    },
  },
  findings: [
    'The desktop renderer draws a rejected turn as a completed turn. "已完成，用时 1秒" is the same completion line the control run prints after a real answer; the only difference is that the rejection has no user bubble and no assistant bubble.',
    'The user input is gone from the window: the reject run has removedCount 1 with no inserted message and no user/message afterwards, and the UI has nothing to show for it. A person cannot tell whether the turn did anything or failed.',
    'A listener that wants to pass through cannot simply `return next()` on this seam in this host build: the passthrough run answered OK and then ended with turn/end reason kind "error", message "next is not a function", code UNKNOWN. The reject path never calls next(), which is why R23 did not see this.',
  ],
  not_proven: [
    'The Electron shell itself was not driven: the measurement uses the web app bundle the desktop shell loads, served by `dsh web`, so window chrome and native menus are outside it.',
    'One provider route (opendesign / deepseek-v4.1-flash-eco), one prompt, one turn per run.',
    'A rejection inside a multi-step turn, and a rejection after a tool call, were not exercised.',
  ],
  verdict: {
    safe_to_present: false,
    because:
      'the window reports the rejected turn as completed while showing nothing that happened, and the pass-through contract of the seam is not `return next()` in this build',
    usable_for: 'rewriting the message with {kind:"enter"} only, and only after that path is measured',
  },
}

const redacted = core.redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = `data/results/prestep-ui-${slug}.json`
if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`)
writeFileSync(out, artifact, 'utf8')
writeFileSync(`${out}.sha256`, `${sha256(artifact)}\n`, 'utf8')
console.log(out, sha256(artifact).slice(0, 12))
console.log(JSON.stringify({ reject: rejectSummary, control: controlSummary, passthrough: passthroughSummary }, null, 2))
