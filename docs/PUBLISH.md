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
5. only then runs `npm publish <tarball> --access public [--otp <code>]`.

Five negative controls in `tests/unit/publish.test.ts` cover the failure, and a
sixth reads the packed tarball itself when it exists, so the packed manifest is
what the test asserts, not the tracked one.

**0.3.1 never reached the registry.** Both packages were bumped to 0.3.1 and
packed — byte-for-byte the 0.3.0 code (the plugin tarball is still 22418 bytes /
20 entries / 74014 unpacked, the core tarball is 11585 bytes / 17 entries / 38582
unpacked), only the manifest differs; `.tmp/pack11/` holds both. It was superseded
by 0.3.2 while `publish_packages.mjs` was still being hardened, so no 0.3.1 tag
exists on npm and nothing needs to be withdrawn.

**0.3.2 is the release that ships.** It carries 0.3.1's manifest fix plus P-0005
(the bare-value reseal) and the seam split that P-0005 forced:

```bash
node scripts/publish_packages.mjs --dry-run          # packs both, checks the manifests
node scripts/publish_packages.mjs --otp <code>       # publishes core, then plugin
```

The exact 0.3.2 tarball bytes go in this file after the packed manifests are
inspected; do not copy 0.3.0's numbers, because 0.3.2 ships 6 fixtures instead of 5
and `dist/*.js` grew by the reseal module.

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
