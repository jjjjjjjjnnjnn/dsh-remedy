/**
 * Read a DSH v4 session log: one zstd frame per flush, so the reader walks frame
 * starts and merges false boundaries; plain JSONL is returned as-is.
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

/** Decompress a concatenated-frame zstd log, or pass plain JSONL through. */
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
