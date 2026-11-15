/**
 * P-0030 — what a fragment's name can actually prove.
 *
 * P-0027 checks a fragment against the named tool's `required` list; "every key
 * must be declared" is not sound on this host (`dsh-tools/lib/index.js:800-808`
 * never sets `additionalProperties`), so an undeclared key proves nothing. What
 * the declaration can still prove, each source, and the over-claim this avoided
 * are in `docs/patches/P-0030-attribution-proof.md`.
 *
 * Returns `foreign` (the host would reject these arguments), `fits` ("nothing
 * against", not identity) or `unproven` (nothing to check; the plugin keeps the
 * stream's name and books the residue).
 */

export type FragmentFit = 'fits' | 'foreign' | 'unproven'

/** The slice of a tool declaration this check reads; the host type is wider. */
export interface FragmentDeclaration {
  readonly name: string
  /** The raw JSON Schema the host sends; every field is read with a guard. */
  readonly parameters?: Readonly<Record<string, unknown>>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** One JSON type, with "a keyword this module does not decide" answering true. */
function typeFits(value: unknown, type: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'null':
      return value === null
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isRecord(value)
    default:
      return true
  }
}

/** A declared value against its own schema node; `true` also means "not decidable". */
function valueFits(value: unknown, spec: unknown): boolean {
  if (!isRecord(spec)) return true
  if (Object.hasOwn(spec, 'const') && !Object.is(spec.const, value)) return false
  const allowed = spec.enum
  // Primitives only: an object compared by identity against an enum would refuse
  // valid calls, and "not decidable" is the honest answer for those.
  if (Array.isArray(allowed) && (value === null || typeof value !== 'object')) {
    if (!allowed.some((candidate) => Object.is(candidate, value))) return false
  }
  const declared = spec.type
  const types = Array.isArray(declared) ? declared : typeof declared === 'string' ? [declared] : []
  if (types.length === 0) return true
  return types.some((candidate) => typeFits(value, candidate))
}

/**
 * Decide what one fragment's arguments prove about the name they were given.
 *
 * @param argumentsText - the raw argument text of a synthesized fragment.
 * @param declaration - the tool the stream named for this index.
 */
export function fragmentFit(argumentsText: string, declaration: FragmentDeclaration): FragmentFit {
  let value: unknown
  try {
    value = JSON.parse(argumentsText.trim() === '' ? '{}' : argumentsText)
  } catch {
    return 'foreign'
  }
  if (!isRecord(value)) return 'foreign'
  const schema = declaration.parameters
  if (!isRecord(schema)) return 'unproven'
  const required = Array.isArray(schema.required) ? schema.required : []
  if (required.some((key) => typeof key === 'string' && !Object.hasOwn(value, key))) return 'foreign'
  const properties = isRecord(schema.properties) ? schema.properties : undefined
  if (properties !== undefined) {
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) {
      return 'foreign'
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) continue
      if (!valueFits(value[key], properties[key])) return 'foreign'
    }
    return 'fits'
  }
  return required.length > 0 ? 'fits' : 'unproven'
}
