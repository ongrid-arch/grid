/**
 * VEW-82: the nodes a GLB adds for a game engine or a renderer, worked out from the scene's parts:
 * the hinge a door's swinging leaf turns on, the marker that stands for a door, and the camera a
 * saved view (C11) becomes. Pure: each is a function of what it is given.
 *
 * Points are in the model's frame (Z up, C4) until they are written; glTF is Y up and a camera
 * looks down its node's -Z with its +Y up.
 */

import type { Vec2 } from '../vec2'
import type { SceneOpening, SceneOpeningPart, Vec3 } from '../scene3d'
import type { FloorPlan } from '../plan'
import { doorKindOf } from '../openingKinds'
import { limit } from '../tolerances'

/** What a GLB writes for each door: `closed` its leaves shut on their hinges, `open` the swinging ones turned open, `gaps` no leaves, `markers` an empty node in its place. */
export const GLB_DOOR_MODES = ['closed', 'open', 'gaps', 'markers'] as const
export type GlbDoorMode = (typeof GLB_DOOR_MODES)[number]

/** What a GLB writes for each straight wall: `whole` one mesh, `rooms` a piece per stretch between the rooms beside it. */
export const GLB_WALL_MODES = ['whole', 'rooms'] as const
export type GlbWallMode = (typeof GLB_WALL_MODES)[number]

/** How a door's leaves move, as a node's extras say (`gridMotion`). */
export type LeafMotion = 'swings' | 'slides' | 'folds' | 'rolls'

export function leafMotion(opening: Pick<SceneOpening, 'kind'>): LeafMotion {
  const kind = doorKindOf(opening.kind)
  if (kind === 'single' || kind === 'double') return 'swings'
  if (kind === 'sliding' || kind === 'pocket') return 'slides'
  if (kind === 'folding') return 'folds'
  return 'rolls'
}

const round9 = (v: number): number => Math.round(v * 1e9) / 1e9 + 0

/** A turn about glTF's Y (up) axis by `angle` radians, as a unit quaternion [x, y, z, w]. */
export function turnAboutUp(angle: number): number[] {
  return [0, round9(Math.sin(angle / 2)), 0, round9(Math.cos(angle / 2))]
}

const minus = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const unit = (v: Vec2): Vec2 => {
  const length = Math.hypot(v.x, v.y)
  return length > 0 ? { x: v.x / length, y: v.y / length } : { x: 1, y: 0 }
}
const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Where along a part's direction its door's jambs are: the least and the most of every part's points. */
function jambs(opening: SceneOpening, origin: Vec2, dir: Vec2): readonly [number, number] {
  const along = opening.parts.flatMap((part) => part.outline.map((p) => dot(minus(p, origin), dir)))
  return [Math.min(...along), Math.max(...along)]
}

/** A swinging leaf's hinge: the foot of the leaf's edge nearer a jamb, and +1 or -1, the way a turn about up opens it. */
export interface LeafHinge {
  readonly at: Vec3
  readonly opens: 1 | -1
}

/**
 * The hinge of one leaf of a swinging door. The leaf's outline runs along its wall from its first
 * point to its second, and across toward the wall's left face from its first to its fourth
 * (`sceneOpening`), so the end nearer a jamb is its hinge, and it opens toward the face the door
 * swings to (`left` for a door that does not say).
 */
export function leafHinge(opening: SceneOpening, leaf: SceneOpeningPart, swing: 'left' | 'right' | undefined): LeafHinge {
  const [p0, p1, p2, p3] = leaf.outline as [Vec2, Vec2, Vec2, Vec2]
  const dir = unit(minus(p1, p0))
  const [low, high] = jambs(opening, p0, dir)
  const s1 = dot(minus(p1, p0), dir)
  const nearer = (s: number): number => Math.min(Math.abs(s - low), Math.abs(s - high))
  const atStart = nearer(0) <= nearer(s1)
  const foot = atStart ? mid(p0, p3) : mid(p1, p2)
  const free = atStart ? dir : { x: -dir.x, y: -dir.y }
  const left = unit(minus(p3, p0))
  const toward = swing === 'right' ? { x: -left.x, y: -left.y } : left
  // A turn counter-clockwise about up takes `free` toward (-free.y, free.x).
  const opens = -free.y * toward.x + free.x * toward.y >= 0 ? 1 : -1
  return { at: { x: foot.x, y: foot.y, z: leaf.bottom }, opens }
}

/** How far an open leaf is turned, in radians. */
export const openAngle = (): number => (limit('doorOpenAngle') * Math.PI) / 180

/** A door's marker: the foot of its threshold's middle, its turn about up (its wall's direction from +x), its width and its height. */
export interface DoorMarker {
  readonly at: Vec3
  readonly turn: number
  readonly width: number
  readonly height: number
}

export function doorMarker(opening: SceneOpening): DoorMarker | null {
  const first = opening.parts[0]
  if (first === undefined) return null
  const [p0, p1] = first.outline as [Vec2, Vec2]
  const dir = unit(minus(p1, p0))
  const [low, high] = jambs(opening, p0, dir)
  const points = opening.parts.flatMap((part) => part.outline)
  const across = { x: -dir.y, y: dir.x }
  const sides = points.map((p) => dot(minus(p, p0), across))
  const middle = (low + high) / 2
  const depth = (Math.min(...sides) + Math.max(...sides)) / 2
  const bottom = Math.min(...opening.parts.map((part) => part.bottom))
  const top = Math.max(...opening.parts.map((part) => part.top))
  return {
    at: { x: p0.x + dir.x * middle + across.x * depth, y: p0.y + dir.y * middle + across.y * depth, z: bottom },
    turn: Math.atan2(dir.y, dir.x),
    width: high - low,
    height: top - bottom
  }
}

/** Z up to Y up: (x, y, z) → (x, z, -y), as the meshes are written. `0 - y` so y = 0 is not -0. */
export const yUpOf = (p: Vec3): [number, number, number] => [p.x, p.z, 0 - p.y]

/** A saved view as a glTF camera: its node's place and turn, and the camera's lens. */
export interface ViewCamera {
  readonly name: string
  readonly translation: readonly [number, number, number]
  readonly rotation: readonly number[]
  readonly yfov: number
  readonly aspectRatio: number
  readonly znear: number
  readonly target: readonly [number, number, number]
  readonly room?: string
}

type V3 = readonly [number, number, number]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit3 = (v: V3): V3 => {
  const length = Math.hypot(...v)
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, -1]
}

/** The unit quaternion [x, y, z, w] of the rotation whose matrix has these columns. */
function quaternionOf(x: V3, y: V3, z: V3): number[] {
  const [m00, m10, m20] = x
  const [m01, m11, m21] = y
  const [m02, m12, m22] = z
  const trace = m00 + m11 + m22
  let q: [number, number, number, number]
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]
  }
  const length = Math.hypot(...q)
  return q.map((v) => round9(v / length))
}

/**
 * The plan's saved views as cameras, in the plan's order. A view states where its camera stands,
 * the way it looks and its up, in plan metres with z up from the ground floor's floor level (C11),
 * which is where the GLB's world puts the plan: so a camera is a root of the scene, at the view's
 * own place, whatever node carries the site's offset.
 */
export function viewCameras(plan: Pick<FloorPlan, 'views'>): ViewCamera[] {
  return (plan.views ?? []).map((view) => {
    const position = yUpOf({ x: view.position[0], y: view.position[1], z: view.position[2] })
    const forward = unit3(yUpOf({ x: view.direction[0], y: view.direction[1], z: view.direction[2] }))
    const up0 = yUpOf({ x: view.up[0], y: view.up[1], z: view.up[2] })
    const right = unit3(cross3(forward, up0))
    const up = cross3(right, forward)
    const back: V3 = [-forward[0], -forward[1], -forward[2]]
    return {
      name: view.name,
      translation: position,
      rotation: quaternionOf(right, up, back),
      yfov: (view.fieldOfView * Math.PI) / 180,
      aspectRatio: view.aspectRatio,
      znear: limit('cameraNear'),
      target: view.target.point,
      ...(view.target.room === undefined ? {} : { room: view.target.room })
    }
  })
}
