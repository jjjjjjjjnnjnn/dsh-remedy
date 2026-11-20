/**
 * SSOT bridge: the seam classifier lives in `packages/core/src/seams.ts` so the
 * in-repo scanner and the shipped `dsh-remedy seams` command cannot drift.
 * Tests import this path; the built core is refreshed by `pnpm run build`.
 */
export {
  buildInventory,
  orderRegistrants,
  registrationsIn,
  reservedUsesIn,
} from '../../packages/core/dist/index.js'
