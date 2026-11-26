/**
 * The parking changes (CNT-46): rows of bays placed in a room (`placeBays`, `grid_place_bays`) and
 * a ramp added between two floors (`addRamp`, `grid_add_ramp`). Each is a patch of the plan's own
 * `bays` or `ramps`, as every change is, and lays them out by rooms text's own reading of their
 * words (`layBays` and `layRamp` in `rooms/parking.ts`), so a tool and a `bays` or `ramp` line give
 * the same bays and ramps.
 *
 * A group placed again replaces its own bays (`<group>-<k>`), so a fill can be tried again with
 * another module. With no `numbered`, the bays are numbered on from the highest number the floor's
 * other bays carry, or from 1.
 */
import { baysSummary, layBays, layRamp, numberAfter, ParkingRefused, rampSummary, type BayKind, type BayRows, type BaysMade, type ParkingWay, type RampMade, type RampWords } from '@ongrid/floorplan/rooms'
import { floorOf } from '@ongrid/floorplan/geometry/floors'
import type { Bay, FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch } from './edits'
import { EditRefused } from './refused'

/** What a `grid_place_bays` call says: a row along a side of a room, or the room filled. */
export interface BaysRequest {
  readonly group: string
  readonly room: string
  /** A row against this side; the room filled with rows and aisles when left out. */
  readonly along?: ParkingWay
  readonly width?: number
  readonly length?: number
  readonly kind?: BayKind
  readonly aisle?: number
  readonly rows?: BayRows
  readonly from?: ParkingWay
  readonly count?: number
  readonly offset?: number
  readonly inset?: number
  readonly numbered?: string
  readonly floor?: string
}

/** What a `grid_add_ramp` call says: every field but the floors and the width is left out when not given. */
export interface RampRequest extends Omit<RampWords, 'id'> {
  readonly id?: string
}

const M = (v: number): string => `${Math.round(v * 1000) / 1000 + 0} m`
const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.:]$/.test(text) ? '' : '.'}`

/** The ids of the plan's other parts, which a bay's or a ramp's may not take. */
const otherIds = (plan: FloorPlan): Set<string> =>
  new Set([...plan.walls.map((w) => w.id), ...plan.rooms.map((r) => r.id), ...plan.openings.map((o) => o.id), ...(plan.stairs ?? []).map((s) => s.id), ...(plan.items ?? []).map((i) => i.id), ...(plan.columns ?? []).map((c) => c.id)])

/** Whether a bay is one of a group's: `<group>-<k>`. */
const ofGroup = (bay: Bay, group: string): boolean => bay.id.startsWith(`${group}-`) && /^\d+$/.test(bay.id.slice(group.length + 1))

const byNumber = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** The number after the highest the floor's bays carry, or 1. */
function nextNumber(bays: readonly Bay[], floor: string): string {
  const numbers = bays.filter((b) => floorOf(b) === floor && b.number !== undefined && /\d$/.test(b.number)).map((b) => b.number!)
  if (numbers.length === 0) return '1'
  return numberAfter(numbers.sort(byNumber.compare)[numbers.length - 1]!, 1)
}

function refusedAs<T>(make: () => T): T {
  try {
    return make()
  } catch (error) {
    if (error instanceof ParkingRefused) throw new EditRefused(sentence(error.message))
    throw error
  }
}

/** A row of bays along a side of a room, or the room filled with rows and aisles; a group placed again is replaced. */
export function placeBays(survey: Survey, request: BaysRequest): Patch {
  const plan = survey.plan
  const all = plan.bays ?? []
  const replaced = all.filter((b) => ofGroup(b, request.group))
  const kept = all.filter((b) => !ofGroup(b, request.group))
  const sized = request.width !== undefined || request.length !== undefined
  if (sized && request.kind !== undefined) throw new EditRefused('Give the bay\'s size (width and length) or its kind, not both.')
  if (request.along === undefined && (request.offset !== undefined || request.inset !== undefined)) throw new EditRefused('offset and inset are for a row along a side: give along, or leave them out to fill the room.')
  if (request.along !== undefined && (request.aisle !== undefined || request.rows !== undefined)) throw new EditRefused('aisle and rows are for a room filled with rows: leave out along to fill the room, or them for one row.')
  const words = (numbered: string | undefined) => ({
    group: request.group,
    how: request.along === undefined ? ('fill' as const) : ('along' as const),
    room: request.room,
    ...(request.along === undefined ? {} : { side: request.along }),
    ...(request.width === undefined ? {} : { width: request.width }),
    ...(request.length === undefined ? {} : { length: request.length }),
    ...(request.kind === undefined ? {} : { kind: request.kind }),
    ...(request.aisle === undefined ? {} : { aisle: request.aisle }),
    ...(request.rows === undefined ? {} : { rows: request.rows }),
    ...(request.from === undefined ? {} : { from: request.from }),
    ...(request.count === undefined ? {} : { count: request.count }),
    ...(request.offset === undefined ? {} : { offset: request.offset }),
    ...(request.inset === undefined ? {} : { inset: request.inset }),
    ...(numbered === undefined ? {} : { numbered }),
    ...(request.floor === undefined ? {} : { floor: request.floor }),
  })
  const rest: FloorPlan = { ...plan, bays: kept }
  // Laid once to find the room's floor, then numbered on from that floor's bays when not told.
  let made: BaysMade = refusedAs(() => layBays(rest, words(request.numbered ?? '1'), null, kept))
  const numbered = request.numbered ?? nextNumber(kept, made.floor)
  if (numbered !== '1' && request.numbered === undefined) made = refusedAs(() => layBays(rest, words(numbered), null, kept))
  const taken = otherIds(plan)
  const keptIds = new Set(kept.map((b) => b.id))
  const clash = made.bays.find((b) => taken.has(b.id) || keptIds.has(b.id))
  if (clash !== undefined) throw new EditRefused(`The id ${clash.id} is another part's already: give the bays a group of their own.`)
  const said = [
    `${replaced.length === 0 ? 'Placed' : `Placed again (replacing ${replaced.length})`} ${baysSummary(made)}.`,
    ...made.guesses.map(sentence),
    ...(request.numbered === undefined ? [`The numbers count on from ${numbered === '1' ? '1, the floor having no numbered bay' : `the floor's highest, to ${numbered}`}; give numbered for your own.`] : []),
  ]
  return {
    ...emptyPatch(said),
    plan: { bays: [...kept, ...made.bays] },
    extra: { bays: made.bays.length, group: request.group, first: made.bays[0]!.id, last: made.bays[made.bays.length - 1]!.id },
  }
}

/** A ramp added between two floors: straight in its room, along its middle line, or a helix. */
export function addRamp(survey: Survey, request: RampRequest): Patch {
  const plan = survey.plan
  const ramps = plan.ramps ?? []
  let id = request.id
  if (id === undefined) {
    let n = ramps.length + 1
    while (ramps.some((r) => r.id === `ramp-${n}`)) n++
    id = `ramp-${n}`
  } else if (ramps.some((r) => r.id === id)) throw new EditRefused(`The plan has a ramp with the id ${id} already: give the new one its own.`)
  else if (otherIds(plan).has(id) || (plan.bays ?? []).some((b) => b.id === id)) throw new EditRefused(`The id ${id} is another part's already: give the ramp its own.`)
  const words: RampWords = { ...request, id }
  const made: RampMade = refusedAs(() => layRamp(plan, words))
  const where = made.room === null ? 'along its middle line' : request.shape === 'helix' ? `a helix in ${made.room}` : `in ${made.room}`
  const helixAt = request.shape === 'helix' && made.room === null ? 'a helix' : where
  return {
    ...emptyPatch([`Added ramp ${id} from floor ${made.ramp.from} to floor ${made.ramp.to}, ${helixAt}, ${M(made.ramp.width)} wide.`, ...made.guesses.map(sentence), sentence(rampSummary(made.layout))]),
    plan: { ramps: [...ramps, made.ramp] },
    extra: { ramp: id, rise: made.layout.rise, length: made.layout.length, slope: made.layout.slope, points: made.ramp.run.length },
  }
}
