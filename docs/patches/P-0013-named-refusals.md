# P-0013 — The failure class this host hits most after fusion was named by nobody

**Status**: `tested`  **Severity**: major  **Surface**: `agent/request-error` (+ `core/preflight.ts`)  **Depends on**: P-0011

## Symptom

Measured on this host (`data/results/scan-full-2026-11-11T18-15-00.000Z.json`,
78 files, 293 turns):

| class | turns | who said anything |
|---|---|---|
| `MALFORMED_RESPONSE` | 44 | the repair layer, loudly |
| **`UNSUPPORTED_REASONING_EFFORT`** | **37** | **nobody** |
| `SERVER` | 16 | upstream, and it self-heals |
| `INVALID_REQUEST` | 1 | nobody |
| `MISSING_CREDENTIAL` | 1 | nobody |
| `EMPTY_RESPONSE` | 4 attempts | nobody |

The thirty-seven were all one sentence:

```
provider "opendesign" model "deepseek-v4.1-flash-eco"
does not support reasoning effort "xhigh"
```

— across three workspaces (`oh_my_3dlab` 26, `ai-terminal-pet` 7, `dsh-remedy` 4),
eleven sessions, two days (`2026-11-10T13:25` → `2026-11-11T15:05`).

Each one cost the user a whole turn. Nothing in the journal said why.

## Mechanism

Read out of the shipped `app.asar`:

```js
resolveReasoningLevel(model, effort):
  if (getSupportedThinkingLevels(model).some(l => l === effort)) return effort
  throw new LlmError(`pi-ai provider "${p}" model "${m}" does not support
                      reasoning effort "${e}"`, 'UNSUPPORTED_REASONING_EFFORT')

getSupportedThinkingLevels(model):
  if (!model.reasoning) return ['off']
  return THINKING_LEVELS.filter(level => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
```

The effective set is the adapter's own metadata, not the profile's prose. The
`remedy-live` profile declares `off/high/xhigh/max` for this model; the adapter
refuses `xhigh` at request time.

**Why the resident layer could not have said anything:** `repair-stream` is
mounted on `llm/stream`, and `llm/stream` only runs once a request is
dispatched. A step refused during preparation never reaches that seam, so the
one layer that promises to be observable was structurally blind to the largest
non-fusion failure class on this host.

## What changed

Two pieces, one decision each.

1. **Naming (resident).** `failure-listener.ts` — the same listener P-0011 fixed
   — now recognises `UNSUPPORTED_REASONING_EFFORT`, `INVALID_REQUEST`,
   `MISSING_CREDENTIAL` and `EMPTY_RESPONSE` and records one `diagnosis` event
   per `(step, code)`, with the host's own code and the first 200 characters of
   the host's own message. It never repairs and never retries these; a
   deterministic refusal costs one named line instead of one dead turn.
2. **Preflight (pure).** `packages/core/src/preflight.ts` — new, no I/O —
   re-derives the adapter's supported set from a profile declaration and answers
   `ok` / `refuse` / `unknown`, plus the nearest accepted level as a
   **suggestion**. It mirrors the adapter's own filter, including its quirk:
   `mapped === null` removes a level, a level simply absent from the map is still
   accepted for `off`/`low`/`high`, and `xhigh`/`max` require an explicit mapping.

The counter `diagnoses` is optional in `RemedyCounters` for the same reason
`resealed` is: a counter object recorded by an earlier build has no such field,
and judging it must stay byte-identical. It moves no verdict.

## The decision this patch refuses to make

**It does not silently downgrade a level.** The adapter is willing to — its own
source contains

```js
if (requested !== effective) resolvedConfig = { ...defaulted, reasoningEffort: effective }
```

whenever the requested level differs from a declared default. So "clamp to the
nearest supported" is a legal move upstream. It is still not this plugin's
decision: changing what a user configured is the user's call. `preflightEffort`
therefore **reports** `suggestion: 'high'` and leaves `effective: 'xhigh'`
exactly as asked, so a caller can print the truth instead of quietly rewriting it.

## What this does not fix

- **Nothing is wired into `agent/pre-step` yet.** The upstream contract is that
  `PreStepDecision` is `{ kind: 'reject' }` or `{ kind: 'enter', messages, … }`,
  and a rejected decision "opens no step" — but nothing here has measured what a
  user sees when a plugin rejects a step, or whether it can be mistaken for a
  cancellation. Mounting a refusal before that is measured would be guessing, and
  this project's rule is "prove it or throw".
- The preflight reads what the **profile declares**. A model whose capabilities
  live only in the adapter is reported as `unknown`, not assumed.
- It never touches `EMPTY_RESPONSE`'s reasoning-only mistranslation: that defect
  is in the adapter (`translate.ts:149`, `stream.ts:99`), not on a chunk seam.
- No live artifact. Naming a failure and deciding an effort are not repairs, and
  the headless profile that produced the other live artifacts declares
  `xhigh` only in the profile that *supports* it — so the 37 dead turns cannot be
  re-triggered on demand without deliberately breaking a profile.

## Reproduction

```
node --test tests/unit/preflight.test.ts        # 9 cases, all from the host's own data
node --test tests/unit/request-error.test.ts    # naming once per (step, code)
node packages/plugin/dist/cli.js explain \
  --sessions "C:/Users/rongj/.dsh/sessions" \
  --profile-file "C:/Users/rongj/.dsh/profiles/remedy-live/cordis.patch.yml"
# UNSUPPORTED_REASONING_EFFORT  37  covered by P-0013  enabled here P-0013
```
