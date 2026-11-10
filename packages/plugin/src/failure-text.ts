/** Adapter-failure parsing; moved out of `repair-stream.ts` by the P-0005 seam split. Before a `block-end`, this message is the only copy of the fused bytes. */

import type { LlmFailure } from './stream-types.js'

const RECEIVED_MARKER = /Received arguments:\r?\n/

export function isFusionFailure(failure: LlmFailure | undefined): boolean {
  if (!failure) return false
  if (failure.code === 'MALFORMED_RESPONSE') return true
  const message = failure.message ?? ''
  return /Unexpected non-whitespace character after JSON|Unexpected token .+ in JSON at position/i.test(message)
}

/**
 * The exact argument text is echoed in the adapter's failure message.
 *
 * A message we cannot attribute to a tool is not a rescue candidate: synthesizing
 * `name: 'unknown'` would dispatch a call to a tool that does not exist.
 */
export function argumentsFromFailure(failure: LlmFailure | undefined): { name: string; text: string } | null {
  const message = failure?.message ?? ''
  const marker = RECEIVED_MARKER.exec(message)
  if (!marker) return null
  const text = message.slice(marker.index + marker[0].length)
  if (text.trim() === '') return null
  const name = /Tool call "([^"]+)"/.exec(message)?.[1]
  if (name === undefined || name.trim() === '') return null
  return { name, text }
}

export function normalizeArguments(text: string): string {
  return text.trim() === '' ? '{}' : text
}
