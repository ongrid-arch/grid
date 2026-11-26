/**
 * WRT-72: a door, window or doorless opening added to a plan that already has its walls: "put a
 * door in the bathroom's north wall", "a window in the kitchen, 0.6 from the east side", "a door
 * between the hall and the living room". It goes in one side of a room, or in the wall two rooms
 * share, placed the way rooms text places an opening (centred, or a distance from a side) and
 * refused the way `changeOpening` refuses one: no wall there, a dividing line, a curved wall, no
 * free stretch of the width. Nothing is rewritten: the patch only adds the one opening.
 */
import { dot, doorKindOf, handingFromRooms, kindFits, kindWords, sub, swingNeeds, tolerance, wallAxis, wallLength, type HandSide, type Opening, type Wall } from '@ongrid/floorplan/geometry'
import { DOOR_KINDS, WINDOW_KINDS, type OpeningKind } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import { surveyPlan, type Survey } from '../quantities/survey'
import { emptyPatch, freeStretches, refuseCurved, wallOnSide, type Direction, type Patch } from './edits'
import { idHolder } from './holder'
import { freshId, usedIds } from './merge'
import { EditRefused } from './refused'
import { COMPASS, r3, roomFaceAlong } from './seat'

/** The size a new opening has when the request gives none: rooms text's own defaults. */
const DEFAULTS = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
  opening: { width: 0.9, height: 2.1, sill: 0 },
} as const

export interface AddOpeningRequest {
  readonly type: Opening['type']
  /** The room whose side it goes in; with `between`, the first of the two rooms. */
  readonly room: string
  readonly side?: Direction
  /** A second room: the opening goes in the wall the two rooms share. */
  readonly between?: string
  /** A side of `room` its place is measured from, with `distance`. */
  readonly from?: Direction
  readonly distance?: number
  readonly width?: number
  readonly height?: number
  readonly sill?: number
  readonly kind?: OpeningKind
  /** A door: the room id it opens into, or "outside". */
  readonly opensInto?: string
  readonly hinged?: HandSide
  readonly seenFrom?: string
  readonly id?: string
}

const sideName = (side: unknown): string | null => (typeof side === 'object' && side !== null && 'room' in side ? (side as { room: string }).room : side === 'outside' ? 'outside' : null)

/** The stretch of a wall, from its start, a room's sides on it cover. */
function coveredBy(survey: Survey, roomId: string, wall: Wall): [number, number] | null {
  const axis = wallAxis(wall)
  const along = survey.byId.get(roomId)!.edges.filter((edge) => edge.wall?.id === wall.id).flatMap((edge) => [dot(sub(edge.from, axis.start), axis.dir), dot(sub(edge.to, axis.start), axis.dir)])
  return along.length === 0 ? null : [Math.min(...along), Math.max(...along)]
}

/** The one wall two rooms share and the stretch of it they share. */
function sharedWall(survey: Survey, a: string, b: string): { wall: Wall; lo: number; hi: number } {
  const name = (id: string): string => quoted(survey.byId.get(id)!.facts.name)
  const wallsOf = (id: string): Wall[] => [...new Set(survey.byId.get(id)!.edges.flatMap((edge) => (edge.wall === null ? [] : [edge.wall])))]
  const inB = new Set(wallsOf(b).map((wall) => wall.id))
  const shared = wallsOf(a).filter((wall) => inB.has(wall.id)).flatMap((wall) => {
    const one = coveredBy(survey, a, wall)
    const two = coveredBy(survey, b, wall)
    if (one === null || two === null) return []
    const lo = Math.max(one[0], two[0])
    const hi = Math.min(one[1], two[1])
    return hi - lo > tolerance('noLength') ? [{ wall, lo, hi }] : []
  })
  if (shared.length === 0) throw new EditRefused(`${name(a)} and ${name(b)} share no wall: a door or window between them has nowhere to go. Name one room and a side to put it in the outside wall.`)
  if (shared.length > 1) throw new EditRefused(`${name(a)} and ${name(b)} share ${shared.length} walls (${shared.map((one) => quoted(one.wall.id)).join(', ')}); name the room and the side the opening goes in.`)
  const only = shared[0]!
  if (only.wall.virtual === true) throw new EditRefused(`${name(a)} and ${name(b)} are divided by a line, not a wall: it takes no door or window.`)
  refuseCurved([only.wall], 'placeOpening')
  return only
}

export function addOpening(survey: Survey, request: AddOpeningRequest): Patch {
  const plan = survey.plan
  const { type } = request
  if (request.between !== undefined && request.side !== undefined) throw new EditRefused('Give side (a side of the room) or between (the other room), not both.')
  if (request.between === undefined && request.side === undefined) throw new EditRefused('Say where it goes: side, a side of the room, or between, the other room of the wall it is in.')
  if (request.between === request.room) throw new EditRefused('between names the other room: it is the same room as room.')
  if (request.distance !== undefined && request.from === undefined) throw new EditRefused('distance is measured from something: pass from as well, a side of the room.')
  if (request.from !== undefined && request.distance === undefined) throw new EditRefused('from needs distance: metres from that side of the room to the opening\'s nearer edge. Leave both out to centre it.')
  if (type !== 'door' && (request.opensInto !== undefined || request.hinged !== undefined)) {
    throw new EditRefused(`Only a door opens into a room or hangs from a side; this would be ${type === 'opening' ? 'an' : 'a'} ${type}.`)
  }
  if (request.seenFrom !== undefined && request.hinged === undefined) throw new EditRefused('seen_from says where hinged is seen from: pass hinged as well.')
  if (request.kind !== undefined && !kindFits(type, request.kind)) {
    throw new EditRefused(`A ${type === 'opening' ? 'doorless opening has no kind' : `${type} cannot be ${request.kind}: a ${type} is ${(type === 'door' ? DOOR_KINDS : WINDOW_KINDS).join(', ')}`}.`)
  }

  const target = request.between !== undefined ? sharedWall(survey, request.room, request.between) : wallOnSide(survey, request.room, request.side!)
  const wall = target.wall
  const roomName = quoted(survey.byId.get(request.room)!.facts.name)
  const where = request.between !== undefined ? `between ${roomName} and ${quoted(survey.byId.get(request.between)!.facts.name)}` : `in the ${request.side} side of ${roomName}`
  const size = DEFAULTS[type]
  const width = request.width ?? size.width
  const height = request.height ?? Math.min(size.height, wall.height)
  const sill = request.sill ?? size.sill
  if (sill + height > wall.height + tolerance('noLength')) throw new EditRefused(`A sill of ${sill.toFixed(2)} m and a height of ${height.toFixed(2)} m reach above the ${wall.height.toFixed(2)} m wall.`)
  const length = wallLength(wall)
  const axis = wallAxis(wall)

  const guessed: string[] = []
  let offset: number
  let placed: string
  let anchor: { from: Direction; room: string } | undefined
  if (request.from !== undefined) {
    const from = request.from
    if (Math.abs(dot(axis.dir, COMPASS[from])) < 0.3) {
      const runs = Math.abs(axis.dir.x) > Math.abs(axis.dir.y) ? 'east-west' : 'north-south'
      throw new EditRefused(`Wall ${quoted(wall.id)} runs ${runs}, so a place along it is measured from ${runs === 'east-west' ? 'east or west' : 'north or south'}, not from ${from}.`)
    }
    const face = roomFaceAlong(survey, request.room, wall, from, (target.lo + target.hi) / 2)
    if (face === null) throw new EditRefused(`Room ${roomName} has no side along wall ${quoted(wall.id)} to measure from.`)
    const distance = request.distance!
    offset = dot(axis.dir, COMPASS[from]) > 0 ? face - distance - width : face + distance
    anchor = { from, room: request.room }
    placed = `${distance.toFixed(2)} m from the ${from} side of ${roomName}`
  } else {
    offset = (target.lo + target.hi) / 2 - width / 2
    placed = `centred ${where}`
    guessed.push(`The ${type} is centred ${where}: pass from and distance to place it.`)
  }

  // A wall that is shared must hold it on the stretch both rooms have.
  const joint = tolerance('joint')
  if (request.between !== undefined && (offset < target.lo - joint || offset + width > target.hi + joint)) {
    throw new EditRefused(`A ${type} ${width.toFixed(2)} m wide, ${placed}, would run from ${offset.toFixed(2)} to ${(offset + width).toFixed(2)} m along wall ${quoted(wall.id)}, but the two rooms share only ${target.lo.toFixed(2)} to ${target.hi.toFixed(2)} m of it.`)
  }
  const free = freeStretches(plan, wall, '')
  if (!free.some(([lo, hi]) => offset >= lo - joint && offset + width <= hi + joint)) {
    const fitting = free.filter(([lo, hi]) => hi - lo >= width - joint)
    const stretches = free.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m (${(hi - lo).toFixed(2)} m)`).join(', ')
    const hint = fitting.length > 0 ? `A stretch that takes ${width.toFixed(2)} m: ${fitting.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m`).join(', ')}; place it there with from and distance, or remove what is in the way first.` : `No stretch of this wall takes ${width.toFixed(2)} m; remove an opening in the way first, or make it narrower.`
    throw new EditRefused(`A ${type} ${width.toFixed(2)} m wide, ${placed}, would run from ${offset.toFixed(2)} to ${(offset + width).toFixed(2)} m along its ${length.toFixed(2)} m wall ${quoted(wall.id)}. Free stretches, from the wall's start: ${stretches || 'none'}. ${hint}`)
  }

  const used = usedIds(survey)
  if (request.id !== undefined && used.has(request.id)) throw new EditRefused(`The id ${quoted(request.id)} is already taken by ${idHolder(plan, request.id)}: pick another, or leave id out.`)
  const id = request.id ?? freshId(used, `${type}-${request.room}-${request.between ?? request.side}`)
  const record: Record<string, unknown> = { id, wall: wall.id, type, offset: r3(offset), width: r3(width), sill: r3(sill), height: r3(height) }
  if (request.kind !== undefined) record['kind'] = request.kind
  if (anchor !== undefined) record['anchor'] = anchor
  const label = `${type} ${quoted(id)}`
  const said = [`New ${label}, ${width.toFixed(2)} m wide, ${placed} on wall ${quoted(wall.id)}${request.from !== undefined ? ` (${where})` : ''}.`]
  if (request.kind !== undefined) said.push(`${label} is a ${kindWords(type === 'door' ? 'door' : 'window', request.kind)}.`)

  if (type === 'door') {
    const trial = (extra: Record<string, unknown>) => ({ ...plan, openings: [...plan.openings, { ...record, ...extra } as unknown as Opening] })
    if (request.opensInto !== undefined) {
      const sides = surveyPlan(trial({})).facts.openings.get(id)?.sides.map(sideName) ?? []
      const at = sides.indexOf(request.opensInto)
      if (at < 0) {
        const names = sides.map((one) => (one === null ? 'nothing drawn' : one === 'outside' ? '"outside"' : quoted(one)))
        throw new EditRefused(`That door would be between ${names.join(' and ')}: it can open into one of those only.`)
      }
      record['swing'] = at === 0 ? 'left' : 'right'
      if (swingNeeds(doorKindOf(request.kind ?? null)).hinge) record['hinge'] = 'start'
      said.push(`${label} opens into ${request.opensInto === 'outside' ? 'the outside' : quoted(survey.facts.rooms.get(request.opensInto)?.name ?? request.opensInto)}.`)
    }
    if (request.hinged !== undefined) {
      if (record['swing'] === undefined) throw new EditRefused('hinged is the hand as seen from a room: pass opens_into as well, so the door has a side to swing to.')
      const handing = handingFromRooms(trial({}) as never, record as unknown as Opening, { hinged: request.hinged, ...(request.seenFrom !== undefined ? { seenFrom: request.seenFrom } : request.opensInto !== undefined ? { seenFrom: request.opensInto } : {}) })
      if ('refused' in handing) throw new EditRefused(handing.refused)
      if (handing.hinge !== undefined) record['hinge'] = handing.hinge
      said.push(`${label} is hinged on the ${request.hinged} as seen from ${request.seenFrom === undefined ? 'the room it opens into' : request.seenFrom === 'outside' ? 'the outside' : quoted(survey.facts.rooms.get(request.seenFrom)?.name ?? request.seenFrom)}.`)
    }
    if (record['swing'] === undefined && (request.kind === undefined || swingNeeds(doorKindOf(request.kind)).hinge)) {
      guessed.push(`${label} has no swing drawn yet: grid_change_opening with opens_into and hinged hangs it, or a kind such as sliding or folding if it is not one swinging leaf.`)
    }
  }
  return { ...emptyPatch(said), guessed, addOpenings: [record] }
}
