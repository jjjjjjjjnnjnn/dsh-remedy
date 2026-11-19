# P-0039 — A recorder that only worked on Windows, and a probe that only worked on Windows

**Status**: `verified`  **Severity**: `minor`  **Surface**: `scripts`  **Depends on**: P-0004, P-0038

## Symptom

Two of this repository's own tools silently assumed a Windows environment, and the
failure message never said so:

| tool | on Windows | on Linux / macOS (measured on WSL2 Ubuntu 26.04) |
|---|---|---|
| `scripts/record_session_sample.mjs` | finds `%USERPROFILE%\.dsh\sessions` | computes `.dsh/sessions` (relative!), exits **3** with `no session directory at .dsh/sessions` |
| `scripts/replay_malformed_corpus.mjs` | same | same |
| `scripts/probe_withdrawn_reachability.mjs` | same | same |
| `scripts/record_live_mount.mjs` | already portable (`homedir()`) | works |

Measured, not inferred: on the Linux box `USERPROFILE=[<unset>]` and
`HOME=/home/<name>`, so `process.env.USERPROFILE ?? ''` produced the empty string and
`join('', '.dsh', 'sessions')` produced a **relative** path. The recorder then
reports "no session directory" — which reads as "this machine has no sessions",
not "this script does not know where you keep them".

A second, smaller shape from the same round: `DSH_SESSIONS=` (exported empty) was
accepted as the root, so an empty variable pointed every recorder at the current
directory.

## Root cause — two lines, one platform

```js
const sessionsRoot = process.env.DSH_SESSIONS ?? join(process.env.USERPROFILE ?? '', '.dsh', 'sessions')
```

`USERPROFILE` is the Windows name for the home directory. POSIX sets `HOME`
(and `os.homedir()` answers on all three platforms). The `?? ''` chain turned
"the variable is missing" into "the home is the empty string", which is the one
input a path join should never receive.

This is the same family as P-0038: **the rule was written where the author's
machine wrote, not where every machine writes.** P-0038 was the redactor, this is
the reader.

## What changed

`scripts/lib/session-root.mjs`, one exported function:

1. `DSH_SESSIONS`, when set **and non-empty**, wins (a probe profile writes its
   sessions elsewhere, and the recorders must stay pointable).
2. Otherwise `HOME || USERPROFILE || homedir()`, then `join(home, '.dsh', 'sessions')`.
   `HOME` first because a WSL shell inherits `USERPROFILE` from Windows while the
   process lives in `HOME`.
3. An empty home can no longer reach `join`: the fallback is a literal `~/.dsh/sessions`
   instead of a relative path.

Three recorders now call it (`record_session_sample`, `replay_malformed_corpus`,
`probe_withdrawn_reachability`). `record_live_mount.mjs` already used `homedir()`
and is unchanged — it was the one that worked on both platforms, which is how the
inconsistency survived.

## Judgement (red first)

`tests/unit/session-root.test.ts`, six tests, written before the function existed:

| test | before |
|---|---|
| an explicit `DSH_SESSIONS` wins | **red** — no such function |
| an empty `DSH_SESSIONS` is ignored | **red** |
| the root is the home directory on every platform | **red** — the old expression returns `.dsh/sessions` |
| `HOME` wins over `USERPROFILE` | **red** |
| with no environment at all the answer is still absolute | **red** |

Two of the reds are the measured Linux failure (`/home/alice` → `.dsh/sessions`);
two are the Windows shell under WSL; one is the empty override.

## What this does not do

- **It does not make the recorders run on macOS.** The POSIX branch they now take
  is the Linux one, measured here; macOS is the same `HOME` shape but this round
  had no macOS box, so the claim is "one POSIX host", not "every POSIX host".
  (Apple hardware needs its own licence and CI runner; a VM of macOS is not
  something this repository can legally fetch or boot.)
- **It does not change the plugin.** The resident layer never read `USERPROFILE`;
  only these offline recorders did.
- **It does not add a macOS-shaped test fixture.** The redaction shapes are
  asserted as strings (P-0038); the session-root behaviour is asserted as paths.
  Neither is evidence of a macOS run.

## Payment

`scripts/` is not packed, so the tarball and both byte caps are unchanged. The
Linux live artifact (`data/results/live-linux-2026-11-15T10-00-00.000Z.json`)
is the evidence for the empty-override and POSIX facts.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/session-root.test.ts          # 6 tests
# On a POSIX host:
#   node -e "console.log(process.env.USERPROFILE ?? '')"   -> empty
#   DSH_SESSIONS=$HOME/dsh-l6-home/sessions node scripts/record_session_sample.mjs --until <ISO> --stamp <ISO>
```
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

