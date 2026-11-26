/**
 * The stairs' changes (LVL-21): a stair added (`addStair`, `grid_add_stair`), changed or removed
 * (`changeStair`, `grid_change_stair`). Each is a patch of the plan's own `stairs`, as every change
 * is, and lays the stair out by rooms text's own reading of its words (`layStair` in
 * `rooms/stairs.ts`), so a tool and a `stair` line give the same stair. A stair changed keeps its
 * record in the file (`parts`), every field it does not change as written.
 *
 * A stair laid in a room is laid out again from its words when its room, shape, way or width
 * changes; a stair along a walking line of its own keeps that line unless a new one is given.
 */
import { layStair, stairSummary, stairWordsOf, StairRefused, type StairMade, type StairShape, type StairWay, type StairWords } from '@ongrid/floorplan/rooms'
import type { FloorPlan, Stair } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch } from './edits'
import { EditRefused } from './refused'

type Pair = readonly [number, number]

/** What a call says about a stair: every field but `id` is left out when not given. */
export interface StairRequest {
  readonly id?: string
  readonly name?: string
  readonly from?: string
  readonly to?: string
  readonly width?: number
  readonly room?: string
  readonly shape?: StairShape
  readonly runs?: StairWay
  readonly then?: StairWay
  readonly along?: StairWay
  readonly run?: readonly Pair[]
  /** A whole number; 0 leaves the count to Grid again. */
  readonly risers?: number
}

/** A length for a sentence: to the millimetre, no trailing zeros, as the stair's summary gives it. */
const M = (v: number): string => `${Math.round(v * 1000) / 1000 + 0} m`
const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.:]$/.test(text) ? '' : '.'}`

/** The stair laid out, or the refusal as an edit's. */
function laid(plan: FloorPlan, words: StairWords): StairMade {
  try {
    return layStair(plan, words)
  } catch (error) {
    if (error instanceof StairRefused) throw new EditRefused(sentence(error.message))
    throw error
  }
}

const listed = (stairs: readonly Stair[]): string => (stairs.length === 0 ? 'The plan has none.' : `Its stairs: ${stairs.slice(0, 20).map((s) => s.id).join(', ')}${stairs.length > 20 ? ` and ${stairs.length - 20} more` : ''}.`)

/** The lines every stair change ends with: what Grid worked out, and what is worth a look. */
const after = (made: StairMade): string[] => [...made.guesses.map(sentence), sentence(stairSummary(made.layout)), ...made.warnings.map(sentence)]

/** A stair added to the plan, laid in a room by its words or along its walking line. */
export function addStair(survey: Survey, request: StairRequest): Patch {
  const plan = survey.plan
  const stairs = plan.stairs ?? []
  if (request.from === undefined || request.to === undefined) throw new EditRefused('Give the floors the stair joins, from and to: a floor\'s id, or a room\'s, which stands for its floor.')
  if (request.width === undefined) throw new EditRefused('Give the stair\'s width, across its walking line.')
  if (request.risers === 0) throw new EditRefused('risers is a whole number, 1 or more; leave it out for Grid to work the count out.')
  let id = request.id
  if (id === undefined) {
    let n = stairs.length + 1
    while (stairs.some((s) => s.id === `stair-${n}`)) n++
    id = `stair-${n}`
  } else if (stairs.some((s) => s.id === id)) throw new EditRefused(`The plan has a stair with the id ${id} already: give the new one its own, or change that one with grid_change_stair.`)
  const words: StairWords = { ...request, id, from: request.from, to: request.to, width: request.width }
  const made = laid(plan, words)
  const where = made.room === null ? 'along its walking line' : `in ${made.room}`
  return {
    ...emptyPatch([`Added stair ${id} from floor ${made.stair.from} to floor ${made.stair.to}, ${where}, ${M(made.stair.width)} wide.`, ...after(made)]),
    plan: { stairs: [...stairs, made.stair] },
    extra: { stair: id },
  }
}

const LAYOUT_FIELDS = ['room', 'shape', 'runs', 'then', 'along'] as const

/** One stair changed or removed, by id. */
export function changeStair(survey: Survey, request: StairRequest & { readonly id: string; readonly remove?: boolean }): Patch {
  const plan = survey.plan
  const stairs = plan.stairs ?? []
  const stair = stairs.find((s) => s.id === request.id)
  if (stair === undefined) throw new EditRefused(`The plan has no stair with the id ${request.id}. ${listed(stairs)}`)
  const given = (Object.keys(request) as (keyof StairRequest | 'remove')[]).filter((k) => k !== 'id' && k !== 'remove' && request[k] !== undefined)
  if (request.remove === true) {
    if (given.length > 0) throw new EditRefused(`remove takes nothing else: leave out ${given.join(', ')}.`)
    const left = stairs.filter((s) => s !== stair)
    return { ...emptyPatch([`Took stair ${stair.id} out of the plan.`]), plan: { stairs: left.length === 0 ? null : left }, extra: { stair: stair.id } }
  }
  if (given.length === 0) throw new EditRefused('Give what changes: from, to, width, room, shape, runs, then, along, run, risers or name; or remove.')
  const layoutGiven = LAYOUT_FIELDS.some((k) => request[k] !== undefined)
  if (request.run !== undefined && layoutGiven) throw new EditRefused("Give the stair's walking line (run) or the room it is laid in with its shape and the way it runs, not both.")
  const kept = {
    id: stair.id,
    ...((request.name ?? stair.name) === undefined ? {} : { name: request.name ?? stair.name! }),
    from: request.from ?? stair.from,
    to: request.to ?? stair.to,
    width: request.width ?? stair.width,
    ...(request.risers === 0 ? {} : (request.risers ?? stair.risers) === undefined ? {} : { risers: request.risers ?? stair.risers! }),
  }
  const before = stairWordsOf(plan, stair)
  let words: StairWords
  if (request.run !== undefined) words = { ...kept, run: request.run }
  else if (layoutGiven || (request.width !== undefined && before !== null)) {
    const base: Partial<StairWords> = before ?? {}
    const shape = request.shape ?? base.shape
    const straight = (shape ?? 'straight') === 'straight'
    // The old words a new shape does not take go; what the call gives is read as given.
    const then = request.then ?? (straight ? undefined : base.then)
    const along = request.along ?? (straight ? base.along : undefined)
    words = {
      ...kept,
      ...((request.room ?? base.room) === undefined ? {} : { room: request.room ?? base.room! }),
      ...(shape === undefined ? {} : { shape }),
      ...((request.runs ?? base.runs) === undefined ? {} : { runs: request.runs ?? base.runs! }),
      ...(then === undefined ? {} : { then }),
      ...(along === undefined ? {} : { along }),
    }
    if (before === null && (words.room === undefined || words.runs === undefined)) {
      throw new EditRefused(`Stair ${stair.id} runs along a walking line of its own, not laid in a room by Grid: give room and runs (and shape) to lay it in a room, or a new walking line in run.`)
    }
  } else words = { ...kept, run: stair.run.map((p) => [p[0], p[1]] as Pair) }
  const made = laid(plan, words)
  const next = made.stair
  const parts: string[] = []
  if (next.from !== stair.from || next.to !== stair.to) parts.push(`floors ${stair.from} to ${stair.to}, now ${next.from} to ${next.to}`)
  if (next.width !== stair.width) parts.push(`width ${M(stair.width)} to ${M(next.width)}`)
  const moved = next.run.length !== stair.run.length || next.run.some((p, i) => p[0] !== stair.run[i]![0] || p[1] !== stair.run[i]![1])
  if (moved) parts.push(made.room === null ? 'a new walking line' : `laid again in ${made.room}`)
  if (next.risers !== stair.risers) parts.push(next.risers === undefined ? 'risers left to Grid to work out' : `risers ${stair.risers ?? 'worked out'} to ${next.risers}`)
  if (next.name !== stair.name) parts.push('its name')
  // The file's own record changes only in what changed; a stair said by its two ends is said by its walking line now.
  const change: Record<string, unknown> = {
    from: next.from,
    to: next.to,
    width: next.width,
    ...(moved ? { run: next.run, start: null, end: null } : {}),
    risers: next.risers ?? null,
    ...(next.name === undefined ? {} : { name: next.name }),
  }
  return {
    ...emptyPatch([`Changed stair ${stair.id}: ${parts.length === 0 ? 'nothing, it is so already' : parts.join('; ')}.`, ...after(made)]),
    parts: new Map([['stairs', new Map([[stair.id, change]])]]),
    extra: { stair: stair.id },
  }
}
