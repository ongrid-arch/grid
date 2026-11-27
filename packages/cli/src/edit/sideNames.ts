/**
 * CMD-50: a side of a room named the way rooms text names it, for the edits that move a side.
 *
 * A side is named by the way it faces on the drawing (north is up): `north`, `east`, `south`,
 * `west`, or `ne`, `nw`, `se`, `sw` for an angled side (`north-east` and `northeast` read the
 * same), with `.2` and on when more than one side faces that way (counted from the west, then the
 * south, as rooms text counts them); by a wall on the room's outline, by its id; or as the side it
 * shares with another room, `facing <room>` (or `the side facing <room>`), by id or name.
 *
 * A compass word takes the room's straight sides whose outward normal lies within the cone rooms
 * text uses; when one of them faces exactly that way, only those count, so a side square to the
 * drawing is found as it always was. Sides facing one way in one line are one side (a side split
 * into walls, WRT-59). Pure: a survey in, the side out, or `EditRefused` saying what the room has.
 */
import { dot, sub, tolerance, wallAxis, type Vec2 } from '@ongrid/floorplan/geometry'
import { english, joined, name, num, said as sentence, type MessageKey, type Value } from '@ongrid/floorplan/messages'
import type { RoomEdge, Survey } from '../quantities/survey'
import { roomCalled } from '../quantities/survey'
import { EditRefused } from './refused'

/** The eight ways a side faces on the drawing, as rooms text writes them. */
export const SIDE_WORDS = ['north', 'east', 'south', 'west', 'ne', 'nw', 'se', 'sw'] as const
export type SideWord = (typeof SIDE_WORDS)[number]
export type Cardinal = 'north' | 'east' | 'south' | 'west'

const S2 = Math.SQRT1_2
export const COMPASS8: Readonly<Record<SideWord, Vec2>> = {
  north: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: -1 },
  west: { x: -1, y: 0 },
  ne: { x: S2, y: S2 },
  nw: { x: -S2, y: S2 },
  se: { x: S2, y: -S2 },
  sw: { x: -S2, y: -S2 },
}

/** The other spellings of a diagonal, read as rooms text's word. */
const SPELLINGS: Readonly<Record<string, SideWord>> = {
  'north-east': 'ne', northeast: 'ne', 'north east': 'ne',
  'north-west': 'nw', northwest: 'nw', 'north west': 'nw',
  'south-east': 'se', southeast: 'se', 'south east': 'se',
  'south-west': 'sw', southwest: 'sw', 'south west': 'sw',
}

/** The cone a compass word takes, as rooms text reads one (`Compiler.facing`): a cosine above this. */
const FACING_COS = 0.9
/** A side within this of a compass way faces it exactly: the cosine a side square to the drawing has always been read by. */
const EXACT_COS = 0.999
/** Two edges this near one way are one side's, as a cosine. */
const SAME_WAY_COS = 0.9999
/** Two edges this near one line are one side's, in metres. */
const SAME_LINE_M = 0.05

/** A compass word as rooms text writes it, or null when the text is none. */
export function compassWord(text: string): SideWord | null {
  const plain = text.trim().toLowerCase()
  if ((SIDE_WORDS as readonly string[]).includes(plain)) return plain as SideWord
  return SPELLINGS[plain] ?? null
}

/** The nearest of the eight ways to a direction. */
export function nearestWord(v: Vec2): SideWord {
  let best: SideWord = 'north'
  for (const word of SIDE_WORDS) if (dot(v, COMPASS8[word]) > dot(v, COMPASS8[best]) + tolerance('parallel')) best = word
  return best
}

/** A side of a room found by its name. */
export interface NamedSide {
  /** The room's edges along it, each on a wall. */
  readonly edges: readonly RoomEdge[]
  /** The way out of the room across it, a unit vector. */
  readonly out: Vec2
  /** The compass way it faces exactly, when it is square to the drawing. */
  readonly cardinal: Cardinal | null
  /** How the answer calls it, in English: "the north side", "the south-east side", "the side facing "Hall"". */
  readonly called: string
}

const say = (key: MessageKey, values?: Record<string, Value>): string => english(sentence(key, values))

/** The unit normal out of the room across an edge (the floor is on its left). */
const outOf = (edge: RoomEdge): Vec2 => {
  const d = sub(edge.to, edge.from)
  return { x: d.y / edge.length, y: -d.x / edge.length }
}

/** One side: edges facing one way in one line. */
interface Group {
  readonly edges: RoomEdge[]
  readonly out: Vec2
}

function grouped(edges: readonly RoomEdge[]): Group[] {
  const groups: Group[] = []
  for (const edge of edges) {
    if (edge.length <= 0) continue
    const out = outOf(edge)
    // A curved wall's pieces are one side, the wall (the edit that moves it refuses it by name).
    const curved = edge.wall !== null && edge.wall.arc !== undefined ? edge.wall.id : null
    const group = groups.find((g) => (curved !== null ? g.edges[0]!.wall?.id === curved : g.edges[0]!.wall?.arc === undefined && dot(g.out, out) > SAME_WAY_COS && Math.abs(dot(sub(edge.from, g.edges[0]!.from), g.out)) < SAME_LINE_M))
    if (group) group.edges.push(edge)
    else groups.push({ edges: [edge], out })
  }
  // From the west, then the south, as rooms text counts `east.2`.
  const middle = (g: Group): Vec2 => {
    const e = g.edges[0]!
    return { x: e.from.x + e.to.x, y: e.from.y + e.to.y }
  }
  return groups.sort((a, b) => middle(a).x - middle(b).x || middle(a).y - middle(b).y)
}

/** The word rooms text gives each side of the room, with its length and its wall: "se (2.12 m, wall "w-3")". */
function sidesListed(edges: readonly RoomEdge[]): string {
  const groups = grouped(edges.filter((e) => e.wall !== null))
  const words = groups.map((g) => nearestWord(g.out))
  const listed = groups.map((g, i) => {
    const word = words[i]!
    const same = words.filter((w) => w === word).length
    const k = words.slice(0, i + 1).filter((w) => w === word).length
    const length = g.edges.reduce((sum, e) => sum + e.length, 0)
    return sentence('edit.side.listed', { word: same > 1 ? `${word}.${k}` : word, length: num(length.toFixed(2)), wall: name(g.edges[0]!.wall!.id) })
  })
  return english(sentence('edit.side.list', { sides: joined(listed, 'join.comma') }))
}

/** The side's way out, snapped to the compass when it is square to the drawing, else along its wall. */
function sideOut(group: Group): { out: Vec2; cardinal: Cardinal | null } {
  for (const word of ['north', 'east', 'south', 'west'] as const) {
    if (dot(group.out, COMPASS8[word]) > EXACT_COS) return { out: COMPASS8[word], cardinal: word }
  }
  const wall = group.edges[0]!.wall
  if (wall !== null && wall.arc === undefined) {
    const n = wallAxis(wall).normal
    return { out: dot(n, group.out) >= 0 ? n : { x: -n.x, y: -n.y }, cardinal: null }
  }
  return { out: group.out, cardinal: null }
}

/** The side of a room a name gives, or a refusal that lists the room's sides. */
export function roomSide(survey: Survey, roomId: string, given: string): NamedSide {
  const room = survey.byId.get(roomId)!
  const roomName = name(roomCalled(room.facts))
  const onWalls = room.edges.filter((e) => e.wall !== null && e.length > 0)
  const refuse = (key: MessageKey, values: Record<string, Value>): never => {
    throw new EditRefused(`${say(key, { room: roomName, ...values })} ${sidesListed(room.edges)}`)
  }
  const text = given.trim()
  const one = (groups: Group[], what: string): Group => {
    if (groups.length === 0) refuse('edit.side.none', { side: what })
    if (groups.length > 1) refuse('edit.side.many', { side: what, count: groups.length })
    return groups[0]!
  }
  const facingWay = (way: Value): string => say('edit.side.facing', { way })

  // A compass word, maybe with its count: "east.2".
  const counted = /^(.+?)\.(\d+)$/.exec(text)
  const word = compassWord(counted ? counted[1]! : text)
  if (word !== null) {
    const toward = COMPASS8[word]
    const cone = onWalls.filter((e) => dot(outOf(e), toward) > FACING_COS)
    const exact = cone.filter((e) => dot(outOf(e), toward) > EXACT_COS)
    const groups = grouped(exact.length > 0 ? exact : cone)
    const label = counted ? `${word}.${counted[2]}` : word
    let group: Group
    if (counted) {
      const k = Number(counted[2])
      if (!(k >= 1 && k <= groups.length)) refuse(groups.length === 0 ? 'edit.side.none' : 'edit.side.count', { side: facingWay(word), word: label, count: groups.length })
      group = groups[k - 1]!
    } else group = one(groups, facingWay(label))
    const { out, cardinal } = sideOut(group)
    return { edges: group.edges, out, cardinal, called: cardinal !== null ? say('edit.side.called.compass', { side: cardinal }) : say('edit.side.called.compass', { side: say(`edit.side.word.${nearestWord(out)}` as MessageKey) }) }
  }

  // The side shared with another room: "facing hall", "the side facing Hall".
  const facing = /^(?:the\s+side\s+)?facing\s+(.+)$/i.exec(text)
  if (facing) {
    const wanted = facing[1]!.trim().replace(/^["']|["']$/g, '')
    const floor = room.facts.floor
    const others = survey.rooms.filter((r) => r.facts.id !== roomId && r.facts.floor === floor)
    const other = others.find((r) => r.facts.id === wanted) ?? others.find((r) => r.facts.name.toLowerCase() === wanted.toLowerCase())
    if (other === undefined) refuse('edit.side.noRoom', { other: name(wanted) })
    const shared = new Set(other!.edges.flatMap((e) => (e.wall === null ? [] : [e.wall.id])))
    const group = one(grouped(onWalls.filter((e) => shared.has(e.wall!.id))), facingWay(name(roomCalled(other!.facts))))
    const { out, cardinal } = sideOut(group)
    return { edges: group.edges, out, cardinal, called: say('edit.side.called.facing', { other: name(roomCalled(other!.facts)) }) }
  }

  // A wall on the room's outline, by its id.
  const byWall = onWalls.filter((e) => e.wall!.id === text)
  if (byWall.length > 0) {
    const group = one(grouped(byWall), say('edit.side.onWall', { wall: name(text) }))
    const { out, cardinal } = sideOut(group)
    return { edges: group.edges, out, cardinal, called: cardinal !== null ? say('edit.side.called.compass', { side: cardinal }) : say('edit.side.called.wall', { wall: name(text) }) }
  }
  return refuse('edit.side.unknown', { side: name(text) })
}

/** A room's inside size measured across a side: along its way out. */
export function insideAlong(polygon: readonly Vec2[], out: Vec2): number {
  const values = polygon.map((p) => dot(p, out))
  return Math.max(...values) - Math.min(...values)
}
