/** `dsh-remedy seams`: read-only seam inventory of a DSH profile. */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildInventory, scanProfile } from 'dsh-remedy-core'
import { EXIT_FINDING, EXIT_OK, EXIT_UNAVAILABLE, flagString, type Args } from './cli-args.js'

export function cmdSeams(args: Args): number {
  const name = flagString(args, 'profile') ?? 'desktop'
  const dir = flagString(args, 'dir') ?? join(homedir(), '.dsh', 'profiles', name)
  if (!existsSync(join(dir, 'package.json'))) { process.stderr.write(`seams: no profile at ${dir}\n`); return EXIT_UNAVAILABLE }
  const scan = scanProfile(dir)
  const inventory = buildInventory(scan.packages)
  if (args.flags.has('json')) {
    process.stdout.write(`${JSON.stringify({ schema: 1, produced_by: 'dsh-remedy seams', profile: { name, dir, packages: scan.packages.length, unreadable_dirs: scan.unreadable_dirs, files_read: scan.files_read }, ...inventory }, null, 2)}\n`)
  } else {
    const lines = [`profile ${name}: ${scan.packages.length} packages, ${inventory.conflicts.length} shared seam(s)`]
    for (const row of inventory.seams) {
      lines.push(`${row.same_seam ? 'SAME' : '    '}  ${row.seam.padEnd(24)} ${row.registrants.map((e) => `${e.name}@${String(e.version)}${e.prepend ? '(prepend)' : ''}`).join(' -> ')}`)
    }
    for (const warning of inventory.warnings) lines.push(`WARN  ${warning}`)
    process.stdout.write(`${lines.join('\n')}\n`)
  }
  return inventory.conflicts.length === 0 ? EXIT_OK : EXIT_FINDING
}
