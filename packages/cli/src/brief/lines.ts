/**
 * BRF-1: each wish of the brief against the drawing, as a line met or missed, in words such as
 * "asked 4.5, drawn 11.93 m²", never as a score.
 *
 * The drawing is measured here as everywhere else, so a target and the drawing are measured by
 * the same rule: a room's net area is ARE-9's (`planAreas`, `MEASURES.net`), its inside size the
 * one `grid_areas` gives, a footprint the ground floor's gross external area and the outside of
 * its walls, a width or a turning circle `grid_measure`'s widest circle, a door the width its
 * figure is for, clear by default, as the access measure gives it (ARE-27, `doorWidth.ts`), a
 * height `roomHeight`. Until a brief names a size for a room, a size written in the
 * room's own name ("6 tatami", "12 m²") is read against the room as drawn (lab R-14).
 *
 * A line met says that what was drawn is what the person asked for, and nothing else: no line
 * says a plan is allowed, and every answer says so (MSG-3).
 *
 * Pure: a plan and a brief in, lines out. Nothing here reads a file.
 */
import { defaultFloor, floorElevations, floorOf, groundLevel, MEASURES, openingPoint, planFlats, planFloors, planForFloor, planSteps, roomFloorOffset, tolerance, wallPolygon, computeBounds, type FloorPlan, type Vec2 } from '@ongrid/floorplan/geometry'
import { factOf } from '@ongrid/floorplan/types/floorplan'
import { lettableFigures } from '../quantities/lettable'
import { smallMetres } from '../quantities/units'
import { planAreas, type RoomArea } from '../quantities/areas'
import { measureRoom, roomHeight } from '../quantities/measure'
import { corridorNarrowestOf, entranceOf } from '../quantities/access'
import { entryWays, OUTSIDE, wayGraph } from '../quantities/measure'
import { doorClearanceOf, doorLeavesSaid, doorWidthFor, DOOR_MEASURE_NAMES, DOOR_MEASURE_RULES } from '../quantities/doorWidth'
import { surveyPlan, type Survey } from '../quantities/survey'
import { METRES } from '@ongrid/floorplan/types/units'
import { say } from '@ongrid/floorplan/messages'
import { isSiteFigure, siteLimits } from '../quantities/limits'
import { planSeating, type Seating } from '../quantities/seats'
import { EXACT_FIGURES, FIGURES, FIGURES_HEADING, isSeatingFigure, SEATING_WHATS, type Brief, type FactScope, type FigureWish, type Level, type RoomWish, type SeatingTarget, type SeatingWhat, type Source } from './brief'

/** How a line stands: `met`, `missed`, `open` (nothing to measure yet), or `differs` (a size in a room's name). */
export type BriefState = 'met' | 'missed' | 'open' | 'differs'

/** A part of the plan a line is about. */
export interface BriefPart {
  readonly kind: 'room' | 'opening'
  readonly id: string
}

export interface BriefLine {
  readonly state: BriefState
  /** What the line is about: `room`, `rooms`, `footprint`, `touch`, a figure's name, `open` or `name`. */
  readonly wish: string
  /** Null on a line no wish gave: a size in a room's name. */
  readonly level: Level | null
  readonly source: Source | null
  /** The person's words for it, when the brief keeps them. */
  readonly quote: string | null
  /** The figure asked for, as written in the brief; null when the wish has none. */
  readonly asked: string | null
  /** The figure drawn, to two places; null when nothing was measured. */
  readonly drawn: string | null
  readonly unit: string | null
  readonly parts: readonly BriefPart[]
  readonly text: string
  /** ARE-69: the wish's place in the brief ("rooms[2]", "figures.door_width"), for grid_write_brief's update and remove; null on a line no wish gave. */
  readonly where: string | null
}

/** The rule each kind of figure is measured by, in a line. */
export const BRIEF_RULE = 'measured as the drawing is: areas and inside sizes to the faces of the walls, as grid_areas gives them, widths and circles as grid_measure does, and a footprint to the outside face of the ground floor\'s walls.'

/** A line met says only that: never that a plan is allowed (MSG-3). */
export const MET_IS_NOT_ALLOWED = 'A line met says the drawing holds what the person asked for, and nothing about any rule.'

/** What Grid takes one mat to be, for a size in mats in a room's name: 0.9 × 1.8 m, its own reading of a mat, citing no document. */
export const MAT = { width: 0.9, length: 1.8 } as const
const MAT_AREA = MAT.width * MAT.length

const q = (text: string): string => JSON.stringify(text)
const n2 = (value: number): string => smallMetres(value)
const asWritten = (value: number): string => String(value)
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** ARE-38: the name, then a number or one letter after it ("Consult 1", "Consult-2", "Consult #3", "Consult A"). */
function numberedAs(room: string, stem: string): boolean {
  const a = room.trim().toLowerCase()
  const b = stem.trim().toLowerCase()
  if (b === '' || !a.startsWith(b)) return false
  return /^(?:[\s\-_.:#]*\d+|[\s\-_.:#]+[a-z])$/.test(a.slice(b.length))
}

/** ARE-67: a name in the plural, as one room is named: "Phone booths" for "Phone booth". */
function singulars(name: string): string[] {
  const n = name.trim()
  if (n.length < 4) return []
  const lower = n.toLowerCase()
  if (lower.endsWith('ies')) return [`${n.slice(0, -3)}y`]
  if (lower.endsWith('es')) return [n.slice(0, -1), n.slice(0, -2)]
  if (lower.endsWith('s') && !lower.endsWith('ss')) return [n.slice(0, -1)]
  return []
}

/**
 * The rooms a name means: by name, any case, the name numbered ("Consult 1" for "Consult"); then
 * (ARE-67) by the room type the plan states, the same way; then the name in the plural ("Phone
 * booths") by name and type; or by id.
 */
function roomsNamed(plan: FloorPlan, name: string): FloorPlan['rooms'] {
  const byName = (stem: string) => plan.rooms.filter((room) => same(room.name, stem) || numberedAs(room.name, stem))
  const byType = (stem: string) => plan.rooms.filter((room) => room.roomType !== undefined && (same(room.roomType, stem) || numberedAs(room.roomType, stem)))
  for (const stem of [name, ...singulars(name)]) {
    for (const found of [byName(stem), byType(stem)]) if (found.length > 0) return found
  }
  return plan.rooms.filter((room) => room.id === name)
}

/**
 * ARE-56: the rooms a wish means. A wish with a name and a use finds a room by name first; when
 * none carries the name it takes the rooms of that use, and says so (`byUse`), so a "Utility"
 * wish meets a room drawn as "Utility / laundry".
 */
function wishRooms(plan: FloorPlan, wish: { readonly name: string | null; readonly use: string | null; readonly floor?: string | null; readonly fact?: FactScope | null }): { rooms: FloorPlan['rooms']; byUse: boolean } {
  // ARE-69: only the rooms on the floor and carrying the fact the wish names.
  const scoped = (rooms: FloorPlan['rooms']): FloorPlan['rooms'] => rooms.filter((room) => (wish.floor == null || onFloor(plan, room, wish.floor)) && (wish.fact == null || carries(room, wish.fact)))
  if (wish.name === null) return { rooms: scoped(plan.rooms.filter((room) => room.use === wish.use)), byUse: false }
  const byName = scoped(roomsNamed(plan, wish.name))
  if (byName.length > 0 || wish.use === null) return { rooms: byName, byUse: false }
  const byUse = scoped(plan.rooms.filter((room) => room.use === wish.use))
  return { rooms: byUse, byUse: byUse.length > 0 }
}

/** ARE-69: whether a room is on the floor named, by its id or its name, any case. */
function onFloor(plan: FloorPlan, room: FloorPlan['rooms'][number], floor: string): boolean {
  const id = floorOf(room)
  if (same(id, floor)) return true
  const named = (planFloors(plan).find((f) => f.id === id) as { readonly name?: string } | undefined)?.name
  return named !== undefined && same(named, floor)
}

/** ARE-69: whether a room carries a fact of the person's own, with the value named when one is. */
function carries(room: FloorPlan['rooms'][number], fact: FactScope): boolean {
  const value = factOf(room, fact.name)
  if (value === undefined) return false
  if (fact.value === null) return true
  return typeof value === 'string' && typeof fact.value === 'string' ? same(value, fact.value) : value === fact.value
}

/** ARE-69: the scope a wish names, in words after what it is for: ` on floor "Level 2"`, ` with department "Surgery"`. */
function scopeWords(wish: { readonly floor: string | null; readonly fact: FactScope | null }): string {
  const floor = wish.floor === null ? '' : ` ${say('en', 'brief.scope.floor', { floor: { name: wish.floor } })}`
  const fact = wish.fact === null ? '' : ` ${say('en', 'brief.scope.fact', { fact: wish.fact.value === null ? wish.fact.name : `${wish.fact.name} ${q(String(wish.fact.value))}` })}`
  return `${floor}${fact}`
}

function prefix(state: BriefState, level: Level | null, source: Source | null): string {
  if (level === null) return `${state}:`
  return `${state} (${level}${source === 'assumed' ? ', assumed' : ''}):`
}

/** The rooms a line counted, by name: "(Consult 1, Consult 2)", at most 12 of them. */
function counted(rooms: FloorPlan['rooms']): string {
  const names = rooms.map((r) => (r.name.trim() === '' ? r.id : r.name.trim()))
  if (names.length === 0) return ''
  const shown = names.slice(0, 12).join(', ')
  return ` (${shown}${names.length > 12 ? `, and ${names.length - 12} more` : ''})`
}

/** "asked 4.5" for a figure the person gave, "assumed 4.5" for one to confirm with them. */
const askedWord = (source: Source): string => (source === 'assumed' ? 'assumed' : 'asked')

interface Context {
  readonly plan: FloorPlan
  readonly survey: Survey
  readonly areas: Map<string, RoomArea>
  readonly empty: boolean
  /** ARE-67: the furniture's seats, desks and covers, counted on first use. */
  seating(): Seating
  /** ARE-69: the ways from room to room on a floor (`wayGraph`), worked out on first use. */
  ways(floor: string): ReadonlyMap<string, ReadonlyArray<{ readonly room: string; readonly via: string }>>
}

const key = (floor: string, id: string): string => `${floor}\u0000${id}`

function contextOf(plan: FloorPlan): Context {
  const survey = surveyPlan(plan)
  const areas = new Map<string, RoomArea>()
  for (const floor of planAreas(survey).floors) for (const room of floor.rooms) areas.set(key(floor.floor, room.id), room)
  let seating: Seating | null = null
  const ways = new Map<string, ReadonlyMap<string, ReadonlyArray<{ readonly room: string; readonly via: string }>>>()
  const waysOn = (floor: string) => {
    let found = ways.get(floor)
    if (found === undefined) {
      found = wayGraph(survey, floor).next
      ways.set(floor, found)
    }
    return found
  }
  return { plan, survey, areas, empty: plan.rooms.length === 0, seating: () => (seating ??= planSeating(survey)), ways: waysOn }
}

const areaOf = (c: Context, room: FloorPlan['rooms'][number]): RoomArea | undefined => c.areas.get(key(floorOf(room), room.id))

/** Whether a drawn size is the asked one: within `briefAbout` of it, or past a least or a most. */
function within(drawn: number, asked: number): boolean {
  return Math.abs(drawn - asked) <= asked * tolerance('briefAbout') + tolerance('lengthEqual')
}

function line(state: BriefState, said: { level: Level | null; source: Source | null; quote: string | null }, wish: string, body: string, figures: { asked?: string | null; drawn?: string | null; unit?: string | null; parts?: readonly BriefPart[] } = {}): BriefLine {
  return {
    state,
    wish,
    level: said.level,
    source: said.source,
    quote: said.quote,
    asked: figures.asked ?? null,
    drawn: figures.drawn ?? null,
    unit: figures.unit ?? null,
    parts: figures.parts ?? [],
    text: `${prefix(state, said.level, said.source)} ${body}`,
    where: null,
  }
}

/** Met or missed, as the level asks: `avoid` is met when the drawing does not hold it. */
const stateOf = (holds: boolean, level: Level): BriefState => ((level === 'avoid' ? !holds : holds) ? 'met' : 'missed')

// ---------------------------------------------------------------------------------------------
// Rooms

function roomLines(c: Context, brief: Brief): BriefLine[] {
  return brief.rooms.flatMap((wish, i) => roomWishLines(c, wish).map((l) => ({ ...l, where: `rooms[${i}]` })))
}

/** ARE-69: the rooms whose only ways lead into `room`, on its floor: an en-suite, a wardrobe. */
function innerRooms(c: Context, room: FloorPlan['rooms'][number]): FloorPlan['rooms'] {
  const next = c.ways(floorOf(room))
  return c.plan.rooms.filter((r) => {
    if (r.id === room.id || floorOf(r) !== floorOf(room)) return false
    const ways = next.get(r.id) ?? []
    return ways.length > 0 && ways.every((w) => w.room === room.id)
  })
}

/** "about 30000", "at least 4.5", "4 to 6": a size asked, as written in the brief. */
function sizeAsked(about: number | null, least: number | null, most: number | null): string {
  return about !== null ? asWritten(about) : least !== null && most !== null ? `${asWritten(least)} to ${asWritten(most)}` : least !== null ? `at least ${asWritten(least)}` : `at most ${asWritten(most!)}`
}

function sizeHolds(drawn: number, about: number | null, least: number | null, most: number | null): boolean {
  return about !== null ? within(drawn, about) : (least === null || drawn >= least - tolerance('areaEqual')) && (most === null || drawn <= most + tolerance('areaEqual'))
}

/** ARE-69: at this many missed lines of one wish's sizes, they are said as one. */
export const GROUP_AT = 4

function roomWishLines(c: Context, wish: RoomWish): BriefLine[] {
  const out: BriefLine[] = []
  const { rooms: all, byUse } = wishRooms(c.plan, wish)
  // CNT-27: a stair or lift drawn on floor after floor is one shaft, counted once, as grid_areas counts it.
  const named = all.filter((room) => areaOf(c, room)?.countedWith === undefined)
  const once = named.length < all.length ? ', each stair or lift shaft counted once' : ''
  const what = `${wish.name !== null ? q(wish.name) : `rooms used as ${wish.use}`}${scopeWords(wish)}`
  // ARE-56: no room carries the name, so the rooms of its use are taken for it; the line says which, for the person to confirm.
  const taken = byUse ? ` (no room is named so; taken the room${all.length > 1 ? 's' : ''} used as ${wish.use}: ${all.map((r) => q(r.name.trim() === '' ? r.id : r.name.trim())).join(', ')})` : ''
  const avoid = wish.level === 'avoid'
  const word = avoid ? `${askedWord(wish.source)} to avoid` : askedWord(wish.source)
  if (c.empty) return [line('open', wish, 'room', `${what}: nothing drawn yet.`)]
  const sized = wish.area !== null || wish.atLeast !== null || wish.atMost !== null || wish.inside !== null || wish.diameter !== null
  const totalled = wish.totalArea !== null || wish.totalAtLeast !== null || wish.totalAtMost !== null
  const seated = seatingTargets(wish)
  if (wish.count !== null || wish.countAtLeast !== null || wish.countAtMost !== null) {
    // ARE-33: a count asked as at least, at most, between or exactly, always in rooms and never in m².
    const least = wish.countAtLeast
    const most = wish.countAtMost
    const holds = wish.count !== null ? named.length === wish.count : (least === null || named.length >= least) && (most === null || named.length <= most)
    const asked = wish.count !== null ? String(wish.count) : least !== null && most !== null ? `${least} to ${most}` : least !== null ? `at least ${least}` : `at most ${most}`
    out.push(line(stateOf(holds, wish.level), wish, 'rooms', `${what}${taken}: ${word} ${asked}, drawn ${named.length}${counted(named)}${once}.`, { asked, drawn: String(named.length), unit: 'rooms', parts: named.map((r) => ({ kind: 'room', id: r.id })) }))
  } else if ((!sized && !totalled && seated.length === 0) || named.length === 0) {
    const holds = named.length > 0
    const drawn = holds ? `drawn${named.length > 1 ? ` ${named.length} times` : ''}` : 'not drawn'
    out.push(line(stateOf(holds, wish.level), wish, 'room', `${what}${taken}: ${avoid ? `${word}, ` : `${word} for, `}${drawn}.`, { parts: named.map((r) => ({ kind: 'room', id: r.id })) }))
    if (!holds) return out
  }
  // ARE-67: the seats, desks and covers of the rooms the wish means, together.
  for (const target of seated) out.push(seatingLine(c, wish, what, taken, named, target))
  // ARE-69: each room with the rooms inside it, when the wish asks.
  const inner = new Map(named.map((room) => [room.id, wish.withInner ? innerRooms(c, room) : []]))
  const netOf = (room: FloorPlan['rooms'][number]): number | null => {
    const own = areaOf(c, room)?.net ?? null
    if (own === null) return null
    let sum = own
    for (const r of inner.get(room.id) ?? []) sum += areaOf(c, r)?.net ?? 0
    return sum
  }
  const label = (room: FloorPlan['rooms'][number]): string => {
    const own = q(room.name.trim() === '' ? room.id : room.name)
    const with_ = inner.get(room.id) ?? []
    return with_.length === 0 ? own : `${own} ${say('en', 'brief.inner.with', { rooms: with_.map((r) => q(r.name.trim() === '' ? r.id : r.name.trim())).join(', ') })}`
  }
  if (totalled) {
    // ARE-69: the rooms' net area together, one line.
    const asked = sizeAsked(wish.totalArea, wish.totalAtLeast, wish.totalAtMost)
    const nets = named.map(netOf)
    const drawn = nets.reduce<number>((sum, n) => sum + (n ?? 0), 0)
    const unmeasured = nets.filter((n) => n === null).length
    const parts = named.map((r): BriefPart => ({ kind: 'room', id: r.id }))
    const body = say('en', 'brief.total', { what, word, asked, drawn: n2(drawn), count: named.length, rooms: counted(named) })
    const left = unmeasured === 0 ? '' : ` ${say('en', 'brief.total.unmeasured', { count: unmeasured })}`
    out.push(line(stateOf(sizeHolds(drawn, wish.totalArea, wish.totalAtLeast, wish.totalAtMost), wish.level), wish, 'room', `${body}${taken}${once}${left}`, { asked, drawn: n2(drawn), unit: 'm²', parts }))
  }
  if (!sized) return out
  // Each room's own size; four or more missed the same way are said as one (ARE-69).
  const each: { name: string; kind: 'area' | 'inside' | 'diameter'; line: BriefLine; value: number | null }[] = []
  for (const room of named) {
    const name = label(room)
    const parts: BriefPart[] = [{ kind: 'room', id: room.id }, ...(inner.get(room.id) ?? []).map((r): BriefPart => ({ kind: 'room', id: r.id }))]
    const area = areaOf(c, room)
    if (wish.area !== null || wish.atLeast !== null || wish.atMost !== null) {
      const asked = sizeAsked(wish.area, wish.atLeast, wish.atMost)
      const net = netOf(room)
      if (net === null) {
        each.push({ name, kind: 'area', value: null, line: line('open', wish, 'room', `${name} area ${word} ${asked} m², but the room can't be measured: grid_check says why.`, { asked, unit: 'm²', parts }) })
      } else {
        each.push({ name, kind: 'area', value: net, line: line(stateOf(sizeHolds(net, wish.area, wish.atLeast, wish.atMost), wish.level), wish, 'room', `${name} area ${word} ${asked}, drawn ${n2(net)} m².`, { asked, drawn: n2(net), unit: 'm²', parts }) })
      }
    }
    if (wish.inside !== null) {
      const asked = `${asWritten(wish.inside[0])} x ${asWritten(wish.inside[1])}`
      const sizeNow = area?.size ?? null
      if (sizeNow === null) {
        each.push({ name, kind: 'inside', value: null, line: line('open', wish, 'room', `${name} inside ${word} ${asked} m, but the room is not a rectangle square to the drawing, so it has no one inside size.`, { asked, unit: 'm', parts }) })
      } else {
        const [a, b] = [...wish.inside].sort((x, y) => x - y)
        const [x, y] = [...sizeNow].sort((s, t) => s - t)
        const holds = within(x!, a!) && within(y!, b!)
        const drawn = `${n2(sizeNow[0])} x ${n2(sizeNow[1])}`
        each.push({ name, kind: 'inside', value: null, line: line(stateOf(holds, wish.level), wish, 'room', `${name} inside ${word} ${asked}, drawn ${drawn} m.`, { asked, drawn, unit: 'm', parts }) })
      }
    }
    if (wish.diameter !== null) {
      // ARE-69: a round room or courtyard by its diameter, the widest circle it holds.
      const asked = asWritten(wish.diameter)
      const surveyed = c.survey.byId.get(room.id)
      if (surveyed === undefined || surveyed.polygon.length < 3) {
        each.push({ name, kind: 'diameter', value: null, line: line('open', wish, 'room', say('en', 'brief.diameter.open', { room: name, word, asked }), { asked, unit: 'm', parts }) })
      } else {
        const drawn = measureRoom(surveyed).widestCircle
        each.push({ name, kind: 'diameter', value: drawn, line: line(stateOf(within(drawn, wish.diameter), wish.level), wish, 'room', say('en', 'brief.diameter', { room: name, word, asked, drawn: n2(drawn) }), { asked, drawn: n2(drawn), unit: 'm', parts }) })
      }
    }
  }
  for (const kind of ['area', 'inside', 'diameter'] as const) {
    const of = each.filter((e) => e.kind === kind)
    const missed = of.filter((e) => e.line.state === 'missed')
    if (missed.length < GROUP_AT) {
      out.push(...of.map((e) => e.line))
      continue
    }
    out.push(...of.filter((e) => e.line.state !== 'missed').map((e) => e.line))
    out.push(groupedLine(wish, what, word, kind, missed, named.length))
  }
  return out
}

/** ARE-69: one wish's sizes missed in many rooms, as one line: the rooms, and what was drawn, the same or from least to most. */
function groupedLine(wish: RoomWish, what: string, word: string, kind: 'area' | 'inside' | 'diameter', entries: readonly { readonly name: string; readonly line: BriefLine; readonly value: number | null }[], of: number): BriefLine {
  const missed = entries.map((e) => e.line)
  const values = entries.map((e) => e.value)
  const drawnAll = [...new Set(missed.map((l) => l.drawn ?? ''))]
  const numbers = values.filter((v): v is number => v !== null)
  const drawn = drawnAll.length === 1 ? drawnAll[0]! : numbers.length === values.length && numbers.length > 0 ? `${n2(Math.min(...numbers))} to ${n2(Math.max(...numbers))}` : drawnAll.slice(0, 3).join(', ')
  const unit = missed[0]!.unit ?? ''
  const asked = missed[0]!.asked ?? ''
  const names = entries.map((e) => e.name)
  const shown = ` (${names.slice(0, 12).join(', ')}${names.length > 12 ? `, and ${names.length - 12} more` : ''})`
  const body = say('en', drawnAll.length === 1 ? 'brief.group.same' : 'brief.group.range', { count: missed.length, of, what, kind, word, asked, drawn, unit, rooms: shown })
  // A size per room asked far above any drawn: the person likely meant the rooms together.
  const together = kind === 'area' && wish.area !== null && numbers.length > 0 && wish.area > 2 * Math.max(...numbers)
  const parts = missed.flatMap((l) => l.parts)
  return line('missed', wish, 'room', together ? `${body} ${say('en', 'brief.group.total')}` : body, { asked, drawn, unit, parts })
}

// ---------------------------------------------------------------------------------------------
// ARE-67: seats, desks and covers

interface SeatedTarget {
  readonly what: SeatingWhat
  readonly target: SeatingTarget
  /** True when the number was read from the wish's quote, which gave no target. */
  readonly fromQuote: boolean
}

/** A number of seats, covers or desks in the person's words: "24 seats", "a 12-cover room", "110 desks". */
const QUOTED_SEATING = /(\d{1,5})\s*-?\s*(seats?|seater|covers?|desks?)\b/i

/** A wish's seating targets; with none, the one its quote states, read as at least that many. */
function seatingTargets(wish: RoomWish): SeatedTarget[] {
  const given = SEATING_WHATS.flatMap((what): SeatedTarget[] => (wish[what] === null ? [] : [{ what, target: wish[what]!, fromQuote: false }]))
  if (given.length > 0 || wish.quote === null) return given
  const match = QUOTED_SEATING.exec(wish.quote)
  if (match === null) return []
  const word = match[2]!.toLowerCase()
  const what: SeatingWhat = word.startsWith('cover') ? 'covers' : word.startsWith('desk') ? 'desks' : 'seats'
  return [{ what, target: { exactly: null, atLeast: Number(match[1]), atMost: null }, fromQuote: true }]
}

const targetText = (t: SeatingTarget): string =>
  t.exactly !== null ? String(t.exactly) : t.atLeast !== null && t.atMost !== null ? `${t.atLeast} to ${t.atMost}` : t.atLeast !== null ? `at least ${t.atLeast}` : `at most ${t.atMost}`

const targetHolds = (t: SeatingTarget, n: number): boolean =>
  t.exactly !== null ? n === t.exactly : (t.atLeast === null || n >= t.atLeast) && (t.atMost === null || n <= t.atMost)

function seatingLine(c: Context, wish: RoomWish, what: string, taken: string, named: FloorPlan['rooms'], seated: SeatedTarget): BriefLine {
  const counted = c.seating()
  // A zone is counted in its room: a zone whose room the wish also means is not counted again.
  const ids = new Set(named.map((r) => r.id))
  const rooms = named.filter((room) => {
    const of = c.survey.byId.get(room.id)?.facts.zoneOf
    return of === undefined || !ids.has(of)
  })
  const each = rooms.map((room) => ({ room, n: (counted.zones.get(room.id) ?? counted.rooms.get(room.id))?.[seated.what] ?? 0 }))
  const drawn = each.reduce((sum, e) => sum + e.n, 0)
  const asked = targetText(seated.target)
  const word = wish.level === 'avoid' ? `${askedWord(wish.source)} to avoid` : askedWord(wish.source)
  const shown = each.length > 1 ? ` in ${each.length} rooms (${each.slice(0, 12).map((e) => `${q(e.room.name.trim() === '' ? e.room.id : e.room.name.trim())} ${e.n}`).join(', ')}${each.length > 12 ? `, and ${each.length - 12} more` : ''})` : ''
  const quoted = seated.fromQuote ? `, the number in its words (give ${seated.what} to set it)` : ''
  return line(stateOf(targetHolds(seated.target, drawn), wish.level), wish, 'room', `${what}${taken} ${seated.what} ${word} ${asked}${quoted}, drawn ${drawn}${shown}, counted from the furniture as grid_measure what=seats counts it.`, { asked, drawn: String(drawn), unit: seated.what, parts: rooms.map((r) => ({ kind: 'room', id: r.id })) })
}

/** The person's own target for the whole plan's seats, desks or covers. */
function seatingFigureLine(c: Context, wish: FigureWish & { readonly figure: SeatingWhat }): BriefLine {
  const asked = `at least ${wish.value}`
  const word = askedWord(wish.source)
  if (c.empty) return line('open', wish, wish.figure, `${wish.figure} in the plan ${word} ${asked}: nothing drawn yet.`, { asked, unit: wish.figure })
  const counted = c.seating()
  const drawn = counted.plan[wish.figure]
  const floors = counted.floors.size > 1 ? ` (${[...counted.floors.entries()].map(([floor, t]) => `${q(floor)} ${t[wish.figure]}`).join(', ')})` : ''
  return line(drawn >= wish.value ? 'met' : 'missed', wish, wish.figure, `${wish.figure} in the plan ${word} ${asked}, drawn ${drawn}${floors}, counted from the furniture as grid_measure what=seats counts it.`, { asked, drawn: String(drawn), unit: wish.figure })
}

// ---------------------------------------------------------------------------------------------
// The footprint

function footprintLines(c: Context, brief: Brief): BriefLine[] {
  const wish = brief.footprint
  if (wish === null) return []
  if (c.empty) return [{ ...line('open', wish, 'footprint', 'footprint: nothing drawn yet.'), where: 'footprint' }]
  const floors = planFloors(c.plan)
  const withWalls = floors.filter((floor) => c.plan.walls.some((w) => floorOf(w) === floor.id && w.virtual !== true))
  const ground = defaultFloor(c.plan)
  // The ground floor's footprint; a plan with no solid wall there falls back to its lowest floor with walls.
  const lowest = withWalls.find((floor) => floor.id === ground) ?? [...withWalls].sort((a, b) => a.level - b.level)[0]
  if (lowest === undefined) return [{ ...line('open', wish, 'footprint', 'footprint: no solid wall drawn yet.'), where: 'footprint' }]
  const out: BriefLine[] = []
  const word = askedWord(wish.source)
  // ARE-69: inside the outside walls (the rooms' faces, gross internal) when the brief says so.
  const inside = wish.measure === 'inside'
  const side = inside ? say('en', 'brief.footprint.inside') : say('en', 'brief.footprint.outside')
  if (wish.width !== null && wish.depth !== null) {
    const points: Vec2[] = inside
      ? c.survey.rooms.filter((r) => r.facts.floor === lowest.id).flatMap((r) => [...r.polygon])
      : c.plan.walls.filter((w) => floorOf(w) === lowest.id && w.virtual !== true && w.thickness > 0).flatMap((w) => {
        try {
          return wallPolygon(w)
        } catch {
          return []
        }
      })
    const box = computeBounds(points)
    const [a, b] = [wish.width, wish.depth].sort((x, y) => x - y)
    const [x, y] = [box.width, box.height].sort((s, t) => s - t)
    const asked = `${asWritten(wish.width)} x ${asWritten(wish.depth)}`
    const drawn = `${n2(box.width)} x ${n2(box.height)}`
    out.push(line(stateOf(within(x!, a!) && within(y!, b!), wish.level), wish, 'footprint', `footprint ${side} ${word} ${asked}, drawn ${drawn} m.`, { asked, drawn, unit: 'm' }))
  }
  if (wish.area !== null) {
    const floor = planAreas(c.survey, { floors: [lowest.id] }).floors[0]
    const gross = (inside ? floor?.grossInternal : floor?.grossExternal) ?? null
    const measure = inside ? MEASURES.grossInternal.name.toLowerCase() : MEASURES.grossExternal.name.toLowerCase()
    const asked = asWritten(wish.area)
    if (gross === null) out.push(line('open', wish, 'footprint', say('en', 'brief.footprint.unmeasured', { word, asked, measure }), { asked, unit: 'm²' }))
    else out.push(line(stateOf(within(gross, wish.area), wish.level), wish, 'footprint', `footprint area ${word} ${asked}, drawn ${n2(gross)} m² (${measure}).`, { asked, drawn: n2(gross), unit: 'm²' }))
  }
  return out.map((l) => ({ ...l, where: 'footprint' }))
}

// ---------------------------------------------------------------------------------------------
// Rooms that touch

function touchLines(c: Context, brief: Brief): BriefLine[] {
  return brief.touch.map((wish, i) => ({ ...touchLine(c, wish), where: `touch[${i}]` }))
}

function touchLine(c: Context, wish: Brief['touch'][number]): BriefLine {
  {
    const [first, second] = wish.rooms
    const pair = `${q(first)} and ${q(second)}`
    if (c.empty) return line('open', wish, 'touch', `${pair}: nothing drawn yet.`)
    const a = roomsNamed(c.plan, first)
    const b = roomsNamed(c.plan, second)
    const parts: BriefPart[] = [...a, ...b].map((r) => ({ kind: 'room', id: r.id }))
    const asked = wish.level === 'avoid' ? `${askedWord(wish.source)} not to touch` : `${askedWord(wish.source)} to touch`
    if (a.length === 0 || b.length === 0) {
      const missing = [a.length === 0 ? q(first) : null, b.length === 0 ? q(second) : null].filter((x) => x !== null).join(' and ')
      return line('missed', wish, 'touch', `${pair} ${asked}, but ${missing} is not drawn.`, { parts })
    }
    const touches = a.some((x) => b.some((y) => x.id !== y.id && (c.survey.facts.rooms.get(x.id)?.neighbours ?? []).includes(y.id)))
    if (wish.level !== 'avoid') return line(stateOf(touches, wish.level), wish, 'touch', `${pair} ${asked}, drawn ${touches ? 'sharing a wall' : 'apart'}.`, { parts })
    // ARE-48: rooms kept apart are judged by the ways between them too, not only a shared wall.
    const way = wayBetween(c, a, b)
    const direct = way !== null && way.through.length === 0
    const joined = touches || direct || (way !== null && way.open)
    const drawn = touches ? 'sharing a wall' : 'apart'
    // A shared wall already misses the wish: only a way straight through it is worth saying then.
    const shown = way === null || (touches && !direct) ? null : way
    const extra: BriefPart[] = shown === null ? [] : [...shown.through.map((id): BriefPart => ({ kind: 'room', id })), ...shown.vias.filter((v) => v.opening).map((v): BriefPart => ({ kind: 'opening', id: v.id }))]
    const said = shown === null ? '' : direct ? `, joined by ${viaWord(shown.vias[0]!)}` : shown.open ? `, but joined through ${shown.through.map((id) => q(roomName(c, id))).join(' and ')} by ${gapCount(shown.vias.length)}` : ', a door on every way between them'
    return line(stateOf(joined, wish.level), wish, 'touch', `${pair} ${asked}, drawn ${drawn}${said}.`, { parts: [...parts, ...extra] })
  }
}

interface Via {
  readonly id: string
  /** A door or opening of the plan; false for an open edge (a virtual wall). */
  readonly opening: boolean
  readonly door: boolean
}

interface WayBetween {
  /** The rooms between, in order, neither end included. */
  readonly through: readonly string[]
  readonly vias: readonly Via[]
  /** Every step an open gap: no door to close on the way. */
  readonly open: boolean
}

const roomName = (c: Context, id: string): string => {
  const name = c.plan.rooms.find((r) => r.id === id)?.name.trim() ?? ''
  return name === '' ? id : name
}

const viaWord = (via: Via): string => (via.door ? `door ${q(via.id)}` : via.opening ? `the open gap ${q(via.id)}` : 'an open edge')

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const gapCount = (n: number): string => `${COUNT_WORDS[n] ?? String(n)} open ${n === 1 ? 'gap' : 'gaps'}`

/**
 * ARE-48: the way between any room of `a` and any of `b` on their floor, by the door graph
 * (`wayGraph`, ARE-46's blocked doorways left out): first one through open gaps only, the fewest
 * rooms between; else any way, which then has a door on it. Null when no way joins them.
 */
function wayBetween(c: Context, a: FloorPlan['rooms'], b: FloorPlan['rooms']): WayBetween | null {
  const ends = new Set(b.map((r) => r.id))
  const floors = new Set(a.map((r) => floorOf(r)))
  let any: WayBetween | null = null
  for (const floor of [...floors].sort()) {
    const graph = wayGraph(c.survey, floor)
    const viaOf = (id: string): Via => {
      const opening = graph.openings.get(id)
      return { id, opening: opening !== undefined, door: opening !== undefined && opening.type === 'door' }
    }
    const search = (openOnly: boolean): WayBetween | null => {
      const starts = a.filter((r) => floorOf(r) === floor && !ends.has(r.id)).map((r) => r.id)
      const back = new Map<string, { from: string; via: string } | null>(starts.map((id) => [id, null]))
      const queue = [...starts]
      while (queue.length > 0) {
        const at = queue.shift()!
        if (ends.has(at)) {
          const rooms: string[] = []
          const vias: Via[] = []
          for (let here = at, step = back.get(here); step !== null && step !== undefined; here = step.from, step = back.get(here)) {
            vias.unshift(viaOf(step.via))
            rooms.unshift(step.from)
          }
          return { through: rooms.slice(1), vias, open: vias.every((v) => !v.door) }
        }
        for (const next of graph.next.get(at) ?? []) {
          // The outside is no room between: two rooms that each open onto the street are not joined by it.
          if (next.room === OUTSIDE || back.has(next.room) || (openOnly && viaOf(next.via).door)) continue
          back.set(next.room, { from: at, via: next.via })
          queue.push(next.room)
        }
      }
      return null
    }
    const open = search(true)
    if (open !== null) return open
    any ??= search(false)
  }
  return any
}

// ---------------------------------------------------------------------------------------------
// The person's own figures

// ARE-69: a figure for some rooms, uses, a fact or the ways between rooms.

interface FigureScope {
  /** The rooms named, of the uses, or carrying the fact; null when the figure names none of them. */
  readonly rooms: ReadonlySet<string> | null
  /** The rooms and doors on the ways named; null when it names none. */
  readonly routeRooms: ReadonlySet<string> | null
  readonly routeDoors: ReadonlySet<string> | null
  /** What it is for, in words: `the rooms used as ward, the way from "Ward 1" to "Theatre"`. */
  readonly said: string
  /** The ways Grid found no way along, as open lines. */
  readonly open: readonly BriefLine[]
}

/** The rooms and doors on the way with fewest rooms between two rooms, or from the entrance, on one floor; null when there is none. */
function routeWay(c: Context, route: { readonly from: string | null; readonly to: string }): { rooms: string[]; doors: string[] } | null {
  const to = roomsNamed(c.plan, route.to)
  if (to.length === 0) return null
  const floor = floorOf(to[0]!)
  const goal = new Set(to.filter((r) => floorOf(r) === floor).map((r) => r.id))
  const next = c.ways(floor)
  const from = route.from === null ? null : roomsNamed(c.plan, route.from).filter((r) => floorOf(r) === floor).map((r) => r.id)
  if (from !== null && from.length === 0) return null
  const ins = [...next].flatMap(([room, ways]) => ways.filter((w) => w.room === OUTSIDE).map((w) => ({ room, via: w.via })))
  const step = (room: string) => (room === OUTSIDE ? ins : (next.get(room) ?? []).filter((w) => w.room !== OUTSIDE))
  const starts = from ?? [OUTSIDE]
  const back = new Map<string, { from: string; via: string } | null>(starts.map((id) => [id, null]))
  const queue = [...starts]
  while (queue.length > 0) {
    const at = queue.shift()!
    if (goal.has(at)) {
      const rooms = [at]
      const doors: string[] = []
      for (let here = at, b = back.get(here); b !== null && b !== undefined; here = b.from, b = back.get(here)) {
        doors.push(b.via)
        if (b.from !== OUTSIDE) rooms.push(b.from)
      }
      return { rooms, doors }
    }
    for (const w of step(at)) {
      if (back.has(w.room)) continue
      back.set(w.room, { from: at, via: w.via })
      queue.push(w.room)
    }
  }
  return null
}

function figureScope(c: Context, wish: FigureWish): FigureScope | null {
  const named = wish.rooms.length > 0 || wish.uses.length > 0 || wish.fact !== null
  if (!named && wish.routes.length === 0) return null
  const rooms = named
    ? new Set([
      ...wish.rooms.flatMap((name) => roomsNamed(c.plan, name).map((r) => r.id)),
      ...c.plan.rooms.filter((r) => r.use !== undefined && wish.uses.includes(r.use)).map((r) => r.id),
      ...(wish.fact === null ? [] : c.plan.rooms.filter((r) => carries(r, wish.fact!)).map((r) => r.id)),
    ])
    : null
  const routeRooms = wish.routes.length > 0 ? new Set<string>() : null
  const routeDoors = wish.routes.length > 0 ? new Set<string>() : null
  const open: BriefLine[] = []
  const parts: string[] = []
  if (wish.rooms.length > 0) parts.push(say('en', 'brief.scope.rooms', { rooms: wish.rooms.map(q).join(', ') }))
  if (wish.uses.length > 0) parts.push(say('en', 'brief.scope.uses', { uses: wish.uses.join(', ') }))
  if (wish.fact !== null) parts.push(say('en', 'brief.scope.fact', { fact: wish.fact.value === null ? wish.fact.name : `${wish.fact.name} ${q(String(wish.fact.value))}` }))
  for (const route of wish.routes) {
    const way = route.from === null ? say('en', 'brief.scope.entrance', { to: q(route.to) }) : say('en', 'brief.scope.route', { from: q(route.from), to: q(route.to) })
    parts.push(way)
    const found = c.empty ? null : routeWay(c, route)
    if (found === null) {
      if (!c.empty) open.push(line('open', wish, wish.figure, say('en', 'brief.scope.noWay', { what: FIGURES[wish.figure].what, way })))
      continue
    }
    for (const r of found.rooms) routeRooms!.add(r)
    for (const d of found.doors) routeDoors!.add(d)
  }
  return { rooms, routeRooms, routeDoors, said: parts.join(', '), open }
}

/** ARE-69: the whole plan's efficiency, homes and storeys, each one line. */
function wholePlanLine(c: Context, wish: FigureWish): BriefLine {
  const figure = FIGURES[wish.figure]
  const exact = EXACT_FIGURES.includes(wish.figure)
  const limit = `${exact ? 'exactly' : figure.most ? 'at most' : 'at least'} ${asWritten(wish.value)}`
  const asked = `${askedWord(wish.source)} ${limit}`
  const unit = figure.unit
  if (c.empty) return line('open', wish, wish.figure, `${figure.what} ${asked}: nothing drawn yet.`, { asked: limit, unit })
  let drawn: number | null
  if (wish.figure === 'efficiency') {
    const share = lettableFigures(planAreas(c.survey)).efficiency
    drawn = share === null ? null : share * 100
  } else if (wish.figure === 'homes') {
    const flats = planFlats(c.plan).length
    drawn = flats > 0 ? flats : (c.plan.floors ?? []).reduce((sum, f) => sum + (f.homes ?? 0), 0)
  } else {
    const floors = planFloors(c.plan)
    const ground = floors.find((f) => f.id === defaultFloor(c.plan))?.level ?? 0
    drawn = floors.filter((f) => f.level >= ground).length
  }
  if (drawn === null) return line('open', wish, wish.figure, say('en', 'brief.figure.unmeasured', { what: figure.what, asked, measures: figure.measures }), { asked: limit, unit })
  const holds = exact ? Math.abs(drawn - wish.value) < 1e-9 : figure.most ? drawn <= wish.value + 1e-9 : drawn >= wish.value - 1e-9
  const shown = unit === '%' ? `${drawn.toFixed(1)}%` : `${drawn} ${unit}`
  return line(holds ? 'met' : 'missed', wish, wish.figure, `${figure.what} ${asked}, drawn ${shown} (${figure.measures}).`, { asked: limit, drawn: unit === '%' ? drawn.toFixed(1) : String(drawn), unit })
}

function figureLines(c: Context, wish: FigureWish): BriefLine[] {
  return figureWishLines(c, wish).map((l) => ({ ...l, where: `figures.${wish.figure}` }))
}

function figureWishLines(c: Context, wish: FigureWish): BriefLine[] {
  if (isSeatingFigure(wish.figure)) return [seatingFigureLine(c, wish as FigureWish & { readonly figure: SeatingWhat })]
  if (wish.figure === 'efficiency' || wish.figure === 'homes' || wish.figure === 'storeys') return [wholePlanLine(c, wish)]
  const figure = FIGURES[wish.figure]
  const limit = `${figure.most ? 'at most' : 'at least'} ${asWritten(wish.value)}`
  const asked = `${askedWord(wish.source)} ${limit}`
  if (c.empty) return [line('open', wish, wish.figure, `${figure.what} ${asked} m: nothing drawn yet.`, { asked: limit, unit: 'm' })]
  const short: BriefLine[] = []
  const eps = tolerance('lengthEqual')
  const roomName = (id: string): string => (c.survey.facts.rooms.has(id) ? q(c.survey.facts.rooms.get(id)!.name) : id)
  // ARE-69: only the rooms and doors the figure is for, when it names some.
  const scope = figureScope(c, wish)
  const roomIn = (id: string): boolean => scope === null || scope.rooms?.has(id) === true || scope.routeRooms?.has(id) === true
  const doorIn = (id: string, rooms: readonly string[]): boolean => scope === null || scope.routeDoors?.has(id) === true || (scope.rooms !== null && rooms.some((r) => scope.rooms!.has(r)))
  const sidesOf = (id: string): string[] => (c.survey.facts.openings.get(id)?.sides ?? []).flatMap((s) => (typeof s === 'object' ? [s.room] : []))
  if (scope !== null) short.push(...scope.open)
  if (wish.figure === 'corridor_width') {
    const corridors: BriefLine[] = []
    for (const room of c.survey.rooms) {
      if (room.facts.use !== 'corridor' || room.polygon.length < 3 || !roomIn(room.facts.id)) continue
      const { narrowest, at, widest } = corridorNarrowestOf(c.survey, room)
      const width = narrowest ?? widest
      const state = width + tolerance('joint') < wish.value ? 'missed' : 'met'
      const drawn = n2(width)
      const values = { room: { name: room.facts.name }, asked, drawn }
      const body = at === null
        ? say('en', 'brief.corridor.widest', values)
        : say('en', 'brief.corridor.narrowest', { ...values, x: at.x.toFixed(2), y: at.y.toFixed(2) })
      corridors.push(line(state, wish, wish.figure, body, { asked: limit, drawn, unit: 'm', parts: [{ kind: 'room', id: room.facts.id }] }))
    }
    if (corridors.length > 0) return [...short, ...corridors]
  } else if (wish.figure === 'door_width') {
    // ARE-27: every door judged as the access measure judges it, by the width the figure is for.
    const measure = wish.door ?? 'clear'
    const width = DOOR_MEASURE_NAMES[measure]
    for (const opening of c.survey.facts.openings.values()) {
      if (opening.type === 'window' || !doorIn(opening.id, sidesOf(opening.id))) continue
      const d = doorClearanceOf(c.survey, opening.id)
      if (d === null) continue
      const drawn = doorWidthFor(d, measure)
      if (drawn + tolerance('joint') >= wish.value) continue
      const between = opening.sides.map((s) => (typeof s === 'object' ? roomName(s.room) : s))
      const leaves = doorLeavesSaid(d, (v) => `${n2(v)} m`)
      const hole = measure === 'hole' ? '' : `, its hole ${n2(d.hole)} m`
      short.push(line('missed', wish, wish.figure, `${opening.type} ${q(opening.id)} (${between[0]} to ${between[1]}) ${width} ${asked}, drawn ${n2(drawn)} m${hole}${leaves === '' ? '' : `; ${leaves}`}.`, { asked: limit, drawn: n2(drawn), unit: 'm', parts: [{ kind: 'opening', id: opening.id }] }))
    }
  } else if (wish.figure === 'step') {
    // ARE-44: every change of level `what=access` reads: a door's sill, a raised floor between
    // rooms (their floor offsets) and the ground outside the entrance (site.ground).
    const miss = (body: string, drawn: number, part: BriefPart): void => {
      short.push(line('missed', wish, wish.figure, body, { asked: limit, drawn: n2(drawn), unit: 'm', parts: [part] }))
    }
    for (const floor of c.survey.facts.floors) {
      for (const opening of floor.openings) {
        if (opening.type === 'window' || opening.sill <= wish.value + eps || !doorIn(opening.id, sidesOf(opening.id))) continue
        miss(`${opening.type} ${q(opening.id)} step ${asked}, drawn ${n2(opening.sill)} m above its floor.`, opening.sill, { kind: 'opening', id: opening.id })
      }
    }
    for (const floor of c.survey.facts.floors) {
      for (const step of planSteps(planForFloor(c.plan, floor.id))) {
        if (step.rise <= wish.value + eps) continue
        if (step.openingId === null ? !(roomIn(step.lower) || roomIn(step.upper)) : !doorIn(step.openingId, [step.lower, step.upper])) continue
        const between = [step.lower, step.upper].map(roomName)
        const at = step.openingId === null ? 'along the line between them' : `at ${c.survey.facts.openings.get(step.openingId)?.type ?? 'door'} ${q(step.openingId)}`
        const part: BriefPart = step.openingId === null ? { kind: 'room', id: step.upper } : { kind: 'opening', id: step.openingId }
        miss(`floor ${between[0]} to ${between[1]} step ${asked}, drawn ${n2(step.rise)} m, ${at}, the floor of ${between[1]} standing higher.`, step.rise, part)
      }
    }
    // The ground outside: only when the plan states it, as access does.
    const ground = groundLevel(c.plan, floorElevations(c.plan))
    const entrance = ground.stated ? entranceOf(c.survey) : null
    if (entrance !== null) {
      const inside = entryWays(c.survey, wayGraph(c.survey, entrance.floor).next).filter((e) => entrance.doors.includes(e.via))
      const seen = new Set<string>()
      for (const e of inside) {
        if (seen.has(e.via) || !doorIn(e.via, [e.through ?? e.room])) continue
        seen.add(e.via)
        const room = c.plan.rooms.find((r) => r.id === (e.through ?? e.room))
        // CNT-49: on a slope, the ground at the door.
        const door = c.plan.openings.find((o) => o.id === e.via)
        const at = ground.surface === null || door === undefined ? null : openingPoint(c.plan, door)
        const above = (at === null ? (ground.above.get(entrance.floor) ?? 0) : ground.aboveAt(entrance.floor, at)) + (room === undefined ? 0 : roomFloorOffset(room))
        if (Math.abs(above) <= wish.value + eps) continue
        miss(`${c.survey.facts.openings.get(e.via)?.type ?? 'door'} ${q(e.via)} step ${asked}, drawn ${n2(Math.abs(above))} m ${above > 0 ? 'up' : 'down'} from the ground outside to the floor inside.`, Math.abs(above), { kind: 'opening', id: e.via })
      }
    }
  } else if (wish.figure === 'ceiling_height') {
    for (const room of c.plan.rooms) {
      if (!roomIn(room.id)) continue
      const height = roomHeight(c.plan, room.id).value
      if (height === null || height >= wish.value - eps) continue
      short.push(line('missed', wish, wish.figure, `${q(room.name)} ceiling height ${asked}, drawn ${n2(height)} m.`, { asked: limit, drawn: n2(height), unit: 'm', parts: [{ kind: 'room', id: room.id }] }))
    }
  } else {
    for (const room of c.survey.rooms) {
      if (room.polygon.length < 3 || !roomIn(room.facts.id)) continue
      const drawn = measureRoom(room).widestCircle
      if (drawn >= wish.value - tolerance('noLength')) continue
      const body = `${q(room.facts.name)} turning circle ${asked}, drawn ${n2(drawn)} m, the widest circle it holds.`
      short.push(line('missed', wish, wish.figure, body, { asked: limit, drawn: n2(drawn), unit: 'm', parts: [{ kind: 'room', id: room.facts.id }] }))
    }
  }
  if (short.some((l) => l.state === 'missed')) return short
  const measures = wish.figure === 'door_width' ? `${DOOR_MEASURE_NAMES[wish.door ?? 'clear']}: ${DOOR_MEASURE_RULES[wish.door ?? 'clear']}` : figure.measures
  const scoped = scope === null || scope.said === '' ? '' : ` ${say('en', 'brief.scope.for', { scope: scope.said })}`
  return [...short, line('met', wish, wish.figure, `${figure.what} ${asked} m${scoped}: nothing drawn is short of it (${measures}).`, { asked: limit, unit: 'm' })]
}

// ---------------------------------------------------------------------------------------------
// A size written in a room's name (lab R-14)

/** A size a room's name states: an area in square metres, square feet or mats. */
export interface NamedSize {
  readonly value: number
  readonly unit: 'm²' | 'ft²' | 'mats'
}

const NUMBER = '(\\d+(?:[.,]\\d+)?)'
const NAMED_SIZES: ReadonlyArray<readonly [RegExp, NamedSize['unit']]> = [
  [new RegExp(`${NUMBER}\\s*-?\\s*(?:tatami|jō|jo|mats?|畳)(?![a-z])`, 'i'), 'mats'],
  [new RegExp(`${NUMBER}\\s*(?:m²|m2|sq\\.?\\s?m|sqm|square met(?:re|er)s?)(?![a-z0-9])`, 'i'), 'm²'],
  [new RegExp(`${NUMBER}\\s*(?:ft²|ft2|sq\\.?\\s?ft|sqft|square f(?:ee|oo)t)(?![a-z0-9])`, 'i'), 'ft²'],
]

/** The size a room's name states, or null. */
export function namedSize(name: string): NamedSize | null {
  for (const [pattern, unit] of NAMED_SIZES) {
    const match = pattern.exec(name)
    if (match) {
      const value = Number(match[1]!.replace(',', '.'))
      if (Number.isFinite(value) && value > 0) return { value, unit }
    }
  }
  return null
}

const FT2 = 0.3048 * 0.3048

function nameLines(c: Context, brief: Brief | null): BriefLine[] {
  // A room the brief gives a size for is held to the brief, not to its name.
  const sizedByBrief = new Set<string>()
  for (const wish of brief?.rooms ?? []) {
    if (wish.name === null || (wish.area === null && wish.atLeast === null && wish.atMost === null && wish.inside === null)) continue
    for (const room of wishRooms(c.plan, wish).rooms) sizedByBrief.add(room.id)
  }
  const out: BriefLine[] = []
  const none = { level: null, source: null, quote: null }
  for (const room of c.plan.rooms) {
    if (sizedByBrief.has(room.id)) continue
    const size = namedSize(room.name)
    const net = areaOf(c, room)?.net ?? null
    if (size === null || net === null) continue
    const drawn = size.unit === 'mats' ? net / MAT_AREA : size.unit === 'ft²' ? net / FT2 : net
    if (Math.abs(drawn - size.value) <= size.value * tolerance('nameSize')) continue
    const unit = size.unit === 'mats' ? 'mats' : size.unit
    const how = size.unit === 'mats' ? ` (${n2(net)} m², a mat taken as ${n2(MAT.width)} × ${n2(MAT.length)} m)` : size.unit === 'ft²' ? ` (${n2(net)} m²)` : ''
    out.push(line('differs', none, 'name', `${q(room.name)} is named ${asWritten(size.value)} ${unit}; drawn ${n2(drawn)} ${unit}${how}, ${MEASURES.net.name.toLowerCase()}.`, { asked: asWritten(size.value), drawn: n2(drawn), unit, parts: [{ kind: 'room', id: room.id }] }))
  }
  return out
}

// ---------------------------------------------------------------------------------------------

/** Every line of the brief against the plan, then the sizes in room names it does not cover. No plan yet is a plan with nothing drawn. */
export function briefLines(plan: FloorPlan | null, brief: Brief | null): BriefLine[] {
  const c = contextOf(plan ?? { version: '1', units: 'm', walls: [], rooms: [], openings: [] } as unknown as FloorPlan)
  const lines: BriefLine[] = []
  if (brief !== null) {
    lines.push(...roomLines(c, brief), ...footprintLines(c, brief), ...touchLines(c, brief))
    for (const wish of brief.figures) if (!isSiteFigure(wish.figure)) lines.push(...figureLines(c, wish))
    // BRF-4: the person's site limits, measured on the plan as drawn, massing or walls.
    const site = brief.figures.filter((wish) => isSiteFigure(wish.figure))
    if (site.length > 0) {
      for (const limit of siteLimits(c.plan, site, METRES)) {
        if (limit.limit === 'setback') continue
        const wish = site.find((w) => w.figure === limit.limit)!
        const state: BriefState = limit.state === 'met' ? 'met' : limit.state === 'missed' ? 'missed' : 'open'
        lines.push({ ...line(state, wish, wish.figure, limit.text, { asked: `${limit.most ? 'at most' : 'at least'} ${asWritten(limit.allowed)}`, drawn: limit.used === null ? null : n2(limit.used), unit: limit.unit }), where: `figures.${wish.figure}` })
      }
    }
    brief.open.forEach((wish, i) => lines.push({ ...line('open', { level: null, source: 'given', quote: wish.quote }, 'open', `${q(wish.quote)}${wish.about === null ? '' : `: still to ask, ${wish.about}`}.`), where: `open[${i}]` }))
  }
  lines.push(...nameLines(c, brief))
  return lines
}

/** Missed, open and differing lines before the met ones, each kind in the brief's order. */
const ORDER: Readonly<Record<BriefState, number>> = { missed: 0, differs: 1, open: 2, met: 3 }

/**
 * The lines as text: a heading, then every line (the person's figures under their heading),
 * at most `max` of them with a line saying how many more there are. With `quotes`, each line
 * is followed by the person's words.
 */
export function briefText(lines: readonly BriefLine[], file: string | null, options: { readonly max?: number; readonly quotes?: boolean } = {}): string[] {
  if (lines.length === 0) return []
  const sorted = [...lines].sort((a, b) => ORDER[a.state] - ORDER[b.state])
  const max = options.max ?? Infinity
  const shown = sorted.slice(0, max)
  const own = (l: BriefLine): boolean => l.wish in FIGURES
  const out: string[] = [file === null ? 'Sizes in room names, against the drawing (there is no brief yet):' : `The brief (${q(file)}), each line ${BRIEF_RULE}`]
  const say = (l: BriefLine): string => `  ${l.text}${options.quotes === true && l.quote !== null && l.wish !== 'open' ? ` Their words: ${q(l.quote)}.` : ''}`
  out.push(...shown.filter((l) => !own(l)).map(say))
  const figures = shown.filter(own)
  if (figures.length > 0) out.push(`  ${FIGURES_HEADING}`, ...figures.map((l) => `  ${say(l)}`))
  if (sorted.length > shown.length) out.push(`  And ${sorted.length - shown.length} more lines: grid_write_brief with no brief lists them all.`)
  if (file !== null) out.push(`  ${MET_IS_NOT_ALLOWED}`)
  return out
}
