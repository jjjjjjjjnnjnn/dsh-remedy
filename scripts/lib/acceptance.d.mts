/**
 * Types for `lib/acceptance.mjs`, so the test exercises the same judge the
 * recorder uses instead of restating it (P-0040).
 */

export declare function acceptanceProblem(output: string, fixtureCount: number): string | null
export declare function acceptanceExpectation(fixtureCount: number): string
