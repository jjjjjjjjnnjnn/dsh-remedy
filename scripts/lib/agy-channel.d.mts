/**
 * Types for `lib/agy-channel.mjs`, so the pure transport rules can be unit
 * tested under the project's strict TypeScript settings.
 */

export declare const ARGV_LIMIT: number
export declare const AGY_TIMEOUT_MS: number

export declare function buildRequest(brief: string, facts: string, patterns: string): string
export declare function transportFor(text: string): 'argv' | 'stdin'
export declare function stdinMessage(text: string): string

export interface AgyStreamEvent {
  readonly event?: string
  readonly result?: { readonly response?: string }
}

export declare function responseOf(transcript: string): string | null
export declare function cleanOutput(text: string): string

export interface SpawnFailure {
  readonly code?: string
  readonly message?: string
}

export declare function describeSpawnFailure(error: SpawnFailure | undefined): string
