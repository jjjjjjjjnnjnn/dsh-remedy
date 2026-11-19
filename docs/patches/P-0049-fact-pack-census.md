# P-0049 — The pack counted a patch set it no longer described, and the changelog stopped one release short

**Status**: `verified`  **Severity**: minor  **Surface**: `scripts`  **Depends on**: P-0014, P-0046

## Symptom

Measured while taking over the R57 tree (2026-11-16), by reading the fact pack
against the built registry instead of against its own summary:

| the fact pack says | the registry holds |
|---|---|
| `41 patches are registered` | **48** |
| `Two patches sit on the second resident seam, agent/request-error: P-0011 … and P-0013` | P-0013 moved to **`agent/error`** in P-0045 (shipped in 0.4.16); that seam holds 1, `agent/error` holds 2 |
| `Eight patches live in the CLI half` (lists 8) | **10** — P-0042 and P-0047 are missing |
| `Twenty-one patches are build-side` (lists 21) | **24** — P-0043, P-0046 and P-0048 are missing |
| `The other 37 are tested` | **39** |

and `CHANGELOG.md`'s newest section was `## [0.4.15]` while npm served **0.4.16**:
the release that shipped P-0045 and P-0046 has no entry, so a stranger reading
the changelog learns that the newest release is one that is not.

Every gate was green on this tree, and the two screens that quote the pack were
right: `README.md` says forty-eight. The pack was the only page still counting a
smaller project — which is the direction that matters, because the pack is the
file every other outward number is checked against.

## Mechanism

Three checks already read the pack, and none of them asks a question a count
could fail:

- `gate_copy` compares **outward files with the pack** (every prose number must
  exist in it) and **the pack with the manifest** (its bytes and its hash). The
  pack is the source, so nothing compares the source with the registry.
- `tests/governance/facts-truth.test.ts` reads four specific claims from the
  pack: the `- Version:` line, `pins "dsh-remedy-core": "X"`, "X is the previous
  release", and every patch id it quotes. A count sentence and a seam sentence
  are not among them.
- The changelog rule inside that file resolves only the **previous** release's
  section. On this tree the previous release is 0.4.15, which has one, so the
  rule passed while the current release had none.

That is P-0046's own sentence one layer down: a page can be perfectly consistent
with the pack and still say the wrong thing, because the pack is the thing nobody
compares.

## What changed

1. **`tests/governance/fact-pack-census.test.ts`**, three rules, each with its
   own negative control:
   - every id in `PATCHES` appears in the fact pack (the same rule P-0046 put on
     the two first screens, applied to the pack itself);
   - the pack's own counts equal the registry: the `N patches are registered`
     sentence, the verified/tested split, and each seam bullet's count **and id
     list** against that surface's actual set — so a patch named in the wrong
     seam fails instead of merely being present;
   - every version the pack calls published has a `## [x.y.z]` section in
     `CHANGELOG.md`, and the newest section is one of them.
2. **The pack's census was rewritten** to what the registry holds: 48 registered,
   9 `verified` / 39 `verified`, 10 on `llm/stream`, 1 on `agent/request-error`
   plus 2 on `agent/error` (P-0013 and P-0045), 10 in the CLI half (P-0042 and
   P-0047 added), 24 build-side (P-0043, P-0046 and P-0048 added), and P-0015 as
   the one measurement rather than a mount.
3. **Two changelog sections were written through the copy channel**: `[0.4.16]`
   (P-0045, P-0046 and the retry witness) and `[0.4.17]` (P-0047, P-0048 and the
   byte payment), so the file's own Keep-a-Changelog header stops being a claim
   about a history it omits.
4. **Nothing in the runtime changed.** No emitted byte, no cap: the pack, the
   changelog and one test file are not in any package.

## What this does not fix

- **It proves presence, not placement, for rule 1.** A bullet's id list is
  compared, but the parenthetical beside an id is prose the rule does not read: a
  stale one-sentence description of a patch still passes.
- **The seam census is read from the bullet shape the pack uses today** — a count
  word, the surface in backticks, a colon and an id list. A rewrite into
  paragraphs would make the rule red rather than wrong, which is the safe
  direction, but it is a constraint on prose rather than a truth about the code.
- **English count words are parsed up to ninety-nine and only in the forms the
  pack writes** (`Two`, `Ten`, `Twenty-one`). A pack that writes digits in one
  bullet and words in another is accepted, because both are read.
- **The changelog rule reads section headers, not contents.** A section can be
  empty and pass; what it prevents is a published version that is absent.
- **The published version is still the pack's claim, not npm's.** Offline, the
  rule compares the pack with this repository; `npm view` remains the release
  step's own evidence.

## Reproduction

```bash
node --test tests/governance/fact-pack-census.test.ts
# before the fix, on the R57 tree:
#   the fact pack says 41 patches are registered, the registry holds 48
#   agent/request-error names P-0013, which lives on agent/error
#   the CLI half lists 8 ids, the registry has 10
#   the build side lists 21 ids, the registry has 24
#   the pack says 37 tested, the registry has 39
#   CHANGELOG's newest section is 0.4.15, the pack calls 0.4.16 published
```

## Numbers this page quotes

- Before the fix (measured on the R57 tree): **48** patches, 9 `verified` / 39
  `verified`; per seam 10 / 1 / 2 / 10 / 24 / 1. The pack said 41 registered, 37
  tested, and listed 8 CLI and 21 build-side ids.
- Five stale sentences in the pack, two missing changelog sections (`0.4.16` and
  `0.4.17`).
- After the fix: **49** patches, 9 `verified` / 40 `verified`; per seam 10 / 1 / 2 /
  10 / 25 / 1 (the build side gains this record). The pack now says 49 registered
  and names every one of them.
- Zero emitted bytes: the fix is a test file, the pack and the changelog. The
  engine came down 2 559 bytes because the payment compacted records, not because
  of this patch: core 103 868 → 101 309, `registry.js` 66 425 → 63 866.
## R72 witness

The status is `verified` on the evidence of `data/results/live-r72-2026-11-19T00-00-00.000Z.json`, which records this patch's claim and names the witness kind (suite, CLI, gate, probe or absent) beside the row. That artifact is a build/host witness at one stamp, not a resident-journal repair; its `not_proven` section says what it does not cover.

