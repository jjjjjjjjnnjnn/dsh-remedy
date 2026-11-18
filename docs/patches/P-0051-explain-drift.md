# P-0051 — The command a person runs had no word for the tool a resume dropped

**Status**: `verified` (R71: `explain` named the same 9 dropped tools as one finding, without a profile, exit 1 — `data/results/live-census-2026-11-18T22-00-00.000Z.json`)  **Severity**: `minor`  **Surface**: `cli`  **Depends on**: P-0025, P-0050

## Symptom

P-0050 taught `scan` to count a shape upstream #12348 reports: a `resume` (or `change`)
header stops declaring a tool this session had already called, and the host answers the
next call to it `UNKNOWN_TOOL`. Measured on this machine: 9 such pairs in 5 sessions,
5 of the 6 later calls carrying that code.

That counter lived in one command. The other command a person runs — `explain`, which
answers "what is this profile doing here" — printed a table of **turn endings** only, so
the one shape in this census that costs a tool call rather than a turn was invisible in
the place where a decision gets made. Running `explain --sessions ~/.dsh/sessions` on the
R60 tree printed six rows, none about tools, and exited `0`.

## Mechanism

`explain` already reads the sessions: it calls `scanSessions` and then keeps
`report.turns`, `report.error_codes` and `report.refused_efforts`, and drops the rest of
the report on the floor. `report.dropped_tools` (P-0050) is the same report's field, so
the gap is one dropped identity, not a missing measurement.

## What changed

1. `explain` keeps `report.dropped_tools` beside the three fields it already keeps
   (`null` when no `--sessions` was given, never `0`).
2. When the count is positive it prints one line, in the same shape as P-0042's
   `CONFLICT`:

   ```
   DROPPED — 9 tool(s) this session had called are missing from a later resume/change
   header; a later call to one was answered UNKNOWN_TOOL. Nothing restores the set (P-0050).
   ```

3. The exit code counts this line as a finding (`EXIT_FINDING`), so `explain
   --sessions …` on this machine now exits `1` where it exited `0` before. That is a
   deliberate behaviour change and it is the point of the patch: a session that lost a
   capability is something a script can notice.
4. **No `--profile-file` is required.** A lost tool is a property of the session, not of
   any profile, so demanding a profile would have made the line unprintable in the one
   invocation that can see it. `enabled here` keeps its three states (P-0025) untouched.

## What this does not do

- **It does not enter the coverage table.** `explain`'s "covered by" column answers
  turn-ending codes, and a covering patch has to be resident on a seam
  (`tests/governance/coverage-vocabulary.test.ts`). P-0050 is a CLI reader, so this line
  is a **finding**, not a coverage row: the table, `failureClasses`, `switchKey` and the
  verdict path are unchanged.
- **It does not restore the set, refuse a resume, or name what the model remembers.**
  Those are P-0050's limits, and they stay: the line names the request set moving and
  quotes the host code as the reason it matters.
- **It cannot see a session with no `request/header`.** 12 of the 114 files on this
  machine carry none; they are unmeasured, not clean.
- **It is a second reader of the same rule.** Both call `packages/core/src/capability.ts`;
  the recorder proves the two commands agree before it writes an artifact, so neither
  number can drift into a private definition.
- No live artifact is possible: this is a CLI command answering from a report, so it
  stays `tested`.

## Judgement (red first)

`tests/e2e/explain-drift.test.ts` has six cases, written before the line existed and red
on the built R60 bytes (the `DROPPED` match failed twice, and the two quiet cases passed
for the wrong reason: nothing was printed at all).

| test | before the fix | after |
|---|---|---|
| a resume that dropped a used tool → `DROPPED`, `1 tool`, exit 1 | **red** (no line, exit 0) | green |
| the same with a readable profile → still a finding | **red** (no line, exit 0) | green |
| a dropped tool nobody called → no line, exit 0 | green (negative control) | green |
| a call made only after the drop → no line, exit 0 | green (negative control) | green |
| no `--sessions` → `counts are unknown`, no line, exit 0 | green (negative control) | green |
| a session that kept its tool → no line, exit 0 | green (negative control) | green |

The four green-before cases are the negative controls: a line printed unconditionally, or
a count that treated "not measured" as `0`, would turn at least one of them red.

## Paying for it

The CLI half was at **41 323 / 42 000**. The field, the line and the exit-code branch
cost 237 bytes and the patch's own comments were written short; the emitted CLI half
settled at **41 560 / 42 000 (440 bytes left)** and the total at **82 462 / 83 000
(538 bytes left)**, residency unchanged at 40 902. No cap moved. The engine's new record
was funded by removing the empty `failureClasses: []` line from 30 records that already
omitted the field, so core came down from 103 587 to **103 663 / 104 000** including it
and `registry.js` to **64 911 / 68 000**. `explain-command.js` is 9 995 emitted bytes,
under the 10 000-byte `UNCHECKED_LIMIT`, so the file needs no cap of its own; the
payment is comments whose long form is here and in P-0025 / P-0042 / P-0050.

## Reproduction

```bash
node --test tests/e2e/explain-drift.test.ts        # 6 cases, four of them negative controls
node scripts/record_explain_drift.mjs --stamp <ISO> # refuses to write unless the two commands agree
node packages/plugin/dist/cli.js explain --sessions ~/.dsh/sessions
# DROPPED — 9 tool(s) … ; exit 1
node packages/plugin/dist/cli.js scan ~/.dsh/sessions   # dropped_tools=9, the same number
```

## Numbers this page quotes

- 9 losses in 5 sessions, 5 of the 6 later calls answered `UNKNOWN_TOOL` (P-0050's census).
- 237 emitted CLI bytes; CLI half 41 560 of 42 000, total 82 462 of 83 000, no cap moved.
- 6 tests; 4 of them must stay green for the line to mean anything.
