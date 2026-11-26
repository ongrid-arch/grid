/**
 * CMD-41: the plan's revision on every answer, and `based_on` on every change, done once for
 * every tool by the server (`serveTools.ts`), so no tool needs a line of its own.
 *
 * - A call about a plan answers the plan's revision (`edit/revision.ts`): `planRevision` in its
 *   data and one short line after its answer. A reading tool's revision is read before the tool
 *   reads the plan, so it never claims more than the answer saw; a change's after it wrote.
 * - A tool that changes the plan takes `based_on`, the revision the agent read. The change holds
 *   the plan's lock from reading the plan to writing it back, queued behind any other change to
 *   the same plan in this process, and is refused with nothing written when the plan is no longer
 *   at that revision: the refusal says so, gives the revision it is at now and, when this server
 *   still holds the version read, what changed (`compareBuildings`, as `grid_diff` says it).
 * - CMD-44: every call that writes the plan file is recorded in the plan's change log, with the
 *   plan it replaced kept as a checkpoint (`versions/history.ts`), while the lock is still held.
 *   `who`, beside `based_on`, names who made the change in the log. Undo and restore record
 *   their own entries (`versions/restore.ts`).
 *
 * It imports nothing of the toolkit at run time; the server turns its refusal into a tool's.
 */
import path from 'path'
import { say } from '@ongrid/floorplan/messages'
import { compareBuildings } from '@ongrid/floorplan/geometry'
import { PathRefused, type Project } from '../fs/projectFiles'
import { projectPlanFile } from '../command/init'
import { loadPlanText } from '../command/plan'
import { heldText, lockFileOf, PlanBusy, readRevision, REVISION_DIGITS, withPlanLockAsync } from '../edit/revision'
import { BY_MAX, recordChange } from '../versions/history'
import { RECORDS_ITSELF } from '../versions/restore'
import type { ArgSpec, GridTool, ToolContext } from './toolkit'

export const BASED_ON_ARG_NAME = 'based_on'

/** CMD-44: who makes a change, for the plan's change log. */
export const WHO_ARG_NAME = 'who'

/** What made a change on the tool server, in the change log. */
export const VIA_SERVER = 'grid serve'

export const WHO_ARG: ArgSpec = {
  type: 'string',
  maxLength: BY_MAX,
  description: 'Who is making this change, as you name yourself (an agent\'s role or a person\'s initials, never a full name): kept in the plan\'s change log beside the plan, which grid_diff show=history lists. Every change is logged with the plan it replaced, so grid_undo can take it back; left out, the entry names no one.',
  examples: ['reviewer-2', 'layout agent'],
}

/** The data key every answer about a plan carries its revision under. */
export const REVISION_DATA_NAME = 'planRevision'

const REVISION = new RegExp(`^[0-9a-f]{${REVISION_DIGITS}}$`)

/** The longest account of what changed a refusal gives; grid_diff gives the rest. */
const WHAT_CHANGED_MAX = 1500

export const BASED_ON_ARG: ArgSpec = {
  type: 'string',
  maxLength: 64,
  description: `The plan's revision this change is based on: planRevision from the last answer that read the plan, ${REVISION_DIGITS} hex digits. When the plan changed since, by another agent or process, the change is refused with what changed and nothing is written. Left out, the change is made on the plan as it is.`,
  examples: ['3f9a0c12be47'],
}

/** The schema of `planRevision` in an answer's data. */
export const REVISION_SCHEMA = {
  type: 'string',
  description: 'The plan file\'s revision when this answer read or wrote it: pass it as based_on to a change, which is refused if the plan changed since.',
} as const

/** `based_on`, on every tool that changes the plan. */
export function revisionArgs(tool: Pick<GridTool, 'hint' | 'args'>): Readonly<Record<string, ArgSpec>> {
  if (tool.hint !== 'change-plan' || !Object.hasOwn(tool.args, 'plan') || Object.hasOwn(tool.args, BASED_ON_ARG_NAME)) return {}
  return { [BASED_ON_ARG_NAME]: BASED_ON_ARG, ...(Object.hasOwn(tool.args, WHO_ARG_NAME) ? {} : { [WHO_ARG_NAME]: WHO_ARG }) }
}

/** A change refused because the plan is not at the revision it was based on, or is held too long. */
export class RevisionRefused extends Error {
  override readonly name = 'RevisionRefused'
}

/** What a guarded call gives back beside the tool's answer. */
export interface Guarded<T> {
  readonly answer: T
  /** The plan's revision as the answer saw it; null for a call about no plan file. */
  readonly revision: string | null
  /** The plan file, as the call named it. */
  readonly file: string | null
}

/** The plan file a call is about, or null for a tool about none or a server with no project. */
function planFileOfCall(tool: Pick<GridTool, 'args'>, args: Record<string, unknown>, context: ToolContext): { project: Project; file: string } | null {
  if (context.project instanceof PathRefused || !Object.hasOwn(tool.args, 'plan')) return null
  const project = context.project
  try {
    const file = typeof args['plan'] === 'string' ? args['plan'] : projectPlanFile(project)
    project.resolve(file)
    return { project, file }
  } catch {
    // A path the tool itself refuses, with its own words.
    return null
  }
}

/** The changes to one plan in this process, one after another: the last one queued, by lock file. */
const queues = new Map<string, Promise<unknown>>()

function queueKey(project: Project, file: string): string {
  try {
    return project.resolve(lockFileOf(file))
  } catch {
    return `${project.folder}\u0000${file}`
  }
}

async function queued<T>(key: string, run: () => Promise<T>): Promise<T> {
  const before = queues.get(key) ?? Promise.resolve()
  const mine = before.then(run, run)
  const settled = mine.then(() => undefined, () => undefined)
  queues.set(key, settled)
  try {
    return await mine
  } finally {
    if (queues.get(key) === settled) queues.delete(key)
  }
}

/** What changed between the text read and the plan now, as the comparison says it; null when it can't be said. */
function whatChanged(project: Project, file: string, read: string, now: string, real: string): string | null {
  try {
    const earlier = loadPlanText(project, file, read, real, { whole: true })
    const later = loadPlanText(project, file, now, real, { whole: true })
    const comparison = compareBuildings(earlier.plan, later.plan)
    if (comparison.sameBuilding) return say('en', 'tool.revision.noBuilding')
    const verdict = comparison.verdict.length <= WHAT_CHANGED_MAX ? comparison.verdict : `${comparison.verdict.slice(0, WHAT_CHANGED_MAX).replace(/[;,]?\s*\S*$/, '')} ${say('en', 'tool.revision.more')}`
    return say('en', 'tool.revision.what', { verdict })
  } catch {
    return null
  }
}

/** Refuses the change when the plan is not at the revision it was based on. */
function checkBasedOn(project: Project, file: string, basedOn: string): void {
  const shown = { name: path.basename(file) }
  if (!REVISION.test(basedOn)) throw new RevisionRefused(say('en', 'tool.revision.form', { digits: REVISION_DIGITS }))
  const now = readRevision(project, file)
  if (now === null) throw new RevisionRefused(say('en', 'tool.revision.gone', { file: shown, read: basedOn }))
  if (now.revision === basedOn) return
  const read = heldText(now.real, basedOn)
  const what = read === null ? say('en', 'tool.revision.notHeld') : whatChanged(project, file, read, now.text, now.real)
  throw new RevisionRefused([
    say('en', 'tool.revision.changed', { file: shown, read: basedOn, now: now.revision }),
    ...(what === null ? [] : [what]),
    say('en', 'tool.revision.again', { now: now.revision }),
  ].join('\n'))
}

/**
 * Runs one call with the plan's revision. `writes` says whether the call may write the plan
 * file: then it is queued, locked and checked against `based_on` as a change.
 */
export async function guardedRun<T>(tool: Pick<GridTool, 'args' | 'name'>, args: Record<string, unknown>, context: ToolContext, writes: boolean, run: () => Promise<T>): Promise<Guarded<T>> {
  const basedOn = args[BASED_ON_ARG_NAME]
  delete args[BASED_ON_ARG_NAME]
  // CMD-44: the tool's own `who`, when it takes one (undo, restore), stays its own.
  const who = args[WHO_ARG_NAME]
  if (!Object.hasOwn(tool.args, WHO_ARG_NAME)) delete args[WHO_ARG_NAME]
  const call = planFileOfCall(tool, args, context)
  if (call === null) return { answer: await run(), revision: null, file: null }
  const { project, file } = call
  if (!writes) {
    const revision = readRevision(project, file)?.revision ?? null
    return { answer: await run(), revision, file }
  }
  return queued(queueKey(project, file), async () => {
    try {
      return await withPlanLockAsync(project, file, async () => {
        if (typeof basedOn === 'string') checkBasedOn(project, file, basedOn)
        const before = readRevision(project, file)
        const answer = await run()
        // CMD-44: the change in the plan's log, with the plan it replaced, before the lock is let go.
        if (!RECORDS_ITSELF.has(tool.name)) recordChange(project, file, before, { tool: tool.name, via: VIA_SERVER, by: typeof who === 'string' ? who : null })
        return { answer, revision: readRevision(project, file)?.revision ?? null, file }
      })
    } catch (error) {
      if (error instanceof PlanBusy) throw new RevisionRefused(error.message)
      throw error
    }
  })
}

/** The line after an answer about a plan. */
export function revisionLine(file: string, revision: string): string {
  return say('en', 'tool.revision.line', { file: { name: path.basename(file) }, revision })
}
