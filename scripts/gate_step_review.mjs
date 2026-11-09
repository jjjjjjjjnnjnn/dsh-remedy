#!/usr/bin/env node
/**
 * Gate: every gate step is reviewed on five axes with resolvable evidence.
 *
 * A step that says "done" without correctness, reproducibility, compliance,
 * SSOT and adversarial axes is a claim, not a review. The gate also requires the
 * AI disclosure log to name a session, so "who wrote this" has an answer.
 *
 * Negative control: `--mutate` removes the adversarial axis from the first step.
 */

import { exists, readJson, readText, runGate } from './lib/kit.mjs'

const AXES = ['correctness', 'reproducibility', 'compliance', 'ssot', 'adversarial']

await runGate('step-review', async ({ checks, mutate }) => {
  const ledger = readJson('audit/gate_ledger.json')
  const reviews = readJson('audit/step_reviews.json')
  const steps = Array.isArray(reviews.steps) ? reviews.steps : []

  const gateIds = (ledger.gates ?? []).map((gate) => gate.id).sort()
  const reviewed = [...new Set(steps.map((step) => step.gate))].sort()
  checks.add(
    'every-gate-reviewed',
    JSON.stringify(gateIds) === JSON.stringify(reviewed),
    `gates [${gateIds.join(',')}] vs reviewed [${reviewed.join(',')}]`,
  )

  const ids = steps.map((step) => step.id)
  checks.add('step-ids-unique', new Set(ids).size === ids.length, ids.join(','))

  for (const [index, step] of steps.entries()) {
    const axes = mutate && index === 0 ? { ...step.axes, adversarial: '' } : (step.axes ?? {})
    const missing = AXES.filter((axis) => typeof axes[axis] !== 'string' || axes[axis].trim() === '')
    checks.add(`axes:${step.id}`, missing.length === 0, missing.length === 0 ? 'five axes' : `missing ${missing.join(',')}`)

    const evidence = Array.isArray(step.evidence) ? step.evidence : []
    checks.add(`evidence:${step.id}`, evidence.length > 0, `${evidence.length} path(s)`)
    for (const path of evidence) {
      checks.add(`evidence-exists:${step.id}:${path}`, exists(path), path)
    }
  }

  const disclosure = readText('audit/AI_DISCLOSURE_LOG.md')
  checks.add('ai-disclosure-session', /SessionID/.test(disclosure) && /`[^`]+`/.test(disclosure), 'need a SessionID row with a value')
  checks.add('ai-disclosure-patch', /P-0001/.test(disclosure), 'P-0001 must be attributed')
})
