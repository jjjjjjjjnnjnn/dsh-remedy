/**
 * The R70 probe vocabulary — one list, shared by the neighbour plugin, the
 * isolated-home setup and the recorder, so a scenario cannot exist in one place
 * and be missing in another.
 *
 * `tools` is the declaration set the request carries for that scenario; it is
 * what `llm/stream`'s `options.tools` holds and therefore what attribution can
 * prove anything against (P-0027 / P-0030 / P-0054).
 */
export const SCENARIOS = [
  'healthy',
  'null-chunk',
  'object-arguments',
  'no-block',
  'finish-no-reason',
  'bare-value',
  'cross-tool',
  'closed-schema',
  'reasoning-error',
  'delta-only',
  'reserved-fused',
  'reserved-nameless',
  'empty-identity',
]

export const TOOLS_BY_SCENARIO = {
  healthy: [],
  'null-chunk': ['capture'],
  'object-arguments': ['capture'],
  'no-block': ['capture'],
  'finish-no-reason': ['capture'],
  'bare-value': ['capture'],
  'cross-tool': ['alpha', 'beta'],
  'closed-schema': ['gamma'],
  'reasoning-error': ['capture'],
  'delta-only': ['capture'],
  'reserved-fused': ['alpha', 'beta', 'remedy_unattributed'],
  'reserved-nameless': ['remedy_unattributed', 'capture'],
  'empty-identity': ['capture'],
}
