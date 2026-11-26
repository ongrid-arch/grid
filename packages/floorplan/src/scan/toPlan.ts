/**
 * HND-12: a phone room scan drawn as a plan, by pairing each wall's two faces.
 *
 * A scan sees a wall from the room it stands in: each wall surface it gives is one face, the
 * side of the wall that room sees. A wall between two scanned rooms is seen twice, once from each
 * side, and the gap between its two faces is its thickness. A wall seen from one side only (an
 * outside wall, or one beside a room that was not scanned) has one face, and its thickness is
 * not in the scan.
 *
 * The reading, step by step:
 *
 * 1. Each wall surface becomes a face on the plan: its width along its own direction, at its
 *    middle, seen from above (the scan's x across and its z towards the viewer, so the plan's y
 *    is the scan's -z, C4). A scan has no north: the plan is turned so its longest face runs
 *    across the drawing, by the least turn, and moved so its walls start at 0,0.
 * 2. Each room's outline is its faces, in order round it: the faces along the edges of a floor
 *    outline the scan gives (a floor surface's corners), or, in a scan with no floor outline,
 *    the faces joined end to end round as many rooms as they close round (CMD-33); faces that
 *    close round no room are named as left out. An edge of a floor outline no face lies on is
 *    drawn along the edge. The corners are where neighbouring faces' lines cross, as every room
 *    in Grid is measured (C3).
 * 3. Faces of two rooms that face each other across a gap no wider than a wall
 *    (`scanWallWidest` with a scanned face on each side) are one wall's two faces. Two such faces a little out of parallel are
 *    turned onto one direction about their middles, and the answer says by how much.
 * 4. The rooms are written as rooms text, polygons of their inside faces (WRT-2), and the walls
 *    worked out from them: a wall between two faces is as thick as the gap, and one with a face
 *    on one side only is an outside wall of Grid's usual thickness (`WALL_DEFAULTS`), grown away
 *    from the room from its scanned face. The walls are held to a micrometre (`scanWritten`).
 * 5. Each wall takes the height of its faces; each door, window and opening goes on the wall its
 *    scan names, at its place along it; a toilet and a bath become fixtures (C6). Every part is
 *    marked `scanned` (C8), and every value that was assumed is marked `assumed` and listed.
 *
 * A re-scan keeps the plan's ids: a part whose scan id was seen before, in the scan kept beside
 * the plan (`ScanIds`), keeps the plan id it had. A part with a new scan id gets a new plan id;
 * a part whose scan id is gone from the scan is gone from the plan, and the answer names it.
 *
 * Pure: a scan in, a plan and a report out.
 */
import { DEFAULT_FLOOR_ID, MARKED_VALUES, WALL_DEFAULTS, parseFloorPlan, type Mark, type MarkedPart, type Opening, type RoomUse } from '../types/floorplan'
import { indexPlan } from '../geometry/plan'
import { roomArea } from '../geometry/room'
import { tolerance } from '../geometry/tolerances'
import { compileRoomsText, type RoomFacts, type WrittenPlan } from '../rooms/compile'
import { quoted } from '../types/planText'
import { ScanRefused, type Point3, type RoomScan, type ScanSurface } from './roomModel'

type P = readonly [number, number]

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k]
const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
const cross = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]
const norm = (a: P): number => Math.hypot(a[0], a[1])
const unit = (a: P): P => {
  const n = norm(a)
  return [a[0] / n, a[1] / n]
}
const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

function signedArea(points: readonly P[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

/** Where a local point of a surface is in the capture's frame: the transform, column by column. */
function placed(m: readonly number[], p: Point3): Point3 {
  return [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!]
}

/** A point of the capture's frame seen from above: its x across, its -z up the drawing (C4). */
const fromAbove = (p: Point3): P => [p[0], -p[2]]

/** Where a scan id is in the plan. */
export interface ScanPartRef {
  readonly part: 'wall' | 'room' | 'opening' | 'item'
  readonly id: string
}

/** The plan part each scan id was drawn as, as the scan kept beside the plan records it. */
export type ScanIds = Readonly<Record<string, ScanPartRef>>

/** What the reading assumed: one sentence, and the parts it is about. */
export interface ScanAssumption {
  readonly text: string
  /** The parts it is about, by kind and id; empty for the plan as a whole. */
  readonly parts: readonly { readonly part: MarkedPart; readonly id: string }[]
  /** The value assumed on each of them, when it is one value (`thickness`); null otherwise. */
  readonly value: string | null
}

/** A room's area on the plan beside the scan's own. */
export interface ScanRoomArea {
  readonly id: string
  readonly name: string
  readonly floor: string
  readonly area: number
  readonly scanArea: number
  /** What the scan's area is measured from: its floor outline, or the faces of its walls. */
  readonly from: 'floor outline' | 'wall faces'
  /** (area − scanArea) / scanArea. */
  readonly difference: number
}

/** What a re-scan matched, by the scan's ids. */
export interface ScanMatch {
  /** Plan parts that kept their id because their scan id was seen before. */
  readonly kept: number
  /** Plan parts with a new id: their scan id is new, or there was no scan before. */
  readonly fresh: number
  /** What the scan before had and this one does not: those parts are not in the plan now. */
  readonly gone: readonly { readonly scanId: string; readonly part: ScanPartRef['part']; readonly id: string }[]
}

export interface ScanConversion {
  /** The plan as its file holds it: walls with no height where the scan gives none. */
  readonly plan: WrittenPlan
  readonly rooms: readonly ScanRoomArea[]
  /** The rooms as the rooms writing worked them out: their sizes across. */
  readonly roomFacts: readonly RoomFacts[]
  /** Each wall made from two faces, with the faces and the gap between them. */
  readonly paired: readonly { readonly wall: string; readonly faces: readonly string[]; readonly thickness: number }[]
  /** The walls with a face on one side only. */
  readonly oneSided: readonly string[]
  readonly assumed: readonly ScanAssumption[]
  /** What the scan holds that the plan does not draw, in a sentence each. */
  readonly leftOut: readonly string[]
  /** Where each scan id is in the plan. */
  readonly ids: Readonly<Record<string, ScanPartRef>>
  readonly match: ScanMatch
  /** How the scan's frame was laid on the plan: turned counter-clockwise by `turn` degrees, then moved by `shift`. */
  readonly frame: { readonly turn: number; readonly shift: readonly [number, number] }
  /** What the rooms writing warned of, in its words. */
  readonly warnings: readonly string[]
}

/** What each room type a scan gives is called on the plan, and its use. */
const ROOM_TYPES: Readonly<Record<string, { readonly name: string; readonly use: RoomUse; readonly id: string }>> = {
  bedroom: { name: 'Bedroom', use: 'bedroom', id: 'bedroom' },
  bathroom: { name: 'Bathroom', use: 'bathroom', id: 'bathroom' },
  kitchen: { name: 'Kitchen', use: 'kitchen', id: 'kitchen' },
  livingRoom: { name: 'Living room', use: 'living', id: 'living' },
  living: { name: 'Living room', use: 'living', id: 'living' },
  diningRoom: { name: 'Dining room', use: 'dining', id: 'dining' },
  dining: { name: 'Dining room', use: 'dining', id: 'dining' },
}

/**
 * The objects a scan gives that Grid draws as items (C6), and the kind each is. CNT-45: the
 * furniture and the appliances too, so a robot, a walk-through or a fit-out sees them as the
 * obstacles they are; an appliance is storage, labelled with what the scan calls it.
 */
export const SCAN_FIXTURES: Readonly<Record<string, string>> = {
  toilet: 'toilet',
  bathtub: 'bath',
  sink: 'basin',
  bed: 'bed',
  table: 'table',
  sofa: 'sofa',
  chair: 'chair',
  storage: 'storage',
  refrigerator: 'storage',
  stove: 'storage',
  oven: 'storage',
  dishwasher: 'storage',
  washerDryer: 'storage',
  fireplace: 'storage',
  television: 'storage',
}

/** CNT-45: the label of an object whose kind does not say what it is, and the word its id starts with. */
const SCAN_OBJECT_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  sink: ['Sink', 'sink'],
  refrigerator: ['Fridge', 'fridge'],
  stove: ['Stove', 'stove'],
  oven: ['Oven', 'oven'],
  dishwasher: ['Dishwasher', 'dishwasher'],
  washerDryer: ['Washer-dryer', 'washer-dryer'],
  fireplace: ['Fireplace', 'fireplace'],
  television: ['Television', 'television'],
}

/** Ids that rooms text can carry: a kept id with any other character is given up for a new one. */
const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

interface Face {
  readonly id: string
  readonly story: number
  a: P
  b: P
  readonly height: number
  readonly bottom: number
}

/** One side of a room: a line, and the ids of the faces along it (none where the side follows a floor outline only). */
interface Side {
  p: P
  u: P
  faces: string[]
}

interface RoomDraft {
  readonly story: number
  readonly scanId: string | null
  sides: Side[]
  corners: P[]
  readonly scanArea: number
  readonly from: ScanRoomArea['from']
  label: string | null
  id: string
  name: string
  use: RoomUse | null
}

/** The line of one side crossed with the next: the corner between them, or null when they are parallel. */
function crossing(a: Side, b: Side): P | null {
  const den = cross(a.u, b.u)
  if (Math.abs(den) < tolerance('parallel')) return null
  const t = cross(sub(b.p, a.p), b.u) / den
  return add(a.p, mul(a.u, t))
}

/** The corners of a room, where each side's line crosses the one before it. Corner i starts side i. */
function cornersOf(sides: readonly Side[], room: string): P[] {
  return sides.map((side, i) => {
    const before = sides[(i - 1 + sides.length) % sides.length]!
    const at = crossing(before, side)
    if (at === null) throw new ScanRefused('scan/outline', `The scan was not drawn: two sides of ${room} that follow each other run side by side and make no corner.`)
    return at
  })
}

/** Whether two sides lie on one line, so they are one side. */
function oneLine(a: Side, b: Side): boolean {
  return dot(a.u, b.u) > 0 && Math.abs(cross(a.u, b.u)) <= tolerance('scanFaceTurn') && Math.abs(cross(a.u, sub(b.p, a.p))) <= tolerance('scanFaceReach')
}

/** Sides in a row on one line made one: a wall the scan gave in two pieces, or a floor outline with a corner on a straight side. */
function joinSides(sides: Side[]): Side[] {
  const out = [...sides]
  let changed = true
  while (changed && out.length > 2) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[i]!
      const j = (i + 1) % out.length
      const b = out[j]!
      if (!oneLine(a, b)) continue
      // The side with a face keeps its line; the faces of both stay on it.
      const keep = a.faces.length > 0 || b.faces.length === 0 ? a : b
      const faces = [...a.faces, ...b.faces]
      const joined: Side = { p: keep.p, u: keep.u, faces }
      out.splice(i, 1, joined)
      out.splice(j > i ? j : 0, 1)
      changed = true
      break
    }
  }
  return out
}

const deg = (radians: number): number => (radians * 180) / Math.PI

/** A number as the rooms text written here holds it: to a nanometre, no trailing zeros. */
function written(value: number): string {
  const text = value.toFixed(9).replace(/\.?0+$/, '')
  return text === '-0' || text === '' ? '0' : text
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/** A list of quoted ids, the first ten. */
function idList(ids: readonly string[]): string {
  const shown = ids.slice(0, 10).map(quoted).join(', ')
  return ids.length > 10 ? `${shown} and ${ids.length - 10} more` : shown
}

/**
 * Draws a scan as a plan. `previous` is where each scan id was drawn the last time, from the
 * scan kept beside the plan; null for a first scan. Throws `ScanRefused` for a scan whose walls
 * do not make rooms Grid can draw, saying why.
 */
export function planFromScan(scan: RoomScan, previous: ScanIds | null = null): ScanConversion {
  const assumed: ScanAssumption[] = []
  const leftOut: string[] = []
  const idsOut: Record<string, ScanPartRef> = {}
  const byList = (list: ScanSurface['list']): ScanSurface[] => scan.surfaces.filter((s) => s.list === list)

  // 1. Faces, seen from above, in the capture's frame.
  const faces: Face[] = []
  let noLength = 0
  for (const s of byList('walls')) {
    let [x0, x1, y0, y1] = [-s.dimensions[0] / 2, s.dimensions[0] / 2, -s.dimensions[1] / 2, s.dimensions[1] / 2]
    if (s.corners.length >= 2) {
      const xs = s.corners.map((c) => c[0])
      const ys = s.corners.map((c) => c[1])
      ;[x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    }
    const a = fromAbove(placed(s.transform, [x0, 0, 0]))
    const b = fromAbove(placed(s.transform, [x1, 0, 0]))
    if (norm(sub(b, a)) <= tolerance('noLength')) {
      noLength++
      continue
    }
    faces.push({ id: s.id, story: s.story ?? 0, a, b, height: y1 - y0, bottom: placed(s.transform, [0, y0, 0])[1] })
  }
  if (noLength > 0) leftOut.push(`${plural(noLength, 'wall')} of no length across the floor: kept in the scan beside the plan, not drawn.`)
  if (faces.length === 0) throw new ScanRefused('scan/no-walls', 'The scan was not drawn: none of its walls has a length across the floor.')

  // The frame: the longest face across the drawing, by the least turn, and the walls from 0,0.
  const longest = faces.reduce((best, f) => (norm(sub(f.b, f.a)) > norm(sub(best.b, best.a)) ? f : best))
  const quarter = Math.PI / 2
  let turn = -Math.atan2(longest.b[1] - longest.a[1], longest.b[0] - longest.a[0])
  turn -= quarter * Math.round(turn / quarter)
  if (Math.abs(turn) <= tolerance('noTurn')) turn = 0
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)]
  const rotate = (p: P): P => [cos * p[0] - sin * p[1], sin * p[0] + cos * p[1]]

  // Floor outlines, seen from above.
  interface FloorOutline {
    readonly id: string
    readonly story: number
    points: P[]
    readonly level: number
  }
  const outlines: FloorOutline[] = []
  for (const s of byList('floors')) {
    let local: Point3[] = [...s.corners]
    if (local.length < 3) {
      const [w, h, d] = [s.dimensions[0] / 2, s.dimensions[1] / 2, s.dimensions[2] / 2]
      const flat: Point3[] = [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]]
      const upright: Point3[] = [[-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d]]
      const areaOf = (pts: Point3[]): number => Math.abs(signedArea(pts.map((p) => fromAbove(placed(s.transform, p)))))
      local = areaOf(flat) >= areaOf(upright) ? flat : upright
    }
    const world = local.map((p) => placed(s.transform, p))
    const points = world.map(fromAbove)
    if (Math.abs(signedArea(points)) <= tolerance('noArea')) {
      leftOut.push(`A floor outline with no area (${quoted(s.id)}): kept in the scan beside the plan, not used.`)
      continue
    }
    outlines.push({ id: s.id, story: s.story ?? 0, points, level: world.reduce((sum, p) => sum + p[1], 0) / world.length })
  }

  const rotated = [...faces.flatMap((f) => [rotate(f.a), rotate(f.b)]), ...outlines.flatMap((o) => o.points.map(rotate))]
  const shift: [number, number] = [-Math.min(...rotated.map((p) => p[0])), -Math.min(...rotated.map((p) => p[1]))]
  const place = (p: P): P => add(rotate(p), shift)
  for (const f of faces) {
    f.a = place(f.a)
    f.b = place(f.b)
  }
  for (const o of outlines) {
    o.points = o.points.map(place)
    if (signedArea(o.points) < 0) o.points.reverse()
  }
  const turnText = turn === 0 ? null : `${Math.abs(deg(turn)).toFixed(2)}° ${turn > 0 ? 'counter-clockwise' : 'clockwise'}`
  assumed.push({
    text: `A scan has no north: ${turnText === null ? 'its longest wall runs across the drawing already, and' : `the plan is the scan turned ${turnText} so its longest wall runs across the drawing, and`} moved so its walls start at 0,0. The scan's own frame is kept beside the plan.`,
    parts: [],
    value: null,
  })

  // 2. Each storey's rooms: from its floor outlines, or its faces joined end to end round each room they close.
  const stories = [...new Set(faces.map((f) => f.story))].sort((a, b) => a - b)
  const levelOf = new Map<number, number>()
  for (const story of stories) {
    const own = outlines.filter((o) => o.story === story)
    levelOf.set(story, own.length > 0 ? own.reduce((s, o) => s + o.level, 0) / own.length : Math.min(...faces.filter((f) => f.story === story).map((f) => f.bottom)))
  }
  const drafts: RoomDraft[] = []
  const unjoined: string[] = []
  for (const story of stories) {
    const own = faces.filter((f) => f.story === story)
    const floors = outlines.filter((o) => o.story === story)
    if (floors.length > 0) {
      for (const outline of floors) {
        const sides = joinSides(outline.points.map((p, i) => sideOnFaces(p, outline.points[(i + 1) % outline.points.length]!, own)))
        if (sides.length < 3) throw new ScanRefused('scan/outline', `The scan was not drawn: the floor outline ${quoted(outline.id)} has fewer than three straight sides.`)
        drafts.push(draft(story, outline.id, sides, Math.abs(signedArea(outline.points)), 'floor outline'))
      }
    } else {
      const { rooms, rest } = roomsOfFaces(own)
      unjoined.push(...rest)
      const key = scan.id === null ? null : stories.length > 1 ? `${scan.id}#${story}` : scan.id
      rooms.forEach(({ sides, longest }, i) => {
        const room = draft(story, key === null ? null : i === 0 ? key : `${key}/${longest}`, sides, 0, 'wall faces')
        drafts.push({ ...room, scanArea: Math.abs(signedArea(room.corners)) })
      })
    }
  }
  if (unjoined.length > 0) leftOut.push(`${plural(unjoined.length, 'wall face')} that close round no room: kept in the scan beside the plan, not drawn (${idList(unjoined)}).`)

  // 3. Two faces of one wall a little out of parallel are turned onto one direction.
  const { turned, wide } = pairFaces(drafts)
  for (const t of turned) {
    assumed.push({ text: `The two faces ${quoted(t.faces[0])} and ${quoted(t.faces[1])} of one wall are ${t.degrees.toFixed(2)}° out of parallel: both are turned onto one direction about their middles.`, parts: [], value: null })
  }
  for (const d of drafts) d.corners = cornersOf(d.sides, 'a room of the scan')

  // Room types from the scan's sections, and the rooms' ids.
  for (const d of drafts) {
    const inside = scan.sections.filter((s) => (s.story ?? 0) === d.story && s.label !== null && contains(d.corners, place(fromAbove(s.center))))
    d.label = inside.find((s) => ROOM_TYPES[s.label!] !== undefined)?.label ?? null
  }
  // Ids: one set for each kind of part. A kept id is taken first; a new one never takes it.
  const taken: Record<ScanPartRef['part'], Set<string>> = { wall: new Set(), room: new Set(), opening: new Set(), item: new Set() }
  const kept: Record<ScanPartRef['part'], Set<string>> = { wall: new Set(), room: new Set(), opening: new Set(), item: new Set() }
  /** The id the first of these scan ids had in the plan before, if it is free; it is taken. */
  const keep = (scanIds: readonly string[], part: ScanPartRef['part']): string | null => {
    if (previous === null) return null
    for (const sid of scanIds) {
      const was = Object.hasOwn(previous, sid) ? previous[sid] : undefined
      if (was === undefined || was.part !== part || taken[part].has(was.id) || !PLAIN_ID.test(was.id)) continue
      taken[part].add(was.id)
      kept[part].add(was.id)
      return was.id
    }
    return null
  }
  // An id the plan had before is never given to a new part, so a gone part's facts never pass to another.
  const before: Record<ScanPartRef['part'], Set<string>> = { wall: new Set(), room: new Set(), opening: new Set(), item: new Set() }
  for (const ref of Object.values(previous ?? {})) before[ref.part]?.add(ref.id)
  const counts = new Map<string, number>()
  /** A new id: `base`, then `base-2`; a base ending in a dash is numbered from 1. */
  const fresh = (part: ScanPartRef['part'], base: string): string => {
    const numbered = base.endsWith('-')
    const stem = numbered ? base.slice(0, -1) : base
    let n = counts.get(`${part}\u0000${base}`) ?? 0
    let id: string
    do {
      n++
      id = !numbered && n === 1 ? stem : `${stem}-${n}`
    } while (taken[part].has(id) || before[part].has(id))
    counts.set(`${part}\u0000${base}`, n)
    taken[part].add(id)
    return id
  }
  for (const d of drafts) {
    const id = d.scanId === null ? null : keep([d.scanId], 'room')
    if (id !== null) d.id = id
  }
  // Doors, windows, openings and objects seen before keep their ids before any new one is made.
  const reserved = new Map<string, string>()
  for (const s of scan.surfaces) {
    const part = s.list === 'objects' ? 'item' : s.list === 'doors' || s.list === 'windows' || s.list === 'openings' ? 'opening' : null
    if (part === null) continue
    const id = keep([s.id], part)
    if (id !== null) reserved.set(s.id, id)
  }
  // A room's type gives its id and name; a second of one type gets a number.
  const named = new Map<string, number>()
  let unnamed = 0
  for (const d of drafts) {
    const type = d.label === null ? undefined : ROOM_TYPES[d.label]
    if (type !== undefined) {
      const n = (named.get(type.name) ?? 0) + 1
      named.set(type.name, n)
      d.name = n === 1 ? type.name : `${type.name} ${n}`
      d.use = type.use
      if (d.id === '') d.id = fresh('room', type.id)
    } else {
      unnamed++
      d.name = `Room ${unnamed}`
      d.use = null
      if (d.id === '') d.id = fresh('room', 'room-')
    }
  }
  const noType = drafts.filter((d) => d.use === null)
  if (noType.length > 0) {
    assumed.push({
      text: `${noType.length === 1 ? `Room ${quoted(noType[0]!.id)} has` : `${noType.length} rooms have`} no room type in the scan: named ${noType.map((d) => quoted(d.name)).join(', ')}, with no use stated. Ask what ${noType.length === 1 ? 'it is' : 'each is'} for.`,
      parts: noType.map((d) => ({ part: 'room' as const, id: d.id })),
      value: 'use',
    })
  }

  // 4. The rooms as rooms text, and the walls worked out from them.
  const thick = WALL_DEFAULTS.solid.thickness
  const floorIds = new Map<number, string>(stories.map((s) => [s, stories.length === 1 || s === 0 ? DEFAULT_FLOOR_ID : `storey${s < 0 ? '-minus' : '-'}${Math.abs(s)}`]))
  const ground = levelOf.get(stories.includes(0) ? 0 : stories[0]!)!
  const lines = [`walls outside ${written(thick)} inside ${written(thick)}`]
  for (const story of stories) {
    if (stories.length > 1) {
      const name = story === 0 ? 'Ground floor' : `Storey ${story}`
      lines.push(`floor ${floorIds.get(story)!} "${name}" level ${story} elevation ${written(levelOf.get(story)! - ground)}`)
    }
    const widths = new Map<string, number>()
    for (const { a, b, gap } of wide) {
      if (a.story !== story) continue
      const key = `wall between ${a.id} and ${b.id}`
      widths.set(key, Math.max(gap, widths.get(key) ?? 0))
    }
    for (const [wall, gap] of widths) lines.push(`${wall} ${written(gap)}`)
    for (const d of drafts.filter((r) => r.story === story)) {
      lines.push(`room ${d.id} "${d.name}" ${d.use ?? '-'} polygon ${d.corners.map((c) => `${written(c[0])},${written(c[1])}`).join(' ')}`)
    }
  }
  const places = Math.round(-Math.log10(tolerance('scanWritten')))
  const result = compileRoomsText(lines.join('\n'), { places })
  if (result.plan === null) {
    const why = result.problems.map((p) => p.message.replace(/ \(line \d+\)/g, '').replace(/^line \d+: /, '')).join(' ')
    throw new ScanRefused(`scan/${(result.problems[0]?.code ?? 'rooms/syntax').replace(/^rooms\//, '')}`, `The scan was not drawn as rooms: ${why}`)
  }
  const fix = (v: number): number => {
    const scale = 10 ** places
    const r = Math.round(v * scale) / scale
    return Object.is(r, -0) || r === 0 ? 0 : r
  }

  // 5. Which faces each wall carries, its height, and its id.
  const faceById = new Map(faces.map((f) => [f.id, f]))
  const plan = result.plan
  const roomFloor = (d: RoomDraft): string => floorIds.get(d.story)!
  interface WallFaces {
    faces: { id: string; overlap: number }[]
    /** Which sides of the wall a room was found on: left and right as it runs. */
    sides: Set<'left' | 'right'>
  }
  const carried = new Map<string, WallFaces>(plan.walls.map((w) => [w.id, { faces: [], sides: new Set<'left' | 'right'>() }]))
  for (const d of drafts) {
    d.sides.forEach((side, i) => {
      const c0 = d.corners[i]!
      const c1 = d.corners[(i + 1) % d.corners.length]!
      const middle = mid(c0, c1)
      for (const w of plan.walls) {
        if ((w.floor ?? DEFAULT_FLOOR_ID) !== roomFloor(d)) continue
        const wu = unit(sub(w.end, w.start))
        const length = norm(sub(w.end, w.start))
        if (Math.abs(cross(wu, side.u)) > tolerance('scanFaceTurn')) continue
        if (Math.abs(Math.abs(cross(wu, sub(middle, w.start))) - w.thickness / 2) > tolerance('roomsFaceStep')) continue
        const [p0, p1] = [dot(sub(c0, w.start), wu), dot(sub(c1, w.start), wu)].sort((x, y) => x - y) as [number, number]
        if (Math.min(length, p1) - Math.max(0, p0) <= tolerance('roomsWritten')) continue
        const entry = carried.get(w.id)!
        // A room on each side makes a wall between two rooms, as thick as the gap between their outlines.
        entry.sides.add(cross(wu, sub(middle, w.start)) > 0 ? 'left' : 'right')
        for (const fid of side.faces) {
          const face = faceById.get(fid)
          if (face === undefined) continue
          const [q0, q1] = [dot(sub(face.a, w.start), wu), dot(sub(face.b, w.start), wu)].sort((x, y) => x - y) as [number, number]
          const overlap = Math.min(length, q1, p1) - Math.max(0, q0, p0)
          if (overlap > tolerance('roomsWritten') && !entry.faces.some((e) => e.id === fid)) entry.faces.push({ id: fid, overlap })
        }
      }
    })
  }
  for (const entry of carried.values()) entry.faces.sort((a, b) => b.overlap - a.overlap)

  const wallIds = new Map<string, string>()
  for (const w of plan.walls) {
    const id = keep(carried.get(w.id)!.faces.map((f) => f.id), 'wall')
    if (id !== null) wallIds.set(w.id, id)
  }
  for (const w of plan.walls) if (!wallIds.has(w.id)) wallIds.set(w.id, fresh('wall', w.id))
  const oneSided: string[] = []
  const paired: { wall: string; faces: string[]; thickness: number }[] = []
  const faceless: string[] = []
  const heightsDiffer: string[] = []
  const walls = plan.walls.map((w) => {
    const id = wallIds.get(w.id)!
    const entry = carried.get(w.id)!
    const heights = entry.faces.map((f) => faceById.get(f.id)!.height)
    if (w.virtual !== true) {
      if (entry.sides.size === 2) paired.push({ wall: id, faces: entry.faces.map((f) => f.id), thickness: w.thickness })
      else oneSided.push(id)
    }
    if (heights.length === 0) {
      faceless.push(id)
      // The rooms text states no height, so the wall has none: the reading gives it its floor's.
      return { ...w, id }
    }
    if (Math.max(...heights) - Math.min(...heights) > tolerance('scanFaceReach')) heightsDiffer.push(id)
    return { ...w, id, height: fix(Math.max(...heights)) }
  })
  const rename = (id: string): string => wallIds.get(id) ?? id
  const rooms = plan.rooms.map((r) => ({ ...r, boundary: r.boundary.map(rename), ...(r.holes ? { holes: r.holes.map((h) => h.map(rename)) } : {}) }))
  if (oneSided.length > 0) {
    assumed.push({
      text: `${oneSided.length === 1 ? 'One wall was' : `${oneSided.length} walls were`} scanned from one side only, so ${oneSided.length === 1 ? 'its' : 'each one\'s'} thickness is not in the scan: taken as an outside wall ${thick} m thick, Grid's usual wall, grown away from the room from its scanned face (${idList(oneSided)}). Confirm the thickness, and that ${oneSided.length === 1 ? 'it is an outside wall' : 'each is an outside wall'}.`,
      parts: oneSided.map((id) => ({ part: 'wall' as const, id })),
      value: 'thickness',
    })
  }
  if (faceless.length > 0) {
    assumed.push({
      text: `${plural(faceless.length, 'wall')} follow the floor's outline where the scan has no wall face: no height is stated, so ${faceless.length === 1 ? 'it is' : 'they are'} drawn at the floor's or Grid's height (${idList(faceless)}).`,
      parts: faceless.map((id) => ({ part: 'wall' as const, id })),
      value: 'height',
    })
  }
  if (heightsDiffer.length > 0) {
    assumed.push({ text: `The faces of ${plural(heightsDiffer.length, 'wall')} were scanned at heights more than ${tolerance('scanFaceReach')} m apart: each is drawn as high as its tallest face (${idList(heightsDiffer)}).`, parts: heightsDiffer.map((id) => ({ part: 'wall' as const, id })), value: 'height' })
  }

  // Doors, windows and openings, on the wall the scan names.
  interface PlacedWall {
    readonly id: string
    readonly floor: string
    readonly start: P
    readonly u: P
    readonly length: number
    readonly thickness: number
    readonly faces: ReadonlySet<string>
  }
  const placedWalls: PlacedWall[] = walls.map((w, i) => ({
    id: w.id,
    floor: w.floor ?? DEFAULT_FLOOR_ID,
    start: w.start,
    u: unit(sub(w.end, w.start)),
    length: norm(sub(w.end, w.start)),
    thickness: w.thickness,
    faces: new Set(carried.get(plan.walls[i]!.id)!.faces.map((f) => f.id)),
  }))
  const surfaceAt = (s: ScanSurface): { at: P; u: P } => {
    const m = s.transform
    const dir = rotate([m[0]!, -m[2]!])
    return { at: place(fromAbove([m[12]!, m[13]!, m[14]!])), u: norm(dir) > tolerance('noLength') ? unit(dir) : [1, 0] }
  }
  const openings: Opening[] = []
  const undecided: string[] = []
  const nearest: string[] = []
  const nudged: string[] = []
  let dropped = 0
  let twice = 0
  const kinds = { doors: 'door', windows: 'window', openings: 'opening' } as const
  for (const list of ['doors', 'windows', 'openings'] as const) {
    for (const s of byList(list)) {
      const story = s.story ?? (s.parent !== null ? faceById.get(s.parent)?.story : undefined) ?? 0
      const floor = floorIds.get(story)
      const { at, u } = surfaceAt(s)
      const [width, height] = [s.dimensions[0], s.dimensions[1]]
      const across = (w: PlacedWall): number => Math.abs(cross(w.u, sub(at, w.start)))
      const along = (w: PlacedWall): number => dot(sub(at, w.start), w.u)
      const within = (w: PlacedWall): boolean => along(w) >= -tolerance('scanFaceReach') && along(w) <= w.length + tolerance('scanFaceReach')
      const onFloor = placedWalls.filter((w) => w.floor === floor)
      let host = s.parent === null ? undefined : onFloor.filter((w) => w.faces.has(s.parent!) && within(w)).sort((a, b) => across(a) - across(b))[0]
      if (host === undefined) {
        host = onFloor
          .filter((w) => Math.abs(cross(w.u, u)) <= tolerance('scanFaceTurn') && across(w) <= w.thickness / 2 + tolerance('scanFaceReach') && within(w))
          .sort((a, b) => across(a) - across(b))[0]
        if (host !== undefined) nearest.push(s.id)
      }
      if (host === undefined || floor === undefined || !(width > 0) || !(height > 0) || width > host.length + tolerance('joint')) {
        dropped++
        continue
      }
      const want = along(host) - width / 2
      const offset = Math.min(Math.max(want, 0), Math.max(host.length - width, 0))
      if (Math.abs(offset - want) > tolerance('scanFaceReach')) nudged.push(s.id)
      const bottom = s.transform[13]! - height / 2 - levelOf.get(story)!
      const type = kinds[list]
      const sill = type === 'window' || Math.abs(bottom) > tolerance('scanOnFloor') ? Math.max(bottom, 0) : 0
      // A door seen from both rooms is in the scan twice: the second on the same stretch of wall is that door.
      const lo = fix(offset)
      if (openings.some((o) => o.wall === host!.id && o.type === type && Math.min(o.offset + o.width, lo + width) - Math.max(o.offset, lo) > Math.min(o.width, width) / 2)) {
        twice++
        continue
      }
      const id = reserved.get(s.id) ?? fresh('opening', `${type}-`)
      // CNT-45: whether the capture saw a door open, kept as a fact on it.
      const seen = type === 'door' && s.open !== null ? { properties: { scannedOpen: s.open } } : {}
      openings.push({ id, wall: host.id, type, offset: fix(offset), width: fix(width), sill: fix(sill), height: fix(height), ...seen })
      if (type === 'door') undecided.push(id)
      idsOut[s.id] = { part: 'opening', id }
    }
  }
  if (dropped > 0) leftOut.push(`${plural(dropped, 'door, window or opening', 'doors, windows or openings')} the scan places on no wall Grid drew, or wider than the wall: kept in the scan beside the plan, not drawn.`)
  if (twice > 0) leftOut.push(`${plural(twice, 'door, window or opening', 'doors, windows or openings')} the scan gives twice, once from each room: drawn once.`)
  if (undecided.length > 0) {
    assumed.push({ text: `A scan does not say which side a door is hinged on or which way it opens: ${plural(undecided.length, 'door')} ${undecided.length === 1 ? 'is' : 'are'} left undecided, drawn with no swing (${idList(undecided)}).`, parts: undecided.map((id) => ({ part: 'opening' as const, id })), value: 'hinge' })
  }
  if (nearest.length > 0) {
    const ids = nearest.map((sid) => idsOut[sid]!.id)
    assumed.push({ text: `${plural(nearest.length, 'opening')} name no wall the plan drew from the scan: each is placed on the wall nearest it (${idList(ids)}).`, parts: ids.map((id) => ({ part: 'opening' as const, id })), value: null })
  }
  if (nudged.length > 0) {
    const ids = nudged.map((sid) => idsOut[sid]!.id)
    assumed.push({ text: `${plural(nudged.length, 'opening')} ran past the end of ${nudged.length === 1 ? 'its' : 'their'} wall: moved along it to fit (${idList(ids)}).`, parts: ids.map((id) => ({ part: 'opening' as const, id })), value: 'offset' })
  }

  // Fixtures, furniture and appliances (CNT-45). A stair the scan boxes is kept, not drawn.
  const items: NonNullable<WrittenPlan['items']>[number][] = []
  const notDrawn = new Map<string, number>()
  for (const s of byList('objects')) {
    const kind = s.category === null ? undefined : SCAN_FIXTURES[s.category]
    const [width, height, depth] = s.dimensions
    if (kind === undefined || !(width > 0 && height > 0 && depth > 0)) {
      const what = s.category ?? 'a kind Grid does not know'
      notDrawn.set(what, (notDrawn.get(what) ?? 0) + 1)
      continue
    }
    const { at, u } = surfaceAt(s)
    const named = s.category === null ? undefined : SCAN_OBJECT_LABELS[s.category]
    const id = reserved.get(s.id) ?? fresh('item', `${named?.[1] ?? kind}-`)
    const floor = floorIds.get(s.story ?? 0) ?? DEFAULT_FLOOR_ID
    let turnDeg = deg(Math.atan2(u[1], u[0]))
    if (turnDeg <= -180) turnDeg += 360
    items.push({ id, kind, at: [fix(at[0]), fix(at[1])], size: [fix(width), fix(depth)], height: fix(height), ...(Math.abs(turnDeg) > tolerance('noTurn') ? { turn: fix(turnDeg) } : {}), ...(stories.length > 1 ? { floor } : {}), ...(named === undefined ? {} : { label: named[0] }) })
    idsOut[s.id] = { part: 'item', id }
  }
  if (notDrawn.size > 0) leftOut.push(`Objects that are not fixtures Grid draws, kept in the scan beside the plan: ${[...notDrawn].map(([what, n]) => `${n} ${what}`).join(', ')}.`)
  if (items.length > 0) {
    assumed.push({ text: `A scan's box does not say which side of a fixture is its front: ${plural(items.length, 'fixture')} ${items.length === 1 ? 'is' : 'are'} turned as ${items.length === 1 ? 'its box lies' : 'their boxes lie'}, and may face the other way (${idList(items.map((i) => i.id))}).`, parts: items.map((i) => ({ part: 'item' as const, id: i.id })), value: 'turn' })
  }
  if (stories.length > 1 && outlines.length === 0) {
    assumed.push({ text: 'The scan gives no floor outline, so each storey\'s floor is taken to be at the foot of its lowest wall.', parts: [], value: 'elevation' })
  }

  // Every scan id and the part it is drawn as.
  for (const d of drafts) if (d.scanId !== null) idsOut[d.scanId] = { part: 'room', id: d.id }
  // A face along two walls (one inside, one outside) is kept as the one it runs along further.
  const longestRun = new Map<string, { wall: string; overlap: number }>()
  for (const [i, w] of plan.walls.entries()) {
    for (const f of carried.get(w.id)!.faces) {
      const best = longestRun.get(f.id)
      if (best === undefined || f.overlap > best.overlap) longestRun.set(f.id, { wall: walls[i]!.id, overlap: f.overlap })
    }
  }
  for (const [fid, run] of longestRun) idsOut[fid] = { part: 'wall', id: run.wall }

  // Where each value came from (C8): every part scanned, and what was assumed.
  const marks: Mark[] = [
    ...walls.map((w) => ({ part: 'wall' as const, id: w.id, source: 'scanned' as const })),
    ...rooms.map((r) => ({ part: 'room' as const, id: r.id, source: 'scanned' as const })),
    ...openings.map((o) => ({ part: 'opening' as const, id: o.id, source: 'scanned' as const })),
    ...items.map((i) => ({ part: 'item' as const, id: i.id, source: 'scanned' as const })),
  ]
  for (const a of assumed) {
    if (a.value === null) continue
    for (const p of a.parts) {
      const values: readonly string[] = MARKED_VALUES[p.part]
      // A value the plan leaves unstated or undecided is not marked: it says so itself.
      if (!values.includes(a.value) || a.value === 'height' || a.value === 'hinge' || a.value === 'use') continue
      marks.push({ part: p.part, id: p.id, value: a.value, source: 'assumed' })
    }
  }

  const out: WrittenPlan = {
    ...plan,
    walls,
    rooms,
    openings,
    ...(items.length > 0 ? { items } : {}),
    marks,
  }

  // The rooms' areas on the plan beside the scan's.
  let parsed
  try {
    parsed = parseFloorPlan(out)
  } catch {
    throw new ScanRefused('scan/schema', 'The scan was not drawn: the plan it makes does not fit the plan\'s format.')
  }
  const index = indexPlan(parsed)
  const areas: ScanRoomArea[] = drafts.map((d) => {
    const room = parsed.rooms.find((r) => r.id === d.id)!
    let area = Number.NaN
    try {
      area = roomArea(room, index)
    } catch {
      // A room Grid cannot measure keeps NaN, and its difference says so.
    }
    return { id: d.id, name: d.name, floor: roomFloor(d), area, scanArea: d.scanArea, from: d.from, difference: (area - d.scanArea) / d.scanArea }
  })

  // What a re-scan matched.
  const now = new Set(Object.keys(idsOut))
  const gone = previous === null ? [] : Object.entries(previous).filter(([sid]) => !now.has(sid)).map(([scanId, ref]) => ({ scanId, part: ref.part, id: ref.id }))
  const total = walls.length + rooms.length + openings.length + items.length
  const keptNow = walls.filter((w) => kept.wall.has(w.id)).length + rooms.filter((r) => kept.room.has(r.id)).length + openings.filter((o) => kept.opening.has(o.id)).length + items.filter((i) => kept.item.has(i.id)).length
  return {
    plan: out,
    rooms: areas,
    roomFacts: result.rooms,
    paired,
    oneSided,
    assumed,
    leftOut,
    ids: { ...idsOut },
    match: { kept: keptNow, fresh: total - keptNow, gone },
    frame: { turn: deg(turn), shift },
    warnings: result.warnings.map((w) => w.message.replace(/ \(line \d+\)/g, '').replace(/^Line \d+ /, '')),
  }
}

function draft(story: number, scanId: string | null, sides: Side[], scanArea: number, from: ScanRoomArea['from']): RoomDraft {
  return { story, scanId, sides, corners: cornersOf(sides, 'a room of the scan'), scanArea, from, label: null, id: '', name: '', use: null }
}

/** The side of a floor outline's edge from `p` to `q`: on the faces along it, or the edge itself. */
function sideOnFaces(p: P, q: P, faces: readonly Face[]): Side {
  const length = norm(sub(q, p))
  const u = unit(sub(q, p))
  const near = faces.flatMap((f) => {
    const fu = unit(sub(f.b, f.a))
    if (Math.abs(cross(u, fu)) > tolerance('scanFaceTurn')) return []
    if (Math.abs(cross(u, sub(mid(f.a, f.b), p))) > tolerance('scanFaceReach')) return []
    const [s0, s1] = [dot(sub(f.a, p), u), dot(sub(f.b, p), u)].sort((a, b) => a - b) as [number, number]
    const overlap = Math.min(length, s1) - Math.max(0, s0)
    return overlap > tolerance('joint') ? [{ f, overlap, s0, fu: dot(fu, u) < 0 ? mul(fu, -1) : fu }] : []
  })
  if (near.length === 0) return { p, u, faces: [] }
  const primary = near.reduce((best, n) => (n.overlap > best.overlap ? n : best))
  return { p: primary.f.a, u: primary.fu, faces: near.sort((a, b) => a.s0 - b.s0).map((n) => n.f.id) }
}

/**
 * The faces of a storey with no floor outline, joined end to end round as many rooms as they
 * close round. Each room starts from the longest face not yet in one; a face no room starts
 * from or reaches is left over. The first room holds the storey's longest face. Throws
 * `scan/not-closed` when no room closes, after the longest face's chain.
 */
function roomsOfFaces(faces: readonly Face[]): { rooms: { sides: Side[]; longest: string }[]; rest: string[] } {
  const length = (f: Face): number => norm(sub(f.b, f.a))
  let left = [...faces].sort((x, y) => length(y) - length(x))
  const rooms: { sides: Side[]; longest: string }[] = []
  let firstStop: string | null = null
  for (;;) {
    let found: { sides: Side[]; used: Set<Face> } | null = null
    for (const start of left) {
      const chain = chainFaces(start, left)
      if ('stop' in chain) {
        firstStop ??= chain.stop
        continue
      }
      found = chain
      rooms.push({ sides: chain.sides, longest: start.id })
      break
    }
    if (found === null) break
    const used = found.used
    left = left.filter((f) => !used.has(f))
  }
  if (rooms.length === 0) {
    throw new ScanRefused(
      'scan/not-closed',
      `The scan was not drawn: it gives no floor outline, and its walls do not close round a room. After the wall ${quoted(firstStop!)}, no other wall begins within ${tolerance('scanCornerGap')} m. A scan with no floor outline is read as the rooms its walls close round, each joined end to end.`,
    )
  }
  return { rooms, rest: left.map((f) => f.id) }
}

/** The faces joined end to end from `first` round one room, or the face after which no other begins. */
function chainFaces(first: Face, faces: readonly Face[]): { sides: Side[]; used: Set<Face> } | { stop: string } {
  const gap = tolerance('scanCornerGap')
  const used = new Set<Face>([first])
  const run: { f: Face; a: P; b: P }[] = [{ f: first, a: first.a, b: first.b }]
  for (;;) {
    const end = run[run.length - 1]!.b
    const home = norm(sub(end, run[0]!.a))
    let best: { f: Face; a: P; b: P; d: number } | null = null
    for (const f of faces) {
      if (used.has(f)) continue
      for (const [a, b] of [[f.a, f.b], [f.b, f.a]] as const) {
        const d = norm(sub(a, end))
        if (d <= gap && (best === null || d < best.d)) best = { f, a, b, d }
      }
    }
    if (best !== null && best.d < home) {
      used.add(best.f)
      run.push(best)
      continue
    }
    if (home <= gap && run.length >= 3) break
    return { stop: run[run.length - 1]!.f.id }
  }
  let sides: Side[] = run.map((r) => ({ p: r.a, u: unit(sub(r.b, r.a)), faces: [r.f.id] }))
  sides = joinSides(sides)
  if (sides.length < 3) return { stop: run[run.length - 1]!.f.id }
  let corners: P[]
  try {
    corners = cornersOf(sides, 'the room of the scan')
  } catch (error) {
    if (error instanceof ScanRefused) return { stop: run[run.length - 1]!.f.id }
    throw error
  }
  if (Math.abs(signedArea(corners)) <= tolerance('noArea')) return { stop: run[run.length - 1]!.f.id }
  if (signedArea(corners) < 0) {
    sides = sides.reverse().map((s) => ({ ...s, u: mul(s.u, -1) }))
  }
  return { sides, used }
}

/** Whether a point is inside a polygon. */
function contains(poly: readonly P[], pt: P): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/**
 * Sides of two rooms on one storey that face each other across a gap no wider than a wall are
 * the two faces of that wall. Where two such faces are a little out of parallel, both are turned
 * onto one direction about the middle of what they share, so the wall between them can be drawn;
 * a side already turned for another wall turns the next one onto itself. Longest shared stretch
 * first. Returns the pairs that were turned and by how much.
 */
function pairFaces(rooms: RoomDraft[]): {
  turned: { faces: [string, string]; degrees: number }[]
  wide: { a: RoomDraft; b: RoomDraft; gap: number }[]
} {
  interface Pair {
    a: RoomDraft
    b: RoomDraft
    s: Side
    t: Side
    overlap: number
    gap: number
    pivotS: P
    pivotT: P
  }
  const pairs: Pair[] = []
  const segments = new Map<Side, [P, P]>()
  for (const r of rooms) r.sides.forEach((side, i) => segments.set(side, [r.corners[i]!, r.corners[(i + 1) % r.corners.length]!]))
  for (const a of rooms) {
    for (const b of rooms) {
      if (a === b || a.story !== b.story || rooms.indexOf(a) > rooms.indexOf(b)) continue
      for (const s of a.sides) {
        const [s0, s1] = segments.get(s)!
        const ls = norm(sub(s1, s0))
        const n: P = [s.u[1], -s.u[0]]
        for (const t of b.sides) {
          if (dot(s.u, t.u) >= 0 || Math.abs(cross(s.u, t.u)) > tolerance('scanFaceTurn')) continue
          const [t0, t1] = segments.get(t)!
          const [lo, hi] = [dot(sub(t0, s0), s.u), dot(sub(t1, s0), s.u)].sort((x, y) => x - y) as [number, number]
          const [o0, o1] = [Math.max(0, lo), Math.min(ls, hi)]
          if (o1 - o0 <= tolerance('joint')) continue
          const pivotS = add(s0, mul(s.u, (o0 + o1) / 2))
          const pivotT = add(t.p, mul(t.u, dot(sub(pivotS, t.p), t.u)))
          const gap = dot(sub(mid(t0, t1), s0), n)
          const widest = s.faces.length > 0 && t.faces.length > 0 ? tolerance('scanWallWidest') : tolerance('roomsWallWidest')
          if (gap <= 0 || gap > widest + tolerance('scanWritten')) continue
          pairs.push({ a, b, s, t, gap, overlap: o1 - o0, pivotS, pivotT })
        }
      }
    }
  }
  pairs.sort((x, y) => y.overlap - x.overlap)
  const fixed = new Set<Side>()
  const turned: { faces: [string, string]; degrees: number }[] = []
  const wide: Pair[] = []
  for (const pair of pairs) {
    if (pair.gap > tolerance('roomsWallWidest')) {
      // A nearer face across the same stretch separates these rooms.
      const blocked = (side: Side, pivot: P): boolean => pairs.some((other) => {
        if (other.gap >= pair.gap) return false
        const middle = other.s === side ? other.pivotS : other.t === side ? other.pivotT : null
        return middle !== null && Math.abs(dot(sub(middle, pivot), side.u)) < other.overlap / 2
      })
      if (blocked(pair.s, pair.pivotS) || blocked(pair.t, pair.pivotT)) continue
      wide.push(pair)
    }
    const { s, t } = pair
    const off = Math.abs(cross(s.u, t.u))
    if (off <= tolerance('parallel')) {
      fixed.add(s)
      fixed.add(t)
      continue
    }
    if (fixed.has(s) && fixed.has(t)) continue
    let dir: P
    if (fixed.has(s)) dir = s.u
    else if (fixed.has(t)) dir = mul(t.u, -1)
    else dir = unit(sub(s.u, t.u))
    s.p = pair.pivotS
    s.u = dir
    t.p = pair.pivotT
    t.u = mul(dir, -1)
    fixed.add(s)
    fixed.add(t)
    turned.push({ faces: [s.faces[0] ?? 'the floor outline', t.faces[0] ?? 'the floor outline'], degrees: deg(Math.asin(Math.min(1, off))) })
  }
  return {
    turned,
    wide: wide.map(({ a, b, s, t, pivotS }) => {
      const onS = add(s.p, mul(s.u, dot(sub(pivotS, s.p), s.u)))
      return { a, b, gap: Math.abs(cross(t.u, sub(onS, t.p))) + tolerance('scanWritten') }
    }),
  }
}
