# P-0048 — The platform boundary was prose, and prose is not a criterion

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0038, P-0039

## Symptom

Every outward page says the same thing in slightly different words: verified on
Windows and on Linux, **macOS not measured**. That sentence has been true since R49
and nothing read it. The two places that describe the platform edge — the README's
"does not do" table and the handoff's 明确边界 — are hand-written prose, so:

- a change that breaks on darwin (a path assumption, a `realpath` guard, a shebang,
  a `spawn` without a shell) lands with every gate green;
- the claim "macOS not measured" cannot be distinguished from "macOS not measured
  *yet*" or "macOS tested elsewhere", because nothing records which criteria exist.

## Mechanism

The workflow has two jobs, both shaped the same way: install, `verify`, and
`--mutate`. `macos-latest` is not among them, so no darwin process ever runs the
suite. The sentence in the pages is a promise about CI that CI does not keep.

R55's handoff called this out as "a new criterion, not a sentence", which is the
distinction this patch implements: a job plus a written statement of exactly what
that job proves.

## What changed

1. **A third job**: `.github/workflows/ci.yml` gains `macos` (`macos-latest`,
   node 24, `pnpm install --frozen-lockfile`, `pnpm run verify`,
   `node scripts/gate.mjs --mutate`). It runs the same commands as the other two
   jobs; nothing platform-specific is invented for it.
2. **The criterion is written down** where a reader looks for it (`docs/PUBLISH.md`
   and this document): the job proves that the repository **builds, typechecks, runs
   its suite and catches every gate on darwin**. It does **not** prove that a DSH
   desktop build mounts the plugin on macOS, that the fixtures came from a macOS
   session, or that `P-0038`'s `/Users` shapes are what a real mac writes — those
   remain strings until hardware exists.
3. **Nothing in the runtime changed.** No cap moved, no patch status moved.

## What this does not fix

- **No live artifact can come from it.** CI is not a host: it leaves no
  `data/results/live-*`, so no patch may call itself `verified` on this job. The
  macOS sentence in the limits stays "not measured on hardware".
- **It says nothing about the desktop app.** The Electron shell is not driven by CI.
- **A green macOS job is weaker than the Linux run** the project still does by hand
  in WSL2, because that one also measures the byte account and the installed dist
  CLI. This job only runs the suite.
- **CI minutes.** A third job on every push and tag costs runner time; that is the
  price of turning a sentence into a check.

## Reproduction

```bash
gh run list --repo jjjjjjjjnnjnn/dsh-remedy --limit 1   # the macos job appears beside the two ubuntu jobs
gh run view <id> --json jobs --jq '.jobs[].name'       # ubuntu 22, ubuntu 24, windows, macos
```

The first push that carries this file is the measurement: until it is green, the
criterion is a claim like any other.

## Numbers this page quotes

- One new job; one existing sentence made precise; zero runtime bytes.
