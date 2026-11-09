/**
 * Read a DSH v4 session log.
 *
 * MEASURED FORMAT: `session.v4.jsonl.zstd` is **not one zstd frame** — the
 * session persistence layer appends a frame per flush, so a 50 KB file can hold
 * 17 frames and 180 KB of JSONL. `zlib.zstdDecompressSync` stops after the first
 * frame, which silently turns a 40-event session into a 1-event session. The
 * reader walks frame starts and merges a candidate that is not a real frame
 * boundary (the magic can occur inside compressed data) into the next one.
 *
 * Plain JSONL is returned as-is, so the same reader works for exported logs.
 */

import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

function frameStarts(buffer: Buffer): number[] {
  const starts: number[] = []
  let cursor = 0
  while (cursor < buffer.length) {
    const at = buffer.indexOf(ZSTD_MAGIC, cursor)
    if (at === -1) break
    starts.push(at)
    cursor = at + ZSTD_MAGIC.length
  }
  return starts
}

/**
 * Decompress a concatenated-frame zstd log, or pass plain JSONL through.
 *
 * @param buffer - the file bytes.
 * @returns the full JSONL text.
 */
export function decompressSessionLog(buffer: Buffer): string {
  if (buffer.length === 0) return ''
  if (buffer[0] === 0x7b) return buffer.toString('utf8') // `{` — plain JSONL

  const starts = frameStarts(buffer)
  if (starts.length === 0 || starts[0] !== 0) {
    throw new Error('not a zstd session log: no frame magic at offset 0')
  }

  const parts: Buffer[] = []
  let index = 0
  while (index < starts.length) {
    let end = index + 1 < starts.length ? starts[index + 1]! : buffer.length
    let done = false
    while (!done) {
      try {
        parts.push(zstdDecompressSync(buffer.subarray(starts[index]!, end)))
        done = true
      } catch (error) {
        if (index + 1 >= starts.length) throw error
        index += 1
        end = index + 1 < starts.length ? starts[index + 1]! : buffer.length
      }
    }
    index += 1
  }
  return Buffer.concat(parts).toString('utf8')
}
