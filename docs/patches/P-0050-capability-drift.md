# P-0050 — A resumed session can lose a tool it had already used, and nothing counted that

**Status**: `tested`  **Severity**: `major`  **Surface**: `cli`  **Depends on**: P-0004, P-0006

## Symptom

Upstream **#12348** reports one shape twice, from two angles: a session resumed under
a profile that no longer declares a tool keeps the model's memory of it, the model
calls it, and the host answers `UNKNOWN_TOOL`. Nothing on this machine could say
whether that had happened here, because no reader looked at a `request/header` event
at all — `scan` read attempts, turns, codes and (since P-0044/P-0047) whether a turn
answered, and the tool set a request carried was never part of the report.

## What was measured first

The rule had to be narrower than the report, because a log cannot prove what a model
remembers. What a log *can* prove is that the request set moved under a session:

| measured on this machine (`~/.dsh/sessions`, 114 files) | value |
|---|---|
| `request/header` events | **293** — 109 `initial`, 50 `resume`, 43 `change`, 91 `series` |
| `tool/call` / `tool/result` events | 25 062 / 25 091 |
| tools a header stopped declaring | 129 |
| of those, tools this session had **already called** | **9**, in **5** sessions |
| of those 9, at a `resume` header | **7** (the other 2 at `change`) |
| calls made to a dropped tool *after* the drop | 6, in 2 sessions |
| the host's answer to those | **5 of 6 carry `error.code: UNKNOWN_TOOL`** |

Two negative shapes matter as much as the positive one: **120 of the 129 drops were
tools nobody had called**, and a call made *after* the drop is not evidence (the model
had already been shown a set without it). Both are refused by the rule, and both are
pinned by a test.

`series` headers were measured to add and drop nothing (91 headers, 0 either way), so
they neither lose nor restore a tool; an unknown `reason` is treated the same way,
because inventing a reason is inventing a finding.

## Mechanism

`request/header` events carry the whole request shape:
`data.reason` (`initial` / `resume` / `change` / `series`), `data.header.tools[]`
(each with a full `parameters` schema), and `data.header.config`. A `resume` therefore
persists what the new request actually carried, and the next `resume` can be compared
with it. The host answers a call to an undeclared tool with
`tool/result` → `error.code: "UNKNOWN_TOOL"`, `content: [{"type":"text","text":"Error:
unknown tool \"ops_stat\""}]`; in one session that happened four times in one step
(`8e75991d`, seq 1010–1017), which is what makes this worth a counter and not a
footnote.

## What changed

1. **One rule in core** — `packages/core/src/capability.ts`:
   `lostTools(headers, calls)` and `capabilityDrift()` (the same state, folded event by
   event, so a scanner does not have to hold a second array). A loss is booked once per
   `(session, tool)` at the first `resume`/`change` header that stopped declaring it,
   and only when the session had called it **before** that header.
2. **`scan` reports it** — `dropped_tools` on the human line, in `--json` and in `--out`,
   and each `rows` entry carries its own count. This is a reader: no verdict, no exit
   code, no repair, exactly as P-0044 and P-0047 are readers.
3. **Nothing in the runtime changed.** No resident byte, no seam, no cap: the patch
   lives in the CLI half and in the engine.

## What this does not fix

- **It does not claim what the model remembers.** The rule proves the request set lost
  a tool the session had used; the `UNKNOWN_TOOL` answers are quoted from the sessions
  where they were actually written, and nothing else is inferred.
- **It does not refuse a resume.** Whether a deployment should hard-fail a session
  whose required capability disappeared is #12348's open question to upstream; this
  project's rule is "name the shape, never decide the business".
- **It cannot see a change the header does not record.** A provider that never re-sends
  tools (so no `request/header`), or a tool added without a header, is unmeasured rather
  than clean — 12 of the 114 files on this machine carry no header and stay so.
- **`change` is counted the same as `resume`.** The host uses `change` for a deliberate
  request-shape change; the rule cannot tell an operator's intent from a resume's
  accident, and it says so instead of guessing.
- **The count is per session, not per turn.** A session that lost a tool and then
  recovered it later is one loss, because that is what the log shows at the first
  header; a second removal after a re-add would be counted only if it is re-booked,
  and this rule deliberately does not re-book.

## Reproduction

```bash
node --test tests/unit/capability-drift.test.ts        # 9 cases, negative controls included
node scripts/record_capability_drift.mjs --stamp <ISO> # refuses to write unless the scanner agrees
node packages/plugin/dist/cli.js scan ~/.dsh/sessions   # dropped_tools=9
```

## Numbers this page quotes

- 114 files, 293 headers (109 / 50 / 43 / 91), 25 062 calls, 9 losses in 5 sessions.
- 129 tools dropped, 9 of them after a call, 6 later calls, 5 answered `UNKNOWN_TOOL`.
- Zero emitted runtime bytes; the CLI half paid for the field in comments (P-0032).
