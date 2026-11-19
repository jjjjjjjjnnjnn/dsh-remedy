# P-0007 — the copy channel stops losing its own failures

## Status

`verified`. It changes the build-side copy channel, not the resident
`llm/stream` seam, so no resident journal attests it; see R72 witness. See "What this does not
do".

## Severity

minor.

## Surface

`scripts`. The copy channel only.

## Depends on

none.

## Symptom

Two outward files could not be regenerated at all, and every attempt printed the
same six words:

```
copy_with_agy: agy exited null

FAILED CHANGELOG.md
```

No exit code, no reason, no distinction between "the model refused", "the
process never started", and "the process was killed while it was writing". The
same message had already cost three earlier attempts: one wasted per file, with
nothing learned in between.

Behind it were two different faults that a single channel reported identically:

1. **The request no longer fits on a Windows command line.** The request is the
   brief plus the whole fact pack plus the pattern notes plus the contract. It
   measured 35509 characters for `changelog` and 33530 for `readme`, against the
   32767 character cap on one Windows command line. `spawnSync` fails before the
   child starts and reports `run.error.code = 'ENAMETOOLONG'` with
   `run.status = null` — which the channel printed as `agy exited null`.

2. **A generation that outlives the spawn timeout is killed.** `timeout`
   was 600000 ms. README at this size writes for longer than ten minutes, and a
   timed-out `spawnSync` also reports `run.status = null`. Same six words,
   different cause.

The measured proof of the first fault needed no model call: the same request
text handed to `spawnSync` in one line, with the fact pack included, came back
`ENAMETOOLONG` in 1 ms.

## Counter-evidence

| claim | measurement |
|---|---|
| agy itself was broken | `agy --model gemini-3.8-flash-high --print "Reply with exactly: OK"` answered `OK` throughout |
| the prompt content was refused by the model | the same prompt on stdin answered, and the two files were generated |
| the model output was empty | not reached: the process never started under the old transport |
| a smaller fact pack would hide it | the pack grows every release; the cap is fixed |

## What changes

| file | change |
|---|---|
| `scripts/lib/agy-channel.mjs` | new. `buildRequest`, `transportFor`, `stdinMessage`, `responseOf`, `cleanOutput`, `describeSpawnFailure`, `ARGV_LIMIT = 30000`, `AGY_TIMEOUT_MS = 1800000` |
| `scripts/lib/agy-channel.d.mts` | new. Types so the rules can be unit tested under `noEmit` |
| `scripts/copy_with_agy.mjs` | the request is built by `buildRequest`; above the cap the prompt travels over stdin as one `stream-json` user event and the answer is read from the final `result` event; a failed spawn is reported by its own code |
| `tests/unit/agy-channel.test.ts` | new. 14 tests |

## Invariants

1. Below 30000 characters the transport is `argv`, exactly as before. The
   behaviour of every call that already worked does not change.
2. Above it the transport is `stdin`. There is no retry across transports and no
   silent fallback.
3. `responseOf` returns `null` when a transcript has no `result` event. A missing
   answer is a failure with a message, never an empty success.
4. `describeSpawnFailure` never prints a null status. `ETIMEDOUT`,
   `ENAMETOOLONG` and `ENOENT` each get their own sentence.
5. The manifest is unchanged in shape: the same eight fields, the same
   `facts_sha256`, `prompt_sha256`, `request_sha256`, `output_sha256`.
6. The timeout is a cap, not a wait: nothing sleeps.

## Reproduction

```bash
node --test tests/unit/agy-channel.test.ts   # the transport's length rule and its refusal
node scripts/gate_copy.mjs                   # the recorded bytes and the fact-pack hash
```

The request sizes and the `ENAMETOOLONG` measurement (R36) were taken against the
retired subprocess transport with two one-off probes; neither probe is shipped, because
the transport they measured no longer exists. What survives is the rule they produced
(the 32767-byte ceiling and its refusal) in `scripts/lib/agy-channel.mjs`, pinned by the
test above, and the current transport's own run below. A reader who wants to rewrite a
page after reading this should use `node scripts/copy_record.mjs`; that command mutates
the tree and is not a reproduction step.

```
WROTE CHANGELOG.md (6851 bytes)
RECORDED docs/copy/manifest.json · 1 file(s) · model gemini-3.8-flash-high · via stdin
WROTE README.md (10872 bytes)
RECORDED docs/copy/manifest.json · 1 file(s) · model gemini-3.8-flash-high · via stdin
```

and `node scripts/gate.mjs` prints `ALL GREEN · 5 gates`.

## Evidence

- `tests/unit/agy-channel.test.ts`
- `docs/copy/manifest.json` — the `readme` and `changelog` entries now carry the
  current `facts_sha256` and a `output_sha256` that matches the files on disk
- `node scripts/gate.mjs` — the `copy` gate verifies both hashes
- `scripts/copy_with_agy.mjs`

## What this does not do

- It does not touch the plugin, the core, or any seam the plugin mounts.
- It does not change what the outward files say. It re-enables writing them; the
  content rules stay in `docs/copy/prompts/`.
- It does not retry a failed generation. The operator re-runs it and reads a
  named cause.
- It does not make the fact pack smaller, so the stdin path stays the normal path
  from here on.
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

