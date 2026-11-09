/**
 * Domain types for `@dsh-remedy/core`.
 *
 * The vocabulary is deliberately narrow: a *patch* names one defect and the
 * evidence that it is fixed; a *tool call* is the exact block shape the DSH
 * assembler emits; a *repair* is either a byte-identical pass-through or a
 * proven split — never a "best effort" rewrite.
 */

/** Lifecycle of a patch. `verified` requires live evidence, not just tests. */
export type PatchStatus = 'drafted' | 'tested' | 'verified' | 'retired'

/** How bad the defect is when the patch is absent. */
export type PatchSeverity = 'critical' | 'major' | 'minor'

/**
 * One defect and its remedy.
 *
 * `evidence` and `guards` are paths, not prose: the registry gate resolves them
 * on disk, so a patch cannot claim a proof that does not exist.
 */
export interface PatchRecord {
  /** Stable id, `P-0001`-style. Never reused, never renumbered. */
  readonly id: string
  readonly title: string
  /** The user-visible failure signature this patch removes. */
  readonly symptom: string
  /** The mechanism, with the file/line that was measured. */
  readonly rootCause: string
  /** The DSH seam the patch hooks (e.g. `llm/stream`). */
  readonly surface: string
  readonly status: PatchStatus
  readonly severity: PatchSeverity
  /** Repository-relative evidence files (fixtures, results, session excerpts). */
  readonly evidence: readonly string[]
  /** Repository-relative tests or gate checks that would go red if the patch regressed. */
  readonly guards: readonly string[]
  /** What the patch explicitly does NOT do. */
  readonly limits: readonly string[]
}

/** A tool-call content block, exactly as the DSH assembler emits it. */
export interface ToolCallBlock {
  readonly type: 'tool-call'
  readonly id: string
  readonly name: string
  /** Raw JSON text. Kept as text because a fused value is not valid JSON. */
  readonly arguments: string
}

/** The fields of a tool call the repair engine needs. */
export type ToolCallInput = Omit<ToolCallBlock, 'type'>

/** Redaction summary attached to evidence so a reader knows what was removed. */
export interface RedactionSummary {
  readonly replacements: number
  readonly kinds: readonly string[]
}
