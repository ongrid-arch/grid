/**
 * ARE-82: `grid_measure what=ground`, each floor below the ground measured against it: how deep
 * its floor is under the ground over it, its formation level (the underside of its slab on the
 * ground) and how deep that is, the most earth its walls hold on each side, its area below the
 * ground and the earth dug out under it, and the dig in all.
 *
 * Nothing new is worked out here. The ground is `groundLevel` (the site's ground, its slope, a
 * building's own pad; the lowest and the highest ground under a floor's walls), the levels are
 * `floorElevations`, and the retaining walls, the ground-bearing slabs and the dig are ARE-77's
 * `planEarth`. The sides are `planFacing`'s, by the plan's north. A depth within
 * `sameFloorLevel` is no depth, as ARE-77 has it. Every figure is a measure, said as one: the plan
 * states no retaining wall or dig, so all of it is assumed.
 */
import {
  COMPASS_POINTS,
  floorElevations,
  groundLevel,
  planEarth,
  planFacing,
  planFloors,
  planInState,
  planShell,
  shellKnown,
  tolerance,
  type CompassPoint,
  type FloorPlan,
} from '@ongrid/floorplan/geometry'
import { english, joined, name, said, type Said } from '@ongrid/floorplan/messages'
import type { Display } from '@ongrid/floorplan/types/units'
import { northData, northLine } from './facing'
import { areaText, lengthText } from './units'
import { volumeText } from './work'

export const DEPTH_RULE = english(said('depth.rule'))

/** A low and a high figure: the same on level ground. */
export interface Span {
  readonly low: number
  readonly high: number
}

/** The most earth a floor's walls hold on one side. */
export interface SideRetained {
  readonly side: CompassPoint
  /** The most earth any of its walls on that side holds, from the floor's level up to the ground, held to the wall's height, in metres. */
  readonly height: number
  /** Their outer face below the ground, in m². */
  readonly area: number
  readonly walls: readonly string[]
}

/** One floor below the ground. */
export interface FloorDepth {
  readonly floor: string
  readonly name: string | null
  /** Its floor level, in the floors' datum. */
  readonly level: number
  /** The ground over it: the lowest and the highest under its walls (its building's own ground). */
  readonly ground: Span
  /** The ground less its floor level, never below 0: how far its floor is below the ground. */
  readonly depth: Span
  /** `wholly` when its floor is under the lowest ground round it; `partly` when only under the highest, a floor cut into a slope. */
  readonly below: 'wholly' | 'partly'
  /** The underside of its slab on the ground and how far that is below the ground; null when no slab of it rests on the ground. */
  readonly formation: { readonly level: number; readonly depth: Span } | null
  /** By side, in compass order: only the sides with earth against them. */
  readonly retained: readonly SideRetained[]
  /** Its gross external area, in m², the whole of it below the ground when `below` is `wholly`; null when its outline is not known. */
  readonly area: number | null
  /** The earth dug out under it, or null when none is. */
  readonly dig: { readonly area: number; readonly depth: number; readonly volume: number } | null
}

export interface PlanDepths {
  readonly floors: readonly FloorDepth[]
  /** Every floor's dig, in m³. */
  readonly excavation: number
}

/** How far each floor's floor level stands under the ground round it, by floor id: only the floors under it somewhere. */
export function floorsBelowGround(stated: FloorPlan): Map<string, Span & { ground: Span; level: number }> {
  const plan = planInState(stated, 'after')
  const elevations = floorElevations(plan)
  const ground = groundLevel(plan, elevations)
  const same = tolerance('sameFloorLevel')
  const out = new Map<string, Span & { ground: Span; level: number }>()
  for (const floor of planFloors(plan)) {
    const level = elevations.floors.get(floor.id)?.floorLevel ?? 0
    const under = ground.under.get(floor.id) ?? { low: ground.groundOf(floor.id), high: ground.groundOf(floor.id) }
    if (!(under.high - level > same)) continue
    const held = (v: number): number => (v - level > same ? v - level : 0)
    out.set(floor.id, { low: held(under.low), high: held(under.high), ground: { low: under.low, high: under.high }, level })
  }
  return out
}

/** Each floor below the ground, measured against it. */
export function planDepths(stated: FloorPlan): PlanDepths {
  const below = floorsBelowGround(stated)
  const plan = planInState(stated, 'after')
  const earth = planEarth(stated)
  const facing = planFacing(plan)
  // The way each wall's outside face looks, by its longest stretch on its floor.
  const sideOf = new Map<string, { side: CompassPoint; run: number }>()
  for (const w of facing.walls) {
    const key = `${w.floor}\u0000${w.wall}`
    const run = Math.abs(w.to - w.from)
    if ((sideOf.get(key)?.run ?? -1) < run) sideOf.set(key, { side: w.faces, run })
  }
  const shells = new Map(planShell(stated).filter(shellKnown).map((s) => [s.floor, s] as const))
  const floors: FloorDepth[] = []
  for (const floor of planFloors(plan)) {
    const own = below.get(floor.id)
    if (own === undefined) continue
    const bearing = earth.bearing.find((b) => b.floor === floor.id)
    const formation = bearing === undefined ? null : { level: bearing.bottom, depth: { low: Math.max(0, own.ground.low - bearing.bottom), high: Math.max(0, own.ground.high - bearing.bottom) } }
    const sides = new Map<CompassPoint, { height: number; area: number; walls: string[] }>()
    for (const face of earth.retaining) {
      if (face.floor !== floor.id) continue
      const side = sideOf.get(`${face.floor}\u0000${face.wall}`)?.side
      if (side === undefined) continue
      const at = sides.get(side) ?? { height: 0, area: 0, walls: [] }
      at.height = Math.max(at.height, face.retained)
      at.area += face.area
      if (!at.walls.includes(face.wall)) at.walls.push(face.wall)
      sides.set(side, at)
    }
    const dig = earth.dig.find((d) => d.floor === floor.id)
    floors.push({
      floor: floor.id,
      name: floor.name ?? null,
      level: own.level,
      ground: own.ground,
      depth: { low: own.low, high: own.high },
      below: own.low > 0 ? 'wholly' : 'partly',
      formation,
      retained: COMPASS_POINTS.filter((side) => sides.has(side)).map((side) => ({ side, ...sides.get(side)! })),
      area: shells.get(floor.id)?.area ?? null,
      dig: dig === undefined ? null : { area: dig.area, depth: dig.depth, volume: dig.volume },
    })
  }
  return { floors, excavation: earth.excavation }
}

export interface DepthAnswer {
  readonly lines: readonly string[]
  readonly data: Record<string, unknown>
}

const settle = (value: number): number => Number(value.toPrecision(12))
const round = (value: number): number => Math.round(settle(value * 1000)) / 1000 + 0
const spanData = (s: Span): Span => ({ low: round(s.low), high: round(s.high) })

/** The answer to `grid_measure what=ground`, in the person's units. */
export function depthAnswer(stated: FloorPlan, display: Display): DepthAnswer {
  const depths = planDepths(stated)
  const L = (v: number): string => lengthText(v, display)
  const A = (v: number): string => areaText(v, display)
  const say = (value: Said): string => english(value)
  const span = (s: Span): string => (Math.abs(s.high - s.low) < tolerance('sameFloorLevel') ? L(s.high) : say(said('depth.range', { low: L(s.low), high: L(s.high) })))
  if (depths.floors.length === 0) return { lines: [say(said('depth.none'))], data: { floors: [], excavation: 0, state: 'assumed' } }
  const facing = planFacing(planInState(stated, 'after'))
  const lines = [say(said('depth.heading')), northLine(facing)]
  for (const f of depths.floors) {
    lines.push(say(said('depth.floor', { floor: name(f.name ?? f.floor), level: L(f.level), ground: span(f.ground), depth: span(f.depth), below: said(f.below === 'wholly' ? 'depth.below.wholly' : 'depth.below.partly') })))
    lines.push(f.formation === null ? say(said('depth.formation.none')) : say(said('depth.formation', { level: L(f.formation.level), depth: span(f.formation.depth) })))
    lines.push(f.retained.length === 0
      ? say(said('depth.retained.none'))
      : say(said('depth.retained', { sides: joined(f.retained.map((r) => said('depth.side', { height: L(r.height), side: r.side })), 'join.comma') })))
    if (f.area !== null) lines.push(say(said(f.below === 'wholly' ? 'depth.area' : 'depth.area.partly', { area: A(f.area) })))
    if (f.dig !== null) lines.push(say(said('depth.dig', { area: A(f.dig.area), depth: L(f.dig.depth), volume: volumeText(f.dig.volume, display) })))
  }
  lines.push(say(said('depth.excavation', { volume: volumeText(depths.excavation, display) })))
  const data = {
    ...northData(facing),
    floors: depths.floors.map((f) => ({
      floor: f.floor,
      name: f.name,
      level: round(f.level),
      ground: spanData(f.ground),
      depth: spanData(f.depth),
      below: f.below,
      formation: f.formation === null ? null : { level: round(f.formation.level), depth: spanData(f.formation.depth) },
      retained: f.retained.map((r) => ({ side: r.side, height: round(r.height), area: round(r.area), walls: r.walls })),
      area: f.area === null ? null : round(f.area),
      dig: f.dig === null ? null : { area: round(f.dig.area), depth: round(f.dig.depth), volume: round(f.dig.volume) },
    })),
    excavation: round(depths.excavation),
    state: 'assumed',
  }
  return { lines, data }
}
