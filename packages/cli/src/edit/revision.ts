/**
 * CMD-41: the plan's revision, and the lock a change holds on the plan file.
 *
 * A change reads the plan, works the change out and writes the file back. Two processes doing
 * that at once each wrote their own reading, and the later one wiped the earlier one out while
 * both answered that they wrote. So:
 *
 * - The revision is a fingerprint of the plan file's text as it is on disk: the first
 *   `REVISION_DIGITS` hex digits of its SHA-256. Any change to the file, by Grid or anything else,
 *   gives a new one, and nothing else does. The last few texts read are held in memory by
 *   revision, so a change refused for a stale revision can say what changed since.
 * - A change holds a lock on the plan file from reading it to writing it back: a file beside the
 *   plan (`<plan>.lock`, holding the process id and the time), made with the project's exclusive
 *   create and removed after, so it holds across processes. Another change waits for it. A lock
 *   whose process is gone, or older than `LOCK_STALE_MS`, is taken over. Within one process the
 *   lock is re-entrant: the server's hold and the edit path's hold are one.
 *
 * Where the lock file can't be made (a folder that is not there yet, a read-only one), the change
 * goes on without it and meets the same when it writes.
 */
import { createHash } from 'crypto'
import path from 'path'
import { say } from '@ongrid/floorplan/messages'
import type { Project } from '../fs/projectFiles'

/** How many hex digits a revision has. */
export const REVISION_DIGITS = 12

/** The most plan texts held by revision, and the most bytes they take together. */
const HELD_MAX = 8
const HELD_BYTES_MAX = 64 * 1024 * 1024

/** The longest a change waits for another to finish with the plan. */
export const LOCK_WAIT_MS = 30_000

/** A lock older than this is taken to be left by a process that stopped without removing it. */
export const LOCK_STALE_MS = 10 * 60_000

/** How long a waiting change sleeps between tries. */
const LOCK_STEP_MS = 20

const LOCK_SUFFIX = '.lock'

/** The plan as read, with its revision. */
export interface PlanAtRevision {
  readonly revision: string
  readonly text: string
  /** The real path read. */
  readonly real: string
}

/** Texts read, by real path and revision, the latest last. */
const held = new Map<string, string>()

function heldKey(real: string, revision: string): string {
  return `${real}\u0000${revision}`
}

function keep(real: string, revision: string, text: string): void {
  const key = heldKey(real, revision)
  held.delete(key)
  held.set(key, text)
  let bytes = 0
  for (const one of held.values()) bytes += one.length
  for (const [oldest, one] of held) {
    if (held.size <= HELD_MAX && bytes <= HELD_BYTES_MAX) break
    if (oldest === key) break
    held.delete(oldest)
    bytes -= one.length
  }
}

/** The revision of a text. */
export function revisionOfText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, REVISION_DIGITS)
}

/** The plan file as it is now, with its revision; null when there is none Grid can read. */
export function readRevision(project: Project, file: string): PlanAtRevision | null {
  let read: { readonly text: string; readonly real: string }
  try {
    read = project.readText(file)
  } catch {
    return null
  }
  const revision = revisionOfText(read.text)
  keep(read.real, revision, read.text)
  return { revision, text: read.text, real: read.real }
}

/** The plan file's revision now, or null when there is none Grid can read. */
export function planRevisionOf(project: Project, file: string): string | null {
  return readRevision(project, file)?.revision ?? null
}

/** The text the plan had at a revision, when this process read it then and still holds it. */
export function heldText(real: string, revision: string): string | null {
  return held.get(heldKey(real, revision)) ?? null
}

/** The lock file of a plan file: `plan.json` has `plan.lock` beside it. */
export function lockFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${LOCK_SUFFIX}`)
}

/** Another process held the plan for longer than a change waits. */
export class PlanBusy extends Error {
  override readonly name = 'PlanBusy'
}

/** The locks this process holds, by the lock file's real path: how deep, and whether it made the file. */
const holds = new Map<string, { depth: number; readonly owned: boolean }>()

/** Whether this process holds the lock of a plan file now. */
export function holdsPlanLock(project: Project, planFile: string): boolean {
  const key = lockKey(project, planFile)
  return key !== null && holds.has(key)
}

function lockKey(project: Project, planFile: string): string | null {
  try {
    return project.resolve(lockFileOf(planFile))
  } catch {
    return null
  }
}

function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return codeOf(error) === 'EPERM'
  }
}

/** Whether a lock file's text is a lock no one holds any more. Empty is a lock being written. */
function stale(text: string, now: number): boolean {
  if (text === '') return false
  let lock: { pid?: unknown; at?: unknown }
  try {
    lock = JSON.parse(text) as { pid?: unknown; at?: unknown }
  } catch {
    return true
  }
  const at = typeof lock.at === 'string' ? Date.parse(lock.at) : NaN
  if (!Number.isFinite(at) || now - at > LOCK_STALE_MS) return true
  if (typeof lock.pid !== 'number' || !Number.isSafeInteger(lock.pid) || lock.pid <= 0) return true
  // This process holds no lock of this file (that is checked first), so one with its id is left over.
  if (lock.pid === process.pid) return true
  return !alive(lock.pid)
}

type Step = 'taken' | 'without' | 'busy'

/** One try at the lock: made, not to be had here at all, or held by another process. */
function tryLock(project: Project, lock: string): Step {
  try {
    project.createFile(lock, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`)
    return 'taken'
  } catch (error) {
    if (codeOf(error) !== 'EEXIST') return 'without'
  }
  let text: string | null
  try {
    text = project.readTextIfThere(lock)
  } catch {
    return 'busy'
  }
  // Removed a moment ago: try again at once.
  if (text === null) return tryLock(project, lock)
  if (stale(text, Date.now())) {
    // Taken over only when it is still the lock found stale, not one made since.
    try {
      if (project.readTextIfThere(lock) === text) project.removeFile(lock)
    } catch {
      return 'busy'
    }
  }
  return 'busy'
}

function busy(planFile: string): PlanBusy {
  return new PlanBusy(say('en', 'tool.revision.busy', { file: { name: path.basename(planFile) }, seconds: Math.round(LOCK_WAIT_MS / 1000) }))
}

function enter(key: string, owned: boolean): void {
  holds.set(key, { depth: 1, owned })
}

function leave(project: Project, planFile: string, key: string): void {
  const hold = holds.get(key)
  if (hold === undefined) return
  hold.depth -= 1
  if (hold.depth > 0) return
  holds.delete(key)
  if (hold.owned) {
    try {
      project.removeFile(lockFileOf(planFile))
    } catch {
      // A lock that can't be removed is taken over once its process has gone.
    }
  }
}

const sleeper = new Int32Array(new SharedArrayBuffer(4))

/**
 * Runs `run` holding the plan file's lock, waiting for another process to finish with it by
 * blocking: for the edit path and `grid edit`, which run one change and nothing beside it.
 * Throws `PlanBusy` when the plan stays held for `LOCK_WAIT_MS`.
 */
export function withPlanLock<T>(project: Project, planFile: string, run: () => T): T {
  const key = lockKey(project, planFile)
  if (key === null) return run()
  const hold = holds.get(key)
  if (hold !== undefined) {
    hold.depth += 1
    try {
      return run()
    } finally {
      leave(project, planFile, key)
    }
  }
  const until = Date.now() + LOCK_WAIT_MS
  for (;;) {
    const step = tryLock(project, lockFileOf(planFile))
    if (step !== 'busy') {
      enter(key, step === 'taken')
      break
    }
    if (Date.now() >= until) throw busy(planFile)
    Atomics.wait(sleeper, 0, 0, LOCK_STEP_MS)
  }
  try {
    return run()
  } finally {
    leave(project, planFile, key)
  }
}

/**
 * The same, waiting without blocking: for the tool server, whose other calls go on meanwhile.
 * The server queues the changes to one plan in its own process first, so a hold here is one call's.
 */
export async function withPlanLockAsync<T>(project: Project, planFile: string, run: () => Promise<T>, wait: number = LOCK_WAIT_MS): Promise<T> {
  const key = lockKey(project, planFile)
  if (key === null) return run()
  const hold = holds.get(key)
  if (hold !== undefined) {
    hold.depth += 1
    try {
      return await run()
    } finally {
      leave(project, planFile, key)
    }
  }
  const until = Date.now() + wait
  for (;;) {
    const step = tryLock(project, lockFileOf(planFile))
    if (step !== 'busy') {
      enter(key, step === 'taken')
      break
    }
    if (Date.now() >= until) throw busy(planFile)
    await new Promise((resolve) => setTimeout(resolve, LOCK_STEP_MS))
  }
  try {
    return await run()
  } finally {
    leave(project, planFile, key)
  }
}
