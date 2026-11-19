# P-0038 — A platform is not a defect, but the redaction was written for one platform

**Status**: `verified`  **Severity**: `major`  **Surface**: `scripts` + `core/redact.ts`  **Depends on**: P-0004, P-0028

## Symptom

The plugin's runtime is platform-independent: the seam it mounts (`llm/stream`) is
the same object on every OS, and the emitted JavaScript contains no
`process.platform` branch, no shell, no path assumption. The **evidence layer**
was not. Two of the three platforms' home-path shapes went through `redact()`
untouched and would have shipped in an artifact:

| input | before | who produces it |
|---|---|---|
| `/Users/alice/project/x.ts` | **leaked** | macOS: every session path, every `cd` in a captured command |
| `file:///Users/alice/project/x.ts` | **leaked** | macOS file URLs |
| `--Users-alice-Desktop-x--` | **leaked** | macOS session directory key |
| `--home-alice-Desktop-x--` | **leaked** | Linux session directory key |
| `/home/alice/x.ts` | redacted (P-0004) | Linux, covered by the old rule |
| `C:\Users\alice\x.ts`, `C:/Users/…`, `C:\\Users\\…` | redacted (P-0004) | Windows, covered |

Measured with `.tmp/probe-redact-macos.mjs` against the built core: 5 of 8 shapes
leaked before this patch, 0 of 8 after.

## Root cause — two rules, each written for one platform

1. `windows-home` starts with `\b[A-Za-z]:` — a **drive letter**. Linux and macOS
   paths have no drive letter, so that rule can never fire for them. The only
   POSIX rule matched `/home/<name>` and stopped there, so `/Users/<name>` (macOS)
   had no rule at all.
2. `encoded-home` required the drive letter too (`\b[A-Za-z]-Users-…`). The
   session directory is not a path: DSH builds it with `projectKey`, read out of
   `dsh-session-persistence-jsonl/src/format.ts` in `app.asar` (0.2.2-rc.3):

   ```ts
   if (ch === '/' || ch === '\\' || ch === ':') { … readable += '-' … }
   const slug = readable.replace(/^-+/, '') || 'root'
   return `--${slug.slice(0, 251)}--`
   ```

   Every separator becomes one `-` and the key is wrapped in `--…--`. So the
   *same project* encodes as `--C-Users-alice-x--` on Windows,
   `--Users-alice-x--` on macOS and `--home-alice-x--` on Linux — and the rule
   that needed a drive letter could only ever see the first one.

This is the same defect family as P-0004 and P-0028: the rule lived where one
platform wrote, not where every platform writes.

## What changed

`packages/core/src/redact.ts`:

1. `posix-home` now matches `/home/<name>` **and** `/Users/<name>`, anchored to a
   boundary before the slash so `Users` in prose is not a path, and the whole
   segment after the name is kept (`project/x.ts` survives; only the account name
   goes).
2. `encoded-home` acknowledges all three keys: the optional `[A-Za-z]-` drive
   group is now optional, macOS (`Users-`) and Linux (`home-`) are both listed,
   and the `--…--` wrapper is required — which is what makes the rule precise:
   `a-Users-alice-b` used to match and no longer does.

Two rules were deliberately **not** added:

- **`/root/`**: the account name is the same string for every user, so redacting
  it hides nothing and destroys the only part of the path a reader can act on.
- **A generic "drop every absolute path" rule**: it would delete the part of an
  excerpt that says *what* failed, which is the reason the evidence exists.

## Judgement (red first)

`tests/unit/redact-platform.test.ts`, six tests, written before the fix:

| test | before |
|---|---|
| a home path produced on any of the three platforms is redacted (11 shapes) | **red** — five leaked |
| the redaction keeps the shape readable instead of deleting the path | **red** — nothing was redacted to begin with |
| the three encoded keys do not collapse into one another | **red** |
| a healthy string that merely looks similar is left exactly as it was | **red** — `a-Users-alice-b` was over-redacted once the wrapper was added |
| the shipped evidence carries no home path of any platform | green before and after (guards the fixtures) |
| `redact.test.ts` (the P-0004 shapes) | green before and after (no regression on Windows or `/home`) |

The fourth line is the interesting one: the first draft of the new encoded rule
matched `a-Users-alice-b`, and the negative control caught it before the patch
was written — the same shape as P-0022's lesson, applied to a regex.

## What this does not do

- **It does not make the plugin platform-dependent.** Nothing in
  `packages/{core,plugin}/src` reads `process.platform`, spawns a shell or builds
  a path by string concatenation; the audit command is in the reproduction
  section and returns one prose line in `registry.ts`, no code.
- **It does not redact `/root/`.** See above: the name is information, not a
  secret.
- **It does not verify a Windows path on a Linux machine.** The three shapes are
  tested as *strings*, which is what the redactor sees; the platform that
  produced them is not exercised, so this patch cannot claim "tested on macOS".
- **The build scripts stay platform-aware on purpose.** `publish_packages.mjs`
  and `record_install_acceptance.mjs` need `WINDOWS` because Node cannot spawn
  `npm.cmd` without a shell; that is a build concern, not a shipped one.

## Payment

**+0 resident bytes**: the change is in `packages/core/src/redact.ts`, and it
*went down* in emitted size (the rule table's prose moved here, to the patch doc,
under P-0032's rule). Measured: `redact.js` 5 226 → 4 542 before the doc move,
core total 103 781 of 104 000 afterwards. No cap moved.

## Reproduction

```powershell
pnpm run build
node --test tests/unit/redact-platform.test.ts     # the six shapes, and the over-deletion control
node scripts/gate_size.mjs --fast                  # core total
```

The two probes that measured the macOS-shaped homes were one-off and are not shipped;
their readings — 5 of 8 shapes leaked before, 0 after — became the six cases in
`tests/unit/redact-platform.test.ts`. The `/Users` bytes themselves were not produced on
a Mac here (see the platform boundary and P-0048).
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

