// What the 3D view shows: its background, its lights and the building's storeys.
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { PlaybackClock } from '../preview/playback'
import type { PlanBuild } from '../preview/useBuildFrame'
import type { PlanColors3D } from './usePlanColors'
import type { BuildingFrame, BuildingGround, BuildingLayout } from './building'
import { Ground3D } from './Ground3D'
import { Storey3D, type StoreyPointer } from './Storey3D'

type BuildClock = PlaybackClock<PlanBuild>

const NO_BUILDS: ReadonlyMap<string, BuildClock> = new Map()

/**
 * The ground grid under the building. The app draws it with three's grid helper and a still
 * draws the same lines itself, both from these figures.
 */
export const GROUND_GRID = {
  /** Just under the ground (VEW-66: `BuildingGround.y`, which it is from), where it reads as ground. */
  y: -0.01,
  args: [40, 40] as [number, number],
  cellSize: 1,
  cellThickness: 0.5,
  sectionSize: 5,
  sectionThickness: 1,
  fadeDistance: 45,
  fadeStrength: 1
} as const

export interface BuildingSceneProps {
  floorPlan: FloorPlan
  layout: BuildingLayout
  frame: BuildingFrame
  colors: PlanColors3D
  /** Each floor's live build, by floor id. Every storey builds in its own place. */
  builds?: ReadonlyMap<string, BuildClock>
  highlightRoom?: string | null
  /** The storey under the pointer, tinted. */
  hovered?: string | null
  pointer?: StoreyPointer
  /** VEW-66: the ground, drawn as a surface the floors below it show faded through. None when left out. */
  ground?: BuildingGround | null
  /** VEW-78: whether the rooms' ceilings are drawn, for a camera standing in a room. Not when left out. */
  ceilings?: boolean
}

/**
 * Everything in the 3D scene but the camera, its controls and the ground grid: the app's
 * canvas mounts it, and so does a still (`still/stillScene.tsx`), so a part added here shows
 * in both. It reads no DOM.
 */
export function BuildingScene({
  floorPlan,
  layout,
  frame,
  colors,
  builds = NO_BUILDS,
  highlightRoom = null,
  hovered = null,
  pointer,
  ground = null,
  ceilings = false
}: BuildingSceneProps): JSX.Element {
  const { shadow } = frame
  const { roof } = layout

  return (
    <>
      <color attach="background" args={[colors.background]} />
      <hemisphereLight args={['#fdfbf5', '#6b6553', 2.2]} />
      <directionalLight
        position={shadow.position}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-shadow.extent}
        shadow-camera-right={shadow.extent}
        shadow-camera-top={shadow.extent}
        shadow-camera-bottom={-shadow.extent}
        shadow-camera-near={shadow.near}
        shadow-camera-far={shadow.far}
      />

      {layout.storeys.map((storey) =>
        storey.look === 'hidden' ? null : (
          <Storey3D
            key={storey.floorId}
            floorPlan={floorPlan}
            storey={storey}
            roof={roof !== null}
            build={builds.get(storey.floorId) ?? null}
            colors={colors}
            highlightRoom={highlightRoom}
            hovered={storey.floorId === hovered}
            castShadow={!layout.single}
            pointer={pointer}
            ceilings={ceilings}
          />
        )
      )}

      {ground !== null && <Ground3D ground={ground} color={colors.background} />}
    </>
  )
}
