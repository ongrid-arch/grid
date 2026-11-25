/**
 * A new room built against the outside of one side of a room (WRT-3, lab WR-2, Y-11): "a 3 by
 * 4 m extension at the back, with an opening into the living room and a door to the garden".
 *
 * The side's wall is cut where the new room's side walls meet it: the stretch between now has a
 * room on both faces and becomes an inside wall (MSG-13), the rest stays as it was. The new
 * room's three walls take the thickness and height of the wall it is built against. What is in
 * the covered stretch is the call's to say (`inTheWay`): removed, or kept as an opening between
 * the two rooms; left unsaid, the call is refused naming it, and nothing is written.
 *
 * Pure: a survey in, a patch out.
 */
import { add, dot, scale, signedArea, sub, tolerance, wallAxis, type Vec2 } from '@ongrid/floorplan/geometry'
import { english, name as idName, said as sentence } from '@ongrid/floorplan/messages'
import { heightStated } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { refuseCurved, type Direction, type OpeningChange, type Patch, type RoomChange } from './edits'
import { cutWall, freshId, piecesBeside, spanOn, usedIds } from './merge'
import { idHolder } from './holder'
import { EditRefused } from './refused'
import { COMPASS, r3, roomFaceAlong } from './seat'
import { facing } from './split'

export const SIZE_BASES = ['inside', 'centre'] as const
export const IN_THE_WAY = ['remove', 'keep'] as const

export interface AddRoomRequest {
  readonly id: string
  readonly name: string
  readonly use?: string
  /** The room it is built against, and which side of it. */
  readonly against: string
  readonly side: Direction
  /** Along the side, and out from it, in metres. */
  readonly width: number
  readonly depth: number
  readonly size?: (typeof SIZE_BASES)[number]
  /** Its place along the side: metres from that side of the room it is built against to its own inside face. Centred when left out. */
  readonly from?: Direction
  readonly distance?: number
  readonly inTheWay?: (typeof IN_THE_WAY)[number]
  /** A doorless opening between the two rooms, and a door in its far side: widths, 0 or left out for none. */
  readonly openingWidth?: number
  readonly doorWidth?: number
}

export function addRoom(survey: Survey, request: AddRoomRequest): Patch {
  const plan = survey.plan
  const used = usedIds(survey)
  if (used.has(request.id)) throw new EditRefused(english(sentence('edit.idTaken.newRoom', { id: idName(request.id), holder: idHolder(plan, request.id) })))
  const host = survey.byId.get(request.against)!
  const hostName = quoted(host.facts.name)
  const out = COMPASS[request.side]
  const edges = host.edges.filter((edge) => edge.wall !== null && facing(edge) === request.side)
  if (edges.length === 0) throw new EditRefused(`${hostName} has no wall on its ${request.side} side.`)
  const hostWalls = [...new Set(edges.map((edge) => edge.wall!))]
  if (hostWalls.length > 1) throw new EditRefused(`The ${request.side} side of ${hostName} is ${hostWalls.length} walls (${hostWalls.map((w) => quoted(w.id)).join(', ')}); this tool builds against one wall.`)
  const wall = hostWalls[0]!
  if (wall.virtual === true) throw new EditRefused(`The ${request.side} side of ${hostName} is a dividing line, not a wall.`)
  refuseCurved([wall], 'addRoom')
  const axis = wallAxis(wall)
  const span = spanOn(host, wall)!
  const tw = wall.thickness
  const t = wall.thickness
  const basis = request.size ?? 'inside'
  const wIn = basis === 'centre' ? request.width - t : request.width
  const dIn = basis === 'centre' ? request.depth - tw / 2 - t / 2 : request.depth
  if (wIn < 0.5 || dIn < 0.5) throw new EditRefused(`A room ${request.width.toFixed(2)} by ${request.depth.toFixed(2)} m on ${basis === 'centre' ? 'centre lines' : 'inside faces'} is ${wIn.toFixed(2)} by ${dIn.toFixed(2)} m inside with ${t.toFixed(2)} m walls; each side needs at least 0.50 m.`)

  // Its inside along the wall, in metres from the wall's start.
  let low: number
  if (request.from !== undefined) {
    if (Math.abs(dot(axis.dir, COMPASS[request.from])) < 0.3) throw new EditRefused(`The ${request.side} side of ${hostName} runs ${Math.abs(axis.dir.x) > 0.5 ? 'east-west' : 'north-south'}: place the new room from the ${Math.abs(axis.dir.x) > 0.5 ? 'east or west' : 'north or south'}.`)
    const face = roomFaceAlong(survey, request.against, wall, request.from, (span.lo + span.hi) / 2)!
    const high = dot(axis.dir, COMPASS[request.from]) > 0
    const d = request.distance ?? 0
    low = high ? face - d - wIn : face + d
  } else {
    low = (span.lo + span.hi) / 2 - wIn / 2
  }
  const high = low + wIn
  const sLow = low - t / 2
  const sHigh = high + t / 2
  if (sLow < -0.02 || sHigh > axis.length + 0.02) throw new EditRefused(`The new room would reach past the end of wall ${quoted(wall.id)}, which runs ${axis.length.toFixed(2)} m; Grid builds a room along one wall. Make it narrower or move it along.`)
  // Nothing may stand on the other face of the stretch it covers.
  for (const other of survey.rooms) {
    if (other.facts.id === request.against) continue
    const s = spanOn(other, wall)
    if (s && s.sign !== span.sign && Math.min(s.hi, high) - Math.max(s.lo, low) > 0.02) throw new EditRefused(`${quoted(other.facts.name)} is already on the other side of that wall there; a new room can only go where it faces outside.`)
  }

  // Cut the wall where the new side walls meet it: what lies between has a room on both faces now.
  const letters = 'abc'
  const kept = [
    ...(sLow > 0.05 ? [{ lo: 0, hi: sLow, part: 'before' }] : []),
    { lo: Math.max(0, sLow), hi: Math.min(axis.length, sHigh), part: 'covered' },
    ...(axis.length - sHigh > 0.05 ? [{ lo: sHigh, hi: axis.length, part: 'after' }] : []),
  ]
  const pieces = kept.map((p, i) => {
    const id = freshId(used, `${wall.id}-${letters[i]}`)
    used.add(id)
    return { ...p, id }
  })
  const covered = pieces.find((p) => p.part === 'covered')!
  const cut = cutWall(wall, pieces)
  const addWalls: Record<string, unknown>[] = cut.add.map((w) => (w['id'] === covered.id ? { ...w, kind: 'interior' } : w))

  // The new room's corners, counter-clockwise, and its three walls.
  const point = (s: number, n: number): Vec2 => add(add(axis.start, scale(axis.dir, s)), scale(out, n))
  const far = tw / 2 + dIn + t / 2
  let corners = [point(sLow, 0), point(sLow, far), point(sHigh, far), point(sHigh, 0)]
  if (signedArea(corners) < 0) corners = [...corners].reverse()
  const pair = (p: Vec2): [number, number] => [r3(p.x), r3(p.y)]
  const newWalls: Record<string, unknown>[] = []
  const boundary: string[] = []
  for (let i = 0; i < 3; i++) {
    const a = corners[i]!
    const b = corners[i + 1]!
    const d = sub(b, a)
    const len = Math.hypot(d.x, d.y)
    const side = facing({ from: a, to: b, length: len }) ?? 'side'
    const id = freshId(used, `${request.id}-${side}`)
    used.add(id)
    newWalls.push({ id, start: pair(a), end: pair(b), thickness: t, ...(heightStated(wall) ? { height: wall.height } : {}), kind: 'exterior', ...(wall.floor !== undefined ? { floor: wall.floor } : {}) })
    boundary.push(id)
  }
  boundary.push(covered.id)
  // The middle of the three runs between the two far corners, whichever way round they go.
  const farWall = newWalls[1]!

  // Every room that named the wall names the pieces beside it.
  const rooms = new Map<string, RoomChange>()
  for (const room of survey.rooms) {
    const listed = plan.rooms.find((r) => r.id === room.facts.id)!.boundary
    if (!listed.includes(wall.id)) continue
    const k = listed.indexOf(wall.id)
    rooms.set(room.facts.id, { boundary: [...listed.slice(0, k), ...piecesBeside(room, wall, pieces), ...listed.slice(k + 1)] })
  }

  // The openings in the wall: re-based on their piece; in the covered stretch, as the call says.
  const said: string[] = []
  const guessed: string[] = []
  const notKept: string[] = []
  const openings = new Map<string, OpeningChange>()
  const removeOpenings = new Set<string>()
  const inWay = plan.openings.filter((o) => o.wall === wall.id && o.offset + o.width > sLow - t / 2 + tolerance('joint') && o.offset < sHigh + t / 2 - tolerance('joint'))
  if (inWay.length > 0 && request.inTheWay === undefined) {
    throw new EditRefused(`${inWay.map((o) => `${o.type} ${quoted(o.id)}`).join(', ')} ${inWay.length === 1 ? 'is' : 'are'} in the stretch of wall the new room covers: pass in_the_way remove to take ${inWay.length === 1 ? 'it' : 'them'} out, or keep to keep ${inWay.length === 1 ? 'it' : 'them'} between the two rooms.`)
  }
  for (const o of plan.openings) {
    if (o.wall !== wall.id) continue
    if (inWay.includes(o)) {
      const within = o.offset >= low - tolerance('joint') && o.offset + o.width <= high + tolerance('joint')
      if (request.inTheWay === 'keep' && !within) throw new EditRefused(`${o.type} ${quoted(o.id)} would meet a wall of the new room, so it can't be kept: pass in_the_way remove, or move it first.`)
      if (request.inTheWay === 'keep') {
        openings.set(o.id, { wall: covered.id, offset: r3(o.offset - covered.lo) })
        said.push(`${o.type} ${quoted(o.id)} is kept, now between ${hostName} and ${quoted(request.name)}.`)
      } else {
        removeOpenings.add(o.id)
        said.push(`Removed ${o.type} ${quoted(o.id)}: it was in the wall the new room covers.`)
      }
      continue
    }
    const home = pieces.find((p) => p.lo - tolerance('joint') <= o.offset && o.offset + o.width <= p.hi + tolerance('joint'))!
    if (home.id !== wall.id || home.lo > 0) openings.set(o.id, { wall: home.id, offset: r3(o.offset - home.lo) })
  }

  const addOpenings: Record<string, unknown>[] = []
  const openingWidth = request.openingWidth ?? 0
  if (openingWidth > 0) {
    if (openingWidth > wIn + tolerance('joint')) throw new EditRefused(`An opening ${openingWidth.toFixed(2)} m wide does not fit the new room's ${wIn.toFixed(2)} m inside.`)
    const offset = r3((low + high) / 2 - openingWidth / 2 - covered.lo)
    const clash = request.inTheWay === 'keep' && inWay.some((o) => o.offset - covered.lo < offset + openingWidth && offset < o.offset - covered.lo + o.width)
    if (clash) throw new EditRefused(`The opening between the rooms would overlap what is kept there: pass in_the_way remove, or a narrower opening_width.`)
    const id = freshId(used, `pass-${request.id}`)
    used.add(id)
    addOpenings.push({ id, wall: covered.id, type: 'opening', offset, width: openingWidth, sill: 0, height: Math.min(2.1, wall.height) })
    said.push(`New opening ${quoted(id)}, ${openingWidth.toFixed(2)} m wide, centred between ${hostName} and ${quoted(request.name)}.`)
  }
  const doorWidth = request.doorWidth ?? 0
  if (doorWidth > 0) {
    if (doorWidth > wIn + tolerance('joint')) throw new EditRefused(`A door ${doorWidth.toFixed(2)} m wide does not fit the new room's ${wIn.toFixed(2)} m inside.`)
    const id = freshId(used, `door-${request.id}`)
    used.add(id)
    const s = farWall['start'] as [number, number]
    const e = farWall['end'] as [number, number]
    const len = Math.hypot(e[0] - s[0], e[1] - s[1])
    addOpenings.push({ id, wall: farWall['id'], type: 'door', offset: r3(len / 2 - doorWidth / 2), width: doorWidth, sill: 0, height: Math.min(2.1, wall.height) })
    const farSide = facing({ from: { x: s[0], y: s[1] }, to: { x: e[0], y: e[1] }, length: len })
    said.push(`New door ${quoted(id)}, ${doorWidth.toFixed(2)} m wide, centred in the ${farSide ?? 'far'} side of ${quoted(request.name)}, to the outside.`)
    guessed.push(`Door ${quoted(id)} has no swing drawn yet: grid_change_opening with opens_into and hinged hangs it, or kind sliding, folding or another if it is not one swinging leaf.`)
  }

  const where = request.from !== undefined ? `${(request.distance ?? 0).toFixed(2)} m from the ${request.from} side of ${hostName}` : `centred on ${hostName}`
  if (request.from === undefined) guessed.push(`${quoted(request.name)} is centred on the ${request.side} side of ${hostName}: pass from and distance to place it.`)
  said.unshift(
    `New room ${quoted(request.name)}, ${wIn.toFixed(2)} by ${dIn.toFixed(2)} m inside, against the ${request.side} side of ${hostName}, ${where}; its walls ${newWalls.map((w) => quoted(w['id'] as string)).join(', ')} are ${t.toFixed(2)} m thick, as wall ${quoted(wall.id)}.`,
    `Wall ${quoted(wall.id)} is cut in ${pieces.length}: ${quoted(covered.id)}, between the two rooms, is an inside wall now.`,
  )
  const addRooms = [{ id: request.id, name: request.name, ...(request.use !== undefined ? { use: request.use } : {}), boundary, ...(wall.floor !== undefined ? { floor: wall.floor } : {}) }]
  return {
    walls: cut.change ? new Map([[wall.id, cut.change]]) : new Map(),
    openings,
    removeOpenings,
    rooms,
    said,
    guessed,
    notKept,
    removeWalls: cut.remove ? new Set([wall.id]) : new Set(),
    addWalls: [...addWalls, ...newWalls],
    addRooms,
    addOpenings,
  }
}
