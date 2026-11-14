# P-0004 — A scan that cannot read the log, and a redaction that misses the path

- **Status**: `tested` (unit + e2e negative controls and one measured host run;
  no live journal of its own, because the patch changes the offline reader, not
  the resident seam)
- **Severity**: major
- **Surface**: `cli` (+ the shared `core/redact.ts`, which is not a runtime seam)
- **Depends on**: none (it reads the same session logs P-0001 was measured on)

## Symptom

Two symptoms, one command:

1. `dsh-remedy scan <session.v4.jsonl.zstd>` reported
   `attempts=0 fused_calls=0 fusion_failures=0 repairable=0 unreadable_lines=236`
   for a 28-event session that visibly contained a repaired fusion. The scanner
   was **not** broken; it was handed the compressed bytes as text.
2. Every artifact that cited a session file carried the account name:
   `data/results/live-2026-11-10T14-45-00.000Z.json:57` still held
   `<home>/.dsh/sessions/--<home-encoded>-Desktop-…--/session-…`. The
   redactor matched only `C:\Users\<name>` with a single backslash.

Both were found while promoting P-0003, not while building it: the evidence
pipeline was writing files the tool could not read back, and paths the redactor
could not see.

## Mechanism (file / line)

- `packages/plugin/src/cli.ts` `cmdScan` read the session with
  `readFileSync(file, 'utf8')` and passed the text straight to
  `scanSessionText`. A `session.v4.jsonl.zstd` is **several concatenated zstd
  frames**, so utf8 decoding produced one line of binary and every line failed
  `JSON.parse` → `unreadable_lines` counted all of them.
  The correct reader already existed in `packages/plugin/src/session-log.ts`
  (`decompressSessionLog`: walks frame starts, merges a candidate that is not a
  real boundary, passes `{`-leading plain JSONL through). `cmdScan` simply did
  not call it.
- `packages/core/src/redact.ts` `windows-home` was
  `/\b[A-Za-z]:\\Users\\[^\\\s"']+/`, which cannot match an escaped path
  (`C:\\Users\\rongj` inside JSON) or a slashed one (`<home>` in a file
  URL), and a DSH session directory encodes the home path with `-` separators
  (`--<home-encoded>-Desktop-…--`) so no path separator survives at all.

## Counter-evidence (what stays broken on purpose)

| Shape | Why it is refused |
|---|---|
| an unreadable file in a directory scan | reported as `unreadable file: <path>: <reason>` and the exit code becomes 3; it is never folded in as zero |
| an event with no `time` in a `--since` window | counted as `unreadable_lines`, because a window cannot say whether an unstamped event belongs in it |
| a second file's numbers | summed only after each file produced its own row, so the total can be audited backwards |
| a redacted excerpt | keeps its JSON escaping byte for byte (`"code":"cd <home>\\x && ls"`), because an excerpt that no longer reads like the failing text is useless as evidence |

## What changed

| # | File | Before | After |
|---|---|---|---|
| 1 | `packages/plugin/src/cli.ts:242-248` (0.3.2) | `readFileSync(file, 'utf8')` | `decompressSessionLog(readFileSync(file))`, and a decode failure is `EXIT_UNAVAILABLE` with the reader's message |
| 2 | `packages/plugin/src/session-scan.ts:25-38` | `ScanReport` had no `files`, `window`, `before_since` | all three, plus `ScanWindow` and `ScanOptions` (`since`) |
| 3 | `packages/plugin/src/session-scan.ts:96-100` | the line loop started counting immediately | `--since` filters first and the dropped events are counted as `before_since` |
| 4 | `packages/plugin/src/session-scan.ts` (new `addReport`) | n/a | one report is merged onto an accumulator: counts summed, window widened, `examples` capped at five, redaction summaries unioned |
| 5 | `packages/plugin/src/session-scan.ts` (new `scanSessions`) | n/a | scans many files and returns `{ report, rows }`, one `ScanRow` per file |
| 6 | `packages/plugin/src/cli.ts` (new `collectSessions`) | n/a | walks a directory for `session.v4.jsonl.zstd` / `.jsonl`, newest first, capped by `--max-files` |
| 7 | `packages/plugin/src/cli.ts` `cmdScan` | one positional file only | a file **or** a directory; `--since`, `--max-files`, per-file failure lines, `rows` in `--json` and in `--out` |
| 8 | `packages/core/src/redact.ts:27-53` | `windows-home` single-backslash only | `windows-home` matches one-or-two backslashes or a slash; new `encoded-home` matches a `-`-separated home directory |
| 9 | `scripts/redact_artifacts.mjs` (new) | n/a | dry-run by default; `--write` applies the current `redact()` to every `data/results/*.json` and rewrites the sibling `.sha256`; it never touches `produced_by` / `generated_at` |
| 10 | `tests/e2e/cli.test.ts` | 8 cases | 12: zstd session, directory scan, `--since` window, bad `--since` |
| 11 | `tests/unit/session-scan.test.ts` | 4 cases | 9: window, unstamped event, multi-file rows, empty batch |
| 12 | `tests/unit/redact.test.ts` | 5 cases | 8: every path shape, encoded session directory, escaping preserved |

## Invariants

1. A scan never reports a compressed log as text: `attempts` counts events that
   actually parsed.
2. An artifact's `source` is the thing that was read: a single file path or a
   directory label, never an invented path.
3. `files` is the number of files whose numbers are in the report.
4. `rows` has one entry per scanned file, so `sum(rows) == report` is checkable.
5. A file that cannot be decompressed contributes nothing to the numbers and
   one line to `failures`; the run exits 3.
6. `--since` drops events and reports `before_since`; it never drops silently
   and never guesses the time of an unstamped event.
7. Redaction covers the four measured home-path shapes: plain, JSON-escaped,
   slashed/URL, and `-`-encoded directory.
8. Redaction removes the account name and nothing else: JSON escaping around
   the removed name survives.
9. `scripts/redact_artifacts.mjs` writes nothing without `--write`, and never
   rewrites provenance fields.

## Reproduction

```powershell
pnpm run build
node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions/--<home-encoded>-Desktop-…--/session-949e359c-…/session.v4.jsonl.zstd"
node packages/plugin/dist/cli.js scan "<home>/.dsh/sessions" --out .tmp/scan-all.json
node scripts/redact_artifacts.mjs
node --test --test-reporter=spec tests/e2e/cli.test.ts tests/unit/session-scan.test.ts tests/unit/redact.test.ts
```

The measured host run (77 session files, 0 unreadable, 276 attempts, 38 fused
calls, 43 fusion failures, 39 repairable, window
2026-11-09T16:50:40.119Z..2026-11-10T21:07:40.093Z) is reproduced by the second
command; the artifact it writes is a `.tmp` product, not evidence, because the
session tree keeps growing.

## Evidence

- `docs/patches/P-0004-scan-fidelity.md` (this document)
- `tests/e2e/cli.test.ts` (four new cases, including the frame-split zstd file)
- `tests/unit/session-scan.test.ts` (five new cases)
- `tests/unit/redact.test.ts` (three new cases)
- `data/results/` artifacts rewritten by `scripts/redact_artifacts.mjs --write`
  (three files; their `.sha256` sidecars were rewritten with them)

## What this does not fix

- It does not make the scanner faster: a directory scan still decompresses
  every frame of every file, and `--max-files` is a blunt cap.
- It does not deduplicate a repair seen in both the journal and the session:
  they are two observers of the same stream, and the journal already wins in
  `record_live_mount.mjs`.
- It does not prove the `encoded-home` rule against every possible workspace
  name; a directory that does not start with a drive letter is not matched.
