/**
 * VEW-75: `grid_view kind=eye`'s camera: where it stands (`stand_at` a point, or `at` a door or
 * opening of the room, an item or a corner; else the room's middle line, or, in a small room, its
 * doorway), what it looks at (`toward` an opening, an item or a direction, or `look_at` a point;
 * else the room's first window, or across to its far corner), the lens, the tilt and a one-point
 * or two-point perspective; never inside a fixture or a piece of furniture. The words that say so
 * go with it. The picture is taken by `readTools.ts` from the record.
 */
import { CAMERA_SENSOR, floorOf, itemName, openingGlazed, pointInPolygon, wallPointAt, type CameraRecord, type FloorPlan, type Vec2 } from '@ongrid/floorplan/geometry'
import { EYE_FOCAL_LENGTH, eyeCamera } from '../draw/cameraAsk'
import { eyeStand } from '../draw/views'
import {
  EYE_CORNERS,
  SMALL_ROOM_AREA,
  clearOfItems,
  cornerPoint,
  doorwayPoint,
  farCorner,
  floorItems,
  headingTo,
  inFrontOf,
  itemAt,
  offSquare,
  squareHeading,
  twoPointHeading,
} from '../draw/eyePlace'
import { roomCalled, type Survey, type SurveyRoom } from '../quantities/survey'
import { m, openingArg, ToolRefusal } from './toolkit'

const q = (text: string): string => JSON.stringify(text)
const DEG = Math.PI / 180

/** The directions `toward` takes, as headings on the drawing (north is its top). */
export const EYE_HEADING: Readonly<Record<string, number>> = { north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315 }

export const PERSPECTIVES = ['one-point', 'two-point'] as const
export type Perspective = (typeof PERSPECTIVES)[number]

/** What kind=eye was asked, as read from the call. */
export interface EyeAsk {
  readonly height: number
  readonly at?: string
  readonly standAt?: readonly [number, number]
  readonly toward?: string
  readonly lookAt?: readonly [number, number]
  readonly lens?: number
  readonly tilt?: number
  readonly perspective?: Perspective
}

/** A look at the closest point allowed, in metres. */
const NEAREST_LOOK = 0.3

function shoelace(polygon: readonly Vec2[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** The eye view's camera for a call, with what the answer says about it. Refused, with why. */
export function eyeShot(plan: FloorPlan, survey: Survey, room: SurveyRoom, ask: EyeAsk): { camera: CameraRecord; sentence: string } {
  if (ask.at !== undefined && ask.standAt !== undefined) throw new ToolRefusal('Pass at or stand_at, not both: each says where to stand.')
  if (ask.toward !== undefined && ask.lookAt !== undefined) throw new ToolRefusal('Pass toward or look_at, not both: each says where to look.')
  if (ask.perspective !== undefined && ask.tilt !== undefined && ask.tilt !== 0) {
    throw new ToolRefusal(`perspective=${ask.perspective} looks level, so upright lines stay upright: leave tilt out, or leave perspective out to tilt the camera.`)
  }
  const id = room.facts.id
  const name = roomCalled(room.facts)
  const floor = room.facts.floor
  const items = floorItems(plan, floor)
  const planItems = plan.items ?? []
  const isOpening = (given: string): boolean => plan.openings.some((o) => o.id === given)

  // What it looks at, when the call says.
  let toward: Vec2 | number | null = null
  let looking = ''
  if (ask.lookAt !== undefined) {
    toward = { x: ask.lookAt[0], y: ask.lookAt[1] }
    looking = `the point (${m(ask.lookAt[0])}, ${m(ask.lookAt[1])})`
  } else if (ask.toward !== undefined && Object.hasOwn(EYE_HEADING, ask.toward)) {
    toward = EYE_HEADING[ask.toward]!
    looking = ask.toward
  } else if (ask.toward !== undefined && !isOpening(ask.toward) && planItems.some((i) => i.id === ask.toward)) {
    const item = planItems.find((i) => i.id === ask.toward)!
    if (floorOf(item) !== floor) throw new ToolRefusal(`toward ${q(item.id)} is on another floor than ${q(name)}: name an item on its floor.`)
    toward = { x: item.at[0], y: item.at[1] }
    looking = `${q(itemName(item))}`
  } else if (ask.toward !== undefined) {
    toward = openingPoint(plan, survey, openingArg(plan, ask.toward))
    looking = openingWords(survey, ask.toward)
  }

  // Where it stands.
  let stand: Vec2
  let stood: string
  let across = false
  let facing: number | null = null
  let placedByGrid = true
  if (ask.standAt !== undefined) {
    const p = { x: ask.standAt[0], y: ask.standAt[1] }
    if (!pointInPolygon(p, room.polygon, room.holes)) throw new ToolRefusal(`stand_at (${m(p.x)}, ${m(p.y)}) is not on the floor of ${q(name)}: pass a point inside the room.`)
    const blocked = itemAt(items, p)
    if (blocked !== null) throw new ToolRefusal(`stand_at (${m(p.x)}, ${m(p.y)}) is inside or against ${q(itemName(planItems.find((i) => i.id === blocked)!))}: pass a point on the clear floor, or at an item to stand in front of it.`)
    stand = p
    stood = ''
    placedByGrid = false
  } else if (ask.at !== undefined && Object.hasOwn(EYE_CORNERS, ask.at)) {
    const p = cornerPoint(room, EYE_CORNERS[ask.at]!)
    if (p === null) throw new ToolRefusal('That room has no outline Grid can draw; grid_check says why.')
    stand = p
    stood = ` in its ${ask.at} corner`
    across = true
  } else if (ask.at !== undefined && isOpening(ask.at)) {
    const opening = room.openings.find((o) => o.id === ask.at)
    if (opening === undefined) throw new ToolRefusal(`at ${q(ask.at)} is not in a wall of ${q(name)}: name one of its doors or openings (${doorsOf(room) || 'it has none'}).`)
    if (opening.type === 'window') throw new ToolRefusal(`at ${q(ask.at)} is a window, which is not stood in: name a door or an opening, or stand_at a point in front of it.`)
    const p = doorwayPoint(plan, room, opening)
    if (p === null) throw new ToolRefusal('That opening can\'t be drawn; grid_check says why.')
    stand = p
    stood = ` in the doorway of ${opening.type} ${q(opening.id)}`
    across = true
  } else if (ask.at !== undefined && planItems.some((i) => i.id === ask.at)) {
    const item = planItems.find((i) => i.id === ask.at)!
    const front = inFrontOf(item)
    if (floorOf(item) !== floor || !pointInPolygon(front.stand, room.polygon, room.holes)) throw new ToolRefusal(`at ${q(item.id)}: the floor in front of it is not in ${q(name)}: name an item in the room, or pass another room.`)
    stand = front.stand
    stood = ` in front of ${q(itemName(item))}`
    facing = front.heading
  } else if (ask.at !== undefined) {
    throw new ToolRefusal(`at takes a door or opening of ${q(name)} (${doorsOf(room) || 'it has none'}), an item's id, or a corner of the room: ${Object.keys(EYE_CORNERS).join(', ')}. For a point, pass stand_at.`)
  } else {
    const door = room.openings.find((o) => o.type === 'door') ?? room.openings.find((o) => o.type !== 'window')
    const small = shoelace(room.polygon) < SMALL_ROOM_AREA
    const doorway = small && toward === null && door !== undefined ? doorwayPoint(plan, room, door) : null
    if (doorway !== null) {
      stand = doorway
      stood = ` in the doorway of ${door!.type} ${q(door!.id)}, as the room is small`
      across = true
    } else {
      if (toward === null && ask.perspective !== 'two-point') {
        // VEW-78: a glazed door is glazing too, and looked toward with the windows.
        const windows = room.openings.filter((o) => o.type === 'window' || (o.type === 'door' && glazedDoor(plan, o.id)))
        const target = windows[0]?.id ?? room.openings[0]?.id
        if (target === undefined) throw new ToolRefusal('That room has no opening to look at: pass toward as a direction, such as north.')
        toward = openingPoint(plan, survey, target)
        looking = openingWords(survey, target)
      }
      stand = eyeStand(room.polygon, toward ?? 0, room.holes)
      stood = ''
      if (toward === null) across = true
    }
  }

  // VEW-75: never inside a fixture or a piece of furniture.
  let moved = ''
  if (placedByGrid) {
    const blocked = itemAt(items, stand)
    if (blocked !== null) {
      const clear = clearOfItems(room, items, stand)
      if (clear === null) throw new ToolRefusal(`The floor of ${q(name)} round where the eye would stand is taken by ${q(itemName(planItems.find((i) => i.id === blocked)!))}: pass stand_at on its clear floor.`)
      moved = `, moved ${m(Math.hypot(clear.x - stand.x, clear.y - stand.y))} m clear of ${q(itemName(planItems.find((i) => i.id === blocked)!))}`
      stand = clear
    }
  }

  if (toward === null && facing !== null) {
    toward = facing
    looking = 'the way it faces'
  }
  if (toward === null || (across && ask.toward === undefined && ask.lookAt === undefined)) {
    toward = farCorner(room, stand)
    looking = 'the far corner of the room, diagonally across'
  }
  if (typeof toward !== 'number' && Math.hypot(toward.x - stand.x, toward.y - stand.y) < NEAREST_LOOK) {
    throw new ToolRefusal(`What it looks at is under ${NEAREST_LOOK} m from where it stands: look at something further away.`)
  }

  let perspective = ''
  if (ask.perspective !== undefined) {
    const heading = typeof toward === 'number' ? toward : headingTo(stand, toward)
    if (ask.perspective === 'one-point') {
      toward = squareHeading(room.polygon, heading)
      perspective = ' One-point perspective: looking square on the wall it faces, level, so upright lines stay upright.'
    } else {
      const turned = twoPointHeading(room.polygon, heading)
      if (turned.turned !== 0) toward = turned.heading
      perspective = ` Two-point perspective: looking level across the room, ${Math.abs(offSquare(room.polygon, turned.heading)).toFixed(0)}° off square to its walls, so they run away to both sides and upright lines stay upright${turned.turned === 0 ? '' : `; turned ${Math.abs(turned.turned).toFixed(0)}° to the ${turned.turned > 0 ? 'right' : 'left'} of straight at it`}.`
    }
  }

  const lens = ask.lens ?? EYE_FOCAL_LENGTH
  const tilt = ask.tilt ?? 0
  const camera = eyeCamera(plan, { room: id, polygon: room.polygon, stand, height: ask.height, toward, lens, tilt })
  const wide = (2 * Math.atan(CAMERA_SENSOR.width / 2 / lens)) / DEG
  const heading = typeof toward === 'number' ? toward : headingTo(stand, toward)
  const how = tilt === 0 ? 'looking level' : `looking ${Math.abs(tilt).toFixed(0)}° ${tilt > 0 ? 'down' : 'up'}`
  const sentence = `Standing in ${q(name)}${stood} at (${m(camera.position[0])}, ${m(camera.position[1])})${moved}, eye ${m(ask.height)} m above the room's own floor, ${how} toward ${looking} (heading ${heading.toFixed(0)}° from the top of the drawing), lens ${Number(lens.toFixed(2))} mm, ${wide.toFixed(0)}° across.${perspective}`
  return { camera, sentence }
}

/** An opening's middle, along a curved wall's curve too (CNT-18). */
function openingPoint(plan: FloorPlan, survey: Survey, target: string): Vec2 {
  const facts = survey.facts.openings.get(target)
  if (!facts) throw new ToolRefusal('That opening can\'t be drawn; grid_check says why.')
  const wall = plan.walls.find((w) => w.id === facts.wall)!
  return wallPointAt(wall, facts.offset + facts.width / 2)
}

function openingWords(survey: Survey, target: string): string {
  const facts = survey.facts.openings.get(target)
  return `${facts?.type ?? 'opening'} ${q(target)}`
}

function doorsOf(room: SurveyRoom): string {
  return room.openings.filter((o) => o.type !== 'window').map((o) => q(o.id)).join(', ')
}

/** VEW-78: whether the plan's door of this id is of a glazed type. */
function glazedDoor(plan: FloorPlan, id: string): boolean {
  const stated = plan.openings.find((o) => o.id === id)
  return stated !== undefined && openingGlazed(plan, stated)
}
