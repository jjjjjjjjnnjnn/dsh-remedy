/**
 * Types for `lib/copy-policy.mjs`, so the tests can use the same stripping rule
 * the copy channel applies instead of restating it (P-0017).
 */

export declare function proseText(text: string): string
export declare function proseNumbers(text: string): string[]
export declare const RESERVED_DIGITS: readonly string[]
export declare function allowedNumbers(facts: string): Set<string>
export declare function unknownNumbers(text: string, facts: string): string[]
export declare function hasPlaceholder(text: string): boolean
export declare const WRITERS: { readonly inSession: string; readonly priorChannel: string }
export declare const LIVE_WRITERS: { readonly inSession: string; readonly priorChannel: string }
