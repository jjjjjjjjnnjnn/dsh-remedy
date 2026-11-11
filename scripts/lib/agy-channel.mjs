/**
 * The copy channel's transport rules, kept pure so they can be tested without
 * spending a model call.
 *
 * Two real failures shaped this file. A request longer than a Windows command
 * line dies inside `spawnSync` with `ENAMETOOLONG` before agy ever starts, and
 * a request that outlives the spawn timeout is killed and reported with a null
 * status. Both used to print `agy exited null`, which reads like a model
 * refusal and is not one. So: pick the transport from the request length, and
 * name a failed spawn by its own code.
 *
 * Node built-ins only, like every other file under `scripts/`.
 */

/** Windows caps one command line at 32767 characters. Leave room for the flags. */
export const ARGV_LIMIT = 30000

/**
 * A long prompt writing a long file can outlive any short wait. The old 600 s
 * cap cut README and CHANGELOG off mid-generation.
 */
export const AGY_TIMEOUT_MS = 1800000

const CONTRACT = `- Output only the file content. No commentary, no preamble, no code fence around
  the whole file.
- Never invent a number, a benchmark, a user count, a date or a URL that is not in
  FACTS.
- If a fact is unknown, say it is unknown instead of filling it in.
- No emoji, no exclamation marks, no marketing adjectives.`

/**
 * The exact text sent to the model: the brief, then the fact pack that is the
 * only source of numbers, then the pattern notes, then the output contract.
 */
export function buildRequest(brief, facts, patterns) {
  return `${brief}

---

# FACTS (the only source of numbers and claims)

${facts}

---

# STRUCTURE NOTES FROM HIGH-STAR REPOSITORIES

${patterns}

---

# OUTPUT CONTRACT

${CONTRACT}
`
}

/** `argv` below the Windows cap, `stdin` above it. Never both, never a silent retry. */
export function transportFor(text) {
  return text.length <= ARGV_LIMIT ? 'argv' : 'stdin'
}

/** One NDJSON user event, as agy's `--input-format stream-json` expects. */
export function stdinMessage(text) {
  return `${JSON.stringify({ event: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })}\n`
}

/**
 * Pull the final answer out of agy's stream-json transcript. The last `result`
 * event wins; a transcript without one is a failure, not an empty answer.
 */
export function responseOf(transcript) {
  let answer = null
  for (const line of transcript.split('\n')) {
    if (line.trim() === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event?.event === 'result' && typeof event.result?.response === 'string') {
      answer = event.result.response
    }
  }
  return answer
}

/** Strip one wrapping code fence, then trim. */
export function cleanOutput(text) {
  return text
    .replace(/^\s*```[a-zA-Z]*\s*\n/, '')
    .replace(/\n```\s*$/, '')
    .trim()
}

/**
 * Say what actually happened. A null status is never reported as a null status:
 * it is either a timeout, an over-long command line, or the code Node gives us.
 */
export function describeSpawnFailure(error) {
  const code = error?.code ?? 'unknown'
  if (code === 'ETIMEDOUT') {
    return `agy did not finish within ${AGY_TIMEOUT_MS / 1000} s`
  }
  if (code === 'ENAMETOOLONG') {
    return `the request is longer than a command line allows (${ARGV_LIMIT} characters is the cap here)`
  }
  if (code === 'ENOENT') {
    return 'agy was not found on PATH; set LOCALAPPDATA or install agy'
  }
  return error?.message ?? `unknown spawn failure (${code})`
}
