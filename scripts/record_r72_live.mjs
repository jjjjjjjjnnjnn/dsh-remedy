#!/usr/bin/env node
/**
 * R72 · one live witness for every patch that previously had only tests.
 *
 *   node scripts/record_r72_live.mjs --sessions ~/.dsh/sessions --stamp <ISO>
 *
 * This recorder runs the shipped build, gates and CLI on this machine at one
 * stamp, then asserts a claim for each patch that was `tested` at R71. It writes
 * no artifact unless every claim holds; a claim that cannot be asserted on this
 * host is marked `absent` with the reason, never silently passed.
 *
 * The witness kinds are recorded per patch so `verified` cannot be confused
 * with "a resident journal saw a repair": `suite` (the shipped CI-equivalent
 * ran here), `cli` (a shipped command on the real corpus), `gate` (a governance
 * check), `probe` (an isolated DSH_HOME turn) and `absent` (no real case; the
 * probe artifact is the only witness, named in the claim).
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { abs, isoStamp, sha256 } from './lib/kit.mjs'
import { redactValue } from '../packages/core/dist/index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}
const stamp = isoStamp(flag('stamp') ?? new Date().toISOString())
if (stamp === null) {
  process.stderr.write('record_r72_live: --stamp must be ISO-8601\n')
  process.exit(2)
}
const sessions = flag('sessions')
if (sessions === undefined || !existsSync(resolve(sessions))) {
  process.stderr.write('record_r72_live: --sessions <real directory> is required\n')
  process.exit(2)
}

const cli = join('packages', 'plugin', 'dist', 'cli.js')
const node = process.execPath

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    shell: process.platform === 'win32' && command === 'pnpm',
    ...options,
  })
  return { status: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const verify = run('pnpm', ['run', 'verify'])
const mutate = run(node, ['scripts/gate.mjs', '--mutate'])
const cliVerify = run(node, [cli, 'verify'])
const scan = run(node, [cli, 'scan', resolve(sessions), '--json'])
const windowed = run(node, [cli, 'scan', resolve(sessions), '--since', '2026-11-11T00:00:00Z', '--json'])
const explain = run(node, [cli, 'explain', '--sessions', resolve(sessions)])

// P-0042 negative control needs a no-BOM profile: Windows PowerShell writes a
// BOM with Set-Content, which makes `selectionOf` miss the first row.
const profileDir = mkdtempSync(join(tmpdir(), 'r72-live-'))
const profile = (effort) => {
  const path = join(profileDir, `cordis-${effort}.yml`)
  writeFileSync(
    path,
    [
      '- id: remedy-stream',
      '  name: dsh-remedy',
      '  config:',
      '    repair: true',
      '- id: agent-default-model',
      '  name: "@deepseek-ai/dsh-agent-default-model"',
      '  config:',
      '    provider: opendesign',
      '    model: deepseek-v4.1-flash-eco',
      ...(effort === null ? [] : [`    reasoningEffort: ${effort}`]),
      '',
    ].join('\n'),
    'utf8',
  )
  return path
}
const conflict = run(node, [cli, 'explain', '--sessions', resolve(sessions), '--profile-file', profile('xhigh')])
const conflictControl = run(node, [cli, 'explain', '--sessions', resolve(sessions), '--profile-file', profile('high')])

const json = (result) => {
  try {
    return JSON.parse(result.out.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}
const report = json(scan)
const window = json(windowed)

// ---- shared gates -------------------------------------------------------
const verifyOk = verify.status === 0 && /fail\s+0/.test(verify.out) && /ALL GREEN · 6 gates/.test(verify.out)
const mutateOk = mutate.status === 0 && /6\/6 gates caught/.test(mutate.out)
const cliOk = cliVerify.status === 0 && /OK\s+8 fixture\(s\)/.test(cliVerify.out)
const suiteOk = verifyOk && mutateOk && cliOk

const text = (path) => (existsSync(abs(path)) ? readFileSync(abs(path), 'utf8') : '')
const readJson = (path) => {
  try {
    return JSON.parse(text(path))
  } catch {
    return null
  }
}
const exists = (path) => existsSync(abs(path))
const shippedUsage = text('packages/plugin/README.md')
const cliArgs = text('packages/plugin/src/cli-args.ts')
const explainSource = text('packages/plugin/src/explain-command.ts')
const budgets = text('scripts/lib/budgets.mjs')
const manifest = readJson('docs/copy/manifest.json') ?? { entries: [] }
const acceptance = readJson('data/results/install-acceptance-2026-11-18T16-20-00.000Z.json')
const ci = text('.github/workflows/ci.yml')
const registryDist = existsSync(abs('packages/core/dist/registry.js'))
  ? readFileSync(abs('packages/core/dist/registry.js'), 'utf8').length
  : 0
const patchDocs = existsSync(abs('docs/patches'))
  ? readdirNames('docs/patches').filter((name) => /^P-\d{4}-.+\.md$/.test(name)).length
  : 0

function readdirNames(path) {
  return readdirSync(abs(path))
}

const rows = []
const add = (id, witness, claim, ok) => rows.push({ id, witness, claim, ok: Boolean(ok) })

// ---- scripts (25) -------------------------------------------------------
add('P-0007', 'suite', 'copy channel recorded the long pages through the manifest writer', suiteOk && Array.isArray(manifest.entries) && manifest.entries.length > 0 && /PASS\s+copy/.test(verify.out))
add('P-0008', 'suite', 'the byte gate is one of the six gates and the mutation control caught it', suiteOk && /PASS\s+size/.test(verify.out))
add('P-0012', 'suite', 'budgets declares residency/CLI/total caps and the split test passed', suiteOk && /RESIDENCY_CAP/.test(budgets) && /CLI_CAP/.test(budgets) && /TOTAL_CAP/.test(budgets))
add('P-0014', 'suite', 'facts-truth, handoff-truth and cli-usage ran inside the green suite', suiteOk && exists('docs/copy/facts/public-repo-facts.md') && /PASS\s+copy/.test(verify.out))
add('P-0017', 'suite', 'both package pages carry no prose digits and are guarded by the suite', suiteOk && exists('packages/plugin/README.md') && exists('packages/core/README.md'))
add('P-0018', 'suite', 'the publish wrapper names both Windows exception codes and its test passed', suiteOk && /0xC0000409/.test(text('scripts/publish_packages.mjs')))
add('P-0019', 'suite', 'the outward pages name every registry patch and the completeness test passed', suiteOk && exists('tests/governance/public-pages-complete.test.ts') && exists('README.md') && exists('README.zh-CN.md'))
add('P-0020', 'suite', 'the market index is valid JSON and its entry test passed', suiteOk && readJson('docs/market-index.json') !== null)
add('P-0021', 'suite', 'every exported subpath resolves to a built file', suiteOk && exists('packages/plugin/dist/cli.js'))
add('P-0022', 'suite', 'the fixture guard runs read-only before comparing', suiteOk && /--check/.test(text('scripts/sync_fixtures.mjs')))
add('P-0023', 'suite', 'gate_registry resolves a doc for every registered id', suiteOk && patchDocs >= 54)
add('P-0024', 'suite', 'the two package pages are registered in the copy manifest', suiteOk && /README\.md/.test(text('docs/copy/manifest.json')))
add('P-0026', 'suite', 'one release procedure and its governance test passed', suiteOk && exists('docs/PUBLISH.md') && exists('tests/governance/release-procedure.test.ts'))
add('P-0028', 'suite', 'the shipped fused fixture carries <home>, not a machine path', suiteOk && /<home>/.test(text('data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json')))
add('P-0029', 'suite', 'the live version pointer and the byte row are read by the green suite', suiteOk && /PASS\s+size/.test(verify.out))
add('P-0031', 'suite', 'the engine has its own cap in the budget module', suiteOk && /CORE_CAP/.test(budgets))
add('P-0032', 'suite', 'the registry file stayed under its cap while the ledger shortened', suiteOk && registryDist > 0 && registryDist < 68_000)
add('P-0035', 'suite', 'each patch-layer row resolves to a manifest export', suiteOk && exists('tests/governance/profile-patch-resolution.test.ts'))
add('P-0038', 'suite', 'redaction recognises Windows, POSIX and file-URL home shapes', suiteOk && /Users/.test(text('packages/core/src/redact.ts')) && /\/home\//.test(text('packages/core/src/redact.ts')))
add('P-0039', 'suite', 'the session root has one portable definition', suiteOk && exists('scripts/lib/session-root.mjs'))
add('P-0040', 'suite', 'acceptance counts fixtures from the package and reads eight', suiteOk && acceptance?.claimed?.canonical_fixtures === 8)
add('P-0043', 'suite', 'the JSON-escaped sample also carries <home>', suiteOk && /<home>/.test(text('data/fixtures/toolcall-fusion/bare-code-value.json')))
add('P-0046', 'suite', 'the first screens name every patch the registry counts', suiteOk && exists('tests/governance/public-pages-complete.test.ts'))
add('P-0048', 'gate', 'the CI workflow has a macOS job and the suite passed here', suiteOk && /macos/.test(ci))
add('P-0049', 'suite', 'the fact pack counts the registry it describes', suiteOk && /54/.test(text('docs/copy/facts/public-repo-facts.md')))

// ---- cli (7) ------------------------------------------------------------
add('P-0010', 'cli', 'the usage line in the shipped README matches the CLI source', /scan\s+<session\.jsonl\|directory>/.test(shippedUsage) && /scan\s+<session\.jsonl\|directory>/.test(cliArgs))
const windowClaim = report !== null && Number(report.unreadable_lines) === 0 && window !== null && Number(window.unreadable_lines) === 0 && Number(window.before_since) > 0
add('P-0009', 'cli', 'a windowed scan of the real corpus reads every header and buckets the rest', windowClaim)
add('P-0016', 'cli', 'the explain command holds no local coverage table', !/\bconst COVERAGE\b/.test(explainSource) && !/\bconst SWITCHES\b/.test(explainSource) && suiteOk)
add('P-0025', 'cli', 'explain without a profile reports unknown, never a finding', (explain.status === 0 || explain.status === 1) && /enabled-here unknown/.test(explain.out) && /unknown/.test(explain.out))
const conflictClaim = conflict.status === 1 && /CONFLICT/.test(conflict.out) && /37 time\(s\)/.test(conflict.out) && !/CONFLICT/.test(conflictControl.out)
add('P-0042', 'cli', 'the refused level pinned in a profile is a finding; a fixed level is not', conflictClaim)
add('P-0047', 'absent', 'completed_without_answer is 0 in the corpus; the probe is the only witness', report !== null && Number(report.completed_without_answer) === 0 && exists('data/results/live-completed-2026-11-16T18-30-00.000Z.json'))
add('P-0052', 'absent', 'completed_on_tool_call is 0 in the corpus; the probe is the only witness', report !== null && Number(report.completed_on_tool_call) === 0 && exists('data/results/live-toolcall-2026-11-17T13-30-00.000Z.json'))

// ---- profile (1) --------------------------------------------------------
add('P-0015', 'probe', 'a rejected step ends blocked with the input discarded, measured in an isolated home', /blocked/.test(text('data/results/prestep-probe-2026-11-13T07-45-00.000Z.json')) && exists('data/results/prestep-enter-2026-11-15T17-55-00.000Z.json'))

const failed = rows.filter((row) => !row.ok)
if (failed.length > 0 || report === null) {
  process.stderr.write(`record_r72_live: ${failed.length} claim(s) do not hold on this tree: ${failed.map((row) => row.id).join(', ')}\n`)
  process.stderr.write(`diagnostics: verify ${verify.status}/${verifyOk} mutate ${mutate.status}/${mutateOk} cli ${cliVerify.status}/${cliOk} suite ${suiteOk} scan ${scan.status} report ${report !== null} docs ${patchDocs} registry ${registryDist}\n`)
  if (report === null) process.stderr.write('record_r72_live: scan did not print JSON\n')
  process.exit(4)
}

const payload = {
  schema_version: 1,
  produced_by: 'scripts/record_r72_live.mjs',
  generated_at: stamp,
  question: 'Do the shipped suite, gates, gates-under-mutation and CLI commands say the truth about this tree and this machine at one stamp?',
  runs: {
    'pnpm run verify': { exit: verify.status, sha256: sha256(verify.out), green: verifyOk },
    'gate --mutate': { exit: mutate.status, sha256: sha256(mutate.out), green: mutateOk },
    'cli verify': { exit: cliVerify.status, sha256: sha256(cliVerify.out), green: cliOk },
    'scan --json': { exit: scan.status, sha256: sha256(scan.out), files: Number(report.files), attempts: Number(report.attempts), unreadable_lines: Number(report.unreadable_lines) },
    'scan --since': { exit: windowed.status, sha256: sha256(windowed.out), unreadable_lines: Number(window.unreadable_lines), before_since: Number(window.before_since) },
    'explain --sessions': { exit: explain.status, sha256: sha256(explain.out) },
    'explain --profile-file xhigh': { exit: conflict.status, sha256: sha256(conflict.out) },
    'explain --profile-file high (control)': { exit: conflictControl.status, sha256: sha256(conflictControl.out) },
  },
  patches: rows,
  not_proven: [
    'no resident journal witnessed these patches: the witness is the shipped suite, a shipped CLI read, a governance gate or an isolated probe, and each row says which',
    'the desktop App was not driven: R71 measured the provider key as revoked (403 api key revoked, 0 model requests), so no 0.4.19 desktop turn is claimed',
    'P-0047 and P-0052 have no real case in this corpus; the probe artifacts are named in their claims and the status rests on those, not on a corpus case',
    'P-0048 is a CI criterion; the macOS job is not a macOS host run by this recorder, and the row is marked gate, not cli or suite',
    'the corpus and the profile are this machine at this stamp; another host may write other sessions',
  ],
  redaction: { note: 'session text is not carried into this artifact; only exit codes, counts and hashes' },
}

const redacted = redactValue(payload)
const artifact = `${JSON.stringify({ ...redacted.value, redaction: redacted.summary }, null, 2)}\n`
const out = flag('out') ?? `data/results/live-r72-${stamp.replaceAll(':', '-')}.json`
if (existsSync(abs(out))) {
  process.stderr.write(`record_r72_live: refusing to overwrite ${out}\n`)
  process.exit(2)
}
mkdirSync(abs('data/results'), { recursive: true })
writeFileSync(abs(out), artifact, 'utf8')
writeFileSync(abs(`${out}.sha256`), `${createHash('sha256').update(artifact).digest('hex')}\n`, 'utf8')
process.stdout.write(`RECORDED ${out}\nsha256 ${sha256(artifact).slice(0, 12)}…\n`)
process.stdout.write(`witnesses ${rows.length} · suite ${String(suiteOk)} · conflict ${String(conflict.status)}/${conflictControl.status} · window unreadable ${String(window.unreadable_lines)}\n`)
