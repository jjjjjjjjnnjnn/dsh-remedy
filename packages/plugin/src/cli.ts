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

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  formatRemedyVerdict,
  judgeRemedy,
  PATCHES,
  repairToolCallArguments,
  splitTopLevelJsonObjects,
  type RemedyCounters,
} from 'dsh-remedy-core'
import {
  EXIT_FINDING,
  EXIT_OK,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
  flagString,
  parseArgs,
  readInput,
  type Args,
  USAGE,
} from './cli-args.js'
import { cmdScan } from './scan-command.js'

function fixtureDir(): URL | null {
  // Installed tarball: dist/../fixtures; source checkout: dist/../../../data.
  const candidates = [
    new URL('../fixtures/toolcall-fusion/', import.meta.url),
    new URL('../../../data/fixtures/toolcall-fusion/', import.meta.url),
  ]
  for (const candidate of candidates) {
    if (existsSync(fileURLToPath(candidate))) return candidate
  }
  return null
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

interface VerifyCase {
  readonly fixture: string
  readonly ok: boolean
  readonly detail: string
}

function cmdVerify(args: Args): number {
  const dir = fixtureDir()
  if (dir === null) {
    process.stderr.write('verify: fixtures unavailable; run from a source checkout or reinstall the package\n')
    return EXIT_UNAVAILABLE
  }
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
      // A split reports how many top-level objects it proved. A reseal (P-0005)
      // reports 1 — one call, rewritten — which is not a slice count, so the
      // engine's own number is the only honest source here.
      const split = splitTopLevelJsonObjects(fixture.arguments)
      const fragments =
        result.status === 'repaired' ? result.fragments : split.ok ? split.slices.length : 0
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
