# AI Disclosure Log — dsh-remedy

Every non-human-authored module is listed here. `SessionID` is the value the
governance test looks for; it names the agent session that wrote the file, not a
human reviewer.

| SessionID | Model | Date | Files | What was generated | Human check |
|---|---|---|---|---|---|
| `opencode-2026-11-09-dsh-remedy` | DeepSeek V4.1 Flash (opencode) | 2026-11-09 | `packages/core/src/*.ts`, `packages/plugin/src/*.ts`, `scripts/*.mjs`, `tests/**/*.ts`, `docs/**/*.md` | P-0001 splitter, repair engine, stream wrapper, CLI, gates, fixtures, docs | Fixtures come from a real session log; every claim names a file or a measured line |
| `opencode-2026-11-09-dsh-remedy` | DeepSeek V4.1 Flash (opencode) | 2026-11-09 | `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json` | Extracted, redacted real failing tool-call text | Byte-for-byte from the session's joined `tool-call-chunks.args`; no hand editing |
| `opencode-2026-11-09-dsh-remedy` | DeepSeek V4.1 Flash (opencode) | 2026-11-09 | `scripts/record_live_mount.mjs`, `packages/plugin/src/session-log.ts`, `packages/plugin/src/index.ts`, `tests/unit/plugin-mount.test.ts`, `tests/unit/session-log.test.ts` | Live-mount recorder, multi-frame zstd reader, synchronous waterfall fix | The fix was forced by a real failure (`stream is not async iterable`), not by inspection; the artifact records the tarball sha256 |
| `opencode-2026-11-09-dsh-remedy` | DeepSeek V4.1 Flash (opencode) | 2026-11-09 | `scripts/copy_with_agy.mjs`, `scripts/gate_copy.mjs`, `tests/governance/public-copy.test.ts` | Copy-channel driver, copy gate, governance checks | Engineering code only; it generates nothing user-facing itself |
| `agy-gemini-3.8-flash-high-2026-11-09` | Gemini 3.8 high (agy) | 2026-11-09 | `README.md`, `README.zh-CN.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/copy/repo-metadata.json` | All externally visible prose and layout | Generated from `docs/copy/facts/public-repo-facts.md`; hashes recorded in `docs/copy/manifest.json`; not written by this model |

## Rules

1. A file that was not typed by a human is listed here before it is committed.
2. The `SessionID` value is never reused for a different agent run.
3. A patch whose code was generated must have its evidence produced by a script,
   not by the same model that wrote the code.
