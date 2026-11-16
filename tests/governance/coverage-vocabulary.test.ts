import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PATCHES } from 'dsh-remedy-core'

test('the failure classes are a closed set the host actually emits', () => {
  // A typo here would make a class look uncovered forever, which reads exactly
  // like a class nobody has patched. The census already counts these codes, so the
  // vocabulary is not free: it is the set `session-scan` reports.
  const KNOWN = new Set([
    'MALFORMED_RESPONSE',
    'UNSUPPORTED_REASONING_EFFORT',
    'INVALID_REQUEST',
    'MISSING_CREDENTIAL',
    'EMPTY_RESPONSE',
    'SERVER',
    'TRANSPORT',
    'TIMEOUT',
    'IMAGE_OFFLOAD_REQUIRED',
    'INVALID_CREDENTIAL',
    'UNKNOWN',
  ])
  for (const patch of PATCHES) {
    for (const failure of patch.failureClasses ?? []) {
      assert.ok(KNOWN.has(failure), `${patch.id} claims a class the census never reports: ${failure}`)
    }
  }
})

test('every covering patch is resident, because a CLI patch cannot see turn/end', () => {
  // `explain` answers "covered by" from the registry, so a claim of coverage is
  // also a claim that the patch runs where turns end. A build-side or CLI patch
  // that declared coverage would be answering a question it cannot observe.
  //
  // P-0045 measured that a preparation-time refusal ends a turn on `agent/error`,
  // not on `agent/request-error`: a resident namer has to sit on that seam or the
  // class P-0013 covers is named by nobody.
  const RESIDENT = new Set(['llm/stream', 'agent/request-error', 'agent/error'])
  for (const patch of PATCHES) {
    if ((patch.failureClasses ?? []).length === 0) continue
    assert.ok(
      RESIDENT.has(patch.surface),
      `${patch.id} claims coverage of a turn-ending code but its surface is ${patch.surface}`,
    )
  }
})
