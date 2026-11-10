/** Types for `scripts/publish_packages.mjs`, so the governance test can pin the refusal rules. */

export interface PublishInputs {
  root: { private?: boolean }
  core: { name?: string; version?: string; publishConfig?: { access?: string } }
  plugin: { name?: string; version?: string; publishConfig?: { access?: string } }
  distExists: { core: boolean; plugin: boolean }
}

export declare function publishProblems(inputs: PublishInputs): string[]
