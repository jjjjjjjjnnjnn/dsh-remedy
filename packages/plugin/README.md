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
dsh-remedy repair  [<file>] [--name <tool>] [--id <call-id>] [--max-calls <n>] [--truncated] [--json]
dsh-remedy scan    <session.jsonl|directory> [--since <iso>] [--max-files <n>] [--json] [--out <file>]
dsh-remedy explain [--sessions <dir>] [--profile-file <cordis.patch.yml>]
dsh-remedy verify  [--json]
```

`scan` takes one plain `.jsonl` file, a multi-frame `session.v4.jsonl.zstd` log,
or a directory of them; `--since` drops older events and reports how many it
dropped, `--max-files` caps the walk. It also prints the turn census and the
error codes it counted. `repair` reads stdin when no file is given, and a `.json`
fixture through its `arguments` field. `explain` prints, per failure class this
machine actually hit, how often, which patch covers it, and whether that patch is
switched on in the profile named by `--profile-file`; it exits `1` when a class
the host hits is covered by a patch that is switched off here.

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
