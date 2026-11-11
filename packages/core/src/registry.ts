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
      'data/results/patch-registry-2026-11-09T16-40-00.000Z.json',
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
    limits: [
      'reseals only when exactly one member value proves: two possible resealings is refused as ambiguous, never chosen',
      'never touches a truncated call: a cut tail is missing bytes, not a missing quote',
      'does not repair a duplicate key, a doubled colon, a missing closing brace, or an illegal escape: those are refusals by design',
      'keeps the call id, so no synthetic identity is created and the stream budget is untouched',
      'the ninth counter is optional in the type on purpose: a 0.3.x artifact has no `resealed` field and must render exactly as it did',
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
const SURFACES = new Set(['llm/stream', 'agent/request-error', 'cli', 'profile'])

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
