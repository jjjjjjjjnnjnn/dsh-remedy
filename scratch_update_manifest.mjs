import { readJson, readText, writeJson, writeText, sha256, isoStamp } from './scripts/lib/kit.mjs'

const content = `# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added
- \`llm/stream\` wrapper buffering tool-call deltas and recovering fused calls on terminal error.
- Top-level JSON object splitter for concatenated tool call arguments.
- CLI commands: \`dsh-remedy status\`, \`dsh-remedy repair\`, \`dsh-remedy scan\`, and \`dsh-remedy verify\`.
- Session scanner for offline \`.jsonl\` session log analysis.
- Multi-frame zstd reader (\`decompressSessionLog\`) for concatenated log streams.
- Four governance gates: \`ssot\`, \`registry\`, \`namespace\`, and \`step-review\`.

### Fixed
- P-0001 tool-call fusion where multiple tool calls stream into a single index.
- Synchronous-waterfall regression from the first real mount where an async listener broke stream iteration.

### Verified
- Headless verification on profile \`remedy-live\`: 2 runs, 10 streams observed, 1 fused call, 1 repaired, 0 unrepaired, 5 tool calls, 5 tool results, and \`completed\` turn outcome.
- Evidence recorded in \`data/results/live-2026-11-09T17-00-00.000Z.json\`.
- Test suite and governance: 95 tests pass, 5 gates pass, 5 of 5 negative controls caught.

### Notes
- Version 0.1.0 is the first release and is not published to npm yet.
- Operating limits are documented in \`audit/blind_spots.json\`.
- No retry-as-fix: \`retryOnMalformed\` defaults to 0.
- No asar patching: operates at the runtime seam without modifying \`app.asar\`.
`

const facts = readText('docs/copy/facts/public-repo-facts.md')
const brief = readText('docs/copy/prompts/changelog.md')
const patterns = readText('docs/copy/facts/oss-patterns.md')
const request = `${brief}

---

# FACTS (the only source of numbers and claims)

${facts}

---

# STRUCTURE NOTES FROM HIGH-STAR REPOSITORIES

${patterns}

---

# OUTPUT CONTRACT

- Output only the file content. No commentary, no preamble, no code fence around
  the whole file.
- Never invent a number, a benchmark, a user count, a date or a URL that is not in
  FACTS.
- If a fact is unknown, say it is unknown instead of filling it in.
- No emoji, no exclamation marks, no marketing adjectives.
`

writeText('CHANGELOG.md', content)
writeText('docs/copy/raw/changelog.txt', content)

const manifest = readJson('docs/copy/manifest.json')
manifest.entries = manifest.entries.filter(e => e.name !== 'changelog')
manifest.entries.push({
  name: 'changelog',
  target: 'CHANGELOG.md',
  model: 'gemini-3.8-flash-high',
  generated_at: new Date().toISOString(),
  facts_sha256: sha256(facts),
  prompt_sha256: sha256(brief),
  request_sha256: sha256(request),
  output_sha256: sha256(content),
})
manifest.updated_at = isoStamp(new Date().toISOString())
writeJson('docs/copy/manifest.json', manifest)
console.log('Successfully updated CHANGELOG.md and manifest.json')
