/**
 * MSG-13: inside or outside, worked out for each stretch of a wall from the rooms on its two
 * sides (`exposure.ts`), and the one answer the drawing, the DXF, the IFC and the checks share.
 * The plans are the lab's findings rebuilt: the bench's one-room plan with no kind (MS-11),
 * partitions beside an L-shaped room (AU1-1), an extension against part of a wall (WR-5) and a
 * courtyard drawn as a room (R-9).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { planWallSides, stretchAt, wallExposure, wallSides } from '../exposure'
import { buildFloorPlan } from '../floorplan'
import { toDxf } from '../export/dxf'
import { modelEntities } from '../export/__tests__/dxf-reader'
import { toIfc } from '../export/ifc'
import { validatePlan } from '../validate'
import { checkPlanSanity } from '../rules'
import { floorGraph } from '../rules/graph'

type P = [number, number]
const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))
const wall = (id: string, start: P, end: P, extra: Partial<Wall> = {}): Wall => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 2.7,
  kind: 'interior',
  ...extra
})
const room = (id: string, boundary: string[], use: Room['use'] = 'living'): Room => ({ id, name: id, boundary, use })
const exposures = (plan: FloorPlan): Record<string, string> => {
  const index = indexPlan(plan)
  return Object.fromEntries(plan.walls.map((w) => [w.id, wallExposure(index, w.id)]))
}
/** How many wall outlines the DXF puts on each wall layer. */
const dxfLayers = (plan: FloorPlan): { exterior: number; interior: number } => {
  const outlines = modelEntities(toDxf(buildFloorPlan(plan)), 'LWPOLYLINE')
  const count = (layer: string): number => outlines.filter((e) => e.layer === layer).length
  return { exterior: count('GRID-WALLS-EXTERIOR'), interior: count('GRID-WALLS-INTERIOR') }
}
/** How many walls the IFC marks external, and how many not. */
const ifcExternal = (plan: FloorPlan): { external: number; not: number } => {
  const ifc = toIfc(plan, { projectId: 'p', projectName: 'p' })
  return {
    external: ifc.split("'IsExternal',$,IFCBOOLEAN(.T.)").length - 1,
    not: ifc.split("'IsExternal',$,IFCBOOLEAN(.F.)").length - 1
  }
}

/** The bench's one-room plan (lab BENCH-9), written with no kind on any wall. */
const BENCH_NO_KIND = {
  walls: [
    { id: 'south', start: [0, 0], end: [4, 0], thickness: 0.3, height: 2.6 },
    { id: 'east', start: [4, 0], end: [4, 3], thickness: 0.3, height: 2.6 },
    { id: 'north', start: [4, 3], end: [0, 3], thickness: 0.3, height: 2.6 },
    { id: 'west', start: [0, 3], end: [0, 0], thickness: 0.3, height: 2.6 }
  ],
  rooms: [{ id: 'room', name: 'Room', use: 'bedroom', boundary: ['south', 'east', 'north', 'west'] }],
  openings: [
    { id: 'door', wall: 'south', type: 'door', offset: 0.5, width: 0.9, height: 2.1, hinge: 'start', swing: 'left' },
    { id: 'window', wall: 'north', type: 'window', offset: 1.2, width: 1.4, sill: 0.6, height: 1.3 }
  ]
}

describe('MS-11 a plan that states no wall kind', () => {
  const plan = parseFloorPlan(BENCH_NO_KIND)

  it('reads as interior in the file, and every wall is worked out as outside', () => {
    expect(plan.walls.every((w) => w.kind === 'interior')).toBe(true)
    expect(exposures(plan)).toEqual({ south: 'exterior', east: 'exterior', north: 'exterior', west: 'exterior' })
  })

  it('gets the same answer from the drawing, the DXF and the IFC', () => {
    expect(buildFloorPlan(plan).walls.map((w) => w.exposure)).toEqual(['exterior', 'exterior', 'exterior', 'exterior'])
    // The door and the window cut the ring of walls into two outlines (VEW-54): both on the outside layer.
    expect(dxfLayers(plan).interior).toBe(0)
    expect(dxfLayers(plan).exterior).toBe(2)
    // Four walls, and the door and window in the south and north walls (CMD-26) share their wall's exposure.
    expect(ifcExternal(plan)).toEqual({ external: 6, not: 0 })
  })

  // The escape window is checked in packages/rules (rules-escape.test.ts, MS-11).
  it('takes its door as the way out, with no line about it', () => {
    const graph = floorGraph(plan)
    expect(graph.exits).toEqual([{ room: 'room', opening: 'door' }])
    expect(graph.undrawn).toEqual([])
    const report = checkPlanSanity(plan)
    expect(report.findings).toEqual([])
    expect(report.notChecked.filter((n) => n.reason === 'way_out_not_drawn')).toEqual([])
    expect(validatePlan(plan).issues).toEqual([])
  })
})

describe('AU1-1 partitions beside an L-shaped room', () => {
  // A 6 × 6 m house: an L-shaped living room round a 3 × 3 m bedroom in its north-east notch,
  // divided by two 0.1 m partitions.
  const plan = parseFloorPlan({
    walls: [
      wall('s', [0, 0], [6, 0], { kind: 'exterior' }),
      wall('e1', [6, 0], [6, 3], { kind: 'exterior' }),
      wall('e2', [6, 3], [6, 6], { kind: 'exterior' }),
      wall('n1', [6, 6], [3, 6], { kind: 'exterior' }),
      wall('n2', [3, 6], [0, 6], { kind: 'exterior' }),
      wall('w', [0, 6], [0, 0], { kind: 'exterior' }),
      wall('p1', [6, 3], [3, 3], { thickness: 0.1, kind: 'partition' }),
      wall('p2', [3, 3], [3, 6], { thickness: 0.1, kind: 'partition' })
    ],
    rooms: [room('living', ['s', 'e1', 'p1', 'p2', 'n2', 'w']), room('bed', ['p1', 'e2', 'n1', 'p2'], 'bedroom')]
  })

  it('works the partitions out as inside walls, from the outlines on their two faces', () => {
    expect(exposures(plan)).toMatchObject({ p1: 'interior', p2: 'interior', s: 'exterior', n1: 'exterior' })
    const index = indexPlan(plan)
    // Its length between the walls it meets has the living room on one face (p1 runs west, so
    // its left face looks south) and the bedroom on the other; no stretch of it faces outside.
    const sides = wallSides(index, 'p1')!
    expect([stretchAt(sides, 1.5)!.left, stretchAt(sides, 1.5)!.right]).toEqual([['living'], ['bed']])
    expect(sides.stretches.some((s) => s.worked === 'exterior')).toBe(false)
  })

  it('puts them on the DXF\'s inside layer and marks them not external in the IFC', () => {
    // VEW-54: the six outside walls are one ring (its outline and its hole), the two partitions one outline.
    expect(dxfLayers(plan)).toEqual({ exterior: 2, interior: 1 })
    expect(ifcExternal(plan)).toEqual({ external: 6, not: 2 })
    expect(validatePlan(plan).issues).toEqual([])
  })
})

describe('WR-5 an extension against part of an outside wall', () => {
  // A 6 × 4 m house whose east wall is one wall, with a 3 × 3 m extension against its lower
  // part. The wall is not cut into pieces.
  const plan = parseFloorPlan({
    walls: [
      wall('s', [0, 0], [6, 0], { kind: 'exterior' }),
      wall('e', [6, 0], [6, 4], { kind: 'exterior' }),
      wall('n', [6, 4], [0, 4], { kind: 'exterior' }),
      wall('w', [0, 4], [0, 0], { kind: 'exterior' }),
      wall('xs', [6, 0], [9, 0]),
      wall('xe', [9, 0], [9, 3]),
      wall('xn', [9, 3], [6, 3])
    ],
    rooms: [room('house', ['s', 'e', 'n', 'w'], 'bedroom'), room('extension', ['xs', 'xe', 'xn', 'e'])],
    openings: [
      { id: 'through', wall: 'e', type: 'door', offset: 1, width: 0.9, height: 2.1 },
      { id: 'high', wall: 'e', type: 'window', offset: 3.2, width: 0.6, sill: 0.6, height: 1.2 }
    ]
  })
  const index = indexPlan(plan)

  it('works out each stretch of the one wall: inside along the extension, outside above it', () => {
    const sides = wallSides(index, 'e')!
    expect(sides.stretches.map((s) => [Number(s.from.toFixed(2)), Number(s.to.toFixed(2)), s.worked])).toEqual([
      [0, 0.1, 'detached'],
      [0.1, 2.9, 'interior'],
      [2.9, 3.9, 'exterior'],
      [3.9, 4, 'detached']
    ])
    expect(stretchAt(sides, 1.45)!.left).toEqual(['house'])
    expect(stretchAt(sides, 1.45)!.right).toEqual(['extension'])
  })

  it('joins the rooms through the door in the covered stretch', () => {
    expect(floorGraph(plan).links).toContainEqual({ rooms: ['extension', 'house'], via: 'through' })
  })

  it('the extension\'s walls, stated nothing, are worked out as outside walls', () => {
    expect(exposures(plan)).toMatchObject({ xs: 'exterior', xe: 'exterior', xn: 'exterior', e: 'exterior' })
  })
})

describe('R-9 a courtyard drawn as a room', () => {
  // A 9 × 9 m house round a 3 × 3 m courtyard, which is drawn as a room. The courtyard's four
  // walls are stated exterior: that is kept, and each says so in one line.
  const ring = (prefix: string, a: number, b: number, kind: Wall['kind']): Wall[] => [
    wall(`${prefix}s`, [a, a], [b, a], { kind }),
    wall(`${prefix}e`, [b, a], [b, b], { kind }),
    wall(`${prefix}n`, [b, b], [a, b], { kind }),
    wall(`${prefix}w`, [a, b], [a, a], { kind })
  ]
  const plan = parseFloorPlan({
    walls: [...ring('o', 0, 9, 'exterior'), ...ring('c', 3, 6, 'exterior'), wall('d1', [0, 3], [3, 3]), wall('d2', [6, 6], [9, 6])],
    rooms: [
      room('court', ['cs', 'ce', 'cn', 'cw']),
      // The house as two rooms, each wrapping round half of the courtyard.
      room('south', ['os', 'oe', 'd2', 'ce', 'cs', 'cw', 'd1', 'ow']),
      room('north', ['d1', 'cw', 'cn', 'ce', 'd2', 'oe', 'on', 'ow'])
    ]
  })

  it('keeps the courtyard walls as outside walls, as stated, in every view and export', () => {
    expect(exposures(plan)).toMatchObject({ cs: 'exterior', ce: 'exterior', cn: 'exterior', cw: 'exterior' })
    const index = indexPlan(plan)
    expect(wallSides(index, 'cs')!.worked).toBe('interior')
    expect(ifcExternal(plan).not).toBe(2)
  })

  it('says in one line per wall that the stated kind and the rooms disagree', () => {
    const lines = validatePlan(plan).issues.filter((i) => i.code === 'wall/kind-differs')
    expect(lines.map((i) => i.id)).toEqual(['cs', 'ce', 'cn', 'cw'])
    expect(lines[0]!.message).toBe(
      'Wall "cs" is stated exterior, but rooms lie on both its sides along 3.00 m ("south" and "court"). It is ' +
        'kept as an outside wall, as stated; if it is an inside wall, leave out its kind.'
    )
  })
})

describe('what the worked-out kind leaves alone', () => {
  it('a partition with a room on one side only is treated as an outside wall, and says so', () => {
    const plan = parseFloorPlan({
      walls: [
        wall('s', [0, 0], [4, 0], { kind: 'exterior' }),
        wall('e', [4, 0], [4, 3], { kind: 'partition', thickness: 0.1 }),
        wall('n', [4, 3], [0, 3], { kind: 'exterior' }),
        wall('w', [0, 3], [0, 0], { kind: 'exterior' })
      ],
      rooms: [room('r', ['s', 'e', 'n', 'w'])]
    })
    expect(exposures(plan).e).toBe('exterior')
    expect(validatePlan(plan).issues.map((i) => [i.code, i.id, i.message])).toEqual([
      [
        'wall/kind-differs',
        'e',
        'Wall "e" is stated a partition, but faces outside along 2.80 m: room "r" lies on one side and no room on the other. It is treated as an outside wall.'
      ]
    ])
  })

  it('the walls of a pod marked inside face the room around them (ARE-5)', () => {
    const plan = fixture('room-in-room.json')
    const index = indexPlan(plan)
    const pods = plan.rooms.filter((r) => r.inside === true).flatMap((r) => r.boundary)
    expect(pods.length).toBeGreaterThan(0)
    for (const id of pods) expect(wallExposure(index, id), id).toBe('interior')
  })

  it('a wall beside floor that no room claims faces a space not drawn, not the outside (ARE-4)', () => {
    const villa = fixture('villa.json')
    const plan = { ...villa, rooms: villa.rooms.filter((r) => r.id !== 'wardrobe') }
    const index = indexPlan(plan)
    expect(wallExposure(index, 'n8')).toBe('interior')
    expect(validatePlan(plan).issues.map((i) => i.code)).toEqual(['floor/unclaimed'])
  })

  it('a wall no room lies along is detached, unless it is stated exterior', () => {
    const plan = parseFloorPlan({ walls: [wall('fence', [0, 0], [5, 0]), wall('garden', [0, 2], [5, 2], { kind: 'exterior' })] })
    expect(exposures(plan)).toEqual({ fence: 'detached', garden: 'exterior' })
  })

  it('agrees with the stated kinds on the shared fixtures and gives no line about them', () => {
    // The Berlin flat's balcony and the Madrid flat's light well are drawn as rooms against walls
    // stated exterior, and say so (room-rows-flats.test.ts); outdoor rooms are CNT-7's.
    for (const name of ['floor-plan.json', 'villa.json', 'three-bed-house.json']) {
      const plan = fixture(name)
      const index = indexPlan(plan)
      expect(validatePlan(plan).issues.filter((i) => i.code === 'wall/kind-differs'), name).toEqual([])
      for (const [id, sides] of planWallSides(index)) {
        const w = plan.walls.find((x) => x.id === id)!
        if (w.kind === 'exterior') expect(sides.exposure, `${name} ${id}`).toBe('exterior')
      }
    }
  })
})
