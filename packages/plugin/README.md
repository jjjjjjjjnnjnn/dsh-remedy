# dsh-remedy (plugin)

The resident half. It mounts at `llm/stream`, repairs a proven fusion, and says
nothing when there is nothing to repair.

## Mount

`cordis.patch.yml` adds one row through `insert:`:

```yaml
- insert:
    - id: remedy-stream
      name: dsh-remedy
      config:
        repair: true
        retryOnMalformed: 0
        maxCalls: 8
```

`dsh-remedy` must be the **bare** package specifier: the loader resolves
`dist/index.js` from it.

## Config

| Key | Default | Meaning |
|---|---|---|
| `repair` | `true` | Wrap `llm/stream` |
| `retryOnMalformed` | `0` | Retries per step after `MALFORMED_RESPONSE`; a stop-gap, not the fix |
| `maxCalls` | `8` | Ceiling on calls synthesized from one fused block |
| `journalPath` | unset | Append redacted repair events as JSONL; no writes when unset |
| `log` | `true` | One mount line through `ctx.logger` |

## CLI

```
dsh-remedy status  [--json] [--journal <file>]
dsh-remedy repair  [<file>] [--name <tool>] [--id <id>] [--truncated] [--json]
dsh-remedy scan    <session.jsonl> [--json] [--out <file>]
dsh-remedy verify  [--json]
```

Exit codes: `0` ok · `1` finding · `2` usage · `3` unavailable.

`scan --out` writes the report and a `.sha256` sidecar. A report that finds
fusion exits `1`, because a dead turn is a finding even when the file is valid.

## What the wrapper emits

On a proven fusion it replaces the terminal error with:

```
block-end(index=0, id=<original>)
block-end(index=<next>, id=<original>#remedy-1)
...
finish{kind:'stop'}
```

Everything else passes through unchanged.
