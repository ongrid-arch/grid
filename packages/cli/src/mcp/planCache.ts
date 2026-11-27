/**
 * CMD-51: the plan as the tool server read it, kept per version, so a later call about the same
 * version reuses it and every figure the geometry keeps against its parts (room outlines, traced
 * curves, the survey), instead of reading and working the plan out afresh.
 *
 * A version is the plan file's text together with every other file the reading looked at: a
 * fit-out's base plan, the trace image being there. The plan is read through a recording view of
 * the project that notes each of those reads and what came back, as one hash; a later call makes
 * the same reads on the project again, and only the same hash answers the plan kept. So a change
 * to any file the reading used, by Grid or by anything else, is read afresh: nothing stale is
 * answered. The content is compared, never a modification time.
 *
 * A plan kept is frozen, so no call can change what a later call is given. A refusal is not kept.
 */
import { createHash, type Hash } from 'crypto'
import { loadPlan, type LoadedPlan, type LoadOptions } from '../command/plan'
import type { Project } from '../fs/projectFiles'
import { deepFreeze } from '@ongrid/floorplan/geometry/kept'

/** How many plan versions the server keeps, the least recently used dropped first. */
export const PLAN_VERSIONS_KEPT = 4

/** One read the plan's reading made: its method, its arguments. */
interface Read {
  readonly method: RecordedMethod
  readonly args: readonly unknown[]
}

interface Kept {
  readonly project: Project
  readonly reads: readonly Read[]
  readonly digest: string
  readonly loaded: LoadedPlan
}

const RECORDED = ['readText', 'readBytes', 'readTextIfThere', 'exists', 'resolve', 'isLinked'] as const
type RecordedMethod = (typeof RECORDED)[number]

/** The versions kept, by project folder, file and options; a Map keeps them in the order last used. */
const kept = new Map<string, Kept>()

/** What came back from one read, fed into the version's hash. */
function noteOutcome(hash: Hash, read: Read, outcome: () => unknown): unknown {
  hash.update(`${read.method}\0${JSON.stringify(read.args)}\0`)
  let value: unknown
  try {
    value = outcome()
  } catch (error) {
    hash.update(`threw\0${(error as NodeJS.ErrnoException).code ?? ''}\0${(error as Error).message}\0`)
    throw error
  }
  if (value instanceof Uint8Array) hash.update(value)
  else if (typeof value === 'object' && value !== null && 'text' in value) {
    const read = value as { readonly real: string; readonly text: string }
    hash.update(`${read.real}\0${read.text}`)
  }
  else hash.update(String(value))
  hash.update('\0')
  return value
}

/** A view of the project that notes every read made through it, for the version's hash. */
function recording(project: Project): { view: Project; reads: Read[]; hash: Hash } {
  const reads: Read[] = []
  const hash = createHash('sha256')
  const view = Object.create(project) as Project
  for (const method of RECORDED) {
    const own = project[method] as (...args: unknown[]) => unknown
    Object.defineProperty(view, method, {
      value: (...args: unknown[]) => {
        const read = { method, args }
        reads.push(read)
        // On the project itself: a read one of these makes in turn is not a read of the plan's.
        return noteOutcome(hash, read, () => own.apply(project, args))
      },
    })
  }
  return { view, reads, hash }
}

/** The same reads made again on the project: the hash they give now, or null when one fails now. */
function digestNow(project: Project, reads: readonly Read[]): string | null {
  const hash = createHash('sha256')
  try {
    for (const read of reads) noteOutcome(hash, read, () => (project[read.method] as (...args: unknown[]) => unknown).apply(project, read.args as unknown[]))
  } catch {
    return null
  }
  return hash.digest('hex')
}

/**
 * A loaded plan, frozen, its validation still worked out only when first asked (`loadPlan`'s
 * getters are kept as getters) and frozen then.
 */
function frozenLoaded(loaded: LoadedPlan): LoadedPlan {
  const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(loaded)
  const issues = descriptors['issues']?.get
  if (issues !== undefined) descriptors['issues'] = { get: () => deepFreeze(issues.call(loaded) as LoadedPlan['issues']), enumerable: true }
  return deepFreeze(Object.defineProperties({}, descriptors) as LoadedPlan)
}

function slotOf(project: Project, file: string, options: LoadOptions): string {
  return JSON.stringify([project.folder, file, options.whole === true, options.leftOutKept === true, options.asBase === true])
}

/**
 * The plan `file` as `loadPlan` reads it, the one kept when the project's files the reading used
 * are as they were. Refused as `loadPlan` refuses it.
 */
export function cachedPlan(project: Project, file: string, options: LoadOptions = {}): LoadedPlan {
  const slot = slotOf(project, file, options)
  const found = kept.get(slot)
  if (found !== undefined && found.project === project) {
    if (digestNow(project, found.reads) === found.digest) {
      kept.delete(slot)
      kept.set(slot, found)
      return found.loaded
    }
  }
  kept.delete(slot)
  const { view, reads, hash } = recording(project)
  const loaded = frozenLoaded(loadPlan(view, file, options))
  kept.set(slot, { project, reads, digest: hash.digest('hex'), loaded })
  while (kept.size > PLAN_VERSIONS_KEPT) kept.delete(kept.keys().next().value!)
  return loaded
}

/** Every version kept dropped: for a test, or when the server is told its files changed under it. */
export function forgetPlans(): void {
  kept.clear()
}
