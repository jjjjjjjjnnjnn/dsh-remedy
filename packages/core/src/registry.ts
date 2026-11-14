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
      'a split-out call could run under an empty or wrong tool name, a repaired finish could replay without replayState, and a block-end repair could be committed before a later block of the same stream was rejected',
    rootCause:
      'repair-stream committed each block-end repair as it arrived, kept only the last name seen on an index, and emitted {kind:"stop"} without the adapter replayState; none of that broke the JSON proof, so a repaired call could still be dispatched wrong',
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
      'on 0.2.2-rc.1 the adapter never closed a tool-call block; on rc.3 it closes the first fragment and leaves the surplus to the finish path (measured 2026-11-13, adaptation-0.4.2-on-0.2.2-rc.3)',
      'a synthesized block-start is proven accepted on the finish path only; an adapter with its own index bookkeeping is still unmeasured (BS-11)',
      'a fusion of two different tools carries one name per index; P-0027 sends the fragment that does not fit under remedy_unattributed (BS-18)',
      'a tool name that arrives twice with different values stays unrepairable',
      'leaves the verdict vocabulary untouched (BS-12, closed by P-0003)',
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
      'agent/request-error shipped in 0.2.0 behind retryOnMalformed with zero tests; it called next() and then overrode the answer, kept its budget in a Map that was never pruned, and would have retried IMAGE_OFFLOAD_REQUIRED / INVALID_CREDENTIAL / MISSING_CREDENTIAL',
    rootCause:
      'the listener was written against an assumed contract. The shipped runtime says a handling listener returns {kind:"retry"} without calling next(), and a waterfall listener that does not own the decision must return next(); calling next() first discards the default chain, and context compaction authorizes its own retry on that path',
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
      'only MALFORMED_RESPONSE is retried; SERVER, TRANSPORT and TIMEOUT already self-heal upstream (195 of 213 failing groups), so a second layer would compete for the seam',
      'the retry budget defaults to 0: nothing is retried unless a deployment asks for it',
      'the bound is 256 cache entries; an evicted entry lets a very long single turn spend a fresh retry',
      'no live artifact: the headless profile never failed in a way this plugin retries at the default budget',
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
      '37 turns on this host died with UNSUPPORTED_REASONING_EFFORT (one sentence, three workspaces, eleven sessions); scan counted them and the resident layer said nothing. INVALID_REQUEST, MISSING_CREDENTIAL and EMPTY_RESPONSE were silent in the same way',
    rootCause:
      'repair-stream is mounted on llm/stream, so a step refused during preparation never reaches it; the error code and its message existed and had no path into the journal',
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
      'naming is always on and never repairs or retries: one named line instead of one dead turn',
      'preflight is a pure decision, not a mount; nothing wires it into agent/pre-step yet, because P-0015 measures that seam first',
      'it never silently downgrades a level: the adapter would, the user decides, so the patch reports a suggestion instead',
      'a model whose metadata lives only in the adapter is reported as unknown, never assumed',
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
      'packages/plugin/README.md (the page npm renders) said scan <session.jsonl> [--json] [--out <file>] and the CLI USAGE said scan <session.jsonl|session.v4.jsonl.zstd> [--json] [--out <file>]; neither admitted a directory, --since or --max-files, all shipped by P-0004',
    rootCause:
      'nothing watched either string: gate_copy covers the root outward files, the package README has no output_sha256 and no gate, and no test ran --help or compared the two strings, so a red result was impossible',
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
      'the gate set still does not cover packages/*/README.md: the test compares the two scan lines, not the package README as a whole',
      'moving the page into the copy channel would make it generated, which is a separate decision',
      'the one-line-per-command rewrite pays for the flag list, so the per-command prose is thinner; the detail lives in the patch document',
      'a usage string is not a resident seam: no live artifact, so this stays tested',
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
      'the fact pack pinned core 0.3.7 and called 0.3.6 the previous release while the published 0.3.8 tarball pinned 0.3.8 and README/CHANGELOG named 0.3.7; the handoff quoted 900820ae for a file that hashes to 96f9144f; and the npm page documented four commands after explain shipped',
    rootCause:
      'the copy criterion checked the shape of a claim (every prose number exists in the fact pack) and never the pack own statements; gate_ssot validates data/results/*.json and never a hash printed in prose; cli-usage.test.ts compared one line, exactly as far as P-0010 needed',
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
      'the package README is still hand-written prose; its equality with USAGE is the guard, not a hash against the fact pack, so the rest of the page stays unguarded (BS-13 narrows)',
      'the fact pack is checked only against other repository files; a sentence nothing else records stays an unverified claim about the world',
      'the hash check skips any evidence row that compares two publishes rather than guessing',
      'gate_copy still cannot see the handoff or the package README: these are governance tests, not gates',
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
      'README.md and README.zh-CN.md still opened as "a resident repair layer that mounts on llm/stream" while the project had become eighteen patches across two resident seams, the CLI and the build side; both also said agent/pre-step was unmounted because nobody had measured a rejection, which R23 had',
    rootCause:
      'the copy channel guards numbers, not shape: gate_copy checks that every prose digit exists in the fact pack and has no opinion about whether the page still describes the product; three numbers (tests, the CLI half, the total) had drifted too',
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
      'the root README still has no structural guard: a page could describe behaviour the code does not have (BS-13 own family)',
      'it does not change what npm renders until a release carries the new pages',
      'the seam table is hand-maintained prose; nothing compares it with the registry',
      'no live artifact: these are pages, not a seam',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0020',
    title: 'A listing that pins git bytes while advertising a registry version installs neither',
    symptom:
      'docs/market-index.json declared version 0.3.8 and a git commit in the same entry. 0.3.8 is the published tarball with thirteen patches; the commit it named carried nineteen, the new package descriptions and a rewritten README. A market that trusted the entry would clone bytes the version number does not describe, which is exactly the drift the pinned format exists to prevent',
    rootCause:
      'the guard written one round earlier checked the shape of the pin and never its meaning: commit matched a forty-character hex pattern and path was packages/plugin, so a pin that pointed at the wrong kind of artifact passed. The index also could not name the commit that contained it, so every document commit forced another re-pin — three in a row was the visible symptom of a source object with no defined meaning',
    surface: 'scripts',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0020-market-source-truth.md',
      'docs/market-index.json',
      'tests/governance/distribution-entry.test.ts',
    ],
    guards: ['tests/governance/distribution-entry.test.ts', 'docs/market-index.json'],
    limits: [
      'it does not turn the repository into a published artifact: P-0014 through P-0019 stay merged and unreleased, and the index says so in words instead of hiding it',
      'a git source remains allowed, but only with an explicit unreleased marker, so a future release may pin a commit whose bytes really are that release',
      'the guard cannot check the registry over the network, so "0.3.8 is still latest" stays a fact read at release time rather than an assertion in the suite',
      'it fixes the index this project publishes; it cannot correct the third-party market that already crawled the private workspace shell at the repository root',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0021',
    title: 'The published package advertised a subpath that never had a module',
    symptom:
      'packages/plugin/package.json exported "./retry-listener" -> ./dist/retry-listener.js, but no src/retry-listener.ts has ever existed: the second seam module is failure-listener.ts, already re-exported from the main entry. import "dsh-remedy/retry-listener" fails with ERR_MODULE_NOT_FOUND while the manifest says it is supported. The dead subpath shipped in 0.3.8 and 0.4.0',
    rootCause:
      'tests/unit/package-files.test.ts checked the target string against a regex, not the file behind it: ./dist/retry-listener.js matches the pattern exactly as well as ./dist/repair-stream.js does. The exports map was written by hand when the second seam landed, and nothing compared it with src/. This is the same family as P-0010, P-0014, P-0016 and P-0020: the guard reads the form of the promise, not whether it can be kept',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0021-dead-export.md',
      'packages/plugin/package.json',
      'tests/unit/package-files.test.ts',
    ],
    guards: ['tests/unit/package-files.test.ts', 'packages/plugin/package.json'],
    limits: [
      'it checks the source tree, not the packed tarball: a module that exists in src/ but is excluded by files would still pass',
      'it does not check main or bin against src/, although both are pinned by the same test file',
      'it does not check that an exported subpath is documented, or that a documented subpath is exported',
      'no live artifact is possible: this is a manifest, not a resident seam',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0022',
    title: 'The drift test repaired the drift before it looked for it',
    symptom:
      'tests/unit/fixtures-sync.test.ts ran sync_fixtures.mjs in write mode and then compared the generated copy with the canonical fixtures. The copy step overwrote any drift before the assertion ran, so the test could only fail if the copy step itself failed; the read-only --check mode existed but neither consumer used it',
    rootCause:
      'the test was written as setup plus assertion, and the setup happened to be the same operation the test claimed to verify. A checker that can only be pointed at the generated directory cannot be tested against a known-bad copy, so the negative control had nowhere to run',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0022-fixture-check-read-only.md',
      'scripts/sync_fixtures.mjs',
      'tests/unit/fixtures-sync.test.ts',
    ],
    guards: ['tests/unit/fixtures-sync.test.ts', 'scripts/sync_fixtures.mjs'],
    limits: [
      'prepack still runs write mode, because packing has to create the copy; only the test is read-only first',
      'the negative control corrupts one fixture; a drift that changes the set of files is handled by --check but not exercised by the control',
      'the --source/--target/--checksums flags are a test seam in a build script, and nothing pins them beyond this test file',
      'no live artifact is possible: this is a build-side test, not a resident seam',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0023',
    title: 'The workflow first step was a sentence nobody read',
    symptom:
      'AGENTS.md says every patch starts with a doc in docs/patches/, but gate_registry resolved only evidence and guards. At the start of R31 the registry held twenty-one patches and docs/patches held nineteen: P-0016 shipped in R24 without a doc while every check stayed green, and INDEX.md still ended its range at P-0015',
    rootCause:
      'the doc was treated as prose about the patch rather than as part of it. Evidence and guards are paths the registry resolves; a doc was in neither list, so it could be missing with no check noticing. This is the same family as P-0014 and P-0020: a claim about the repository with no reader',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0023-patch-doc-mechanism.md',
      'docs/patches/P-0016-coverage-single-source.md',
      'scripts/gate_registry.mjs',
    ],
    guards: ['scripts/gate_registry.mjs', 'docs/patches/P-0016-coverage-single-source.md'],
    limits: [
      'it checks that a doc exists, not that it is true: a doc can still describe behaviour the code does not have',
      'it matches by id prefix, which is safe only because registryProblems keeps ids at P-NNNN',
      'an orphan doc with no registry entry is not reported, because the gate iterates the registry rather than the directory',
      'no live artifact is possible: this is a governance gate',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0024',
    title: 'The two pages npm renders were outside the copy channel',
    symptom:
      'packages/plugin/README.md and packages/core/README.md were hand-written and absent from docs/copy/manifest.json, so gate_copy never checked their bytes, their fact-pack hash or their writer. P-0017 had narrowed the exposure to "no prose number and every fenced command exists", which is not the same as the channel that every other outward page goes through',
    rootCause:
      'the copy channel was described as "the outward files at the repository root", and the two package pages were treated as package metadata rather than outward text. A page can be hand-written and still be the first thing a stranger reads; the location of the file was mistaken for the audience',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0024-package-readme-copy-channel.md',
      'packages/plugin/README.md',
      'packages/core/README.md',
      'scripts/gate_copy.mjs',
    ],
    guards: [
      'scripts/gate_copy.mjs',
      'tests/governance/package-readme-prose.test.ts',
      'tests/unit/cli-usage.test.ts',
    ],
    limits: [
      'the copy gate checks numbers, bytes and provenance, not truth: a page can still describe behaviour the code does not have',
      'the pages ship inside the tarball, so a change reaches npm only with a release; the manifest is checked in the repository, not against the published tarball',
      'the pages stay hand-written prose that is now registered; a generated page is a different product decision',
      'no live artifact is possible: this is a build-side channel, not a resident seam',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0025',
    title: 'An unread profile was reported as a finding',
    symptom:
      '`dsh-remedy explain --sessions <dir>` printed `(no)` in the "enabled here" column for every covered class and exited 1, while the same output ended with `enabled-here is unknown: pass --profile-file`. Measured on this host: `MALFORMED_RESPONSE 47 P-0001,P-0002,P-0003,P-0005,P-0011 (no)` and exit 1, with no profile argument anywhere; the same command with the desktop profile exits 0',
    rootCause:
      '`enabled` had two states where the domain has three. `isPatchOn` answered false whenever the config was null, so "nobody read a profile" became "every coverer is switched off", the cell printed the same `(no)` a measured profile prints, and `uncovered` counted it, turning the exit code into a finding. The status vocabulary of this project already separates unmeasured from quiet; this command collapsed them again',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'packages/plugin/src/explain-command.ts',
      'tests/e2e/explain.test.ts',
      'packages/plugin/README.md',
    ],
    guards: [
      'tests/e2e/explain.test.ts',
      'packages/plugin/src/explain-command.ts',
      'tests/governance/coverage-single-source.test.ts',
    ],
    limits: [
      'the three-state fix covers "no profile was read"; a profile that is read but declares no switch key still falls back to the command default, which is a different question and stays unmeasured',
      'exit 0 without a profile means "nothing was found", not "nothing is wrong": a script that wants the old strictness has to pass --profile-file',
      'the printed table row is what was tested, not the width of the columns; a longer patch id would still shift the layout',
      'no live artifact is possible: this is the CLI answering from the registry and an optional file, not a resident seam',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0026',
    title: 'The release procedure had two homes, and the older one was retired',
    symptom:
      'docs/PUBLISH.md described the procedure this repository uses (scripts/publish_packages.mjs, a token that bypasses the one-time password, commit-tree instead of the missing subtree subcommand), while docs/HANDOFF.md still told a successor to run the pnpm filter publish path and to expect OTP, and its boundary section said the two profiles pointed at a 0.3.5 tarball and that npm latest was 0.3.5',
    rootCause:
      'handoff-truth.test.ts checks the status table and "第一件事"; the release procedure and the boundary section sit after the evidence index, so they were outside the live contract while still being the sections a successor acts on. A procedure with two homes rots in the one nobody reads, and the stale one was the one the instructions pointed at',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/HANDOFF.md',
      'docs/PUBLISH.md',
      'scripts/publish_packages.mjs',
      'tests/governance/release-procedure.test.ts',
    ],
    guards: [
      'tests/governance/release-procedure.test.ts',
      'tests/governance/handoff-truth.test.ts',
    ],
    limits: [
      'the test pins the shape of the sections, not the truth of every step: a PUBLISH.md step can still be wrong while the flags it names are real',
      'it forbids the retired commands by pattern, so a differently worded wrong command is not caught',
      'the boundary section rule looks for .tmp/ paths and a `latest` version; a stale statement phrased without either is still unread',
      'no live artifact is possible: this is documentation and a governance test',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0027',
    title: 'A fragment dispatched under a name nobody proved',
    symptom:
      'A fused text that glues two calls of *different* tools carries one tool name for that index, so every fragment after the first inherited it. Measured twice on DSH 0.2.2-rc.3 (2026-11-13): the surplus object {"command":"Get-ChildItem …"} was dispatched as read and the tool answered Error: invalid arguments: missing required property "file_path" (INVALID_ARGS). The turn continued, so nothing ran silently, but a wrong tool was called',
    rootCause:
      'the rescue proves the JSON split and nothing else. The stream names one tool per index, and the engine reused that name for every fragment because the alternative — inventing a name — looked worse. What it actually did was invent one: the first call names the fused index, and the surplus objects are different calls by construction',
    surface: 'llm/stream',
    status: 'tested',
    severity: 'major',
    evidence: [
      'packages/plugin/src/repair-stream.ts',
      'tests/unit/attribution.test.ts',
      'data/results/adaptation-0.4.2-on-0.2.2-rc.3-2026-11-13T19-55-00.000Z.json',
    ],
    guards: [
      'tests/unit/attribution.test.ts',
      'packages/plugin/src/repair-stream.ts',
    ],
    limits: [
      'the proof was widened by P-0030 (a required list, a closed schema, or a declared value that breaks its own type/enum): an open schema with no required list still proves nothing, so its fragments keep the stream name and book the residue',
      'the fallback name is not a tool, so the model pays one UNKNOWN_TOOL round trip before it can retry; that is the cost of not running the wrong tool',
      'a fragment that happens to satisfy the wrong tool schema is still dispatched as that tool; schemas are a filter, not a proof',
      'the declarations come from options.tools; a hand-built call or a CLI repair carries none, so nothing changes there',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0028',
    title: 'A published sample carried this machine\'s home path',
    symptom:
      'every tarball since 0.1.0 shipped a fixture whose fused arguments carried the real workspace path (cd "C:/Users/<account>/Desktop/…"), and the public repository carried the same account name in six patch docs, the handoff, a step review and one artifact. Reported by the dshopen maintainer on 2026-11-14 (#472)',
    rootCause:
      'redaction was wired into the artifact writers (record_*.mjs, scan --out, the journal) and never into the fixture corpus; P-0004 fixed the reader for three path shapes, not the files already tracked. The rule lived where data is produced, not where it leaves the machine',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json',
      'tests/governance/shipped-samples.test.ts',
      'scripts/record_adaptation.mjs',
    ],
    guards: [
      'tests/governance/shipped-samples.test.ts',
      'packages/core/src/redact.ts',
    ],
    limits: [
      'the fixture now carries <home>, so it is no longer a byte-for-byte copy of the session; its note says so and the glued JSON shape is untouched',
      'the rule scans the shipped set and forbids an absolute Users/ segment; a path in another shape (encoded, POSIX home) is caught only by the P-0004 redactor',
      'docs and artifacts were rewritten in place with unchanged stamps: a redaction repair, not a re-measurement',
      'no live artifact: a corpus and channel fix, not a resident seam',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0029',
    title: 'The pointers a successor acts on were prose nobody compared',
    symptom:
      'the live handoff called v0.4.2 the newest release after v0.4.3, v0.4.4 and v0.4.5 had gone out, its five-minute check still commented "# 0.4.1", and docs/PUBLISH.md still said npm was at 0.4.2. These three lines are the map a new session starts from, and every gate stayed green',
    rootCause:
      'handoff-truth compared the evidence index with files and knew three 0.3.x stale shapes; release-procedure compared the shape of the publish commands; gate_size compared the build with the caps. No rule compared a live version claim with packages/plugin/package.json, and none read the byte row at all. The same section also told the next agent to pay a new patch by splitting modules by load path, which cannot work while the total is the binding cap: the total is the sum of both subtotals',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0029-live-pointers.md',
      'tests/governance/handoff-truth.test.ts',
      'tests/governance/release-procedure.test.ts',
      'scripts/gate_size.mjs',
    ],
    guards: [
      'tests/governance/handoff-truth.test.ts',
      'tests/governance/release-procedure.test.ts',
      'scripts/gate_size.mjs',
    ],
    limits: [
      'the rules are offline: they compare the row with packages/plugin/package.json, not with GitHub or npm, so a row can name the right version and still describe a tag nobody published',
      'the release-body comparison is quoted, not fetched; the v0.4.5 check was manual and is not a mechanism',
      'the channel rows in docs/distribution/README.md are dated readings and no test reads them, so they can go stale between rounds',
      'it changes no runtime behaviour and ships only the registry entry, so a core release is needed to make it visible on npm',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0030',
    title: 'The name check read required and nothing else, and its counter was a running total',
    symptom:
      'two gaps after P-0027: a declaration with no required list proved nothing, so a synthesized fragment kept the stream name even when its schema rejected it; and one repair\'s unattributed count was attributed to every later repair in the same stream (two fused blocks reported [1,1] instead of [1,0])',
    rootCause:
      'the check was written against an imagined JSON Schema. dsh-tools compiles {type:"object", properties, required?} and never sets additionalProperties (dsh-tools/lib/index.js:800-808), so an undeclared key is not proof; the counter bug was a scoping mistake one block above the per-decision loop',
    surface: 'llm/stream',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0030-attribution-proof.md',
      'packages/core/src/attribute.ts',
      'packages/plugin/src/repair-stream.ts',
      'tests/unit/attribute.test.ts',
      'tests/unit/attribution.test.ts',
    ],
    guards: [
      'tests/unit/attribute.test.ts',
      'tests/unit/attribution.test.ts',
      'packages/plugin/src/repair-stream.ts',
    ],
    limits: [
      'an open schema cannot prove a fragment foreign by its keys, which is the measured shape of every first-party DSH tool; only a closed schema changes that',
      'fits is not identity: a fragment valid for the named tool is still dispatched as that tool, and the stage that glued the objects is still unknown (P-0001)',
      'only the dsh-tools compiled shape was read; a declaration in another dialect is classified unproven more often than necessary, which is the safe direction',
      'the per-decision count changes what a journal event reports, and no migration rewrites an old journal',
      'tested, not verified: the rc.3 corpus had no tool without a required list',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0031',
    title: 'The engine every mount loads had no budget, and a comment said it did',
    symptom:
      'P-0012 recorded that dsh-remedy-core sits outside the size gate, and tests/governance/budget-split.test.ts said the package has "its own budget"; no cap for it existed anywhere. By R41 the plugin half had 87 bytes left while the engine every mount also loads had grown to 98 247 emitted bytes, 64 360 of them the registry data that grows by one record per patch',
    rootCause:
      'the budget was written for one package before the 0.4.0 split, and the split added a second package without adding a second measurement. The governance test named the blind spot honestly but the sentence "its own budget" described a plan, not a file: nobody could point at the number',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0031-core-budget.md',
      'scripts/lib/budgets.mjs',
      'scripts/gate_size.mjs',
      'tests/governance/budget-split.test.ts',
    ],
    guards: [
      'scripts/gate_size.mjs',
      'scripts/lib/budgets.mjs',
      'tests/governance/budget-split.test.ts',
    ],
    limits: [
      'the cap covers emitted core JavaScript only: .d.ts, fixtures and package-root files are outside it, exactly like the plugin budget',
      'it caps the total and the registry file, not each of the other nine modules; a module below the registry can still grow inside the total',
      'core is still not measured as part of residency: the plugin numbers remain plugin-only, so the startup account is the two rows read together, not one number',
      'the registry is data, so the cap forces a decision (split the registry, or sign a raise) rather than describing a defect that was fixed once',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0032',
    title: 'The ledger carried the narrative its patch docs already carried',
    symptom:
      'the eight longest records measured 2 107-2 377 bytes each while the registry had 1 697 bytes left, so the next patch could not be recorded without a raise disguised as a split; the duplication was also loaded on every mount that answers status or explain',
    rootCause:
      'the registry and docs/patches/ were both written in long form, so symptom, mechanism and limits existed twice while the code reads only id, title, surface, status, severity, evidence, guards, failureClasses and switchKey',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0032-registry-ledger-dedup.md',
      'packages/core/src/registry.ts',
      'scripts/lib/budgets.mjs',
      'data/results/patch-registry-2026-11-14T15-56-00.000Z.json',
    ],
    guards: [
      'scripts/gate_size.mjs',
      'tests/governance/ledgers.test.ts',
    ],
    limits: [
      'the first batch compacts 8 of 31 records; the other 23 keep their long form until they are touched',
      'the 68 000 registry cap did not move: measured 66 303 before and 61 509 after, so this is de-duplication, not a reallocation',
      'no per-record length threshold was added: a threshold needs the owner signature PROJECT_RULES section 1 requires, and this round did not have one',
      'the prose removed from a record is only safe while its doc still says it, and gate_registry checks that a doc exists, not what it says (BS-19)',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0033',
    title: 'A tool call with no identity was refused and then dispatched anyway',
    symptom:
      'a block whose id and name were both empty (measured upstream on 0.2.2-rc.3, discussion #13211) was counted as refused and passed through unchanged, so the host persisted tool/call with an empty callId and the V4 session could never resume: "tool/result requires toolCallId matching its tool source"',
    rootCause:
      'the block-end rejection path was written for fusion refusals, where passing the original through fails the turn visibly; an identity refusal does not fail visibly, it persists a call the host cannot dispatch and a result it cannot match',
    surface: 'llm/stream',
    status: 'verified',
    severity: 'major',
    evidence: [
      'docs/patches/P-0033-empty-identity.md',
      'packages/plugin/src/repair-stream.ts',
      'tests/unit/repair-stream.test.ts',
      'data/results/live-empty-call-2026-11-14T16-02-00.000Z.json',
    ],
    guards: [
      'tests/unit/repair-stream.test.ts',
      'scripts/gate_size.mjs',
    ],
    limits: [
      'the adapter that emits an incomplete call is not fixed: this seam names it and keeps the session resumable',
      'a block whose arguments are fused and whose identity is empty is still refused before any split, so it goes out as one call (missing-id fires first)',
      'the verdict stays quiet because no fusion was seen; the rejected event is the only record of the refusal',
      'arguments that parse to a non-object are untouched: that is the other half of #12064',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0034',
    title: 'A failed stream that no refusal explained was booked as a quiet one',
    symptom:
      'a turn ended with MALFORMED_RESPONSE and the journal booked nothing: no `errors`, no `refused`, no event (upstream #11337: a reasoning block, then "unsupported stop reason refusal", turn dies)',
    rootCause:
      '`isFusionFailure` reads the code alone, so every MALFORMED_RESPONSE inherited the fusion path\'s assumption that a refusal had already booked it',
    surface: 'llm/stream',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0034-unbooked-failure.md',
      'packages/plugin/src/repair-stream.ts',
      'tests/unit/repair-stream.test.ts',
    ],
    guards: ['tests/unit/repair-stream.test.ts', 'scripts/gate_size.mjs'],
    limits: [
      'the adapter is not fixed: `stopReason()` still rejects `refusal`, so the turn still ends; this seam names it',
      'the verdict is untouched, so `quiet` still means the fusion defect was not seen',
      'the reproduction is synthetic at the seam; the host half is the shipped `stopReason()` source',
    ],
    failureClasses: [],
  },
  {
    id: 'P-0035',
    title: 'A patch-layer row promised a module nothing resolved',
    symptom:
      'every `name:` in `cordis.patch.yml` promises an importable module and neither this repository nor the host checks before load time; #12318 shows the cost: `never started`, every resume fails',
    rootCause:
      'the namespace gate checked the shape of the rows but never resolved one against the exports it points into, so a rename in `src/` was only caught by a stranger installing the tarball',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0035-patch-row-resolution.md',
      'packages/plugin/cordis.patch.yml',
      'tests/governance/profile-patch-resolution.test.ts',
    ],
    guards: ['tests/governance/profile-patch-resolution.test.ts', 'scripts/gate_namespace.mjs'],
    limits: [
      'it proves a row resolves against this manifest, not that the host loads it',
      'a row naming another package is accepted when it is declared, which is not proof of its subpath',
      'it runs in the test suite, not at load time; no live artifact is possible',
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
