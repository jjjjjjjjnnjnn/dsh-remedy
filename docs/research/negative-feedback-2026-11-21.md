# External negative feedback about DSH — 2026-11-21 sweep

> Lead register, not evidence. Method and the "report → local reproduction → patch" ladder live in
> `docs/research/README.md`. The 2026-11-19 sweep (two articles + one HN thread) is kept in
> `negative-feedback-2026-11-19.md`; this file records only what is new today.

## How it was collected

- **GitHub half**: `node scripts/collect_leads.mjs --stamp 2026-11-21T16:15:00.000Z --dsh --self
  --npm --sessions ~/.dsh/sessions` → `data/results/intake-2026-11-21T16-15-00.000Z.json`; four
  sources answered, 62 candidates not in the ledger. Triage and full reads are in
  `intake-r85-triage.md`.
- **Web half**: the local zero-account search MCP (`C:\Users\rongj\.claude\search-mcp`, Bing / Baidu /
  Bing News / Hacker News) ran 14 queries in two batches — English and Chinese terms for crashes,
  complaints, plugin conflicts, `STREAM_CLOSED`, session resume, tool-call errors and `0.2.2-rc.5`.
  Raw output in `.tmp/r85-search.json` and `.tmp/r85-search2.json`. All queries answered;
  Bing/Baidu returned no organic results for the specific negative-feedback terms, and the news/HN
  hits were the same items already read on 2026-11-19 (the Tencent and Sina articles, the HN
  developer-preview threads). **No new negative article was found today** — recorded as such, not as
  "no negative feedback exists".

## The one new, decisive report

[#13983](https://github.com/deepseek-ai/deepseek-harness/discussions/13983) (2026-11-21, DSH
0.2.2-rc.5, macOS, `openai-completions`) is a real user's failed turn whose failure text contains the
exact signature P-0001 was built for:

```
Tool call "bash": Unexpected non-whitespace character after JSON at position 155

Received arguments:
{"command": "...", "description": "..."}{"command": "...", "description": "..."}
```

Two parallel calls were streamed with the same `tool_call.index` but distinct ids, so the adapter
concatenated their argument texts. The reporter measured 17/46 collapses at `reasoningEffort: max`
and 18/39 turns dying in one afternoon; a retry of the identical body succeeded 2/2, and the same
gateway was correct when not streamed. Their third suggestion is to **keep the quoted error text**,
which is precisely the byte channel P-0001 reads.

Local reproduction (shape only): `scripts/record_external_fusion.mjs` feeds the report's redacted
argument text to the shipped engine and asserts that the whole text does not parse, the splitter
finds two slices, the engine returns `repaired` with two calls, each argument parses, and ids do not
collide. Artifact: `data/results/live-external-fusion-2026-11-21T16-25-00.000Z.json`.

## Analysis — what can join the project

- **Already covered, now externally witnessed**: P-0001 (fused arguments). No code change; this is
  the strongest outside corroboration the patch set has received, and a good promotion fact.
- **Already covered, new route**: P-0033 + P-0027 (#13945 empty tool identity on Kimi Responses) and
  P-0047 (#13822 reasoning-only `completed` turn). Both remain `patched` in the ledger; the provider
  route half is not measured here.
- **Diagnosed but not ours**: #13787 (Vertex stop-reason mapping), #13803 (invalid JSON escape in
  adapter), #13790 (unresolved tool call in history), #13916 (corrupt session line), #10877
  (`agent.inject` message with no role), #14003 (skill frontmatter). Our `scan` can *count* unreadable
  lines but cannot repair the host's reader; P-0034 can only name failures this side sees.
- **No local shape at all**: STREAM_CLOSED family (0 occurrences in our 125-file census), performance
  complaints, subagent/team/plugin-scheduling reports. Recorded, not promoted to patches.

## Honest boundaries

- We did not drive the reporter's third-party gateway. The collapse rates and session counts are
  their measurements, quoted with the URL; our artifact proves only that the reported shape is one
  our engine repairs.
- The argument text in our artifact is redacted (local path and URL replaced). No foreign session
  text was copied into `data/results/`.
- The web half produced no new article today. A quiet sweep is a valid result; it is not evidence
  that the earlier complaints were resolved.
- No runtime code, cap, version, patch count or byte account changed in this round.
