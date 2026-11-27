/**
 * The app's own 3D scene, built in plain Node for a still.
 *
 * React Three Fiber builds Three objects from React components and only hands them to a
 * renderer to draw. Here it is given a renderer that draws nothing, so mounting the app's
 * `BuildingScene` leaves the very meshes, materials and lights the app would show in a
 * `THREE.Scene`, which `rasterise` then draws in software. No browser, no WebGL, no GPU.
 */
import * as THREE from 'three'
import { _roots, advance, createRoot, extend, flushSync, type RootState } from '@react-three/fiber'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { floorElevations } from '@ongrid/floorplan/geometry'
import { BuildingScene } from '../canvas3d/BuildingScene'
import { buildingFrame, buildingGround, buildingLayout, type BuildingFrame, type BuildingGround, type BuildingLayout } from '../canvas3d/building'
import type { CameraRecord } from '@ongrid/floorplan/geometry'
import { openingCamera, recordCamera } from '../canvas3d/camera'
import type { PlanColors3D } from '../canvas3d/usePlanColors'

export interface StillSceneOptions {
  /** The storey to show as a cutaway, as the app's floor focus does. The whole building by default. */
  readonly focus?: string | null
  readonly colors: PlanColors3D
  /** The picture's size in pixels, which sets the camera's aspect. */
  readonly width: number
  readonly height: number
  /** VEW-3: the camera to take it with, as the app opens at it. The app's opening camera when left out. */
  readonly camera?: CameraRecord
  /** VEW-19: whether the roof is drawn. The app's own rule when left out: only for the whole of several floors. */
  readonly roof?: boolean
  /**
   * VEW-78: the camera stands in a room: the floor it stands on is drawn whole, its walls uncut
   * (the floors above are left out, as for a cutaway), and with the rooms' ceilings. No when left out.
   */
  readonly inside?: boolean
}

export interface StillScene {
  readonly scene: THREE.Scene
  /** The camera as the app opens it, pointed at the pivot as its orbit controls point it (or at the record's target). */
  readonly camera: THREE.PerspectiveCamera
  readonly frame: BuildingFrame
  readonly layout: BuildingLayout
  /** VEW-66: the ground the scene draws, where the still's grid lies too. */
  readonly ground: BuildingGround
  /** Unmounts the scene and frees its geometry. */
  readonly close: () => void
}

/** The parts of a renderer React Three Fiber calls while it builds a scene. It draws nothing. */
function nullRenderer(canvas: object): THREE.WebGLRenderer {
  const renderer = {
    domElement: canvas,
    render() {},
    setPixelRatio() {},
    setSize() {}
  }
  return renderer as unknown as THREE.WebGLRenderer
}

let extended = false

/** Mounts the app's 3D scene for `plan` and returns it with the opening camera. */
export function stillScene(plan: FloorPlan, options: StillSceneOptions): StillScene {
  if (!extended) {
    // The app's canvas does the same: every Three class can be written as a component.
    extend(THREE as unknown as Parameters<typeof extend>[0])
    extended = true
  }
  const focus = options.focus ?? null
  const elevations = floorElevations(plan)
  const inside = options.inside === true
  const layout = buildingLayout(plan, focus, elevations, options.roof, inside)
  const frame = buildingFrame(plan, elevations, focus, options.roof)
  const ground = buildingGround(plan, layout, elevations)

  // Fiber keeps one root per canvas: any object will do as the key.
  const canvas = {}
  const root = createRoot(canvas as HTMLCanvasElement)
  root.configure({
    gl: nullRenderer(canvas),
    frameloop: 'never',
    dpr: 1,
    size: { width: options.width, height: options.height, top: 0, left: 0 },
    camera: options.camera ? recordCamera(options.camera) : openingCamera(frame)
  })

  let store: ReturnType<typeof root.render> | undefined
  flushSync(() => {
    store = root.render(<BuildingScene floorPlan={plan} layout={layout} frame={frame} colors={options.colors} ground={ground} ceilings={inside} />)
  })
  const state: RootState = store!.getState()
  // One frame, as the app draws before anything is seen: it puts every part at rest.
  advance(0, true, state)

  const camera = state.camera as THREE.PerspectiveCamera
  camera.aspect = options.width / options.height
  // A record's camera looks at its target, as the app's orbit controls point it there. Three's
  // own up (+y) and the record's (in the upright plane through the line of sight) turn the
  // camera the same way: neither rolls it.
  camera.lookAt(...(options.camera ? recordCamera(options.camera).target : frame.target))
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()

  const close = (): void => {
    // Unmounting runs the components' clean-ups, which free their geometry. Fiber's own
    // unmount waits half a second before letting go of the root, which would hold a
    // command open, so the root is dropped here instead.
    flushSync(() => {
      root.render(null)
    })
    _roots.delete(canvas as HTMLCanvasElement)
  }

  return { scene: state.scene, camera, frame, layout, ground, close }
}
