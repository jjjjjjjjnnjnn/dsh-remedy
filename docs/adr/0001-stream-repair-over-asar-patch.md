# ADR-0001 — Repair at `llm/stream`, not in the asar and not by retry alone

**Date**: 2026-11-09
**Status**: accepted
**Context**: P-0001 (tool-call fusion). Three routes were available.

## Options

| Route | What it changes | Why it was rejected or kept |
|---|---|---|
| A. `retryPolicy` stop-gap | Adds `MALFORMED_RESPONSE` to `retryableCodes` in the profile | Kept as a fallback, not the fix. A retry re-samples the same defect and can fuse again; it also spends tokens without removing the failure. |
| B. Patch `app.asar` | Rewrites `parseToolCallArguments` in the Electron bundle | Rejected. The fuse is off (`EnableEmbeddedAsarIntegrityValidation = 0`) so it is technically possible, but it is unversioned, invisible to the user, and breaks on every app update. |
| C. Resident plugin at `llm/stream` | Wraps the chunk stream before the agent loop assembles it | **Chosen.** It is the seam that owns the failure, it survives app updates as a normal bundle, and it can refuse to repair what it cannot prove. |

## Decision

Ship route C as `dsh-remedy`. Keep route A documented as a deployment fallback
(`retryOnMalformed`, default 0). Do not patch the asar.

## Consequences

- The repair sees assembled text, not the relay's index assignment; attribution
  stops there (`BS-01`).
- The patch is only as good as the seam contract. If upstream renames
  `llm/stream` or changes the chunk shape, the wrapper must fail loudly rather
  than silently pass chunks it does not understand.
- A `max-tokens` truncation is out of scope by construction (`BS-06`).
