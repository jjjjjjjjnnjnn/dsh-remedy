import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const NPM = WINDOWS ? 'npm.cmd' : 'npm'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/**
 * Every reason the publish must not start. Kept pure so the governance test can
 * pin it without spawning npm.
 */
export function publishProblems({ root, core, plugin, distExists }) {
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
  return problems
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

  console.log(`publishing ${core.name}@${core.version} then ${plugin.name}@${plugin.version}`)
  if (dryRun) console.log('(dry run: nothing is sent to the registry)')

  for (const relative of ORDER) {
    const cwd = join(ROOT, relative)
    const args = ['publish', '--access', 'public']
    if (otp !== null) args.push('--otp', otp)
    if (dryRun) args.push('--dry-run')
    console.log(`\n$ (cd ${relative} && npm ${args.join(' ')})`)
    // cwd must be the package directory: npm resolves `prepack` and the tarball
    // contents relative to it, and publishing from the workspace root fails with
    // EPRIVATE because the root package is deliberately private.
    // `npm` is a shell shim on Windows (`npm.cmd`); spawnSync with shell:false
    // cannot exec it and returns status null with an ENOENT error, which used to
    // read as a silent failure instead of a real one.
    const command = WINDOWS ? [NPM, ...args].join(' ') : NPM
    const argv = WINDOWS ? args : args
    const result = spawnSync(command, WINDOWS ? [] : argv, { cwd, stdio: 'inherit', shell: WINDOWS })
    if (result.status !== 0) {
      if (result.error !== undefined) console.error(`\nspawn error: ${result.error.message}`)
      console.error(`\nstopped: npm exited ${result.status ?? 'without a status'} in ${relative}`)
      console.error('If npm asked for a one-time password, re-run with --otp <code>;')
      console.error('if the registry answered 404 through pnpm, that is the missing OTP too.')
      return result.status ?? 1
    }
  }

  console.log(`\nboth packages published. Next: node scripts/record_publish.mjs --stamp <ISO> --retries 3`)
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main()
}
