import type { Phase } from '@ongrid/floorplan/types/floorplan'

/** Phase colours in plan overlays, working elevations and 3D views. */
export const PHASE_COLOURS: Readonly<Record<Phase, string>> = {
  existing: '#908779',
  demolished: '#bf6360',
  new: '#72b4aa'
}
