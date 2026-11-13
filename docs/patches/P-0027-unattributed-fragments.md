# P-0027 — A fragment dispatched under a name nobody proved

**Status**: `tested`  **Severity**: major  **Surface**: `llm/stream`  **Depends on**: P-0001, P-0002

## Symptom

A fused text can glue two calls of **different** tools. The adapter streams one
tool name for that index, so every fragment after the first inherits it.

Measured twice on DSH 0.2.2-rc.3 (2026-11-13), from one isolated profile running
the published plugin:

```
block-start(index=0, tool-call)
tool-call-chunks(index=0, id=call_00_l5fy…, name=read, args={"file_path":"…"}{"command":"Get-ChildItem …"})
finish{kind:'error', failure: MALFORMED_RESPONSE}
```

The rescue split it correctly and emitted two calls, but both were named `read`:

```
tool/call call_00_l5fy…          read  {"file_path":"…"}                 → file content
tool/call call_00_l5fy…#remedy-1 read  {"command":"Get-ChildItem …"}    → INVALID_ARGS
                                              Error: invalid arguments:
                                              missing required property "file_path"
```

The turn continued, so nothing ran silently and no data was lost. What happened
is narrower and still wrong: **a tool was called that the model did not call.**

## Mechanism

`planRescue` proves the JSON split — every fragment parses, ids are traceable,
the plan is atomic — and then reuses `candidate.call.name` for every fragment.
For a same-tool fusion that name is right; for a cross-tool fusion it is the
first call's name glued onto the second call's arguments. The engine had no
evidence either way, and it dispatched anyway.

## What is provable at this seam

`llm/stream` receives `options.tools`: the request's tool declarations, 24 of them
in the measured run. Each declaration carries `parameters.required`, so one
question can be answered without guessing: *does this fragment carry the fields
the named tool requires?*

- Yes → the name is consistent with the declaration; keep it.
- No → the fragment is not a call to that tool. Dispatching it as one is the
  defect.
- No `required` list, or no declaration at all → nothing is provable, so the name
  stays and the old behaviour is kept. The patch refuses to invent evidence.

## What changed

1. `RepairStreamOptions.tools` carries the declarations from the listener
   (`index.ts` reads `options.tools`).
2. `attributable(call, tools)` answers the question above from `required` only.
3. A fragment at offset ≥ 1 that does not fit goes out under
   **`remedy_unattributed`** instead of the inherited name. The first fragment is
   untouched: the stream named it, and on rc.3 the adapter may already have closed
   it.
4. The `repaired` event carries `unattributed: <n>` when that happened, so the
   journal says it rather than leaving it to be noticed.

## Why a fallback name and not a refusal

Measured, not assumed: an unknown tool name is answered

```
tool/result  Error: unknown tool "remedy_unattributed"   code UNKNOWN_TOOL
```

and the turn continues (probe run on the same runtime, 2026-11-13). So the model
sees a named failure and can retry, while the wrong tool never runs.

The alternative — refusing the whole split — would have cost the *first* call,
which was valid and, on rc.3, may already have been dispatched by the adapter
before the finish-time rescue runs. It would also refuse every cross-tool fusion,
which is the majority of what this patch set exists to repair.

## Judgement (red first)

`tests/unit/attribution.test.ts`, written before the change, six tests:

| test | before |
|---|---|
| a cross-tool fragment goes out under a name the runtime cannot execute | **red** (`read` inherited) |
| a same-tool fusion keeps the name on every fragment | green |
| without tool schemas the plugin keeps the old behaviour | green |
| a schema without required fields proves nothing | green |
| the repaired event records that a fragment was unattributed | **red** (no field) |
| the measured fixture still repairs into two calls | green |

## Paying for it

The resident half has a 44 000-byte cap and the total 83 000; neither moved. The
first build was 2 539 bytes over, so this file's prose was paid down in four
passes (header, `planRescue`, `flushPending`, `withdrawPending`, the marker doc),
and `toolsOf` was inlined. Settled at **residency 41 623 / 44 000**, CLI
41 362 / 42 000, **total 82 985 / 83 000** — 15 bytes of headroom, which is the
next patch's problem, not a reason to move a cap.

## What this does not do

- Only `required` is used. A tool with no required fields proves nothing, so its
  fragments keep the stream's name and the old wrong-dispatch behaviour.
- A fragment that happens to satisfy the wrong tool's required list is still
  dispatched as that tool. A schema is a filter, not a proof.
- The declarations come from `options.tools`; a hand-built call or the CLI
  `repair` command carries none, so those paths are unchanged.
- It does not attribute the *stage* that glued the objects (P-0001 limit,
  unchanged). `BS-18` stays open with this narrower note: the wrong dispatch is
  now visible as `UNKNOWN_TOOL` instead of executed under the wrong tool.
- The probe that would have measured the whole path live could not be layered
  inside the wrapper on rc.3 (its row is inserted outside `dsh-remedy`), so the
  two halves are measured separately: the engine by these tests, the runtime's
  answer to the fallback name by the probe run above.

## Reproduction

```
node --test tests/unit/attribution.test.ts
node --test tests/unit/repair-stream.test.ts
node packages/plugin/dist/cli.js verify
```
