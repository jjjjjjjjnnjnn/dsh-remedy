# P-0035 — A patch-layer row promised a module nothing resolved

**Status**: `verified`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0001 (namespace gate), P-0021 (dead exports)

## Symptom

Every row this bundle ships says `name: dsh-remedy`. That is a promise: the loader will import
that module, and the plugin will start. Nothing in this repository checks it, and the host does
not check it either — it resolves lazily, so a row that no longer resolves reports
`never started` **at use time**, not at load time.

Upstream has the measured cost (`deepseek-ai/deepseek-harness#12318`, 2026-11-05, 0.2.2-rc.1):

```yaml
- id: tool-subagent-list-agents
  name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'
```

That subpath was removed in the upgrade. The plugin failed to load, every session **resume**
failed with `RemoteError: tool-subagent-list-agents … never started`, and the symptom looked like
"one broken session" while the defect was one global config line. The reporter's own suggestion is
the one implemented here: "validate at startup that every module export referenced by the config
resolves".

## Root cause

The namespace gate (`scripts/gate_namespace.mjs`) reads the rows and checks four things: ids start
with `remedy-`, no upstream id is reused, the module specifier is the bare package name, and no
bare `- id:` row patches somebody else's entry. It never asks the one question that decides whether
the bundle mounts: **does the manifest export what this row names?**

So the only check was by hand, in `tests/governance/ledgers.test.ts`, which asserts every id starts
with `remedy-` — a second, weaker copy of the same shape rule.

## What changed

`tests/governance/profile-patch-resolution.test.ts`:

1. reads the rows out of `packages/plugin/cordis.patch.yml` (unquoting a YAML scalar, because a
   scoped name has to be quoted);
2. resolves each `name:` against the package's own `exports` map, or — for a name in another
   package — against `dependencies` / `peerDependencies`;
3. requires the file the export points at to exist in `dist`, naming the missing path.

Three of the four tests are negative controls and each is a real shape:

| test | what it pins |
|---|---|
| every row the shipped patch layer mounts resolves to a built module | the current bundle |
| the resolver reports the upstream shape that bricked a resume | the exact `#12318` row must fail, and its replacement must pass |
| an undeclared package is refused before the host explains "never started" | a stray `node_modules` on the author's machine must not make a row look valid |
| the shipped row names the package itself, so it cannot drift into a subpath | the row may not silently become `dsh-remedy/something` |

A resolver that returned "fine" for every input would pass the first test and prove nothing, which
is why the second test is the same function fed the known-bad row.

Cost: **zero runtime bytes.** This is a build-side guard; the tarball is unchanged by it.

## Judgement (red first)

The first draft of the resolver compared the raw `name:` including its quotes, so the #12318 row
was refused for the wrong reason ("not declared by …") and the test that pins the *export* message
failed. Fixed by unquoting the scalar; the test then reported `no export "./list-agents"`, which is
the upstream failure itself. The negative control caught a resolver that was right by accident.

## What this does not do

- **It does not validate at load time.** That would be a resident seam, and the host is where
  `never started` is produced. This is a build-side test over two files, one step earlier.
- **It cannot prove the host resolves a row the same way.** The mapping used here (`exports` →
  `dist/<name>.js`) is the repository's own convention, pinned by P-0021's dead-export test; a host
  that resolved differently would still be right in its own terms.
- **A row naming another package is only checked for declaration.** A declared package whose
  subpath does not exist would still pass, because this repository does not read other packages'
  manifests.
- **It does not cover the host's own bundles.** It reads this package's patch layer, not the
  bundles a profile composes from upstream.

## Reproduction

```powershell
node --test tests/governance/profile-patch-resolution.test.ts   # 4 tests, 1 of them the #12318 shape
node scripts/gate_namespace.mjs                                 # shape rules, unchanged
node scripts/gate_size.mjs                                      # tarball bytes unchanged
```
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

