/**
 * Which way the plan faces (CNT-3), in words and as data: the north the plan states, each room
 * by the ways its outside walls and windows face, each outside wall and each opening in one. It
 * answers "which rooms face east". The geometry is `planFacing` in the core; this only words it.
 *
 * A plan that states no north is answered with north taken as the top of the page it was drawn
 * on, and the answer says so first, so a guess never passes for the plan's north.
 */
import { bearingOf, COMPASS_POINTS, compassPoint, planFacing, type CompassPoint, type FloorPlan, type PlanFacing } from '@ongrid/floorplan/geometry'
import { roomCalled } from './survey'

export const FACING_RULE =
  'A wall faces the way of the normal of its outside face, the face with no room on it, turned by the plan\'s north; a room faces each way its outside walls face, and a window the way its wall does. It checks no rule.'

const q = (text: string): string => JSON.stringify(text)
const deg = (value: number): number => Math.round(value * 10) / 10 + 0
const m = (value: number): string => (Math.round(value * 100) / 100 + 0).toFixed(2)

/** How far a north of `turn` degrees counter-clockwise from +Y lies, in words. */
export function northWords(turn: number): string {
  if (turn === 0) return 'up the drawing (+y)'
  const left = turn <= 180 ? turn : 360 - turn
  return `${deg(left)}° ${turn <= 180 ? 'counter-clockwise' : 'clockwise'} from the top of the drawing`
}

/** The first sentence of every answer: whose north the directions are from. */
export function northLine(facing: PlanFacing): string {
  const { orientation } = facing
  const y = orientation.yAxis === 'down' ? ' The plan says its y runs down the page, so the drawing is the building\'s mirror image; the directions are read the right way round.' : ''
  if (facing.northStated) return `North, as the plan states it: ${northWords(orientation.north!)} (north ${deg(orientation.north!)}).${y}`
  const top = orientation.yAxis === 'down' ? 'the top of the page it was drawn on (-y)' : 'the top of the drawing (+y)'
  return `The plan states no north, so these directions take north as ${top}, which is not known to be north: ask the person, and set north in the plan file (degrees counter-clockwise from the top of the drawing).${y}`
}

/** The north an answer's directions are from, and which way the plan's y runs, as data (BRF-5 shares it). */
export function northData(facing: PlanFacing): { north: Record<string, unknown>; yAxis: { runs: 'up' | 'down'; stated: boolean } } {
  return {
    north: facing.northStated
      ? { stated: true, degrees: deg(facing.orientation.north!), words: northWords(facing.orientation.north!) }
      : { stated: false, assumed: facing.orientation.yAxis === 'down' ? 'the top of the page the plan was drawn on, -y' : 'the top of the drawing, +y' },
    yAxis: { runs: facing.orientation.yAxis, stated: facing.orientation.yAxisStated },
  }
}

export interface FacingAnswer {
  readonly lines: readonly string[]
  readonly data: Record<string, unknown>
}

/** The whole answer, or one room's. Room names come from the plan. */
export function facingAnswer(plan: FloorPlan, room?: string): FacingAnswer {
  const facing = planFacing(plan)
  const name = new Map(plan.rooms.map((r) => [r.id, roomCalled(r)]))
  const rooms = facing.rooms.filter((r) => room === undefined || r.room === room)
  const lines = [northLine(facing)]

  if (room !== undefined) {
    const one = rooms[0]
    const label = q(name.get(room) ?? room)
    lines.push(one === undefined
      ? `${label} has no outside wall, so it faces no way.`
      : `${label} faces ${one.walls.map((w) => `${w.faces} (${m(w.length)} m of outside wall)`).join(', ')}${one.windows.length === 0 ? ', with no window' : `, with windows facing ${one.windows.join(', ')}`}.`)
  } else {
    const byWay = new Map<CompassPoint, string[]>()
    for (const r of rooms) for (const w of r.walls) byWay.set(w.faces, [...(byWay.get(w.faces) ?? []), r.room])
    if (byWay.size === 0) lines.push('No room has an outside wall, so no room faces any way.')
    else {
      lines.push('Rooms by the way their outside walls face:')
      for (const way of COMPASS_POINTS) {
        const ids = byWay.get(way)
        if (ids === undefined) continue
        const windowed = (id: string): string => (rooms.find((r) => r.room === id)!.windows.includes(way) ? ', window' : '')
        lines.push(`  ${way}: ${ids.map((id) => `${q(name.get(id) ?? id)} (${id}${windowed(id)})`).join(', ')}`)
      }
    }
  }
  const front = facing.front
  if (front !== null) {
    const part = `${front.part} ${q(front.id)}`
    lines.push('missing' in front
      ? `The front names ${part}, which ${front.missing === 'no-such-part' ? 'the plan does not have' : 'does not face outside'}, so no front is said.`
      : `The front, ${part}, faces ${front.faces} (bearing ${deg(front.bearing)}°).`)
  }
  const openings = facing.openings.filter((o) => room === undefined || o.rooms.includes(room))
  const data = {
    ...northData(facing),
    front: front === null ? null : 'missing' in front ? { part: front.part, id: front.id, faces: null, missing: front.missing } : { part: front.part, id: front.id, wall: front.wall, faces: front.faces, bearing: deg(front.bearing) },
    rooms: rooms.map((r) => ({ id: r.room, name: name.get(r.room) ?? r.room, floor: r.floor, faces: r.walls.map((w) => w.faces), walls: r.walls.map((w) => ({ faces: w.faces, length: Math.round(w.length * 1000) / 1000 })), windows: r.windows })),
    walls: facing.walls
      .filter((w) => room === undefined || w.rooms.includes(room))
      .map((w) => ({ wall: w.wall, floor: w.floor, from: Math.round(w.from * 1000) / 1000, to: Math.round(w.to * 1000) / 1000, rooms: w.rooms, faces: w.faces, bearing: deg(w.bearing) })),
    openings: openings.map((o) => ({ id: o.opening, type: o.type, wall: o.wall, rooms: o.rooms, faces: o.faces, bearing: deg(o.bearing) })),
  }
  return { lines, data }
}

/** The real way each side of the drawing faces: its top, right, foot and left. */
function drawingSides(facing: PlanFacing): string {
  const sides: [string, { x: number; y: number }][] = [['top', { x: 0, y: 1 }], ['right side', { x: 1, y: 0 }], ['foot', { x: 0, y: -1 }], ['left side', { x: -1, y: 0 }]]
  const said = sides.map(([side, way], i) => `its ${side}${i === 0 ? ' faces' : ''} ${wayOf(facing, way)}`)
  return `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`
}

function wayOf(facing: PlanFacing, direction: { x: number; y: number }): CompassPoint {
  const { orientation, northUsed } = facing
  return compassPoint(bearingOf(direction, orientation, northUsed)!)
}

/**
 * `grid describe`'s lines on north and facing (CNT-3), for a plan that states its north, its
 * front or that its y runs down. Empty for any other plan, which is described as before.
 */
export function facingDescription(plan: FloorPlan, audience: 'person' | 'agent'): string[] {
  if (plan.north === undefined && plan.front === undefined && plan.yAxis !== 'down') return []
  const facing = planFacing(plan)
  const name = new Map(plan.rooms.map((r) => [r.id, roomCalled(r)]))
  const byWay = new Map<CompassPoint, string[]>()
  for (const r of facing.rooms) for (const w of r.walls) byWay.set(w.faces, [...(byWay.get(w.faces) ?? []), r.room])
  const ways = COMPASS_POINTS.filter((way) => byWay.has(way))
  const front = facing.front
  if (audience === 'agent') {
    const north = facing.northStated ? `NORTH ${deg(facing.orientation.north!)} ccw from +y; drawing top faces ${wayOf(facing, { x: 0, y: 1 })}` : 'NORTH not stated; facing below takes the drawing top as north'
    const y = facing.orientation.yAxis === 'down' ? '; Y down: the drawing is the building mirrored' : ''
    const lines = [`${north}${y}`]
    if (ways.length > 0) lines.push(`FACING ${ways.map((way) => `${way}: ${byWay.get(way)!.join(' ')}`).join('; ')}`)
    if (front !== null) lines.push(`FRONT ${front.part} ${front.id} ${'missing' in front ? `not said (${front.missing})` : `faces ${front.faces}`}`)
    return lines
  }
  const lines = [facing.northStated
    ? `North, as the plan states it: ${northWords(facing.orientation.north!)}. The sides named here are the drawing's: ${drawingSides(facing)}.`
    : 'The plan states no north: the ways below take the top of the drawing as north, which is not known to be.']
  if (facing.orientation.yAxis === 'down') lines.push('The plan says its y runs down the page: the drawing shows the building mirrored, and the ways below are read the right way round.')
  if (ways.length > 0) lines.push(`Rooms facing each way, by their outside walls: ${ways.map((way) => `${way}, ${byWay.get(way)!.map((id) => name.get(id) ?? id).join(', ')}`).join('; ')}.`)
  if (front !== null) lines.push('missing' in front ? 'The front the plan names does not face outside, so no front is said.' : `The front faces ${front.faces}.`)
  return lines
}
