import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * P-0026 — the release procedure had two homes, and the older one taught the
 * command that had already failed once.
 *
 * `docs/PUBLISH.md` was rewritten in R35 to the procedure this repository
 * actually uses: `scripts/publish_packages.mjs` packs both packages, reads the
 * packed manifest back out of the tarball and refuses to publish a `workspace:*`
 * dependency, and the token in this environment bypasses the one-time password.
 * `docs/HANDOFF.md` still carried its own copy of the old procedure —
 * `pnpm --filter dsh-remedy publish`, "OTP required, the token does not bypass
 * 2FA" — plus a `明确边界` section that said the two profiles pointed at
 * `.tmp/pack17/dsh-remedy-0.3.5.tgz` and that npm `latest` was `0.3.5`.
 *
 * Nothing read either section: `handoff-truth.test.ts` checks the status table
 * and "第一件事", and these two sections sit after the evidence index. So the
 * handoff could describe a release procedure that publish_packages.mjs exists to
 * replace, and a release nobody is running, while every gate stayed green.
 *
 * The three rules below are deliberately about **shape**, because that is the
 * part a test can enforce honestly:
 *
 *   1. the handoff may not restate a publish procedure — it points at one;
 *   2. every flag the documents pass to `publish_packages.mjs` must be a flag
 *      that script reads;
 *   3. a boundary section may not cite a `.tmp/` path (a clone cannot open one)
 *      or a `latest` that is not the version the packages ship.
 */

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const readJson = <T>(path: string) => JSON.parse(read(path)) as T

const handoff = read('docs/HANDOFF.md')
const publishDoc = read('docs/PUBLISH.md')
const publishScript = read('scripts/publish_packages.mjs')
const plugin = readJson<{ version: string }>('packages/plugin/package.json')

/** The text between one `## ` heading and the next, or the rest of the file. */
function section(document: string, heading: string): string | null {
  const start = document.indexOf(heading)
  if (start < 0) return null
  const rest = document.slice(start + heading.length)
  const end = rest.search(/\n## /)
  return end < 0 ? rest : rest.slice(0, end)
}

/** Commands and claims that a repository which uses publish_packages.mjs retired. */
export function retiredProcedure(text: string): string[] {
  const rules: Array<{ pattern: RegExp; what: string }> = [
    { pattern: /pnpm\s+--filter\s+dsh-remedy(?:-core)?\s+publish/, what: 'pnpm --filter publish (publishes the source manifest, not the packed tarball)' },
    { pattern: /--no-git-checks/, what: '--no-git-checks (only the retired pnpm path needed it)' },
    { pattern: /token\s*(?:不绕过|does not bypass|doesn't bypass)\s*2FA/i, what: 'a claim that the token cannot bypass 2FA' },
    { pattern: /(?:需要|needs)\s*(?:npm\s*)?OTP[；;]\s*token/, what: 'OTP as an unconditional requirement' },
  ]
  const offenders: string[] = []
  for (const line of text.split(/\r?\n/)) {
    for (const rule of rules) {
      if (rule.pattern.test(line)) offenders.push(`${rule.what}: ${line.trim().slice(0, 100)}`)
    }
  }
  return offenders
}

/** Flags a document passes to publish_packages.mjs that the script never reads. */
export function unknownPublishFlags(text: string, supported: readonly string[]): string[] {
  const allowed = new Set(supported)
  const unknown: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf('publish_packages.mjs')
    if (at < 0) continue
    // Only the argument list attached to this command: a line that names the
    // script and then another command's flags is not a claim about this one.
    const tail = line.slice(at + 'publish_packages.mjs'.length)
    const stop = tail.search(/[`；;，,）)]|\s#/)
    const args = stop < 0 ? tail : tail.slice(0, stop)
    for (const match of args.matchAll(/--[a-z][a-z0-9-]*/g)) {
      const flag = match[0]
      if (!allowed.has(flag)) unknown.push(`${flag} in: ${line.trim().slice(0, 100)}`)
    }
  }
  return unknown
}

/** What `publish_packages.mjs` actually reads off `process.argv`. */
function supportedPublishFlags(script: string): string[] {
  const flags = new Set<string>()
  for (const match of script.matchAll(/process\.argv\.includes\('(--[a-z][a-z-]*)'\)/g)) flags.add(match[1] as string)
  for (const match of script.matchAll(/flag\('([a-z][a-z-]*)'/g)) flags.add(`--${match[1]}`)
  return [...flags].sort()
}

test('the publish flags the documents name are the flags the script reads', () => {
  const supported = supportedPublishFlags(publishScript)
  assert.deepEqual(supported, ['--dry-run', '--otp'], 'the script reads two flags; a third needs a test that names it')
  assert.deepEqual(unknownPublishFlags(publishDoc, supported), [], 'docs/PUBLISH.md names a publish flag the script does not read')
  assert.deepEqual(unknownPublishFlags(handoff, supported), [], 'docs/HANDOFF.md names a publish flag the script does not read')

  // The checker must not be vacuously green: a flag nobody reads has to be caught.
  const injected = unknownPublishFlags('node scripts/publish_packages.mjs --otp2 <code>', supported)
  assert.equal(injected.length, 1, 'a made-up flag must be reported, or the rule above proves nothing')
})

test('the handoff points at the one publish procedure instead of restating it', () => {
  assert.deepEqual(retiredProcedure(handoff), [], 'the handoff restates a release procedure this repository retired')

  // …and a retired claim in the docs would be caught too, so the rule above is
  // not a rule about one string.
  const injected = retiredProcedure('npm publish 之前一律传 --no-git-checks，先 core 再 plugin')
  assert.ok(injected.length > 0, 'the retired-procedure rule must catch its own example')

  const procedure = section(handoff, '## 发布流程')
  assert.notEqual(procedure, null, 'the handoff must keep a 发布流程 section so a successor can find the procedure')
  assert.match(procedure as string, /docs\/PUBLISH\.md/, 'the procedure section must point at docs/PUBLISH.md')
  assert.doesNotMatch(procedure as string, /```/, 'a second command block is a second procedure; keep the steps in one file')
})

test('the boundary section cites no scratch path and no stale latest', () => {
  const boundary = section(handoff, '## 明确边界')
  assert.notEqual(boundary, null, 'the handoff must keep a 明确边界 section')

  // `.tmp/` is gitignored, so a boundary statement that names a file there is a
  // claim a fresh clone cannot check. It is also how the section kept saying the
  // profiles pointed at a tarball three releases old.
  const scratch = [...(boundary as string).matchAll(/\.tmp\/[^\s`）)]*/g)].map((match) => match[0])
  assert.deepEqual(scratch, [], `the boundary section cites gitignored scratch paths: ${scratch.join(', ')}`)

  // Any `latest` claim must name the version the packages ship. The regex is
  // anchored on the word itself so a historical release note cannot trip it.
  const claimed = [...(boundary as string).matchAll(/latest[^0-9]{0,20}(\d+\.\d+\.\d+)/gi)].map((match) => match[1] as string)
  for (const version of claimed) {
    assert.equal(version, plugin.version, `the boundary section claims latest is ${version}; the packages ship ${plugin.version}`)
  }
})
