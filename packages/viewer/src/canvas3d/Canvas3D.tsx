// 3D model: extruded walls, real openings, orbit camera
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { floorElevations, type CameraRecord } from '@ongrid/floorplan/geometry'
import type { PlaybackClock } from '../preview/playback'
import type { PlanBuild } from '../preview/useBuildFrame'
import { isStillClick } from '../preview/click'
import { useReducedMotion } from '../preview/useReducedMotion'
import { usePlanColors } from './usePlanColors'
import { buildingFrame, buildingGround, buildingLayout } from './building'
import { openingCamera, recordCamera } from './camera'
import { moveRig } from './pivot'
import { BuildingScene, GROUND_GRID } from './BuildingScene'
import { OrbitControls } from './OrbitControls'
import type { StoreyPointer } from './Storey3D'

type BuildClock = PlaybackClock<PlanBuild>

interface Canvas3DProps {
  floorPlan: FloorPlan
  /**
   * The storey to show as a cutaway, or null for the whole building. A floor
   * the plan doesn't have counts as the whole building; one storey is always
   * shown on its own, exactly as 3D drew before storeys were stacked.
   */
  focus: string | null
  /** Each floor's live build, by floor id. Every storey builds in its own place. */
  builds?: ReadonlyMap<string, BuildClock>
  /** A room to show, its slab drawn in the plan-note colour. Without it nothing changes. */
  highlightRoom?: string | null
  /** A still click on a storey other than the focused one. */
  onFocus?: (floorId: string) => void
  /**
   * VEW-3: a camera record (a named view, or one an agent's view returned) to open at, turning
   * round its target. Initial-only, as the opening camera is: a new record needs a new canvas.
   * The opening camera when left out.
   */
  camera?: CameraRecord | null
}

/** Where the hover label sits, from the pointer, in pixels. */
const LABEL_OFFSET = 14

export function Canvas3D({
  floorPlan,
  focus,
  builds,
  highlightRoom = null,
  onFocus,
  camera = null
}: Canvas3DProps): JSX.Element {
  const colors = usePlanColors()
  const reducedMotion = useReducedMotion()

  // One stacking rule for 3D and IFC (`floorElevations`); the layout and the
  // framing only read it.
  const elevations = useMemo(() => floorElevations(floorPlan), [floorPlan])
  const layout = useMemo(() => buildingLayout(floorPlan, focus, elevations), [floorPlan, focus, elevations])
  const frame = useMemo(() => buildingFrame(floorPlan, elevations, focus), [floorPlan, elevations, focus])
  // VEW-66: the ground at the ground, cut away over the floors that go down into it.
  const { single, focus: shown } = layout
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the ground depends on the layout only through these two
  const ground = useMemo(() => buildingGround(floorPlan, layout, elevations), [floorPlan, elevations, single, shown])

  // The camera props are initial-only: the camera never moves on its own when
  // the plan changes. The pivot follows the footprint's centre in x and z, as
  // it always has, and only a change of focus eases its height (and the
  // camera's with it).
  const [initial] = useState(frame)
  const [view] = useState(() => (camera === null ? null : recordCamera(camera)))
  const frameRef = useRef(frame)
  frameRef.current = frame
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the focus is the trigger, not the plan
  const goalY = useMemo(() => (view === null ? frameRef.current.target[1] : view.target[1]), [focus, view])

  // Hover: which storey is under the pointer changes React state; the label
  // follows the pointer through its own DOM node, with no render per move.
  const container = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const pointer = useMemo<StoreyPointer | undefined>(() => {
    if (layout.single) return undefined
    return {
      onMove: (floorId: string, event: ThreeEvent<PointerEvent>) => {
        // The nearest storey under the pointer takes it.
        event.stopPropagation()
        setHovered(floorId)
        const box = container.current?.getBoundingClientRect()
        if (box && label.current) {
          label.current.style.transform = `translate(${event.clientX - box.left + LABEL_OFFSET}px, ${
            event.clientY - box.top + LABEL_OFFSET
          }px)`
        }
      },
      onLeave: (floorId: string) => setHovered((current) => (current === floorId ? null : current)),
      onClick: (floorId: string, event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        // Orbiting, panning and zooming are not clicks.
        if (!isStillClick(event.delta)) return
        if (floorId !== layout.focus) onFocus?.(floorId)
      }
    }
  }, [layout.single, layout.focus, onFocus])

  // A storey that is no longer drawn can't stay hovered.
  const shownHover = layout.storeys.some((s) => s.floorId === hovered && s.look !== 'hidden') ? hovered : null
  const hoveredName = layout.storeys.find((s) => s.floorId === shownHover)?.name ?? null

  const [cx, , cz] = frame.target
  // A record's camera turns round its own target, which the pivot keeps.
  const [px, , pz] = view === null ? frame.target : view.target

  return (
    <div ref={container} className="relative size-full overflow-hidden" style={{ cursor: shownHover ? 'pointer' : undefined }}>
      <Canvas shadows camera={view === null ? openingCamera(initial) : { position: view.position, fov: view.fov, near: view.near, far: view.far }}>
        <BuildingScene
          floorPlan={floorPlan}
          layout={layout}
          frame={frame}
          colors={colors}
          builds={builds}
          highlightRoom={highlightRoom}
          hovered={shownHover}
          pointer={pointer}
          ground={ground}
        />

        {/* At the ground, where it reads as ground; basements go below it (VEW-66). */}
        <GroundGrid x={cx} y={ground.y} z={cz} cellColor={colors.grid} sectionColor={colors.gridSection} />

        {/* Orbiting lets the build keep rising, like scrolling while code is written. */}
        <OrbitControls target={view === null ? initial.target : view.target} />
        <BuildingCamera x={px} z={pz} goalY={goalY} reducedMotion={reducedMotion} />
      </Canvas>

      {!layout.single && (
        <div
          ref={label}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-sm"
          style={{ visibility: hoveredName ? 'visible' : 'hidden' }}
        >
          {hoveredName}
        </div>
      )}
    </div>
  )
}

/**
 * The ground grid, `GROUND_GRID.args` across and centred under the building at the ground: three's grid
 * helper twice, a line every cell and one every section. The lines are as strong as a still
 * draws them, about their thickness squared, with the cell lines at three quarters.
 */
function GroundGrid({
  x,
  y,
  z,
  cellColor,
  sectionColor
}: {
  x: number
  /** The ground's height (VEW-66). */
  y: number
  z: number
  cellColor: string
  sectionColor: string
}): JSX.Element {
  const [size] = GROUND_GRID.args
  const cells = Math.round(size / GROUND_GRID.cellSize)
  const sections = Math.round(size / GROUND_GRID.sectionSize)
  const cellOpacity = 0.75 * GROUND_GRID.cellThickness ** 2
  const sectionOpacity = Math.min(1, GROUND_GRID.cellThickness ** 2 + GROUND_GRID.sectionThickness ** 2)
  // A helper's colours are read once, when it is made, so a new colour makes a new helper.
  return (
    <group position={[x, y + GROUND_GRID.y, z]}>
      <gridHelper
        key={`cells ${cellColor}`}
        args={[size, cells, cellColor, cellColor]}
        material-transparent
        material-opacity={cellOpacity}
        material-depthWrite={false}
      />
      <gridHelper
        key={`sections ${sectionColor}`}
        args={[size, sections, sectionColor, sectionColor]}
        material-transparent
        material-opacity={sectionOpacity}
        material-depthWrite={false}
      />
    </group>
  )
}

/** The orbit controls, the canvas's default controls, as far as the rig needs them. */
interface OrbitRig {
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
  update: () => void
}

/**
 * Keeps the orbit pivot on the footprint's centre (`x`, `z`) and eases it to
 * `goalY`, moving the camera up or down by the same amount so the angle and
 * distance the user orbited to hold (design D3). It renders nothing.
 */
function BuildingCamera({
  x,
  z,
  goalY,
  reducedMotion
}: {
  x: number
  z: number
  goalY: number
  reducedMotion: boolean
}): null {
  const controls = useThree((state) => state.controls) as unknown as OrbitRig | null
  const camera = useThree((state) => state.camera)

  useFrame((_, dt) => {
    if (!controls) return
    const { target } = controls
    if (target.x === x && target.y === goalY && target.z === z) return
    // A new footprint centre is taken at once, as 3D always did: only the
    // view's direction changes, never the camera's place.
    target.set(x, target.y, z)
    const next = moveRig(
      [target.x, target.y, target.z],
      [camera.position.x, camera.position.y, camera.position.z],
      goalY,
      dt,
      reducedMotion
    )
    target.set(...next.target)
    camera.position.set(...next.camera)
    controls.update()
  })
  return null
}
