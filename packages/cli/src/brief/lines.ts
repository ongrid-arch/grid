/**
 * BRF-1: each wish of the brief against the drawing, as a line met or missed, in words such as
 * "asked 4.5, drawn 11.93 m²", never as a score.
 *
 * The drawing is measured here as everywhere else, so a target and the drawing are measured by
 * the same rule: a room's net area is ARE-9's (`planAreas`, `MEASURES.net`), its inside size the
 * one `grid_areas` gives, a footprint the lowest floor's gross external area and the outside of
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
import { floorElevations, floorOf, groundLevel, MEASURES, planFloors, planForFloor, planSteps, roomFloorOffset, tolerance, wallPolygon, computeBounds, type FloorPlan, type Vec2 } from '@ongrid/floorplan/geometry'
import { smallMetres } from '../quantities/units'
import { planAreas, type RoomArea } from '../quantities/areas'
import { measureRoom, roomHeight } from '../quantities/measure'
import { corridorNarrowestOf, entranceOf } from '../quantities/access'
import { entryWays, OUTSIDE, wayGraph } from '../quantities/measure'
import { doorClearanceOf, doorLeavesSaid, doorWidthFor, DOOR_MEASURE_NAMES, DOOR_MEASURE_RULES } from '../quantities/doorWidth'
import { surveyPlan, type Survey } from '../quantities/survey'
import { METRES } from '@ongrid/floorplan/types/units'
import { isSiteFigure, siteLimits } from '../quantities/limits'
import { FIGURES, FIGURES_HEADING, type Brief, type FigureWish, type Level, type Source } from './brief'

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
}

/** The rule each kind of figure is measured by, in a line. */
export const BRIEF_RULE = 'measured as the drawing is: areas and inside sizes to the faces of the walls, as grid_areas gives them, widths and circles as grid_measure does, and a footprint to the outside face of the lowest floor\'s walls.'

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

/** The rooms a name means: by name, any case, the name numbered ("Consult 1" for "Consult"), or by id. */
function roomsNamed(plan: FloorPlan, name: string): FloorPlan['rooms'] {
  const byName = plan.rooms.filter((room) => same(room.name, name) || numberedAs(room.name, name))
  return byName.length > 0 ? byName : plan.rooms.filter((room) => room.id === name)
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
}

const key = (floor: string, id: string): string => `${floor}\u0000${id}`

function contextOf(plan: FloorPlan): Context {
  const survey = surveyPlan(plan)
  const areas = new Map<string, RoomArea>()
  for (const floor of planAreas(survey).floors) for (const room of floor.rooms) areas.set(key(floor.floor, room.id), room)
  return { plan, survey, areas, empty: plan.rooms.length === 0 }
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
  }
}

/** Met or missed, as the level asks: `avoid` is met when the drawing does not hold it. */
const stateOf = (holds: boolean, level: Level): BriefState => ((level === 'avoid' ? !holds : holds) ? 'met' : 'missed')

// ---------------------------------------------------------------------------------------------
// Rooms

function roomLines(c: Context, brief: Brief): BriefLine[] {
  const out: BriefLine[] = []
  for (const wish of brief.rooms) {
    const all = wish.name !== null ? roomsNamed(c.plan, wish.name) : c.plan.rooms.filter((room) => room.use === wish.use)
    // CNT-27: a stair or lift drawn on floor after floor is one shaft, counted once, as grid_areas counts it.
    const named = all.filter((room) => areaOf(c, room)?.countedWith === undefined)
    const once = named.length < all.length ? ', each stair or lift shaft counted once' : ''
    const what = wish.name !== null ? q(wish.name) : `rooms used as ${wish.use}`
    const avoid = wish.level === 'avoid'
    const word = avoid ? `${askedWord(wish.source)} to avoid` : askedWord(wish.source)
    if (c.empty) {
      out.push(line('open', wish, 'room', `${what}: nothing drawn yet.`))
      continue
    }
    const sized = wish.area !== null || wish.atLeast !== null || wish.atMost !== null || wish.inside !== null
    if (wish.count !== null || wish.countAtLeast !== null || wish.countAtMost !== null) {
      // ARE-33: a count asked as at least, at most, between or exactly, always in rooms and never in m².
      const least = wish.countAtLeast
      const most = wish.countAtMost
      const holds = wish.count !== null ? named.length === wish.count : (least === null || named.length >= least) && (most === null || named.length <= most)
      const asked = wish.count !== null ? String(wish.count) : least !== null && most !== null ? `${least} to ${most}` : least !== null ? `at least ${least}` : `at most ${most}`
      out.push(line(stateOf(holds, wish.level), wish, 'rooms', `${what}: ${word} ${asked}, drawn ${named.length}${counted(named)}${once}.`, { asked, drawn: String(named.length), unit: 'rooms', parts: named.map((r) => ({ kind: 'room', id: r.id })) }))
    } else if (!sized || named.length === 0) {
      const holds = named.length > 0
      const drawn = holds ? `drawn${named.length > 1 ? ` ${named.length} times` : ''}` : 'not drawn'
      out.push(line(stateOf(holds, wish.level), wish, 'room', `${what}: ${avoid ? `${word}, ` : `${word} for, `}${drawn}.`, { parts: named.map((r) => ({ kind: 'room', id: r.id })) }))
      if (!holds) continue
    }
    if (!sized) continue
    for (const room of named) {
      const name = q(room.name.trim() === '' ? room.id : room.name)
      const parts: BriefPart[] = [{ kind: 'room', id: room.id }]
      const area = areaOf(c, room)
      if (wish.area !== null || wish.atLeast !== null || wish.atMost !== null) {
        const asked = wish.area !== null ? asWritten(wish.area) : wish.atLeast !== null && wish.atMost !== null ? `${asWritten(wish.atLeast)} to ${asWritten(wish.atMost)}` : wish.atLeast !== null ? `at least ${asWritten(wish.atLeast)}` : `at most ${asWritten(wish.atMost!)}`
        if (area?.net === null || area?.net === undefined) {
          out.push(line('open', wish, 'room', `${name} area ${word} ${asked} m², but the room can't be measured: grid_check says why.`, { asked, unit: 'm²', parts }))
        } else {
          const net = area.net
          const holds = wish.area !== null ? within(net, wish.area)
            : (wish.atLeast === null || net >= wish.atLeast - tolerance('areaEqual')) && (wish.atMost === null || net <= wish.atMost + tolerance('areaEqual'))
          out.push(line(stateOf(holds, wish.level), wish, 'room', `${name} area ${word} ${asked}, drawn ${n2(net)} m².`, { asked, drawn: n2(net), unit: 'm²', parts }))
        }
      }
      if (wish.inside !== null) {
        const asked = `${asWritten(wish.inside[0])} x ${asWritten(wish.inside[1])}`
        const sizeNow = area?.size ?? null
        if (sizeNow === null) {
          out.push(line('open', wish, 'room', `${name} inside ${word} ${asked} m, but the room is not a rectangle square to the drawing, so it has no one inside size.`, { asked, unit: 'm', parts }))
        } else {
          const [a, b] = [...wish.inside].sort((x, y) => x - y)
          const [x, y] = [...sizeNow].sort((s, t) => s - t)
          const holds = within(x!, a!) && within(y!, b!)
          const drawn = `${n2(sizeNow[0])} x ${n2(sizeNow[1])}`
          out.push(line(stateOf(holds, wish.level), wish, 'room', `${name} inside ${word} ${asked}, drawn ${drawn} m.`, { asked, drawn, unit: 'm', parts }))
        }
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// The footprint

function footprintLines(c: Context, brief: Brief): BriefLine[] {
  const wish = brief.footprint
  if (wish === null) return []
  if (c.empty) return [line('open', wish, 'footprint', 'footprint: nothing drawn yet.')]
  const floors = planFloors(c.plan)
  const withWalls = floors.filter((floor) => c.plan.walls.some((w) => floorOf(w) === floor.id && w.virtual !== true))
  const lowest = [...withWalls].sort((a, b) => a.level - b.level)[0]
  if (lowest === undefined) return [line('open', wish, 'footprint', 'footprint: no solid wall drawn yet.')]
  const out: BriefLine[] = []
  const word = askedWord(wish.source)
  if (wish.width !== null && wish.depth !== null) {
    const points: Vec2[] = c.plan.walls.filter((w) => floorOf(w) === lowest.id && w.virtual !== true && w.thickness > 0).flatMap((w) => {
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
    out.push(line(stateOf(within(x!, a!) && within(y!, b!), wish.level), wish, 'footprint', `footprint outside ${word} ${asked}, drawn ${drawn} m.`, { asked, drawn, unit: 'm' }))
  }
  if (wish.area !== null) {
    const gross = planAreas(c.survey, { floors: [lowest.id] }).floors[0]?.grossExternal ?? null
    const asked = asWritten(wish.area)
    if (gross === null) out.push(line('open', wish, 'footprint', `footprint area ${word} ${asked} m², but the lowest floor's gross external area can't be worked out: grid_areas says why.`, { asked, unit: 'm²' }))
    else out.push(line(stateOf(within(gross, wish.area), wish.level), wish, 'footprint', `footprint area ${word} ${asked}, drawn ${n2(gross)} m² (${MEASURES.grossExternal.name.toLowerCase()}).`, { asked, drawn: n2(gross), unit: 'm²' }))
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Rooms that touch

function touchLines(c: Context, brief: Brief): BriefLine[] {
  return brief.touch.map((wish) => {
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
  })
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

function figureLines(c: Context, wish: FigureWish): BriefLine[] {
  const figure = FIGURES[wish.figure]
  const limit = `${figure.most ? 'at most' : 'at least'} ${asWritten(wish.value)}`
  const asked = `${askedWord(wish.source)} ${limit}`
  if (c.empty) return [line('open', wish, wish.figure, `${figure.what} ${asked} m: nothing drawn yet.`, { asked: limit, unit: 'm' })]
  const short: BriefLine[] = []
  const eps = tolerance('lengthEqual')
  const roomName = (id: string): string => (c.survey.facts.rooms.has(id) ? q(c.survey.facts.rooms.get(id)!.name) : id)
  if (wish.figure === 'door_width') {
    // ARE-27: every door judged as the access measure judges it, by the width the figure is for.
    const measure = wish.door ?? 'clear'
    const width = DOOR_MEASURE_NAMES[measure]
    for (const opening of c.survey.facts.openings.values()) {
      if (opening.type === 'window') continue
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
        if (opening.type === 'window' || opening.sill <= wish.value + eps) continue
        miss(`${opening.type} ${q(opening.id)} step ${asked}, drawn ${n2(opening.sill)} m above its floor.`, opening.sill, { kind: 'opening', id: opening.id })
      }
    }
    for (const floor of c.survey.facts.floors) {
      for (const step of planSteps(planForFloor(c.plan, floor.id))) {
        if (step.rise <= wish.value + eps) continue
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
        if (seen.has(e.via)) continue
        seen.add(e.via)
        const room = c.plan.rooms.find((r) => r.id === (e.through ?? e.room))
        const above = (ground.above.get(entrance.floor) ?? 0) + (room === undefined ? 0 : roomFloorOffset(room))
        if (Math.abs(above) <= wish.value + eps) continue
        miss(`${c.survey.facts.openings.get(e.via)?.type ?? 'door'} ${q(e.via)} step ${asked}, drawn ${n2(Math.abs(above))} m ${above > 0 ? 'up' : 'down'} from the ground outside to the floor inside.`, Math.abs(above), { kind: 'opening', id: e.via })
      }
    }
  } else if (wish.figure === 'ceiling_height') {
    for (const room of c.plan.rooms) {
      const height = roomHeight(c.plan, room.id).value
      if (height === null || height >= wish.value - eps) continue
      short.push(line('missed', wish, wish.figure, `${q(room.name)} ceiling height ${asked}, drawn ${n2(height)} m.`, { asked: limit, drawn: n2(height), unit: 'm', parts: [{ kind: 'room', id: room.id }] }))
    }
  } else {
    const corridor = wish.figure === 'corridor_width'
    const wanted = wish.rooms.length > 0 ? new Set(wish.rooms.flatMap((name) => roomsNamed(c.plan, name).map((r) => r.id))) : null
    for (const room of c.survey.rooms) {
      if (room.polygon.length < 3) continue
      if (corridor ? room.facts.use !== 'corridor' : wanted !== null && !wanted.has(room.facts.id)) continue
      // A corridor is judged by its narrowest point from end to end, the figure `what=access` gives.
      const found = corridor ? corridorNarrowestOf(c.survey, room) : null
      const drawn = found === null ? measureRoom(room).widestCircle : (found.narrowest ?? found.widest)
      if (drawn >= wish.value - tolerance('noLength')) continue
      const place = found === null ? null : found.narrowest === null ? ', the widest circle it holds, for Grid finds no two ends' : `, at its narrowest, at (${found.at!.x.toFixed(2)}, ${found.at!.y.toFixed(2)})`
      const body = `${q(room.facts.name)} ${corridor ? 'corridor width' : 'turning circle'} ${asked}, drawn ${n2(drawn)} m${place ?? ', the widest circle it holds'}.`
      short.push(line('missed', wish, wish.figure, body, { asked: limit, drawn: n2(drawn), unit: 'm', parts: [{ kind: 'room', id: room.facts.id }] }))
    }
  }
  if (short.length > 0) return short
  const measures = wish.figure === 'door_width' ? `${DOOR_MEASURE_NAMES[wish.door ?? 'clear']}: ${DOOR_MEASURE_RULES[wish.door ?? 'clear']}` : figure.measures
  return [line('met', wish, wish.figure, `${figure.what} ${asked} m: nothing drawn is short of it (${measures}).`, { asked: limit, unit: 'm' })]
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
    for (const room of roomsNamed(c.plan, wish.name)) sizedByBrief.add(room.id)
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
        lines.push(line(state, wish, wish.figure, limit.text, { asked: `${limit.most ? 'at most' : 'at least'} ${asWritten(limit.allowed)}`, drawn: limit.used === null ? null : n2(limit.used), unit: limit.unit }))
      }
    }
    for (const wish of brief.open) lines.push(line('open', { level: null, source: 'given', quote: wish.quote }, 'open', `${q(wish.quote)}${wish.about === null ? '' : `: still to ask, ${wish.about}`}.`))
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
