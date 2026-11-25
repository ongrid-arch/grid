/**
 * Inside or outside: worked out for each stretch of a wall from the rooms on its two sides
 * (MSG-13).
 *
 * A wall faces outside where a room lies on one side of it and none on the other, and stands
 * inside where rooms lie on both. Which room lies on which side is read from the rooms' own
 * outlines: an edge of a room's outline that runs along one face of the wall puts that room on
 * that face, for that stretch of the wall. So one wall can face outside for part of its length
 * and an extension for the rest (lab WR-5), and an L-shaped room beside a partition is on the
 * side its outline is (AU1-1), not on the side of the middle of its corners.
 *
 * Where no listed room covers a side, a point just past the face is tried: a room that holds it
 * lies on that side, though it does not list the wall. That is how the walls of a pod marked
 * `inside` face the room around it (ARE-5), and how a wall a room's list leaves out still has
 * that room beside it. A point inside the body of another wall (where two walls meet), or in
 * floor the walls enclose that no room claims (ARE-4), is not the outside either.
 *
 * The stated `kind` is kept as the exception, not the rule. `exterior` is never a default, so a
 * wall stated `exterior` stays an outside wall where the outlines put rooms on both sides of it:
 * a courtyard side, or a terrace drawn as a room (lab R-9). Every other kind is worked out,
 * because `interior` is also what a wall that states no kind gets, and a plan that states no kinds
 * must not read every wall as an inside wall (MS-11). Where the stated kind and the worked-out
 * one disagree, `wallSides` says so, and validation prints one line.
 *
 * CNT-7 (C26): a room marked as outdoor space is the outside to the building. A wall between a room
 * and an outdoor space faces outside, and a wall with outdoor space beside it and no room (a fence,
 * a parapet round a terrace) stands in the open and faces outside too. The stretches still name
 * the outdoor spaces on their faces.
 *
 * Every consumer reads this one answer: the 2D drawing and the 3D scene (`exposure`), the DXF
 * layers, the IFC `IsExternal` mark, the order a plan is built in, and the route and escape
 * checks (which also tell outside from enclosed floor no room claims, `rules/graph.ts`).
 */

import type { FloorPlan, PlanIndex, Room, Wall, WallKind } from './plan'
import type { BeyondWall } from '../types/floorplan'
import { roomWallIds } from './plan'
import { floorOf, wallsOnFloor } from './floors'
import { roomOutline } from './room'
import { floorSpaces, spacesKnown } from './spaces'
import { tolerance, tolerancesAsStated } from './tolerances'
import type { Vec2 } from './vec2'
import { dot, sub } from './vec2'
import { wallFrameAt, wallLength, wallSegments } from './wall'
import { curveFault } from './arc'
import { outdoorIds } from './outdoor'

/**
 * Whether the wall separates two rooms or faces the outside, as every view and export shows it.
 * `detached`: no room lies along it. CNT-6 (C23): `separating`, a party wall or a wall to the
 * common parts: one stated `separating`, or one with a room on one side only that states a common
 * part or a neighbour beyond it. It is not an outside wall: no way out, no escape window and not
 * external, and gross external area is measured to its middle.
 */
export type WallExposure = 'exterior' | 'interior' | 'separating' | 'detached'

/**
 * CNT-6 (C23): what lies past a wall's side with no room on it, as the plan states it: its
 * `beyond`, else, for a wall stated `separating`, a common part (the one way a door through it is
 * right). Null when the plan says nothing, and the drawing decides (the outside, or floor no room
 * claims).
 */
export function wallBeyond(wall: Pick<Wall, 'kind' | 'beyond'>): BeyondWall | null {
  return wall.beyond ?? (wall.kind === 'separating' ? 'common' : null)
}

/** Whether what the plan states beyond a wall is more of the building, not the outside. */
const separates = (wall: Wall): boolean => {
  const beyond = wallBeyond(wall)
  return beyond === 'common' || beyond === 'neighbour'
}

/** One stretch of a wall, measured along it from its start, and the rooms on each of its faces. */
export interface WallStretch {
  readonly from: number
  readonly to: number
  /** Rooms on the face its normal points at (90 degrees counter-clockwise from start to end). */
  readonly left: readonly string[]
  readonly right: readonly string[]
  /**
   * Worked out from the rooms alone: `interior` with rooms on both faces, `exterior` with one, or
   * `separating` with one where the plan states more of the building beyond the wall (CNT-6).
   */
  readonly worked: WallExposure
}

export interface WallSides {
  readonly wall: string
  readonly stated: WallKind
  /** In order along the wall, covering it from start to end. */
  readonly stretches: readonly WallStretch[]
  /** From the stretches: `exterior` where any stretch longer than `lineInside` faces outside. */
  readonly worked: WallExposure
  /** What the views, the exports and the checks use: `exterior` when stated so, else `worked`. */
  readonly exposure: WallExposure
  /**
   * How long the stated kind and the worked-out one disagree, in metres, and how: a wall stated
   * `exterior` with rooms on both faces (`kept`, the stated kind stands), or one stated
   * `partition` facing outside (`worked`, the worked-out kind stands). 0 when they agree.
   */
  readonly differs: { readonly length: number; readonly stands: 'kept' | 'worked' } | null
}

interface Traced {
  readonly room: Room
  readonly polygon: readonly Vec2[]
  /** Its holes, clockwise (ARE-6): the floor lies on the left of their edges too. */
  readonly holes: readonly (readonly Vec2[])[]
  /** Every wall it lists, round its outline and its holes. */
  readonly walls: ReadonlySet<string>
  readonly box: { x0: number; y0: number; x1: number; y1: number }
  readonly area: number
}

function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let odd = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd
  }
  return odd
}

const areaOf = (polygon: readonly Vec2[]): number => {
  let twice = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}

/** The rooms of each floor whose outline closes with no fault. */
function traceRooms(index: PlanIndex): Map<string, Traced[]> {
  const byFloor = new Map<string, Traced[]>()
  for (const room of index.plan.rooms) {
    let polygon: readonly Vec2[]
    let holes: readonly (readonly Vec2[])[]
    try {
      const outline = roomOutline(room, index)
      if (outline.fault !== null) continue
      polygon = outline.polygon
      holes = outline.holes.map((hole) => hole.polygon)
    } catch {
      continue
    }
    if (polygon.length < 3 || polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue
    const box = polygon.reduce(
      (b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }),
      { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    )
    const floor = floorOf(room)
    const list = byFloor.get(floor) ?? []
    const area = holes.reduce((sum, hole) => sum - areaOf(hole), areaOf(polygon))
    list.push({ room, polygon, holes, walls: new Set(roomWallIds(room)), box, area })
    byFloor.set(floor, list)
  }
  return byFloor
}

/**
 * The stretches of one wall that each listing room's outline runs along, and on which face.
 * An outline edge lies along the wall when both its ends lie on one of the wall's faces.
 */
/** Things with a box, filed by the grid cells their box covers, so a point finds them without a search of all. */
class Buckets<T> {
  private readonly cells = new Map<string, T[]>()
  /** Too large to file cell by cell: tried for every point. */
  private readonly large: T[] = []
  private static readonly CELL = 4

  add(item: T, box: { x0: number; y0: number; x1: number; y1: number }): void {
    const c = Buckets.CELL
    const [i0, i1, j0, j1] = [Math.floor(box.x0 / c), Math.floor(box.x1 / c), Math.floor(box.y0 / c), Math.floor(box.y1 / c)]
    // Past a safe integer the cell index no longer counts up (1e21 + 1 is 1e21), so far-out or
    // huge boxes are not filed by cell.
    const safe = (v: number): boolean => Number.isFinite(v) && Math.abs(v) < 1e9
    if (![i0, i1, j0, j1].every(safe) || (i1 - i0 + 1) * (j1 - j0 + 1) > 256) {
      this.large.push(item)
      return
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = `${i},${j}`
        const list = this.cells.get(key)
        if (list) list.push(item)
        else this.cells.set(key, [item])
      }
    }
  }

  near(p: Vec2): readonly T[] {
    const c = Buckets.CELL
    const here = this.cells.get(`${Math.floor(p.x / c)},${Math.floor(p.y / c)}`) ?? []
    return this.large.length === 0 ? here : [...here, ...this.large]
  }
}

function listedCover(wall: Wall, rooms: readonly Traced[]): { from: number; to: number; room: string; left: boolean }[] {
  const half = wall.virtual === true ? 0 : wall.thickness / 2
  const near = tolerance('wallContact')
  const cover: { from: number; to: number; room: string; left: boolean }[] = []
  // A curved wall is read piece by piece (CNT-18): a room traced along it has one edge per piece.
  for (const axis of wallSegments(wall)) {
    const along = axis.length === 0 ? 1 : (axis.to - axis.from) / axis.length
    // CNT-25: an edge that lies along the piece has a stretch inside the box round the piece and
    // its faces, so an edge whose box is clear of it is passed over before any measuring. A
    // curved wall has hundreds of pieces and its rooms hundreds of edges.
    const reach = half + near + tolerance('wallContact')
    const end = { x: axis.start.x + axis.dir.x * axis.length, y: axis.start.y + axis.dir.y * axis.length }
    const x0 = Math.min(axis.start.x, end.x) - reach
    const x1 = Math.max(axis.start.x, end.x) + reach
    const y0 = Math.min(axis.start.y, end.y) - reach
    const y1 = Math.max(axis.start.y, end.y) + reach
    for (const traced of rooms) {
      if (!traced.walls.has(wall.id)) continue
      for (const polygon of [traced.polygon, ...traced.holes]) {
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i]!
          const b = polygon[(i + 1) % polygon.length]!
          if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1 || Math.max(a.y, b.y) < y0 || Math.min(a.y, b.y) > y1) continue
          const e = sub(b, a)
          const length = Math.hypot(e.x, e.y)
          if (length < tolerance('noLength')) continue
          const offA = dot(sub(a, axis.start), axis.normal)
          const offB = dot(sub(b, axis.start), axis.normal)
          if (Math.abs(Math.abs(offA) - half) > near || Math.abs(Math.abs(offB) - half) > near) continue
          // The room lies to the left of its counter-clockwise outline, and of its clockwise holes,
          // so on the face the edge's left points to.
          const left = dot({ x: -e.y, y: e.x }, axis.normal) > 0
          const s0 = Math.max(0, Math.min(dot(sub(a, axis.start), axis.dir), dot(sub(b, axis.start), axis.dir)))
          const s1 = Math.min(axis.length, Math.max(dot(sub(a, axis.start), axis.dir), dot(sub(b, axis.start), axis.dir)))
          if (s1 - s0 > tolerance('noLength')) cover.push({ from: axis.from + s0 * along, to: axis.from + s1 * along, room: traced.room.id, left })
        }
      }
    }
  }
  return cover
}

/** The room that holds a point, the smallest when several do. */
function roomHolding(p: Vec2, rooms: readonly Traced[]): string | null {
  let best: Traced | null = null
  for (const t of rooms) {
    if (p.x < t.box.x0 || p.x > t.box.x1 || p.y < t.box.y0 || p.y > t.box.y1) continue
    if (!pointInPolygon(p, t.polygon) || t.holes.some((hole) => pointInPolygon(p, hole))) continue
    if (best === null || t.area < best.area) best = t
  }
  return best?.room.id ?? null
}

const workedOf = (left: number, right: number): WallExposure =>
  left > 0 && right > 0 ? 'interior' : left > 0 || right > 0 ? 'exterior' : 'detached'

/** A solid wall's body, to tell a face that looks into another wall from one that looks outside. */
interface Body {
  readonly wall: Wall
  readonly start: Vec2
  readonly dir: Vec2
  readonly normal: Vec2
  readonly length: number
  readonly half: number
}

function bodiesOf(walls: readonly Wall[]): Body[] {
  return walls.flatMap((wall) => {
    if (wall.virtual === true || !(wall.thickness > 0)) return []
    try {
      if (curveFault(wall) !== null) return []
      return wallSegments(wall).map((axis) => ({ wall, start: axis.start, dir: axis.dir, normal: axis.normal, length: axis.length, half: wall.thickness / 2 }))
    } catch {
      return []
    }
  })
}

const inBody = (p: Vec2, b: Body): boolean => {
  const d = sub(p, b.start)
  const s = dot(d, b.dir)
  return s >= 0 && s <= b.length && Math.abs(dot(d, b.normal)) <= b.half
}

/** Whether a point lies in floor the walls enclose: a room, or a space no room claims. */
type Enclosed = (p: Vec2) => boolean

function sidesOf(wall: Wall, listing: readonly Traced[], rooms: Buckets<Traced>, bodies: Buckets<Body>, enclosed: Enclosed, outdoor: ReadonlySet<string>): WallSides {
  const detached: WallSides = { wall: wall.id, stated: wall.kind, stretches: [], worked: 'detached', exposure: wall.kind === 'exterior' ? 'exterior' : 'detached', differs: null }
  // A curve that cannot be built (CNT-18) has no length to work its sides out along.
  if (curveFault(wall) !== null) return detached
  let total: number
  try {
    total = wallLength(wall)
  } catch {
    return detached
  }
  const cover = listedCover(wall, listing)
  const cuts = [...new Set([0, total, ...cover.flatMap((c) => [c.from, c.to])])].sort((a, b) => a - b)
  const step = (wall.virtual === true ? 0 : wall.thickness / 2) + tolerance('stepPastFace')
  const raw: WallStretch[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [from, to] = [cuts[i]!, cuts[i + 1]!]
    if (to - from < tolerance('noLength')) continue
    const mid = (from + to) / 2
    const on = cover.filter((c) => c.from <= mid && mid <= c.to)
    const left = [...new Set(on.filter((c) => c.left).map((c) => c.room))]
    const right = [...new Set(on.filter((c) => !c.left).map((c) => c.room))]
    // A side no listed room covers: the room just past that face, if any. A face that looks into
    // the body of another wall, where two walls meet, looks at neither a room nor the outside.
    const { point: centre, normal } = wallFrameAt(wall, mid)
    const blocked = [false, false]
    for (const [side, sign, k] of [[left, 1, 0], [right, -1, 1]] as const) {
      if (side.length > 0) continue
      const probe = { x: centre.x + normal.x * step * sign, y: centre.y + normal.y * step * sign }
      const held = roomHolding(probe, rooms.near(probe))
      const inOther = (p: Vec2): boolean => bodies.near(p).some((b) => b.wall !== wall && inBody(p, b))
      // WRT-17: the face looks into another wall only where it does so along the whole stretch,
      // its quarters as well as its middle: a short wall that overlaps the end of an angled one
      // still faces outside past it.
      const quarters = (): boolean =>
        [(3 * from + to) / 4, (from + 3 * to) / 4].every((s) => {
          const frame = wallFrameAt(wall, s)
          return inOther({ x: frame.point.x + frame.normal.x * step * sign, y: frame.point.y + frame.normal.y * step * sign })
        })
      if (held !== null) side.push(held)
      else blocked[k] = inOther(probe) && quarters()
      // Floor the walls enclose that no room claims (a forgotten room, a courtyard not drawn) is
      // not the outside (ARE-4). Asked only for a wall not stated exterior, which faces outside anyway.
      if (held === null && !blocked[k] && wall.kind !== 'exterior' && (left.length > 0 || right.length > 0)) blocked[k] = enclosed(probe)
    }
    // CNT-7 (C26): an outdoor space beside a face is the outside to the building. A wall with
    // outdoor space beside it and no room (a fence, a parapet) stands in the open: it faces outside.
    const indoor = (side: readonly string[]): number => (outdoor.size === 0 ? side.length : side.filter((id) => !outdoor.has(id)).length)
    const found = workedOf(indoor(left) + (blocked[0] ? 1 : 0), indoor(right) + (blocked[1] ? 1 : 0))
    const worked = found === 'detached' && left.length + right.length > 0 ? 'exterior' : found
    // CNT-6 (C23): a room on one side and more of the building stated beyond the other.
    const one = worked === 'exterior' && separates(wall) ? 'separating' : worked
    raw.push({ from, to, left, right, worked: left.length + right.length === 0 ? 'detached' : one })
  }
  // Neighbouring stretches with the same rooms are one, worked out as its longest piece is
  // (WRT-17): a sliver at a joint of three walls, where a probe lands in another wall's body,
  // does not decide the whole stretch.
  const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x))
  const stretches: WallStretch[] = []
  let longest = 0
  for (const s of raw) {
    const last = stretches.at(-1)
    const length = s.to - s.from
    if (last && same(last.left, s.left) && same(last.right, s.right)) {
      stretches[stretches.length - 1] = { ...last, to: s.to, ...(length > longest ? { worked: s.worked } : {}) }
      longest = Math.max(longest, length)
    } else {
      stretches.push(s)
      longest = length
    }
  }
  const long = (s: WallStretch): boolean => s.to - s.from > tolerance('lineInside')
  const worked: WallExposure = stretches.some((s) => long(s) && s.worked === 'exterior')
    ? 'exterior'
    : stretches.some((s) => long(s) && s.worked === 'separating')
      ? 'separating'
      : stretches.some((s) => s.worked === 'interior')
        ? 'interior'
        : stretches.some((s) => s.worked === 'exterior')
          ? 'exterior'
          : stretches.some((s) => s.worked === 'separating')
            ? 'separating'
            : 'detached'
  // CNT-6: a wall stated separating stays one between two rooms too (two flats), unless the plan
  // says it faces outside.
  const exposure: WallExposure =
    wall.kind === 'exterior' ? 'exterior' : wall.kind === 'separating' && worked !== 'exterior' && worked !== 'detached' ? 'separating' : worked
  const length = (kind: WallExposure): number =>
    stretches.filter((s) => s.worked === kind).reduce((sum, s) => sum + (s.to - s.from), 0)
  let differs: WallSides['differs'] = null
  // A wall stated exterior is said to have rooms on both sides only where rooms are (WRT-17): a
  // face that looks into another wall's body, at a joint, is neither a room nor the outside.
  const roomed = stretches.filter((s) => s.worked === 'interior' && s.left.length > 0 && s.right.length > 0).reduce((sum, s) => sum + (s.to - s.from), 0)
  if (wall.kind === 'exterior' && roomed > tolerance('lineInside')) differs = { length: length('interior'), stands: 'kept' }
  if (wall.kind === 'partition' && worked === 'exterior') differs = { length: length('exterior'), stands: 'worked' }
  return { wall: wall.id, stated: wall.kind, stretches, worked, exposure, differs }
}

/** Worked out once per index, as the room nesting is (`roomNesting`). */
const cache = new WeakMap<PlanIndex, Map<string, WallSides>>()

/** Every wall's sides, by id. Never throws. */
export function planWallSides(index: PlanIndex): ReadonlyMap<string, WallSides> {
  const stated = tolerancesAsStated()
  let found = stated ? cache.get(index) : undefined
  if (found === undefined) {
    found = new Map()
    const rooms = traceRooms(index)
    const outdoor = outdoorIds(index.plan)
    const tracedById = new Map([...rooms.values()].flat().map((t) => [t.room.id, t] as const))
    const roomBuckets = new Map<string, Buckets<Traced>>()
    for (const [floor, list] of rooms) {
      const buckets = new Buckets<Traced>()
      for (const t of list) buckets.add(t, t.box)
      roomBuckets.set(floor, buckets)
    }
    const bodies = new Map<string, Buckets<Body>>()
    // The spaces of a floor, worked out only when a wall first asks (`spaces.ts`). A floor whose
    // spaces cannot be worked out encloses nothing here.
    const spaces = new Map<string, Enclosed>()
    const enclosedOn = (floor: string): Enclosed => (p) => {
      let test = spaces.get(floor)
      if (test === undefined) {
        const result = floorSpaces(index.plan, floor, { index })
        const pieces = spacesKnown(result) ? result.spaces : []
        test = (q) =>
          pieces.some((piece) => {
            const [outer, ...islands] = piece.rings
            return (
              outer !== undefined &&
              q.x >= piece.min.x && q.x <= piece.max.x && q.y >= piece.min.y && q.y <= piece.max.y &&
              pointInPolygon(q, outer) &&
              !islands.some((ring) => pointInPolygon(q, ring))
            )
          })
        spaces.set(floor, test)
      }
      return test(p)
    }
    for (const wall of index.plan.walls) {
      if (found.has(wall.id)) continue
      const floor = floorOf(wall)
      if (!bodies.has(floor)) {
        const buckets = new Buckets<Body>()
        for (const b of bodiesOf(wallsOnFloor(index.plan, floor))) {
          const ends = [b.start, { x: b.start.x + b.dir.x * b.length, y: b.start.y + b.dir.y * b.length }]
          buckets.add(b, {
            x0: Math.min(ends[0]!.x, ends[1]!.x) - b.half,
            y0: Math.min(ends[0]!.y, ends[1]!.y) - b.half,
            x1: Math.max(ends[0]!.x, ends[1]!.x) + b.half,
            y1: Math.max(ends[0]!.y, ends[1]!.y) + b.half
          })
        }
        bodies.set(floor, buckets)
      }
      const listing = (index.roomsByWall.get(wall.id) ?? []).flatMap((r) => {
        const t = tracedById.get(r.id)
        return t !== undefined && floorOf(r) === floor ? [t] : []
      })
      found.set(wall.id, sidesOf(wall, listing, roomBuckets.get(floor) ?? new Buckets(), bodies.get(floor)!, enclosedOn(floor), outdoor))
    }
    if (stated) cache.set(index, found)
  }
  return found
}

/** One wall's sides: its stretches, the worked-out exposure, and what is used. */
export function wallSides(index: PlanIndex, wallId: string): WallSides | null {
  return planWallSides(index).get(wallId) ?? null
}

/**
 * Whether the wall separates two rooms or faces the outside, as every view and export shows it:
 * worked out from the rooms on its sides, or `exterior` when stated so. Thickness decides
 * nothing: an interior wall can be thick and an exterior one thin.
 */
export function wallExposure(index: PlanIndex, wallId: string): WallExposure {
  return wallSides(index, wallId)?.exposure ?? 'detached'
}

/** The stretch of a wall at a distance along it from its start, or null past its ends. */
export function stretchAt(sides: WallSides, s: number): WallStretch | null {
  return sides.stretches.find((x) => x.from - tolerance('noLength') <= s && s <= x.to + tolerance('noLength')) ?? null
}

/** The plan's walls whose stated kind and worked-out kind disagree. */
export function kindDisagreements(plan: FloorPlan, index: PlanIndex): WallSides[] {
  const all = planWallSides(index)
  return plan.walls.flatMap((wall) => {
    const sides = all.get(wall.id)
    return sides?.differs ? [sides] : []
  })
}
