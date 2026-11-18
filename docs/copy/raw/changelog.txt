# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.4.19] - 2026-11-18

### Added

- **P-0053 — a chunk this plugin cannot read is passed through, not turned into its own
  exception.** A neighbouring plugin can hand the `llm/stream` wrapper a `null` chunk, a
  `block-end` whose `arguments` is not a string, a `block-end` with no `block`, or a
  `finish` with no `reason`. On the 0.4.18 bytes each of those ended the turn with a
  `TypeError` raised by this plugin, because the loop read `chunk.type`, `chunk.block.type`,
  `chunk.block.arguments.trim()` and `chunk.reason.kind` without a shape check and the
  outer `catch` only recognised a proven fusion. The wrapper now checks only the fields it
  reads; on the first foreign chunk it flushes the tail it already holds and then only
  passes the rest of that stream through. A provider failure that arrives afterwards is
  still counted as an error, so a stream that failed never reads quiet.
- **P-0054 — the fallback name is not borrowed when the profile already owns it.**
  `remedy_unattributed` is the name this plugin sends a call to when it cannot prove the
  tool. If `options.tools` already declares that name, a rescue is abandoned whole and the
  provider's original failure goes back. The same rule covers the second dispatch site:
  a `block-end` with no tool name keeps its own bytes instead of borrowing the name.

### Changed

- ADR 0002 writes the `llm/stream` contract down: a stream may only pass through, be
  repaired where a fusion is proven, or rethrow the provider's failure. A fourth kind of
  ending — this plugin's own exception — is no longer reachable from a neighbour's shape.

### Notes

- 447 tests, 6 gates, 6/6 negative controls, `OK 8 fixture(s)` on Windows before the
  release. The before/after probe pair is
  `data/results/hostile-neighbours-2026-11-18T10-00-00.000Z.json` and
  `data/results/hostile-neighbours-2026-11-18T11-30-00.000Z.json`.

## [0.4.18] - 2026-11-17

### Added

- **P-0052 — a completed turn that ends on the tool call the UI does not read is now
  counted.** Upstream #12741 reports a long tool loop that finishes with tool rows and no
  sentence: the host can end a turn `completed` on a step that still carries a tool call
  when a tool result marks the turn concluded (`agent.ts:592-603`), while the client
  accepts a final step only when it has visible content and no tool-call block
  (`turn-process.ts:160-161`). A local probe reproduced the shape with a tool whose
  success calls `concludeTurn()`: the last step is `["text","tool-call"]` and the turn
  ends `completed`; the control, same endpoint and prompt with that call off, takes a
  second text-only step. `scan` now reports `completed_on_tool_call` beside
  `completed_without_answer` (the two are disjoint), and `explain` prints one `TOOLCALL`
  finding and exits 1 when the count is positive. P-0044's answer rule is unchanged: a
  tool call is still visible work; this is a second, narrower count.

### Fixed

- **The first screens quote the suite they are on, and only there.** The English and
  Chinese READMEs still said "the suite is 399 tests" while the pack said 0.4.17 ships
  405; the number is now bound to the release (`0.4.18 ... 420`), and a governance rule
  reads it against the fact pack. The handoff and the research notes no longer repeat the
  byte account from older rounds; the status table is the single home, and a rule rejects
  an expired pair in live prose.
- **The reproduction steps in the patch docs run from the repository.** Thirteen
  `## Reproduction` sections cited paths under `.tmp/`, which is gitignored and swept;
  they now name shipped commands (`cli scan`, `node --test tests/...`, `npm pack
  <package>@<version>`), and a governance rule rejects a `.tmp/` path or a cited path that
  does not exist. The three host harnesses that cannot ship say so beside the artifact
  they produced.

## [0.4.17] - 2026-11-17

### Added

- **P-0047 — a turn that finished without answering anyone is now counted.** P-0044 asked
  the question of a truncated turn and left the other ending out, because a `completed`
  turn whose last step is one `reasoning` block had produced zero cases here. A local
  probe reproduced the shape upstream #13169 reports: two `reasoning_content` deltas and
  `finish_reason: "stop"`, and the turn ends `completed` with an assistant message whose
  only block is `reasoning`, because the adapter's empty-response guard counts blocks
  rather than usable content. `scan` now reports `completed_without_answer` beside
  `truncated_without_answer`, computed by the same rule and the same last-step decision.
  Nothing in the verdict, the exit code or the repair path moved.
- **P-0048 — the platform boundary is a criterion, not a sentence.** Every page said
  macOS not measured while the workflow had two jobs, so no darwin process ever ran the
  suite. A `macos` job now runs the same `verify` and `--mutate` as the others. What it
  proves is written down: the repository builds and the suite plus gates pass on darwin.
  What it does not: that a desktop build mounts the plugin there, and it leaves no
  `data/results/live-*`, so no patch may call itself `verified` on it.

### Added (continued)

- **P-0050 — a `resume` that stopped declaring a tool the session had used is now counted.**
  Upstream #12348 reports the shape; on this machine it happens in five sessions, and the host
  answered five of the six later calls with `error.code: UNKNOWN_TOOL`. `scan` reports
  `dropped_tools`, one rule in `packages/core/src/capability.ts`; a tool nobody called, and a
  call made only after the drop, are both refused.

- **P-0051 — the command a person runs had no word for the tool a resume dropped.**
  P-0050 counted the shape in `scan`; `explain` printed turn endings only, so the one
  counter about tools was invisible where a decision gets made. It now reads
  `dropped_tools` from the same scan batch and prints one `DROPPED` line, which makes
  `explain --sessions` exit 1 where it exited 0 before. It is a finding, not a coverage
  row: coverage means a resident seam, and this is a CLI reader.

- **P-0049 — the fact pack counted a patch set it no longer described.** The pack is the file every
  outward number is resolved against, and nothing compared it with the registry: it said 41 patches
  while the registry held 48, put P-0013 on a seam P-0045 had already moved it off, listed 8 CLI ids
  against 10 and 21 build-side against 24, and `CHANGELOG.md` topped out at 0.4.15 while 0.4.16 was
  the release npm served. Three rules now read the pack against the registry, and two more require a
  changelog section for every version the pack calls published. Each was red on the recorded bytes first.

### Changed

- **The CLI half paid for P-0047 in comments, not in caps.** The comments whose long form is
  already in the patch docs were compacted until the field fit, and the engine's two new
  records were paid by compacting older ones. No cap moved.

### Fixed

- Nothing in the runtime: this release adds a counter and a CI job.

### Package size

- `dsh-remedy@0.4.17`: 38348 bytes compressed, 38 files, 125076 bytes unpacked, shasum `5a8c1f95b6a3c6f059a33eaf0ef9770fc62efad7`.
- `dsh-remedy-core@0.4.17`: 41316 bytes compressed, 29 files, 133257 bytes unpacked, shasum `e5b2e00f4bcc53aedfb9fea6bd7c129bf0ba5454`.

### Notes

- This release carries 51 patches: 9 `verified` and 42 `tested`.
- Byte budget: residency 40902 of 44000, CLI 41560 of 42000, total 82462 of 83000;
  engine 103663 of 104000, `registry.js` 64911 of 68000. No cap moved.
- 405 tests, 6 gates, 6/6 negative controls on Windows; Linux was last measured on the
  R58 tree (388 tests / 6 gates / 6-6, node 24.10.0, `data/results/live-linux-2026-11-16T23-10-00.000Z.json`);
  the byte account is the same number on both (`data/results/live-linux-2026-11-16T19-10-00.000Z.json`).
- The P-0047 probe uses a local synthetic endpoint: it reproduces the adapter shape, not a
  relay incident. The counter is a reader: the adapter guard that lets the shape through
  is upstream.

## [0.4.16] - 2026-11-16

### Added

- **P-0045 — a refusal thrown before the stream starts now reaches the seam that names it.**
  P-0013 exists to name the failure class this host hits most after fusion: 37 turns died with
  `UNSUPPORTED_REASONING_EFFORT` while the resident layer said nothing. The released 0.4.15
  bytes were measured against a deliberately refused profile (`reasoningEffort: xhigh`): the
  turn ended `error` and the journal was **empty** — not a wrong line, zero events.
  `agent/request-error` is dispatched only after a started stream fails (`dsh-agent-loop` line
  942); a call refused while it is prepared never reaches it, and the loop's catch emits
  `agent/error` instead (line 657). The namer now listens on that seam too, and both seams share
  one `(turn, step, code)` set, so a failure both can see is named once.
- **The first live witness for the second seam.** A local OpenAI-compatible endpoint answers the
  #12819 shape once and a text block afterwards. With `retryOnMalformed: 1` the host made three
  main-step requests, the journal wrote one `retry`, the turn ended `completed` and the CLI
  exited 0; the plugin-free control made one main-step request and exited 1. P-0011's retry
  decision, its bound and its completion are now witnessed by a live journal instead of by unit
  tests alone.
- **P-0046 — a first screen can be one patch short and every gate stays green.** `README.md`
  and `README.zh-CN.md` both claimed forty-four patches, both enumerated the tested ones, and
  **P-0043 appeared in neither**; both also put 0.4.14 first under a status sentence calling
  0.4.15 the published release. `gate_copy` checks numbers, bytes and provenance, not
  completeness. Two rules now read the registry against each page: every patch id must appear,
  and the published version's size rows must come first. Both rules carry the failing shape as
  their own negative control.

### Changed

- **P-0011, P-0013 and P-0045 moved from `tested` to `verified`**; P-0013's record now names
  `agent/error`, because that is where its naming actually lands. Nine patches are `verified`
  and thirty-seven are `tested`.
- **The registry paid for the new record by de-duplication, not by a raise.** A path that already
  sat in `guards` was dropped from `evidence` when it is the same test or gate (2 507 bytes back
  across 43 records), and five records were compacted with their concrete tokens checked against
  their own docs. No cap moved: residency 40902 of 44000, CLI 41962 of 42000, total 82864 of
  83000; engine 103544 of 104000, `registry.js` 64993 of 68000.

### Fixed

- **The suite's stale byte row and the handoff's stale pointers.** `gate_size` compares the live
  handoff byte row with the build, so the row moved with the tree, and the evidence index now
  marks the R56 snapshot current and the 0.4.15 one historical.

### Package size

- `dsh-remedy@0.4.16`: 38654 bytes compressed, 38 files, 125107 bytes unpacked, shasum
  `623c4cc7d380931e91826948f194ab3b0ac43d84`.
- `dsh-remedy-core@0.4.16`: 40979 bytes compressed, 27 files, 133933 bytes unpacked, shasum
  `43bde005968b4fa97131770d1fdef70aab188433`.

### Notes

- This release carries 46 patches: 9 `verified` and 37 `tested`.
- Byte budget: residency 40902 of 44000, CLI 41962 of 42000, total 82864 of 83000; engine
  103544 of 104000, `registry.js` 64993 of 68000. No cap moved.
- 376 tests, 6 gates, 6/6 negative controls on Windows and on Linux (WSL2 Ubuntu 26.04); the
  byte account is the same number on both (`data/results/live-linux-2026-11-16T16-40-00.000Z.json`).
- The retry proof uses a local synthetic endpoint: it reproduces the adapter's
  `MALFORMED_RESPONSE`, not a relay incident. The seam split itself was measured on the released
  bytes and on this tree, which is what makes P-0045 a fix rather than a guess.

## [0.4.15] - 2026-11-16

### Added

- **P-0044 — a truncated turn was counted, and nobody asked whether it answered.** `scan`
  has counted every `turn/end` since P-0006; it never read the `assistant/message` events
  that carry the block types. On this machine 88 `max-tokens` turns were reported and all
  88 ended with no `text` and no `tool-call` — most with a `reasoning` block only and the
  rest with no message at all. The rule now lives in `packages/core/src/answer.ts` (a `tool-call`
  answers, a non-whitespace `text` answers, an unknown block does not, and only a turn's
  last step decides), and `scan` reports `truncated_without_answer` on the human line, in
  `--json` and in `--out`. No verdict, no exit code, no repair: a truncation is still
  never repaired. Upstream #12347 reports the same empty completion from a headless run;
  a `completed` turn with only reasoning (#13169) is deliberately **not** counted here.

### Changed

- **The registry ledger was compacted again (R55), and no cap moved.** 28 of the 43 records
  were shortened to the ledger fields plus a one-sentence `symptom`, a one-sentence
  `rootCause` and two to four short `limits`; the long form stays in `docs/patches/`, which
  already carried every number, file and blind spot that was removed. Measured before and
  after: `registry.js` 67991 → 63955 of 68000, core dist 103790 → 99754 of 104000.
  No patch changed status, and the plugin byte account did not move.
- Every concrete token removed from a record (version numbers, hashes, `file:line`, failure
  codes) was checked against its patch document before it was deleted: all 43 records still
  have every one of them in their doc. That check is a hand run, not a gate; `gate_registry`
  still only proves that a doc exists (BS-19).

## [0.4.14] - 2026-11-16


### Fixed

- **P-0043 — the guard written for a fixture could not see the fixture, and 0.4.13 shipped
  the account name.** The published `0.4.13` tarball carries this machine's account name
  inside `fixtures/toolcall-fusion/bare-code-value.json`. `tests/governance/shipped-samples.test.ts`
  — the P-0028 rule that exists for that file — allowed at most **two** separators before
  `Users`, and the fixture is a JSON string, so one backslash of the model's program becomes
  **four** in the file. The guard answered `false` on the exact file it protects.

### Added

- A second rule in the same test walks **every tracked result artifact** for the account this
  machine runs as (`USERNAME` / `USER`), because a bare `ls -l` token has no drive letter and
  no `Users` segment for a path-shaped rule to see. It found one:
  `data/results/live-linux-2026-11-15T15-00-00.000Z.json`.

### Changed

- The shipped-samples guard now accepts one or more separators and requires a non-letter before
  the drive letter, so the escaped fixture shape is caught while `file:///Users/<name>` (a URL
  scheme quoted in prose about macOS) is not. Both shapes are pinned as negative controls.
- `bare-code-value.json` and `tests/unit/reseal.test.ts` use `<home>`, the placeholder P-0028
  established; the fixture's `note` says it is no longer a byte-identical copy and why.
  The shape it exists for — a bare, unquoted multi-line value — is untouched, and `verify`
  still prints `OK 8 fixture(s)`.
- The leaking artifact was repaired: `stranger_install.bin_line` reads `<user> <user>`, a
  `redaction_repair` field records the field, the reason and the time, and the sibling
  `.sha256` names the new bytes.
- The packaged fixture copy was regenerated by `sync_fixtures.mjs`; `checksums.json` still
  verifies.

### Package size (0.4.15)

- `dsh-remedy@0.4.15`: 38600 bytes compressed, 38 files, 124248 bytes unpacked, shasum
  `cd717926bd9ecec01326d8bd1c055290341f665b`.
- `dsh-remedy-core@0.4.15`: 40675 bytes compressed, 27 files, 134256 bytes unpacked, shasum
  `c6577a61dd3af4df57bf234d5e6d9bb4dd2c2b84`.

### Package size (0.4.14, kept because a frozen page quotes it)

- `dsh-remedy@0.4.14`: 38804 bytes compressed, 38 files, 124177 bytes unpacked (82717 of
  `dist/*.js`), shasum `80fc4414a9997a467fffe2f51fdb7d771bff1bcd`.
- `dsh-remedy-core@0.4.14`: 39878 bytes compressed, 25 files, 131758 bytes unpacked
  (103790 of `dist/*.js`), shasum `b2474efb54c1a9c9719422238e264656d16c35e7`.

### Notes

- This release carries 43 patches: 6 `verified` and 37 `tested`.
- Byte budget: residency 41494 of 44000, CLI 41223 of 42000, total 82717 of 83000;
  engine 103790 of 104000, `registry.js` 67991 of 68000. No cap moved.
- 362 tests, 6 gates, 6/6 negative controls on Windows and on Linux (WSL2 Ubuntu 26.04,
  node 24.10.0). macOS is not measured.
- `0.4.13` is not rewritten: the bytes on the registry are what shipped, and the fix is a
  new version (P-0041's precedent).

## [0.4.13] - 2026-11-15

### Added

- **P-0042 — the profile and the refusal never met, and the seam cannot move the level.**
  The host refused `reasoningEffort: "xhigh"` 37 times across eleven sessions while the
  profile still fixed that level: `scan` had the count, the profile had the level, and
  nothing compared them. `scan` now keeps `provider/model level` for a refusal the host
  itself named, and `explain --sessions … --profile-file …` prints one `CONFLICT` line and
  exits 1 when the profile still fixes exactly that level. Nothing is clamped and nothing is
  rewritten: the choice stays the user's (P-0013).

- The shape was decided by a measurement rather than by taste. `agent/pre-step`
  `{kind:"enter"}` is admitted by the host — the added message becomes a real
  `user/message` and the turn completes — but it cannot change a selection the loop fixed,
  so the same rewrite on `xhigh` still dies in `prepareCall`. `reject` stays disqualified on
  the desktop profile, where the window draws it as a completed turn (R30). Four isolated
  runs and the adapter query are recorded in
  `data/results/prestep-enter-2026-11-15T17-55-00.000Z.json`.

### Changed

- `session-scan` reports one new field, `refused_efforts`; it stays empty unless the host's
  own sentence names provider, model and level, so a bare code never becomes a guessed
  level. `explain`'s exit code now also covers a refused effort this profile still fixes.
- The emitted prose in `explain-command.ts`, `session-scan.ts`, `cli.ts`, `cli-args.ts` and
  `scan-command.ts` was compacted to pay for that addition: the caps did not move. A helper
  in `explain-command.ts` that nothing called is gone.
- `record_live_mount.mjs` reads the runtime version from the runtime's own `runtime.json`
  instead of carrying a literal. Every artifact it wrote from `0.2.2-rc.3` onward named a
  runtime that was not the one that ran; the desktop artifact of this round is the first one
  that says rc.3 because the file says so.

### Package size

- `dsh-remedy@0.4.13`: 38762 bytes compressed, 38 files, 124050 bytes unpacked (82717 of
  `dist/*.js`), shasum `02d0747ac766408c0525bfcfb09df4581039af9d`.
- `dsh-remedy-core@0.4.13`: 39968 bytes compressed, 25 files, 131617 bytes unpacked
  (103649 of `dist/*.js`), shasum `b825fe0b8b523411a17714abf41cc916c14e6273`.

### Notes

- This release carries 42 patches: 6 `verified` and 36 `tested`.
- Byte budget: residency 41494 of 44000, CLI 41223 of 42000, total 82717 of 83000;
  engine 103649 of 104000, `registry.js` 67850 of 68000. No cap moved.
- 361 tests, 6 gates, 6/6 negative controls on Windows and on Linux (WSL2 Ubuntu 26.04,
  node 24.10.0); `OK 8 fixture(s)` through the installed bin. macOS is not measured.
- The desktop app was started for the first time since 0.4.12 was installed, and one real
  turn completed with the plugin's journal writing two stream events.

## [0.4.12] - 2026-11-15

### Fixed

- **P-0041 — the installed CLI was silent on Linux, and exited 0.**
  `./node_modules/.bin/dsh-remedy verify` printed nothing and exited 0 on Linux and macOS
  while `node dist/cli.js verify` printed every fixture. The entry guard compared
  `import.meta.url` (the resolved file) with `pathToFileURL(process.argv[1])` (what the
  caller named), and npm installs a POSIX `bin` as a symlink, so the two differ and
  `main()` never ran. Both sides are realpath'd now, and an unreachable `argv[1]`
  answers `false` instead of throwing. Windows installs a `.cmd` shim that passes the
  real path, which is why 0.1.0–0.4.11 never saw it. The installed shape is checked
  where the platform allows a link and the guard is also asserted as a pure function.
  `0.4.11` carries the old guard; install `0.4.12` to get the fix.

- **P-0040 — the acceptance recorder owned a fixture count the package owns.**
  The cold-directory install of `0.4.11` printed eight `PASS` lines and `OK 8 fixture(s)`
  with three zero exit codes, and the recorder wrote `ok: false` because it looked for
  the literal `OK 6 fixture(s)`. The count is now derived from
  `data/fixtures/toolcall-fusion/*.json` and judged by `scripts/lib/acceptance.mjs`
  (count agree, every line a `PASS`, every fixture line present). The artifact records
  `canonical_fixtures` beside the claim, so it can be re-checked instead of re-believed.

### Changed

- The engine's `closed` counter and the `redact()` platform rules from 0.4.11 are
  unchanged; this release only carries the two CLI/build-side patches above.

### Package size

- `dsh-remedy@0.4.12`: 39694 bytes compressed, 38 files, 126181 bytes unpacked (82919 of
  `dist/*.js`), shasum `b9122c89b04a4c18a92b0404dfe939af3ba8f54e`.
- `dsh-remedy-core@0.4.12`: 40118 bytes compressed, 25 files, 131670 bytes unpacked
  (103702 of `dist/*.js`), shasum `d58321d7ad1087b2937fad53f3f91231c7948fc8`.

### Notes

- This release carries 41 patches: 6 `verified` and 35 `tested`.
- Byte budget: residency 41494 of 44000, CLI 41425 of 42000, total 82919 of 83000 (81
  bytes of headroom); engine 103702 of 104000, `registry.js` 67903 of 68000. No cap
  moved: the two new records were paid by compacting five long ones under P-0032.
- Verified on Windows (this machine) and on Linux (WSL2 Ubuntu 26.04, node 24.10.0):
  334 tests, 6 gates, 6/6 negative controls, `OK 8 fixture(s)` through the installed
  `bin` (a symlink) and through `npx`. macOS is **not** measured: there is no Apple
  hardware here, so the POSIX branch it shares with Linux is the only evidence.

## [0.4.11] - 2026-11-15

### Added

- **P-0037 — one dropped closing delimiter is restored only when the proof is unique.**
  A nested tool-call argument one `]` short (upstream #12819) used to be refused as
  `single-object` and re-thrown, so the whole turn died. The repair inserts exactly one
  bracket at the only **interior** site that parses; end-of-text is never a candidate
  (a cut tail looks identical) and two candidates is an ambiguity, not a fix — 604 of
  1687 generated dropped-closer shapes had two or more. The call keeps its id and name,
  and the journal books `closed` with `key` = `]@<offset>`.
- A tenth counter, `closed`, on the same contract as `resealed`: one call rewritten in
  place, nothing synthesized, so neither `fused` nor `repaired` moves.

### Fixed

- **P-0038 — the redaction was written on one platform and shipped to three.**
  `/Users/<name>`, `file:///Users/<name>` and the macOS/Linux session keys
  (`--Users-…--`, `--home-…--`) passed through `redact()` untouched while the Windows
  shapes were covered, so the account name could leave the machine in an artifact. The
  key is not a path — `projectKey` in the host turns every separator into one `-` and
  wraps the slug in `--…--` — so the rule now recognises all three and requires the
  wrapper. Measured: 5 of 8 shapes leaked before, 0 after; on Linux the same six shapes
  were measured live.
- **P-0039 — three recorders only worked on Windows.**
  They computed `.dsh/sessions` from `USERPROFILE`, which is unset on Linux and macOS,
  so the path became relative and the recorder exited 3 with "no session directory";
  an empty `DSH_SESSIONS=` was accepted as the root. One portable resolver
  (`scripts/lib/session-root.mjs`) answers for all three platforms.

### Changed

- `L-0036` (a stream with no `finish`) is closed as `rejected (no defect)`: two
  scripted providers on Linux showed that such a stream ends with an explicit
  `TRANSPORT` error finish or with `turn/end error` and exit 1 — not as a silent
  success. `L-0003` is `rejected (out-of-seam)` (the deepseek adapter never echoes the
  argument text) and `L-0009` is `rejected (no defect)` (a case-mismatched name only
  ever lands on `unproven`, never on a wrong tool).

### Package size

- `dsh-remedy@0.4.11`: 39631 bytes compressed, 38 files, 126185 bytes unpacked (82856 of
  `dist/*.js`), shasum `884693a5584eb2d8b39902b56296bb34ea1f130c`.
- `dsh-remedy-core@0.4.11`: 40354 bytes compressed, 25 files, 131692 bytes unpacked
  (103724 of `dist/*.js`), shasum `2a528bb1c232fa287d3ea78cbb1babbcb57ac14b`.

### Notes

- This release carries 39 patches: 5 `verified` and 34 `tested`.
- Byte budget: residency 41494 of 44000, CLI 41362 of 42000, total 82856 of 83000 (144
  bytes of headroom); engine 103724 of 104000, `registry.js` 67925 of 68000.
- P-0037 is `verified` on Linux: the one-delimiter-short shape was repaired inside a
  real DSH 0.2.2-rc.3 process and the repaired call was dispatched. The shape is
  synthesized by a scripted provider, not produced by a real model turn.

## [0.4.10] - 2026-11-14

### Added

- A research note on the seam's neighbours (`docs/research/similar-projects-2026-11-14.md`): the five plugins that
  already repair this shape, which of their mechanisms was borrowed, and which of their trade-offs was refused —
  no `jsonrepair` dependency, no request-side history rewrite, no offline session editing.
- A numeric version comparison in the governance layer: `localeCompare` called `0.4.9` newer than `0.4.10`,
  which only shows up when a minor version crosses into two digits. Not registered as a patch — the registry has
  290 bytes free and a record costs about 550.

### Fixed

- **P-0036 — a delta-only tool call keeps the id the stream proved.** A provider that never
  emits `block-end` reaches the host as pure `tool-call-delta` chunks, and the host's own
  assembler assigns `partial.toolCallId = chunk.id` with **no guard**
  (`dsh-llm/src/assembler.ts:72`, DSH 0.2.2-rc.3) while the name one line below
  (`:73`) is guarded. Its only fallback (`:115`) is `??`, which cannot fire for an empty
  string. A continuation delta spelled `id: ""` therefore erases an id that already arrived,
  and a call that never carried one assembles as `id: ""`. The V4 log then refuses the
  matching result: `format v4 tool/result … requires toolCallId matching its tool source`,
  and every later turn repeats it. `P-0033` covered the half where the adapter *does* send a
  `block-end`; this is the half where it never does. The wrapper now keeps one id per index:
  a non-empty id is adopted, an empty one becomes the id that index already proved, and an
  index that never carried one mints a collision-checked `call_remedy_<n>`.

### Changed

- Six leads closed with a source or a reason: `L-0037` is the same `empty-id-clobber` shape
  reported against a competing plugin and became `P-0036`; `L-0038` is the handbook page whose
  `assembler.ts:187` line gives `L-0036` (a stream that ends with no `finish` reads as a clean
  `stop`) its host half, which is recorded rather than patched: adding `stop` repeats the
  host's assumption and adding `error` invents one.
- `docs/research/similar-projects-2026-11-14.md` records the five plugins on this seam, what
  was borrowed as a mechanism, and what was refused: no `jsonrepair` dependency, no request-side
  history rewrite, no offline session editing.

### Package size

- `dsh-remedy@0.4.10`: 39183 bytes compressed, 36 files, 124916 bytes unpacked (82957 of
  `dist/*.js`), shasum `dcc33f65e7e0401800348c7f992830879f290ed7`.
- `dsh-remedy-core@0.4.10`: 40494 bytes compressed, 23 files, 130919 bytes unpacked (101597 of
  `dist/*.js`), shasum `75b4744e4681ad1e752308671889312a5006c20e`.

### Notes

- This release carries 36 patches: 4 `verified` and 32 `tested`.
- Byte budget: residency 41595 of 44000, CLI 41362 of 42000, total 82957 of 83000 (43 bytes of
  headroom); engine 101597 of 104000, `registry.js` 67710 of 68000. No cap moved.
- P-0036 is `tested`, not `verified`: the red is at the seam and the host half is source-read
  from this machine's `app.asar`, not a live turn this round.

## [0.4.9] - 2026-11-14
### Fixed
- A turn that failed with `MALFORMED_RESPONSE` is no longer booked as a quiet one (P-0034). `isFusionFailure` decides by the failure code alone, so every `MALFORMED_RESPONSE` inherited the fusion path's assumption that a refusal had already counted it. Upstream discussion #11337 shows the shape that exposed it: a benign prompt produced a reasoning block, the Messages stream then closed with `stop_reason: "refusal"`, the adapter raised `unsupported stop reason refusal` (upstream `stopReason()` accepts only `end_turn` / `stop_sequence` / `tool_use` / `max_tokens`), and the turn died while the journal recorded no error at all. Both failure exits now count an error unless a refusal at this seam already explained the failure. Nothing is repaired, retried or rewritten; the verdict vocabulary and the adapter are untouched.

### Added
- A patch-layer row can no longer promise a module nothing resolved (P-0035). Every `name:` in `cordis.patch.yml` is resolved against the package's `exports` and against the built file, with upstream discussion #12318 (a removed subpath export that reported `never started` and made every session resume fail) as the negative control. Three further controls cover the shipped row, an undeclared package, and a resolver that would otherwise pass everything. Zero runtime bytes.

### Changed
- Six leads closed with a written reason instead of a patch: L-0033 (empty tool-call identity, same shape as P-0033), L-0034 (the adapter replaces malformed arguments with `{}` before this seam can see them), L-0024 (`type:'json'` compiles to an untyped schema, which `valueFits` already treats as undecidable), and L-0036 stays `watching` because nothing here proves the host treats a finish-less stream as a success.

### Package size
- `dsh-remedy@0.4.9`: 39335 bytes compressed, 36 files, 125349 bytes unpacked (82877 of `dist/*.js`), shasum `24eaaaf51169adbfcb7d59add2340993dcc4a6ee`.
- `dsh-remedy-core@0.4.9`: 40534 bytes compressed, 23 files, 130634 bytes unpacked (101313 of `dist/*.js`), shasum `f2b5593d588d9a06d31afa9e13c3d143c858b470`.

### Notes
- This release carries 35 patches: 4 `verified` and 31 `tested`.
- Byte budget: residency 41515 of 44000, CLI 41362 of 42000, total 82877 of 83000 (123 bytes of headroom); engine 101313 of 104000, `registry.js` 67426 of 68000. No cap moved; P-0034's own bytes were paid by condensing comments in the file it changed.

## [0.4.8] - 2026-11-14
### Fixed
- A tool call with no identity no longer poisons the session (P-0033). The adapter can end a stream with a block whose id and name are both empty (upstream discussion #13211); the plugin used to count the refusal and pass the block through, so the host wrote `tool/call` with an empty callId and the V4 log refused to resume the session on the matching result. The block is now rewritten in place with a traceable `call_remedy_N` id and the `remedy_unattributed` name: the runtime answers `UNKNOWN_TOOL`, the turn continues, and the session stays resumable. Nothing is repaired and nothing is retried, so the counter stays `refused`.

### Changed
- The registry no longer carries the long form of every patch (P-0032). Eight of the longest records keep one sentence per field and short limits, with the narrative staying in `docs/patches/`. `registry.js` fell from 66303 to 61509 bytes before the two new records; the 68000-byte cap did not move. Splitting the registry by seam was measured and rejected for payment, because it moves the same bytes into other modules.

### Package size
- `dsh-remedy@0.4.8`: 39378 bytes compressed, 36 files, 125434 bytes unpacked (82872 of `dist/*.js`), shasum `6f42b4423117c7f3fc79f5458b18f3c35e2004ad`.
- `dsh-remedy-core@0.4.8`: 39869 bytes compressed, 23 files, 128145 bytes unpacked (98824 of `dist/*.js`), shasum `2567629d4c28766622d546d2a22519029611fde7`.

### Notes
- This release carries 33 patches: 4 `verified` and 29 `tested`.
- Byte budget: residency 41510 of 44000, CLI 41362 of 42000, total 82872 of 83000; engine 98824 of 104000, `registry.js` 64937 of 68000. No cap moved; P-0033's own bytes were paid by condensing comments.

## [0.4.7] - 2026-11-14
### Fixed
- The engine every mount loads had no byte budget. P-0012 recorded that `dsh-remedy-core` sits outside the size gate, and a governance test called the package "a separate package with its own budget", but no cap existed: the plugin half was down to 87 bytes of headroom while the engine had grown to 100190 emitted bytes, 66303 of them the registry data that gains a record per patch.

### Added
- `scripts/lib/budgets.mjs` and `scripts/gate_size.mjs`: core 104000 and `registry.js` 68000, with the measured pair and the owner's in-session signature recorded beside the caps. The size gate now reports `core-total` and `core-file:registry.js`, and `handoff-bytes` compares the live handoff's core row with the measurement.
- `tests/governance/budget-split.test.ts` pins the two constants, the recorded measurement and the rule that the registry cap fits inside the engine cap.

### Notes
- This release carries 31 patches: 3 `verified` and 28 `tested`.
- Byte budget: plugin residency 41551 of 44000, CLI 41362 of 42000, total 82913 of 83000; engine 100190 of 104000, `registry.js` 66303 of 68000. No existing cap moved; one was added, because the half every mount also loads was the half nobody measured.

## [0.4.6] - 2026-11-14
### Fixed
- The live handoff told a successor three things that had already moved: it called `v0.4.2` the newest release after 0.4.3, 0.4.4 and 0.4.5 had shipped, it commented `# 0.4.1` on the five-minute `npm view` line, and `docs/PUBLISH.md` still said npm was at 0.4.2. Each is now compared with the shipping version instead of copied forward.
- The same section told the next agent to pay for a new patch by splitting modules by load path. The total cap is the sum of both subtotals, so a split moves bytes between halves and pays none of the total; the advice now says delete or de-duplicate, or sign a cap change.
- A synthesized fragment's name was checked only against the tool's `required` list. Reading the compiler that builds the request (`dsh-tools/lib/index.js:800-808`) showed the parameter schemas are open, so "every key must be declared" would have been an over-claim; the proof now also uses a closed schema (`additionalProperties: false`) and a declared value that breaks its own `type`, `enum` or `const`.
- The `repaired` event counted unattributed fragments across the whole stream, so a stream with two fused blocks reported the first block's count on both events. Counts are per decision now.

### Added
- `tests/governance/handoff-truth.test.ts` reads the live release row and the five-minute `npm view` comments; `tests/governance/release-procedure.test.ts` reads the `currently` version in `docs/PUBLISH.md`; `scripts/gate_size.mjs` compares the handoff's byte row with the measured build (`handoff-bytes`), and `--mutate` proves the check is not vacuously green.
- `packages/core/src/attribute.ts`: `fragmentFit()` returns `fits` / `foreign` / `unproven`. Only a schema violation the declaration itself states produces a refusal; a keyword the module does not decide never does.
- The `repaired` event carries `unproven: <n>` when a synthesized fragment kept the stream's name although the schema could not speak, so the journal no longer implies the name was proven.

### Package size
- `dsh-remedy@0.4.6`: 39877 bytes compressed, 36 files, 126519 bytes unpacked (82913 of `dist/*.js`, 28204 of `dist/*.d.ts`, 3676 of `fixtures/`, 11726 of package-root files), shasum `1cd6d75a…`.
- `dsh-remedy-core@0.4.6`: 39973 bytes compressed, 23 files, 127568 bytes unpacked (98247 of `dist/*.js`, 25509 of `dist/*.d.ts`, 3812 of package-root files), shasum `f18fb209…`.

### Notes
- This release carries 30 patches: 3 `verified` and 27 `tested`.
- Byte budget: residency 41551 of 44000, CLI 41362 of 42000, total 82913 of 83000 — eighty-seven bytes of headroom. No cap moved; the plugin's emitted bytes fell because the attribution proof moved into the engine, which the budget does not measure.

## [0.4.5] - 2026-11-14
### Fixed
- The packaged fixtures no longer carry this machine's home path. `fixtures/toolcall-fusion/session-9045e2ec-seq-526.json` quotes the shell command a real session ran, and that command began with the account's workspace; every tarball since the first release shipped it. The account segment is now `<home>`, the same placeholder the redactor writes, and the fixture's own note says the file is no longer a byte-for-byte copy. Reported by the dshopen maintainer while accepting the plugin (polang233/dsh-plugin-index#472).
- `scripts/record_adaptation.mjs` redacts the runtime path it records. The public repository also stops naming the account in six patch docs, the handoff, one step review and one artifact.

### Added
- `tests/governance/shipped-samples.test.ts`: no file that ships in a tarball, and no page npm renders, may contain an absolute `…:/Users/<name>` segment. It walks the canonical and packaged fixture directories plus the outward pages, and it carries an injected sample so a regex typo fails instead of passing quietly.

### Notes
- This release carries 28 patches: 3 `verified` and 25 `tested`.
- The fixture is no longer byte-identical to the session it came from. That claim is what let the path survive six releases, so the note now states the redaction instead of the purity.
- Redaction still happens where data is produced; what changed is that the corpus it was produced into is now checked on the way out.

## [0.4.4] - 2026-11-13
### Fixed
- A fused text that glues two calls of **different** tools no longer runs the wrong tool. The stream carries one tool name for that index, so the fragments after the first inherited it; measured twice on DSH 0.2.2-rc.3, the surplus object was dispatched as `read` and the tool answered `invalid arguments: missing required property "file_path"`. The wrapper now receives the request's tool declarations and checks each synthesized fragment against the named tool's `required` fields; one that does not fit goes out as `remedy_unattributed`, which the runtime answers with `UNKNOWN_TOOL` while the turn continues. The `repaired` event records `unattributed: <n>`.
- `BS-18` narrows with it: the wrong dispatch is now a named failure the model can retry, and what stays open is a tool whose declaration proves nothing.

### Notes
- This release carries 27 patches.
- The resident half paid for the patch itself: the first build was 2 539 bytes over the 83000-byte total, so `repair-stream.ts` prose was condensed in four passes and `toolsOf` was inlined. No cap moved; the gate now reads residency 41623 of 44000, CLI 41362 of 42000, total 82985 of 83000.
- P-0027 is `tested`, not `verified`: the engine is pinned by six unit tests, and the runtime's answer to the fallback name was measured with a probe rather than by a live fusion of two different tools.

## [0.4.3] - 2026-11-13
### Changed
- Re-measured on **DSH 0.2.2-rc.3**, the desktop build released today (the previous measurement was 0.2.2-rc.1). All three seams this plugin uses are declared identically in both versions — `llm/stream` stays a synchronous waterfall over `AsyncIterable<StreamChunk>`, `agent/pre-step` keeps `PreStepDecision`, `agent/request-error` keeps `RequestErrorAction` — so the supported range stays `>=0.2.0-rc.1 <0.3.0-0` and only the measured statement moved. `data/results/adaptation-0.4.2-on-0.2.2-rc.3-2026-11-13T19-55-00.000Z.json` records the run: an isolated `DSH_HOME`, the published 0.4.2 tarball, one real turn, and a real fusion repaired with the synthesized call dispatched.
- One measured behaviour changed: on rc.1 the adapter never closed a tool-call block, on rc.3 it closes the first fragment itself and leaves the surplus object to the finish-time rescue. Both paths are accepted by the runtime; P-0002's record now says which version showed which.

### Recorded
- `BS-18`, open: a fused text that glues two calls of different tools carries one name for that index, so fragments after the first inherit it. Measured twice on rc.3 — the synthesized call was dispatched as `read` with shell arguments and the tool answered `INVALID_ARGS`. Visible, but a wrong dispatch; P-0002's limits and doc no longer claim otherwise. The fix is planned as `P-0027`.
- `scripts/record_adaptation.mjs` regenerates that artifact from an isolated home, so the next runtime upgrade is measured the same way instead of argued from version numbers.

### Notes
- No seam behaviour changed: the engine, the wrapper and the CLI are byte-identical to 0.4.2 except the registry's P-0002 limit text. This release exists because the published page said "measured on 0.2.2-rc.1" while the runtime in use is rc.3, and because the probe that checked it found a boundary the record claimed was closed.

## [0.4.2] - 2026-11-13
### Fixed
- `dsh-remedy explain` no longer reports an unread profile as a finding. With `--sessions` and no `--profile-file` it printed `(no)` in the "enabled here" column for every covered class and exited `1`, while the same screen said `enabled-here is unknown`; the column now has three states (the coverers, `(no)` for a profile that switches them off, and `unknown` when no profile was named) and only a profile that was actually read can make the command exit `1`. The package README, which npm renders, described the old semantics and is corrected through the copy channel.
- The release procedure now has one home. `docs/HANDOFF.md` still taught the pnpm filter publish path and an OTP requirement, and its boundary section described the profiles and the registry latest three releases out of date; the handoff now points at `docs/PUBLISH.md` and a governance test refuses the retired commands, any flag `scripts/publish_packages.mjs` does not read, and a boundary statement that cites a gitignored `.tmp/` path or a `latest` the packages do not ship.

### Changed
- The two package READMEs are now live entries in the copy channel. `gate_copy` checks their bytes, fact-pack hash, prose numbers and writer, and requires both entries; the P-0017 prose test stays as a second guard. The pages are still hand-written and still ship in the tarball, so a change to them reaches npm only with a release.

### Notes
- This release carries 26 patches: the 23 that 0.4.1 shipped plus P-0024, P-0025 and P-0026.
- All three are `tested`, not `verified`: two are build-side and one changes text a command prints, so no resident seam can witness them.

## [0.4.1] - 2026-11-13
### Fixed
- The package no longer advertises `./retry-listener`. No `src/retry-listener.ts` has ever existed, so importing that subpath failed with `ERR_MODULE_NOT_FOUND` while the manifest said it was supported; the listener is still exported from the main entry. Every export target now has to have a source module, with a negative control that keeps the check from passing on an empty input.
- The fixture drift test no longer repairs the drift it claims to detect. It used to run `sync_fixtures.mjs` in write mode and then compare the copy, so the copy step overwrote any drift before the assertion; it now runs `--check` first and seeds only a missing copy, and a copy with one changed byte must be reported.
### Added
- `gate_registry` now requires a `docs/patches/P-NNNN-*.md` for every registered patch. It found P-0016, which had shipped without one; the doc is written from the recorded round and the index range is corrected.
### Notes
- All three patches are `tested`, not `verified`: they touch a manifest, a test and a governance gate, and no resident seam can witness them.
- This release carries 23 patches: the 20 that 0.4.0 shipped plus P-0021 through P-0023.

## [0.4.0] - 2026-11-13
### Added
- `dsh-remedy explain` answers a second question the registry alone could not: which patch covers a failure class your machine actually hits, and whether that patch is switched on in the profile you point it at. Coverage now lives on the patch itself (`failureClasses`, `switchKey`), so a patch added tomorrow is answered the same day instead of waiting for a command to be edited.
- `scan` counts every way a turn can end and names every error code, instead of only the repairable ones. On the host this was measured on, that surfaced `max_tokens` and `UNSUPPORTED_REASONING_EFFORT`, the two largest classes, neither of which had been visible.
- `agent/request-error` gained a written contract and a bounded retry budget, and the deterministic refusals that used to end a turn in silence are now named once per step instead of not at all.
### Changed
- The byte budget is measured per load path (residency, CLI, total) rather than as one number, so a CLI command and a daemon no longer compete for the same ceiling.
- Outward text is written in the session that does the work, and every prose number in it must exist in the fact pack; the check is no longer "which model typed it".
### Fixed
- A bare, unquoted value after a member key is resealed only when exactly one rewriting proves, and otherwise refused; a truncated call is never repaired.
- A refusal is observable: a stream whose only defect is bad JSON reads quiet, a proven fusion that was declined reads refused, and neither is reported as an attempted repair.
- A scan reads multi-frame zstd logs instead of counting compressed bytes as unreadable lines, and a session header is dated by its `createdAt` rather than reported as unreadable.
- The npm page documents every command the binary dispatches, including `explain`, and the usage block is compared line for line against the CLI own text.
- The project description is checked instead of trusted: the fact pack version and pins must match the manifests, and the release notes are frozen records rather than pages that drift with the pack.
- The publish wrapper names a Windows access violation for what it is instead of printing a bare exit code and offering HTTP advice for a process that never spoke to the registry.
### Package size
- The plugin tarball and the core tarball are measured at pack time; `record_publish` refuses wording that claims a size before the artifact exists.
### Notes
- Seven patches in this release are `tested`, not `verified`: they touch prose, manifests, a build script, offline readers or a measurement on an isolated profile, and no resident journal can witness them. Three earlier patches stay `verified` on a real host.
- `agent/pre-step` is measured but still not mounted: a rejection closes the turn as `blocked` with no step opened and discards the claimed input, so a later patch may use the seam only to rewrite the message. The desktop rendering of `blocked` remains unmeasured.
- A mid-stream withdrawal (`withdrawn`) cannot happen on this host; 0 of 24 329 persisted attempt streams carry a provable fusion inside a `block-end`, which is what `rolled-back` needs.

## [0.3.8] - 2026-11-12
### Added
- P-0011: the second seam, `agent/request-error`, had **no test at all** since 0.2.0 (twenty test files, none of which mentioned it). It also called `next()` and then overrode whatever the default chain returned, and kept its retry budget in a map that was never pruned, so a long-lived process kept one entry per step forever. It now follows the contract the runtime documents in its own README: a handling listener returns `{ kind: 'retry' }` **without calling `next()`**, and a listener that does not own the decision returns `next()`. The budget is a bounded cache of 256 entries, and the listener exposes `cacheSize()` so a test proves the bound. Nine tests pin every branch.
- P-0013: 37 turns on this host died with `UNSUPPORTED_REASONING_EFFORT` — `provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"` — across three workspaces, eleven sessions and two days, and the journal said nothing, because `repair-stream` is mounted on `llm/stream` and a step refused during preparation never reaches that seam. Those classes are now named once per `(step, code)` and never retried, and `packages/core/src/preflight.ts` can answer `ok` / `refuse` / `unknown` for a declared effort before a token is spent.
- `dsh-remedy explain`: a new command that prints, per failure class, how often this machine hit it, which patch covers it, and whether that patch is switched on in the named profile.
### Changed
- P-0012: the byte budget was one number describing two load paths — the modules a mounted plugin loads at startup, and the modules only a command loads. A daemon pays the first half on every session and the second half never, so one cap made every resident byte compete with CLI code. It is now three checks (`residency` ≤ 44000, `cli` ≤ 42000, total ≤ 83000) plus a rule that every emitted module belongs to exactly one of them, with a governance test that walks the real module graph in both directions.
- The copy channel's transport is retired: outward files are written in the session that does the work, and `scripts/gate_copy.mjs` enforces the property the channel existed for — every prose number traceable to the fact pack, every artifact's bytes unchanged — instead of checking the identity of the author.
### Fixed
- The largest non-fusion failure class on the measured machine is no longer silent, and the second seam is no longer unverified code.
### Notes
- P-0011, P-0012 and P-0013 are `tested`, not `verified`. P-0011 and P-0013 live on a seam a live journal witnesses only when a turn fails in a class this plugin retries, and the retry budget defaults to 0; P-0012 is a build-side gate.
- `agent/pre-step` is deliberately **not** mounted. The upstream contract is that a rejected `PreStepDecision` opens no step, but nobody has measured what a user sees when a plugin rejects one, so mounting a refusal would be guessing.
- The `withdrawn` counter was measured unreachable on this host: 0 of 24 329 persisted attempt streams carry a provable fusion inside a `block-end`, and `rolled-back` needs exactly that. Blind spot `BS-14` records it.
- This release was published on 2026-11-12 and is the registry `latest` for both packages; `0.3.7` is the release before it.

## [0.3.7] - 2026-11-12
### Added
- P-0010: the packaged `README.md` — the page npm renders — documented `scan` as `<session.jsonl> [--json] [--out <file>]` and the CLI's own usage said `<session.jsonl|session.v4.jsonl.zstd>` with the same missing flags, while the binary has accepted a directory, `--since` and `--max-files` since 0.3.3. Both strings now carry the identical line and `tests/unit/cli-usage.test.ts` fails if they ever differ again.
### Changed
- The four per-command descriptions were condensed to one line each, which took the emitted `cli-args.js` from 3086 to 2972 bytes and the plugin total from 67997 to 67883, so the byte ceiling with three bytes of headroom became a ceiling with 117.
### Notes
- P-0010 is `tested` and not `verified`, because a usage string is not a resident seam, and that `0.3.7` is the registry `latest` while `0.3.6` is the release before it. The whole `MALFORMED_RESPONSE` corpus on one host was replayed through the built engine (47 turns, 39 repaired, 8 refused, none unparsable) and a 300000-case generated stress pass found no unparsable dispatch, no duplicate id and no lost tool name.

## [0.3.6] - 2026-11-11
### Added
- P-0009: a windowed `scan --since` over a real session directory reported `unreadable_lines=78` for 78 files, because every session opens with a `session` header whose instant is the top-level `createdAt` rather than `time` and the scanner required `time` before it would apply the window, so it called the one reliably dated line in the log unreadable. The header now falls back to `createdAt`, the same command went to `unreadable_lines=0` with the same `attempts=67`, and an ordinary event with no instant is still counted unreadable. P-0009 landed at 67997 of 68000 emitted bytes.
### Changed
- Documentation blocks in `session-scan.ts` were condensed to keep the emitted plugin within the 68000 byte ceiling without raising the cap.
### Notes
- P-0009 is `tested` and not `verified` because, like P-0004 and P-0006, it moves an offline reader, and that `0.3.6` is published and is the registry `latest` for both packages, with `0.3.5` the release before it.

## [0.3.5] - 2026-11-11
### Added
- P-0008: a sixth gate, `scripts/gate_size.mjs`, measures `packages/plugin/dist/*.js` on every run and checks four things: the plugin total against 68000 bytes, `repair-stream.js` against 28000, `session-scan.js` against 14000, and any file above 10000 bytes for having a cap of its own; before this, the budget lived only in prose and had no mechanism.
### Changed
- `node scripts/gate.mjs --mutate` now checks six gates and reports 6 of 6 gates caught their injected violation, with the negative control comparing the measured total against a cap one byte below it.
### Notes
- Measured when the gate was written: 67908 bytes in total, `repair-stream.js` 27925, `session-scan.js` 13237, `cli.js` 8503; P-0008 is `tested`, not `verified`, because it is a build-side gate with no resident seam; this release `0.3.5` is published and is the registry `latest` for both packages, so the 0.3.5 section is the shipped one; `0.3.4` becomes the previous release and `0.3.3` the one before it; `0.3.6` is now published and is the `latest`, so the 0.3.6 section is the shipped one and the 0.3.5 section is the release before it.

## [0.3.4] - 2026-11-11
### Added
- P-0006: `scan` now counts how every turn ended (`completed`, `max_tokens`, `aborted`, `error`) and names every `reason.error.code`, where before it counted only the `MALFORMED_RESPONSE` turns and dropped every other ending, so the largest failure classes were invisible in the report meant to map them. Of 293 turns, 94 completed, 88 `max_tokens`, 100 error and 11 aborted, and the error codes `MALFORMED_RESPONSE` 44, `UNSUPPORTED_REASONING_EFFORT` 37, `SERVER` 16, `UNKNOWN` 1, `MISSING_CREDENTIAL` 1, `INVALID_REQUEST` 1.
- P-0007: the copy channel could not regenerate the two longest outward files at all and printed only `copy_with_agy: agy exited null`, because the whole request travelled on one Windows command line once the fact pack grew (35509 characters for the changelog and 33530 for the readme, against a 32767 character cap — the spawn failed with `ENAMETOOLONG` before agy started and reported a null status), and because a generation that outlived the 600000 ms spawn timeout was killed and reported the same null status. Above the cap the prompt now travels over stdin as one `stream-json` user event, the answer is read from the final `result` event, a failed spawn is reported by its own code instead of a null status, and the timeout is half an hour; this is the build-side channel and touches no seam.
### Changed
- The census was first written as a separate module, the plugin `dist` then overshot the 68000 byte ceiling at 70389 bytes, and the module was deleted and its helpers inlined so the total settled at 67908 bytes — the scaffolding of a ninth file costs more than the code it holds.
### Notes
- A census is reported and never promoted into a finding (the exit code still turns on `fused_calls` and `fusion_failures`); P-0006 is `tested` and not `verified` because it moves an offline reader; truncated turns stay unfixed on purpose; this release `0.3.5` is published and is the registry `latest` for both packages, so the 0.3.5 section is the shipped one; `0.3.4` becomes the previous release and `0.3.3` the one before it; `0.3.6` is now published and is the `latest`, so the 0.3.6 section is the shipped one and the 0.3.5 section is the release before it.

## [0.3.3] - 2026-11-10
### Added
- P-0004: `scan` reads the log it is pointed at (a single session file or a whole session directory, plain `.jsonl` or multi-frame `.jsonl.zstd` through the same reader the plugin ships), keeps one auditable row per file, supports `--since`, reports the events it dropped as `before_since` instead of hiding them, and turns one undecompressable file into a failure line and a non-zero exit instead of a silent zero report.
- The redaction fix: a home path escaped with one or two backslashes, and a DSH session directory that encodes the same path, are now matched, and a measured pass rewrote three already recorded artifacts while leaving `produced_by` and `generated_at` untouched.
### Changed
- The seam split continues: the scan command and the argument plumbing move into their own modules because `dist/*.js` crossed the budget again.
### Fixed
- The same installable-manifest property carried forward.
### Notes
- P-0004 is `tested`, not `verified`, because it changes an offline reader and a redaction rule rather than the resident `llm/stream` seam, so no journal can attest it; and that this release is now published and is the registry `latest` for both packages, while the previous one (0.3.2) stays listed as superseded.

## [0.3.2] - 2026-11-10
### Added
- P-0005: a tool call whose single member value was written without a quote is resealed instead of being thrown away, but only when exactly one segment reproduces the whole text as one plain object whose payload round-trips byte for byte; the call keeps its own id and name, nothing is synthesized, and the stream-wide `maxCalls` budget is not consumed. A ninth counter `resealed` is added and is optional in the type on purpose, so a counter object recorded by an older build still prints its original line, and a stream whose only defect was a reseal reads `repaired` and never `quiet`.
### Changed
- The seam split: the stream types and the failure helpers move into their own modules, because `dist/*.js` crossed the byte ceiling after P-0005.
### Fixed
- The installable manifest, carried over from 0.3.1, so 0.3.2 is the first release that both installs and reseals.
### Notes
- P-0005 is `tested`, not `verified`, because no live host has produced the bare-value shape yet, and that 0.3.1 never reached the registry, because `publish_packages.mjs` was still being hardened when 0.3.2 took its place.

## [0.3.1] - 2026-11-10
### Fixed
- `dsh-remedy@0.3.0` reached the registry with a literal `workspace:*` dependency because npm published the raw workspace manifest, so every install failed with `EUNSUPPORTEDPROTOCOL`; the same code was repacked from a tarball that `pnpm pack` produced, where the protocol is rewritten to the exact `dsh-remedy-core` version.
### Notes
- No code changed, the tarball is the same size, the defect was in the published manifest only, and `scripts/publish_packages.mjs` now packs and checks the manifest before it publishes, so this cannot ship again. 0.3.1 was superseded by 0.3.2 before it reached the registry.

## [0.3.0] - 2026-11-10
### Added
- P-0003: two new counters, `refused` (seen and correctly rejected, never repairable) and `withdrawn` (repairable but given up), so the counter line carries eight names while the four verdict words stay unchanged.
### Changed
- A pure refusal no longer increments `fused`, which closes blind spot `BS-12`, and `unrepaired` now means exactly one thing: a fusion was proven and was not repaired.
### Fixed
- A budget refusal also raises `unrepaired` so a refused-but-unrepaired stream never reads `repaired`; an abandoned stream keeps `fused` and `unrepaired` and also raises `withdrawn`; a truncation raises `withdrawn` and never `fused`.
### Notes
- P-0003 moved from `tested` to `verified` on 2026-11-10, when a headless run with a small `maxCalls` refused a real fusion and the journal wrote `refused=1`; that P-0002 moved from `tested` to `verified` the same day, when a headless run repaired a real two-call fusion and the synthesized call was dispatched and answered; that `dsh-remedy-core` moves to 0.3.0 with the same engine, and that the package size moved from the 0.2.0 tarball (19569 bytes compressed, 64933 bytes unpacked) to the 0.3.0 tarball (22418 bytes compressed, 74014 bytes unpacked).

## [0.2.0] - 2026-11-10
### Added
- P-0002: an empty tool name is rejected (`missing-name`), a tool name that changes inside one index aborts the rescue (`name-changed`), a repaired `finish` keeps the adapter `replayState`, and a `block-end` repair is held until the tool-call phase ends.
### Changed
- Package slimming: sourcemaps are no longer shipped.
### Fixed
- The per-stream `maxCalls` ceiling; a withdrawn repair returns its calls to the budget; a synthesized call now opens its own block instead of a bare `block-end`; a `max-tokens` stream is counted as truncated rather than as an unrepaired fusion; a passed-through provider error is counted instead of reporting zero errors; and a non-string `argumentsDelta` no longer concatenates text.
### Notes
- P-0002 is `tested`, not `verified`, and that `dsh-remedy-core` moves to 0.2.0 with the same engine.

## [0.1.1] - 2026-11-10
### Fixed
- The published 0.1.0 tarball omitted the fixtures, so `dsh-remedy verify` failed from an installed copy; 0.1.1 ships `fixtures/` and the CLI resolves them from the package.
### Notes
- Version 0.1.1 applies to `dsh-remedy`; `dsh-remedy-core` remains at 0.1.0.
