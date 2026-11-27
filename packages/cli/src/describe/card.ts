/**
 * `grid describe` in three lengths, for a person or for an agent.
 *
 * - `line`: one line, what the plan is and where it is entered from outside.
 * - `rooms`: the line, then each room's inside size, position and neighbours, and every
 *   opening in it with the room on its other side and its distance to the two inside
 *   corners of that side of the room.
 * - `walls`: the rooms, then every wall with its openings, each with the rooms on its two
 *   sides.
 * - `walk` (VEW-9): the plan walked room by room from its way in, standing in each doorway;
 *   `walk.ts` works it out and words it, and `describePlan` sends it there. The agent's form leaves openings and neighbours out of its room lines, to stay
 *   short: every opening under its wall names the rooms it joins.
 *
 * The person's form names rooms and floors by their names and never prints an id: ids are
 * the plan's own handles, which an agent needs to edit it and a person never does. The
 * agent's form is terse and carries every id.
 *
 * What the plan cannot say (north when it states none, the kind of building, how floors
 * connect, which rooms make a flat) is said as such. A floor laid out like an earlier one is said once. Wall and
 * sill heights are one line: the usual height and the exceptions.
 *
 * The cards check nothing, and say so. `describePlan` puts the label "General guidance, not
 * your local rules" first, as every report of Grid's does (MSG-3). No line says a plan
 * complies.
 */
import { decimalFor, DEFAULT_LANGUAGE, joined, name, num, say, sayValue, labelOfUse, type Language, type MessageKey, type SayOptions, type Values } from '@ongrid/floorplan/messages'
import { OUTDOOR_KINDS, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { slopeText } from '@ongrid/floorplan/geometry'
import type { Beyond, CornerGap, FloorFacts, HeightException, OpeningFacts, OpeningSide, PlanFacts, RoomFacts } from './facts'
import type { RoomForm } from './sides'

export const DESCRIBE_LENGTHS = ['line', 'rooms', 'walls', 'walk'] as const
export type DescribeLength = (typeof DESCRIBE_LENGTHS)[number]

export const DESCRIBE_AUDIENCES = ['person', 'agent'] as const
export type DescribeAudience = (typeof DESCRIBE_AUDIENCES)[number]

/** A length in metres: two decimals at most, no trailing zeros. */
function m(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** An area in square metres, one decimal for a person. */
function m2(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1)
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * MSG-11: the language the person's form is written in, and its decimal mark. The agent's form
 * is a terse format of codes, ids and figures with a point, as its KEY line spells it, and
 * stays as it is in every language: the agent retells it in the person's language.
 */
export interface Words {
  readonly language: Language
  readonly options: SayOptions
}

const ENGLISH: Words = { language: DEFAULT_LANGUAGE, options: {} }

/** A key said in the card's language. */
function t(w: Words, key: MessageKey, values?: Values): string {
  return say(w.language, key, values, w.options)
}

/** A key with a count, `.one` or `.many` by it. */
function countOf(w: Words, key: string, count: number, values: Values = {}): string {
  return t(w, `${key}.${count === 1 ? 'one' : 'many'}` as MessageKey, { count, ...values })
}

/** A length in metres as the person reads it, with the language's decimal mark. */
function fig(w: Words, value: number): string {
  return sayValue(w.language, num(m(value)), w.options)
}

/** An area in square metres, one decimal, with the language's decimal mark. */
function area(w: Words, value: number): string {
  return sayValue(w.language, num(m2(value)), w.options)
}

const cap = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

/** `a, b and c`, with the language's words. */
function listed(w: Words, items: readonly string[]): string {
  return sayValue(w.language, joined(items, 'join.comma', 'join.and'), w.options)
}

/** "3 rooms", or "2 rooms and 3 zones" on a floor with zones (CNT-8), for the agent's form. */
function roomCount(floor: FloorFacts): string {
  const zones = floor.rooms.filter((room) => room.zoneOf !== undefined).length
  const rooms = plural(floor.rooms.length - zones, 'room')
  return zones === 0 ? rooms : `${rooms} and ${plural(zones, 'zone')}`
}

/** The same in the person's language. */
function roomCountSaid(w: Words, floor: FloorFacts): string {
  const zones = floor.rooms.filter((room) => room.zoneOf !== undefined).length
  const rooms = countOf(w, 'describe.count.room', floor.rooms.length - zones)
  return zones === 0 ? rooms : t(w, 'describe.roomsAndZones', { rooms, zones: countOf(w, 'describe.count.zone', zones) })
}

/** At most `most` items, and how many more. */
function capped(w: Words, items: readonly string[], most: number): string[] {
  return items.length <= most ? [...items] : [...items.slice(0, most - 1), t(w, 'describe.more', { count: items.length - most + 1 })]
}

const isSide = (side: OpeningSide | Beyond): side is OpeningSide => typeof side !== 'string'

/** Names for a person: a room by its name, numbered when two on a floor share it. */
export class PersonNames {
  private readonly rooms = new Map<string, string>()
  private readonly floors = new Map<string, string>()

  constructor(facts: PlanFacts, private readonly w: Words) {
    facts.floors.forEach((floor, i) => {
      this.floors.set(floor.id, floor.name ?? t(w, 'describe.floor.unnamed', { n: i + 1 }))
      const seen = new Map<string, number>()
      const total = new Map<string, number>()
      for (const room of floor.rooms) total.set(room.name.trim(), (total.get(room.name.trim()) ?? 0) + 1)
      for (const room of floor.rooms) {
        const name = room.name.trim() || t(w, 'describe.room.unnamed')
        const n = (seen.get(name) ?? 0) + 1
        seen.set(name, n)
        this.rooms.set(room.id, (total.get(room.name.trim()) ?? 0) > 1 ? `${name} (${n})` : name)
      }
    })
  }

  room(id: string): string {
    return this.rooms.get(id) ?? t(this.w, 'describe.room.some')
  }

  floor(id: string): string {
    return this.floors.get(id) ?? t(this.w, 'describe.floor.some')
  }
}

interface Way {
  readonly room: string
  readonly opening: OpeningFacts
}

/** Doors and doorless openings that lead in from outside, with the room they lead into. */
function waysIn(facts: PlanFacts): Way[] {
  const ways: Way[] = []
  for (const floor of facts.floors) {
    // ARE-63: a door onto the common parts is no way in from outside, as the check reads it.
    const common = new Set((floor.commonIn ?? []).map((c) => c.opening))
    for (const opening of floor.openings) {
      if (opening.type === 'window' || common.has(opening.id)) continue
      const [a, b] = opening.sides
      if (isSide(a) && b === 'outside') ways.push({ room: a.room, opening })
      else if (isSide(b) && a === 'outside') ways.push({ room: b.room, opening })
    }
  }
  return ways
}

function usesText(facts: PlanFacts, w: Words): string {
  const rooms = [...facts.rooms.values()]
  // An outdoor space says what it is by its kind, so it is never among the rooms that say nothing.
  const unsaid = rooms.filter((room) => room.use === undefined && room.outdoor === undefined).length
  const parts: string[] = []
  for (const use of ['bedroom', 'bathroom'] as const satisfies readonly RoomUse[]) {
    const count = rooms.filter((room) => room.use === use).length
    if (count > 0) parts.push(countOf(w, 'describe.uses', count, { use: labelOfUse(w.language, use) }))
  }
  for (const kind of OUTDOOR_KINDS) {
    const count = rooms.filter((room) => room.use === undefined && room.outdoor === kind).length
    if (count > 0) parts.push(countOf(w, `describe.outdoor.${kind}`, count))
  }
  if (unsaid === rooms.length && rooms.length > 0) parts.push(t(w, rooms.length === 1 ? 'describe.uses.unsaid.one' : 'describe.uses.unsaid.all'))
  else if (unsaid > 0) parts.push(t(w, 'describe.uses.unsaid.some', { count: unsaid }))
  return parts.length > 0 ? ` (${parts.join(t(w, 'join.comma'))})` : ''
}

/** The floors that repeat an earlier one, by the floor they repeat. */
function repeatGroups(facts: PlanFacts): Map<string, FloorFacts[]> {
  const groups = new Map<string, FloorFacts[]>()
  for (const floor of facts.floors) {
    if (floor.repeats === null) continue
    const group = groups.get(floor.repeats.of) ?? []
    group.push(floor)
    groups.set(floor.repeats.of, group)
  }
  return groups
}

function totalArea(facts: PlanFacts): number {
  return facts.floors.reduce((sum, floor) => sum + floor.area, 0)
}

/** ARE-63: the doors and doorless openings onto the common parts, by the room each leads into. */
function waysFromCommon(facts: PlanFacts): Way[] {
  return facts.floors.flatMap((floor) => (floor.commonIn ?? []).flatMap((c) => {
    const opening = floor.openings.find((o) => o.id === c.opening)
    return opening === undefined ? [] : [{ room: c.room, opening }]
  }))
}

/** `a door leads`, `3 doors lead`, `2 doors and 1 doorless opening lead`. */
function waysText(ways: readonly Way[], w: Words): string {
  const doors = ways.filter((way) => way.opening.type === 'door').length
  const gaps = ways.length - doors
  if (ways.length === 1) return t(w, doors === 1 ? 'describe.ways.door' : 'describe.ways.gap')
  const parts = [...(doors > 0 ? [countOf(w, 'describe.count.door', doors)] : []), ...(gaps > 0 ? [countOf(w, 'describe.count.gap', gaps)] : [])]
  return t(w, 'describe.ways.many', { ways: parts.join(t(w, 'join.and')) })
}

function personLine(facts: PlanFacts, names: PersonNames, w: Words): string {
  const floors = facts.floors.length
  const repeats = [...repeatGroups(facts)].map(([of, group]) =>
    countOf(w, 'describe.repeat', group.length, { floors: listed(w, group.map((floor) => names.floor(floor.id))), of: names.floor(of) }))
  const floorText = floors === 1 ? t(w, 'describe.floors.one') : t(w, 'describe.floors.many', { count: floors, repeats: repeats.length > 0 ? ` (${repeats.join(t(w, 'join.semicolon'))})` : '' })
  const ways = waysIn(facts)
  const into = [...new Set(ways.map((way) => names.room(way.room)))]
  // ARE-18: with no door in, an open side to the outside is the way in, as the check reads it.
  const open = [...new Set(facts.floors.flatMap((floor) => floor.edgesOut.map((e) => names.room(e.room))))]
  const common = waysFromCommon(facts)
  const fromCommon = [...new Set(common.map((way) => names.room(way.room)))]
  const entered = into.length > 0
    ? t(w, 'describe.entered', { ways: waysText(ways, w), rooms: listed(w, capped(w, into, 5)) })
    : open.length > 0
      ? t(w, 'describe.entered.openSide', { rooms: listed(w, capped(w, open, 5)) })
      : fromCommon.length > 0 ? t(w, 'describe.entered.common', { ways: waysText(common, w), rooms: listed(w, capped(w, fromCommon, 5)) }) : t(w, 'describe.entered.none')
  const line = t(w, 'describe.line', { floors: floorText, rooms: countOf(w, 'describe.count.room', facts.rooms.size), uses: usesText(facts, w), area: area(w, totalArea(facts)), entered })
  return `${line}${personBuilding(facts, names, w)}${personWork(facts, w)}`
}

/** CNT-10: what the plan's work holds, as a sentence; every other figure is after the work. */
function personWork(facts: PlanFacts, w: Words): string {
  if (facts.work === null) return ''
  const { counts, base } = facts.work
  const parts = (n: { walls: number; openings: number; rooms: number }): string =>
    [countOf(w, 'describe.count.wall', n.walls), countOf(w, 'describe.count.opening', n.openings), countOf(w, 'describe.count.room', n.rooms)].join(t(w, 'join.comma'))
  const shell = base === null ? '' : ` ${t(w, 'describe.work.base', { base: name(base) })}`
  return ` ${t(w, 'describe.work', { demolished: parts(counts.demolished), new: parts(counts.new) })}${shell}`
}

/** CNT-10: the same for an agent, as `WORK demolished 1 wall, …; new …; figures after the work`. */
function agentWork(facts: PlanFacts): string {
  if (facts.work === null) return ''
  const { counts, base } = facts.work
  const parts = (n: { walls: number; openings: number; rooms: number }): string => `${n.walls} walls ${n.openings} openings ${n.rooms} rooms`
  return ` WORK existing ${parts(counts.existing)}; demolished ${parts(counts.demolished)}; new ${parts(counts.new)}; figures after the work${base === null ? '' : `; BASE ${JSON.stringify(base)} read-only`}.`
}

/** CNT-5: what kind of building the plan says it is, and each floor that says otherwise, as a sentence. */
function personBuilding(facts: PlanFacts, names: PersonNames, w: Words): string {
  const { plan, floors } = facts.building
  const kind = (building: string): string => t(w, `describe.kind.${building}` as MessageKey)
  const own = floors.map((f) => t(w, 'describe.building.floor', { floor: names.floor(f.floor), kind: kind(f.building) }))
  if (plan === undefined) return own.length === 0 ? '' : ` ${t(w, 'describe.building.floors', { floors: listed(w, own) })}`
  return ` ${t(w, 'describe.building.plan', { kind: kind(plan), floors: own.length === 0 ? '' : t(w, 'describe.building.and', { floors: listed(w, own) }) })}`
}

/** CNT-5: the same for an agent, as `BUILDING home; ground shop`. */
function agentBuilding(facts: PlanFacts): string {
  const { plan, floors } = facts.building
  if (plan === undefined && floors.length === 0) return ''
  return ` BUILDING ${[...(plan === undefined ? [] : [plan]), ...floors.map((f) => `${f.floor} ${f.building}`)].join('; ')}.`
}

function agentLine(facts: PlanFacts): string {
  const ways = waysIn(facts)
  const open = [...new Set(facts.floors.flatMap((floor) => floor.edgesOut.map((e) => e.room)))]
  const common = [...new Set(waysFromCommon(facts).map((way) => way.room))]
  const into = ways.length > 0
    ? `from outside into ${capped(ENGLISH, [...new Set(ways.map((way) => way.room))], 8).join(', ')}`
    : open.length > 0
      ? `from outside across open sides into ${capped(ENGLISH, open, 8).join(', ')}`
      : common.length > 0 ? `from the common parts into ${capped(ENGLISH, common, 8).join(', ')}` : 'no way in from outside'
  return `PLAN ${plural(facts.floors.length, 'floor')}, ${plural(facts.rooms.size, 'room')}${usesText(facts, ENGLISH)}, ${m(totalArea(facts))} m2 inside, ${plural(facts.wallCount, 'wall')}, ${plural(facts.openingCount, 'opening')}; ${into}.${agentBuilding(facts)}${agentWork(facts)}`
}

/** What the plan cannot say, which a reader may expect, for a person and for an agent. */
function unsaid(facts: PlanFacts, names: PersonNames, w: Words): { person: string[]; agent: string[] } {
  // CNT-3: a plan that states its north says so in its own lines.
  // CNT-5: a plan may say what kind of building it is; one that says it for every floor is not asked.
  const said = facts.building.plan !== undefined || (facts.floors.length > 0 && facts.floors.every((f) => facts.building.floors.some((b) => b.floor === f.id)))
  const person = [...(facts.northStated ? [] : [t(w, 'describe.unsaid.north')]), ...(said ? [] : [t(w, 'describe.unsaid.kind')])]
  const agent = [...(facts.northStated ? [] : ['north']), ...(said ? [] : ['kind of building'])]
  if (facts.floors.length > 1) {
    // Floors no stair joins (LVL-3): a stair the plan states, or stair rooms one over the other.
    const { unjoined } = facts.connections
    if (unjoined.length > 0) {
      const stairs = facts.stairRooms > 0 ? plural(facts.stairRooms, 'room') : ''
      const all = unjoined.length === facts.floors.length
      const one = !all && unjoined.length === 1
      const marked = facts.stairRooms > 0 ? t(w, 'describe.unsaid.stairs', { rooms: countOf(w, 'describe.count.room', facts.stairRooms) }) : ''
      person.push(t(w, all ? 'describe.unsaid.connect.all' : one ? 'describe.unsaid.connect.one' : 'describe.unsaid.connect.some', { floors: listed(w, unjoined.map((id) => names.floor(id))), stairs: marked }))
      agent.push(`how floors connect (no stair joins ${unjoined.join(' ')}${stairs ? `; ${stairs} with use stair` : ''})`)
    }
    // CNT-4: a plan that lists its flats says which rooms make each.
    if (!facts.flatsListed) {
      person.push(t(w, 'describe.unsaid.flats'))
      agent.push('which rooms make each flat')
    }
  }
  return { person, agent }
}

/** Pairs of floors, lower first, joined into runs: ground to first and first to second is one run. */
function runs(pairs: readonly (readonly [string, string])[]): string[][] {
  const out: string[][] = []
  for (const [a, b] of pairs) {
    const run = out.find((r) => r[r.length - 1] === a)
    if (run) run.push(b)
    else out.push([a, b])
  }
  return out
}

/** The stairs and shafts that join the floors (LVL-3), or nothing in a plan with none. */
function personStairs(facts: PlanFacts, names: PersonNames, w: Words): string[] {
  const { stairs, stairRooms, lifts, outOfLine } = facts.connections
  const span = (run: readonly string[]): Values => ({ from: names.floor(run[0]!), to: names.floor(run[run.length - 1]!) })
  const parts = [
    ...stairs.map((stair) => t(w, 'describe.stairs.stair', {
      name: JSON.stringify(stair.name),
      lower: names.floor(stair.lower),
      upper: names.floor(stair.upper),
      risers: stair.risers,
      rise: fig(w, stair.riserHeight),
      going: fig(w, stair.going),
      width: fig(w, stair.width),
    })),
    ...runs(stairRooms).map((run) => t(w, 'describe.stairs.rooms', span(run))),
    ...runs(lifts).map((run) => t(w, 'describe.stairs.lift', span(run))),
    ...outOfLine.map((out) => t(w, out.kind === 'stair' ? 'describe.stairs.apart.stair' : 'describe.stairs.apart.lift', { a: names.floor(out.floors[0]), b: names.floor(out.floors[1]) })),
  ]
  return parts.length === 0 ? [] : [t(w, 'describe.stairs', { parts: parts.join(t(w, 'join.semicolon')) })]
}

function agentStairs(facts: PlanFacts): string[] {
  const { stairs, stairRooms, lifts, outOfLine } = facts.connections
  const parts = [
    ...stairs.map((stair) => `${stair.id} ${stair.lower}->${stair.upper} ${stair.risers}x${m(stair.riserHeight)} going ${m(stair.going)} width ${m(stair.width)}`),
    ...runs(stairRooms).map((run) => `stair rooms ${run.join('->')}`),
    ...runs(lifts).map((run) => `lift ${run.join('->')}`),
    ...outOfLine.map((out) => `${out.kind} rooms out of line ${out.floors[0]}->${out.floors[1]}`),
  ]
  return parts.length === 0 ? [] : [`STAIRS ${parts.join('; ')}`]
}

/** How a person can tell an opening apart: by its type and the rooms it joins. */
function personOpening(opening: OpeningFacts, names: PersonNames, w: Words): string {
  const rooms = opening.sides.filter(isSide).map((side) => names.room(side.room))
  const the = t(w, `describe.the.${opening.type}`)
  if (rooms.length === 2) return t(w, 'describe.op.between', { the, a: rooms[0]!, b: rooms[1]! })
  if (rooms.length === 1) {
    const past = opening.sides.find((side): side is Beyond => !isSide(side))!
    const to = t(w, 'describe.to', { there: beyondText(past, w) })
    if (opening.type === 'window') return t(w, 'describe.op.window', { room: rooms[0]!, to: past === 'outside' ? '' : to })
    return past === 'outside' ? t(w, 'describe.op.in', { the, room: rooms[0]! }) : t(w, 'describe.op.out', { the, room: rooms[0]!, to })
  }
  return t(w, 'describe.op.alone', { a: t(w, `describe.a.${opening.type}`) })
}

const BEYOND_KEY: Record<Beyond, MessageKey> = { outside: 'describe.beyond.outside', 'nothing drawn': 'describe.beyond.nothing', 'a room left out': 'describe.beyond.left' }

/** What is past a side with no room on it, in words. */
function beyondText(beyond: Beyond, w: Words): string {
  return t(w, BEYOND_KEY[beyond])
}

/** Exceptions by floor and height, counted: for when there are too many to name. */
function counted(list: readonly HeightException[], what: 'wall' | 'window' | 'door', floorName: (id: string) => string, w: Words): string[] {
  const groups = new Map<string, { floor: string; value: number; count: number }>()
  for (const item of list) {
    const key = `${item.floor}\u0000${item.value}`
    const group = groups.get(key) ?? { floor: item.floor, value: item.value, count: 0 }
    group.count++
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => t(w, 'describe.heights.counted', { things: countOf(w, `describe.count.${what}`, group.count), floor: floorName(group.floor), value: fig(w, group.value) }))
}

function personHeights(facts: PlanFacts, names: PersonNames, w: Words): string {
  const { heights } = facts
  const floorName = (id: string): string => names.floor(id)
  const opening = (exception: HeightException): string => {
    const found = facts.openings.get(exception.id)
    return t(w, 'describe.heights.at', { what: found ? personOpening(found, names, w) : t(w, 'describe.heights.one'), value: fig(w, exception.value) })
  }
  const except = (items: readonly string[]): string => t(w, 'describe.heights.except', { items: listed(w, items) })
  const openings = (list: readonly HeightException[], what: 'window' | 'door'): string => {
    if (list.length === 0) return ''
    return except(list.length <= 4 ? list.map(opening) : capped(w, counted(list, what, floorName, w), 4))
  }
  const parts: string[] = []
  if (heights.wall !== null) {
    // Walls have no names a person knows, so their exceptions are counted.
    const odd = [
      ...heights.floorWalls.map((floor) => t(w, 'describe.heights.floor', { value: fig(w, floor.value), floor: names.floor(floor.floor) })),
      ...counted(heights.walls, 'wall', floorName, w),
    ]
    parts.push(t(w, 'describe.heights.walls', { value: fig(w, heights.wall), except: odd.length > 0 ? except(capped(w, odd, 4)) : '' }))
  }
  // WRT-6 (lab AU3-6): a height nothing states is said so, never as a figure the person gave.
  const { notStated } = heights
  if (notStated.count > 0) {
    const drawn = fig(w, notStated.drawn)
    parts.push(heights.wall === null
      ? t(w, 'describe.heights.unstated.all', { drawn })
      : t(w, 'describe.heights.unstated.some', { walls: countOf(w, 'describe.count.wall', notStated.count), drawn }))
  }
  if (heights.windowSill !== null) parts.push(t(w, 'describe.heights.windows', { value: fig(w, heights.windowSill), except: openings(heights.windowSills, 'window') }))
  parts.push(t(w, 'describe.heights.doors', { except: openings(heights.doorSills, 'door') }))
  return t(w, 'describe.heights', { parts: parts.join(t(w, 'join.semicolon')) })
}

function agentHeights(facts: PlanFacts): string {
  const { heights } = facts
  const say = (exception: HeightException): string => `${exception.id} ${m(exception.value)}`
  const except = (list: readonly HeightException[]): string => {
    if (list.length === 0) return ''
    if (list.length <= 8) return ` except ${list.map(say).join(', ')}`
    const groups = new Map<string, number>()
    for (const item of list) groups.set(`${item.floor} ${m(item.value)}`, (groups.get(`${item.floor} ${m(item.value)}`) ?? 0) + 1)
    return ` except ${[...groups].map(([key, count]) => `${count} on ${key}`).join(', ')}`
  }
  const parts: string[] = []
  if (heights.wall !== null) {
    const floors = heights.floorWalls.map((floor) => `, ${floor.floor} ${m(floor.value)}`).join('')
    parts.push(`walls ${m(heights.wall)}${floors}${except(heights.walls)}`)
  }
  if (heights.notStated.count > 0) parts.push(`${heights.wall === null ? 'walls' : `${heights.notStated.count} walls`} not stated, drawn ${m(heights.notStated.drawn)}`)
  if (heights.windowSill !== null) parts.push(`window sills ${m(heights.windowSill)}${except(heights.windowSills)}`)
  parts.push(`door sills 0${except(heights.doorSills)}`)
  return `HEIGHTS ${parts.join('; ')}`
}

const TYPE_LETTER: Record<OpeningFacts['type'], string> = { door: 'd', opening: 'o', window: 'w' }

const BEYOND_TOKEN: Record<Beyond, string> = { outside: 'OUT', 'nothing drawn': 'NONE', 'a room left out': 'LEFT' }

const WEST_OR_SOUTH = new Set(['W', 'SW', 'NW', 'S'])

/** The two corner gaps of a side, the western one first, or the southern one on a wall that runs north. */
function inOrder(side: OpeningSide): readonly [CornerGap, CornerGap] | null {
  if (side.corners === null) return null
  const [a, b] = side.corners
  return WEST_OR_SOUTH.has(a.toward) ? [a, b] : [b, a]
}

/** The side of an opening that is in `room`, and what is on its other side. */
function from(opening: OpeningFacts, room: string): { here: OpeningSide; there: OpeningSide | Beyond } | null {
  const [a, b] = opening.sides
  if (isSide(a) && a.room === room) return { here: a, there: b }
  if (isSide(b) && b.room === room) return { here: b, there: a }
  return null
}

/** The openings in a room, and the rooms open to it along a virtual wall. */
function roomOpenings(floor: FloorFacts, room: string): { openings: Array<{ opening: OpeningFacts; here: OpeningSide; there: OpeningSide | Beyond }>; open: Array<{ wall: string; other: string }> } {
  const openings = floor.openings.flatMap((opening) => {
    const sides = from(opening, room)
    return sides === null ? [] : [{ opening, ...sides }]
  })
  const open = floor.openSides.flatMap((side) => {
    if (side.rooms[0] === room) return [{ wall: side.wall, other: side.rooms[1] }]
    if (side.rooms[1] === room) return [{ wall: side.wall, other: side.rooms[0] }]
    return []
  })
  return { openings, open }
}

/** Neighbours with no opening and no open side to them. */
function nextOnly(floor: FloorFacts, room: RoomFacts): string[] {
  const { openings, open } = roomOpenings(floor, room.id)
  const joined = new Set([
    ...openings.flatMap(({ there }) => (isSide(there) ? [there.room] : [])),
    ...open.map((side) => side.other),
  ])
  return room.neighbours.filter((id) => !joined.has(id))
}

/** A point on the drawing, `x, y`; `x; y` with a decimal comma, so the comma is not read as a separator. */
function point(w: Words, x: number, y: number): string {
  return t(w, decimalFor(w.language, w.options.decimal) === 'comma' ? 'describe.point.comma' : 'describe.point', { x: fig(w, x), y: fig(w, y) })
}

function personRoom(floor: FloorFacts, room: RoomFacts, names: PersonNames, w: Words): string[] {
  const name = names.room(room.id)
  if (room.shape === null) return [t(w, 'describe.room.unmeasured', { room: name })]
  const { shape } = room
  const across = `${fig(w, shape.across)} × ${fig(w, shape.up)}`
  const size = shape.rectangle ? across : shape.form === null ? t(w, 'describe.room.odd', { size: across }) : formText(w, shape.form, across)
  const next = nextOnly(floor, room)
  // CNT-8: a zone is named as part of its room, and its floor is in its room's.
  const of = room.zoneOf === undefined ? (room.outdoor === undefined ? '' : t(w, 'describe.room.outdoor', { kind: t(w, `outdoor.kind.${room.outdoor}`) })) : t(w, 'describe.room.zoneOf', { room: names.room(room.zoneOf) })
  // LVL-26: a room of its own height or floor says its floor's level and its height.
  const level = room.level === undefined ? '' : t(w, 'describe.room.level', { level: fig(w, room.level.floor), height: fig(w, room.level.height) })
  const lines = [`${t(w, 'describe.room', { room: `${name}${of}`, size, area: area(w, shape.area), at: point(w, shape.at.x, shape.at.y) })}${level}${next.length > 0 ? t(w, 'describe.room.next', { rooms: listed(w, next.map((id) => names.room(id))) }) : ''}`]
  const { openings, open } = roomOpenings(floor, room.id)
  for (const side of open) lines.push(`  ${t(w, 'describe.room.open', { room: names.room(side.other) })}`)
  for (const { opening, here, there } of openings) {
    const to = isSide(there)
      ? t(w, 'describe.to', { there: names.room(there.room) })
      : opening.type === 'window' && there === 'outside' ? '' : t(w, 'describe.to', { there: beyondText(there, w) })
    const gaps = inOrder(here)
    const corners = gaps === null
      ? ''
      : t(w, 'describe.room.corners', { d1: fig(w, gaps[0].distance), c1: t(w, `describe.c.${gaps[0].toward}`), d2: fig(w, gaps[1].distance), c2: t(w, `describe.c.${gaps[1].toward}`) })
    lines.push(`  ${t(w, 'describe.room.opening', { what: cap(t(w, `describe.word.${opening.type}`)), width: fig(w, opening.width), to, face: t(w, `describe.c.${here.face}`), corners })}`)
  }
  return lines
}

/** CMD-49: a room by the shape a person names, with the unit on every length. */
function formText(w: Words, form: RoomForm, across: string): string {
  switch (form.kind) {
    case 'round':
      return t(w, 'describe.room.round', { across: fig(w, form.across) })
    case 'band':
      return t(w, 'describe.room.band', { long: fig(w, form.long), wide: fig(w, form.wide) })
    case 'turned':
      return t(w, 'describe.room.turned', { across: fig(w, form.across), up: fig(w, form.up), degrees: num(String(Math.round(form.degrees * 10) / 10)) })
    case 'four':
      return t(w, 'describe.room.four', { sides: listed(w, form.sides.map((side) => fig(w, side))) })
    case 'curved':
      return t(w, 'describe.room.curved', { size: across, curves: listed(w, form.curves.map((curve) => t(w, 'describe.room.curve', { radius: fig(w, curve.radius), length: fig(w, curve.length) }))) })
  }
}

/** CMD-49: the agent's token for a room's shape: ` round:<across>`, ` band:<long>x<wide>`, ` turned:<deg>:<W>x<D>`, ` sides:<a>/<b>/<c>/<d>`, ` curves:r<radius>/<length>,…`; '' for none. */
export function agentForm(form: RoomForm | null): string {
  if (form === null) return ''
  switch (form.kind) {
    case 'round':
      return ` round:${m(form.across)}`
    case 'band':
      return ` band:${m(form.long)}x${m(form.wide)}`
    case 'turned':
      return ` turned:${Math.round(form.degrees * 10) / 10}:${m(form.across)}x${m(form.up)}`
    case 'four':
      return ` sides:${form.sides.map(m).join('/')}`
    case 'curved':
      return ` curves:${form.curves.map((curve) => `r${m(curve.radius)}/${m(curve.length)}`).join(',')}`
  }
}

function agentRoomHead(room: RoomFacts): string {
  const use = room.use ?? '-'
  if (room.shape === null) return `${room.id} ${JSON.stringify(room.name)} ${use} LEFT OUT (grid check says why)`
  const { shape } = room
  return `${room.id} ${JSON.stringify(room.name)} ${use} ${shape.rectangle ? '' : '~'}${m(shape.across)}x${m(shape.up)}${agentForm(shape.form)} @${m(shape.at.x)},${m(shape.at.y)} ${m(shape.area)}${room.zoneOf === undefined ? '' : ` zone-of:${room.zoneOf}`}${room.outdoor === undefined ? '' : ` outdoor:${room.outdoor}`}${room.level === undefined ? '' : ` floor@${m(room.level.floor)} h${m(room.level.height)}`}`
}

function agentRoom(floor: FloorFacts, room: RoomFacts): string {
  if (room.shape === null) return agentRoomHead(room)
  const next = nextOnly(floor, room)
  const { openings, open } = roomOpenings(floor, room.id)
  const items = [
    ...open.map((side) => `${side.wall} v>${side.other}`),
    ...openings.map(({ opening, here, there }) => {
      const to = isSide(there) ? `>${there.room}` : opening.type === 'window' && there === 'outside' ? '' : `>${BEYOND_TOKEN[there]}`
      const gaps = inOrder(here)
      const corners = gaps === null ? '' : ` ${gaps[0].toward}${m(gaps[0].distance)}/${gaps[1].toward}${m(gaps[1].distance)}`
      return `${opening.id} ${TYPE_LETTER[opening.type]}${m(opening.width)}${to} ${here.face}${corners}`
    }),
  ]
  return `${agentRoomHead(room)}${next.length > 0 ? ` | next ${next.join(' ')}` : ''}${items.length > 0 ? ` | ${items.join('; ')}` : ''}`
}

const KIND_LETTER = { exterior: 'x', interior: 'i', partition: 'p', separating: 's' } as const

/** Gaps add up to the side's length less the opening's width: the shorter side is the closer reference. */
function stretch(side: OpeningSide): number {
  return side.corners === null ? Infinity : side.corners[0].distance + side.corners[1].distance
}

/**
 * An opening under its wall: the room whose side is shorter with its gaps to that side's two
 * corners, nearer the wall's start first, then what is on the other side. A window to outside
 * has one room only.
 */
function agentWallOpening(opening: OpeningFacts): string {
  const [a, b] = opening.sides
  const rooms = [a, b].filter(isSide).sort((x, y) => stretch(x) - stretch(y))
  const head = `${opening.id} ${TYPE_LETTER[opening.type]} ${m(opening.offset)}+${m(opening.width)}`
  const first = rooms[0]
  if (first === undefined) return `${head} ${BEYOND_TOKEN[a as Beyond]}|${BEYOND_TOKEN[b as Beyond]}`
  const gaps = first.corners === null ? '' : ` ${m(first.corners[0].distance)}/${m(first.corners[1].distance)}`
  const other = rooms[1]?.room ?? [a, b].find((side): side is Beyond => !isSide(side))!
  const shown = rooms[1] !== undefined ? `|${rooms[1].room}` : other === 'outside' ? '' : `|${BEYOND_TOKEN[other as Beyond]}`
  return `${head} ${first.room}${gaps}${shown}`
}

/** Degrees as a description says them: whole, or to a tenth. */
const degrees = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1))

function agentWalls(floor: FloorFacts): string[] {
  return floor.walls.map((wall) => {
    const height = wall.virtual || wall.height === floor.wallHeight ? '' : wall.heightNotStated ? ' h?' : ` h${m(wall.height)}`
    // CNT-18: a curved wall says its centre and sweep after its ends.
    const arc = wall.curve === undefined ? '' : ` arc(${m(wall.curve.centre.x)},${m(wall.curve.centre.y)} ${degrees(wall.curve.sweep)}°)`
    const head = ` ${wall.id} ${m(wall.start.x)},${m(wall.start.y)}>${m(wall.end.x)},${m(wall.end.y)}${arc} ${wall.virtual ? 'v' : `${m(wall.thickness)} ${KIND_LETTER[wall.kind]}`}${height}`
    const openings = floor.openings.filter((o) => o.wall === wall.id).map(agentWallOpening)
    const open = floor.openSides.filter((side) => side.wall === wall.id)
    const joins = open.length > 0 ? ` | ${open.map((side) => `${side.rooms[0]}|${side.rooms[1]}`).join(' ')}` : ''
    return `${head}${joins}${openings.length > 0 ? ` | ${openings.join('; ')}` : ''}`
  })
}

function personSide(side: OpeningSide | Beyond, names: PersonNames, w: Words): string {
  return isSide(side) ? names.room(side.room) : beyondText(side, w)
}

function personWalls(floor: FloorFacts, names: PersonNames, w: Words): string[] {
  return floor.walls.map((wall) => {
    const height = wall.height === floor.wallHeight ? '' : wall.heightNotStated ? t(w, 'describe.wall.unstated') : t(w, 'describe.wall.height', { value: fig(w, wall.height) })
    const what = wall.virtual
      ? t(w, 'describe.wall.virtual')
      : t(w, 'describe.wall.solid', { kind: t(w, `describe.wall.${wall.kind}`), thickness: fig(w, wall.thickness), height })
    const joins = floor.openSides
      .filter((side) => side.wall === wall.id)
      .map((side) => t(w, 'describe.wall.joins', { a: names.room(side.rooms[0]), b: names.room(side.rooms[1]) }))
      .join('')
    const openings = floor.openings
      .filter((o) => o.wall === wall.id)
      .map((opening) => t(w, 'describe.wall.opening', {
        what: t(w, `describe.word.${opening.type}`),
        width: fig(w, opening.width),
        offset: fig(w, opening.offset),
        a: personSide(opening.sides[0], names, w),
        b: personSide(opening.sides[1], names, w),
      }))
    const along = openings.length > 0 ? t(w, 'describe.wall.openings', { openings: openings.join(t(w, 'join.semicolon')) }) : ''
    // CNT-18: a curved wall's centre, the way it turns and how far, and its length along the curve.
    const curve = wall.curve === undefined
      ? ''
      : t(w, 'describe.wall.curve', {
          sweep: sayValue(w.language, num(degrees(Math.abs(wall.curve.sweep))), w.options),
          way: t(w, wall.curve.sweep > 0 ? 'describe.wall.anticlockwise' : 'describe.wall.clockwise'),
          centre: point(w, wall.curve.centre.x, wall.curve.centre.y),
          radius: fig(w, wall.curve.radius),
          length: fig(w, wall.curve.length),
        })
    return `  ${t(w, 'describe.wall', { start: point(w, wall.start.x, wall.start.y), end: point(w, wall.end.x, wall.end.y), curve, what, joins, openings: along })}`
  })
}

const AGENT_KEY_ROOMS = 'KEY metres, inside, N=+y. room: id "name" use WxD(~ not a rectangle; then round:across, band:long along its middle x wide, turned:degrees anticlockwise:own WxD, sides:going round, curves:r radius/length) @lower-left m2 (floor@level hheight: a room of its own height or floor) | next: across a wall, no way through | opening: id d/o/w(door/opening/window) or v(virtual wall) width >other side(none=outside window, OUT=outside, NONE=nothing drawn, LEFT=left out) side of this room, gaps to its corners'
const AGENT_KEY_WALLS = 'KEY metres, inside, N=+y. room: id "name" use WxD(~ not a rectangle; then round:across, band:long along its middle x wide, turned:degrees anticlockwise:own WxD, sides:going round, curves:r radius/length) @lower-left m2. wall: id start>end thickness x/i/p/s/v(exterior/interior/partition/separating/virtual) h=not the floor\'s usual | opening: id d/o/w offset+width room gaps to its side\'s corners(start end first)|other(none=outside, NONE=nothing drawn, LEFT=left out)'

// The label leads every description (`describePlan`, MSG-3), so the close need not repeat it
// (the person's is `describe.close`).
const AGENT_CLOSE = 'CHECKS none here: grid check.'

function personFloorHead(floor: FloorFacts, names: PersonNames, w: Words): string {
  const left = floor.leftOut.length > 0 ? countOf(w, 'describe.floor.left', floor.leftOut.length, { parts: countOf(w, 'describe.count.part', floor.leftOut.length) }) : ''
  return `${t(w, 'describe.floor', { floor: names.floor(floor.id), rooms: roomCountSaid(w, floor), area: area(w, floor.area) })}${left}`
}

function agentFloorHead(floor: FloorFacts): string {
  const left = floor.leftOut.length > 0 ? `; left out ${floor.leftOut.join(' ')}` : ''
  return `FLOOR ${floor.id} ${floor.name === null ? '(no name)' : JSON.stringify(floor.name)} level ${floor.level}: ${roomCount(floor)}, ${m(floor.area)} m2${left}`
}

/** CNT-16: a floor's columns, in one line, each by its size and place and the room it stands in; nothing on a floor with none. */
function personColumns(floor: FloorFacts, names: PersonNames, w: Words): string[] {
  const columns = floor.columns ?? []
  if (columns.length === 0) return []
  const each = columns.map((c) => {
    const label = c.label === null ? '' : t(w, 'describe.column.label', { label: c.label })
    const room = c.room === null ? '' : t(w, 'describe.column.in', { room: names.room(c.room) })
    const at = point(w, c.at.x, c.at.y)
    return c.depth === null
      ? t(w, 'describe.column.round', { label, width: fig(w, c.width), at, room })
      : t(w, 'describe.column.square', { label, width: fig(w, c.width), depth: fig(w, c.depth), at, room })
  })
  return [`  ${t(w, 'describe.columns', { count: columns.length, columns: listed(w, each) })}`]
}

/** CNT-16: the agent's form of a floor's columns: `COLUMNS id sq<w>x<d>|rd<d> @x,y room`. */
function agentColumns(floor: FloorFacts): string[] {
  const columns = floor.columns ?? []
  if (columns.length === 0) return []
  return [`COLUMNS ${columns.map((c) => `${c.id} ${c.depth === null ? `rd${m(c.width)}` : `sq${m(c.width)}x${m(c.depth)}`} @${m(c.at.x)},${m(c.at.y)} ${c.room ?? '-'}`).join('; ')}`]
}

/** CNT-19: bay numbers with each run of whole numbers one after another said as a range: 1 to 16, 20. */
function numberRuns(numbers: readonly string[], range: (from: string, to: string) => string): string[] {
  const out: string[] = []
  let i = 0
  while (i < numbers.length) {
    let j = i
    while (j + 1 < numbers.length && /^\d+$/.test(numbers[j]!) && /^\d+$/.test(numbers[j + 1]!) && Number(numbers[j + 1]) === Number(numbers[j]) + 1) j++
    out.push(j - i >= 2 ? range(numbers[i]!, numbers[j]!) : numbers[i]!)
    if (j - i === 1) out.push(numbers[j]!)
    i = j + 1
  }
  return out
}

/** CNT-19: a floor's parking bays, counted with their numbers, and the ramps that start or end on it; nothing on a floor with none. */
function personParking(floor: FloorFacts, names: PersonNames, w: Words): string[] {
  const lines: string[] = []
  const bays = floor.bays
  if (bays !== undefined && bays.count > 0) {
    const numbers = numberRuns(bays.numbers, (from, to) => t(w, 'describe.bays.range', { from, to }))
    const each = [...numbers, ...(bays.unnumbered === 0 ? [] : [t(w, 'describe.bays.unnumbered', { count: bays.unnumbered })])]
    lines.push(`  ${t(w, 'describe.bays', { count: bays.count, numbers: listed(w, each) })}`)
  }
  for (const r of floor.ramps ?? []) {
    lines.push(`  ${t(w, 'describe.ramp', { ramp: r.name, lower: names.floor(r.lower), upper: names.floor(r.upper), rise: fig(w, r.rise), length: fig(w, r.length), slope: num(slopeText(r.slope)) })}`)
  }
  return lines
}

/** CNT-19: the agent's form: `BAYS <count> numbers <runs>` and `RAMP id lower->upper rise <m> length <m> slope <percent>%`. */
function agentParking(floor: FloorFacts): string[] {
  const lines: string[] = []
  const bays = floor.bays
  if (bays !== undefined && bays.count > 0) {
    const numbers = numberRuns(bays.numbers, (from, to) => `${from}-${to}`)
    lines.push(`BAYS ${bays.count}${numbers.length === 0 ? '' : ` numbers ${numbers.join(',')}`}${bays.unnumbered === 0 ? '' : ` unnumbered ${bays.unnumbered}`}`)
  }
  for (const r of floor.ramps ?? []) lines.push(`RAMP ${r.id} ${r.lower}->${r.upper} rise ${m(r.rise)} length ${m(r.length)} slope ${slopeText(r.slope)}%`)
  return lines
}

function personCard(facts: PlanFacts, withWalls: boolean, w: Words): string[] {
  const names = new PersonNames(facts, w)
  const left = unsaid(facts, names, w).person
  const lines = [
    personLine(facts, names, w),
    t(w, 'describe.key'),
    ...(left.length === 0 ? [] : [t(w, 'describe.unsaid', { items: listed(w, left) })]),
    personHeights(facts, names, w),
    ...personStairs(facts, names, w),
  ]
  const groups = repeatGroups(facts)
  for (const floor of facts.floors) {
    if (floor.repeats !== null) {
      const group = groups.get(floor.repeats.of)!
      if (group[0] === floor) lines.push('', t(w, 'describe.floor.repeat', { floors: listed(w, group.map((f) => names.floor(f.id))), of: names.floor(floor.repeats.of) }))
      continue
    }
    lines.push('', personFloorHead(floor, names, w))
    for (const room of floor.rooms) lines.push(...personRoom(floor, room, names, w))
    lines.push(...personColumns(floor, names, w))
    lines.push(...personParking(floor, names, w))
    if (withWalls && floor.walls.length > 0) lines.push(t(w, 'describe.walls', { floor: names.floor(floor.id) }), ...personWalls(floor, names, w))
  }
  lines.push('', t(w, 'describe.close'))
  return lines
}

function agentCard(facts: PlanFacts, withWalls: boolean): string[] {
  const left = unsaid(facts, new PersonNames(facts, ENGLISH), ENGLISH).agent
  const lines = [agentLine(facts), withWalls ? AGENT_KEY_WALLS : AGENT_KEY_ROOMS, ...(left.length === 0 ? [] : [`NOT IN PLAN ${left.join('; ')}`]), agentHeights(facts), ...agentStairs(facts)]
  const groups = repeatGroups(facts)
  for (const floor of facts.floors) {
    const repeat = floor.repeats
    if (repeat !== null && repeat.prefix !== null) {
      const group = groups.get(repeat.of)!.filter((f) => f.repeats?.prefix != null)
      if (group[0] === floor) {
        const [was] = repeat.prefix
        lines.push(`FLOORS ${group.map((f) => `${f.id} ${f.name === null ? '-' : JSON.stringify(f.name)}`).join(', ')}: as ${repeat.of}, ids with its own prefix (${group.map((f) => f.repeats!.prefix![1]).join(', ')}) for ${was}`)
      }
      continue
    }
    lines.push(`${agentFloorHead(floor)}${repeat !== null ? `; laid out as ${repeat.of}, other ids` : ''}`)
    for (const room of floor.rooms) lines.push(withWalls ? agentRoomHead(room) : agentRoom(floor, room))
    lines.push(...agentColumns(floor))
    lines.push(...agentParking(floor))
    if (withWalls) lines.push(...agentWalls(floor))
  }
  lines.push(AGENT_CLOSE)
  return lines
}

/** The description, ending in a new line. `words` is the person's language (MSG-11); English when left out. */
export function describeText(facts: PlanFacts, length: DescribeLength, audience: DescribeAudience, words: Words = ENGLISH): string {
  if (length === 'line') return `${audience === 'person' ? personLine(facts, new PersonNames(facts, words), words) : agentLine(facts)}\n`
  const lines = audience === 'person' ? personCard(facts, length === 'walls', words) : agentCard(facts, length === 'walls')
  return `${lines.join('\n')}\n`
}
