/**
 * The patch registry: the single list of defects this project claims to fix.
 *
 * Rules (enforced by `scripts/gate_registry.mjs`):
 *  - ids are `P-NNNN`, unique, and never reused;
 *  - every patch names at least one evidence file and one guard, both of which
 *    must exist on disk;
 *  - `status: 'verified'` requires a live artifact under `data/results/`, so a
 *    patch cannot call itself verified on unit tests alone;
 *  - the registry is compared byte-for-byte with the snapshot in
 *    `data/results/patch-registry-*.json`, so editing this file without
 *    re-recording is a red gate.
 */

import type { PatchRecord } from './types.js'

export const PATCHES: readonly PatchRecord[] = [
  {
    id: 'P-0001',
    title: 'Split fused tool-call arguments into separate calls',
    symptom:
      'Tool call "<name>": Unexpected non-whitespace character after JSON at position N — Received arguments:\\n{...}{...}',
    rootCause:
      'The relay can stream two tool calls into one index. @earendil-works/pi-ai parseToolCallArguments (dist/utils/json-parse.js) receives the concatenation, throws LlmError(MALFORMED_RESPONSE), and @deepseek-ai/dsh-agent-loop re-throws because MALFORMED_RESPONSE is not in the default retryableCodes. Measured at dsh-llm-pi-ai/lib/index.js:1656 and confirmed upstream in deepseek-harness discussion #4427.',
    surface: 'llm/stream',
    status: 'verified',
    severity: 'critical',
    evidence: [
      'data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json',
      'data/fixtures/toolcall-fusion/valid-two-calls.json',
      'data/results/live-2026-11-09T17-00-00.000Z.json',
      'data/results/live-desktop-2026-11-09T19-10-00.000Z.json',
      'data/results/live-2026-11-12T06-00-00.000Z.json',
      'data/results/patch-registry-2026-11-09T16-40-00.000Z.json',
      'data/results/live-2026-11-12T12-20-00.000Z.json',
      'data/results/malformed-replay-2026-11-12T11-30-00.000Z.json',
      'data/results/stress-repair-2026-11-12T12-10-00.000Z.json',
    ],
    guards: [
      'tests/unit/json-split.test.ts',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/repair-stream.test.ts',
      'tests/unit/plugin-mount.test.ts',
      'tests/unit/session-log.test.ts',
      'scripts/gate_registry.mjs',
      'scripts/record_live_mount.mjs',
    ],
    failureClasses: ['MALFORMED_RESPONSE'],
    switchKey: 'repair',
    limits: [
      'cannot recover a call whose tail was cut by max-tokens (finish.reason.kind === length)',
      'does not fix the relay or adapter that assigned one index to two calls',
      'does not reorder or rename calls; the first call keeps the original id',
      'cannot attribute which upstream stage glued the objects; it only sees the assembled text',
    ],
  },
  {
    id: 'P-0002',
    title: 'A rescue must be provable, attributable and atomic',
    symptom:
      'A call split out of fused arguments runs with an empty or wrong tool name, a repaired finish replays without replayState, or a block-end repair is committed before a later block of the same stream is rejected',
    rootCause:
      'Repair-stream used to commit each block-end repair as it arrived, kept only the last tool name seen on an index, and emitted {kind:"stop"} without the adapter replayState. None of these break the JSON proof, so P-0001 called them repaired while the runtime could still dispatch the wrong call.',
    surface: 'llm/stream',
    status: 'verified',
    severity: 'major',
    evidence: [
      'docs/patches/P-0002-rescue-integrity.md',
      'data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json',
      'data/results/live-2026-11-10T14-45-00.000Z.json',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/repair-stream.test.ts',
    ],
    guards: [
      'tests/unit/repair-stream.test.ts',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/json-split.test.ts',
      'scripts/gate_registry.mjs',
    ],
    failureClasses: ['MALFORMED_RESPONSE'],
    switchKey: 'repair',
    limits: [
      'cannot prove the atomic-commit path live on this host: the measured adapter never emits block-end for a tool call',
      'proves downstream acceptance of a synthesized block-start only on the finish path; an adapter that closes blocks itself is still unmeasured (BS-11)',
      'treats a tool name that arrives twice with different values as unrepairable, so a legitimate adapter bug stays a failure',
      'leaves the verdict vocabulary untouched: until P-0003 every rejection was counted as fused, so a non-fusion syntax error read as degraded (BS-12, closed by P-0003)',
    ],
  },
  {
    id: 'P-0003',
    title: 'A refusal must be observable, and a withdrawal must not read as a repair',
    symptom:
      'A stream whose only defect is plain bad JSON reports "repair incomplete" (degraded), and a proven repair that was withdrawn is indistinguishable from a fusion that could never be split',
    rootCause:
      'RemedyMonitor.recordRejected incremented fused and unrepaired for every rejection, whatever its code (packages/plugin/src/repair-stream.ts:122-126 in 0.2.0). A refusal that never proved a fusion therefore inflated fused, which both hid quiet streams behind degraded and erased the difference between "we declined" and "we could not". Left open as BS-12 because fixing it touches the verdict counters.',
    surface: 'llm/stream',
    status: 'verified',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0003-refusal-observability.md',
      'data/results/live-2026-11-10T16-30-00.000Z.json',
      'tests/unit/verdict.test.ts',
      'tests/unit/repair-stream.test.ts',
    ],
    guards: [
      'tests/unit/verdict.test.ts',
      'tests/unit/repair-stream.test.ts',
      'tests/governance/ledgers.test.ts',
      'scripts/gate_registry.mjs',
    ],
    failureClasses: ['MALFORMED_RESPONSE'],
    switchKey: 'repair',
    limits: [
      'does not change the four verdict states or their order: refused and withdrawn are reported, never judged',
      'cannot express "observed, refused, and correctly not repaired" in a state name; only the counter row carries it',
      'does not migrate old journal lines, which keep the six-field counter shape',
      'proves refused and fused on the budget-refusal path only; a live stream that moves withdrawn is still unmeasured',
    ],
  },
  {
    id: 'P-0005',
    title: 'A bare value after a member key must be resealed, or refused — never guessed',
    symptom:
      'A tool call fails with `Unexpected token \'c\'` or `Unexpected end of JSON input` because the model wrote a program, not a JSON string, after `"code":`; the turn is killed with MALFORMED_RESPONSE and nothing is repaired',
    rootCause:
      'The adapter assembles the argument text from deltas and hands it to JSON.parse. When the model emits a bare, unquoted multi-line blob as one member value, the text is neither a fusion (one object was intended) nor recoverable by splitting, so P-0001 refuses it as `single-object` and the call is never dispatched (packages/core/src/toolcall-repair.ts:124-141 in 0.3.1).',
    surface: 'llm/stream',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0005-bare-value-reseal.md',
      'data/fixtures/toolcall-fusion/bare-code-value.json',
      'data/results/malformed-replay-2026-11-12T11-30-00.000Z.json',
      'tests/unit/reseal.test.ts',
      'tests/unit/toolcall-repair.test.ts',
    ],
    guards: [
      'tests/unit/reseal.test.ts',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/repair-stream.test.ts',
      'tests/unit/verdict.test.ts',
      'scripts/gate_registry.mjs',
    ],
    failureClasses: ['MALFORMED_RESPONSE'],
    switchKey: 'repair',
    limits: [
      'reseals only when exactly one member value proves: two possible resealings is refused as ambiguous, never chosen',
      'never touches a truncated call: a cut tail is missing bytes, not a missing quote',
      'does not repair a duplicate key, a doubled colon, a missing closing brace, or an illegal escape: those are refusals by design',
      'keeps the call id, so no synthetic identity is created and the stream budget is untouched',
      'the ninth counter is optional in the type on purpose: a 0.3.x artifact has no `resealed` field and must render exactly as it did',
    ],
  },
  {
    id: 'P-0011',
    title: 'A second seam with no test is a seam nobody has ever run',
    symptom:
      'agent/request-error shipped in 0.2.0 behind retryOnMalformed and had zero tests: 20 test files, none of them mentioned the seam. It also called next() first and then overrode the answer, kept its budget in a Map that was never pruned (one entry per turn:step for the life of a desktop process), and would have retried IMAGE_OFFLOAD_REQUIRED / INVALID_CREDENTIAL / MISSING_CREDENTIAL if the code ever reached it, because only MALFORMED_RESPONSE was checked but the control codes were not excluded on purpose',
    rootCause:
      'the listener was written against an assumed contract. The shipped runtime documents the real one: "a handling listener returns { kind: retry } without calling next(), while an unhandled failure is terminal", and "a waterfall listener that does not own the decision must return next()". Calling next() first and overriding it discards whatever the default chain decided, and context compaction authorizes its own retry on exactly that path. Nothing measured either direction, so both defects were invisible',
    surface: 'agent/request-error',
    status: 'tested',
    severity: 'major',
    evidence: [
      'tests/unit/request-error.test.ts',
      'packages/plugin/src/failure-listener.ts',
      'docs/patches/P-0011-request-error-contract.md',
    ],
    guards: [
      'tests/unit/request-error.test.ts',
      'packages/plugin/src/failure-listener.ts',
    ],
    failureClasses: ['MALFORMED_RESPONSE'],
    switchKey: 'retryOnMalformed',
    limits: [
      'only MALFORMED_RESPONSE is retried: SERVER, TRANSPORT and TIMEOUT are already retried upstream (195 of 213 failing groups self-healed inside the same turn), so a second layer here would compete for the seam',
      'the retry budget defaults to 0, so nothing is retried unless a deployment asks for it',
      'the bound is 256 cache entries, which is far more than one turn needs and small enough that a week of desktop use cannot grow it; an entry older than that is evicted, so a very long single turn could revisit a step and spend a fresh retry',
      'no live artifact: a retry is a decision on a seam, and the headless profile that produced the other live artifacts runs that seam only when a turn fails in a way this plugin retries, which never happened with the default budget of 0',
    ],
  },
  {
    id: 'P-0012',
    title: 'One byte cap for two load paths is a cap that taxes the wrong half',
    symptom:
      'the single 68000-byte ceiling counted a mounted plugin and a CLI invocation as the same thing. P-0009 landed with three bytes of headroom, and the next patch (P-0011) needed 4263 bytes of new module that simply did not fit: the only way to pay for it under the old cap was to delete prose from files a daemon loads at startup',
    rootCause:
      'scripts/gate_size.mjs summed every emitted module and compared one number. It never asked which of those modules a running plugin imports, so 31425 bytes of CLI-only code (cli, cli-args, scan-command, session-scan) sat inside the same budget as the 38073 bytes that actually load on every session, and every resident byte had to be financed out of the CLI half',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'scripts/lib/budgets.mjs',
      'scripts/gate_size.mjs',
      'tests/governance/budget-split.test.ts',
      'docs/patches/P-0012-budget-by-load-path.md',
    ],
    guards: [
      'scripts/gate_size.mjs',
      'tests/governance/budget-split.test.ts',
    ],
    limits: [
      'it still refuses a crossing; the caps moved twice in one session (R20) and both moves are recorded in scripts/lib/budgets.mjs with the owner signature PROJECT_RULES section 1 requires',
      'the class lists are explicit, but the governance test only checks the relative import graph: a module pulled in through dsh-remedy-core or a dynamic import would not be caught',
      'a split budget cannot tell good growth from bad; it only says which half pays',
      'it caps emitted JavaScript only, not declarations, fixtures or package-root files',
    ],
  },
  {
    id: 'P-0013',
    title: 'The failure class this host hits most after fusion was named by nobody',
    symptom:
      '37 turns on this host died with UNSUPPORTED_REASONING_EFFORT, all of them the same sentence: provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh", across three workspaces, eleven sessions and two days. scan counted them; the resident layer said nothing, so a user got a dead turn and no line explaining why. INVALID_REQUEST, MISSING_CREDENTIAL and EMPTY_RESPONSE were silent in the same way',
    rootCause:
      'the resident layer only spoke about two outcomes: a repair it made, and a stream it saw end. A deterministic refusal before any request was dispatched left no event at all, because repair-stream is mounted on llm/stream and a step rejected during preparation never reaches it. The knowledge existed (the error code and its message) and had no path into the journal',
    surface: 'agent/request-error',
    status: 'tested',
    severity: 'major',
    evidence: [
      'packages/core/src/preflight.ts',
      'packages/plugin/src/failure-listener.ts',
      'tests/unit/preflight.test.ts',
      'tests/unit/request-error.test.ts',
      'docs/patches/P-0013-named-refusals.md',
    ],
    guards: [
      'tests/unit/preflight.test.ts',
      'tests/unit/request-error.test.ts',
      'packages/core/src/preflight.ts',
    ],
    failureClasses: ['UNSUPPORTED_REASONING_EFFORT', 'INVALID_REQUEST', 'MISSING_CREDENTIAL', 'EMPTY_RESPONSE'],
    switchKey: 'repair',
    limits: [
      'naming is always on, but it never repairs and never retries: a deterministic refusal costs one named line instead of one dead turn, which is the whole claim',
      'preflight is a pure decision, not a mount: it re-derives the adapter supported set from a profile declaration and answers ok/refuse/unknown. Nothing wires it into agent/pre-step yet, because that seam must first be proven to reject the step without being read as a user cancellation',
      'it does not silently downgrade a level. The adapter itself is willing to (resolvedConfig = { ...defaulted, reasoningEffort: effective } when the requested level differs from a declared default), but changing a user configuration is a decision the user makes, so the patch reports a suggestion instead',
      'the preflight cannot see a model whose metadata lives only in the adapter: it reads what the profile declares, and a profile that declares nothing is reported as unknown rather than assumed',
    ],
  },
  {
    id: 'P-0004',
    title: 'A scan must read the log it is pointed at, and a redaction must see every path shape',
    symptom:
      '`dsh-remedy scan <session.v4.jsonl.zstd>` reported 0 attempts and one unreadable line per compressed byte, and artifacts that cited a session file carried the account name in three shapes the redactor could not match',
    rootCause:
      'cmdScan read a multi-frame zstd session with readFileSync(file, "utf8") instead of the decompressSessionLog reader the plugin already ships (packages/plugin/src/cli.ts:236 in 0.3.2), and core/redact.ts matched only a single-backslash C:\\Users\\<name>, so a JSON-escaped path, a slashed path and a DSH session directory named after the home path all passed through.',
    surface: 'cli',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0004-scan-fidelity.md',
      'tests/e2e/cli.test.ts',
      'tests/unit/session-scan.test.ts',
      'tests/unit/redact.test.ts',
    ],
    guards: [
      'tests/e2e/cli.test.ts',
      'tests/unit/session-scan.test.ts',
      'tests/unit/redact.test.ts',
      'scripts/gate_ssot.mjs',
      'scripts/redact_artifacts.mjs',
    ],
    limits: [
      'reports a filtered scan as before_since instead of guessing; an unstamped event inside a window is unreadable, never assumed in the window',
      'one undecompressable file is a failures line and exit 3, not a silent zero',
      'does not deduplicate the same repair seen by both the journal and the session file',
      'matches a home path only when the directory starts with a drive letter; another workspace spelling is unmeasured',
    ],
  },
  {
    id: 'P-0006',
    title: 'A scan that counts only the repairable turns is not a fault map',
    symptom:
      '`dsh-remedy scan` reported 44 fusion failures out of 287 finished turns on this host: the 88 turns that died on `max-tokens` (31% of all turns) and the 36 that died on `UNSUPPORTED_REASONING_EFFORT` were not counted anywhere, so the biggest failure classes were invisible in the one report meant to map them',
    rootCause:
      'packages/plugin/src/session-scan.ts read `data.reason` on `turn/end` and returned early twice, on `kind !== "error"` and on `code !== "MALFORMED_RESPONSE"`. That filter is correct for "can this layer repair it?" and wrong for "how did the turn end?": the report carried the filter into the map.',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0006-turn-census.md',
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
    ],
    guards: [
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
      'scripts/gate_registry.mjs',
    ],
    limits: [
      'a census is reported, never promoted into a finding: the scan exit code still turns on fused_calls and fusion_failures, so 88 truncated turns do not make every scripted scan fail',
      'truncated turns stay unfixed: a cut tail is missing bytes, not a missing quote, and 0 of 88 truncated turns could be tied to a buffered call',
      '`fusion_failures` keeps its exact meaning (`MALFORMED_RESPONSE` turns only), so an older artifact reads the same as it did before',
      'an error code is counted under the name the adapter emitted; the report is redacted before it leaves the CLI, and the code vocabulary is a closed set of short identifiers',
      'a `reason.kind` this census does not know is left uncounted rather than given a bucket of its own',
    ],
  },
  {
    id: 'P-0007',
    title: 'A copy channel that reports "exited null" cannot be repaired',
    symptom:
      'the two longest outward files, README.md and CHANGELOG.md, could not be regenerated at all: every attempt printed `copy_with_agy: agy exited null` and nothing else, so the same six words had to be retried from scratch with no way to learn what went wrong between attempts',
    rootCause:
      'scripts/copy_with_agy.mjs put the whole request on one Windows command line. Once the fact pack grew the request measured 35509 characters for changelog and 33530 for readme against the 32767 character cap, so spawnSync failed before agy ever started: run.error.code was ENAMETOOLONG and run.status was null. A generation that instead outlived the 600000 ms spawn timeout was killed the same way, with the same null status, so two different faults printed one unreadable line',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0007-copy-channel-transport.md',
      'tests/unit/agy-channel.test.ts',
      'docs/copy/manifest.json',
    ],
    guards: [
      'tests/unit/agy-channel.test.ts',
      'scripts/gate_copy.mjs',
      'scripts/lib/agy-channel.mjs',
    ],
    limits: [
      'the channel does not retry a failed generation across transports: it picks one transport from the request length and reports whatever went wrong, so the operator still re-runs a failure by hand',
      'the timeout is raised to half an hour, not removed: an agy that hangs is still killed and still named as a timeout',
      'a transport failure is diagnosed, not repaired — a refusal, a missing model and a missing binary each keep their own message',
      'the fact pack is not shortened to fit the cap, so the stdin path stays the normal path and the argv path only serves the smallest briefs',
    ],
  },
  {
    id: 'P-0008',
    title: 'A byte budget that no script checks is a suggestion',
    symptom:
      'the byte budget was written down in prose and crossed three consecutive times before anyone noticed: the plugin total reached 55815 bytes after P-0005, 64539 after P-0004 and 70389 on the first P-0006 attempt, and each crossing was found by hand after the patch had already been built, tested and packed',
    rootCause:
      'the caps lived only in the fact pack and README.md. Nothing in scripts/ read them, so a patch that crossed a line stayed green through 189 tests and five gates, and the structural split that fixed it happened afterwards. grepping scripts/ for the ceiling returned no hits, which is the whole defect: the number had no mechanism',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0008-byte-budget-gate.md',
      'scripts/gate_size.mjs',
      'audit/gate_ledger.json',
    ],
    guards: [
      'scripts/gate_size.mjs',
      'tests/governance/ledgers.test.ts',
      'scripts/gate.mjs',
    ],
    limits: [
      'the gate measures the emitted plugin only: core does not load at startup, so the ceiling protects what is loaded there',
      'it does not shrink anything; the measured numbers stay what they were when the gate was written',
      'it does not measure dist/*.d.ts, which is paid at build time rather than load time',
      'it cannot decide how to split a file that crosses a cap — it only refuses the crossing, so the structural fix stays a human decision',
    ],
  },
  {
    id: 'P-0010',
    title: 'The npm page documented a CLI that had not existed since 0.3.3',
    symptom:
      'two strings described scan and both were two releases stale: packages/plugin/README.md - the page npm renders - said scan <session.jsonl> [--json] [--out <file>], and the CLI USAGE said scan <session.jsonl|session.v4.jsonl.zstd> [--json] [--out <file>]. Neither admitted a directory, --since or --max-files, all shipped by P-0004 in 0.3.3, so the public install page described a tool that rejects the argument most users would pass',
    rootCause:
      'nothing watched either string. gate_copy covers the eleven outward files at the repository root, and packages/plugin/README.md is neither generated by the copy channel nor listed in tests/governance/public-copy.test.ts, so it had no output_sha256 and no gate. No test ran --help or compared the two strings, so a red result was impossible by construction. Same family as P-0004 and P-0006: a fact without a mechanism rots, and this one rotted on the page strangers read first',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0010-cli-usage-truth.md',
      'packages/plugin/README.md',
      'packages/plugin/src/cli-args.ts',
      'tests/unit/cli-usage.test.ts',
    ],
    guards: [
      'tests/unit/cli-usage.test.ts',
      'packages/plugin/README.md',
      'packages/plugin/src/cli-args.ts',
    ],
    limits: [
      'the gate set still does not cover packages/*/README.md: the new test compares the two scan lines, not the package README as a whole',
      'gate_copy cannot see this file because it is hand-written package prose with no output_sha256; moving it into the copy channel would make it generated, which is a separate decision',
      'the one-line-per-command rewrite pays for the flag list under the byte ceiling, so the per-command prose is thinner than it was; the detail lives in the fact pack and the patch document',
      'no live artifact is possible: a usage string is not a resident seam, so this patch stays tested',
    ],
  },
  {
    id: 'P-0009',
    title: 'A windowed scan called the one dated line every session starts with unreadable',
    symptom:
      'scan --since over a real session directory reported unreadable_lines equal to the number of files it read: 78 files produced 78 unreadable lines while every byte of them parsed. The tool answered "I could not read this" about the single most reliable event in the log',
    rootCause:
      'packages/plugin/src/session-scan.ts:178 required a numeric `time` before it would apply the window and counted anything else as unreadable. A session log opens with a `{"type":"session",…}` header whose instant is `createdAt`, not `time`, so every header fell into that branch. The scanner was reading the file correctly and reporting the schema wrong',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0009-session-header-window.md',
      'packages/plugin/src/session-scan.ts',
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
    ],
    guards: [
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
      'packages/plugin/src/session-scan.ts',
    ],
    limits: [
      'only the `session` header is dated by createdAt; an ordinary event with no instant is still an unreadable line, because there is no second field to fall back to',
      'the fix does not make the scan faster or smaller — it changes which bucket a header lands in',
      'a header inside the window contributes its instant to the reported window but adds no attempts or turns, so the census does not move',
      'it does not validate createdAt against the wall clock of the file; a hand-edited session can still claim any date',
    ],
  },
  {
    id: 'P-0014',
    title: 'The project describing itself is the part nothing checked',
    symptom:
      'the fact pack said its packed manifest pins "dsh-remedy-core": "0.3.7" and that 0.3.6 was the previous release while the published 0.3.8 tarball pinned 0.3.8 and README/CHANGELOG both named 0.3.7; the handoff called patch-registry-2026-11-12T19-35-00.000Z.json 900820ae while the file and its .sha256 both hash to 96f9144f; and the package README that npm renders still documented four commands after explain shipped, because the only test compared the scan line',
    rootCause:
      'R21 replaced "an external model wrote it" with "every prose number exists in the fact pack", which checks the shape of a claim and never its truth: nothing read the fact pack own statements, so they could describe a version the packages had left behind. The handoff is prose, and gate_ssot only validates data/results/*.json, so a hash printed next to an artifact had no sibling sidecar to disagree with. tests/unit/cli-usage.test.ts compared one line, exactly as far as P-0010 needed, and P-0010 recorded that limit in its own limits field; the next release added a command and it fell through',
    surface: 'scripts',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0014-description-truth.md',
      'tests/governance/facts-truth.test.ts',
      'tests/governance/handoff-truth.test.ts',
      'tests/unit/cli-usage.test.ts',
      'docs/copy/facts/public-repo-facts.md',
    ],
    guards: [
      'tests/governance/facts-truth.test.ts',
      'tests/governance/handoff-truth.test.ts',
      'tests/unit/cli-usage.test.ts',
      'scripts/copy_record.mjs',
    ],
    limits: [
      'the package README is still hand-written prose without an output_sha256; what guards it now is its equality with USAGE, not a hash against the fact pack, so the rest of the page is still unguarded (BS-13 narrows rather than closes)',
      'the fact pack is only checked against other files in this repository, so a sentence nothing else records remains a claim about the world that this patch cannot verify',
      'the hash check reads only evidence-index rows carrying exactly one artifact and exactly one hash; a row that compares two publishes is skipped rather than guessed',
      'gate_copy still cannot see the handoff or the package README, so the new checks are governance tests, not gates, and they run where the suite runs',
    ],
  },
  {
    id: 'P-0015',
    title: 'The seam nobody mounted because nobody measured what refusing looks like',
    symptom:
      'agent/pre-step has been left unmounted since R20 on one sentence repeated in three places: "a rejected step opens no step, but what the user sees on rejection has not been measured, it could read as a cancellation". A capability that can refuse a step before it costs a token was therefore blocked by an assumption nobody had checked',
    rootCause:
      'the claim was never tested against the runtime. The loop own source answers it in five lines: preStep calls inbox.claim, awaits the agent/pre-step waterfall, and on {kind:"reject"} closes the turn with reason kind "blocked" without opening a step. Nobody had run it, so the sentence survived three rounds as if it were a finding rather than a hypothesis',
    surface: 'profile',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0015-pre-step-rejection.md',
      'data/results/prestep-probe-2026-11-13T07-45-00.000Z.json',
      'scripts/record_prestep_probe.mjs',
    ],
    guards: [
      'data/results/prestep-probe-2026-11-13T07-45-00.000Z.json',
      'scripts/record_prestep_probe.mjs',
      'scripts/gate_ssot.mjs',
    ],
    limits: [
      'it measures the seam, it does not mount a product on it: nothing calls agent/pre-step in a shipped profile after this patch',
      'the desktop UI render of reason.kind "blocked" remains unmeasured, so the seam is usable but not yet presentable, and the probe ran on a headless profile only',
      'a rejection discards the claimed input: the measured cost is that a user must retype the message, which is why a rewrite via {kind:"enter"} is the better default when the goal is to say something',
      'only the first proposed step of one turn was exercised; rejection inside a multi-step turn (next-step steering) is untested',
    ],
  },
  {
    id: 'P-0016',
    title: 'The command that answers "what covers this" kept its own copy of the answer',
    symptom:
      '`dsh-remedy explain` printed which patch covers each failure class from two constants of its own, COVERAGE and SWITCHES, so the registry and the command were two homes for one claim. A patch could cover a class and never appear in the answer, and nothing compared the two tables',
    rootCause:
      'the command was written before the registry carried that kind of claim. Its tables were a convenient local map, and the only reader of both — a human comparing the file with registry.ts by eye — was also the only mechanism. This is the same family as P-0010 and P-0014: a fact with a second home rots, and the second home was the one users read',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'packages/core/src/registry.ts',
      'packages/core/src/types.ts',
      'packages/plugin/src/explain-command.ts',
      'tests/governance/coverage-single-source.test.ts',
    ],
    guards: [
      'tests/governance/coverage-single-source.test.ts',
      'tests/e2e/explain.test.ts',
      'packages/core/src/registry.ts',
    ],
    limits: [
      'it moves six coverage claims and no behaviour: the printed table is identical before and after, which is why the artifact comparison is worth one line in the reproduction',
      'the switch keys are still a small closed vocabulary (repair, retryOnMalformed); a patch switched by some other key would need that key added here rather than inferred',
      'a patch that answers a failure class but is never mounted still reads as covered-and-off, because coverage is a claim about the code rather than about the profile',
      'no live artifact is possible: this is the CLI answering from the registry, not a resident seam',
    ],
  },
  {
    id: 'P-0017',
    title: 'The two pages npm renders had no mechanism at all',
    symptom:
      'packages/plugin/README.md and packages/core/README.md are hand-written, carry no output_sha256 and are not generated by the copy channel, so gate_copy never saw them. P-0010 pinned one scan line and P-0014 pinned the CLI block; the rest of both pages — 2331 bytes on the plugin side — was compared against nothing while being the first thing a stranger installs from',
    rootCause:
      'the copy channel was built for the repository root outward files, and the package pages were written before it existed. Moving them in was always a separate decision, so each round pinned a little more of the page with a targeted test instead of answering the whole question: what is actually unguarded here',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'packages/plugin/README.md',
      'packages/core/README.md',
      'tests/governance/package-readme-prose.test.ts',
      'docs/patches/P-0017-package-readme-prose.md',
    ],
    guards: [
      'tests/governance/package-readme-prose.test.ts',
      'tests/unit/cli-usage.test.ts',
    ],
    limits: [
      'it proves there is no prose number and no undispatchable command left to rot; it does not put the page in the copy channel, so layout and behavioural claims are still hand-written',
      'the number rule is the copy channel own criterion, not a general truth test: a page could still describe behaviour the code does not have, and nothing here would notice',
      'packages/core/README.md is held to the weaker half only (no prose numbers, no CLI block), because it documents a library rather than a command',
      'no live artifact is possible: these are package pages, not a resident seam',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0018',
    title: 'A Windows exit code printed as a bare number sent an operator hunting the wrong cause',
    symptom:
      'the publish wrapper printed "npm exited 3221226505 in packages/core" and stopped. That number is Windows 0xC0000409, raised before npm spoke to the registry at all, so the operator went looking for a credentials or permissions problem that did not exist while the real answer was "run npm publish <tarball> directly"',
    rootCause:
      'the failure path printed result.status and then fell through to npmFailureAdvice, which only understands HTTP-shaped answers (401, 403, 404, 402, 429). A process killed by the Windows runtime has no HTTP answer, so every branch of that advice was wrong. The 0.3.6 publish is the measurement: both npm debug logs for that attempt stop right after the tarball notice with no HTTP request, and the two identical direct calls then answered exit 0',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'scripts/publish_packages.mjs',
      'tests/unit/publish.test.ts',
      'docs/patches/P-0018-windows-exit-code.md',
    ],
    guards: ['tests/unit/publish.test.ts', 'scripts/publish_packages.mjs'],
    limits: [
      'it names two codes, 3221226505 (0xC0000409) and 3221225477 (0xC0000005), because those are the two this machine produced; another Windows exception still prints its raw number',
      'it does not retry the publish: the advice tells the operator to run the direct call, which is a decision about the registry rather than about npm crashing',
      'it cannot prove the crash was the runtime rather than npm itself; what it proves is that no HTTP request was logged, which is why the advice says "before it answered the registry"',
      'no live artifact is possible: this is advice printed by a build script',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0019',
    title: 'The page strangers read first described a project that had stopped existing',
    symptom:
      'README.md and README.zh-CN.md opened as "a resident repair layer that mounts on llm/stream" while the project had become a patch set of eighteen defects across two resident seams, the CLI and the build side. Worse, one sentence had become false: both pages said agent/pre-step was not mounted because nobody had measured what a rejection does, and R23 had measured exactly that',
    rootCause:
      'the copy channel guards numbers, not shape. gate_copy checks that every prose digit exists in the fact pack and has no opinion about whether the page still describes the product; P-0014 pinned the pack own claims and P-0017 pinned the package pages, so the two root READMEs could keep saying "one seam, one wrapper" while the registry grew to eighteen patches. Three numbers had also drifted with them (tests, the CLI half of the budget, the total)',
    surface: 'scripts',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0019-outward-pages.md',
      'README.md',
      'README.zh-CN.md',
      'packages/plugin/README.md',
      'packages/core/README.md',
    ],
    guards: [
      'tests/unit/cli-usage.test.ts',
      'tests/governance/package-readme-prose.test.ts',
      'tests/governance/facts-truth.test.ts',
      'scripts/gate_copy.mjs',
    ],
    limits: [
      'the root README still has no structural guard: the mechanism is "every digit exists in the pack", and a page could describe behaviour the code does not have with no gate noticing (BS-13 own family)',
      'it does not change what npm renders, because npm serves the tarball and the published tarball is 0.3.8; the new descriptions and package READMEs appear only when a release carries them',
      'the seam table is hand-maintained prose: a patch that moves seam must be moved in the table by hand, and nothing compares the two',
      'no live artifact is possible: these are pages, not a seam',
    ],
    failureClasses: [],
  },
]

/** Look up one patch by id. */
export function findPatch(id: string): PatchRecord | undefined {
  return PATCHES.find((patch) => patch.id === id)
}

export interface RegistryProblem {
  readonly patch: string
  readonly problem: string
}

const ID_PATTERN = /^P-\d{4}$/
/**
 * The seams a patch may name. `scripts` is the build side — the copy channel,
 * the gates, the recorders — and it is a surface because a broken recorder
 * silently turns "unknown" into "green".
 */
const SURFACES = new Set(['llm/stream', 'agent/request-error', 'cli', 'profile', 'scripts'])

/**
 * Structural invariants that do not need the filesystem. The gate adds the
 * existence and snapshot checks on top.
 */
export function registryProblems(patches: readonly PatchRecord[] = PATCHES): RegistryProblem[] {
  const problems: RegistryProblem[] = []
  const seen = new Set<string>()
  for (const patch of patches) {
    if (!ID_PATTERN.test(patch.id)) problems.push({ patch: patch.id, problem: 'id must match P-NNNN' })
    if (seen.has(patch.id)) problems.push({ patch: patch.id, problem: 'duplicate id' })
    seen.add(patch.id)
    if (!SURFACES.has(patch.surface)) problems.push({ patch: patch.id, problem: `unknown surface "${patch.surface}"` })
    if (patch.evidence.length === 0) problems.push({ patch: patch.id, problem: 'no evidence file' })
    if (patch.guards.length === 0) problems.push({ patch: patch.id, problem: 'no guard' })
    if (patch.status === 'verified' && !patch.evidence.some((path) => path.startsWith('data/results/live-'))) {
      problems.push({ patch: patch.id, problem: 'verified without a live data/results/live-* artifact' })
    }
    if (patch.status === 'retired' && patch.guards.length > 0) {
      problems.push({ patch: patch.id, problem: 'a retired patch must not claim live guards' })
    }
  }
  return problems
}

/** Deterministic snapshot written by `scripts/record_patch_registry.mjs`. */
export function patchRegistrySnapshot(): { schema_version: 1; patches: readonly PatchRecord[] } {
  return { schema_version: 1, patches: PATCHES }
}
