/**
 * Types for `lib/runtime-version.mjs`, so a test exercises the same reader the
 * recorder calls instead of restating it (P-0042).
 */

export declare function desktopVersionOf(parsed: unknown): string | null

export declare function readRuntimeVersion(candidates: readonly string[]): {
  version: string | null
  source: string | null
  sha256: string | null
}

export declare function runtimeCandidates(
  env?: Record<string, string | undefined>,
  home?: string,
): string[]
