/** Types for `seam-inventory.mjs`, so the tests typecheck under `--noEmit` (the P-0017 pattern). */

export interface Registration {
  readonly seam: string
  readonly mode: 'on' | 'emit'
  readonly prepend: boolean
  readonly file?: string | null
}

export interface PackageInput {
  readonly name: string
  readonly version: string | null
  readonly load_index: number | null
  readonly registrations: readonly Registration[]
  readonly reserved?: readonly string[]
}

export interface Registrant {
  readonly name: string
  readonly version: string | null
  readonly load_index: number | null
  /** Present on rows `buildInventory` produces; ordering alone does not need it. */
  readonly mode?: 'on' | 'emit'
  readonly prepend: boolean
  readonly file?: string | null
}

export interface SeamRow {
  readonly seam: string
  readonly registrants: readonly Registrant[]
  readonly same_seam: boolean
}

export interface Conflict {
  readonly seam: string
  readonly order: readonly string[]
  readonly outermost: string | null
  readonly prepend_involved: boolean
  readonly wraps: number
  readonly observes: number
}

export interface Inventory {
  readonly seams: readonly SeamRow[]
  readonly conflicts: readonly Conflict[]
  readonly warnings: readonly string[]
}

export function registrationsIn(text: string): Registration[]
export function reservedUsesIn(text: string, reserved: readonly string[]): string[]
export function orderRegistrants(registrants: readonly Registrant[]): Registrant[]
export function buildInventory(packages: readonly PackageInput[]): Inventory
