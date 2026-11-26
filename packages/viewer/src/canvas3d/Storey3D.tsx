import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { buildScene, planForFloor } from '@ongrid/floorplan/geometry'
import type { PlaybackClock } from '../preview/playback'
import type { PlanBuild } from '../preview/useBuildFrame'
import { useBuildStep } from '../preview/useBuildFrame'
import { pulseAt } from '../preview/pulse'
import { useReducedMotion } from '../preview/useReducedMotion'
import { Slab3D } from './Slab3D'
import { Stair3D } from './Stair3D'
import { Column3D } from './Column3D'
import { Item3D } from './Item3D'
import { Opening3D } from './Opening3D'
import { Shell3D } from './Shell3D'
import { Divider3D } from './Divider3D'
import { RoomMarker3D } from './RoomMarker3D'
import { buildWallGeometry, useWallGeometries } from './useWallGeometries'
import { hoverColor, mutedColor, mutedGlow, toThree, wallExposureColor } from './convert'
import type { PlanColors3D } from './usePlanColors'
import type { BuildObjects } from './buildFrame3d'
import { applyFrame, openingOutline, pulseHeight } from './buildFrame3d'
import { cutOpening } from './cutWall'
import { createSceneMemo, type StoreyLayout } from './building'

type ObjectMap = Map<string, THREE.Object3D>

/** Keeps a map of the objects a build frame moves, as React mounts and unmounts them. */
function register(map: ObjectMap, id: string) {
  return (object: THREE.Object3D | null) => {
    if (object) map.set(id, object)
    else map.delete(id)
  }
}

/** Pointer handlers for a storey that can be hovered and clicked. */
export interface StoreyPointer {
  onMove: (floorId: string, event: ThreeEvent<PointerEvent>) => void
  onLeave: (floorId: string) => void
  onClick: (floorId: string, event: ThreeEvent<MouseEvent>) => void
}

interface Storey3DProps {
  /** The plan the preview shows; this storey slices its own floor out of it. */
  floorPlan: FloorPlan
  storey: StoreyLayout
  /** Whether this storey draws its roof (LVL-4): when the whole building is shown. */
  roof: boolean
  /** This floor's live build, if it has one. Its plans are already this floor's slice. */
  build: PlaybackClock<PlanBuild> | null
  colors: PlanColors3D
  /** A room to show, its slab drawn in the plan-note colour. */
  highlightRoom: string | null
  hovered: boolean
  /** Shading the storeys below; off for one storey, as 3D always drew. */
  castShadow: boolean
  /** Hover and click, for a building of several storeys. Without it the storey ignores the pointer. */
  pointer?: StoreyPointer
}

/**
 * One storey of the building: its floor's slice, drawn exactly as that floor
 * alone would be, raised to its floor level by its group (C4 holds inside the
 * group). Its own scene memo and wall cache mean an update to another floor,
 * or a change in this storey's height, rebuilds nothing here.
 */
export function Storey3D({
  floorPlan,
  storey,
  roof,
  build,
  colors,
  highlightRoom,
  hovered,
  castShadow,
  pointer
}: Storey3DProps): JSX.Element {
  const { floorId, look } = storey

  // During a build the plan after the steps started so far stands in for the
  // file's. It changes once per step; the parts in flight move on the render
  // loop below, with no React render.
  const step = useBuildStep(build)
  const source = step?.plan ?? floorPlan

  const plan = useMemo(() => planForFloor(source, floorId), [source, floorId])
  const memo = useRef(createSceneMemo()).current
  const scene = useMemo(() => memo(plan), [memo, plan])
  const wallGeometries = useWallGeometries(scene, storey.cut)

  const palette = useMemo(() => {
    const tone = (color: string): string => {
      const base = look === 'muted' ? mutedColor(color, colors.background) : color
      return hovered ? hoverColor(base, colors.note) : base
    }
    return {
      wallExterior: tone(colors.wallExterior),
      wallInterior: tone(colors.wallInterior),
      wallDetached: tone(colors.wallDetached),
      floor: tone(colors.floor),
      note: colors.note
    }
  }, [colors, look, hovered])
  const shadows = castShadow && look === 'solid'
  const glow = mutedGlow(look, colors.mutedWash)

  const current = step?.build ?? null
  const prev = useMemo(() => (current ? planForFloor(current.prev, floorId) : null), [current, floorId])

  // What this build removes, drawn from the plan before so it can fade out.
  const leaving = useMemo(() => {
    if (!current || !prev) return null
    const removed = new Set(current.steps.filter((s) => s.kind === 'remove').map((s) => s.id))
    if (removed.size === 0) return null
    const before = buildScene(prev)
    return {
      walls: before.walls
        .filter((wall) => removed.has(wall.id))
        .map((wall) => ({ wall, geometry: buildWallGeometry(wall) })),
      slabs: before.slabs.filter((slab) => removed.has(slab.roomId))
    }
  }, [current, prev])
  useEffect(() => () => leaving?.walls.forEach(({ geometry }) => geometry.dispose()), [leaving])

  // The outline of each hole this build cuts, highlighted while it's cut.
  const outlines = useMemo(() => {
    if (!current) return []
    const next = planForFloor(current.next, floorId)
    return current.steps
      .filter((s) => s.kind === 'opening')
      .flatMap((s) => {
        const opening = next.openings.find((o) => o.id === s.id)
        const wall = opening && next.walls.find((w) => w.id === opening.wall)
        if (!opening || !wall) return []
        const points = openingOutline(opening, wall).flatMap((loop) =>
          loop.flatMap((p, i) => [toThree(p), toThree(loop[(i + 1) % loop.length])])
        )
        return [{ id: s.id, geometry: new THREE.BufferGeometry().setFromPoints(points) }]
      })
  }, [current, floorId])
  useEffect(() => () => outlines.forEach(({ geometry }) => geometry.dispose()), [outlines])

  const objects = useRef<BuildObjects & { [K in keyof BuildObjects]: ObjectMap }>({
    walls: new Map(),
    slabs: new Map(),
    leaving: new Map(),
    highlights: new Map()
  }).current

  return (
    <group
      position-y={storey.base}
      onPointerMove={pointer && ((event) => pointer.onMove(floorId, event))}
      onPointerOut={pointer && (() => pointer.onLeave(floorId))}
      onClick={pointer && ((event) => pointer.onClick(floorId, event))}
    >
      {scene.walls.map((wall) => {
        const geometry = wallGeometries.get(wall.id)
        return geometry ? (
          <mesh
            key={wall.id}
            ref={register(objects.walls, wall.id)}
            geometry={geometry}
            castShadow={look === 'solid'}
            receiveShadow
          >
            <meshStandardMaterial
              color={wallExposureColor(wall.exposure, palette)}
              emissive={wallExposureColor(wall.exposure, palette)}
              emissiveIntensity={glow}
              roughness={0.85}
              metalness={0}
            />
          </mesh>
        ) : null
      })}

      {scene.slabs.map((slab) => (
        <Slab3D
          key={slab.roomId}
          slab={slab}
          color={slab.roomId === highlightRoom ? palette.note : palette.floor}
          meshRef={register(objects.slabs, slab.roomId)}
          castShadow={shadows}
          glow={glow}
        />
      ))}
      {scene.stairs.map((stair) => (
        <Stair3D key={`stair:${stair.id}`} stair={stair} color={palette.floor} castShadow={shadows} glow={glow} />
      ))}
      {(scene.columns ?? []).map((column) => (
        <Column3D key={`column:${column.id}`} column={column} color={palette.wallExterior} castShadow={shadows} glow={glow} />
      ))}
      {(scene.items ?? []).map((item) => (
        <Item3D key={`item:${item.id}`} item={item} color={palette.wallInterior} cut={storey.cut} castShadow={shadows} glow={glow} />
      ))}
      {scene.openings.map((opening) => (
        <Opening3D
          key={`opening:${opening.id}`}
          opening={storey.cut === null ? opening : cutOpening(opening, storey.cut)}
          colors={{ frame: palette.wallExterior, leaf: palette.floor, glass: colors.background }}
          glow={glow}
        />
      ))}
      {scene.dividers.map((divider) => (
        <Divider3D key={`divider:${divider.wallId}`} divider={divider} color={colors.gridSection} />
      ))}
      {scene.shell !== null && <Shell3D shell={scene.shell} roof={roof} color={palette.floor} castShadow={shadows} glow={glow} />}
      {scene.slabs
        .filter((slab) => slab.roomId === highlightRoom)
        .map((slab) => (
          <RoomMarker3D key={`note:${slab.roomId}`} slab={slab} wallHeight={scene.height} color={colors.note} />
        ))}

      {leaving?.walls.map(({ wall, geometry }) => (
        <mesh key={`leaving:${wall.id}`} ref={register(objects.leaving, wall.id)} geometry={geometry} visible={false}>
          <meshStandardMaterial color={wallExposureColor(wall.exposure, palette)} roughness={0.85} metalness={0} />
        </mesh>
      ))}
      {leaving?.slabs.map((slab) => (
        <Slab3D
          key={`leaving:${slab.roomId}`}
          slab={slab}
          color={palette.floor}
          meshRef={register(objects.leaving, slab.roomId)}
        />
      ))}

      {outlines.map(({ id, geometry }) => (
        <lineSegments key={id} ref={register(objects.highlights, id)} geometry={geometry} visible={false}>
          <lineBasicMaterial color={colors.gridSection} />
        </lineSegments>
      ))}

      <BuildPlayer clock={build} objects={objects} plan={plan} prev={prev ?? plan} />
      {build && <Pulse clock={build} plan={plan} color={colors.wallExterior} />}
    </group>
  )
}

/**
 * Moves the parts in flight on every animation frame. Inside the R3F tree
 * because `useFrame` is; it renders nothing.
 */
function BuildPlayer({
  clock,
  objects,
  plan,
  prev
}: {
  clock: PlaybackClock<PlanBuild> | null
  objects: BuildObjects
  plan: FloorPlan
  prev: FloorPlan
}): null {
  useFrame(() => {
    // With no build, or none in flight, this puts every part at rest.
    applyFrame(objects, clock ? clock.sample().inFlight : [], plan, prev)
  })
  return null
}

/** The pulse's radius, in meters, and how long one beat takes, in seconds. */
const PULSE_RADIUS = 0.09
const PULSE_PERIOD = 1.4

/**
 * The "still working" pulse: a small soft sphere where the last part ended,
 * while the assistant works on its next save. Shown and moved on the render
 * loop, since whether the drawing has caught up changes without a React render.
 * Never under reduce motion, and never hit by the pointer. Local to its
 * storey's group, so it shows at that storey's height.
 */
function Pulse({
  clock,
  plan,
  color
}: {
  clock: PlaybackClock<PlanBuild>
  plan: FloorPlan
  color: string
}): JSX.Element {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const reducedMotion = useReducedMotion()

  useFrame(({ clock: time }) => {
    const sphere = mesh.current
    if (!sphere) return
    const at = pulseAt(clock.sample(), reducedMotion)
    sphere.visible = at !== null
    if (!at) return
    // Three is (x, height, -y): convention C4.
    sphere.position.set(at.x, pulseHeight(plan, at) + PULSE_RADIUS, -at.y)
    const beat = (1 - Math.cos((time.elapsedTime / PULSE_PERIOD) * Math.PI * 2)) / 2
    sphere.scale.setScalar(0.8 + 0.7 * beat)
    if (material.current) material.current.opacity = 0.55 - 0.35 * beat
  })

  return (
    <mesh ref={mesh} visible={false} raycast={() => null}>
      <sphereGeometry args={[PULSE_RADIUS, 16, 16]} />
      <meshBasicMaterial ref={material} color={color} transparent depthWrite={false} />
    </mesh>
  )
}
