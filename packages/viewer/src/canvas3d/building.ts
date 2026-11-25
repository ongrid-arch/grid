import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import {
  SLAB_THICKNESS,
  brokenOnFloor,
  buildScene,
  floorElevations,
  planBounds,
  planFloors,
  limit,
  planStairs,
  sceneShell,
  type BuildingElevations,
  type Scene3D
} from '@ongrid/floorplan/geometry'
import { OPENING_CAMERA, cameraPosition } from './camera'

/**
 * The whole building in 3D, decided without Three:
 * which storeys are drawn and how, where each one stands,
 * and how the camera frames them. R3F doesn't render in jsdom, so Canvas3D only
 * maps these values onto Three objects and the unit tests cover the decisions.
 *
 * All positions here are in Three's frame (C4: `(x, height, -y)`).
 */

/**
 * How a storey is drawn. A focused storey is a cutaway: it is solid, the
 * storeys below are muted context, and the ones above are not mounted.
 */
export type StoreyLook = 'solid' | 'muted' | 'hidden'

export interface StoreyLayout {
  readonly floorId: string
  readonly name: string
  readonly level: number
  /** The top of its floor slab, where its walls stand: its group's Three y. */
  readonly base: number
  readonly clearHeight: number
  readonly look: StoreyLook
  /**
   * VEW-58: how high above `base` its walls are drawn, for the floor shown as a cutaway, and null
   * for every other storey and for the whole building. The plan's own cut (`planCutHeight`).
   */
  readonly cut: number | null
}

export interface BuildingLayout {
  /** Every floor the plan has, lowest level first, empty ones included. */
  readonly storeys: readonly StoreyLayout[]
  /** The focused floor, or null for the whole building. One storey is always focused. */
  readonly focus: string | null
  /** One floor or none: drawn exactly as before storeys were stacked. */
  readonly single: boolean
  /**
   * The roof slab over the top level's floors, absolute heights: the top of the building's box.
   * Null when a storey is focused (its ceiling is open to view) and for one storey, unless the
   * roof is asked for (VEW-19). While it is not null every storey drawn draws its own roof, over
   * its parts with nothing above (LVL-4). For one storey its heights are from base 0, as the storey's.
   */
  readonly roof: {
    readonly floorIds: readonly string[]
    readonly bottom: number
    readonly top: number
  } | null
}

function floorsOf(plan: FloorPlan) {
  const floors = planFloors(plan)
  // Lowest first; `planFloors` already sorts its registry, but appends floors
  // only an entity names. Stable, so floors sharing a level keep their order.
  return floors
    .map((floor, order) => ({ floor, order }))
    .sort((a, b) => a.floor.level - b.floor.level || a.order - b.order)
    .map(({ floor }) => floor)
}

/** The focus the plan can show: a floor it has, else the whole building. */
function resolveFocus(floorIds: readonly string[], focus: string | null): string | null {
  if (floorIds.length === 1) return floorIds[0]!
  return focus !== null && floorIds.includes(focus) ? focus : null
}

/**
 * Each storey's floor id, base and look for `focus` (null: the whole building).
 *
 * One floor keeps base 0 whatever its level, as a one-storey plan always drew.
 * A floor sharing the focused storey's level is hidden: it would stand in the
 * same place and draw over the cutaway.
 */
export function buildingLayout(
  plan: FloorPlan,
  focus: string | null,
  elevations: BuildingElevations = floorElevations(plan),
  roofAsked?: boolean
): BuildingLayout {
  const floors = floorsOf(plan)
  const single = floors.length <= 1
  const resolved = resolveFocus(
    floors.map((floor) => floor.id),
    focus
  )
  const focusLevel = floors.find((floor) => floor.id === resolved)?.level

  const storeys = floors.map((floor): StoreyLayout => {
    const storey = elevations.floors.get(floor.id)
    const look: StoreyLook =
      resolved === null || floor.id === resolved
        ? 'solid'
        : floor.level < focusLevel!
          ? 'muted'
          : 'hidden'
    return {
      floorId: floor.id,
      name: floor.name,
      level: floor.level,
      base: single ? 0 : (storey?.floorLevel ?? 0),
      clearHeight: storey?.clearHeight ?? 0,
      look,
      cut: focus !== null && floor.id === resolved ? limit('planCutHeight') : null
    }
  })

  let roof: BuildingLayout['roof'] = null
  const drawn = roofAsked ?? (!single && resolved === null)
  if (drawn && floors.length > 0) {
    const topLevel = floors[floors.length - 1]!.level
    // One storey stands at base 0 whatever its level, and so does its roof.
    const offset = single ? (elevations.floors.get(floors[0]!.id)?.floorLevel ?? 0) : 0
    roof = {
      floorIds: floors.filter((floor) => floor.level === topLevel).map((floor) => floor.id),
      bottom: elevations.roof.bottom - offset,
      top: elevations.roof.top - offset
    }
  }

  return { storeys, focus: resolved, single, roof }
}

/**
 * VEW-19: whether a still draws the roof when it is not asked to. With a floor cut away
 * (`focus`), no: a cutaway shows that floor open. Otherwise yes when the camera stands outside
 * every room, when some floor states its roof (`Floor.roof`), or when the building has several
 * floors; a camera standing in a room of a one-storey plan that states no roof sees it open, as
 * it always did. The GLB and the section draw the roof whatever the camera.
 */
export function stillRoofShown(plan: FloorPlan, view: { readonly focus: string | null; readonly inside: boolean }): boolean {
  if (view.focus !== null && planFloors(plan).some((floor) => floor.id === view.focus)) return false
  if (!view.inside) return true
  return (plan.floors ?? []).some((floor) => floor.roof !== undefined) || planFloors(plan).length > 1
}

type Vec3 = [number, number, number]

export interface BuildingFrame {
  /** The orbit pivot: the footprint centre, at the building's middle or the focused base. */
  readonly target: Vec3
  /** The camera, offset from the pivot by the opening view's angle and distance (`OPENING_CAMERA`). */
  readonly position: Vec3
  /** The building's box, from the lowest slab's underside to the roof's top. */
  readonly box: { readonly min: Vec3; readonly max: Vec3 }
  /** The largest of the footprint's sides and, with several storeys, the height. */
  readonly span: number
  /** The sun and its shadow camera, sized so the shadows cover the box. */
  readonly shadow: {
    readonly position: Vec3
    readonly extent: number
    readonly near: number
    readonly far: number
  }
}

/** Three's defaults for a directional light's shadow camera, and today's ±15 m box. */
const SHADOW_EXTENT = 15
const SHADOW_NEAR = 0.5
const SHADOW_FAR = 500
/** How far the sun sits above the plan, and above a tall building's top. */
const SUN_HEIGHT = 18
const SUN_ABOVE_TOP = 15
/** A little room so the box's edges never sit on the shadow camera's. */
const SHADOW_MARGIN = 1

/**
 * The camera, pivot and shadows for the building, focused or whole.
 *
 * The distance comes from the whole building whatever is focused, so changing
 * focus only moves the pivot and camera up or down by the same amount. With
 * one floor this is exactly the framing 3D always had: the footprint alone, the
 * pivot at y = 0.
 */
export function buildingFrame(
  plan: FloorPlan,
  elevations: BuildingElevations,
  focus: string | null,
  roofAsked?: boolean
): BuildingFrame {
  const layout = buildingLayout(plan, focus, elevations, roofAsked)
  const { min, max, width, height: depth } = planBounds(plan)
  const cx = (min.x + max.x) / 2
  const cz = -(min.y + max.y) / 2

  const lowest = Math.min(...layout.storeys.map((s) => s.base))
  const bottom = lowest - SLAB_THICKNESS
  // VEW-19: one storey drawn with its roof reaches to the roof's top, for the shadows.
  const top = layout.single
    ? Math.max(lowest + (layout.storeys[0]?.clearHeight ?? 0), layout.roof?.top ?? -Infinity)
    : elevations.roof.top

  const span = Math.max(width, depth, layout.single ? 0 : top - bottom, 1)

  const focused = layout.storeys.find((s) => s.floorId === layout.focus)
  const pivotY = layout.single ? 0 : focused ? focused.base : (bottom + top) / 2

  const box = {
    min: [min.x, bottom, -max.y] as Vec3,
    max: [max.x, top, -min.y] as Vec3
  }

  return {
    target: [cx, pivotY, cz],
    position: cameraPosition(OPENING_CAMERA, [cx, pivotY, cz], span),
    box,
    span,
    shadow: shadowFor(box, [cx + 7, Math.max(SUN_HEIGHT, top + SUN_ABOVE_TOP), cz + 9])
  }
}

/**
 * The shadow camera for a sun at `position` looking at the origin (Three's
 * default target), sized from the box's corners in the light's own axes.
 */
function shadowFor(box: BuildingFrame['box'], position: Vec3): BuildingFrame['shadow'] {
  const forward = normalize([-position[0], -position[1], -position[2]])
  const right = normalize(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)

  let extent = SHADOW_EXTENT
  let near = SHADOW_NEAR
  let far = SHADOW_FAR
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) {
        const rel: Vec3 = [x - position[0], y - position[1], z - position[2]]
        extent = Math.max(extent, Math.abs(dot(rel, right)) + SHADOW_MARGIN, Math.abs(dot(rel, up)) + SHADOW_MARGIN)
        const depth = dot(rel, forward)
        near = Math.min(near, depth - SHADOW_MARGIN)
        far = Math.max(far, depth + SHADOW_MARGIN)
      }

  return { position, extent, near, far }
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

/**
 * One storey's scene, built again only when its own slice changes.
 *
 * The watcher parses the file on every save, so every slice is a new object
 * even when nothing on that floor moved. Keyed on the slice's content instead,
 * an update to one floor leaves the other storeys' scenes, and so their meshes,
 * as they were. A storey's height is its group's translation, never part of
 * the slice, so the storey below growing taller rebuilds nothing here.
 */
export function createSceneMemo(): (slice: FloorPlan) => Scene3D {
  let last: { key: string; scene: Scene3D } | null = null
  return (slice) => {
    // A stair (LVL-3) is laid out from both floors it joins, so its blocks are part of the key.
    const stairs = (slice.stairs ?? []).length === 0 ? [] : planStairs(slice, brokenOnFloor).stairs
    // LVL-4: the slab and roof come from this floor's outline and the floors' next to it.
    const shell = sceneShell(slice)
    const key = JSON.stringify([slice.walls, slice.rooms, slice.openings, stairs, shell])
    if (last?.key !== key) last = { key, scene: buildScene(slice, { shell }) }
    return last.scene
  }
}
