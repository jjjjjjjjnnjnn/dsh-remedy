#!/usr/bin/env node
/**
 * `dsh-remedy` CLI.
 *
 * Commands:
 *   status              registry + live counters (optionally from a journal)
 *   repair [file]       run P-0001 on one tool-call argument text (file or stdin)
 *   scan <session>      offline forensic scan of a DSH `.jsonl` session log
 *   verify              run the bundled fixtures through the same engine
 *
 * Exit codes: 0 ok · 1 finding (rejected / fusion found / verify failed) ·
 *             2 usage · 3 unavailable (missing file)
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  formatRemedyVerdict,
  judgeRemedy,
  PATCHES,
  repairToolCallArguments,
  splitTopLevelJsonObjects,
  type RemedyCounters,
} from '@dsh-remedy/core'
import { redactReport, scanSessionText, type ScanReport } from './session-scan.js'

const EXIT_OK = 0
const EXIT_FINDING = 1
const EXIT_USAGE = 2
const EXIT_UNAVAILABLE = 3

const USAGE = `dsh-remedy — resident repair layer for DeepSeek Harness

Usage:
  dsh-remedy status [--json] [--journal <file>]
  dsh-remedy repair [<file>] [--name <tool>] [--id <call-id>] [--max-calls <n>] [--truncated] [--json]
  dsh-remedy scan <session.jsonl> [--json] [--out <file>]
  dsh-remedy verify [--json]

Commands:
  status   List the patch registry and, with --journal, the last live counters.
  repair   Split a fused tool-call argument text. Reads stdin when no file is given.
           A .json fixture is read through its "arguments" field.
  scan     Count fused calls and MALFORMED_RESPONSE turns in a session log.
  verify   Run the bundled fixtures through the repair engine.

Exit codes: 0 ok · 1 finding · 2 usage · 3 unavailable
`

interface Args {
  readonly command: string
  readonly positional: readonly string[]
  readonly flags: ReadonlyMap<string, string | true>
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = []
  const flags = new Map<string, string | true>()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined) break
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const name = token.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next)
      index += 1
    } else {
      flags.set(name, true)
    }
  }
  return { command: positional[0] ?? 'status', positional: positional.slice(1), flags }
}

function flagString(args: Args, name: string): string | undefined {
  const value = args.flags.get(name)
  return typeof value === 'string' ? value : undefined
}

function readInput(file: string | undefined): { text: string; name?: string; id?: string } {
  if (file === undefined || file === '-') return { text: readFileSync(0, 'utf8') }
  const text = readFileSync(file, 'utf8')
  // A bundled fixture is `{name, call_id, arguments, expect}`; read the field,
  // not the wrapper. `--raw` is unnecessary because flags still win and a raw
  // tool-call object never has a string `arguments` member at the top level.
  if (file.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text) as { arguments?: unknown; name?: unknown; call_id?: unknown }
      if (typeof parsed.arguments === 'string') {
        return {
          text: parsed.arguments,
          name: typeof parsed.name === 'string' ? parsed.name : undefined,
          id: typeof parsed.call_id === 'string' ? parsed.call_id : undefined,
        }
      }
    } catch {
      // Not a fixture; treat the file as raw argument text.
    }
  }
  return { text }
}

function fixtureDir(): URL {
  return new URL('../../../data/fixtures/toolcall-fusion/', import.meta.url)
}

interface Fixture {
  readonly name: string
  readonly tool: string
  readonly call_id: string
  readonly arguments: string
  readonly truncated?: boolean
  readonly expect: { readonly status: string; readonly fragments?: number }
}

function cmdStatus(args: Args): number {
  const json = args.flags.has('json')
  const journal = flagString(args, 'journal')
  let counters: RemedyCounters | null = null
  let journalNote = ''

  if (journal !== undefined) {
    if (!existsSync(journal)) {
      process.stderr.write(`status: journal not found: ${journal}\n`)
      return EXIT_UNAVAILABLE
    }
    const lines = readFileSync(journal, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '')
    const last = lines.at(-1)
    if (last !== undefined) {
      try {
        const parsed = JSON.parse(last) as { counters?: RemedyCounters }
        counters = parsed.counters ?? null
      } catch {
        journalNote = 'last journal line is not JSON'
      }
    }
  }

  const verdict = counters === null ? null : judgeRemedy(counters)
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ schema: 1, patches: PATCHES, counters, verdict, journalNote }, null, 2)}\n`,
    )
    return EXIT_OK
  }

  process.stdout.write('dsh-remedy registry\n')
  for (const patch of PATCHES) {
    process.stdout.write(`  ${patch.id}  ${patch.status.padEnd(8)} ${patch.severity.padEnd(8)} ${patch.title}\n`)
    process.stdout.write(`             surface: ${patch.surface}\n`)
  }
  if (counters !== null && verdict !== null) {
    process.stdout.write(`${formatRemedyVerdict(verdict, counters)}\n`)
    for (const reason of verdict.reasons) process.stdout.write(`  - ${reason}\n`)
  } else {
    process.stdout.write('remedy: unmeasured — no journal counters supplied\n')
  }
  if (journalNote !== '') process.stdout.write(`note: ${journalNote}\n`)
  return EXIT_OK
}

function cmdRepair(args: Args): number {
  const json = args.flags.has('json')
  const file = args.positional[0]
  let input: { text: string; name?: string; id?: string }
  try {
    input = readInput(file)
  } catch (error) {
    process.stderr.write(`repair: cannot read ${file ?? 'stdin'}: ${error instanceof Error ? error.message : String(error)}\n`)
    return EXIT_UNAVAILABLE
  }

  const rawMax = flagString(args, 'max-calls')
  const maxCalls = rawMax === undefined ? undefined : Number.parseInt(rawMax, 10)
  if (maxCalls !== undefined && (!Number.isInteger(maxCalls) || maxCalls < 1)) {
    process.stderr.write(`repair: --max-calls must be a positive integer, got "${rawMax}"\n`)
    return EXIT_USAGE
  }

  const result = repairToolCallArguments(
    {
      id: flagString(args, 'id') ?? input.id ?? 'call_cli',
      name: flagString(args, 'name') ?? input.name ?? 'unknown',
      arguments: input.text,
    },
    { maxCalls, truncated: args.flags.has('truncated') },
  )

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else if (result.status === 'repaired') {
    process.stdout.write(`status: repaired (${result.calls.length} calls)\n`)
    for (const [index, call] of result.calls.entries()) {
      process.stdout.write(`  ${index + 1}. id=${call.id} name=${call.name} args=${call.arguments}\n`)
    }
  } else if (result.status === 'unchanged') {
    process.stdout.write(`status: unchanged (${result.code})\n`)
  } else {
    process.stdout.write(`status: rejected (${result.code}) — ${result.detail}\n`)
  }

  return result.status === 'rejected' ? EXIT_FINDING : EXIT_OK
}

function writeArtifact(path: string, report: ScanReport): void {
  const json = `${JSON.stringify(report, null, 2)}\n`
  writeFileSync(path, json, 'utf8')
  const digest = createHash('sha256').update(json).digest('hex')
  writeFileSync(`${path}.sha256`, `${digest}  ${basename(path)}\n`, 'utf8')
}

function cmdScan(args: Args): number {
  const file = args.positional[0]
  if (file === undefined) {
    process.stderr.write('scan: missing <session.jsonl>\n')
    return EXIT_USAGE
  }
  if (!existsSync(file)) {
    process.stderr.write(`scan: not found: ${file}\n`)
    return EXIT_UNAVAILABLE
  }
  const report = redactReport(scanSessionText(readFileSync(file, 'utf8'), resolve(file)))
  const out = flagString(args, 'out')
  if (out !== undefined) writeArtifact(out, report)

  if (args.flags.has('json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(`source: ${report.source}\n`)
    process.stdout.write(
      `attempts=${report.attempts} fused_calls=${report.fused_calls} fusion_failures=${report.fusion_failures} repairable=${report.repairable_failures} unreadable_lines=${report.unreadable_lines}\n`,
    )
    for (const [tool, count] of Object.entries(report.by_tool)) {
      process.stdout.write(`  ${tool}: ${count}\n`)
    }
    for (const example of report.examples) {
      process.stdout.write(`  seq=${example.seq ?? '?'} tool=${example.tool} fragments=${example.fragments}\n`)
      process.stdout.write(`    ${example.excerpt.replaceAll('\n', '\\n')}\n`)
    }
    if (out !== undefined) process.stdout.write(`written: ${out} (+ .sha256)\n`)
  }

  return report.fused_calls > 0 || report.fusion_failures > 0 ? EXIT_FINDING : EXIT_OK
}

interface VerifyCase {
  readonly fixture: string
  readonly ok: boolean
  readonly detail: string
}

function cmdVerify(args: Args): number {
  const dir = fixtureDir()
  let names: string[]
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
  } catch (error) {
    process.stderr.write(`verify: fixtures unavailable: ${error instanceof Error ? error.message : String(error)}\n`)
    return EXIT_UNAVAILABLE
  }
  if (names.length === 0) {
    process.stderr.write('verify: no fixtures found\n')
    return EXIT_UNAVAILABLE
  }

  const cases: VerifyCase[] = []
  for (const name of names) {
    let fixture: Fixture
    try {
      fixture = JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as Fixture
    } catch (error) {
      cases.push({ fixture: name, ok: false, detail: `unreadable: ${error instanceof Error ? error.message : String(error)}` })
      continue
    }
    const result = repairToolCallArguments(
      { id: fixture.call_id, name: fixture.tool, arguments: fixture.arguments },
      { truncated: fixture.truncated === true },
    )
    if (result.status !== fixture.expect.status) {
      cases.push({
        fixture: name,
        ok: false,
        detail: `expected ${fixture.expect.status}, got ${result.status}${result.status === 'rejected' ? ` (${result.code})` : ''}`,
      })
      continue
    }
    if (fixture.expect.fragments !== undefined) {
      const split = splitTopLevelJsonObjects(fixture.arguments)
      const fragments = split.ok ? split.slices.length : 0
      if (fragments !== fixture.expect.fragments) {
        cases.push({ fixture: name, ok: false, detail: `expected ${fixture.expect.fragments} fragments, got ${fragments}` })
        continue
      }
    }
    cases.push({ fixture: name, ok: true, detail: result.status })
  }

  const failed = cases.filter((item) => !item.ok)
  if (args.flags.has('json')) {
    process.stdout.write(`${JSON.stringify({ schema: 1, ok: failed.length === 0, cases }, null, 2)}\n`)
  } else {
    for (const item of cases) {
      process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'}  ${item.fixture} — ${item.detail}\n`)
    }
    process.stdout.write(`${failed.length === 0 ? 'OK' : 'FAILED'}  ${cases.length} fixture(s)\n`)
  }
  return failed.length === 0 ? EXIT_OK : EXIT_FINDING
}

function main(argv: readonly string[]): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE)
    return EXIT_OK
  }
  const args = parseArgs(argv)
  switch (args.command) {
    case 'status':
      return cmdStatus(args)
    case 'repair':
      return cmdRepair(args)
    case 'scan':
      return cmdScan(args)
    case 'verify':
      return cmdVerify(args)
    default:
      process.stderr.write(`unknown command "${args.command}"\n\n${USAGE}`)
      return EXIT_USAGE
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) process.exitCode = main(process.argv.slice(2))

export { main }
