export interface PublishInputs {
  root: { private?: boolean }
  core: { name?: string; version?: string; publishConfig?: { access?: string } }
  plugin: { name?: string; version?: string; publishConfig?: { access?: string } }
  distExists: { core: boolean; plugin: boolean }
  packed?: { core?: string; plugin?: string }
}

export declare function publishProblems(inputs: PublishInputs): string[]

export declare function unpublishableDependencies(manifest: unknown): string[]

export interface WhoamiAnswer {
  status: number | null
  stdout?: string
  stderr?: string
}

export declare function publishAuthProblems(whoami: WhoamiAnswer | null): string[]

export declare function npmFailureAdvice(status: number | null): string[]

export declare function otpAdvice(status: number | null, stderr?: string): string[]

export declare function packedManifest(tgzPath: string): unknown
