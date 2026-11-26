/**
 * One room split in two by a new wall (WRT-3, lab WR-2): "bedroom 2 into a study and a second
 * bathroom". The new room takes the named side of the room, the size asked for measured inside
 * from that side's face; the room keeps its id and the rest. A door goes in the new wall unless
 * the call says none. The new room keeps the room's facts of the person's own (CNT-9); the room
 * keeps its stated number, and the new room has none. The new room has the use of the room it came
 * from unless the call names another (WRT-49).
 *
 * The way of doing it comes from the lab's edit prototype (`split-room`): rectangles square to
 * the drawing only; the new wall runs between the centre lines of the two walls it meets, and
 * each part lists its walls counter-clockwise from the south (C3).
 *
 * Pure: a survey in, a patch out.
 */
import { indexPlan, sub, tolerance, wallAxis, wallEndInOpening, withPatterns, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { english, name as idName, said as sentence } from '@ongrid/floorplan/messages'
import { heightStated } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import { surveyPlan, type Survey } from '../quantities/survey'
import { refuseCurved, type Direction, type Patch, type RoomChange } from './edits'
import { planAfter, roomNets } from './after'
import { freshId, usedIds } from './merge'
import { idHolder } from './holder'
import { EditRefused } from './refused'
import { r3 } from './seat'

export const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' }
const ORDER: readonly Direction[] = ['south', 'east', 'north', 'west']

/** Which way a side of an outline faces, from inside the room; null at an angle. */
export function facing(edge: { from: Vec2; to: Vec2; length: number }): Direction | null {
  const d = sub(edge.to, edge.from)
  const n = { x: d.y / edge.length, y: -d.x / edge.length }
  if (n.y > 0.99) return 'north'
  if (n.y < -0.99) return 'south'
  if (n.x > 0.99) return 'east'
  if (n.x < -0.99) return 'west'
  return null
}

/** A rectangle's inside box and the walls on each of its sides, in the order its outline meets them. */
export function rectangleSides(survey: Survey, roomId: string): { box: { x0: number; y0: number; x1: number; y1: number }; sides: Record<Direction, Wall[]> } {
  const room = survey.byId.get(roomId)!
  const name = quoted(room.facts.name)
  if (room.facts.shape?.rectangle !== true || room.holes.length > 0) throw new EditRefused(`${name} is not a plain rectangle square to the drawing; this tool splits rectangles only. Write the plan again with grid_write_rooms.`)
  const xs = room.polygon.map((p) => p.x)
  const ys = room.polygon.map((p) => p.y)
  const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  const sides: Record<Direction, Wall[]> = { north: [], east: [], south: [], west: [] }
  for (const edge of room.edges) {
    const side = facing(edge)
    if (side === null) throw new EditRefused(`${name} has a side at an angle; this tool handles right angles only.`)
    if (edge.wall === null) throw new EditRefused(`The ${side} side of ${name} lies on none of its walls; grid_check says why.`)
    if (!sides[side].includes(edge.wall)) sides[side].push(edge.wall)
  }
  return { box, sides }
}

export interface SplitRequest {
  readonly side: Direction
  /** The new room's inside size across from that side, in metres. */
  readonly size: number
  readonly newRoom: { readonly id: string; readonly name: string; readonly use?: string }
  /** The room's own new name and use, if they change. */
  readonly name?: string
  readonly use?: string
  readonly thickness?: number
  readonly wallId?: string
  /** 0 for no door. */
  readonly doorWidth?: number
  readonly doorFrom?: Direction
  readonly doorDistance?: number
}

export function splitRoom(survey: Survey, roomId: string, request: SplitRequest): Patch {
  const plan = survey.plan
  const room = plan.rooms.find((r) => r.id === roomId)!
  refuseCurved(room.boundary.map((id) => plan.walls.find((w) => w.id === id)), 'splitRoom')
  const name = quoted(survey.byId.get(roomId)!.facts.name)
  const used = usedIds(survey)
  if (used.has(request.newRoom.id)) throw new EditRefused(english(sentence('edit.idTaken.newRoom', { id: idName(request.newRoom.id), holder: idHolder(plan, request.newRoom.id) })))
  if (request.wallId !== undefined && used.has(request.wallId)) throw new EditRefused(english(sentence('edit.idTaken.newWall', { id: idName(request.wallId), holder: idHolder(plan, request.wallId) })))
  const { box, sides } = rectangleSides(survey, roomId)
  const { side, size } = request
  const t = request.thickness ?? 0.1
  const across = side === 'east' || side === 'west' // the new wall runs north-south
  const span = across ? box.x1 - box.x0 : box.y1 - box.y0
  if (size <= 0.3 || size + t >= span - 0.3) {
    throw new EditRefused(`${name} is ${span.toFixed(2)} m inside from ${across ? 'west to east' : 'south to north'}; a new room ${size.toFixed(2)} m across from its ${side} side and a ${t.toFixed(2)} m wall leave ${(span - size - t).toFixed(2)} m for the rest. Each part needs more than 0.30 m.`)
  }
  const c = side === 'east' ? box.x1 - size - t / 2 : side === 'west' ? box.x0 + size + t / 2 : side === 'north' ? box.y1 - size - t / 2 : box.y0 + size + t / 2
  const [lo, hi]: [Direction, Direction] = across ? ['south', 'north'] : ['west', 'east']
  const index = indexPlan(plan)
  /** Where the new wall's line meets the centre line of the wall on that side. */
  const meet = (on: Direction): { wall: Wall; at: [number, number] } => {
    for (const wall of sides[on]) {
      const axis = wallAxis(wall)
      const k = across ? axis.dir.x : axis.dir.y
      if (Math.abs(k) < tolerance('parallel')) continue
      const s = ((across ? c - axis.start.x : c - axis.start.y) / k)
      if (s < -0.02 || s > axis.length + 0.02) continue
      const p = { x: axis.start.x + axis.dir.x * s, y: axis.start.y + axis.dir.y * s }
      // MSG-16: the new wall must not land in a door or window of the wall it meets.
      const landing = wallEndInOpening(index, wall.id, s, t)
      if (landing) {
        const kind = landing.opening.type === 'opening' ? 'opening' : landing.opening.type
        const where = `The new wall would end inside ${kind} ${quoted(landing.opening.id)} of wall ${quoted(wall.id)}, on the ${on} side of ${name}.`
        if (landing.nearest === null) throw new EditRefused(`${where} No place along that wall is clear of its openings.`)
        const at = (across ? axis.start.x : axis.start.y) + k * landing.nearest
        const clear = side === 'east' ? box.x1 - at - t / 2 : side === 'west' ? at - box.x0 - t / 2 : side === 'north' ? box.y1 - at - t / 2 : at - box.y0 - t / 2
        throw new EditRefused(`${where} The nearest size clear of it is ${clear.toFixed(2)} m across from the ${side} side; or move the ${kind} first.`)
      }
      return { wall, at: [r3(p.x), r3(p.y)] }
    }
    throw new EditRefused(`No wall of ${name} lies where the new wall would end on its ${on} side.`)
  }
  const from = meet(lo)
  const to = meet(hi)
  const sample = sides[side][0] ?? from.wall
  const wallId = request.wallId ?? freshId(used, `${request.newRoom.id}-${OPPOSITE[side]}`)
  used.add(wallId)
  // WRT-6: as high as the stated walls round it; with none stated, it states none either, and
  // takes its floor's height or Grid's default as they do.
  const stated = [...sides.north, ...sides.east, ...sides.south, ...sides.west, sample].filter((w) => w.virtual !== true && heightStated(w))
  const height = stated.length === 0 ? null : Math.max(...stated.map((w) => w.height))
  const newWall: Record<string, unknown> = { id: wallId, start: from.at, end: to.at, thickness: t, ...(height === null ? {} : { height }), kind: 'interior', ...(room.floor !== undefined ? { floor: room.floor } : {}) }

  // Each part's walls, counter-clockwise from the south: the side it gives up is the new wall.
  const part = (far: Direction, keepLow: boolean): string[] => {
    const list: string[] = []
    for (const s of ORDER) {
      if (s === far) {
        list.push(wallId)
        continue
      }
      for (const wall of sides[s]) {
        if (s === lo || s === hi) {
          const axis = wallAxis(wall)
          const a = across ? [axis.start.x, axis.end.x] : [axis.start.y, axis.end.y]
          const mine = keepLow ? [across ? box.x0 : box.y0, c] : [c, across ? box.x1 : box.y1]
          if (Math.min(Math.max(...a), mine[1]!) - Math.max(Math.min(...a), mine[0]!) < 0.02) continue
        }
        list.push(wall.id)
      }
    }
    return list
  }
  const lowSide = side === 'west' || side === 'south'
  const rest = part(side, !lowSide)
  const taken = part(OPPOSITE[side], lowSide)

  const said: string[] = []
  const guessed: string[] = []
  const notKept: string[] = []
  const rooms = new Map<string, RoomChange>()
  const change: RoomChange = { boundary: rest }
  if (request.name !== undefined) change.name = request.name
  if (request.use !== undefined) change.use = request.use
  rooms.set(roomId, change)
  // WRT-49: with no use named, the new room has the use the room had before the split.
  const newUse = request.newRoom.use ?? room.use
  if (request.newRoom.use === undefined && room.use !== undefined) guessed.push(`${quoted(request.newRoom.name)} takes the use of ${name} (${quoted(room.use)}): pass new_use to give it another.`)
  const addRooms: Record<string, unknown>[] = [{
    id: request.newRoom.id,
    name: request.newRoom.name,
    ...(newUse !== undefined ? { use: newUse } : {}),
    boundary: taken,
    ...(room.floor !== undefined ? { floor: room.floor } : {}),
    // WRT-30 (C26): both parts are the same outdoor space, open or roofed as the room says.
    ...(room.outdoor !== undefined ? { outdoor: room.outdoor } : {}),
    ...(room.outdoor !== undefined && room.roofed !== undefined ? { roofed: room.roofed } : {}),
    // CNT-9: both parts keep the room's facts of the person's own; its number stays with the room.
    ...(room.properties !== undefined && Object.keys(room.properties).length > 0 ? { properties: { ...room.properties } } : {}),
  }]
  if (room.properties !== undefined && Object.keys(room.properties).length > 0) {
    guessed.push(`${quoted(request.newRoom.name)} keeps the facts of ${name} (${Object.keys(room.properties).map(quoted).join(', ')}): change them in the plan file where they differ.`)
  }
  if (room.number !== undefined) guessed.push(`${name} keeps its room number ${quoted(room.number)}; ${quoted(request.newRoom.name)} has none.`)
  const length = Math.hypot(to.at[0] - from.at[0], to.at[1] - from.at[1])
  said.push(`New wall ${quoted(wallId)}, ${t.toFixed(2)} m thick and ${length.toFixed(2)} m long, ${size.toFixed(2)} m inside from the ${side} side of ${name}, from wall ${quoted(from.wall.id)} to wall ${quoted(to.wall.id)}.`)

  const addOpenings: Record<string, unknown>[] = []
  const doorWidth = request.doorWidth ?? 0.8
  if (doorWidth > 0) {
    const inside = across ? [box.y0, box.y1] : [box.x0, box.x1]
    const start = across ? from.at[1] : from.at[0]
    let near: number
    if (request.doorFrom !== undefined) {
      if (request.doorFrom !== lo && request.doorFrom !== hi) throw new EditRefused(`The new wall runs ${across ? 'north-south' : 'east-west'}: place its door from the ${lo} or ${hi}.`)
      const d = request.doorDistance ?? 0
      near = request.doorFrom === lo ? inside[0]! + d : inside[1]! - d - doorWidth
    } else {
      near = (inside[0]! + inside[1]! - doorWidth) / 2
      guessed.push(`The door is centred in the new wall: pass door_from and door_distance to place it.`)
    }
    const offset = r3(near - start)
    if (offset < 0 || offset + doorWidth > length + tolerance('joint')) throw new EditRefused(`A ${doorWidth.toFixed(2)} m door there would run past the ends of the new ${length.toFixed(2)} m wall.`)
    const doorId = freshId(used, `door-${request.newRoom.id}`)
    used.add(doorId)
    // Swing "left" opens toward the face the new wall's normal points at: west or north.
    const opensTo = across ? 'west' : 'north'
    const opensInto = (opensTo === side ? request.newRoom.name : request.name ?? survey.byId.get(roomId)!.facts.name)
    addOpenings.push({ id: doorId, wall: wallId, type: 'door', offset, width: doorWidth, sill: 0, height: 2.1, hinge: 'start', swing: 'left', ...(request.doorFrom !== undefined ? { anchor: { from: request.doorFrom, room: roomId } } : {}) })
    said.push(`New door ${quoted(doorId)}, ${doorWidth.toFixed(2)} m wide, in the new wall${request.doorFrom !== undefined ? `, ${(request.doorDistance ?? 0).toFixed(2)} m from the ${request.doorFrom} side` : ''}.`)
    guessed.push(`Door ${quoted(doorId)} hangs from its ${lo} end and opens into ${quoted(opensInto)}: grid_change_opening changes that.`)
  }

  // WRT-28 (C18): the new room is in the flat of the room it was split from.
  const flat = plan.flats?.find((f) => f.rooms.includes(roomId))
  if (flat !== undefined) said.push(`Flat ${quoted(flat.name ?? flat.id)} lists ${quoted(request.newRoom.name)} too.`)
  const flatsPlan = flat === undefined
    ? {}
    : { plan: { flats: plan.flats!.map((f) => (f === flat ? { ...f, rooms: f.rooms.flatMap((id) => (id === roomId ? [id, request.newRoom.id] : [id])) } : f)) } }
  const patch: Patch = { ...flatsPlan, walls: new Map(), openings: new Map(), removeOpenings: new Set(), rooms, said, guessed, notKept, addWalls: [newWall], addRooms, addOpenings }
  // The rooms as the split leaves them, for their areas and their windows.
  // WRT-11: as the file will be read, and measured as grid_areas measures (columns taken off).
  const after = surveyPlan(withPatterns(planAfter(plan, patch)))
  const nets = { before: roomNets(survey), after: roomNets(after) }
  const area = (id: string): number => nets.after.get(id) ?? 0
  const kept = request.name !== undefined ? `${name} (now ${quoted(request.name)})` : name
  said.push(`${kept}: ${(nets.before.get(roomId) ?? 0).toFixed(2)} → ${area(roomId).toFixed(2)} m²; new room ${quoted(request.newRoom.name)}: ${area(request.newRoom.id).toFixed(2)} m².`)
  const hadWindow = (s: Survey, id: string): boolean => s.byId.get(id)?.openings.some((o) => o.type === 'window') ?? false
  const beforeWindows = plan.patterns === undefined ? survey : surveyPlan(withPatterns(plan))
  if (hadWindow(beforeWindows, roomId) && !hadWindow(after, roomId)) notKept.push(`${request.name !== undefined ? quoted(request.name) : name} has no window now: ${hadWindow(after, request.newRoom.id) ? `its window is in ${quoted(request.newRoom.name)}` : 'none is left on its side'}.`)
  return patch
}

