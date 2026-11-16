# R57 intake triage — the 79 candidates the R55 crawl left unread

> Source: `data/results/intake-2026-11-16T10-10-00.000Z.json` (S-DSH answered,
> 93 unique discussions, 14 already in the ledger, **79 new**). This page is the
> bookkeeping the handoff owed: which bucket each candidate falls into, and what
> the seam decision is. It does not add a lead row for every candidate — the
> ledger stays a list of leads, not a list of discussions.

## Method

1. Every candidate was bucketed by the seam its title names (`llm/stream`,
   `agent/request-error`, `agent/error`, CLI, profile, session, UI, adapter,
   marketplace).
2. A candidate becomes a **ledger row** only when it is either (a) a shape this
   seam could observe and reproduce, or (b) a duplicate of a shape already
   resolved. Everything else is recorded here with its bucket and the reason it
   stays out.
3. Per `docs/research/README.md` §0, a title is a clue, not evidence: nothing
   below becomes a patch without a local reproduction.

## The buckets

| bucket | n | examples | decision |
|---|---|---|---|
| empty tool identity | 2 | #11151, #10732 | **duplicate of P-0033 / P-0036** — the call arrives with `id`/`name` empty; both gateways show the same shape this seam already rewrites. No new row: `patched` by two existing records. |
| silent / empty turn | 5 | #12673, #12741, #13169, #13165, #12454 | **#13169 is P-0047** (reproduced locally in R57). #12673 is the adapter rule behind it (`mapStopReason` counts blocks) — quoted in P-0047's doc, no row of its own. #12741 (a long tool loop ending with no visible reply) is a **different** shape: the last step is a tool call, which P-0044/P-0047 deliberately count as answered; needs its own probe before it can be a counter. #13165 / #12454 are UI drafts, out-of-seam. |
| stream close / transport | 5 | #11123, #9789, #4972, #2374, #388 | **out-of-seam (adapter)**: the `[DONE]` sentinel and `content_filter` collapse are decided before this seam sees bytes. P-0011's bounded retry is the only lever here and it is already in place. |
| persistence / session write | 2 | #13255, #12829 | **out-of-seam (session writer)**: a validation-rejected event poisoning the v4 queue, and a leaked write handle. A reader could count the first shape (`unreadable`), but nothing on this machine produced it; no row. |
| profile / session lifecycle | 11 | #13293, #12566, #12348, #10006, #12654, #13103, #12331, #10602, #11568, #12081, #10207 | **out-of-seam (host/profile)**, with one caveat: #12348 (capability drift across a profile resume) is the family P-0042 names for effort levels; a broader capability comparison is a **candidate** for a future offline reader, not a patch. |
| UI / performance / platform | 7 | #13397, #13245, #12939, #13261, #12933, #12744, #12596 | **out-of-seam (UI/runtime)**: cold starts, a git snapshot blocking the first tool, a SIGSEGV while idle. None of them end a turn at a seam this plugin owns. |
| plugin advertisement / feature ideas | 14 | #9503, #13153, #3542, #4419, #11345, #12639, #10832, #11189, #10115, #13461, #13137, #12175, #12810, #10959 | mixed: **#4419 is the competing repair plugin** (mechanism already borrowed in P-0036); **#13153 is a host crash inside `agent/pre-step`** — the seam P-0013 measured, and a reason not to mount there; the rest are other people's plugins, proposals or feature requests. No rows. |
| everything else | 33 | #10877, #8192, #6303, #9721, #8997, #10406, #6783, #13336, #6725, #3677, #8423, #6580, #2203, #8501, #7502, #11919, #13135, #10531, #12521, #13449, #12347, #13472, #13450, #13426, #12057, #11793, #12737, #13024, #12102, #12728, #10210, #13097, #10778 | mostly adapter failures already resolved (#10406 / #8997 / #8192 are the P-0001 family; #12347 is P-0044), the rest are host-side or other-plugin threads. Three deserve a second look and are named below. |

## The three worth re-reading (not ledger rows yet)

- **#12741 — long tool loops can finish a turn with no visible reply.** This is
  the one silent-turn variant P-0047 does **not** count, and it is deliberately
  not counted: its last step is a tool call, which this project treats as
  "visible work in the transcript". If a local probe shows a completed turn whose
  last step is a tool call and the *next* turn never arrives, that is a different
  counter — and a different question.
- **#12348 — capability drift across a profile resume.** P-0042 already answers
  the reasoning-effort half offline. A broader comparison (does the resumed
  profile still declare the same provider/model/effort?) is cheap for `explain`
  to print and would be an offline reader, not a seam change.
- **#10115 — signal truncated output from workflow/subagent returns.** Same
  family as P-0044/P-0047, one layer out: the truncation is in a subagent's
  returned value rather than in a session log. Nothing local reproduces it yet.

## What this page does not claim

- It is a **triage**, not 79 reproductions. Every rejection above is a judgement
  about the seam, made from a title and (where named) one reading — the ledger's
  rule that a report is a clue, not evidence, applies to all of them.
- The counts in the table are from `node .tmp/r57-buckets.mjs`, which buckets by
  a title pattern and was hand-corrected afterwards; it is not a gate.
- No candidate here became a patch. The one that did — #13169 — is named in
  `P-0047`, and it got there through a local probe, not through this page.
