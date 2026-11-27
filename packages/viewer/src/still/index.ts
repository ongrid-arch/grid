/**
 * 3D stills of a plan without a browser or the app.
 *
 * `planStill(plan, options)` mounts the app's own 3D scene (`BuildingScene`) in plain Node,
 * takes it with the app's opening camera (`OPENING_CAMERA`), and draws it in software. It
 * returns RGBA pixels; for a PNG, see `drawStill` in the `ongrid` package.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { CameraRecord } from '@ongrid/floorplan/geometry'
import { GROUND_GRID } from '../canvas3d/BuildingScene'
import { stillRoofShown } from '../canvas3d/building'
import type { PlanColors3D } from '../canvas3d/usePlanColors'
import { DARK_COLORS_3D, LIGHT_COLORS_3D } from './look3d'
import { rasterise, type RasterImage } from './rasterise'
import { stillScene } from './stillScene'
import { SKY } from '../canvas3d/finishTint'

export { OPENING_CAMERA, openingCamera, recordCamera, type RecordCameraProps, type ViewCamera } from '../canvas3d/camera'
export { LIGHT_COLORS_3D, DARK_COLORS_3D } from './look3d'
export { stillRoofShown } from '../canvas3d/building'
export { stillScene, type StillScene, type StillSceneOptions } from './stillScene'
export { rasterise, type RasterImage, type RasteriseOptions, type GroundGrid, type Sky } from './rasterise'

export const DEFAULT_STILL_WIDTH = 1200
export const DEFAULT_STILL_HEIGHT = 800

export interface StillOptions {
  /** A storey to show as a cutaway, as the app's floor focus does. The whole building by default. */
  readonly focus?: string | null
  /** In pixels: 1200 by 800 by default. */
  readonly width?: number
  readonly height?: number
  readonly look?: 'light' | 'dark' | PlanColors3D
  /**
   * Samples per pixel along each side, to smooth edges. 2 by default, and 1 for a still of
   * more than `SMOOTHED_PIXELS`, which would otherwise take a great deal of memory.
   */
  readonly supersample?: number
  /**
   * VEW-3: the camera to take it with (`cameraRecord`), as the app opens at it; its `cut` is
   * the floor shown cut away unless `focus` says otherwise. The app's opening camera when left out.
   */
  readonly camera?: CameraRecord
  /**
   * VEW-19: whether the roof is drawn over every part with nothing above, the stated roof where a
   * floor states one. `stillRoofShown` when left out: yes from outside, or when a floor states
   * its roof, and no with a floor cut away.
   */
  readonly roof?: boolean
  /**
   * VEW-78: whether the camera is taken as standing in a room: the floor it stands on drawn whole
   * with the rooms' ceilings, and a sky behind the glass in place of the background. Yes when the
   * camera record stands in a room (`standingIn`), no otherwise.
   */
  readonly inside?: boolean
}

/** The most pixels a still may have: 4800 by 3200 is within it. */
export const MAX_STILL_PIXELS = 16_000_000
/** The most pixels a still is smoothed by default. */
export const SMOOTHED_PIXELS = 4_000_000

/** A still of the 3D model of `plan`, as the app opens it. */
export function planStill(plan: FloorPlan, options: StillOptions = {}): RasterImage {
  const width = options.width ?? DEFAULT_STILL_WIDTH
  const height = options.height ?? DEFAULT_STILL_HEIGHT
  for (const [name, side] of [
    ['width', width],
    ['height', height]
  ] as const) {
    if (!Number.isInteger(side) || side < 1) {
      throw new RangeError(`A still's ${name} is a whole number of pixels, at least 1: got ${side}`)
    }
  }
  if (width * height > MAX_STILL_PIXELS) {
    throw new RangeError(`A still of ${width} by ${height} pixels is larger than ${MAX_STILL_PIXELS} pixels`)
  }
  const colors =
    options.look === 'dark' ? DARK_COLORS_3D : options.look === undefined || options.look === 'light' ? LIGHT_COLORS_3D : options.look

  const camera = options.camera
  const focus = options.focus !== undefined ? options.focus : (camera?.cut ?? null)
  const standing = camera !== undefined && camera.standingIn.room !== null
  const inside = options.inside ?? standing
  const roof = options.roof ?? stillRoofShown(plan, { focus, inside: standing })
  const still = stillScene(plan, { focus, colors, width, height, roof, inside, ...(camera ? { camera } : {}) })
  try {
    const [cx, , cz] = still.frame.target
    // A camera standing in a room sees the room, not the ground under its floor.
    const ground = standing || inside
      ? {}
      : {
          // VEW-66: at the ground, as the scene's own ground surface.
          ground: { ...GROUND_GRID, y: still.ground.y + GROUND_GRID.y, center: [cx, cz] as [number, number], cellColor: colors.grid, sectionColor: colors.gridSection }
        }
    return rasterise(still.scene, still.camera, {
      width,
      height,
      supersample: options.supersample ?? (width * height > SMOOTHED_PIXELS ? 1 : 2),
      ...ground,
      // VEW-78: from inside, the glass looks out at a sky, not at the page.
      ...(inside ? { sky: SKY } : {})
    })
  } finally {
    still.close()
  }
}
