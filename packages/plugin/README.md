# dsh-remedy (plugin)

The resident half of the patch set. It mounts at `llm/stream` and
`agent/request-error`, repairs a proven fusion, names the refusals it will not
retry, and says nothing when there is nothing to repair.

Installing this package also installs `dsh-remedy-core`: the plugin pins the
exact version of that engine, so one install resolves both. The split is
deliberate rather than packaging noise — the engine does no I/O and takes no
host, so it can be embedded and tested on its own, while this package owns the
seam, the configuration and the command line. Because the pin is exact, the two
versions always ship together; a version skew is refused before anything is
published.

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
