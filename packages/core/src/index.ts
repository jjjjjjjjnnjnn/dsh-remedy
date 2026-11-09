/**
 * Public surface of `@dsh-remedy/core`.
 *
 * Everything exported here is stable API: the plugin, the CLI, the gates and
 * the evidence scanner consume it. Keep the surface small; add capabilities as
 * new modules, not by widening existing signatures.
 */

export type {
  PatchRecord,
  PatchSeverity,
  PatchStatus,
  RedactionSummary,
  ToolCallBlock,
  ToolCallInput,
} from './types.js'

export type { SplitFailure, SplitFailureCode, SplitResult, SplitSuccess } from './json-split.js'
export { isFusedJsonObjectText, splitTopLevelJsonObjects } from './json-split.js'

export type {
  RepairOptions,
  RepairRejected,
  RepairRejectionCode,
  RepairRepaired,
  RepairResult,
  RepairUnchanged,
} from './toolcall-repair.js'
export { repairToolCallArguments, wouldRepair } from './toolcall-repair.js'

export type { RegistryProblem } from './registry.js'
export { findPatch, PATCHES, patchRegistrySnapshot, registryProblems } from './registry.js'

export type { RedactResult } from './redact.js'
export { redact, redactValue } from './redact.js'

export type { RemedyCounters, RemedyState, RemedyVerdict } from './verdict.js'
export { formatRemedyVerdict, judgeRemedy } from './verdict.js'
