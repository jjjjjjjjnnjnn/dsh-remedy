# P-0015 — Whether `agent/pre-step` can refuse a step without being read as a cancellation

**Status**: `tested`  **Severity**: major  **Surface**: `profile`  **Depends on**: P-0013

## Symptom

`agent/pre-step` has been left unmounted since R20 with one reason written in
three places (P-0013 `limits`, `audit/blind_spots.json` `BS-15` before this round,
and the handoff's seam table):

> "upstream's `PreStepDecision` is `{kind:'reject'}` or `{kind:'enter', messages, …}`
> and a rejected step opens no step, but **what a user sees on rejection has not
> been measured** — it could read as a cancellation."

So a real capability — refusing a step before it costs a token — was blocked on a
sentence nobody had checked. R22's whole lesson is that an unmeasured claim is the
defect; this is the measurement.

## What was measured

A throwaway profile (`.tmp/prestep-home/profiles/probe`) with a bundle
(`.tmp/prestep-probe`) whose only row is:

```yaml
- insert:
    - id: probe-pre-step
      name: prestep-probe
      config:
        reject: true
        reason: the probe refuses every proposed step
```

The listener is `ctx.on('agent/pre-step', async (payload, next) => ({kind:'reject', reason}))`.
It is **not** `next()`-chained because it owns the decision, which is the
contract the loop's own README states for every waterfall.

Run (isolated `DSH_HOME`, so nothing in `~/.dsh` is touched):

```
$env:DSH_HOME=<probe home>
"Reply with exactly: OK" | dsh --profile probe
exit=1
```

The session it wrote (`session-90c06c0e…`) holds **eight events**, and the whole
turn is this:

```
3 agent/inbox/spliced  {"target":"next-turn","start":0,"inserted":[<the user's message>]}
4 turn/start           {"turn":1}
5 agent/inbox/spliced  {"target":"next-turn","start":0,"removedCount":1,"inserted":[]}
6 turn/end             {"turn":1,"reason":{"kind":"blocked"}}
```

That is the answer, and it is precise:

1. **A rejection opens a turn that never opens a step.** There is no `step/start`,
   no `user/message` re-append, no `assistant/*` — the claimed batch is removed and
   the turn closes. The rejection is not a "cancelled step"; it is a **turn that
   ends blocked**, a `turn/end` reason the loop already has a name for.
2. **The claimed input is discarded, not left pending.** `removedCount: 1` with no
   `inserted` and no `outcome: 'canceled'` is the *claim*, not a cancellation
   (`dsh-agent`'s `accountsForClaim` treats `blocked` as an ending that accounts
   for the input, unlike `completed`). So the message is gone; a user who retries
   must retype. That is the real cost of a rejection, and it is now a measured
   fact rather than a fear.
3. **Exit code is `1`**, not `0`. A scripted run can tell that the turn refused
   rather than completed.

## What this does NOT prove

- **The desktop UI's render of `kind:"blocked"` was not measured.** The headless
  profile writes the log above, and the UI bundle in this install contains no
  `blocked` match in its conversation definitions, so what the desktop window
  draws for that turn is still unknown. The seam is safe to *use* (it does not
  pretend to succeed and it does not corrupt a step), but **not yet safe to
  present** as a finished user experience.
- Consequently P-0013's preflight is still not wired to `agent/pre-step`. This
  patch measures the seam; it does not mount a product on it.
- One profile, one provider, one prompt. A rejection inside a multi-step turn
  (steering, `next-step` inbox) was not exercised.

## The decision this enables

The next agent may now write a patch that *uses* `agent/pre-step` — with these
constraints, all measured:

- never reject silently: the user has already lost the typed message, so the
  rejection reason must be surfaced by whatever mounts the row;
- prefer `{kind:'enter'}` with a rewritten message over `{kind:'reject'}` whenever
  the goal is "say something useful" rather than "stop", because only the former
  keeps the input alive;
- the desktop rendering of `blocked` must be measured before this ships to the
  desktop profile.

## Reproduction

```
cd .tmp/prestep-home/profiles/probe
pnpm install --no-frozen-lockfile
$env:DSH_HOME="<repo>/.tmp/prestep-home"
"Reply with exactly: OK" | dsh --profile probe        # exit 1
node .tmp/probe-session.mjs                           # prints the eight events above
```
