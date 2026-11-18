# P-0054 — the fallback name is not a name this plugin gets to borrow

**Status:** `tested` · **Seam:** `llm/stream` (waterfall) · **Artifacts:** `data/results/hostile-neighbours-2026-11-18T10-00-00.000Z.json` (before), `data/results/hostile-neighbours-2026-11-18T11-30-00.000Z.json` (after)

## Symptom

When a fragment's tool name cannot be proven, this plugin dispatches it under
`remedy_unattributed`, and the runtime answers `UNKNOWN_TOOL` without executing anything
(P-0027, measured on 0.2.2-rc.3). That is safe only while the profile does **not** declare
a tool with that name. A profile is the user's tool list; a plugin that claims the name —
or a user who defines it — turns the fallback into a dispatch into a real tool, with the
model's arguments. Measured on the R68 tree with a synthetic profile that declares it:
the repaired fragment was dispatched as `remedy_unattributed`.

## Two dispatch sites, not one

ADR 0002 named only `planRescue`, where a surplus fragment is rewritten to the fallback
name. Reading the wrapper found a second path that uses the same name:

| line (R68 tree) | path | what it does |
|---|---|---|
| `repair-stream.ts:243` | `planRescue`, `fit === 'foreign'` | a surplus fragment goes out under `UNATTRIBUTED_NAME` |
| `repair-stream.ts:449` | `block-end`, `missing-name` | a call with an empty name goes out under `UNATTRIBUTED_NAME` with a traceable id (P-0033) |

Fixing only the first would leave the same hole on the second. This patch closes both;
ADR 0002 is amended to say so.

## What changed

- `fallbackOwned` is computed once from `options.tools` (the declarations the request
  carried). If any declaration is named `remedy_unattributed`, `planRescue` returns `null`
  before it considers any candidate: the rescue is abandoned whole, and the provider's
  original failure is yielded unchanged.
- In the `missing-id` / `missing-name` branch, a call whose name is empty keeps its
  original `block-end` (with its empty name) instead of being rewritten to the fallback
  name. The refusal is still booked (`missing-name`), so the stream remains observable.
- The rule is deliberately conservative: a rescue that would not actually need the
  fallback name is abandoned too. It costs one repair; the alternative is deciding per
  fragment whether the borrowed name would have been used, which is exactly the
  reasoning that fails open when a tool list changes mid-stream.
- No new counter and no new name: the abandoned rescue books `errors` through the normal
  path, and the refused block is already booked as `refused`.

## Counter-evidence

- without the owned name, the foreign fragment still goes out under
  `remedy_unattributed` and the stream reads `repaired` (the P-0027 behaviour is intact);
- a `block-end` with no name still gets the fallback name when nobody owns it (P-0033
  stays intact);
- with no declarations at all, the rescue keeps the stream's own name and never invents
  the fallback (P-0030 stays intact);
- P-0030's `unproven` counting and P-0027's journal field are untouched.

## Limits

- It cannot tell a hostile neighbour from a user who deliberately defines that tool; the
  result is the same either way, and it is the safe one.
- It only sees `options.tools` as the request carries them. A tool registered after the
  request, or one the host hides from the declaration list, is invisible here.
- The abandoned rescue is visible only as the provider's error; there is no journal event
  that says “a fallback name was taken”. Adding a counter would change the verdict
  vocabulary, which is out of scope.
- Status stays `tested`: the probe mounts the listener with a synthetic tool list, not a
  full host turn with a profile that owns the name.
- macOS is still a CI criterion, not hardware.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/reserved-name.test.ts
node scripts/probe_hostile_neighbours.mjs --stamp <ISO>
```

The probe's last scenario declares the fallback name; the before/after pair is
`hostile-neighbours-2026-11-18T10-00-00.000Z.json` and
`hostile-neighbours-2026-11-18T11-30-00.000Z.json`.
