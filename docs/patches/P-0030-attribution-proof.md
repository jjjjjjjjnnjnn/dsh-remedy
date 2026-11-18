# P-0030 — The name check read `required` and nothing else, and its counter was a running total

**Status**: `verified` (R70: closed-schema half witnessed live)  **Severity**: minor  **Surface**: `llm/stream`  **Depends on**: P-0027

## Symptom

Two narrow gaps were left after P-0027:

1. **A schema with no `required` list proved nothing.** `attributable()` returned `true`
   the moment `parameters.required` was absent or empty, so a synthesized fragment kept
   the stream's name even when the declaration could say more. `BS-18` records this as
   the remaining hole.
2. **The repaired event counted a running total.** `unattributed` was declared outside
   the per-decision loop and passed to every `recordRepaired()` call, so a stream with two
   fused blocks reported the first block's unattributed fragment on the second repair's
   event as well. A counter that reports another repair's work is the same family as
   `BS-12` (a fusion counter that moved on plain bad JSON).

## Root cause

The check was written against an imagined JSON Schema. Reading the compiler that
actually produces the request settled it:

- `dsh-tools/lib/index.js:800-808` compiles every first-party parameter map to
  `{type:'object', properties, required?}` and **never sets `additionalProperties`**.
  The schema is open, so an undeclared key is allowed and is **not** evidence that the
  fragment belongs to another tool. The obvious next rule ("every key must be declared")
  would have been an over-claim, not a proof.
- The plugin's `attributable()` helper only ever read `required`, so nothing could answer
  "does this fragment even validate for the named tool?" when the required list was empty.
- The counter bug is a plain scoping mistake: `let unattributed = 0` sat one block too
  high.

## What changed

1. `packages/core/src/attribute.ts` (new, uncapped bundle): `fragmentFit(argumentsText,
   declaration)` returns `fits` / `foreign` / `unproven`.
   - `foreign` needs proof: a missing `required` field, an undeclared key in a **closed**
     schema (`additionalProperties: false`), or a declared field whose value breaks its
     own `type` / `enum` / `const`. Keywords this module does not decide (`oneOf`,
     `anyOf`, pattern, …) never produce a refusal.
   - `fits` means "the schema found nothing against it", which is not identity.
   - `unproven` means there was nothing to check (no parameters, or an open object with
     no `required` and no `properties`).
2. `packages/plugin/src/repair-stream.ts`: `attributable()` is replaced by `fitOf()`,
   which only finds the declaration and defers the proof to core. A `foreign` fragment
   still goes out as `remedy_unattributed`; an `unproven` one keeps the stream's name and
   is counted. Counts are per decision, so each repaired event reports its own repair.
3. `packages/plugin/src/stream-types.ts` / `monitor.ts`: the repaired event carries
   `unproven?: number` (absent means every checked fragment had a schema that could
   speak).

## Judgement (red first)

Run before the change, the new tests failed on the real build:

```
a closed schema with no required list still proves a foreign key
  expected 'remedy_unattributed', actual 'read'
a schema without required fields proves nothing, so the name is kept and the journal says unproven
  expected 1, actual undefined
```

The two-fused-block test was checked against the old behaviour by temporarily passing the
first decision's counts to both events: it reported `[1, 1]` where the correct answer is
`[1, 0]`, and the mutation was reverted before the build was recorded.

`tests/unit/attribute.test.ts` is table-driven (17 cases across two files) and every
`foreign` case names the exact schema keyword that produced the proof; the
"undecidable keyword" case proves the module does not refuse on `oneOf`.

## What this does not do

- **An open schema still cannot prove a fragment foreign by its keys.** That is the
  measured shape of every first-party DSH tool, so a fragment that happens to be valid
  for the named tool is still dispatched as that tool. Only a closed schema (raw or MCP)
  changes that.
- It never proves identity either: `fits` says "no evidence against", not "this is the
  tool the model meant". The attribution of the stage that glued the objects is still
  unknown (P-0001 limit).
- Only `dsh-tools`' compiled first-party shape was read. A third-party declaration that
  sends a different schema dialect may be classified `unproven` more often than necessary,
  which is the safe direction.
- R70 drove the runtime with a **closed** schema and no `required` list: the
  fragment carrying an undeclared key leaves as `remedy_unattributed` and the
  runtime answers `UNKNOWN_TOOL`, where 0.4.5 kept `gamma`
  (`data/results/live-repairs-2026-11-18T20-00-00.000Z.json`). The witnessed half
  is the schema proof; the per-decision counter stays unit-tested.

## Reproduction

```
node --test tests/unit/attribute.test.ts
node --test tests/unit/attribution.test.ts
node scripts/gate_size.mjs
```
