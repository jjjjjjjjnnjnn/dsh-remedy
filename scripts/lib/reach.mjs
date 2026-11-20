/**
 * Pure reach arithmetic. No I/O lives here: the reporter imports this module,
 * and the test imports it too, so a unit test never has to call npm or GitHub.
 *
 * The rule P-0055 exists for: "the two newest versions" means the two newest
 * *published* versions, not the two newest keys that happen to have download
 * rows. A release made after the npm window closed has no row yet; it is named
 * in `missing` and makes the share non-comparable, never a silent zero.
 */

/** Semver ordering without prerelease noise. Exported for the rule tests. */
export function versionRank(version) {
  const parts = String(version).split('-')[0].split('.').map((part) => Number(part) || 0)
  return (parts[0] || 0) * 1e6 + (parts[1] || 0) * 1e3 + (parts[2] || 0)
}

/**
 * Share of downloads carried by the two newest published versions.
 *
 * @param versions        per-version download counts from the npm window
 * @param published       all versions the registry publishes (authoritative)
 * @param windowEnd       last day of the download window, `YYYY-MM-DD`
 * @param publishedAt     version -> publish timestamp, from the packument
 * @returns null when there is no data, else
 *   { share, top, total, newest, newestSource, missing, comparable }
 */
export function latestShare(versions, published = null, windowEnd = null, publishedAt = {}) {
  const counts = versions ?? {}
  const names = Object.keys(counts)
  if (names.length === 0) return null
  const total = names.reduce((sum, name) => sum + (Number(counts[name]) || 0), 0)
  if (total === 0) return null

  const fromRegistry = Array.isArray(published) && published.length > 0
  const ordered = (fromRegistry ? published : names)
    .slice()
    .sort((a, b) => versionRank(b) - versionRank(a))
  const newest = ordered.slice(0, 2)
  const reason = (version) => {
    const stamp = typeof publishedAt[version] === 'string' ? publishedAt[version].slice(0, 10) : ''
    return typeof windowEnd === 'string' && stamp > windowEnd
      ? 'published_after_window_end'
      : 'no_row_in_window'
  }
  const missing = newest
    .filter((version) => !Object.prototype.hasOwnProperty.call(counts, version))
    .map((version) => ({ version, reason: reason(version) }))
  const top = newest.reduce((sum, name) => sum + (Number(counts[name]) || 0), 0)

  return {
    share: top / total,
    top,
    total,
    newest,
    newestSource: fromRegistry ? 'registry' : 'downloads',
    missing,
    comparable: fromRegistry && missing.length === 0,
  }
}
