# P-0025 — An unread profile was reported as a finding

**Status**: `tested`  **Severity**: minor  **Surface**: `cli`  **Depends on**: P-0016

## Symptom

`dsh-remedy explain` answers three questions per failure class: how often this host
hit it, which patch covers it, and whether that patch is switched on *here*. The last
one has three answers — on, off, and **not measured** — and until this patch the
command had two.

Measured on this host on 2026-11-13, with no `--profile-file` anywhere on the command
line:

```
$ node packages/plugin/dist/cli.js explain --sessions ~/.dsh/sessions
failure class            turns  covered by        enabled here
MALFORMED_RESPONSE          47  P-0001,P-0002,P-0003,P-0005,P-0011  (no)
...
enabled-here is unknown: pass --profile-file <cordis.patch.yml> to read it
$ echo $?
1
```

The same invocation with the desktop profile printed
`P-0001,P-0002,P-0003,P-0005` and exited `0`. So the `(no)` in that cell was not a
measurement of anything: it was the absence of an argument, rendered as a fact, and
promoted to a finding by the exit code.

`packages/plugin/README.md` — the page npm renders — described exactly this wrong
semantics: *"it exits `1` when a class the host hits is covered by a patch that is
switched off here"*. With no profile, nothing had been switched off *here*; nothing
had been read.

## Root cause

`explainRows` stored `enabled: covering.filter(patch => isPatchOn(patch, config))`,
and `isPatchOn` begins with `if (config === null) return false`. So "no profile" and
"profile says off" produced the same empty array, one cell rendered both as `(no)`,
and `uncovered` counted both.

This is the same collapse this project already refused once: `verdict.ts` keeps
`unmeasured` distinct from `quiet`, and `explain` itself prints `counts are unknown`
when `--sessions` is absent instead of a row of zeros. The exit-code path had simply
kept the older, two-state shape.

## What changed

1. `Row.enabled` is `readonly string[] | null`: `null` means *no profile was read*.
2. The cell prints `unknown` for `null`, `(no)` only for a read profile that switches
   every coverer off, and the patch list otherwise.
3. `uncovered` is only incremented when `config !== null`, so an unread profile can no
   longer produce exit `1`.
4. The exit code uses `EXIT_FINDING` instead of the literal `1`, which is the constant
   `scan` and `repair` already used.

## Judgement (red first)

`tests/e2e/explain.test.ts` gained three tests, and the first one was written before
the fix:

| test | before the fix |
|---|---|
| `--sessions` alone → cell reads `unknown`, never `(no)`, exit `0` | **red**: printed `(no)`, exited `1` |
| profile with `repair: false` → cell reads `(no)`, exit `1` | green (keeps the finding) |
| profile with `repair: true` → cell names the coverers, exit `0` | green |

The middle test is the one that keeps the fix honest: deleting the counting altogether
would make it fail too.

## Paying for it

`packages/plugin/dist` is under three caps (`scripts/lib/budgets.mjs`) and none of
them moved. The change added 769 bytes to the CLI half on the first pass
(`cli` 40845 → 41614 of 42000), so the comments this patch introduced were condensed
twice; the emitted CLI half settled at **41362 / 42000** and the total at
**82505 / 83000**.

## What this does not do

- It fixes `null` (no profile read). A profile that *is* read but does not mention the
  switch key still falls back to the command's own default: a different question,
  still unmeasured.
- Exit `0` without a profile means *nothing was found*, not *nothing is wrong*. A
  script that wants the old strictness must pass `--profile-file`.
- Only the row text is tested, not the column widths.
- No live artifact is possible: this is the CLI answering from the registry and an
  optional file, not a resident seam. It stays `tested`.

## Reproduction

```
node --test tests/e2e/explain.test.ts
node packages/plugin/dist/cli.js explain --sessions ~/.dsh/sessions
  # exit 0, "enabled here" column reads unknown
node packages/plugin/dist/cli.js explain --sessions ~/.dsh/sessions \
  --profile-file ~/.dsh/profiles/desktop/cordis.patch.yml
  # exit 0, column names P-0001,P-0002,P-0003,P-0005
```
