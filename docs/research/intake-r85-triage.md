# R85 intake triage — 2026-11-21

> This is a **lead register**, not evidence. Per `docs/research/README.md` §0, a report becomes a
> patch only after the shape is reproduced on this machine. One lead below was reproduced with the
> shipped engine; the rest are corroboration, duplicates or out-of-seam reports. No new patch.

## Sources and counts

`data/results/intake-2026-11-21T16-15-00.000Z.json` (all four requested sources answered):

- S-DSH: 5 search terms, 89 unique discussions, 27 already in `leads.md`, **62 new candidates**.
- S-SELF: 4 open (0 user issues / 0 user PRs / 4 bot PRs).
- S-NPM: last-month downloads 6 281 / 6 099; both `latest` 0.4.20.
- S-CENSUS: 125 files / 407 attempts / 0 unreadable lines.
- S-REDDIT: ECONNRESET on both endpoints → `null`, never 0. (R75's rule still applies.)

## Buckets — every one of the 62 candidates exactly once

| Bucket | Count | Seam decision |
|---|---:|---|
| A. `llm/stream` evidence shapes and tool identity | 8 | one reproduced (P-0001), two already covered (P-0033/P-0027, P-0047), five out-of-seam/duplicate |
| B. Unfinished tool call / session write handle | 5 | out-of-seam (session persistence / adapter history validation) |
| C. Resume / capability drift / session semantics | 14 | one duplicate (P-0050), rest out-of-seam (session writer, UI, ACP, memory) |
| D. `STREAM_CLOSED` / retry / gateway compatibility | 9 | out-of-seam (adapter retry codes and SSE parsing); no new local shape |
| E. Performance / cold start / stalled UI | 8 | out-of-seam; not this project's seams |
| F. Subagent / parallelism / teams / scheduling plugins | 11 | out-of-seam; one same-family plugin read for design only |
| G. Tool policy / prompts / injection surface | 5 | out-of-seam (host tool pipeline) |
| H. Already judged / duplicate | 2 | no action, recorded once |

The machine-readable assignment (with all 62 numbers) is in `.tmp/r85-buckets.mjs`; the script
asserted `assigned=62, dupes=[], missing=[], extra=[]` before the document was written.

## Full reads (13 discussions)

- **#13983** (2026-11-21, 0.2.2-rc.5) — two parallel `bash` calls with distinct `id` but repeated
  `index: 0`; the adapter concatenates the argument texts into one block and `parseToolCallArguments`
  throws `Unexpected non-whitespace character after JSON`. The failure message carries
  `Received arguments:` followed by two complete JSON objects. Reporter measured 18/39 turns dying
  in one afternoon on a third-party gateway; the same gateway is correct when not streamed, and a
  retry of the identical body succeeds 2/2. **Reproduced locally** with the shipped engine on the
  redacted argument text (`data/results/live-external-fusion-2026-11-21T16-25-00.000Z.json`): each
  half parses, two unique ids. → `patched (P-0001)`. The gateway's index collision and the host's
  `DEFAULT_RETRYABLE_CODES` are upstream; the report's own advice to keep the quoted error text is
  exactly P-0001's input contract.
- **#13945** (2026-11-20/21, 0.2.1-rc.5; also checked rc.5 and master) — empty tool names and empty
  provider call ids poison V4 replay on the Kimi `openai-responses` route. Same family as #13211 /
  #11151 (L-0049/L-0050); this add adds a Responses-route reproduction. → `patched (P-0033 + P-0027)`
  for the identity half; the provider-specific replay behaviour on this route is not measured here.
- **#13822** (2026-11-19, 0.2.1-rc.3) — a `completed` turn whose only assistant block is `reasoning`;
  the host's completion check counts any content block so `EMPTY_RESPONSE` retry never fires. This is
  P-0047's exact shape (`completed_without_answer`), already witnessed by a local probe. → `patched
  (P-0047)` for naming; the host's retry policy is out-of-seam.
- **#13787** (2026-11-19, 0.2.2-rc.5) — Google Vertex returns a `finishReason` the installed
  `@google/genai` does not enumerate; pi-ai's `mapStopReason()` throws, surfacing `PI_AI_ERROR`.
  Adapter mapping; P-0034 only names what this side sees. → `rejected (out-of-seam)`.
- **#13803** (2026-11-19, 0.2.2-rc.2) — an illegal JSON escape in `input_json_delta` makes the DeepSeek
  Messages adapter reject the whole response; the failure text does not carry the raw arguments. Same
  boundary as L-0003/L-0005. → `rejected (dup)`.
- **#13790** (2026-11-19/20, 0.2.2-rc.3) — a killed mid-tool turn leaves a `tool_use` without a
  `tool_result`; the DeepSeek Messages history validator rejects every later request. Host adapter /
  session writer. → `rejected (out-of-seam)`.
- **#13916** (2026-11-20, 0.2.2-rc.1) — one truncated `tool/result` line makes `resume` exit 1. Our
  `scan` counts `unreadable_lines` (0 on this machine) but does not repair the host's reader. →
  `rejected (out-of-seam)`.
- **#10877** (2026-10-24/11-18, nightly) — `agent.inject()` accepts a message with no `role`; every
  later request gets 422. We only *measure* `agent/pre-step` (P-0015), not `inject`. → `rejected
  (out-of-seam)`.
- **#14003** (2026-11-21, 0.2.2-rc.5) — skill discovery silently drops a frontmatter description
  with an unquoted `: `. Not a seam this project owns. → `rejected (out-of-seam)`.
- **#12348** (2026-11-05) — cross-profile `resume` capability drift ending in `UNKNOWN_TOOL`; the
  same family as L-0047 / P-0050, with 9 measured pairs already in our census. → `rejected (dup)`.
- **#12057** (2026-11-03/04) — third-party parallel-tools prompt plugin with measured results. Read
  for design only; no code borrowed, no seam overlap. → `rejected (out-of-seam)`.
- **#12102** (2026-11-04) — user complaint that DSH is getting slower and asking which plugins to
  install. No reproducible shape; useful as promotion context only. → `rejected (out-of-seam)`.

## What this adds to the project

1. **Evidence, not code**: P-0001 now has an external, current-host reproduction with a public
   byte-level capture and a 46 % failure rate on one gateway. The local artifact proves our engine
   repairs that exact shape; the rates remain external facts in this document.
2. **Promotion fact**: the fact card can say "a public 0.2.2-rc.5 report quoted the same fused
   arguments P-0001 repairs; both halves parse; the reporter asked us to keep the error text" — with
   the URL and the honest boundary that we did not drive their gateway.
3. **No new patch**: every other full-read shape is either already covered or belongs to the adapter,
   session writer, UI, or host retry policy.

## What stays explicitly out

- Tolerating a collided tool-call `index` in the adapter (upstream pi-ai; our seam only sees the
  concatenated text).
- Adding `MALFORMED_RESPONSE` to the host's default retry codes (changes host-wide retry semantics).
- Repairing a corrupt session line so `resume` works (host session reader; our `scan` is read-only).
- Validating `agent.inject()` messages or skill frontmatter (other seams / other projects).
- Slowness and plugin-selection advice (no reproduction, no seam).
