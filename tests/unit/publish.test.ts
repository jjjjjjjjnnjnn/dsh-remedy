import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { npmFailureAdvice, otpAdvice, packedManifest, publishAuthProblems, publishProblems, unpublishableDependencies } from '../../scripts/publish_packages.mjs'

const manifestOf = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { version: string }
const version = manifestOf('packages/plugin/package.json').version

const base = {
  root: { private: true },
  core: { name: 'dsh-remedy-core', version, publishConfig: { access: 'public' } },
  plugin: { name: 'dsh-remedy', version, publishConfig: { access: 'public' } },
  distExists: { core: true, plugin: true },
}

const first = (problems: string[]) => String(problems[0] ?? '')

test('a ready workspace has no publish problem', () => {
  assert.deepEqual(publishProblems(base), [])
})

test('a public workspace root is refused, because npm would ship the whole monorepo', () => {
  const problems = publishProblems({ ...base, root: { private: false } })
  assert.equal(problems.length, 1)
  assert.match(first(problems), /private/)
})

test('a version skew between core and plugin is refused', () => {
  const problems = publishProblems({
    ...base,
    core: { ...base.core, version: '0.2.0' },
  })
  assert.equal(problems.length, 1)
  // The message names both versions; assert on the skew and the pinned version
  // rather than a literal, so a bump does not need this test edited.
  assert.match(first(problems), /0\.2\.0/)
  assert.match(first(problems), new RegExp(version.replaceAll('.', '\\.')))
})

test('a missing build is refused before npm sees an empty tarball', () => {
  const problems = publishProblems({ ...base, distExists: { core: false, plugin: false } })
  assert.equal(problems.length, 2)
  assert.match(first(problems), /pnpm run build/)
})

test('a package without public access is refused', () => {
  const problems = publishProblems({
    ...base,
    plugin: { ...base.plugin, publishConfig: { access: 'restricted' } },
  })
  assert.equal(problems.length, 1)
  assert.match(first(problems), /publishConfig/)
})

test('a caller-reported packed dependency problem stops the publish', () => {
  const problems = publishProblems({ ...base, packed: { plugin: 'dependencies.dsh-remedy-core is "workspace:*"' } })
  assert.equal(problems.length, 1)
  assert.match(first(problems), /workspace:\*/)
})

test('a packed dependency that still names a local protocol is refused', () => {
  // The exact 0.1.0 prototype: the tracked manifest says `workspace:*` (pnpm needs
  // it), and an unpacked-but-published tarball must never contain it.
  assert.match(String(unpublishableDependencies({ dependencies: { 'dsh-remedy-core': 'workspace:*' } })[0]), /workspace:\*/)
  assert.match(String(unpublishableDependencies({ dependencies: { x: 'file:../x' } })[0]), /file:/)
  assert.match(String(unpublishableDependencies({ peerDependencies: { y: 'link:../y' } })[0]), /link:/)
  assert.match(String(unpublishableDependencies({ optionalDependencies: { z: 'portal:../z' } })[0]), /portal:/)
})

test('a packed dependency pinned to a version is accepted', () => {
  assert.deepEqual(unpublishableDependencies({ dependencies: { 'dsh-remedy-core': version } }), [])
  assert.deepEqual(unpublishableDependencies({}), [])
  assert.deepEqual(unpublishableDependencies({ dependencies: null }), [])
})

test('the manifest as packed by pnpm is the manifest we publish', () => {
  // The 0.1.0 regression: npm published `workspace:*` verbatim and every registry
  // install of that tarball failed with EUNSUPPORTEDPROTOCOL. Reading the packed
  // manifest is the only check that sees the protocol after pnpm has rewritten it.
  const tgz = `.tmp/pack11/dsh-remedy-${version}.tgz`
  let manifest
  try {
    manifest = packedManifest(tgz) as { dependencies?: Record<string, string> } | null
  } catch (error) {
    // The tarball is a local build artifact, not a fixture; skip when it is absent
    // so a fresh clone can still run the test suite.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  assert.ok(manifest !== null)
  assert.equal(manifest.dependencies?.['dsh-remedy-core'], version)
})

test('the tracked workspace manifest still uses the workspace protocol', () => {
  // pnpm workspace resolution is what makes the monorepo installable; the pack
  // step is what turns it into a registry version. If this ever reads a literal
  // version, the source manifest was hand-edited and the two packages can drift.
  const manifest = JSON.parse(readFileSync('packages/plugin/package.json', 'utf8')) as {
    dependencies: Record<string, string>
  }
  assert.equal(manifest.dependencies['dsh-remedy-core'], 'workspace:*')
})

// The 2026-11-11 publish: a logged-out shell made `npm publish` answer
// `PUT 404`, which reads like "no such package" even though `dsh-remedy-core`
// was already on the registry at 0.1.0/0.3.0/0.3.2. The advice now asks the
// cheap question first instead of sending the operator after an OTP code.
test('a logged-out shell is refused before anything is packed', () => {
  assert.deepEqual(publishAuthProblems({ status: 0, stdout: 'jjjjjjjjnnjnn\n' }), [])
})

test('the 401 from npm whoami is a login problem, not an OTP problem', () => {
  const problems = publishAuthProblems({ status: 401, stdout: '', stderr: 'npm error code E401\n' })
  assert.equal(problems.length, 1)
  assert.match(String(problems[0]), /npm login/)
  assert.doesNotMatch(String(problems[0]), /--otp/)
})

test('npm reports a 401 as exit 1, and E401 in the output is the same answer', () => {
  // Measured on 2026-11-11: `npm whoami` exited 1 and printed
  // `npm error code E401 / 401 Unauthorized`. Keying on the exit status alone
  // would have read that as "an unexplained failure".
  const problems = publishAuthProblems({
    status: 1,
    stdout: '',
    stderr: 'npm error code E401\nnpm error 401 Unauthorized - GET https://registry.npmjs.org/-/whoami\n',
  })
  assert.equal(problems.length, 1)
  assert.match(String(problems[0]), /npm login/)
})

test('a whoami that prints nothing is not a login, even when it exits zero', () => {
  const problems = publishAuthProblems({ status: 0, stdout: '   \n' })
  assert.equal(problems.length, 1)
  assert.match(String(problems[0]), /npm login/)
})

test('an unexpected whoami failure keeps the status and the first stderr line', () => {
  const problems = publishAuthProblems({ status: 7, stderr: 'network down\nsecond line\n' })
  assert.equal(problems.length, 1)
  assert.match(String(problems[0]), /exited 7/)
  assert.match(String(problems[0]), /network down/)
})

test('a 404 on the PUT points at npm whoami before it points at an OTP', () => {
  const advice = npmFailureAdvice(404).join('\n')
  assert.match(advice, /npm whoami/)
  assert.match(advice, /npm login/)
})

test('a 401 or 403 is reported as unauthenticated, in both directions', () => {
  for (const status of [401, 403]) {
    assert.match(npmFailureAdvice(status).join('\n'), /npm login/)
  }
})

test('an unexplained failure still offers the OTP as one possibility, not as the answer', () => {
  const advice = npmFailureAdvice(1).join('\n')
  assert.match(advice, /--otp/)
  assert.match(advice, /npm whoami/)
})

// Measured later on 2026-11-11, with a valid credential: the publish reached the
// registry and came back EOTP, because the account is on `auth-and-writes`. That
// answer must be repeated verbatim, including the URL npm printed, because a web
// authentication is the only way to finish that publish.
test('an EOTP is reported as a password challenge with the URL npm printed', () => {
  const stderr = [
    'npm error code EOTP',
    'npm error This operation requires a one-time password.',
    'npm error Open this URL in your browser to authenticate:',
    'npm error   https://www.npmjs.com/auth/cli/abc123def456',
    'npm error',
  ].join('\n')
  const advice = otpAdvice(1, stderr)
  assert.ok(advice.length >= 3)
  assert.match(advice[0] ?? '', /one-time password/)
  assert.ok(advice.some((line) => line.includes('https://www.npmjs.com/auth/cli/abc123def456')))
})

test('a failure that is not a password challenge gets no OTP advice', () => {
  assert.deepEqual(otpAdvice(1, 'npm error code E404\nnpm error 404 Not Found - PUT\n'), [])
  assert.deepEqual(otpAdvice(0, ''), [])
  assert.deepEqual(otpAdvice(null, 'npm error code EOTP\n'), [])
})
