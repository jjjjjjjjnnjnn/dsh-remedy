# Publishing the public repository

`dsh-remedy/` is already self-contained: `package.json`, `pnpm-lock.yaml`,
`LICENSE`, `.gitignore`, `.github/workflows/ci.yml`, the copy channel and the
evidence. This directory is the public repo root; the container keeps
`dsh-triage/` next to it as a separate project.

## Split without rewriting history

From the container root:

```bash
git subtree split --prefix=dsh-remedy -b public-remedy
git remote add remedy https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
git push remedy public-remedy:main
```

`git subtree split` produces a branch whose root is `dsh-remedy/`, so the public
repository has no `dsh-triage` files and no container README. Do not `git
filter-repo` the container; the other project must keep its own history.

## Repository status (created 2026-11-09)

Done:

- `https://github.com/jjjjjjjjnnjnn/dsh-remedy` exists (public) and `main` has the
  subtree split of `dsh-remedy/`.
- Description and topics come from `docs/copy/repo-metadata.json`.
- Private vulnerability reporting is enabled.
- Dependabot config is committed (`.github/dependabot.yml`).

Pending (human):

- Protect `main`: require the `verify` and `verify (windows, node 24)` checks
  after the first CI run names them.
- Publish npm (below), then update the install section through the copy channel.

## First release (manual, with OTP)

The registry requires a one-time password. The code is never written to the
repository; pass it on the command line only.

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
pnpm -r publish --access public --no-git-checks --otp <code>
```

Two packages publish in order: `dsh-remedy-core` first, then `dsh-remedy`
(which depends on the exact core version). Record the registry state as soon as
`npm view` agrees:

```bash
node scripts/record_publish.mjs --stamp 2026-11-09T20:00:00.000Z --retries 3
```

A red `publish-*.json` is evidence that a copy had not propagated yet; do not
edit it. Wait about five minutes and record a new stamp.

After `ok: true`:

1. Update `docs/copy/facts/public-repo-facts.md` (npm published, install command),
   regenerate every copy file with `--force`, and run `node scripts/gate_copy.mjs`.
2. Commit, push `main`, then `git subtree split` and push again.
3. Tag `v0.1.0` on the public repository.

## Published 0.3.0 (broken); 0.3.1 superseded by 0.3.2 (2026-11-10)

### Use the script, not `pnpm -r publish`

`pnpm -r publish` and `npm publish` from the workspace root are both wrong here,
and both failed on 2026-11-10 with a misleading error:

| Attempt | Error | What it actually meant |
|---|---|---|
| `pnpm -r publish` at the root | `ERR_PNPM_FAILED_TO_PUBLISH ... status 404 Not Found` | pnpm without a one-time password surfaces the registry's authorization answer as 404, not as an OTP prompt |
| `npm publish` at the root | `EPRIVATE ... This package has been marked as private` | the root is `dsh-remedy-workspace`, deliberately private; it is not a publishable package |
| `npm publish` inside `packages/core` | `EOTP: This operation requires a one-time password` | this is the truth; pass `--otp <code>` |
| `npm publish <tgz>` with a logged-out shell (2026-11-11) | `E404 ... 404 Not Found - PUT https://registry.npmjs.org/dsh-remedy-core` | the account could not authenticate; `dsh-remedy-core` was already on the registry at 0.1.0/0.3.0/0.3.2, so the PUT 404 was a permission answer. `npm whoami` answered `401 Unauthorized` in the same shell |

### The 404 of 2026-11-11 was a logged-out shell

The 0.3.3 publish was run by hand and stopped on the first package:

```text
npm error code E404
npm error 404 Not Found - PUT https://registry.npmjs.org/dsh-remedy-core - Not found
npm error 404  The requested resource 'dsh-remedy-core@0.3.3' could not be found or you do not have permission to access it.
```

The tarball was fine (`dsh-remedy-core@0.3.3`, 19 files, 16.8 kB, shasum
`6fbbeb060505cb80c7f454dbab5ea74acd463fdd`) and the registry metadata read
answered 200 in the same session (`GET 200 https://registry.npmjs.org/dsh-remedy-core`),
then the write answered 404. That pair — read 200, write 404 — is what npm
reports when the credential is missing or expired, because the registry refuses
to tell an unauthenticated caller that a package exists. In the same shell
`npm whoami` returned `npm error code E401 / 401 Unauthorized`.

The advice the script printed at the time ("if the registry answered 404 through
pnpm, that is the missing OTP too") sent the operator after a one-time password
that was not the problem. `scripts/publish_packages.mjs` now asks the cheapest
question first: it runs `npm whoami` before packing anything, refuses to publish
when the answer is 401 (or empty), and maps the npm exit status to advice that
names the login before it names the OTP.

```bash
npm login                       # in the shell that will publish
npm whoami                      # must print the npm user name, not E401
node scripts/publish_packages.mjs --otp <code>
```

`--dry-run` prints the same warning but keeps going, so the tarball checks can
still be exercised on a machine that is not logged in.

`scripts/publish_packages.mjs` publishes the two package directories in order
(core, then plugin), refuses to start when the workspace root lost its
`private: true` flag, when the two versions disagree, when `dist/` is missing,
or when a package is not `publishConfig.access: public`:

```bash
node scripts/publish_packages.mjs --dry-run          # print the two commands
node scripts/publish_packages.mjs --otp <code>       # publish for real
```

`--dry-run` runs `npm publish --dry-run` in each package directory, which is the
only check that proves the tarball contents without touching the registry.



### 0.3.0 shipped a manifest npm should never have accepted

The user ran the publish by hand on 2026-11-10 and both packages reached the
registry:

- `dsh-remedy-core@0.3.0` — `modified 2026-11-10T15:28:47.933Z`, `dependencies: {}`, installs fine.
- `dsh-remedy@0.3.0` — `modified 2026-11-10T15:27:18.425Z`, but its published
  `dependencies` read `{"dsh-remedy-core": "workspace:*"}`.

That is not a valid registry spec. A plain install reproduces it:

```bash
npm install dsh-remedy@0.3.0 --dry-run
# npm error code EUNSUPPORTEDPROTOCOL
# npm error Unsupported URL Type "workspace:": workspace:*
```

**Root cause.** `npm publish` publishes the manifest it finds on disk. `pnpm pack`
rewrites `workspace:*` to the exact version; `npm publish` does not. The 0.3.0
plugin tarball in `.tmp/pack9/` has `{"dsh-remedy-core": "0.3.0"}` (that is what
pnpm wrote) — the registry copy came from npm reading the source manifest
directly.

**Fix.** `scripts/publish_packages.mjs` no longer calls `npm publish` in a package
directory. It now:

1. runs `pnpm pack --pack-destination <temp>` for each package,
2. reads `package/package.json` back out of the produced tarball with a
   dependency-free tar-header parser (`packedManifest`),
3. refuses to publish when any of `dependencies` / `peerDependencies` /
   `optionalDependencies` still names `workspace:`, `file:`, `link:` or
   `portal:` (`unpublishableDependencies`),
4. asserts the plugin pins the exact `dsh-remedy-core` version,
5. asks `npm whoami` before it packs and refuses when the shell is not logged in
   (`publishAuthProblems`), so a missing credential is reported as a missing
   credential instead of as a registry 404,
6. only then runs `npm publish <tarball> --access public [--otp <code>]`, and
   maps the npm exit status to advice that names the login before the OTP
   (`npmFailureAdvice`).

Five negative controls in `tests/unit/publish.test.ts` cover the failure, and a
sixth reads the packed tarball itself when it exists, so the packed manifest is
what the test asserts, not the tracked one.

**0.3.1 never reached the registry.** Both packages were bumped to 0.3.1 and
packed — byte-for-byte the 0.3.0 code (the plugin tarball is still 22418 bytes /
20 entries / 74014 unpacked, the core tarball is 11585 bytes / 17 entries / 38582
unpacked), only the manifest differs; `.tmp/pack11/` holds both. It was superseded
by 0.3.2 while `publish_packages.mjs` was still being hardened, so no 0.3.1 tag
exists on npm and nothing needs to be withdrawn.

**Published 2026-11-10.** `dsh-remedy@0.3.2` and `dsh-remedy-core@0.3.2` are the
registry's `latest`; the published plugin manifest pins `"dsh-remedy-core": "0.3.2"`,
so a stranger install of the plugin alone resolves the core (verified in an empty
directory: `npm install dsh-remedy@0.3.2` → `npx dsh-remedy verify` → `OK 6 fixture(s)`,
exit 0). Registry shasums match the packed tarballs byte for byte:
plugin `be75bb501bc894eb7a0822dd01ff2e1e295e528b` (24689 B compressed, 81904 B
unpacked), core `f5b773559be49363238d9665bf2f477e8b918f40` (15864 B compressed,
52828 B unpacked). Evidence: `data/results/publish-2026-11-10T20-00-00.000Z.json`
(`ok: true`, `exact_ok` and `latest_ok` true for both packages). Release:
<https://github.com/jjjjjjjjnnjnn/dsh-remedy/releases/tag/v0.3.2>.

**Published 2026-11-11.** Both packages are the registry `latest`: `dsh-remedy@0.3.3`
(shasum `46ad57ea718be732133979c4b0449f7221ee69c7`, 28378 B compressed, 94769 B unpacked, 29 files)
and `dsh-remedy-core@0.3.3` (shasum `6fbbeb060505cb80c7f454dbab5ea74acd463fdd`, 16776 B
compressed, 55684 B unpacked, 19 files), matching the packed tarballs byte for byte. A stranger
install from the registry alone (`npm install dsh-remedy@0.3.3` in an empty directory, which also
resolves the pinned core) then `npx dsh-remedy verify` gives `OK 6 fixture(s)`, exit 0. Evidence:
`data/results/publish-2026-11-11T08-35-00.000Z.json` (`ok: true`, `exact_ok` and `latest_ok`
true for both packages). Release:
<https://github.com/jjjjjjjjnnjnn/dsh-remedy/releases/tag/v0.3.3>.

The publish itself needed three attempts, and the failures are recorded because they are the
reason the script now preflights them:

1. A logged-out shell answered the write with `404`, which reads as "package missing" but is a
   permission answer; `npm whoami` said `E401`. Fixed by asking `npm whoami` before packing.
2. The next run reached the registry and was answered `EOTP`: the account is
   `auth-and-writes` (`npm profile get tfa`), so every write needs a fresh code. Fixed by
   forwarding the URL npm prints instead of guessing at permissions.
3. The owner published with a 2FA-capable token; both `PUT`s answered `202`. The plugin's
   metadata read answered `404` for a few seconds *after* its own `202` — that is registry
   replica lag, not a failed publish, and it is why `record_publish.mjs` takes `--retries`.

It carries P-0004: the `scan` command now reads the log it is pointed at (a
`session.v4.jsonl.zstd` file used to come back as 236 unreadable lines and zeros), takes a
directory, and supports `--since` with a `before_since` count; the redaction rule now covers the
JSON-escaped and encoded-home shapes a session actually writes. It also splits the CLI so
`cli.ts` stops absorbing every patch.

Three recorded artifacts were rewritten in place by `scripts/redact_artifacts.mjs` to strip home
paths the old rule missed (`live-2026-11-09T17-00-00.000Z.json`,
`live-2026-11-10T14-45-00.000Z.json`, `live-2026-11-10T16-30-00.000Z.json`). Their `produced_by`
and `generated_at` are untouched: this is a redaction repair, not a re-production. A dry run now
reports `0 artifact(s) would change`.

The exact 0.3.3 tarballs were packed into `.tmp/pack14/` *after* the CLI split and read back with
`packedManifest`:

| package | bytes (gzip) | files | unpacked | `dist/*.js` | `dist/*.d.ts` |
|---|---|---|---|---|---|
| `dsh-remedy-core@0.3.3` | 16776 | 19 | 55684 | 35393 | 16994 |
| `dsh-remedy@0.3.3` | 28378 | 29 | 94769 | 65521 | 20389 |

The packed plugin manifest names `"dsh-remedy-core": "0.3.3"`, not `workspace:*`. Publish in the
usual order (core first, then plugin) with a one-time password:

```bash
node scripts/publish_packages.mjs --dry-run      # packs both, checks the manifests
node scripts/publish_packages.mjs --otp <code>   # publishes core, then plugin
```

Byte budget after the second split: `repair-stream.js` 27925 (cap 28000), `cli.js` 8503 (cap
10000), plugin total 65521 (cap 68000). The ceiling moved from one total to per-file shapes,
because two consecutive splits each grew the total while shrinking the file that had to stop
growing.


**0.3.6 is prepared (2026-11-11) and not published yet: P-0009, the windowed scan fix.**

P-0009 is a small, measured reader fix. A windowed scan over the real session
directory reported `unreadable_lines=78` for 78 files: every session log opens with
`{"type":"session",…}` and its instant is the top-level `createdAt`, not `time`, so
the scanner counted the one reliably dated line in every file as unreadable. Measured
on the host: 78 files, 78 headers, 78 headers without a `time` field, in three key
shapes that all carry `createdAt`. After the fix the same command reports
`unreadable_lines=0` with `attempts=67` and `before_since=156209` unchanged in kind.

Only the `session` header falls back to `createdAt`; an ordinary event with no
instant is still one unreadable line, because there is no second field to read. The
header contributes an instant to the reported window and nothing to the census, so
the fault map does not move.

The patch also had to stay inside the byte budget it had just made a rule. Adding the
fallback took `packages/plugin/dist/*.js` to 68351 of 68000, so the fix trimmed the
explanatory comment to two lines and condensed two doc blocks on the same file
instead of adding a tenth module; the emitted total settled at 67997, three bytes
under the ceiling.

0.3.6 tarballs in `.tmp/pack18/`: plugin **29445 compressed / 29 files / 97807
unpacked** (`dist/*.js` 67997, `dist/*.d.ts` 20951, fixtures 3583, root 5276),
shasum `fe85d15a…`; core **19247 / 19 / 63408** (`dist/*.js` 43117, `dist/*.d.ts`
16994, root 3297), shasum `76777609…`, because the registry carries one more patch
record.

Baseline after the change: **192 tests, 0 failing. 6 gates. `--mutate` catches 6 of 6.**

To publish it:

```bash
npm whoami                                     # must answer jjjjjjjjnnjnn
node scripts/publish_packages.mjs --otp <code> # core, then plugin
node scripts/record_publish.mjs --stamp <ISO> --retries 3
```

**Published 2026-11-11: 0.3.5, with P-0008.**

P-0008 is the byte budget. The caps had lived only in the fact pack and in
`README.md`, so `grep -rn "68000" scripts/` returned nothing, and every crossing
was found by hand after the patch had already been built, tested and packed:
55815 bytes after P-0005, 64539 after P-0004 and 70389 on the first P-0006
attempt. Each of those patches shipped with a fully green suite at the time; the
number had no mechanism behind it.

`scripts/gate_size.mjs` measures `packages/plugin/dist/*.js` on every gate run and
refuses four things: a plugin total above 68000 bytes, `repair-stream.js` above
28000, `session-scan.js` above 14000, and any file above 10000 bytes that has no
cap of its own. Measured when it was written: 67908 in total, `repair-stream.js`
27925, `session-scan.js` 13237, `cli.js` 8503, so it starts green rather than green
by exception. `--mutate` compares the real total against a cap one byte below it,
which is how `node scripts/gate.mjs --mutate` reports 6 of 6 gates caught.

P-0008 adds only `scripts/gate_size.mjs`, and `scripts/` is not packed, so the
plugin tarball keeps the same 29448 compressed bytes, 29 files and 97944 unpacked
bytes as 0.3.4. It is not byte-identical: the packed manifest carries the new
version, so the shasum moves from `5f20282e…` to `c1b1b431…`. The core tarball
grows to 18723 compressed / 61553 unpacked / 19 files, shasum `cc9895f8…`,
because the registry now carries one more patch record. `--dry-run` printed
`package size 29.4 kB / unpacked 97.9 kB / shasum c1b1b43185ea49347c394c987dd878c717d8f4f5 / total files 29`
and `dry run finished. Nothing was sent to the registry.`

Baseline after the change: **189 tests, 0 failing. 6 gates. `--mutate` catches 6 of 6.**

The publish: `node scripts/publish_packages.mjs` printed `both packages published`,
and the direct metadata read confirmed `0.3.5` on both names within two minutes
(core `modified 2026-11-11T13:47:32.623Z`, plugin `2026-11-11T13:47:05.132Z`), with
the published plugin pinning `"dsh-remedy-core": "0.3.5"`. `record_publish.mjs` was
run at 14:55 and answered `ok: false` because the core metadata still said `0.3.4`,
then run again at 15:05 and answered `ok: true` — the replica lag, not a failed
publish, which is exactly what `--retries` exists for. Evidence:
`publish-2026-11-11T15-05-00.000Z.json`. A cold directory installed
`dsh-remedy@0.3.5` from the registry and `npx dsh-remedy verify` printed
`OK 6 fixture(s)`. Release: <https://github.com/jjjjjjjjnnjnn/dsh-remedy/releases/tag/v0.3.5>.

Publishing needs the account be `auth-and-writes`, so every write needs a fresh
code:

```bash
npm whoami                                     # a logged-out shell answers 401 first
node scripts/publish_packages.mjs --otp <code> # core, then plugin
node scripts/record_publish.mjs --stamp <ISO> --retries 3
```

The four caps are restated in the fact pack, so a patch that crosses one turns both
`size` and `copy` red until the split happens.

**Published 2026-11-11: 0.3.4, with P-0006 and P-0007.**

P-0007 is the copy channel itself. The two longest outward files, `README.md`
and `CHANGELOG.md`, could not be regenerated at all: every attempt printed
`copy_with_agy: agy exited null` and nothing else. Two different faults shared
that one line. The request is the brief plus the whole fact pack plus the pattern
notes, and it measured 35509 characters for the changelog and 33530 for the readme
against the 32767 character cap on one Windows command line, so `spawnSync`
failed with `ENAMETOOLONG` before agy ever started and reported a null status. A
generation that instead outlived the 600000 ms spawn timeout was killed, which also
leaves a null status.

The channel now chooses its transport from the request length: at or under 30000
characters the prompt still travels on argv exactly as before, and above it the
prompt travels over stdin as one `stream-json` user event with the answer read from
the final `result` event. A spawn that never started is named by its own code.
The timeout is half an hour. The rules live in `scripts/lib/agy-channel.mjs` so the
fourteen unit tests can exercise them without spending a model call.

The channel touches nothing the plugin mounts, so P-0007 is `tested` and will stay
`tested`.

The packed 0.3.4 plugin is unchanged at 29448 bytes (P-0007 lives under `scripts/`,
which is not packed); the core grew by the two registry entries:

| package | bytes (gzip) | files | unpacked | `dist/*.js` | `dist/*.d.ts` | sha1 |
|---|---|---|---|---|---|---|
| `dsh-remedy-core@0.3.4` | 18202 | 19 | 59864 | 39573 | 16994 | `38400db9779cea1175864977b888a407d56f9f99` |
| `dsh-remedy@0.3.4` | 29448 | 29 | 97944 | 67908 | 21177 | `5f20282efe981cf9d1039e4273853b37702efc2f` |

The per-file caps did not move: `repair-stream.js` 27925 of 28000, `cli.js` 8503
of 10000, plugin total 67908 of 68000. Core has no per-file cap because the
plugin is what loads at startup.

Baseline: `189 tests, 0 failing. 5 gates. --mutate catches 5 of 5.`

`node scripts/publish_packages.mjs` published both packages and answered `both packages
published`. The registry then reported `latest = 0.3.4` for both names, plugin shasum
`5f20282efe981cf9d1039e4273853b37702efc2f` and core shasum
`38400db9779cea1175864977b888a407d56f9f99`, matching the packed bytes above. `npm view` kept
answering `0.3.3` for a while after the publish had already succeeded; that is the replica lag
recorded further up, not a failed release. A cold directory installed `dsh-remedy@0.3.4` from the
registry and `npx dsh-remedy verify` answered `OK 6 fixture(s)`. Publish evidence:
`data/results/publish-2026-11-11T12-30-00.000Z.json`.

**0.3.4 carries P-0006 (published 2026-11-11).** The `scan`
command now counts how every turn ended (`completed`, `max_tokens`, `aborted`, `error`) and names
every `reason.error.code`, instead of reporting only the `MALFORMED_RESPONSE` turns. On this
machine that turns 44 visible endings into a 287-turn census: 92 completed, 88 `max_tokens`,
99 error and 8 aborted, with the codes `MALFORMED_RESPONSE` 44,
`UNSUPPORTED_REASONING_EFFORT` 36, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1 and
`INVALID_REQUEST` 1. The census is reported and never promoted into a finding: the exit code
still turns on `fused_calls` and `fusion_failures`. Truncated turns stay unfixed on purpose, and
P-0006 stays `tested` because it moves an offline reader.

The byte budget was hit again, by the patch itself: writing the census helpers as a ninth module
(`turn-census.ts`) took `dist/*.js` from 65521 to **70389**, 2389 bytes over the 68000 cap. The
module was deleted and its helpers inlined, which settles the total at **67908** (92 bytes under
the cap). The per-file caps are unchanged: `repair-stream.js` 27925 (cap 28000), `cli.js` 8503
(cap 10000), plugin total 67908 (cap 68000).

The exact 0.3.4 tarballs were packed into `.tmp/pack15/` and read back with `packedManifest`:

| package | bytes (gzip) | files | unpacked | `dist/*.js` | `dist/*.d.ts` | sha1 |
|---|---|---|---|---|---|---|
| `dsh-remedy-core@0.3.4` | 17381 | 19 | 57665 | 37374 | 16994 | `9e53fbd363a19e6fc66ee5697322c42926935b9a` |
| `dsh-remedy@0.3.4` | 29448 | 29 | 97944 | 67908 | 21177 | `5f20282efe981cf9d1039e4273853b37702efc2f` |

The packed plugin manifest names `"dsh-remedy-core": "0.3.4"`, not `workspace:*`.
`--dry-run` exited 0 and reported `package size 29.4 kB / unpacked 97.9 kB / shasum
5f20282efe981cf9d1039e4273853b37702efc2f / total files 29`. The preflight ran `npm whoami`
and got `jjjjjjjjnnjnn`; `npm profile get tfa` answered `E403` this time (an endpoint
permission answer, not an auth failure), and the preflight deliberately depends on `whoami`
only. Publish in the usual order with a fresh one-time password:

```bash
node scripts/publish_packages.mjs --dry-run      # packs both, checks the manifests
node scripts/publish_packages.mjs --otp <code>   # publishes core, then plugin
```

**0.3.2 is the release that ships.** It carries 0.3.1's manifest fix plus P-0005
(the bare-value reseal) and the seam split that P-0005 forced:

```bash
node scripts/publish_packages.mjs --dry-run          # packs both, checks the manifests
node scripts/publish_packages.mjs --otp <code>       # publishes core, then plugin
```

The exact 0.3.2 tarballs were packed twice into `.tmp/pack12/` and read back with
`packedManifest` before anything was sent to the registry:

| package | bytes (gzip) | entries | unpacked | sha256 |
|---|---|---|---|---|
| `dsh-remedy-core@0.3.2` | 15864 | 19 | 52828 | `852c77abe32bd7c0fffb19eac269dd68a25bebcc3ca3e5cbff38184711eeb9de` |
| `dsh-remedy@0.3.2` | 24689 | 25 | 81904 | `0c7b26a7689ba5d175c8722924bec23ad2dab2059d20378d2c705a01560b524f` |

The packed plugin manifest names `"dsh-remedy-core": "0.3.2"`, not `workspace:*`;
`--dry-run` reported the same 25 files / 81.9 kB unpacked / sha1
`be75bb501bc894eb7a0822dd01ff2e1e295e528b`. Do not copy 0.3.0's numbers: 0.3.2
ships 6 fixtures instead of 5 and `dist/*.js` grew by the reseal module.

**0.3.0 of the plugin cannot be withdrawn.** npm only allows unpublishing within
24 hours of publication, and only with the same OTP path; the usable answer is a
working 0.3.2 plus an explicit "do not install 0.3.0" line in the README and the
changelog. `dsh-remedy-core@0.3.0` is fine, so it can stay.

- 0.2.0 was never published; 0.3.0 superseded it, and the changelog keeps every
  entry so a skipped release stays visible instead of silently absent.
- Publish order matters: core first, then the plugin, because the plugin pins the
  exact core version.
- `record_publish.mjs` refuses to overwrite a same-named artifact, so give it a new
  `--stamp` and `--retries 3`. It records what the registry actually answers, not
  what the script hoped it would.
- After publishing, `record_publish.mjs` records the settled state, then the
  container commit, the public-branch refresh, the push and `gh release create`
  follow.

## Published 0.1.0 / 0.1.1 (2026-11-09 → 2026-11-10)

- `dsh-remedy@0.1.1` and `dsh-remedy-core@0.1.0` are on the public registry;
  `latest` is `0.1.1` for the plugin and `0.1.0` for the core.
- 0.1.1 fixes a real published-artifact defect: the 0.1.0 tarball omitted the
  fixtures, so `dsh-remedy verify` exited 3 from an installed copy. The prepack
  step now copies them into `fixtures/`, and a stranger install passes 5/5.
- Evidence: `data/results/publish-2026-11-10T06-40-00.000Z.json` (`ok: true`).
  The earlier `publish-2026-11-10T00-10-00.000Z.json` is red on purpose: the
  registry copy landed seconds after the record. Do not edit it.
- The `@dsh-remedy` scope does not exist on npm, so the core package is unscoped
  (`dsh-remedy-core`).

## After the first release

- The README install section says "after the first release"; regenerate it from
  the fact pack once npm is live, then re-run `node scripts/gate_copy.mjs`.
- Add the npm badge to the README through the copy channel, not by hand.
- Update `docs/copy/facts/public-repo-facts.md` (npm status) and regenerate all
  artifacts; `gate_copy` fails every stale entry until you do.

## What must not travel

- `.tmp/` (pack tarballs, journals, live scratch) is gitignored.
- The desktop profile under `~/.dsh` is never copied into the repo.
- `dsh-triage` is a sibling project, not part of this repository.
