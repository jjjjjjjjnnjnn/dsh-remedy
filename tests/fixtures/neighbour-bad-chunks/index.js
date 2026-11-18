/**
 * R70 probe plugin: a neighbour on `llm/stream` that hands the wrapper chunk
 * shapes the pi-ai adapter never produces (a null chunk, an object where a
 * string belongs, a fused argument text, a delta-only call…).
 *
 * It exists so `data/results/live-neighbours-*` / `live-repairs-*` can witness
 * what remedy does inside a real host turn instead of inside a hand-built
 * context. It is never packed: `tests/fixtures/` is outside both packages'
 * `files` lists.
 *
 * Row order matters and is not left to the loader: this plugin `inject`s the
 * `tools` service, so it applies after `dsh-remedy` (which injects nothing) and
 * therefore sits INSIDE the waterfall — remedy sees every chunk it yields.
 *
 * Config:
 *   out       JSONL file for this run's own observations
 *   scenario  one of SCENARIOS (default: pass through)
 *   tools     tool names to register from TOOLS
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { SCENARIOS } from './scenarios.mjs'

export const name = 'r70-neighbour'
export const inject = ['tools']

/** Tool declarations the scenarios attribute fragments against. */
const TOOLS = {
  capture: {
    description: 'Record the arguments it was called with.',
    parameters: {
      type: 'object',
      properties: { code: { type: 'string' }, note: { type: 'string' } },
      additionalProperties: true,
    },
  },
  alpha: {
    description: 'Reads one file path.',
    parameters: {
      type: 'object',
      properties: { file_path: { type: 'string' } },
      required: ['file_path'],
      additionalProperties: true,
    },
  },
  beta: {
    description: 'Runs one command.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
      additionalProperties: true,
    },
  },
  gamma: {
    description: 'A closed schema with no required list: only `strict` is declared.',
    parameters: {
      type: 'object',
      properties: { strict: { type: 'string' } },
      additionalProperties: false,
    },
  },
  remedy_unattributed: {
    description: 'The name remedy uses as a fallback, owned here by the profile.',
    parameters: { type: 'object', properties: {}, additionalProperties: true },
  },
}

const FUSED_TWO_TOOLS = '{"file_path":"a.ts"}{"command":"echo hi"}'
const FUSED_CLOSED = '{"strict":"a"}{"extra":"b"}'
const BARE_VALUE = '{"code": \nconsole.log(1)\nconsole.log(2)\n, "note": "r70"}'

const toolCall = (index, id, name, argumentsDelta) => ({
  type: 'tool-call-delta',
  index,
  id,
  ...(name === undefined ? {} : { name }),
  argumentsDelta,
})

const blockEnd = (index, block) => ({ type: 'block-end', index, block })
const finish = (reason) => ({ type: 'finish', reason })
const stop = () => finish({ kind: 'stop' })

/** The adapter-shaped failure: the argument text rides inside the message. */
const fusionFailure = (tool, detail, text) =>
  finish({
    kind: 'error',
    failure: {
      code: 'MALFORMED_RESPONSE',
      message: `Tool call "${tool}": ${detail}\n\nReceived arguments:\n${text}`,
    },
  })

/** One scenario's chunk list, built after the adapter stream has been read. */
function chunksOf(scenario, seen) {
  switch (scenario) {
    case 'healthy':
      return seen

    case 'null-chunk':
      return [
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text: 'r70 ' },
        null,
        { type: 'text-delta', index: 0, text: 'ok' },
        blockEnd(0, { type: 'text', text: 'r70 ok' }),
        stop(),
      ]

    case 'object-arguments':
      return [
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        toolCall(0, 'call_r70_object', 'capture', '{"code":"x"}'),
        blockEnd(0, { type: 'tool-call', id: 'call_r70_object', name: 'capture', arguments: { code: 'x' } }),
        stop(),
      ]

    case 'no-block':
      return [
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        toolCall(0, 'call_r70_noblock', 'capture', '{"code":"x"}'),
        { type: 'block-end', index: 0 },
        stop(),
      ]

    case 'finish-no-reason':
      return [
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text: 'r70' },
        { type: 'finish' },
      ]

    case 'bare-value':
      // Message-only: the adapter fails while assembling the arguments, so the
      // bytes exist in exactly one place — the failure message (failure-text.ts).
      return [fusionFailure('capture', "Unexpected token 'c', ...\"{\\\"code\\\": is not valid JSON", BARE_VALUE)]

    case 'cross-tool':
    case 'closed-schema':
    case 'reserved-fused': {
      const fused = scenario === 'closed-schema' ? FUSED_CLOSED : FUSED_TWO_TOOLS
      const tool = scenario === 'closed-schema' ? 'gamma' : 'alpha'
      return [fusionFailure(tool, 'Unexpected non-whitespace character after JSON at position 24', fused)]
    }

    case 'reasoning-error':
      // No tool call at all: the failure the adapter reports for an unknown stop
      // reason is the only thing this stream carries (P-0034's shape).
      return [
        { type: 'block-start', index: 0, blockType: 'reasoning' },
        { type: 'reasoning-delta', index: 0, text: 'planning' },
        blockEnd(0, { type: 'reasoning', text: 'planning' }),
        finish({
          kind: 'error',
          failure: {
            code: 'MALFORMED_RESPONSE',
            message: 'DeepSeek Messages stream: unsupported stop reason refusal',
          },
        }),
      ]

    case 'delta-only':
      // No block-end: the host assembles from the deltas alone, and every delta
      // spells "unchanged" as `id: ""`.
      return [
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        toolCall(0, '', 'capture', '{"code":'),
        toolCall(0, '', undefined, '"x"}'),
        stop(),
      ]

    case 'reserved-nameless':
      return [
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        toolCall(0, 'call_r70_nameless', '', '{"file_path":"a.ts"}'),
        blockEnd(0, { type: 'tool-call', id: 'call_r70_nameless', name: '', arguments: '{"file_path":"a.ts"}' }),
        stop(),
      ]

    default:
      throw new Error(`r70-neighbour: unknown scenario "${scenario}"`)
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
      appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8')
    } catch {
      /* the probe never fails a turn over its own log */
    }
  }
}

/** Sync wrapper: an async listener would hand the host a Promise, not a stream. */
function wrap(stream, scenario, log) {
  if (stream !== null && typeof stream === 'object' && typeof stream.then === 'function') {
    return stream.then((value) => wrap(value, scenario, log))
  }
  if (stream === null || typeof stream !== 'object' || !(Symbol.asyncIterator in stream)) return stream
  return drain(stream, scenario, log)
}

async function* drain(stream, scenario, log) {
  const seen = []
  for await (const chunk of stream) seen.push(chunk)
  log({ event: 'adapter', chunks: seen.length, types: [...new Set(seen.map((chunk) => chunk?.type))] })
  for (const chunk of chunksOf(scenario, seen)) {
    if (chunk === null) log({ event: 'injected', type: 'null' })
    else if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') {
      log({ event: 'injected', type: chunk.type, index: chunk.index ?? null })
    }
    yield chunk
  }
}

export function apply(ctx, config = {}) {
  const log = writer(config.out)
  const scenario = config.scenario ?? 'healthy'
  if (!SCENARIOS.includes(scenario)) throw new Error(`r70-neighbour: unknown scenario "${scenario}"`)

  for (const toolName of config.tools ?? []) {
    const spec = TOOLS[toolName]
    if (spec === undefined) throw new Error(`r70-neighbour: unknown tool "${toolName}"`)
    ctx.tools.register({
      name: toolName,
      description: spec.description,
      parameters: spec.parameters,
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: () => [{ type: 'text', text: `${toolName} ran` }],
      },
      execute(args) {
        log({ event: 'tool', name: toolName, args })
        return Promise.resolve({ tool: toolName, received: args })
      },
    })
    log({ event: 'tool-registered', name: toolName })
  }

  let injected = false
  ctx.on('llm/stream', (options, next) => {
    const tools = Array.isArray(options?.tools) ? options.tools.map((one) => one?.name ?? '') : []
    // A title request carries no tools; injecting into it would add noise the
    // scenarios do not claim anything about.
    if (tools.length === 0) return next()
    // One injection per turn: the follow-up request after a dispatched call must
    // be an ordinary answer, or a healthy run would loop on the same defect.
    if (injected) return next()
    injected = true
    log({ event: 'stream', scenario, tools })
    return wrap(next(), scenario, log)
  })

  log({ event: 'mounted', scenario, tools: config.tools ?? [] })
}
