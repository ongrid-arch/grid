/**
 * BRF-5: which rooms get the sun, as a table of the drawing's geometry. For each room: the way
 * each of its window walls looks, the area of the windows in it against the room's floor area,
 * and how deep the room runs from that wall.
 *
 * It is geometry and nothing more. It works out no sun path, shade, sky, glass or reflection,
 * and it checks no rule: it says which way the windows look and how big and deep the rooms are
 * behind them, so a person can read the plan for the sun.
 *
 * - A window wall is a stretch of outside wall with a window in it, as `planFacing` (CNT-3)
 *   finds them: it faces the way of its outside face, turned by the plan's north, or by the top
 *   of the drawing when the plan states none (`facing.northStated` says which).
 * - A window's area is its hole in the wall, its width by its height, as the plan holds it, with
 *   no frame taken off. VEW-78: a door whose type is glazed (`openingGlazed`) counts with the
 *   windows, marked `door`, and so does no other door; a doorless opening is not glazing.
 * - The floor area is the room's net area, as `roomFloorArea` gives it (ARE-6, ARE-5).
 * - The depth from a window wall is the distance, square to the wall, from its inside face to the
 *   farthest point of the room's floor. The farthest point of an outline from a line is one of
 *   its corners, so it is the greatest of the corners' distances.
 *
 * Pure: no DOM, no network.
 */
import type { FloorPlan, Opening, PlanIndex } from './plan'
import { indexPlan } from './plan'
import { floorOf } from './floors'
import { planFacing, type CompassPoint, type PlanFacing, type WallFacing } from './orientation'
import { roomFloorArea, tryRoomShape } from './room'
import { add, dot, scale, sub, type Vec2 } from './vec2'
import { wallAxis, wallPointAt } from './wall'
import { openingGlazed } from './partTypes'

/** One window in a window wall. */
export interface SunWindow {
  readonly id: string
  /** The hole in the wall, in metres. */
  readonly width: number
  readonly height: number
  /** Width by height, in square metres. */
  readonly area: number
  /** VEW-78: a glazed door, counted with the windows. Absent for a window. */
  readonly door?: true
}

/** One stretch of outside wall with windows in it, behind one room. */
export interface SunWall {
  readonly wall: string
  /** Where the stretch runs, in metres along the wall from its start. */
  readonly from: number
  readonly to: number
  /** The way its outside face looks: degrees clockwise from north, and the nearest of the eight points. */
  readonly bearing: number
  readonly faces: CompassPoint
  readonly windows: readonly SunWindow[]
  /** The windows' areas added up, in square metres. */
  readonly windowArea: number
  /** The room's depth from the wall's inside face, square to it, in metres. */
  readonly depth: number
}

/** One room's row: its floor, its windows to the outside and its window walls. */
export interface SunRoom {
  readonly room: string
  readonly floor: string
  /** Net floor area, in square metres. */
  readonly floorArea: number
  /** Every window in its window walls, added up, in square metres. */
  readonly windowArea: number
  /** `windowArea` over `floorArea`; null for a room with no floor area. */
  readonly windowToFloor: number | null
  /** Its window walls, clockwise from north. Empty for a room with no window to the outside. */
  readonly walls: readonly SunWall[]
}

export interface SunTable {
  /** Whose north the bearings are from, and the facing they were read from. */
  readonly facing: PlanFacing
  /** Every room with an outline, in plan order. A room whose outline does not close is left out. */
  readonly rooms: readonly SunRoom[]
}

/** The stretch of outside wall an opening's middle is in, behind `room`, or null. */
function stretchOf(walls: readonly WallFacing[], opening: Opening, room: string): WallFacing | null {
  const middle = opening.offset + opening.width / 2
  return walls.find((w) => w.wall === opening.wall && w.rooms.includes(room) && w.from <= middle && middle <= w.to) ?? null
}

/** The room's depth from a stretch's inside face: the farthest corner of the outline, square to it. */
function depthFrom(stretch: WallFacing, thickness: number, start: Vec2, outline: readonly Vec2[]): number {
  const inward = { x: -stretch.outward.x, y: -stretch.outward.y }
  const face = add(start, scale(inward, thickness / 2))
  return outline.reduce((deepest, corner) => Math.max(deepest, dot(sub(corner, face), inward)), 0)
}

/** The table of every room with an outline. */
export function planSunTable(plan: FloorPlan, index: PlanIndex = indexPlan(plan)): SunTable {
  const facing = planFacing(plan, index)
  const rooms: SunRoom[] = []
  for (const room of plan.rooms) {
    const shape = tryRoomShape(room, index)
    if (shape === null || shape.polygon.length < 3) continue
    const floorArea = roomFloorArea(room, index, shape.polygon)
    const byStretch = new Map<WallFacing, SunWindow[]>()
    for (const opening of plan.openings) {
      if (!openingGlazed(plan, opening) || !Number.isFinite(opening.offset) || !Number.isFinite(opening.width) || !Number.isFinite(opening.height)) continue
      const stretch = stretchOf(facing.walls, opening, room.id)
      if (stretch === null) continue
      const window: SunWindow = { id: opening.id, width: opening.width, height: opening.height, area: opening.width * opening.height, ...(opening.type === 'door' && { door: true as const }) }
      byStretch.set(stretch, [...(byStretch.get(stretch) ?? []), window])
    }
    const walls: SunWall[] = []
    for (const [stretch, windows] of byStretch) {
      const wall = index.wallsById.get(stretch.wall)
      if (wall === undefined) continue
      walls.push({
        wall: stretch.wall,
        from: stretch.from,
        to: stretch.to,
        bearing: stretch.bearing,
        faces: stretch.faces,
        windows,
        windowArea: windows.reduce((sum, w) => sum + w.area, 0),
        // A curved wall's depth is taken from the middle of the part that faces this way (CNT-18).
        depth: depthFrom(stretch, wall.thickness, wall.arc === undefined ? wallAxis(wall).start : wallPointAt(wall, (stretch.from + stretch.to) / 2), shape.polygon)
      })
    }
    walls.sort((a, b) => a.bearing - b.bearing || (a.wall < b.wall ? -1 : a.wall > b.wall ? 1 : a.from - b.from))
    const windowArea = walls.reduce((sum, w) => sum + w.windowArea, 0)
    rooms.push({ room: room.id, floor: floorOf(room), floorArea, windowArea, windowToFloor: floorArea > 0 ? windowArea / floorArea : null, walls })
  }
  return { facing, rooms }
}
