/**
 * VEW-9: the walk-through's pictures, one from each doorway at eye height, a step into the room,
 * looking ahead, with VEW-3's eye camera (`eyeCamera`). Kept apart from `walk.ts`, which stays
 * free of the 3D model: only the command and the tool server draw them.
 */
import type { CameraRecord } from '@ongrid/floorplan/geometry'
import { eyeCamera } from '../draw/cameraAsk'
import type { Survey } from '../quantities/survey'
import { WALK_EYE_HEIGHT, type PlanWalk, type WalkStop } from './walk'
import type { Language } from '@ongrid/floorplan/messages'

/** How far into the room a picture is taken from the doorway's middle. */
const PICTURE_STEP = 0.5

/** The eye camera of each stop that has one, in stop order: a step into the room, looking ahead. */
export function walkCameras(survey: Survey, walk: PlanWalk): { stop: WalkStop; camera: CameraRecord }[] {
  const out: { stop: WalkStop; camera: CameraRecord }[] = []
  for (const floor of walk.floors) {
    for (const stop of floor.stops) {
      const room = survey.byId.get(stop.room)!
      const f = { x: Math.sin((stop.heading * Math.PI) / 180), y: Math.cos((stop.heading * Math.PI) / 180) }
      const step = stop.via === null ? 0 : Math.min(PICTURE_STEP, (stop.reach.ahead ?? PICTURE_STEP * 2) / 2)
      const stand = { x: stop.stand.x + f.x * step, y: stop.stand.y + f.y * step }
      out.push({ stop, camera: eyeCamera(survey.plan, { room: stop.room, polygon: room.polygon, stand, height: WALK_EYE_HEIGHT, toward: stop.heading }) })
    }
  }
  return out
}

/** A picture at eye height from each doorway of the walk, in stop order, at most `most`. */
export async function walkPictures(survey: Survey, walk: PlanWalk, most = Infinity, language?: Language): Promise<{ stop: WalkStop; png: Uint8Array }[]> {
  const cameras = walkCameras(survey, walk).slice(0, most)
  if (cameras.length === 0) return []
  const { cameraView } = await import('../draw/views')
  const out: { stop: WalkStop; png: Uint8Array }[] = []
  for (const { stop, camera } of cameras) out.push({ stop, png: (await cameraView(survey.plan, camera, language)).png })
  return out
}
