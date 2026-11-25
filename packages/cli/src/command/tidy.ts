/**
 * `grid tidy <plan>`: the faults where walls meet (MSG-12), each with the fix Grid offers, and
 * with `--apply` the fixes chosen, made on the plan file.
 *
 * The faults and their fixes are `wallFaults` and `tidyPlan` in `@ongrid/floorplan`. A fix is
 * offered only after it was tried, and `tidyPlan` looks for the faults again before each one, so
 * a fix an earlier one made needless is skipped and said so. The plan file is changed as read:
 * every key it had is kept. Nothing here checks a building rule; the list carries the label.
 */
import { keptDerived } from '@ongrid/floorplan/rooms'
import { planHasPhases, planInState, tidyPlan, wallFaults, type EditablePlan, type WallFault } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'
import type { LoadedPlan } from './plan'
import { UNSAFE_TEXT } from './planText'

export const TIDY_OPTIONS: OptionSpecs = {
  '--apply': { takesValue: true, help: 'Make these fixes: fault ids separated by commas, as the list names them, or all.' },
  '--out': { takesValue: true, help: 'With --apply: write the tidied plan to this .json file and leave the plan as it is.' },
  '--json': { takesValue: false, help: 'Print the faults, or what was applied, as JSON.' },
  ...PROJECT_OPTION,
}

export interface TidyRequest {
  readonly apply?: string
  readonly out?: string
}

/** The longest `--apply` value taken. */
const APPLY_MAX = 4096

/** The fault ids asked for, or `all`; refused by name when they make no sense. */
export function checkTidyRequest(request: TidyRequest): readonly string[] | 'all' | null {
  if (request.out !== undefined && request.apply === undefined) {
    throw new UsageError('--out goes with --apply: without it, grid tidy only lists the faults and writes nothing.')
  }
  if (request.out !== undefined && !request.out.toLowerCase().endsWith('.json')) {
    throw new UsageError('--out must name a .json file.')
  }
  if (request.apply === undefined) return null
  const apply = request.apply.trim()
  if (apply.length > APPLY_MAX || UNSAFE_TEXT.test(apply)) {
    throw new UsageError('--apply takes fault ids separated by commas, on one line, as grid tidy lists them.')
  }
  if (apply === 'all') return 'all'
  const ids = apply.split(',').map((id) => id.trim()).filter((id) => id !== '')
  if (ids.length === 0) throw new UsageError('--apply needs fault ids separated by commas, or all.')
  return [...new Set(ids)]
}

export interface TidyFault {
  readonly id: string
  readonly kind: string
  readonly floor: string
  readonly walls: readonly string[]
  readonly rooms: readonly string[]
  readonly message: string
  /** The fix in words, or null when none is offered. */
  readonly fix: string | null
  /** WRT-36: the rooms the fix would leave with no way in, which its sentence warns of. */
  readonly seals: readonly string[]
}

export interface TidyList {
  readonly label: typeof GENERAL_GUIDANCE_LABEL
  readonly faults: readonly TidyFault[]
}

export interface TidyApplied {
  readonly label: typeof GENERAL_GUIDANCE_LABEL
  readonly applied: readonly TidyFault[]
  readonly skipped: readonly { readonly id: string; readonly why: string }[]
  /** The faults the tidied plan still has. */
  readonly left: readonly TidyFault[]
  /** The plan file written, as the project shows it, or null when no fix was made. */
  readonly written: string | null
}

function shown(fault: WallFault): TidyFault {
  return {
    id: fault.id,
    kind: fault.kind,
    floor: fault.floor,
    walls: fault.walls,
    rooms: fault.rooms,
    message: fault.message,
    fix: fault.fix?.says ?? null,
    seals: fault.fix?.seals ?? [],
  }
}

/** The faults of a plan, as read, leaving out what validation could not draw. */
export function tidyList(loaded: LoadedPlan): TidyList {
  // CNT-10: the walls of a plan with phases meet as they will after the work.
  return { label: GENERAL_GUIDANCE_LABEL, faults: wallFaults(planInState(loaded.plan, 'after'), { broken: loaded.broken }).map(shown) }
}

/**
 * Makes the fixes asked for on the plan file as read, and gives the file's new text. The plan
 * was read and checked by `loadPlan` first, so its text is JSON and a Grid plan.
 */
export function tidyFile(
  project: Project,
  planFile: string,
  ids: readonly string[] | 'all',
): { readonly text: string | null; readonly applied: readonly TidyFault[]; readonly skipped: TidyApplied['skipped']; readonly left: readonly TidyFault[] } {
  // The lists the schema defaults to empty are given here only when the file leaves them out.
  const raw = { walls: [], rooms: [], openings: [], ...(JSON.parse(project.readText(planFile).text) as object) } as RawPlan
  // CNT-10: a fix joins, cuts or takes out walls of the file, which knows nothing of the states a
  // plan with phases holds, or of the shell a fit-out stands in.
  if (planHasPhases(parseFloorPlan(raw))) {
    throw new UsageError('grid tidy --apply does not change a plan with phases or a base plan yet: its fixes would join, cut or take out walls across what stands before and after the work, or the shell. Make the fixes with grid edit, which keeps each part\'s phase and leaves the base as it is.')
  }
  const result = tidyPlan(raw, ids === 'all' ? undefined : ids, (plan) => parseFloorPlan(plan))
  // A plan written rooms first keeps its derived boundaries derived through Grid's own fixes (WRT-2).
  const tidied = keptDerived(raw.rooms, result.plan)
  const left = wallFaults(parseFloorPlan(tidied)).map(shown)
  return {
    text: result.applied.length > 0 ? `${JSON.stringify(tidied, null, 2)}\n` : null,
    applied: result.applied.map(shown),
    skipped: result.skipped,
    left,
  }
}

/** A plan file as read: what a fix changes, and every other key as it was. */
type RawPlan = EditablePlan & Record<string, unknown>

const q = (text: string): string => JSON.stringify(text)

function section(title: string, lines: readonly string[]): string[] {
  return ['', `${title} (${lines.length}):`, ...lines.map((line) => `  - ${line}`)]
}

/** The list as text. It starts with the label; ids from the plan are quoted. */
export function tidyListText(list: TidyList): string {
  const lines: string[] = [list.label]
  if (list.faults.length === 0) {
    lines.push('', 'Wall faults: none found where walls meet.')
    return `${lines.join('\n')}\n`
  }
  lines.push(...section('Wall faults', list.faults.map((f) => `${q(f.id)}: ${f.message}${f.fix ? '' : ' (No fix is offered.)'}`)))
  const fixable = list.faults.filter((f) => f.fix !== null)
  if (fixable.length > 0) {
    lines.push('', `Make a fix with grid tidy --apply ${fixable[0]!.id}, several with their ids separated by commas, or every fix offered with --apply all.`)
  }
  return `${lines.join('\n')}\n`
}

export function tidyAppliedText(result: TidyApplied): string {
  const lines: string[] = [result.label]
  lines.push(...section('Applied', result.applied.map((f) => `${q(f.id)}: ${f.fix ?? f.message}`)))
  if (result.skipped.length > 0) lines.push(...section('Skipped', result.skipped.map((s) => `${q(s.id)}: ${s.why}`)))
  lines.push('', `Wall faults left: ${result.left.length === 0 ? 'none' : result.left.length}.`)
  lines.push(result.written === null ? 'No fix was made, so nothing was written.' : `Wrote ${result.written}`)
  return `${lines.join('\n')}\n`
}
