/**
 * The `scan` command; moved out of `cli.ts` by the P-0004 seam split.
 *
 * The directory walk, the log reader and the artifact writer are the offline
 * surface of the CLI; `cli.ts` only dispatches to them.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { EXIT_FINDING, EXIT_OK, EXIT_UNAVAILABLE, EXIT_USAGE, flagString, type Args } from './cli-args.js'
import { decompressSessionLog } from './session-log.js'
import { redactReport, scanSessions, type ScanReport, type ScanRow } from './session-scan.js'

function writeArtifact(path: string, report: ScanReport, rows: readonly ScanRow[]): void {
  const json = `${JSON.stringify({ ...report, rows }, null, 2)}\n`
  writeFileSync(path, json, 'utf8')
  const digest = createHash('sha256').update(json).digest('hex')
  writeFileSync(`${path}.sha256`, `${digest}  ${basename(path)}\n`, 'utf8')
}

/** Every `session.v4.jsonl.zstd` below a directory, newest first. */
function collectSessions(directory: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (/^session\.v4\.jsonl\.(zstd|jsonl)$/.test(entry.name)) files.push(path)
    }
  }
  walk(directory)
  return files.sort((a, b) => {
    const left = statSync(a).mtimeMs
    const right = statSync(b).mtimeMs
    return right - left
  })
}

export function cmdScan(args: Args): number {
  const target = args.positional[0]
  if (target === undefined) {
    process.stderr.write('scan: missing <session.jsonl|directory>\n')
    return EXIT_USAGE
  }
  if (!existsSync(target)) {
    process.stderr.write(`scan: not found: ${target}\n`)
    return EXIT_UNAVAILABLE
  }
  const sinceText = flagString(args, 'since')
  const since = sinceText === undefined ? undefined : Date.parse(sinceText)
  if (sinceText !== undefined && Number.isNaN(since)) {
    process.stderr.write(`scan: --since is not an ISO instant: ${sinceText}\n`)
    return EXIT_USAGE
  }
  const maxFiles = Number(flagString(args, 'max-files') ?? '200')
  if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
    process.stderr.write('scan: --max-files must be a positive integer\n')
    return EXIT_USAGE
  }

  // A live session log is `session.v4.jsonl.zstd`: several concatenated zstd
  // frames, not text. Reading it as utf8 counted every line as unreadable and
  // reported a 28-event session as zero attempts, so the same reader the
  // plugin ships is used here. Plain JSONL passes through untouched.
  const inputs: { label: string; text: string }[] = []
  const failures: string[] = []
  const files = statSync(target).isDirectory() ? collectSessions(target).slice(0, maxFiles) : [target]
  if (files.length === 0) {
    process.stderr.write(`scan: no session files under ${target}\n`)
    return EXIT_UNAVAILABLE
  }
  for (const file of files) {
    try {
      inputs.push({ label: resolve(file), text: decompressSessionLog(readFileSync(file)) })
    } catch (error) {
      // One unreadable file must not abort the batch: it is reported as a
      // failure line and left out of the numbers, never folded in as zero.
      failures.push(`${resolve(file)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const batch = scanSessions(inputs, statSync(target).isDirectory() ? target : resolve(target), {
    ...(since === undefined ? {} : { since }),
  })
  const report = redactReport(batch.report)
  const out = flagString(args, 'out')
  if (out !== undefined) writeArtifact(out, report, batch.rows)

  if (args.flags.has('json')) {
    process.stdout.write(`${JSON.stringify({ ...report, rows: batch.rows, failures }, null, 2)}\n`)
  } else {
    process.stdout.write(`source: ${report.source}\n`)
    if (report.files > 1) process.stdout.write(`files=${report.files}\n`)
    process.stdout.write(
      `attempts=${report.attempts} fused_calls=${report.fused_calls} fusion_failures=${report.fusion_failures} repairable=${report.repairable_failures} unreadable_lines=${report.unreadable_lines}\n`,
    )
    // P-0006: the census is the fault map. A report that only names the one
    // class this plugin can repair describes one road and calls it a map.
    const t = report.turns
    process.stdout.write(
      `turns=${t.completed + t.max_tokens + t.aborted + t.error} completed=${t.completed} max_tokens=${t.max_tokens} aborted=${t.aborted} error=${t.error}\n`,
    )
    const codes = Object.entries(report.error_codes)
    if (codes.length > 0) {
      process.stdout.write(`  error codes: ${codes.map(([code, count]) => `${code}=${count}`).join(' ')}\n`)
    }
    if (report.before_since > 0) process.stdout.write(`before_since=${report.before_since}\n`)
    if (report.window.oldest !== null && report.window.newest !== null) {
      process.stdout.write(
        `window=${new Date(report.window.oldest).toISOString()}..${new Date(report.window.newest).toISOString()}\n`,
      )
    }
    for (const row of batch.rows) {
      if (row.fused_calls === 0 && row.fusion_failures === 0) continue
      process.stdout.write(
        `  ${row.source} fused=${row.fused_calls} failures=${row.fusion_failures} repairable=${row.repairable_failures}\n`,
      )
    }
    for (const [tool, count] of Object.entries(report.by_tool)) {
      process.stdout.write(`  ${tool}: ${count}\n`)
    }
    for (const example of report.examples) {
      process.stdout.write(`  seq=${example.seq ?? '?'} tool=${example.tool} fragments=${example.fragments}\n`)
      process.stdout.write(`    ${example.excerpt.replaceAll('\n', '\\n')}\n`)
    }
    for (const failure of failures) process.stdout.write(`unreadable file: ${failure}\n`)
    if (out !== undefined) process.stdout.write(`written: ${out} (+ .sha256)\n`)
  }

  if (failures.length > 0) return EXIT_UNAVAILABLE
  return report.fused_calls > 0 || report.fusion_failures > 0 ? EXIT_FINDING : EXIT_OK
}
