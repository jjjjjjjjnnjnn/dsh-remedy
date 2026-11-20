/** Read-only profile walker for the seam inventory. Never writes to the profile. */
import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from 'node:fs'
import { join, relative } from 'node:path'
import { registrationsIn, reservedUsesIn, type SeamPackage } from './seams.js'

export interface ProfileScan {
  readonly packages: SeamPackage[]
  readonly unreadable_dirs: readonly string[]
  readonly skipped_large_files: readonly string[]
  readonly files_read: number
  readonly bytes_read: number
}

const RESERVED = ['remedy_unattributed']
const rd = (p: string): Dirent[] => { try { return readdirSync(p, { withFileTypes: true }) } catch { return [] } }
const pkgDirs = (root: string): string[] => rd(root).flatMap((e) => {
  if (!e.isDirectory() || e.name.startsWith('.')) return []
  const p = join(root, e.name)
  if (!e.name.startsWith('@')) return existsSync(join(p, 'package.json')) ? [p] : []
  return rd(p).filter((s) => s.isDirectory() && existsSync(join(p, s.name, 'package.json'))).map((s) => join(p, s.name))
})
const sources = (dir: string): string[] => {
  const out: string[] = []
  const walk = (p: string, depth: number): void => {
    if (depth > 4) return
    for (const e of rd(p)) {
      const f = join(p, e.name)
      if (e.isDirectory()) walk(f, depth + 1)
      else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(f)
    }
  }
  walk(join(dir, 'dist'), 0)
  if (out.length === 0) walk(join(dir, 'lib'), 0)
  return out
}

/** One read-only pass over a profile's installed packages. */
export function scanProfile(profileDir: string): ProfileScan {
  let bundles: string[] = []
  try {
    const p = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: unknown } } }
    bundles = Array.isArray(p.dsh?.profile?.bundles) ? p.dsh.profile.bundles as string[] : []
  } catch { /* an unreadable order yields null load indices */ }
  const packages: SeamPackage[] = []
  const unreadable_dirs: string[] = []
  const skipped_large_files: string[] = []
  let files_read = 0
  let bytes_read = 0
  for (const dir of pkgDirs(join(profileDir, 'node_modules'))) {
    let pkg: { name?: unknown; version?: unknown }
    try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) } catch {
      unreadable_dirs.push(relative(profileDir, dir).replaceAll('\\', '/'))
      continue
    }
    if (typeof pkg.name !== 'string') continue
    const reg = new Map<string, { seam: string; mode: 'on' | 'emit'; prepend: boolean; file: string }>()
    const reserved = new Set<string>()
    for (const f of sources(dir)) {
      try {
        const size = statSync(f).size
        if (size > 4e6) { skipped_large_files.push(`${pkg.name}:${relative(dir, f).replaceAll('\\', '/')}`); continue }
        const text = readFileSync(f, 'utf8')
        files_read += 1
        bytes_read += size
        for (const r of reservedUsesIn(text, RESERVED)) reserved.add(r)
        for (const r of registrationsIn(text)) {
          const prev = reg.get(r.seam)
          reg.set(r.seam, { seam: r.seam, mode: prev?.mode === 'on' || r.mode === 'on' ? 'on' : r.mode, prepend: prev?.prepend === true || r.prepend, file: relative(dir, f).replaceAll('\\', '/') })
        }
      } catch { /* an unreadable file is skipped, never counted as zero */ }
    }
    const index = bundles.indexOf(pkg.name)
    packages.push({ name: pkg.name, version: typeof pkg.version === 'string' ? pkg.version : null, load_index: index < 0 ? null : index, registrations: [...reg.values()], reserved: [...reserved] })
  }
  return { packages, unreadable_dirs, skipped_large_files, files_read, bytes_read }
}
