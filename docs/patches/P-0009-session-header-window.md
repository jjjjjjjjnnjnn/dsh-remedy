# P-0009 — A windowed scan called the one dated line every session starts with unreadable

**Status**: `tested`  **Severity**: minor  **Surface**: `cli`  **Depends on**: none

## Symptom

A windowed scan over a real session directory reported one unreadable line per
file it read:

```
$ node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions" --since 2026-11-11T00:00:00Z
files=78
attempts=67 fused_calls=0 fusion_failures=0 repairable=0 unreadable_lines=78
before_since=156131
window=2026-11-11T05:48:41.228Z..2026-11-11T15:06:26.679Z
```

Seventy-eight files, seventy-eight unreadable lines. The number is not an
accident and it is not a broken file: it is exactly `files`, because every
session log opens with the same record.

`unreadable_lines` exists so an operator can tell "I read everything and found
no defects" apart from "I could not read the evidence". A count that rises with
the number of files turns that distinction into noise, and it is the second
zero that lies — the first was a scan that reported `attempts=0` because it
could not decompress zstd at all (P-0004).

## What the header actually is

```
{"type":"session","version":4,"id":"session-…","createdAt":1794318268790,
 "cwd":"C:\\Users\\rongj\\Desktop\\项目开发","isSeeded":false,
 "delegationDepth":0,"agentPreset":"standard"}
```

The instant is there, in the top-level `createdAt` field, as epoch
milliseconds. There is no `time` on this record. Measured across the host:
`files=78 headers=78 headers_without_time=78`.

Three header key sets appear, all carrying `createdAt`:

```
agentPreset,createdAt,cwd,delegationDepth,id,isSeeded,type,version
agentPreset,createdAt,cwd,delegationDepth,id,isSeeded,origin,parentSession,type,version
createdAt,cwd,delegationDepth,id,isSeeded,type,version
```

## Mechanism

`packages/plugin/src/session-scan.ts:178` in 0.3.5:

```ts
if (options.since !== undefined) {
  if (time === null) {
    unreadable += 1
    continue
  }
  if (time < options.since) {
    beforeSince += 1
    continue
  }
}
```

`time = asNumber(event.time)` is `null` for every header, so every header took
the first branch. The scanner parsed the header correctly and then reported it
as unreadable because it looked for the instant under one name only.

## Counter-evidence

| Question | Answer |
|---|---|
| Is the header malformed? | No. It parses, and it carries `createdAt` as a number. |
| Did the file fail to open? | No. `files=78` and the pass-through path for plain JSONL both work; P-0004 proved the reader. |
| Is this only a cosmetic label? | No. `unreadable_lines` is quoted in the artifact and in the report, and a rising count there hides a real read failure. |
| Would counting the header as data change the census? | No. It contributes an instant to `window` and nothing to `attempts`/`turns`, so the fault map does not move. |

## What changed

| File | Change |
|---|---|
| `packages/plugin/src/session-scan.ts:174-192` | `const headerTime = type === 'session' ? asNumber(event.createdAt) : null`; `const stamp = time ?? headerTime`; the window test and the window update both use `stamp` |
| `tests/unit/session-scan.test.ts` | `a session header is dated by createdAt, so a windowed scan reads it` and `a session header older than the window is counted as before_since` |
| `tests/e2e/cli.test.ts` | `a windowed directory scan does not spend one unreadable line per session header` — two zstd files, each with a header, expecting `unreadable_lines 0` and `before_since 2` |

The ordinary-event case is unchanged on purpose: an event with no instant at
all is still an unreadable line, because there is no second field to fall back
to. Only the header has one.

## Invariants

1. A `session` header is dated by `createdAt`; no other event type is.
2. A header inside the window contributes its instant to `window` and nothing
   else.
3. A header before the window is `before_since`, not `unreadable`.
4. An event with no instant stays `unreadable` — the fallback is not a blanket
   excuse.
5. `--since` still reports what it did not look at; the fix changes the bucket,
   not the honesty.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/session-scan.test.ts     # 16 pass
node --test tests/e2e/cli.test.ts               # 14 pass
node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions" --since 2026-11-11T00:00:00Z
# before: unreadable_lines=78   after: unreadable_lines=0
```

## Evidence

- `tests/unit/session-scan.test.ts` (16 pass)
- `tests/e2e/cli.test.ts` (14 pass)
- `.tmp/probe-session-header.mjs` — `files=78 headers=78 headers_without_time=78`
- `audit/step_reviews.json` S16

## What this does not do

- It does not accelerate or shrink the scan; it moves one record from the
  wrong bucket to the right one.
- It does not validate `createdAt` against the file's mtime, so a hand-edited
  session can still claim any date.
- It does not give every event a fallback instant; only the header has a
  second field to read.
- It stays `tested`, not `verified`: it is an offline reader change like
  P-0004, so there is no resident journal to point at.
