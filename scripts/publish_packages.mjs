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
 * What the npm exit status actually means.
 *
 * The registry answers a PUT with 404 for "this account may not write here" as
 * readily as for "this package does not exist", so a bare 404 cannot be read as
 * a missing one-time password. On 2026-11-11 a real publish died on
 * `PUT 404 https://registry.npmjs.org/dsh-remedy-core` while `npm whoami`
 * answered 401 — the tarball and the script were fine, the shell was logged out.
 * Telling the operator to reach for `--otp` first sent one publish attempt down
 * the wrong path, so the advice now asks the cheap question first.
 */
export function npmFailureAdvice(status) {
  if (status === 404) {
    return [
      'A 404 on the PUT is a permission answer, not a missing package:',
      '  run `npm whoami` and expect your npm user name. If it answers 401,',
      '  run `npm login` and publish again before suspecting the tarball.',
    ]
  }
  if (status === 401 || status === 403) {
    return [
      'The registry rejected the publish as unauthenticated:',
      '  run `npm login`, then confirm `npm whoami` prints your npm user name.',
    ]
  }
  if (status === 402 || status === 429) {
    return ['The registry is rate limiting or billing: wait, then run `npm whoami` to confirm the account.']
  }
  return [
    'If npm asked for a one-time password, re-run with --otp <code>;',
    'if the publish was refused with no password prompt, check `npm whoami` first.',
  ]
}

/**
 * Every reason the shell cannot publish, from the `npm whoami` answer alone.
 * Kept pure so a governance test can pin it without touching the network.
 */
export function publishAuthProblems(whoami) {
  const status = whoami?.status
  const name = String(whoami?.stdout ?? '').trim()
  const said = `${String(whoami?.stdout ?? '')}\n${String(whoami?.stderr ?? '')}`
  if (status === 0 && name !== '') return []
  if (status === 0) {
    return ['`npm whoami` succeeded without printing a user name; log in again with `npm login`']
  }
  // npm reports the registry's 401 through its own exit code, so a status of 1
  // with `E401` in the output means the same thing as a status of 401.
  if (status === 401 || status === 403 || /(?:E40[13]|401 Unauthorized|403 Forbidden)/.test(said)) {
    return ['`npm whoami` answered 401: the token in your npmrc is missing or expired. Run `npm login` and confirm `npm whoami` prints your user name']
  }
  const detail = String(whoami?.stderr ?? '').split('\n').find((line) => line.trim() !== '') ?? 'no output'
  return [`\`npm whoami\` exited ${String(status ?? 'without a status')}: ${detail.trim()}`]
}

/**
 * The 2026-11-11 publish reached the registry and came back `EOTP`, which is a
 * different failure from the 404 of the day before: the credential was valid,
 * but the account is on `auth-and-writes`, so every write needs a fresh code.
 * The registry's answer is already the right instruction, so the script must
 * repeat it verbatim instead of explaining it away -- the URL npm prints is the
 * only way to complete a web-authenticated publish.
 */
export function otpAdvice(status, stderr) {
  const text = String(stderr ?? '')
  if (status !== 1 || !/EOTP|one-time password/i.test(text)) return []
  const printed = text
    .split('\n')
    .map((line) => line.replace(/npm error\s*/g, '').trim())
    .filter((line) => line.startsWith('http'))
  const advice = [
    'The registry wants a one-time password; this is EOTP, not a permission problem.',
    '  re-run with --otp <code> from your authenticator, or open the URL npm printed:',
  ]
  for (const url of printed) advice.push(`  ${url}`)
  return advice
}

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

/** Same shim as `run`, but keeps the output so the caller can read the answer. */
function runCapture(command, args, cwd) {
  const joined = WINDOWS ? [command, ...args].join(' ') : command
  return spawnSync(joined, WINDOWS ? [] : args, { cwd, encoding: 'utf8', shell: WINDOWS })
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

  // Ask the registry who we are before packing anything. A logged-out shell makes
  // `npm publish` answer 404, which is indistinguishable from the registry saying
  // no, and the fix (`npm login`) is cheaper than a failed publish run.
  const whoami = runCapture('npm', ['whoami'], ROOT)
  const authProblems = publishAuthProblems(whoami)
  if (authProblems.length > 0) {
    const reporter = dryRun ? console.warn : console.error
    reporter(dryRun ? 'the shell is not logged in (a real publish would stop here):' : 'publish refused:')
    for (const problem of authProblems) reporter(`  - ${problem}`)
    if (!dryRun) return 2
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
      // The publish output is captured rather than inherited: the registry puts
      // the EOTP instructions (including the authenticator URL) on stderr, and
      // advice that cannot quote that URL is advice the operator cannot follow.
      const result = runCapture('npm', args, cwd)
      if (result.stdout) process.stdout.write(String(result.stdout))
      if (result.stderr) process.stderr.write(String(result.stderr))
      if (result.status !== 0) {
        if (result.error !== undefined) console.error(`\nspawn error: ${result.error.message}`)
        console.error(`\nstopped: npm exited ${result.status ?? 'without a status'} in ${relative}`)
        const twoFactor = otpAdvice(result.status, result.stderr)
        for (const line of twoFactor.length > 0 ? twoFactor : npmFailureAdvice(result.status)) console.error(line)
        return result.status ?? 1
      }
    }
  } finally {
    rmSync(staging, { force: true, recursive: true })
  }

  if (dryRun) {
    console.log('\ndry run finished. Nothing was sent to the registry.')
  } else {
    console.log('\nboth packages published. Next: node scripts/record_publish.mjs --stamp <ISO> --retries 3')
  }
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main()
}
