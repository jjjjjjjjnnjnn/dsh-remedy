#!/usr/bin/env node
/**
 * Gate: externally visible text came from the copy channel and still matches it.
 *
 * Checks:
 *  - every manifest entry's `output_sha256` matches the file (no hand edits);
 *  - every entry's `facts_sha256` matches the current fact pack (no stale copy);
 *  - the model is the pinned copy model;
 *  - Markdown artifacts contain no placeholder tokens;
 *  - prose numbers exist in the fact pack (URLs, code fences and inline code are
 *    excluded, so badge URLs and commands do not trip the check).
 *
 * Negative control: `--mutate` corrupts the stored hash, so a gate that stops
 * comparing bytes goes red.
 */

import { createHash } from 'node:crypto'
import { exists, readJson, readText, runGate, sha256 } from './lib/kit.mjs'

const MODEL = 'gemini-3.8-flash-high'
const PLACEHOLDER = /\b(TODO|TBD|FIXME|YOUR_[A-Z_]+|lorem ipsum)\b/i

function proseNumbers(text) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
  return [...new Set(stripped.match(/\d+/g) ?? [])]
}

await runGate('copy', async ({ checks, mutate }) => {
  const manifest = readJson('docs/copy/manifest.json')
  const facts = readText('docs/copy/facts/public-repo-facts.md')
  const factsHash = sha256(facts)
  const allowed = new Set((facts.match(/\d+/g) ?? []).concat(Array.from({ length: 11 }, (_, index) => String(index))))

  const entries = Array.isArray(manifest.entries) ? manifest.entries : []
  checks.require('entries-present', entries.length > 0, `${entries.length} entry(ies)`)
  checks.add('model-pinned', manifest.model_default === MODEL, String(manifest.model_default))

  for (const entry of entries) {
    checks.add(`target-exists:${entry.name}`, exists(entry.target), entry.target)
    if (!exists(entry.target)) continue

    const text = readText(entry.target)
    const actual = sha256(text)
    const expected = mutate ? `${actual.slice(0, -1)}0` : entry.output_sha256
    checks.add(`bytes:${entry.name}`, actual === expected, `${String(expected).slice(0, 12)}… vs ${actual.slice(0, 12)}…`)
    // A frozen entry is a record of one published release (the GitHub release
    // notes), not a description of the current pack. It must still match its
    // own bytes, but it cannot be required to track a fact pack that has moved
    // on: that would mean silently rewriting a page that is already public.
    const frozen = typeof entry.frozen_at === 'string'
    checks.add(
      `facts-current:${entry.name}`,
      frozen || entry.facts_sha256 === factsHash,
      frozen ? 'frozen release record' : entry.facts_sha256 === factsHash ? '' : 'fact pack changed; regenerate this artifact',
    )
    checks.add(`model:${entry.name}`, entry.model === MODEL, String(entry.model))

    if (entry.target.endsWith('.md')) {
      const hasPlaceholder = PLACEHOLDER.test(text)
      checks.add(`no-placeholder:${entry.name}`, !hasPlaceholder, hasPlaceholder ? 'placeholder token found' : '')
    }

    if (entry.target === 'README.md' || entry.target === 'README.zh-CN.md') {
      const extra = proseNumbers(text).filter((number) => !allowed.has(number))
      checks.add(`numbers:${entry.name}`, extra.length === 0, extra.length === 0 ? 'all prose numbers are in the fact pack' : `not in facts: ${extra.join(', ')}`)
    }
  }

  for (const required of ['README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md']) {
    checks.add(`covered:${required}`, entries.some((entry) => entry.target === required), required)
  }

  const metadata = readJson('docs/copy/repo-metadata.json')
  checks.add('metadata-description-length', typeof metadata.description === 'string' && metadata.description.length <= 160, `${String(metadata.description).length} chars`)
  checks.add('metadata-topics', Array.isArray(metadata.topics) && metadata.topics.length >= 8 && metadata.topics.length <= 12, `${metadata.topics?.length ?? 0} topics`)
  checks.add('metadata-topics-shape', (metadata.topics ?? []).every((topic) => /^[a-z0-9-]+$/.test(topic)), 'lowercase, hyphenated')

  const pluginPkg = readJson('packages/plugin/package.json')
  const corePkg = readJson('packages/core/package.json')
  checks.add('plugin-description', pluginPkg.description === metadata.plugin_description, 'package.json must carry the generated description')
  checks.add('core-description', corePkg.description === metadata.core_description, 'package.json must carry the generated description')

  // The manifest itself must not be a stale artifact of a different fact pack.
  // Frozen release records are exempt for the reason stated above.
  checks.add(
    'manifest-facts',
    entries.every((entry) => typeof entry.frozen_at === 'string' || entry.facts_sha256 === factsHash),
    'every live entry must cite the current fact pack',
  )
})
