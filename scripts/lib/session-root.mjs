#!/usr/bin/env node
/**
 * R50 · the one place that answers "where are the sessions on this platform?".
 *
 * Three recorders used `process.env.USERPROFILE ?? ''`, which is set on Windows
 * and **empty on Linux and macOS**: the path then becomes the relative
 * `.dsh/sessions`, the recorder exits 3 with "no session directory", and the
 * message does not say that the platform is why. Measured on WSL2 Ubuntu 26.04:
 * `USERPROFILE=[<unset>]`, computed `.dsh/sessions`, and the real host root at
 * `~/.dsh/sessions`.
 *
 * `homedir()` is the portable answer (Windows `%USERPROFILE%`, Linux/macOS `$HOME`).
 * `DSH_SESSIONS` still wins, because a probe profile writes its sessions somewhere
 * else and the recorders must be pointable.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * The session root this machine uses.
 *
 * @param env - the environment to read (`process.env` in production, a literal in tests).
 * @returns `DSH_SESSIONS` when set, otherwise `<home>/.dsh/sessions`.
 */
export function sessionRoot(env = process.env) {
  const override = env.DSH_SESSIONS
  if (typeof override === 'string' && override.trim() !== '') return override
  // HOME first: a Windows shell under WSL inherits USERPROFILE, and the Linux
  // process lives in HOME. `homedir()` is the fallback, not the first answer,
  // because a test can only pass a literal environment.
  const home = env.HOME || env.USERPROFILE || homedir()
  return home === '' ? '~/.dsh/sessions' : join(home, '.dsh', 'sessions')
}
