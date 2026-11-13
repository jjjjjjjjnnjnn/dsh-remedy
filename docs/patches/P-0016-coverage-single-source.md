# P-0016 — The command that answers "what covers this" kept its own copy of the answer

**Status**: `tested`  **Severity**: minor  **Surface**: `cli`  **Depends on**: P-0013

> This doc was written in R31 (P-0023): the patch shipped in R24 without one, and
> no gate read AGENTS.md's "write the doc first" rule. The content is the R24
> record, checked against the code that shipped.

## Symptom

`packages/plugin/src/explain-command.ts` held two constants of its own:

- `COVERAGE` — which patch covers which turn-ending failure class;
- `SWITCHES` — which config key switches that coverage on.

`packages/core/src/registry.ts` held the patches. So "which patch covers
`MALFORMED_RESPONSE`" had **two homes**, and the one users read was the command's
copy. Adding a patch only to the registry made it invisible to `explain`, and
nothing compared the two tables.

## What was measured

The command's output was captured before and after the move. It is identical:

```
$ node packages/plugin/dist/cli.js explain
MALFORMED_RESPONSE 47 covered by P-0001,P-0002,P-0003,P-0005,P-0011
UNSUPPORTED_REASONING_EFFORT 37 covered by P-0013
max-tokens 88 by design
```

That is the whole claim of this patch: a **move**, not a behaviour change. If the
printed table had moved, the patch would be a different patch.

## What changed

1. `PatchRecord` gained two optional fields (`packages/core/src/types.ts`):
   `failureClasses?: readonly string[]` and `switchKey?: string`. They are
   optional rather than `[]` because a build-side patch or an offline reader
   covers no turn-ending code, and writing `[]` would disguise "covers nothing"
   as "covers zero classes".
2. Six patches declare them in `registry.ts`; `explain-command.ts` reads `PATCHES`
   through `coverersOf` and `switchOf` and no longer defines `COVERAGE` or
   `SWITCHES`.
3. Two governance tests:
   - `tests/governance/coverage-single-source.test.ts`: the command may not
     contain `COVERAGE` / `SWITCHES`; the covered set must be exactly the five
     classes; a patch may not list the same class twice; a patch that declares a
     switch key must cover at least one class; the number of patches that declare
     coverage is pinned.
   - `tests/governance/coverage-vocabulary.test.ts`: every covered class must be
     one the census reports, and every coverer must be a **resident** seam
     (`llm/stream` or `agent/request-error`) — a CLI-side patch cannot see
     `turn/end`, so claiming coverage would answer a question it cannot observe.

## What this does not do

- The switch keys are a small closed vocabulary (`repair`, `retryOnMalformed`); a
  patch switched by some other key needs that key added here rather than inferred.
- A patch that answers a failure class but is never mounted still reads as
  covered-and-off, because coverage is a claim about the code, not about the
  profile. `explain` says "enabled here: unknown" unless a profile file is passed.
- No live artifact is possible: this is the CLI answering from the registry, not a
  resident seam. It is recorded `tested`, never `verified`.

## Reproduction

```
node --test tests/governance/coverage-single-source.test.ts
node --test tests/governance/coverage-vocabulary.test.ts
node packages/plugin/dist/cli.js explain --profile-file ~/.dsh/profiles/desktop/cordis.patch.yml
```
