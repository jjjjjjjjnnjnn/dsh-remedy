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

/** Every command the CLI dispatches, read from `cli.ts` rather than guessed. */
function dispatchedCommands(): string[] {
  const text = read('packages/plugin/src/cli.ts')
  return [...text.matchAll(/case '([a-z-]+)':/g)].map((match) => match[1] ?? '')
}

test('the packaged README documents every command the CLI dispatches', () => {
  // P-0016, blind spot BS-13: the previous test compares one line — the `scan`
  // line — so a whole command can ship undocument fetch. It did: `explain` landed
  // in 0.3.8 and `packages/plugin/README.md`, which is the page npm renders, still
  // listed four commands. That page is the first thing a stranger installs from.
  const readme = read('packages/plugin/README.md')
  const dispatched = dispatchedCommands()
  assert.ok(dispatched.length >= 5, `the CLI must dispatch its commands, found ${dispatched.length}`)
  const missing = dispatched.filter((command) => usageLine(readme, command) === null)
  assert.deepEqual(missing, [], `the packaged README documents no usage line for: ${missing.join(', ')}`)
})

test('the packaged README does not document a command the CLI cannot dispatch', () => {
  // The other direction matters just as much: a page that promises a command the
  // binary rejects is worse than a page that is silent about one. Only usage-block
  // lines are inspected, so the `name: dsh-remedy` mount row and the prose about the
  // bare loader specifier are not mistaken for commands.
  const readme = read('packages/plugin/README.md')
  const dispatched = new Set(dispatchedCommands())
  const documented = [...readme.matchAll(/^dsh-remedy ([a-z-]+) /gm)].map((match) => match[1] ?? '')
  assert.ok(documented.length > 0, 'the packaged README must keep its CLI block')
  const unknown = [...new Set(documented.filter((command) => !dispatched.has(command)))]
  assert.deepEqual(unknown, [], `the packaged README documents commands the CLI cannot dispatch: ${unknown.join(', ')}`)
})

test('the packaged README usage block matches the CLI usage block line for line', () => {
  // The strongest form: the two blocks are the same block. A flag added to one is a
  // red gate, and no command can be silently left out of the page npm shows.
  const usage = read('packages/plugin/src/cli-args.ts')
  const readme = read('packages/plugin/README.md')
  const commandLines = (text: string): string[] =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^dsh-remedy [a-z-]+ /.test(line))
      .map((line) => line.replaceAll(/\s+/g, ' '))
  assert.ok(commandLines(readme).length > 0, 'the packaged README must keep its CLI block')
  assert.deepEqual(commandLines(readme), commandLines(usage), 'the README CLI block and USAGE must be the same block')
})

test('the packaged README usage block matches the CLI usage block line for line', () => {
  // The strongest form: the two blocks are the same block. A flag added to one is a
  // red gate, and no command can be silently left out of the page npm shows.
  const usage = read('packages/plugin/src/cli-args.ts')
  const readme = read('packages/plugin/README.md')
  const commandLines = (text: string): string[] =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^dsh-remedy [a-z-]+ /.test(line))
      .map((line) => line.replaceAll(/\s+/g, ' '))
  assert.deepEqual(commandLines(readme), commandLines(usage), 'the README CLI block and USAGE must be the same block')
})
