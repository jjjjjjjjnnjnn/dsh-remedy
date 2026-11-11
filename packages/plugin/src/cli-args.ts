/**
 * CLI argument plumbing; moved out of `cli.ts` by the P-0004 seam split.
 *
 * Every command shares the same exit codes, usage text and flag reader, so they
 * live here instead of growing the entry module.
 */
import { readFileSync } from 'node:fs'

export const EXIT_OK = 0
export const EXIT_FINDING = 1
export const EXIT_USAGE = 2
export const EXIT_UNAVAILABLE = 3

export const USAGE = `dsh-remedy — resident repair layer for DeepSeek Harness

Usage:
  dsh-remedy status [--json] [--journal <file>]
  dsh-remedy repair [<file>] [--name <tool>] [--id <call-id>] [--max-calls <n>] [--truncated] [--json]
  dsh-remedy scan <session.jsonl|session.v4.jsonl.zstd> [--json] [--out <file>]
  dsh-remedy verify [--json]

Commands:
  status   List the patch registry and, with --journal, the last live counters.
  repair   Split a fused tool-call argument text. Reads stdin when no file is given.
           A .json fixture is read through its "arguments" field.
  scan     Count fused calls and MALFORMED_RESPONSE turns in a session log.
           Reads plain JSONL and multi-frame zstd logs alike.
  verify   Run the bundled fixtures through the repair engine.

Exit codes: 0 ok · 1 finding · 2 usage · 3 unavailable
`

export interface Args {
  readonly command: string
  readonly positional: readonly string[]
  readonly flags: ReadonlyMap<string, string | true>
}

export function parseArgs(argv: readonly string[]): Args {
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

export function flagString(args: Args, name: string): string | undefined {
  const value = args.flags.get(name)
  return typeof value === 'string' ? value : undefined
}

export function readInput(file: string | undefined): { text: string; name?: string; id?: string } {
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
