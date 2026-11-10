#!/usr/bin/env node
/**
 * Gate: the patch registry is the truth, and every claim resolves.
 *
 * Checks:
 *  - `registryProblems()` is empty (ids, surfaces, evidence, guards, status rules);
 *  - every evidence and guard path exists on disk;
 *  - `audit/patch_ledger.json` names the same patches with the same status;
 *  - the newest `data/results/patch-registry-*.json` is a byte-exact snapshot of
 *    the built registry, so editing `registry.ts` without re-recording is red;
 *  - the snapshot's `.sha256` matches.
 *
 * Negative control: `--mutate` appends a duplicate patch, which the same checks
 * must catch.
 */

import { fileUrl, exists, listDir, readJson, readText, runGate, sha256 } from './lib/kit.mjs'

await runGate('registry', async ({ checks, mutate }) => {
  const core = await import(fileUrl('packages/core/dist/index.js'))
  const patches = mutate ? [...core.PATCHES, { ...core.PATCHES[0] }] : core.PATCHES

  const problems = core.registryProblems(patches)
  checks.require('registry-problems', problems.length === 0, problems.map((item) => `${item.patch}: ${item.problem}`).join('; '))

  for (const patch of patches) {
    for (const path of [...patch.evidence, ...patch.guards]) {
      checks.add(`exists:${patch.id}:${path}`, exists(path), path)
    }
  }

  const ledger = readJson('audit/patch_ledger.json')
  const ledgerPatches = Array.isArray(ledger.patches) ? ledger.patches : []
  const ledgerIds = ledgerPatches.map((item) => item.id).sort()
  const registryIds = core.PATCHES.map((item) => item.id).sort()
  checks.add('ledger-ids', JSON.stringify(ledgerIds) === JSON.stringify(registryIds), `${ledgerIds.join(',')} vs ${registryIds.join(',')}`)
  for (const item of ledgerPatches) {
    const patch = core.PATCHES.find((candidate) => candidate.id === item.id)
    checks.add(`ledger-status:${item.id}`, patch !== undefined && patch.status === item.status, `${item.status} vs ${patch?.status ?? 'missing'}`)
  }

  // Pick by the stamp inside the file, not by filename: `2026-11-10T08-40-00.000Z`
  // and `2026-11-10T08:40:00.000Z` sort differently as strings but are the same
  // instant, and a stale-but-last-by-name snapshot would silently pass.
  const snapshots = listDir('data/results')
    .filter((entry) => entry.isFile && /^patch-registry-.*\.json$/.test(entry.name))
    .map((entry) => ({
      path: `data/results/${entry.name}`,
      at: stampOf(readJson(`data/results/${entry.name}`)),
    }))
    .filter((entry) => entry.at !== '')
    .sort((a, b) => a.at.localeCompare(b.at) || a.path.localeCompare(b.path))
  const latest = snapshots.at(-1)?.path
  checks.require('snapshot-present', latest !== undefined, 'no data/results/patch-registry-*.json')

  if (latest !== undefined) {
    const text = readText(latest)
    const payload = JSON.parse(text)
    const expected = JSON.stringify(core.patchRegistrySnapshot().patches)
    const actual = JSON.stringify(payload.patches)
    checks.add(
      'snapshot-matches',
      !mutate && expected === actual,
      mutate ? 'injected duplicate patch must not match the snapshot' : 'registry.ts differs from the recorded snapshot',
    )
    checks.add('snapshot-schema', payload.schema_version === 1, String(payload.schema_version))
    const sidecarText = safeRead(`${latest}.sha256`)
    const sidecar = sidecarText === null ? null : sidecarText.trim().split(/\s+/)[0]
    checks.add(
      'snapshot-hash',
      sidecar !== null && sidecar === sha256(text),
      sidecar === null ? `missing ${latest}.sha256` : `${sidecar.slice(0, 12)}… vs ${sha256(text).slice(0, 12)}…`,
    )
  }
})

function safeRead(path) {
  try {
    return readText(path)
  } catch {
    return null
  }
}

function stampOf(payload) {
  return typeof payload?.generated_at === 'string' ? payload.generated_at : ''
}
