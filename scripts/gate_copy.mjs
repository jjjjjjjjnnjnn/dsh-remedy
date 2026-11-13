#!/usr/bin/env node
/**
 * Gate: externally visible text is traceable to the fact pack and unchanged.
 *
 * The old gate checked a proxy — "the pinned external model wrote it" — because
 * that model was the only thing that could not invent a number: it was handed the
 * fact pack and told not to use anything else. The channel is gone (no model CLI
 * is invoked any more), so the gate now checks the property itself, one level
 * closer to what a reader cares about:
 *
 *  - every prose number exists in the fact pack (URLs, code fences and inline
 *    code are excluded, so badge URLs and commands do not trip it);
 *  - no placeholder survives;
 *  - the bytes on disk match the recorded hash;
 *  - the recorded fact pack is the current one (a frozen release record is
 *    exempt: it describes one published page and must not be rewritten);
 *  - the recorded writer is one of the accepted channels, so "voice" stays
 *    attributable without dictating what an author may write.
 *
 * Negative control: `--mutate` corrupts the stored hash, so a gate that stopped
 * comparing bytes goes red instead of quietly passing.
 */

import { exists, readJson, readText, runGate, sha256 } from './lib/kit.mjs'
import { hasPlaceholder, unknownNumbers, WRITERS } from './lib/copy-policy.mjs'

await runGate('copy', async ({ checks, mutate }) => {
  const manifest = readJson('docs/copy/manifest.json')
  const facts = readText('docs/copy/facts/public-repo-facts.md')
  const factsHash = sha256(facts)

  const entries = Array.isArray(manifest.entries) ? manifest.entries : []
  checks.require('entries-present', entries.length > 0, `${entries.length} entry(ies)`)

  const writers = new Set(Object.values(WRITERS))
  checks.add(
    'writer-recorded',
    manifest.model_default === WRITERS.inSession,
    `model_default must be ${WRITERS.inSession}, got ${String(manifest.model_default)}`,
  )

  for (const entry of entries) {
    checks.add(`target-exists:${entry.name}`, exists(entry.target), entry.target)
    if (!exists(entry.target)) continue

    const text = readText(entry.target)
    const actual = sha256(text)
    const expected = mutate ? `${actual.slice(0, -1)}0` : entry.output_sha256
    checks.add(`bytes:${entry.name}`, actual === expected, `${String(expected).slice(0, 12)}… vs ${actual.slice(0, 12)}…`)

    // A frozen entry is a record of one published release (the GitHub release
    // notes), not a description of the current pack. It must still match its own
    // bytes, but it cannot be required to track a pack that has moved on: that
    // would mean silently rewriting a page that is already public.
    const frozen = typeof entry.frozen_at === 'string'
    checks.add(
      `facts-current:${entry.name}`,
      frozen || entry.facts_sha256 === factsHash,
      frozen ? 'frozen release record' : entry.facts_sha256 === factsHash ? '' : 'fact pack changed; regenerate this artifact',
    )

    checks.add(
      `writer:${entry.name}`,
      frozen ? writers.has(String(entry.model)) : String(entry.model) === WRITERS.inSession,
      frozen
        ? `frozen record keeps its original writer ${String(entry.model)}`
        : `live entries must be written ${WRITERS.inSession}, got ${String(entry.model)}`,
    )

    if (entry.target.endsWith('.md')) {
      checks.add(`no-placeholder:${entry.name}`, !hasPlaceholder(text), hasPlaceholder(text) ? 'placeholder token found' : '')
    }

    const extra = unknownNumbers(text, facts)
    checks.add(
      `numbers:${entry.name}`,
      frozen || extra.length === 0,
      frozen
        ? 'frozen release record: its own page, its own numbers'
        : extra.length === 0 ? 'every prose number is in the fact pack' : `not in facts: ${extra.join(', ')}`,
    )
  }

  for (const required of [
    'README.md',
    'README.zh-CN.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CODE_OF_CONDUCT.md',
    'CHANGELOG.md',
    // The two pages npm renders are outward text too (P-0024): they used to be
    // hand-written and outside the manifest, so their bytes and numbers had no
    // mechanism even after P-0017 added a prose test.
    'packages/plugin/README.md',
    'packages/core/README.md',
  ]) {
    checks.add(`covered:${required}`, entries.some((entry) => entry.target === required), required)
  }

  const metadata = readJson('docs/copy/repo-metadata.json')
  checks.add('metadata-description-length', typeof metadata.description === 'string' && metadata.description.length <= 160, `${String(metadata.description).length} chars`)
  checks.add('metadata-topics', Array.isArray(metadata.topics) && metadata.topics.length >= 8 && metadata.topics.length <= 12, `${metadata.topics?.length ?? 0} topics`)
  checks.add('metadata-topics-shape', (metadata.topics ?? []).every((topic) => /^[a-z0-9-]+$/.test(topic)), 'lowercase, hyphenated')

  const pluginPkg = readJson('packages/plugin/package.json')
  const corePkg = readJson('packages/core/package.json')
  checks.add('plugin-description', pluginPkg.description === metadata.plugin_description, 'package.json must carry the recorded description')
  checks.add('core-description', corePkg.description === metadata.core_description, 'package.json must carry the recorded description')

  // The manifest itself must not be a stale artifact of a different fact pack.
  // Frozen release records are exempt for the reason stated above.
  checks.add(
    'manifest-facts',
    entries.every((entry) => typeof entry.frozen_at === 'string' || entry.facts_sha256 === factsHash),
    'every live entry must cite the current fact pack',
  )
})
