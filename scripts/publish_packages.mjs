import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ORDER = ['packages/core', 'packages/plugin']

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const dryRun = process.argv.includes('--dry-run')
const otp = flag('otp', null)
// Windows ships `npm.cmd`; Node refuses to spawn a `.cmd` without a shell
// (EINVAL), so the shim needs shell:true there and a plain binary elsewhere.
// None of the arguments contain spaces, so joining them into a shell command is safe.
const WINDOWS = process.platform === 'win32'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/**
 * The dependency protocols npm cannot resolve from a registry. `workspace:*` is
 * the dangerous one: pnpm rewrites it while packing, npm does not, and a tarball
 * published by npm therefore installs into nothing but EUNSUPPORTEDPROTOCOL.
 */
const UNPUBLISHABLE = /^(workspace|file|link|portal):/

/** Dependencies that would make a published tarball uninstallable. */
export function unpublishableDependencies(manifest) {
  const problems = []
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = manifest?.[field]
    if (block === undefined || block === null) continue
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec !== 'string' || !UNPUBLISHABLE.test(spec)) continue
      problems.push(`${field}.${name} is "${spec}"; a published package cannot use that protocol`)
    }
  }
  return problems
}

/**
 * Every reason the publish must not start. Kept pure so the governance test can
 * pin it without spawning npm.
 */
export function publishProblems({ root, core, plugin, distExists, packed }) {
  const problems = []
  if (root.private !== true) {
    problems.push('the workspace root must stay "private": true, or npm can ship the whole monorepo')
  }
  if (core.name !== 'dsh-remedy-core') problems.push(`packages/core is ${core.name}, expected dsh-remedy-core`)
  if (plugin.name !== 'dsh-remedy') problems.push(`packages/plugin is ${plugin.name}, expected dsh-remedy`)
  if (core.version !== plugin.version) {
    problems.push(`core ${core.version} and plugin ${plugin.version} disagree; the plugin pins the exact core version`)
  }
  if (core.publishConfig?.access !== 'public') problems.push('packages/core must declare publishConfig.access public')
  if (plugin.publishConfig?.access !== 'public') problems.push('packages/plugin must declare publishConfig.access public')
  if (!distExists.core) problems.push('packages/core/dist is missing; run pnpm run build first')
  if (!distExists.plugin) problems.push('packages/plugin/dist is missing; run pnpm run build first')
  if (packed?.core !== undefined) problems.push(`packed core: ${packed.core}`)
  if (packed?.plugin !== undefined) problems.push(`packed plugin: ${packed.plugin}`)
  return problems
}

const BLOCK = 512

/**
 * Read `package/package.json` out of a packed `.tgz` without a dependency on tar.
 *
 * The point is not to validate the archive format in general: it is to look at
 * the manifest that will actually be published, which is the only place the
 * workspace protocol shows up after npm has already stopped rewriting it.
 */
export function packedManifest(tgzPath) {
  const bytes = gunzipSync(readFileSync(tgzPath))
  let offset = 0
  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')
    if (name === '') return null
    const sizeText = header.subarray(124, 136).toString('utf8').trim()
    const size = Number.parseInt(sizeText, 8)
    if (!Number.isFinite(size) || size < 0) return null
    const bodyStart = offset + BLOCK
    if (name === 'package/package.json') {
      return JSON.parse(bytes.subarray(bodyStart, bodyStart + size).toString('utf8'))
    }
    offset = bodyStart + Math.ceil(size / BLOCK) * BLOCK
  }
  return null
}

function run(command, args, cwd) {
  const joined = WINDOWS ? [command, ...args].join(' ') : command
  return spawnSync(joined, WINDOWS ? [] : args, { cwd, stdio: 'inherit', shell: WINDOWS })
}

function main() {
  const root = readJson(join(ROOT, 'package.json'))
  const core = readJson(join(ROOT, 'packages/core/package.json'))
  const plugin = readJson(join(ROOT, 'packages/plugin/package.json'))
  const problems = publishProblems({
    root,
    core,
    plugin,
    distExists: {
      core: existsSync(join(ROOT, 'packages/core/dist/index.js')),
      plugin: existsSync(join(ROOT, 'packages/plugin/dist/cli.js')),
    },
  })

  if (problems.length > 0) {
    console.error('publish refused:')
    for (const problem of problems) console.error(`  - ${problem}`)
    return 2
  }

  const staging = mkdtempSync(join(tmpdir(), 'dsh-remedy-publish-'))
  console.log(`publishing ${core.name}@${core.version} then ${plugin.name}@${plugin.version}`)
  if (dryRun) console.log('(dry run: nothing is sent to the registry)')

  try {
    for (const relative of ORDER) {
      const cwd = join(ROOT, relative)
      const manifest = readJson(join(cwd, 'package.json'))

      // Pack with pnpm, publish the tarball with npm. pnpm is the only one of
      // the two that rewrites `workspace:*` into the exact version; npm publishes
      // whatever protocol it finds in the manifest, and the resulting tarball is
      // uninstallable. Publishing the already-packed tarball keeps the bytes we
      // verified and the bytes the registry receives identical.
      console.log(`\n$ (cd ${relative} && pnpm pack --pack-destination ${staging})`)
      const packed = run('pnpm', ['pack', '--pack-destination', staging], cwd)
      if (packed.status !== 0) {
        console.error(`\nstopped: pnpm pack exited ${packed.status ?? 'without a status'} in ${relative}`)
        return packed.status ?? 1
      }

      const tgz = join(staging, `${manifest.name}-${manifest.version}.tgz`)
      if (!existsSync(tgz)) {
        console.error(`\nstopped: pnpm pack did not write ${tgz}`)
        return 1
      }

      const published = packedManifest(tgz)
      if (published === null) {
        console.error(`\nstopped: ${tgz} has no package/package.json`)
        return 1
      }
      const unpublishable = unpublishableDependencies(published)
      if (unpublishable.length > 0) {
        console.error(`\nstopped: ${manifest.name}@${manifest.version} would publish an uninstallable tarball:`)
        for (const problem of unpublishable) console.error(`  - ${problem}`)
        console.error('A registry install of this tarball fails with EUNSUPPORTEDPROTOCOL. Pack it with pnpm first.')
        return 1
      }
      if (relative === 'packages/plugin') {
        const pin = published.dependencies?.[core.name]
        if (pin !== core.version) {
          console.error(`\nstopped: the packed plugin depends on ${core.name}@${String(pin)}, not @${core.version}`)
          console.error('The plugin must pin the exact core version that this run publishes first.')
          return 1
        }
      }

      const args = ['publish', tgz, '--access', 'public']
      if (otp !== null) args.push('--otp', otp)
      if (dryRun) args.push('--dry-run')
      console.log(`\n$ npm ${args.join(' ')}`)
      const result = run('npm', args, cwd)
      if (result.status !== 0) {
        if (result.error !== undefined) console.error(`\nspawn error: ${result.error.message}`)
        console.error(`\nstopped: npm exited ${result.status ?? 'without a status'} in ${relative}`)
        console.error('If npm asked for a one-time password, re-run with --otp <code>;')
        console.error('if the registry answered 404 through pnpm, that is the missing OTP too.')
        return result.status ?? 1
      }
    }
  } finally {
    rmSync(staging, { force: true, recursive: true })
  }

  console.log('\nboth packages published. Next: node scripts/record_publish.mjs --stamp <ISO> --retries 3')
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main()
}
