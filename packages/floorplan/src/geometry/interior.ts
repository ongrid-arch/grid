/**
 * VEW-78: the inside of each room as the 3D view draws it: its ceiling, and the linings its
 * finishes are drawn on, worked out here so the viewer draws them and works out nothing.
 *
 * - A ceiling is the room's own (`roomCeiling`, LVL-4): its footprint at the room's height above
 *   its floor (its stated `height`, else its storey's less its floor offset), less each lowered
 *   zone, and each zone at its own height; under a sloped roof only where the roof is higher. A room
 *   that states no ceiling is given one the same way, for drawing only. A zone (CNT-8) has none of
 *   its own, a void none, and an outdoor space none unless a roof covers it.
 * - A floor finish is the room's floor (its slab's polygon and holes) at its floor's height, with
 *   the finish it names; a room that names none has none.
 * - A lining is one side of the room's inside outline (the slab's polygon, C3) that lies on the face
 *   of one of the room's straight walls: a rectangle on that face from the room's floor to its
 *   ceiling or the wall's top, whichever is lower, open over each door, window and opening in it,
 *   with the finish the room gives that face (C24): the wall's own in `faces`, else the room's
 *   `walls`. Each band (CNT-51) is a lining of its own over its height: on every side, on one wall's
 *   sides, or behind an item over the length of its back, from the item's top unless `from` says.
 *   Only a side with a finish is lined. A curved wall's faces are arcs and get none, and a glass
 *   wall (`wallGlazed`) none: it is seen through.
 *
 * Everything is in the storey's own frame: plan x and y (C4), and heights above its floor (C5).
 * Pure: no DOM, no Three.
 */
import type { MultiPolygon } from 'polygon-clipping'
import type { FloorPlan, Item, Room, Wall } from '../types/floorplan'
import { indexPlan, roomWallIds, type PlanIndex } from './plan'
import { planInState } from './phases'
import { floorOf } from './floors'
import { roomCeiling } from './envelope'
import { floorRoofShape } from './roofs'
import { roomFloorOffset } from './steps'
import { roomFinishes, wallGlazed } from './partTypes'
import { tolerance } from './tolerances'
import { wallAxis } from './wall'
import type { Vec2 } from './vec2'
import type { Scene3D, SceneSlab } from './scene3d'

/** One flat piece of a ceiling on the plan: its outline and its holes. */
export interface InteriorPiece {
  readonly outline: readonly Vec2[]
  readonly holes: readonly (readonly Vec2[])[]
}

/** A room's ceiling at one height (the ceiling itself, or a lowered zone of it), or its floor finish. */
export interface SceneCeiling {
  readonly room: string
  /** The room's ceiling (or floor) finish, or null when it names none. */
  readonly finish: string | null
  /** Metres above the storey's floor. */
  readonly z: number
  readonly pieces: readonly InteriorPiece[]
}

/** A hole in a lining: a door, window or opening in its wall, in the lining's own terms. */
export interface LiningHole {
  /** Metres along the lining from `from`. */
  readonly along: readonly [number, number]
  /** Metres above the storey's floor. */
  readonly rise: readonly [number, number]
}

/** One side of a room on one wall's face, finished: the lining its finish is drawn on. */
export interface SceneLining {
  readonly room: string
  readonly wall: string
  readonly finish: string
  /** A band (CNT-51), drawn over the room's own lining. */
  readonly band: boolean
  /** On the plan: the side's ends, the room on its left. */
  readonly from: Vec2
  readonly to: Vec2
  /** Metres above the storey's floor. */
  readonly bottom: number
  readonly top: number
  readonly holes: readonly LiningHole[]
}

export interface SceneInterior {
  readonly ceilings: readonly SceneCeiling[]
  /** The floors of the rooms that name a floor finish, each at its room's floor. */
  readonly floors: readonly SceneCeiling[]
  readonly linings: readonly SceneLining[]
}

/** polygon-clipping's pieces as outlines and holes, without each ring's closing point. */
function piecesOf(pieces: MultiPolygon): InteriorPiece[] {
  const ring = (points: readonly (readonly [number, number])[]): Vec2[] => {
    const out = points.map(([x, y]) => ({ x, y }))
    const first = out[0]
    const last = out[out.length - 1]
    if (first !== undefined && last !== undefined && out.length > 1 && first.x === last.x && first.y === last.y) out.pop()
    return out
  }
  return pieces.flatMap((polygon) => {
    const [outer, ...holes] = polygon
    if (outer === undefined) return []
    const outline = ring(outer)
    return outline.length < 3 ? [] : [{ outline, holes: holes.map(ring).filter((h) => h.length >= 3) }]
  })
}

/** The room's straight wall whose face the side from `a` to `b` lies on, or null. */
function wallOfSide(a: Vec2, b: Vec2, walls: readonly Wall[]): Wall | null {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < tolerance('noLength')) return null
  const reach = tolerance('liningOnFace')
  for (const wall of walls) {
    if (wall.virtual === true || wall.arc !== undefined) continue
    const axis = wallAxis(wall)
    if (axis.length < tolerance('noLength')) continue
    const cross = ((b.x - a.x) * axis.dir.y - (b.y - a.y) * axis.dir.x) / length
    if (Math.abs(cross) > tolerance('writtenParallel')) continue
    const off = (p: Vec2): number => Math.abs((p.x - axis.start.x) * axis.normal.x + (p.y - axis.start.y) * axis.normal.y)
    const half = wall.thickness / 2
    if (Math.abs(off(a) - half) > reach || Math.abs(off(b) - half) > reach) continue
    const at = (p: Vec2): number => (p.x - axis.start.x) * axis.dir.x + (p.y - axis.start.y) * axis.dir.y
    const span = wall.thickness / 2 + reach
    if (Math.max(at(a), at(b)) < -span || Math.min(at(a), at(b)) > axis.length + span) continue
    return wall
  }
  return null
}

/** The stretch of a side an item's back stands against, in metres along the side, or null (as the finishes measure a band behind it). */
function behindItem(a: Vec2, b: Vec2, item: Item): readonly [number, number] | null {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  // The floor is on the left of every side: the face looks that way, into the room.
  const nx = -uy
  const ny = ux
  const t = ((item.turn ?? 0) * Math.PI) / 180
  const front = { x: -Math.sin(t), y: Math.cos(t) }
  if (front.x * nx + front.y * ny < 1 - tolerance('writtenParallel')) return null
  const [width, depth] = item.size
  const back = { x: item.at[0] - (front.x * depth) / 2, y: item.at[1] - (front.y * depth) / 2 }
  const off = (back.x - a.x) * nx + (back.y - a.y) * ny
  if (Math.abs(off) > tolerance('itemIntoWall')) return null
  const middle = (back.x - a.x) * ux + (back.y - a.y) * uy
  const span: [number, number] = [Math.max(0, middle - width / 2), Math.min(length, middle + width / 2)]
  return span[1] > span[0] ? span : null
}

/** The room's linings, its own and its bands'. */
function roomLinings(room: Room, slab: SceneSlab, index: PlanIndex, drawn: ReadonlySet<string>, ceiling: number): SceneLining[] {
  const finishes = roomFinishes(room)
  const faces = new Map((room.finishes?.faces ?? []).map((f) => [f.wall, f.finish] as const))
  const bands = room.finishes?.bands ?? []
  if (finishes.walls === null && faces.size === 0 && bands.length === 0) return []
  const walls = roomWallIds(room)
    .filter((id) => drawn.has(id))
    .map((id) => index.wallsById.get(id))
    // A glass wall is seen through, not finished.
    .filter((w): w is Wall => w !== undefined && !wallGlazed(index.plan, w))
  const bottom = slab.offset ?? 0
  const items = index.plan.items ?? []
  const out: SceneLining[] = []
  for (const ring of [slab.polygon, ...slab.holes]) {
    ring.forEach((from, i) => {
      const to = ring[(i + 1) % ring.length]!
      const wall = wallOfSide(from, to, walls)
      if (wall === null) return
      const axis = wallAxis(wall)
      const at = (p: Vec2): number => (p.x - axis.start.x) * axis.dir.x + (p.y - axis.start.y) * axis.dir.y
      const start = at(from)
      const forward = at(to) >= start
      const length = Math.abs(at(to) - start)
      const top = Math.min(wall.height, bottom + ceiling)
      if (!(top > bottom) || !(length > tolerance('noLength'))) return
      const holes: LiningHole[] = []
      for (const opening of index.plan.openings) {
        if (opening.wall !== wall.id) continue
        const a = forward ? opening.offset - start : start - (opening.offset + opening.width)
        const along: [number, number] = [Math.max(0, a), Math.min(length, a + opening.width)]
        const rise: [number, number] = [Math.max(bottom, opening.sill), Math.min(top, opening.sill + opening.height)]
        if (along[1] > along[0] && rise[1] > rise[0]) holes.push({ along, rise })
      }
      const cut = (from0: number, to0: number, h: readonly LiningHole[]): LiningHole[] =>
        h.flatMap((hole) => {
          const rise: [number, number] = [Math.max(from0, hole.rise[0]), Math.min(to0, hole.rise[1])]
          return rise[1] > rise[0] ? [{ along: hole.along, rise }] : []
        })
      const own = faces.get(wall.id) ?? finishes.walls
      if (own !== null) out.push({ room: room.id, wall: wall.id, finish: own, band: false, from, to, bottom, top, holes })
      for (const band of bands) {
        if (band.wall !== undefined && band.wall !== wall.id) continue
        let span: readonly [number, number] = [0, length]
        let base = band.from ?? 0
        if (band.behind !== undefined) {
          const item = items.find((it) => it.id === band.behind && floorOf(it) === floorOf(room))
          const behind = item === undefined ? null : behindItem(from, to, item)
          if (item === undefined || behind === null) continue
          span = behind
          base = band.from ?? item.height
        }
        const b0 = bottom + base
        const b1 = Math.min(top, b0 + band.height)
        if (!(b1 > b0)) continue
        const point = (s: number): Vec2 => ({ x: from.x + ((to.x - from.x) * s) / length, y: from.y + ((to.y - from.y) * s) / length })
        const shifted = cut(b0, b1, holes).flatMap((hole) => {
          const along: [number, number] = [Math.max(0, hole.along[0] - span[0]), Math.min(span[1] - span[0], hole.along[1] - span[0])]
          return along[1] > along[0] ? [{ along, rise: hole.rise }] : []
        })
        out.push({ room: room.id, wall: wall.id, finish: band.finish, band: true, from: point(span[0]), to: point(span[1]), bottom: b0, top: b1, holes: shifted })
      }
    })
  }
  return out
}

/**
 * The ceilings and linings of the rooms `scene` draws, from the floor slice it was built from.
 * `storeyHeight` is the storey's clear height, which a room that states no height of its own
 * reaches.
 */
export function sceneInterior(stated: FloorPlan, scene: Pick<Scene3D, 'slabs' | 'walls'>, storeyHeight: number): SceneInterior {
  // As the scene: the building after the work (CNT-10).
  const plan = planInState(stated, 'after')
  const index = indexPlan(plan)
  const drawn = new Set(scene.walls.map((w) => w.id))
  const rooms = new Map(plan.rooms.map((r) => [r.id, r] as const))
  const ceilings: SceneCeiling[] = []
  const floors: SceneCeiling[] = []
  const linings: SceneLining[] = []
  const roofs = new Map<string, ReturnType<typeof floorRoofShape>>()
  const roofOf = (floor: string): ReturnType<typeof floorRoofShape> => {
    if (!roofs.has(floor)) {
      let shape: ReturnType<typeof floorRoofShape> = null
      try {
        shape = floorRoofShape(plan, floor)
      } catch {
        // A roof that cannot be worked out leaves the ceiling flat.
      }
      roofs.set(floor, shape)
    }
    return roofs.get(floor) ?? null
  }
  for (const slab of scene.slabs) {
    const room = rooms.get(slab.roomId)
    if (room === undefined || room.void === true) continue
    const own = room.height !== undefined && Number.isFinite(room.height) && room.height > 0 ? room.height : storeyHeight - roomFloorOffset(room)
    const covered = slab.outdoor === undefined || slab.outdoor.roofed
    if (covered) {
      let pieces: ReturnType<typeof roomCeiling> = null
      try {
        pieces = roomCeiling({ ...room, ceiling: room.ceiling ?? {} }, index, storeyHeight, roofOf(floorOf(room)))
      } catch {
        // A ceiling that cannot be cut is left out, as the IFC leaves it.
      }
      const finish = roomFinishes(room).ceiling
      for (const piece of pieces ?? []) {
        const flat = piecesOf(piece.pieces)
        if (flat.length > 0) ceilings.push({ room: room.id, finish, z: roomFloorOffset(room) + piece.height, pieces: flat })
      }
    }
    const floorFinish = roomFinishes(room).floor
    if (floorFinish !== null) floors.push({ room: room.id, finish: floorFinish, z: slab.offset ?? 0, pieces: [{ outline: slab.polygon, holes: slab.holes }] })
    linings.push(...roomLinings(room, slab, index, drawn, own))
  }
  return { ceilings, floors, linings }
}
