import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptanceExpectation, acceptanceProblem } from '../../scripts/lib/acceptance.mjs'

test('a clean run with the repository fixture count is accepted', () => {
  const output = [
    'PASS  ambiguous-closer.json — rejected',
    'PASS  bare-code-value.json — repaired',
    'PASS  braces-in-string.json — repaired',
    'PASS  missing-array-closer.json — repaired',
    'PASS  session-9045e2ec-seq-526.json — repaired',
    'PASS  single-broken.json — rejected',
    'PASS  truncated.json — rejected',
    'PASS  valid-two-calls.json — unchanged',
    'OK  8 fixture(s)',
  ].join('\n')
  assert.equal(acceptanceProblem(output, 8), null)
  assert.equal(acceptanceExpectation(8), 'OK 8 fixture(s)')
})

test('the old literal six would have failed a correct eight', () => {
  // This is the measured defect: R49 added two fixtures, the package printed
  // `OK 8 fixture(s)`, and the acceptance recorder still demanded `OK 6`
  // fixture(s), so a green published package was recorded as a failed install.
  // The judge refuses the eight against a six-fixture repository — which is
  // exactly what the old recorder did — and accepts it at the real count.
  const output = 'PASS  a.json — repaired\nOK  8 fixture(s)'
  assert.notEqual(acceptanceProblem(output, 8), null)
  const oldStyle = /OK\s+6 fixture\(s\)/.test(output)
  assert.equal(oldStyle, false, 'the literal six does not match the printed eight')
})

test('a count that disagrees with the canonical fixtures is refused', () => {
  // A tarball whose `fixtures/` drifted from `data/fixtures/` reports a different
  // number, and that is exactly the drift the acceptance exists to catch.
  const output = 'PASS  a.json — repaired\nOK  9 fixture(s)'
  assert.match(String(acceptanceProblem(output, 8)), /ships 8/)
})

test('a FAIL line is refused whatever the count says', () => {
  const output = 'FAIL  broken.json — expected repaired\nPASS  b.json — repaired\nOK  2 fixture(s)'
  assert.match(String(acceptanceProblem(output, 2)), /1 fixture line\(s\) failed/)
})

test('an output with no fixture line at all is refused, and says why', () => {
  // `verify` exits 0 in one case where it printed nothing useful: a directory of
  // fixtures it could not list. Silence is not success here.
  for (const output of ['', 'OK', 'no fixtures found']) {
    assert.match(String(acceptanceProblem(output, 8)), /did not print/)
  }
})

test('the count and the per-fixture lines must agree', () => {
  // Two PASS lines and a claim of eight: some fixtures were skipped, and a
  // skipped fixture is not a verified one.
  const output = 'PASS  a.json — repaired\nPASS  b.json — repaired\nOK  8 fixture(s)'
  assert.match(String(acceptanceProblem(output, 8)), /per-fixture line/)
})
