# R87 intake triage — 2026-11-25

> Lead register, not evidence. A report becomes a patch only after the shape is reproduced on this
> machine (`docs/research/README.md` §0). One lead below was reproduced as a **refusal**; the rest are
> corroboration, duplicates or out-of-seam. No new patch.

## Sources and counts

`data/results/intake-2026-11-25T16-20-00.000Z.json`:

- S-DSH: 5 terms, 89 unique discussions, 36 already in `leads.md`, **53 new candidates**.
- S-SELF: 4 open PRs, all bot PRs; 0 user issues / 0 user PRs.
- S-NPM: last-month 6 474 / 6 205; both `latest` 0.4.20.
- S-CENSUS: 125 files / 407 attempts / 0 unreadable lines.
- S-REDDIT: still ECONNRESET → `null`, never 0.

## Host status

The installed app is still **0.2.2-rc.5**; upstream shipped `0.2.3-alpha.1` and `0.2.3-alpha.2` on
2026-11-22 (alpha, feature-heavy). **No upgrade three-piece this round**: the installed host did not
change, and upgrading the desktop to an alpha is a human decision, not a background step. Recorded, not acted on.

## Buckets — every one of the 53 candidates exactly once

| Bucket | Count | Seam decision |
|---|---:|---|
| A. `llm/stream` aggregation and empty answers | 4 | one reproduced as a refusal (no patch), three already covered or out-of-seam |
| B. `STREAM_CLOSED` / third-party gateways / retry | 8 | out-of-seam (adapter SSE parsing and host retry policy); 0 local occurrences |
| C. Session resume / write lease / persistence | 16 | out-of-seam; one duplicate of P-0050 |
| D. Performance / cold start / stalled UI | 7 | out-of-seam |
| E. Subagent / parallelism / teams / scheduling plugins | 11 | out-of-seam |
| F. Tool policy / prompts / injection surface | 5 | out-of-seam |
| G. Same-family plugins / market and product | 2 | design read only |

Coverage was asserted by `.tmp/r87-buckets.mjs` (`candidates=53 assigned=53 unique=53 dupes=[]
missing=[] extra=[]`) before this file was written.

## Full reads (10 discussions)

- **#14168** (2026-11-23, 0.2.2-rc.5, `openai-responses`, kimi-k3.1-pro) — **the decisive one, and it
  argues for refusal**. One `ask_user_question` call is split across three `function_call` items
  (`{`, `"questions":[…]`, `}`) with empty ids/names on the second and third. The per-item guard
  rejects the first fragment, so the failure message this side receives carries only `{`. Reproduced
  locally with the shipped engine: lone `{` and `{`+middle are **rejected** with
  `not-an-object-sequence`; the joined text is `unchanged` (valid JSON). Artifact:
  `data/results/live-external-refusal-2026-11-25T16-35-00.000Z.json`. → `rejected (no defect)`: a
  boundary between fragments would be a guess, and P-0037 already forbids that.
- **#7123** (2026-09-19, 0.1.5-rc.2; 2026-11-23 update on desktop) — reasoning-only `completed`
  answer, `outputTokens === reasoningTokens`; a commenter found the exact adapter line
  (`mapStopReason` checks `content.length`, not usable content). This is P-0047's shape and P-0047 was
   written for it; the adapter half stays out-of-seam → `patched (P-0047)`.
- **#14188** (2026-11-23, rc.1/rc.3/master) — subagent's final report silently dropped when its last
  step is a tool call; source-traced in `assistant-output.ts` / `continuation-messages.ts`. The
  subagent package is out-of-seam, but the *shape* (`completed` on a tool call) is exactly what
  P-0052 counts for the main loop → `patched (P-0052)` for the reader half; the subagent fix belongs
  upstream.
- **#14269** (2026-11-24, rc.5) — `agents.resume()` restores a session without its agent preset, so a
  resumed session loses all core tools. Capability loss on resume is P-0050's family, but the
  mechanism here is preset binding, not a dropped request header → `rejected (out-of-seam)` with a
  pointer to P-0050's measured `UNKNOWN_TOOL` consequence.
- **#14114** (2026-11-22/23) — 146k tokens for a short message with local models; one commenter traced
  it to a third-party plugin's context injection and another to the token meter's `request/header`.
  No seam, no local shape → `rejected (out-of-seam)`.
- **#14237** (2026-11-24, rc.5) — sessions interrupted by a host restart become permanently read-only;
  UI revival deadlock. Out-of-seam.
- **#14015** (2026-11-21) — feature request: take the session write lease without reading the log, so
  a plugin can repair a session the current format refuses. Interesting, but this project is
  read-only and does not write `~/.dsh`; a session-repair plugin is a different product. Out-of-seam.
- **#14039** (2026-11-22, 0.2.1-rc.2) — a dangling attachment reference surfaces as `TRANSPORT` and is
  retried 5 times. Transport/attachment; out-of-seam.
- **#14076** (2026-11-22, rc.1) — resumed session's private `--temp` directory is gone, every command
  fails with `EXECUTOR_UNAVAILABLE`. Out-of-seam.
- **#14280** (2026-11-25, rc.5) — `team_task_list` treats `owner: ""` as a filter and conflicts with
  `unowned`. Team tool schema; out-of-seam.

## What this adds to the project

1. **A boundary proof, not a patch**: #14168 is the first external report whose right answer is
   *refuse*. It confirms P-0037's uniqueness rule from the outside — the joined bytes are valid, the
   fragments are not, and the failure message carries only one fragment, so any repair would be a
   guess.
2. **A promotion fact**: "a public report asked us to merge three fragments; our engine refuses, and
   that refusal is the correct outcome" is a stronger honesty story than another repair claim.
3. **No new patch**: P-0047 and P-0052 already name the two shapes that recur; the rest are host
   packages.

## What stays explicitly out

- Merging fragments by proximity/adjacency (the report itself warns that neighbouring indices are
  `message` items, so position-based stitching risks grabbing another call).
- Changing the adapter's per-item validation or the host retry list.
- Session write-lease APIs, subagent output folding, team-tool schemas, attachment handling,
  preset binding on resume, UI revival, performance and token-budget complaints.
- Upgrading the desktop to `0.2.3-alpha.*` — an alpha upgrade is a human decision with its own
  three-piece rerun, not something this round does silently.
