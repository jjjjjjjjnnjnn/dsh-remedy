/**
 * Read one live-turn run directory (`.tmp/r70-runs/<arm>/<scenario>`) into the
 * facts a claim is allowed to rest on.
 *
 * The runner writes `result.json` plus copies of the session, the remedy journal,
 * the neighbour log and the provider's request log. Nothing here interprets: the
 * recorders own the claims, this module owns the reading, so both artifacts agree
 * on what "the same outcome" means.
 *
 * Redaction: everything returned here is read from files the run produced; the
 * recorders pass the assembled artifact through `redactValue()` before writing.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decompressSessionLog } from '../../packages/plugin/dist/session-log.js'

/** @param {string} file */
function readLines(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
}

/** @param {string} file */
function readSession(file) {
  return decompressSessionLog(readFileSync(file))
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
}

/**
 * @param {string} dir
 * @returns {{
 *   dir: string, profile: string, prompt: string, exitCode: number|null,
 *   stderr: string[], turnEnd: unknown, blocks: string[][], calls: {name: string, id: string}[],
 *   results: {name: string, code: string, isError: boolean}[], journal: unknown[],
 *   counters: Record<string, number>|null, neighbour: unknown[], requests: unknown[],
 *   sessions: {file: string, sha256: string}[], mount: string|null
 * }}
 */
export function readRun(dir) {
  const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'))
  const events = []
  for (const session of result.sessions ?? []) events.push(...readSession(session.file))

  const turnEnd = events.find((event) => event.type === 'turn/end')?.data?.reason ?? null
  const blocks = events
    .filter((event) => event.type === 'assistant/message')
    .map((event) =>
      (event.data?.message?.content ?? []).map((block) =>
        block?.type === 'tool-call' ? `tool-call:${String(block.name ?? '')}` : String(block?.type ?? 'unknown'),
      ),
    )
  const calls = events.filter((event) => event.type === 'tool/call').map((event) => ({
    name: String(event.data?.name ?? ''),
    id: String(event.data?.callId ?? ''),
    arguments: String(event.data?.arguments ?? ''),
  }))
  const results = events.filter((event) => event.type === 'tool/result').map((event) => ({
    name: String(event.data?.message?.content?.find?.((block) => block?.type === 'text')?.text ?? ''),
    id: String(event.data?.message?.toolCallId ?? ''),
    code: String(event.data?.error?.code ?? 'ok'),
    isError: event.data?.message?.isError === true,
  }))

  const journal = readLines(result.journal?.file ?? '')
  const counters =
    [...journal].reverse().find((event) => event.counters !== undefined)?.counters ?? null
  const neighbour = readLines(result.neighbour?.file ?? '')
  const mount = neighbour.find((event) => event.event === 'mounted')?.scenario ?? null

  return {
    dir,
    profile: String(result.profile ?? ''),
    prompt: String(result.prompt ?? ''),
    version: result.version ?? null,
    exitCode: result.exit_code ?? null,
    stderr: (result.stderr ?? []).filter((line) => line.trim() !== ''),
    turnEnd,
    blocks,
    calls,
    results,
    journal,
    counters,
    neighbour,
    requests: result.requests ?? [],
    sessions: result.sessions ?? [],
    sessionSha: result.sessions?.[0]?.sha256 ?? null,
    journalSha: result.journal?.sha256 ?? null,
    neighbourSha: result.neighbour?.sha256 ?? null,
    mount,
  }
}

/** Did remedy's wrapper see a main-step stream? The title stream has no tools. */
export function sawMainStream(run) {
  return run.neighbour.some(
    (event) => event.event === 'stream' && Array.isArray(event.tools) && event.tools.length > 0,
  )
}

/**
 * The outcome a fail-open stream must reproduce: same exit status, same turn
 * ending, same dispatch. The failure message is included because two failures
 * with different authors can share a kind (and, on this host, even a message).
 * @param {ReturnType<typeof readRun>} run
 */
export function outcomeOf(run) {
  const failure = run.turnEnd?.error ?? null
  return {
    exit: run.exitCode,
    end: String(run.turnEnd?.kind ?? 'none'),
    code: String(failure?.code ?? ''),
    message: String(failure?.message ?? '').slice(0, 160),
    calls: run.calls.map((call) => call.name),
    results: run.results.map((result) => `${result.id}:${result.code}:${result.isError}`),
  }
}

/**
 * @param {ReturnType<typeof readRun>} left
 * @param {ReturnType<typeof readRun>} right
 */
export function sameOutcome(left, right) {
  const a = outcomeOf(left)
  const b = outcomeOf(right)
  return JSON.stringify(a) === JSON.stringify(b)
}
