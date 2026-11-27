/**
 * ARE-68: a shop's floor in bands of depth from its frontage, in m² and sq ft.
 *
 * The frontage is a side of the room: the one on the wall named, else the one on the wall with the
 * most opening width the room opens through (its shop front and door), else its longest side on a
 * wall that faces outside, else its longest side. The floor is cut by lines parallel to that side,
 * every `depth` metres into the room, into `bands` bands and the rest beyond them, each measured by
 * clipping the room's outline and holes: the bands add up to the room's floor as drawn.
 *
 * The default depth, 6.1 m (20 ft), is Grid's own: the depth shops are often zoned by. No weight is
 * put on any band: the bands are measured, not valued.
 *
 * Pure: the survey in, square metres out.
 */
import { intersectionArea } from '@ongrid/floorplan/geometry/polygons'
import { english, said } from '@ongrid/floorplan/messages'
import type { Vec2 } from '@ongrid/floorplan/geometry'
import type { RoomEdge, SurveyRoom } from './survey'
import { sqFt } from './units'

/** Grid's default band depth, in metres: 20 ft. */
export const FRONTAGE_DEPTH = 6.1
/** How many bands before the rest, by default. */
export const FRONTAGE_BANDS = 3
/** The most bands a call may ask for. */
export const FRONTAGE_BANDS_MAX = 10

export interface FrontageBand {
  /** A, B, C… and then the rest. */
  readonly name: string
  /** Its depth from the frontage, from and to, in metres; `to` null for the rest. */
  readonly from: number
  readonly to: number | null
  readonly area: number
  readonly sqFt: number
}

export interface FrontageZones {
  readonly room: string
  /** The wall the frontage lies on, null for a side on no wall; and how it was found. */
  readonly wall: string | null
  readonly found: 'named' | 'openings' | 'outside' | 'longest'
  /** The frontage's length along the room's side, in metres. */
  readonly width: number
  readonly depth: number
  readonly bands: readonly FrontageBand[]
  /** The room's floor as drawn: the bands added up. */
  readonly area: number
  readonly sqFt: number
  readonly rule: string
}

type Pair = [number, number]

/** Points on a micrometre grid, so the clipping meets no difference of rounding between two lines that are one. */
const snap = (v: number): number => Math.round(v * 1e6) / 1e6
const ring = (points: readonly Vec2[]): Pair[] => points.map((p): Pair => [snap(p.x), snap(p.y)])

/** The side the frontage is on, and how it was found; null when the room has no side on the wall named. */
export function frontageSide(room: SurveyRoom, wall?: string): { edge: RoomEdge; found: FrontageZones['found'] } | null {
  const outline = room.edges.slice(0, room.polygon.length)
  const longest = (edges: readonly RoomEdge[]): RoomEdge | undefined => [...edges].sort((a, b) => b.length - a.length)[0]
  if (wall !== undefined) {
    const edge = longest(outline.filter((e) => e.wall?.id === wall))
    return edge === undefined ? null : { edge, found: 'named' }
  }
  const openWidth = new Map<string, number>()
  for (const opening of room.openings) openWidth.set(opening.wall, (openWidth.get(opening.wall) ?? 0) + opening.width)
  const best = [...openWidth.entries()].filter(([id]) => outline.some((e) => e.wall?.id === id)).sort((a, b) => b[1] - a[1])[0]
  if (best !== undefined) return { edge: longest(outline.filter((e) => e.wall?.id === best[0]))!, found: 'openings' }
  const outside = longest(outline.filter((e) => e.wall?.kind === 'exterior'))
  if (outside !== undefined) return { edge: outside, found: 'outside' }
  const any = longest(outline)
  return any === undefined ? null : { edge: any, found: 'longest' }
}

const bandName = (i: number): string => String.fromCharCode(65 + i)

/** The room's floor in bands of depth from the side given. */
export function frontageZones(room: SurveyRoom, side: { edge: RoomEdge; found: FrontageZones['found'] }, depth = FRONTAGE_DEPTH, bands = FRONTAGE_BANDS): FrontageZones {
  const { edge } = side
  const length = Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y)
  const dir = { x: (edge.to.x - edge.from.x) / length, y: (edge.to.y - edge.from.y) / length }
  // The floor lies on the left of every side, so into the room is the left normal.
  const into = { x: -dir.y, y: dir.x }
  const xs = room.polygon.map((p) => p.x)
  const ys = room.polygon.map((p) => p.y)
  const far = 2 * Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + bands * depth + 1
  const at = (u: number, v: number): Pair => [snap(edge.from.x + dir.x * u + into.x * v), snap(edge.from.y + dir.y * u + into.y * v)]
  const floor = [ring(room.polygon), ...room.holes.map(ring)]
  const between = (from: number, to: number): number => intersectionArea([floor], [[at(-far, from), at(far, from), at(far, to), at(-far, to)]])
  const out: FrontageBand[] = []
  for (let i = 0; i < bands; i++) {
    // The first band reaches back past the frontage, so its edge never lies on the room's side.
    const area = between(i === 0 ? -far : i * depth, (i + 1) * depth)
    out.push({ name: bandName(i), from: i * depth, to: (i + 1) * depth, area, sqFt: sqFt(area) })
  }
  const rest = between(bands * depth, far)
  out.push({ name: english(said('frontage.rest')), from: bands * depth, to: null, area: rest, sqFt: sqFt(rest) })
  const area = out.reduce((total, band) => total + band.area, 0)
  return {
    room: room.facts.id,
    wall: edge.wall?.id ?? null,
    found: side.found,
    width: length,
    depth,
    bands: out,
    area,
    sqFt: sqFt(area),
    rule: english(said('frontage.rule', { depth: String(FRONTAGE_DEPTH), bands: FRONTAGE_BANDS })),
  }
}
