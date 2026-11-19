# P-0042 — The profile and the refusal never met, and the seam cannot move the level

**Status**: `verified`  **Severity**: `major`  **Surface**: `cli`  **Depends on**: P-0013, P-0015, P-0041

## Symptom

The largest silent failure class on this host — **37 dead turns** across eleven
sessions, three workspaces and two days — is one sentence:

```
provider "opendesign" model "deepseek-v4.1-flash-eco"
does not support reasoning effort "xhigh"
```

P-0013 named it in the journal. `explain` counted it. Neither of them could say
the thing a person can act on: **the profile still fixes `xhigh`**. The census
and the configuration each held one half of the answer, and nothing compared
them.

## Why the obvious fix is wrong

The obvious fix is to mount P-0013's preflight on `agent/pre-step` and refuse
the step. P-0013 itself deferred that ("nothing wires it into `agent/pre-step`
yet"), and P-0015 measured the reject branch: the desktop window draws a
rejected turn as **"已完成，用时 1秒"**, the same line a real turn prints, and
the typed message is gone. R30's conclusion was explicit: *a reject must not be
used on the desktop profile.*

So R53 measured the only candidate left — `{kind:'enter', messages}` — against
the shipped **0.2.2-rc.3** runtime. Artifact:
`data/results/prestep-enter-2026-11-15T17-55-00.000Z.json`. Four isolated runs,
same profile, one inserted probe row (`agent/pre-step`), `inject: ['llm']`:

| run | what it does | exit | `turn/end` |
|---|---|---|---|
| `r53-enter` | `enter` with one added message, effort `high` | 0 | `completed`, the added message is admitted as a `user/message` |
| `r53-xhigh` | same, effort `xhigh` (the 37-turn shape) | 1 | `error` / `UNSUPPORTED_REASONING_EFFORT` |
| `r53-next` | `await next()` | 0 | `completed` |
| `r53-reject` | `reject` (R30's control) | 1 | `blocked` |

Three measured facts settle it:

1. **`enter` carries content.** The host writes the added message into the
   session as a `user/message` with the producer's own source kind; the model
   reads it and answers. The branch is not a no-op.
2. **`enter` cannot change the selection.** The loop fixes `modelSelection`
   before the waterfall and copies its own `selection` over the returned
   decision (`return { ...decision, assembly, selection, toolSet }`). The
   `xhigh` run proves it end to end: the marker is admitted, the turn still dies
   in `prepareCall`. `agent/request` is no escape either — it throws when the
   effort changes after step preparation.
3. **The adapter's truth is reachable — with an injection.** `ctx.llm.resolveCallConfig`
   answers `ok` for `high` and throws the host's own `UNSUPPORTED_REASONING_EFFORT`
   for `xhigh`. Without `export const inject = ['llm']` Cordis refuses the property
   read (`cannot get property "llm" without inject`), which is measured, not assumed.

Also re-measured: `await next()` **works** on this build, and the host's own
model-selection listener uses exactly that shape. R30's `next is not a function`
came from `return next()` in a non-awaited listener, not from a broken chain.

## What changed

The refusal is named where a person can act on it **before** the next turn.

1. `session-scan.ts` gained `refused_efforts`: `provider/model level` → count,
   filled **only** when the host's own sentence names all three. A code without
   a sentence stays a code; nothing is inferred from `UNSUPPORTED_REASONING_EFFORT`
   alone (the negative control in `tests/unit/refused-effort.test.ts`).
2. `explain --sessions … --profile-file …` now reads the `agent-default-model`
   row of the same layer and prints one line when the profile still fixes a level
   the host refused:

   ```
   CONFLICT — opendesign/deepseek-v4.1-flash-eco fixes reasoningEffort "xhigh";
   the host refused that exact level 37 time(s). Change it in the profile or
   stop selecting it; this plugin does not clamp it.
   ```

   Exit code 1. It never names an accepted level (that set lives in the adapter),
   never edits the profile and never clamps — the choice stays the user's (P-0013).

Both additions are **CLI-only**. The resident layer gains no byte: a mounted
plugin never runs this.

## The byte payment (cap unchanged)

`explain-command.ts` was at 9 119 bytes and the total at 82 919 / 83 000. The
new reader and the conflict line needed about 1.7 KB, so the payment is prose
that `docs/patches/` already carries (P-0032's rule):

- the long header of `explain-command.ts` (765 B) and the P-0016 history of the
  coverage table (535 B) are one line each in the emitted file; both narratives
  are here and in `P-0016`/`P-0025`;
- `coverageOfPatch()` was dead code — nothing called it — and is deleted;
- `session-scan.ts`'s duplicated doc blocks are one line each.

Caps are untouched: `RESIDENCY_CAP` 44 000, `CLI_CAP` 42 000, `TOTAL_CAP` 83 000,
`CORE_CAP` 104 000, `registry.js` 68 000.

## What this does NOT fix

- **The dead turns still die.** This names the conflict; only changing the
  profile stops the next one. There is no honest automatic clamp: P-0013 refused
  it and the seam cannot do it (fact 2 above).
- **The UI still shows nothing useful for the underlying refusal.** The host's
  own error reaches the journal, and `explain` reaches a person who runs it; the
  window's rendering of `UNSUPPORTED_REASONING_EFFORT` was not measured.
- **It reads the profile's own words.** A profile that omits `reasoningEffort`
  produces no finding even if the user selects a refused level in the UI — the
  selection lives in the session log, not in the layer.
- **One provider route, one model, one machine.** The census comes from
  `~/.dsh/sessions` on this host; another route may name its levels differently
  and produce no key at all (by design: no key beats a guessed key).
- Conflicting `reasoningEfforts` *declarations* inside the provider block are
  **not** part of this patch. That is a separate question and it is recorded as
  a lead rather than folded in here.

## Reproduction

```
node --test tests/unit/refused-effort.test.ts          # 6 cases, one negative control
node packages/plugin/dist/cli.js explain \
  --sessions "<home>/.dsh/sessions" \
  --profile-file "<home>/.dsh/profiles/remedy-live/cordis.patch.yml"
# -> CONFLICT … fixes reasoningEffort "xhigh"; the host refused that exact level 37 time(s)
# -> exit 1
```

The probe itself was four isolated profiles plus a session listing; neither the profiles
nor their `.tmp` home are shipped. The durable half is the recorder
`scripts/record_prestep_enter.mjs` (it produced
`data/results/prestep-enter-2026-11-15T17-55-00.000Z.json`) and the census it reads
(`data/results/scan-r53-2026-11-15T22-05-00.000Z.json`, where `opendesign` /
`deepseek-v4.1-flash-eco` at `xhigh` was refused 37 times).
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

