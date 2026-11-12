import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * P-0012: the budget is split by load path, so the split itself has to be
 * falsifiable. A gate that trusts a handwritten list of "resident modules" can
 * be defeated by moving a file into the cheap bucket, which is exactly the
 * reclassification this patch forbids.
 *
 * So this test reads the source module graph instead of the list: starting from
 * the loader entry (`index.ts`, the file `package.json` points at), everything
 * reachable by a relative import is resident by definition. A CLI entry is only
 * reachable from `cli.ts`. If a new resident module appears, the test names it
 * and the budget has to pay for it.
 */

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const ENTRY = 'packages/plugin/src/index.ts'
const CLI_ENTRY = 'packages/plugin/src/cli.ts'

/** Direct relative imports, as source paths. */
function relativeImportsOf(source: string): string[] {
  const out: string[] = []
  for (const match of source.matchAll(/from\s+'\.\/([a-z0-9-]+)\.js'/g)) out.push(String(match[1]))
  for (const match of source.matchAll(/from\s+'\.\.\/([a-z0-9-]+)\/([a-z0-9-]+)\.js'/g)) {
    out.push(`${match[1]}/${match[2]}`)
  }
  return out
}

/** Every module reachable from one entry, by module name (`index`, `repair-stream`, ...). */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>()
  const visit = (module: string) => {
    if (seen.has(module)) return
    seen.add(module)
    for (const dep of relativeImportsOf(read(`packages/plugin/src/${module}.ts`))) visit(dep)
  }
  visit(entry.replace(/^packages\/plugin\/src\//, '').replace(/\.ts$/, ''))
  return seen
}

test('the residency list covers exactly what the loader entry reaches', () => {
  const reachable = reachableFrom(ENTRY)
  const budgets = read('scripts/lib/budgets.mjs')
  const declared = [...budgets.matchAll(/RESIDENCY_FILES = \[([\s\S]*?)\]/g)][0]?.[1] ?? ''
  const names = new Set([...declared.matchAll(/'([a-z0-9-]+)\.js'/g)].map((match) => String(match[1])))

  // `dsh-remedy-core` is a separate package with its own budget; only relative
  // imports inside this package can be reclassified.
  for (const module of reachable) {
    assert.ok(
      names.has(module),
      `${module}.ts is reachable from the loader entry but is not listed as residency in scripts/lib/budgets.mjs`,
    )
  }
  for (const name of names) {
    assert.ok(
      reachable.has(name),
      `${name}.js is listed as residency but the loader entry never reaches it — that is unpaid byte debt`,
    )
  }
})

test('nothing the loader reaches is also claimed as CLI-only', () => {
  const reachable = reachableFrom(ENTRY)
  const budgets = read('scripts/lib/budgets.mjs')
  const declared = [...budgets.matchAll(/CLI_FILES = \[([\s\S]*?)\]/g)][0]?.[1] ?? ''
  const cliNames = [...declared.matchAll(/'([a-z0-9-]+)\.js'/g)].map((match) => String(match[1]))
  for (const name of cliNames) {
    assert.ok(!reachable.has(name), `${name}.js is claimed as CLI-only but the loader entry reaches it`)
  }
})

test('the CLI entry does not import the resident seam', () => {
  // The CLI may read the registry and the scanner; it must not mount the stream
  // wrapper, because a CLI invocation would then pay for the hot path too.
  const cliReach = reachableFrom(CLI_ENTRY)
  assert.ok(cliReach.has('cli-args'), 'cli.ts must still use cli-args')
  assert.ok(cliReach.has('scan-command'), 'cli.ts must still use scan-command')
  assert.ok(!cliReach.has('repair-stream'), 'the CLI must not pull in the resident stream wrapper')
  assert.ok(!cliReach.has('retry-listener'), 'the CLI must not pull in the retry listener')
})

test('the budget caps add up and the owner signature is recorded', () => {
  const budgets = read('scripts/lib/budgets.mjs')
  const residency = Number.parseInt(budgets.match(/RESIDENCY_CAP = (\d+)/)?.[1] ?? '0', 10)
  const cli = Number.parseInt(budgets.match(/CLI_CAP = (\d+)/)?.[1] ?? '0', 10)
  const total = Number.parseInt(budgets.match(/TOTAL_CAP = (\d+)/)?.[1] ?? '0', 10)
  assert.ok(residency > 0 && cli > 0 && total > 0, 'all three caps must be present')
  assert.ok(residency + cli >= total, 'the two subtotals must be able to fit inside the total')
  // PROJECT_RULES 1: a threshold change needs a signature, and a signature that
  // is not in the file cannot be checked by anyone later.
  assert.match(budgets, /approved_by:/, 'the threshold change must record who approved it')
})
