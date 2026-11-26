/**
 * SHT-21: the client cover's figures, fitted to the kind of building the plan is.
 *
 * A station leads with its platforms and gates, a hospital with its beds and theatres, a shed with
 * its loading doors and the clear height of its tallest room, a block of flats with its homes; a
 * plan that states no kind shows each count only where it is more than none, so a cover never
 * says "0 bedrooms" of a building that has no reason to have any. Every figure comes from code
 * that exists (`planAreas`, `floorElevations`, `roomSchedule`, the plan's items, bays and
 * openings): nothing is measured here.
 *
 * Floors are counted, and floor to floor taken, by whole storeys only: a floor that stands inside
 * another storey's height (a mezzanine in a shed, a terrace in a hall) gives no step of its own.
 */
import { buildingOfFloor, floorElevations, type StoreyLevel } from '@ongrid/floorplan/geometry'
import { fixedText, metresText } from '@ongrid/floorplan/geometry/rounding'
import { tolerance } from '@ongrid/floorplan/geometry/tolerances'
import { signedArea } from '@ongrid/floorplan/geometry/vec2'
import type { MessageKey } from '@ongrid/floorplan/messages'
import type { BuildingType, FloorPlan, RoomUse } from '@ongrid/floorplan/types/floorplan'
import type { PlanAreas } from '../quantities/areas'
import { roomSchedule } from '../quantities/schedule'
import type { Survey } from '../quantities/survey'
import type { SheetFigure, SheetUnits, Words } from './pages'

/** The most figures a cover prints in its row; any more are one line under it. */
export const COVER_FIGURES_MAX = 6

/** A count the cover may give, by what it counts. */
type Count = 'homes' | 'bedrooms' | 'guestRooms' | 'beds' | 'theatres' | 'platforms' | 'gates' | 'classrooms' | 'seats' | 'docks' | 'cells' | 'spaces'
/** A cover figure of a kind: a count, or the clear height of its tallest hall or room. */
type KindFigure = Count | 'hall' | 'tallest'

/** Each kind's own figures, in the order the cover gives them. */
const KIND_FIGURES: Readonly<Record<BuildingType, readonly KindFigure[]>> = {
  home: ['bedrooms'],
  flats: ['homes', 'bedrooms'],
  hotel: ['guestRooms'],
  health: ['beds', 'theatres', 'bedrooms'],
  transport: ['platforms', 'gates'],
  school: ['classrooms'],
  culture: ['seats', 'hall'],
  assembly: ['seats', 'hall'],
  sport: ['hall'],
  food: ['seats'],
  warehouse: ['docks', 'tallest'],
  industry: ['docks', 'tallest'],
  custody: ['cells'],
  parking: ['spaces'],
  office: [],
  shop: [],
  lab: [],
  other: [],
}

/** With no kind stated: every count, each shown only where it is more than none. */
const ANY_KIND: readonly KindFigure[] = ['homes', 'bedrooms', 'platforms', 'gates', 'beds', 'theatres', 'classrooms', 'seats', 'docks', 'cells', 'spaces']

/** The kinds whose bedrooms are shown even when there are none: a studio is a home. */
const HOMES: ReadonlySet<BuildingType> = new Set(['home', 'flats'])

/** The rooms a hall's clear height is read from, by use. */
const HALL_USES: ReadonlySet<string> = new Set<RoomUse>(['auditorium', 'assembly', 'worship', 'gallery', 'stage', 'sport', 'foyer'])

/** Rooms counted by use. */
const BY_USE: Readonly<Partial<Record<Count, RoomUse>>> = {
  bedrooms: 'bedroom', guestRooms: 'bedroom', theatres: 'operating', platforms: 'platform', gates: 'gate', classrooms: 'classroom', cells: 'cell',
}

/** The figure's label, one and many. */
const COUNT_LABELS: Readonly<Record<Count, readonly [MessageKey, MessageKey]>> = {
  homes: ['sheet.figure.homes.one', 'sheet.figure.homes.many'],
  bedrooms: ['sheet.figure.bedrooms.one', 'sheet.figure.bedrooms.many'],
  guestRooms: ['sheet.figure.guestRooms.one', 'sheet.figure.guestRooms.many'],
  beds: ['sheet.figure.beds.one', 'sheet.figure.beds.many'],
  theatres: ['sheet.figure.theatres.one', 'sheet.figure.theatres.many'],
  platforms: ['sheet.figure.platforms.one', 'sheet.figure.platforms.many'],
  gates: ['sheet.figure.gates.one', 'sheet.figure.gates.many'],
  classrooms: ['sheet.figure.classrooms.one', 'sheet.figure.classrooms.many'],
  seats: ['sheet.figure.seats.one', 'sheet.figure.seats.many'],
  docks: ['sheet.figure.docks.one', 'sheet.figure.docks.many'],
  cells: ['sheet.figure.cells.one', 'sheet.figure.cells.many'],
  spaces: ['sheet.figure.spaces.one', 'sheet.figure.spaces.many'],
}

/** The kinds the plan states: its own, then each floor's that differs, in the order of the floors. Empty when it states none. */
export function statedKinds(survey: Survey): BuildingType[] {
  const { building } = survey.facts
  return [...new Set([...(building.plan === undefined ? [] : [building.plan]), ...building.floors.map((f) => f.building)])]
}

/** Each count, from the plan after the work. */
function counts(survey: Survey): Readonly<Record<Count, number>> {
  const plan = survey.plan
  const rooms = (use: RoomUse): number => plan.rooms.filter((room) => room.use === use).length
  const items = (kind: string): number => (plan.items ?? []).filter((item) => item.kind === kind).length
  // A loading door: a roller or garage door in a wall with the outside on one side.
  const kinds = new Map(plan.openings.map((o) => [o.id, o] as const))
  const docks = survey.facts.floors.flatMap((f) => f.openings).filter((o) => {
    const opening = kinds.get(o.id)
    return o.type === 'door' && (opening?.kind === 'roller' || opening?.kind === 'garage') && o.sides.includes('outside')
  }).length
  const homes = (plan.flats ?? []).length || (plan.floors ?? []).reduce((sum, floor) => sum + (floor.homes ?? 0), 0)
  const spaces = (plan.bays ?? []).length || (plan.floors ?? []).reduce((sum, floor) => sum + (floor.parking ?? 0), 0)
  const out = { homes, beds: items('bed'), seats: items('chair'), docks, spaces } as Record<Count, number>
  for (const [count, use] of Object.entries(BY_USE) as [Count, RoomUse][]) out[count] = rooms(use)
  return out
}

/** The storeys of one stack, whole ones only: a floor inside another storey's height is set aside. */
function wholeStoreys(storeys: readonly StoreyLevel[]): StoreyLevel[] {
  const same = tolerance('sameFloorLevel')
  const sorted = [...storeys].sort((a, b) => a.floorLevel - b.floorLevel || b.clearHeight - a.clearHeight)
  const whole: StoreyLevel[] = []
  for (const storey of sorted) {
    const inside = whole.some((t) => storey.floorLevel > t.floorLevel + same && storey.floorLevel < t.floorLevel + t.clearHeight - same)
    const level = whole.some((t) => Math.abs(t.floorLevel - storey.floorLevel) <= same)
    if (!inside && !level) whole.push(storey)
  }
  return whole
}

/** The plan's stacks of floors: one per building it names, and one of the floors no building holds. */
function stacks(plan: FloorPlan): StoreyLevel[][] {
  const levels = floorElevations(plan).floors
  let holder: ReadonlyMap<string, string> = new Map()
  try {
    holder = (plan.buildings ?? []).length === 0 ? new Map() : buildingOfFloor(plan)
  } catch {
    holder = new Map()
  }
  const groups = new Map<string, StoreyLevel[]>()
  for (const [floor, level] of levels) groups.set(holder.get(floor) ?? '', [...(groups.get(holder.get(floor) ?? '') ?? []), level])
  return [...groups.values()].map(wholeStoreys)
}

export interface CoverFigures {
  readonly figures: readonly SheetFigure[]
  /** Figures past `COVER_FIGURES_MAX`, as one line for the cover's notes; null when all fit. */
  readonly more: string | null
}

/**
 * The cover's figures after its headline areas (`headline`): the kind's own, the floors, floor to
 * floor or the clear height, the height to the roof, the gross external area and the floor area
 * ratio, in that order, at most `COVER_FIGURES_MAX` in all.
 */
export function coverFigures(survey: Survey, areas: PlanAreas, headline: readonly SheetFigure[], units: SheetUnits, w: Words): CoverFigures {
  const plan = survey.plan
  const kinds = statedKinds(survey)
  const counted = counts(survey)
  const figures: SheetFigure[] = [...headline]
  const count = (what: Count, always: boolean): void => {
    const n = counted[what]
    if (n === 0 && !always) return
    figures.push({ value: String(n), label: w.say(COUNT_LABELS[what][n === 1 ? 0 : 1]) })
  }
  // The clear height of the tallest room, of the hall uses for a hall; null when no height is known.
  let schedule: ReturnType<typeof roomSchedule> | null = null
  const tallest = (hall: boolean): SheetFigure | null => {
    schedule ??= roomSchedule(survey)
    const rows = schedule.rows.filter((r) => r.height !== null && (!hall || (r.use !== null && HALL_USES.has(r.use))))
    if (rows.length === 0) return hall ? tallest(false) : null
    // Of rooms as tall, the largest: the hall, not its foyer under the same ceiling.
    const top = rows.reduce((a, b) => (b.height! > a.height! || (b.height === a.height && (b.area ?? 0) > (a.area ?? 0)) ? b : a))
    return { value: units.length(top.height!, 'height'), label: w.say('sheet.figure.clearHeightIn', { room: top.name }) }
  }
  let roomHeight = false
  const shown = new Set<KindFigure>()
  for (const what of kinds.length === 0 ? ANY_KIND : kinds.flatMap((kind) => KIND_FIGURES[kind])) {
    if (shown.has(what)) continue
    shown.add(what)
    if (what === 'hall' || what === 'tallest') {
      const figure = tallest(what === 'hall')
      if (figure !== null && !roomHeight) {
        figures.push(figure)
        roomHeight = true
      }
      continue
    }
    // A hotel's bedrooms are its guest rooms, and are given once.
    if (what === 'bedrooms' && shown.has('guestRooms')) continue
    count(what, what === 'bedrooms' && kinds.some((kind) => HOMES.has(kind)))
  }

  const piles = stacks(plan).filter((pile) => pile.length > 0)
  const storeys = Math.max(0, ...piles.map((pile) => pile.length))
  figures.push({ value: String(storeys), label: w.say(storeys === 1 ? 'sheet.figure.floors.one' : 'sheet.figure.floors.many') })
  if (piles.length > 1) figures.push({ value: String(piles.length), label: w.say('sheet.figure.buildings') })
  const steps = piles.flatMap((pile) => pile.slice(1).map((storey, i) => storey.floorLevel - pile[i]!.floorLevel))
  if (steps.length > 0) {
    const low = Math.min(...steps)
    const high = Math.max(...steps)
    const value = units.length(low) === units.length(high) ? units.length(low) : units.metric ? `${units.mark(metresText(low))}–${units.mark(metresText(high))} m` : `${units.length(low)}–${units.length(high)}`
    figures.push({ value, label: w.say('sheet.figure.floorToFloor') })
    const roof = floorElevations(plan).roof.top
    if (roof > 0) figures.push({ value: units.length(roof, 'height'), label: w.say('sheet.figure.heightToRoof') })
  } else if (!roomHeight) {
    const only = piles[0]?.[0]
    if (only) figures.push({ value: units.length(only.clearHeight), label: w.say('sheet.figure.clearHeight') })
  }
  if (!areas.underAir.first && areas.grossExternal !== null) figures.push({ value: `${units.area(areas.grossExternal)} ${units.areaUnit}`, label: w.say('sheet.figure.grossExternal') })
  // The floor area ratio: the gross external area over the site's, with a boundary stated.
  const boundary = plan.site?.boundary
  const site = boundary === undefined ? 0 : Math.abs(signedArea(boundary.map(([x, y]) => ({ x, y }))))
  if (site > 0 && areas.grossExternal !== null) figures.push({ value: units.mark(fixedText(areas.grossExternal / site, 2)), label: w.say('sheet.figure.floorAreaRatio') })

  const row = figures.slice(0, COVER_FIGURES_MAX)
  const rest = figures.slice(COVER_FIGURES_MAX)
  return {
    figures: row,
    more: rest.length === 0 ? null : w.say('sheet.figures.more', { figures: rest.map((f) => `${f.value} ${f.label}`).join(w.say('join.comma')) }),
  }
}

/** The one rounding rule the sheet's figures are printed by, said once on the cover. */
export function roundingNote(units: SheetUnits, w: Words): string {
  return w.say(units.feet ? 'sheet.rounding.feet' : 'sheet.rounding')
}
