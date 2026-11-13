# P-0018 — A Windows exit code printed as a bare number sent an operator hunting the wrong cause

**Status**: `tested`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0007

## Symptom

On 2026-11-12 the 0.3.6 publish failed like this:

```
$ node scripts/publish_packages.mjs
...
stopped: npm exited 3221226505 in packages/core
If npm asked for a one-time password, re-run with --otp <code>;
if the publish was refused with no password prompt, check `npm whoami` first.
```

Every word of that advice is about the wrong cause. `3221226505` is `0xC0000409`
— a Windows `STATUS_STACK_BUFFER_OVERRUN` raised by the runtime — and **both npm
debug logs for that attempt stop right after the tarball notice with no HTTP
request at all**. Nothing was ever sent to the registry, so a 401/404/EOTP reading
cannot apply. The operator went looking for a credentials problem while the actual
remedy was "run the direct call", which is what succeeded twice that same day
(`+ dsh-remedy-core@0.3.6`, exit 0).

## Why it lasted

`npmFailureAdvice(status)` is a deliberate, careful function: it maps 401, 403,
404, 402 and 429 to their real meanings, and P-0007's transport lessons are in it.
But it only understands **answers**. A process killed before it speaks has no
answer, so `3221226505` fell through every branch into the generic
"if npm asked for a one-time password" tail — advice shaped for a conversation that
never happened.

This is the same family as P-0007 itself: two different faults printing one
unreadable line. There, a null status covered both `ENAMETOOLONG` and a timeout;
here, a number that is not an HTTP status wore the description of one.

## What changed

`scripts/publish_packages.mjs`:

```js
export function windowsStatusAdvice(status) {
  if (typeof status !== 'number') return []
  ...
  if (status === 3221226505) return asException('C0000409')   // STATUS_STACK_BUFFER_OVERRUN
  if (status === 3221225477) return asException('C0000005')   // access violation
  return []
}
```

The advice it returns says three things, each measured rather than assumed:

- the number is a Windows exception (`0x...`), not a registry answer;
- both debug logs for that attempt stop after the tarball notice with no HTTP
  request, so nothing was sent;
- re-run `npm publish <tarball> --access public` in the package directory — the
  direct call is what succeeded on 2026-11-12.

The call site now checks this **before** `otpAdvice` and `npmFailureAdvice`, so a
killed process can no longer be described in HTTP terms.

`tests/unit/publish.test.ts` gained two tests (22 total in that file): one pins
that both Windows codes produce advice naming the exception, and one is the
negative control — `0, 1, 402, 403, 404, 429, null, undefined` must **not** take
that branch, so a real 404 still gets the 404 advice.

## What this does not do

- It names two codes, because those are the two this machine produced. A third
  Windows exception still prints its raw number; the branch is a list, not a rule.
- It does not retry the publish. Publishing is a decision about the registry, and
  the script's existing rule is that the operator makes it.
- It cannot prove the crash was the runtime rather than npm misbehaving; what it
  proves is the absence of an HTTP request in both logs, which is why the wording
  is "before it answered the registry" rather than "Windows broke npm".
- No live artifact is possible: this is advice printed by a build script.

## Reproduction

```
node --test tests/unit/publish.test.ts        # 22 pass; the two new cases included
node -e "import('./scripts/publish_packages.mjs').then(m => console.log(m.windowsStatusAdvice(3221226505)))"
```
