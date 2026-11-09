import assert from 'node:assert/strict'
import { test } from 'node:test'
import { zstdCompressSync } from 'node:zlib'
import { decompressSessionLog } from 'dsh-remedy'

test('plain JSONL is passed through unchanged', () => {
  const text = '{"type":"a"}\n{"type":"b"}\n'
  assert.equal(decompressSessionLog(Buffer.from(text, 'utf8')), text)
})

test('one zstd frame is decompressed', () => {
  const text = '{"type":"one"}\n'
  const frame = zstdCompressSync(Buffer.from(text, 'utf8'))
  assert.equal(decompressSessionLog(frame), text)
})

test('concatenated frames are all decompressed, not just the first', () => {
  const first = '{"type":"one"}\n'
  const second = '{"type":"two"}\n{"type":"three"}\n'
  const buffer = Buffer.concat([
    zstdCompressSync(Buffer.from(first, 'utf8')),
    zstdCompressSync(Buffer.from(second, 'utf8')),
  ])
  assert.equal(decompressSessionLog(buffer), first + second)
})

test('a non-zstd, non-JSON buffer fails loudly', () => {
  assert.throws(() => decompressSessionLog(Buffer.from([0, 1, 2, 3])), /not a zstd session log/)
})
