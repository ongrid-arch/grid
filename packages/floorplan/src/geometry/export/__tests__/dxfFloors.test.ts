/**
 * VEW-72: a DXF of every floor, at the largest standard scale it fits at, with a block per
 * schedule type that carries the opening's mark, type, width, height and sill, and a door's hand
 * said one way in the DXF and the IFC.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../../types/floorplan'
import { exportPlan } from '../../../export/planExport'
import { buildFloorPlan } from '../../floorplan'
import { doorHand } from '../../handing'
import { dxfSheets, toDxf } from '../dxf'
import { attributesOf, dxfProblems, readDxf, worldShapes } from './dxf-reader'

const ids = { projectId: 'p', projectName: 'House', now: new Date(0) }

/** One room `width` by `depth`, its walls and room ids prefixed by its floor. */
function box(floor: string, width: number, depth: number): Pick<FloorPlan, 'walls' | 'rooms'> {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({ id: `${floor}-${id}`, floor, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' as const })
  return {
    walls: [wall('s', [0, 0], [width, 0]), wall('e', [width, 0], [width, depth]), wall('n', [width, depth], [0, depth]), wall('w', [0, depth], [0, 0])],
    rooms: [{ id: `${floor}-room`, name: `Room ${floor}`, floor, boundary: ['s', 'e', 'n', 'w'].map((w) => `${floor}-${w}`) }]
  }
}

function twoFloors(): FloorPlan {
  const ground = box('ground', 8, 6)
  const first = box('first', 8, 6)
  return {
    version: '1',
    units: 'm',
    floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
    walls: [...ground.walls, ...first.walls],
    rooms: [...ground.rooms, ...first.rooms],
    openings: [
      { id: 'd1', wall: 'ground-s', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' },
      { id: 'w1', wall: 'first-n', type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 }
    ]
  }
}

describe('VEW-72: every floor in one DXF', () => {
  const made = exportPlan(twoFloors(), 'dxf', ids)
  const dxf = made.data as string
  const doc = readDxf(dxf)

  it('holds together, with a paper layout per floor named after it', () => {
    expect(dxfProblems(dxf)).toEqual([])
    expect(doc.objects.filter((o) => o.type === 'LAYOUT').map((o) => o.pairs.filter((p) => p.code === 1).at(-1)?.value)).toEqual(['Model', 'Ground', 'First'])
    expect(doc.blocks.map((b) => b.name)).toContain('*Paper_Space0')
    expect(made.floors.map((floor) => floor.id)).toEqual(['ground', 'first'])
    expect(made.floorsLeftOut).toEqual([])
  })

  it('draws the upper floor beside the lower one, moved a whole number of 10 m, and says how far', () => {
    const rooms = worldShapes(dxf).filter((shape) => shape.layer === 'GRID-ROOMS')
    expect(rooms).toHaveLength(2)
    const [low, high] = rooms.map((room) => Math.min(...room.points.map((p) => p.x)))
    expect(low).toBeCloseTo(0.1, 6)
    expect(high! - 0.1).toBeGreaterThan(8)
    expect(Math.round((high! - 0.1) * 1000) % 10000).toBe(0)
    expect(dxf).toContain(`Floor "First", drawn ${(high! - 0.1).toFixed(0)} m along X from where the plan places it`)
  })

  it('writes each floor at one scale, and the sheets in the answer', () => {
    expect(made.sheets).toEqual([
      { floor: 'ground', scale: 100, stated: false, fits: true, fitsAt: null },
      { floor: 'first', scale: 100, stated: false, fits: true, fitsAt: null }
    ])
    expect(dxf).toContain('"Ground": scale 1:100 on A3')
  })

  it('one floor named is the file of one floor, on one layout', () => {
    const one = exportPlan(twoFloors(), 'dxf', { ...ids, floorId: 'first' })
    const layouts = readDxf(one.data as string).objects.filter((o) => o.type === 'LAYOUT')
    expect(layouts).toHaveLength(2)
    expect(one.floorsLeftOut).toEqual(['ground'])
  })
})

describe('VEW-72: the largest standard scale the plan fits at', () => {
  // A platform 121 m long: 1:100 shows 40 m of it, 1:500 all of it.
  const long = (): FloorPlan => ({ version: '1', units: 'm', ...box('ground', 121, 12), openings: [] })

  it('picks the largest standard scale it fits at', () => {
    const made = exportPlan(long(), 'dxf', ids)
    expect(made.sheets).toEqual([{ floor: 'ground', scale: 500, stated: false, fits: true, fitsAt: null }])
    // Text sized for 1:500: a room name is 2.5 mm on paper.
    expect(dxfSheets([{ id: 'x', drawing: buildFloorPlan({ version: '1', units: 'm', ...box('x', 10, 8), openings: [] } as FloorPlan) }])[0]!.scale).toBe(100)
  })

  it('keeps a stated scale, and says it does not fit and the scale it fits at', () => {
    const made = exportPlan(long(), 'dxf', { ...ids, dxfScale: 100 })
    expect(made.sheets).toEqual([{ floor: 'ground', scale: 100, stated: true, fits: false, fitsAt: 500 }])
    expect(made.data as string).toContain('The plan does not fit on A3 at 1:100: the sheet shows the middle of it. It fits at 1:500.')
  })

  it('keeps a profile\'s scale when toDxf is given one', () => {
    const plan = { version: '1', units: 'm', ...box('ground', 4, 3), openings: [] } as FloorPlan
    const text = toDxf(buildFloorPlan(plan), { scale: 50 })
    expect(text).toContain('Scale 1:50 on A3')
  })
})

describe('VEW-72: a block per schedule type, with its attributes', () => {
  function windows(): FloorPlan {
    const room = box('ground', 8, 6)
    return {
      version: '1',
      units: 'm',
      ...room,
      openings: [
        { id: 'a', wall: 'ground-n', type: 'window', offset: 1.5, width: 1.2, sill: 0.9, height: 1.2 },
        { id: 'b', wall: 'ground-n', type: 'window', offset: 5, width: 1.2, sill: 0.6, height: 1.5 },
        { id: 'c', wall: 'ground-s', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }
      ]
    }
  }

  it('gives windows of one width and two heights a block each', () => {
    const dxf = exportPlan(windows(), 'dxf', ids).data as string
    const names = readDxf(dxf).blocks.map((b) => b.name).filter((n) => n.startsWith('GRID-WINDOW'))
    expect(names).toEqual(['GRID-WINDOW-1200x1200-W200', 'GRID-WINDOW-1200x1500-W200'])
  })

  it('carries MARK, TYPE, WIDTH, HEIGHT and SILL on each insert, the mark the schedule gives', () => {
    const marks = new Map([['a', { mark: 'W1', type: 'window:1.2x1.2' }], ['b', { mark: 'W2', type: 'window:1.2x1.5' }], ['c', { mark: 'D1', type: 'door:0.9x2.1' }]])
    const dxf = exportPlan(windows(), 'dxf', { ...ids, openingMarks: marks }).data as string
    expect(dxfProblems(dxf)).toEqual([])
    expect(attributesOf(dxf, 'GRID-WINDOW-1200x1500-W200')).toEqual([{ MARK: 'W2', TYPE: 'window:1.2x1.5', WIDTH: '1.20', HEIGHT: '1.50', SILL: '0.60' }])
    expect(attributesOf(dxf, 'GRID-DOOR-900x2100-W200-RH')).toEqual([{ MARK: 'D1', TYPE: 'door:0.9x2.1', WIDTH: '0.90', HEIGHT: '2.10', SILL: '0.00' }])
  })

  it('marks an opening by its id when no schedule is given', () => {
    const dxf = exportPlan(windows(), 'dxf', ids).data as string
    expect(attributesOf(dxf, 'GRID-WINDOW-1200x1200-W200')[0]).toMatchObject({ MARK: 'a', TYPE: 'window:1.2x1.2' })
  })

  it('tags the IFC door and window with the same marks', () => {
    const marks = new Map([['a', { mark: 'W1', type: null }], ['c', { mark: 'D1', type: null }]])
    const ifc = exportPlan(windows(), 'ifc', { ...ids, openingMarks: marks }).data as string
    // GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, Tag.
    const tag = (type: string, name: string): string | undefined => new RegExp(`${type}\\('[^']*',#\\d+,'${name}',\\$,\\$,#\\d+,#\\d+,'([^']*)'`).exec(ifc)?.[1]
    expect(tag('IFCWINDOW', 'a')).toBe('W1')
    expect(tag('IFCWINDOW', 'b')).toBe('b')
    expect(tag('IFCDOOR', 'c')).toBe('D1')
  })
})

describe("VEW-72: a door's hand, one way in the schedule, the DXF and the IFC", () => {
  it('is the side of the hinges seen from the side the door opens toward', () => {
    // Hung from the wall's start and opening to its left face: standing on that face and facing
    // the wall, the start is on the right.
    expect(doorHand({ hinge: 'start', swing: 'left' })).toBe('right')
    expect(doorHand({ hinge: 'end', swing: 'left' })).toBe('left')
    expect(doorHand({ hinge: 'start' })).toBeNull()
  })

  it('names the DXF block and the IFC style by it', () => {
    const plan: FloorPlan = { version: '1', units: 'm', ...box('ground', 6, 4), openings: [{ id: 'c', wall: 'ground-s', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }] }
    expect(readDxf(exportPlan(plan, 'dxf', ids).data as string).blocks.map((b) => b.name)).toContain('GRID-DOOR-900x2100-W200-RH')
    const ifc = exportPlan(plan, 'ifc', ids).data as string
    expect(ifc).toContain("'Door 0.9 x 2.1 m, single swing, right hand'")
    expect(ifc).toContain('.SINGLE_SWING_LEFT.')
    expect(ifc).toContain("A door''s hand is the side its hinges are on, seen from the side it opens toward.")
  })
})
