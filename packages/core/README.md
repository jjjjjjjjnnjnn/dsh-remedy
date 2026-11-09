# @dsh-remedy/core

Pure repair engine. No I/O, no host, no clock except what the caller passes in.

| Module | Export | What it decides |
|---|---|---|
| `json-split.ts` | `splitTopLevelJsonObjects` | Where one concatenated top-level JSON object ends and the next begins |
| `toolcall-repair.ts` | `repairToolCallArguments` | `unchanged` / `repaired` / `rejected`, with a typed reason |
| `registry.ts` | `PATCHES`, `registryProblems` | What this project claims to fix, and whether the claim is structurally honest |
| `redact.ts` | `redact`, `redactValue` | What must be removed before evidence leaves the machine |
| `verdict.ts` | `judgeRemedy` | `unmeasured` / `quiet` / `repaired` / `degraded` |

## The one invariant

A repair is returned only when **every** fragment parses to a plain object. There
is no partial success, no "best effort", and no rewrite of a value that already
parses.

```ts
import { repairToolCallArguments } from '@dsh-remedy/core'

const result = repairToolCallArguments({
  id: 'call_1',
  name: 'ops_bash',
  arguments: '{"command":"ls"}{"path":"a.ts"}',
})

// result.status === 'repaired'
// result.calls[0].id === 'call_1'
// result.calls[1].id === 'call_1#remedy-1'
```

## Build

```powershell
pnpm run build   # tsc -b
```
