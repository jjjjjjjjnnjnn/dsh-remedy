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
