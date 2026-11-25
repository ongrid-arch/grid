import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '../plan'
import { indexPlan } from '../plan'
import { area } from '../vec2'
import { roomPolygon } from '../room'
import { compileRoomsText } from '../../rooms'
import { readRoomsText } from '../../rooms/read'
import { safeParseFloorPlan } from '../../types/floorplan'

/**
 * ARE-34: a plan file holds a wall's centre line to a tenth of a millimetre, so an outside wall and
 * an inside wall of another thickness whose inner faces are meant to be one line can sit a hair
 * apart. A room side along both is still one straight side, and the room keeps its four corners.
 */

const wall = (id: string, start: [number, number], end: [number, number], thickness: number, kind: Wall['kind']): Wall => ({
  id,
  start,
  end,
  thickness,
  height: 2.7,
  kind
})

/**
 * A 4 x 3 room inside faces (0,0)-(4,3). Its south side runs along an outside wall of 0.3 m for the
 * first 2.5 m and along an inside wall of 0.1143 m (4.5 in) for the rest, whose face is `off` below
 * the outside wall's.
 */
function roomOn(off: number, order: 'outside-first' | 'inside-first' = 'outside-first'): FloorPlan {
  const walls: Wall[] = [
    wall('s-out', [-0.15, -0.15], [2.5, -0.15], 0.3, 'exterior'),
    wall('s-in', [2.5, -0.05715 - off], [4.15, -0.05715 - off], 0.1143, 'interior'),
    wall('e', [4.15, -0.15], [4.15, 3.15], 0.3, 'exterior'),
    wall('n', [4.15, 3.15], [-0.15, 3.15], 0.3, 'exterior'),
    wall('w', [-0.15, 3.15], [-0.15, -0.15], 0.3, 'exterior')
  ]
  const boundary = order === 'outside-first' ? ['s-out', 's-in', 'e', 'n', 'w'] : ['s-in', 'e', 'n', 'w', 's-out']
  return { version: '1', units: 'm', walls, openings: [], rooms: [{ id: 'r', name: 'Room', boundary }] }
}

const polygonOf = (plan: FloorPlan) => roomPolygon(plan.rooms[0]!, indexPlan(plan))

function box(points: readonly { x: number; y: number }[]): { across: number; up: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { across: Math.max(...xs) - Math.min(...xs), up: Math.max(...ys) - Math.min(...ys) }
}

describe('a room side along an outside and an inside wall a hair apart (ARE-34)', () => {
  it('is one straight side: four corners, and the room keeps its W x D', () => {
    const polygon = polygonOf(roomOn(0.00005))
    expect(polygon).toHaveLength(4)
    const { across, up } = box(polygon)
    expect(across).toBeCloseTo(4, 3)
    expect(up).toBeCloseTo(3, 3)
    expect(Math.abs(area(polygon))).toBeCloseTo(across * up, 9)
  })

  it('does not care which wall the room lists first, or which way the faces are off', () => {
    for (const off of [0.00005, -0.00005, 0.0001, -0.0001]) {
      for (const order of ['outside-first', 'inside-first'] as const) {
        expect(polygonOf(roomOn(off, order)), `${off} ${order}`).toHaveLength(4)
      }
    }
  })

  it('still traces a step a millimetre deep, as a thick wall carrying on as a thin one', () => {
    const polygon = polygonOf(roomOn(0.001))
    expect(polygon).toHaveLength(6)
  })
})

/** A feet plan: a room beside a deeper one, so their shared side runs on as an outside wall. */
const FEET = `plan "Ranch"
display ft-in numbers ft
walls outside 6in inside 4.5in height 9ft
room living "Living" living 18 x 14 at 0,0
room kitchen "Kitchen" kitchen 12 x 20 east of living
room bed "Bed" bedroom 13 x 11 north of living
`

describe('a feet plan written from rooms text (ARE-34)', () => {
  const written = compileRoomsText(FEET)
  const plan = safeParseFloorPlan(written.plan)!

  it('gives every room four corners', () => {
    expect(plan).not.toBeNull()
    const index = indexPlan(plan)
    for (const room of plan.rooms) expect(roomPolygon(room, index), room.id).toHaveLength(4)
  })

  // Rooms first, so the room lines are written whatever else the read-back says of the walls.
  it('reads every room back as W x D at its corner, not as a polygon', () => {
    const { text } = readRoomsText(plan, { prefer: 'rooms' })
    const rooms = text.split('\n').filter((line) => line.startsWith('room '))
    expect(rooms).toHaveLength(3)
    for (const line of rooms) expect(line).toMatch(/ x .* at /)
    expect(text).not.toContain('polygon')
  })
})
