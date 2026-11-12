import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

/** The `dsh-remedy <command> ...` line for one command, whitespace-normalised. */
function usageLine(text: string, command: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith(`dsh-remedy ${command} `)) return trimmed.replaceAll(/\s+/g, ' ')
  }
  return null
}

test('the package README documents every flag the CLI actually accepts for scan', () => {
  // Two defects lived here: the README that npm shows said
  // `scan <session.jsonl> [--json] [--out <file>]` while the CLI has accepted a
  // directory, `--since` and `--max-files` since P-0004, and the CLI's own
  // USAGE said the same stale thing. Neither string had a gate, so both drifted.
  const usage = read('packages/plugin/src/cli-args.ts')
  const readme = read('packages/plugin/README.md')

  const usageScan = usageLine(usage, 'scan')
  const readmeScan = usageLine(readme, 'scan')
  assert.notEqual(usageScan, null, 'cli-args.ts must keep a `dsh-remedy scan` usage line')
  assert.notEqual(readmeScan, null, 'packages/plugin/README.md must keep a `dsh-remedy scan` usage line')
  assert.equal(readmeScan, usageScan, 'the packaged README and the CLI USAGE must say the same scan line')

  for (const flag of ['--since', '--max-files', '--json', '--out']) {
    assert.ok(usageScan?.includes(flag), `the scan usage line must name ${flag}`)
  }
  assert.match(usageScan ?? '', /directory|dir/, 'the scan usage line must admit a directory')
})

test('the packaged README does not restate the old zstd-only scan shape', () => {
  const readme = read('packages/plugin/README.md')
  assert.doesNotMatch(readme, /scan <session\.jsonl> \[--json\]/, 'the old one-file-only line is the defect')
})
