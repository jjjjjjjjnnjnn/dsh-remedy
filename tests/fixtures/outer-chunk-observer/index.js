/**
 * R82 probe plugin: an OUTERMOST `llm/stream` observer.
 *
 * It registers with `prepend: true`, which cordis implements as `unshift`
 * (@deepseek-ai/cordis/lib/index.js:336), so in the waterfall it receives the
 * stream AFTER every inner listener — including dsh-remedy — has touched it.
 * It yields every chunk unchanged and writes only a compact shape of what it
 * saw. It never injects a tool or a chunk, so it cannot change the outcome.
 *
 * It exists so `data/results/live-neighbours-contract-*` can witness what a
 * downstream consumer sees, rather than asserting it from the wrapper's code.
 * Never packed: `tests/fixtures/` is outside both packages' `files` lists.
 *
 * Config:
 *   out  JSONL file for this run's observations
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const name = 'r82-observer'

/**
 * A lossless-enough shape for sequence comparison, with no chunk text and no
 * secret. Exported so a unit test can pin the summarizer itself.
 */
export function summarizeChunk(chunk) {
  if (chunk === null) return { type: null }
  if (typeof chunk !== 'object') return { type: typeof chunk }
  const out = { type: chunk.type ?? null }
  if (Object.prototype.hasOwnProperty.call(chunk, 'index')) out.index = chunk.index ?? null
  if (Object.prototype.hasOwnProperty.call(chunk, 'id')) out.id = chunk.id ?? null
  if (Object.prototype.hasOwnProperty.call(chunk, 'name')) out.name = chunk.name ?? null
  if (Object.prototype.hasOwnProperty.call(chunk, 'blockType')) out.blockType = chunk.blockType ?? null
  if (Object.prototype.hasOwnProperty.call(chunk, 'arguments')) {
    const value = chunk.arguments
    out.arguments = typeof value === 'string' ? value : safeString(value)
    out.arguments_kind = typeof value
  }
  if (chunk.block !== null && typeof chunk.block === 'object') {
    const block = chunk.block
    out.block = { type: block.type ?? null }
    if (Object.prototype.hasOwnProperty.call(block, 'id')) out.block.id = block.id ?? null
    if (Object.prototype.hasOwnProperty.call(block, 'name')) out.block.name = block.name ?? null
    if (Object.prototype.hasOwnProperty.call(block, 'arguments')) {
      const value = block.arguments
      out.block.arguments = typeof value === 'string' ? value : safeString(value)
      out.block.arguments_kind = typeof value
    }
  }
  if (chunk.type === 'finish') {
    out.reason = chunk.reason === undefined || chunk.reason === null
      ? null
      : {
          kind: chunk.reason.kind ?? null,
          code: chunk.reason.failure?.code ?? null,
        }
  }
  return out
}

function safeString(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return '<unserializable>'
  }
}

function writer(path) {
  let ready = false
  return (event) => {
    if (path === undefined || path === '') return
    try {
      if (!ready) {
        mkdirSync(dirname(path), { recursive: true })
        ready = true
      }
      appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8')
    } catch {
      /* the observer never fails a turn over its own log */
    }
  }
}

function wrap(stream, log, tools) {
  if (stream !== null && typeof stream === 'object' && typeof stream.then === 'function') {
    return stream.then((value) => wrap(value, log, tools))
  }
  if (stream === null || typeof stream !== 'object' || !(Symbol.asyncIterator in stream)) return stream
  return drain(stream, log, tools)
}

async function* drain(stream, log, tools) {
  log({ event: 'stream', tools })
  for await (const chunk of stream) {
    log({ event: 'chunk', chunk: summarizeChunk(chunk) })
    yield chunk
  }
  log({ event: 'end' })
}

export function apply(ctx, config = {}) {
  const log = writer(config.out)
  ctx.on(
    'llm/stream',
    (options, next) => {
      const tools = Array.isArray(options?.tools) ? options.tools.map((one) => one?.name ?? '') : []
      return wrap(next(), log, tools)
    },
    { prepend: true },
  )
  log({ event: 'mounted', name })
}
