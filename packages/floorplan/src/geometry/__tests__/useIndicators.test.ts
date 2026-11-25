/**
 * CNT-13: the plan's fixtures as obstacles, and the use indicators measured round them. A door
 * that swings into a fixture names it (S-8); each indicator says what it measured, with what
 * width or clearance, and where that figure comes from.
 */
import { describe, expect, it } from 'vitest'
import type { Item } from '../../types/floorplan'
import { outline } from '../../test-support/outline'
import type { FloorPlan, Opening } from '../plan'
import { validateDoorSweeps } from '../sweep'
import { buildFloorPlan } from '../floorplan'
import { itemName, roomShapes } from '../items'
import { indexPlan } from '../plan'
import { doorwayClearance, fixtureObstacles, fixtureSpace, lineMouth, openingMouth, passageWidth, pointMouth, turningSpace, windowCover, USE_INDICATORS, INDICATOR_NOTE } from '../use'
import { TOLERANCES } from '../tolerances'

/** A 4 × 3 m room inside 0.2 m walls, w1 along the bottom, with a 0.9 m door in w1 at 1 m. */
function room(items: Item[] = [], openings: Opening[] = [door()]): FloorPlan {
  const { walls, room: r } = outline([[0, 0], [4, 0], [4, 3], [0, 3]])
  return { version: '1', units: 'm', walls, rooms: [{ ...r, name: 'Kitchen' }], openings, items }
}

function door(extra: Partial<Opening> = {}): Opening {
  return { id: 'd1', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', ...extra }
}

/** S-8's table: a fixed piece, held as a kitchen run labelled "Table 2" (tables are furniture, not held yet). */
const table = (at: [number, number] = [1.5, 0.8]): Item => ({ id: 'table-2', kind: 'kitchen-run', label: 'Table 2', at, size: [0.8, 0.5], height: 0.75 })

describe('a door swing that hits a fixture names it (S-8)', () => {
  it('names "Table 2" by its label, kind and id, and not a wall', () => {
    const issues = validateDoorSweeps(room([table()]), (o) => o)
    expect(issues).toEqual([
      {
        code: 'opening/door-hits-item',
        entity: 'opening',
        id: 'd1',
        message: 'This door hits "Table 2" (kitchen run "table-2") when it opens.',
        severity: 'warning',
        hits: ['table-2']
      }
    ])
    expect(issues[0]!.message).not.toMatch(/wall/)
  })

  it('says nothing of a fixture outside the swing, or touching its arc only', () => {
    expect(validateDoorSweeps(room([table([3, 2])]), (o) => o)).toEqual([])
    // The swing reaches y = 1.0 at most (the leaf hangs from the face at y = 0.1): a fixture from y = 1.0 up rests on the arc.
    expect(validateDoorSweeps(room([table([1.1, 1.25])]), (o) => o)).toEqual([])
  })

  it('names a fixture with no label by its kind and id, and several in plan order', () => {
    const wc: Item = { id: 'wc', kind: 'toilet', at: [1.3, 0.5], size: [0.4, 0.6], height: 0.8 }
    const issues = validateDoorSweeps(room([table(), wc]), (o) => o)
    expect(issues.map((i) => [i.code, i.hits, i.message])).toEqual([
      ['opening/door-hits-item', ['table-2', 'wc'], 'This door hits "Table 2" (kitchen run "table-2"), toilet "wc" when it opens.']
    ])
  })

  it('leaves out an item the plan does not hold, as the drawing does', () => {
    const loose: Item = { ...table(), kind: 'piano' }
    expect(buildFloorPlan(room([loose])).items).toEqual([])
    expect(validateDoorSweeps(room([loose]), (o) => o)).toEqual([])
  })

  it('names an item inside a sentence by kind and id, with its label first when stated', () => {
    expect(itemName({ id: 'k1', kind: 'kitchen-run' })).toBe('kitchen run "k1"')
    expect(itemName({ id: 't2', kind: 'kitchen-run', label: 'Table 2' })).toBe('"Table 2" (kitchen run "t2")')
    expect(itemName({ id: 'x', kind: 'piano' })).toBe('item "x"')
  })
})

/** The room's floor as its shape gives it: the outline runs along the inner faces, 0.1 m in. */
function floorOf(plan: FloorPlan): { polygon: { x: number; y: number }[]; holes: { x: number; y: number }[][] } {
  const [{ shape }] = roomShapes(indexPlan(plan))
  return { polygon: [...shape!.polygon], holes: shape!.holes.map((h) => [...h]) }
}

const wc = (at: [number, number], turn = 0): Item => ({ id: 'wc', kind: 'toilet', at, size: [0.4, 0.6], height: 0.8, turn })
const round = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 1000)

describe('the clear width a doorway leaves (use/doorway-clear-width)', () => {
  it('takes the open leaf off a door, and nothing off a doorless opening', () => {
    const plan = room()
    const w1 = plan.walls[0]!
    const d = doorwayClearance(w1, plan.openings[0]!, [])
    expect(d).toMatchObject({ opening: 'd1', hole: 0.9, leaf: TOLERANCES.useOpenLeaf.value, narrowedBy: [] })
    expect(round(d.clear)).toBe(0.85)
    const open = doorwayClearance(w1, { ...plan.openings[0]!, type: 'opening' }, [])
    expect(round(open.clear)).toBe(0.9)
  })

  it('takes off what a fixture standing in front of the hole covers, and names it', () => {
    // A toilet from x 1.6 to 2.0, its back on the face at y 0.1: it covers 0.3 m of the hole (1.0 to 1.9).
    const plan = room([wc([1.8, 0.4])])
    const d = doorwayClearance(plan.walls[0]!, plan.openings[0]!, fixtureObstacles(plan.items!, 'ground'))
    expect(round(d.run)).toBe(0.6)
    expect(round(d.clear)).toBe(0.55)
    expect(d.narrowedBy).toEqual(['wc'])
  })

  it('leaves a fixture further off than the approach depth, or beside the hole, alone', () => {
    const far = room([wc([1.4, 0.75])]) // from y 0.45: 0.35 m off the face
    expect(doorwayClearance(far.walls[0]!, far.openings[0]!, fixtureObstacles(far.items!, 'ground')).narrowedBy).toEqual([])
    const beside = room([wc([2.2, 0.4])]) // from x 2.0, past the hole's end at 1.9
    expect(doorwayClearance(beside.walls[0]!, beside.openings[0]!, fixtureObstacles(beside.items!, 'ground')).narrowedBy).toEqual([])
  })
})

describe('a window blocked by a fixture (use/window-blocked)', () => {
  // A 1.2 m window in w3, the top wall drawn from (4, 3) to (0, 3): offset 1 runs from x 3 to x 1.8.
  const window_ = (sill: number): Opening => ({ id: 'win', wall: 'w3', type: 'window', offset: 1, width: 1.2, sill, height: 1.2 })
  // A kitchen run along the top wall, its back on the face at y 2.9, from x 1.2 to 2.4.
  const run: Item = { id: 'run', kind: 'kitchen-run', at: [1.8, 2.6], size: [1.2, 0.6], height: 0.9, turn: 180 }

  it('measures how much of the window a fixture higher than its sill stands in front of', () => {
    const plan = room([run], [door(), window_(0.8)])
    const cover = windowCover(plan.walls[2]!, plan.openings[1]!, fixtureObstacles(plan.items!, 'ground').map((o) => ({ ...o, height: 0.9 })))
    expect(round(cover.covered)).toBe(0.6)
    expect(cover.by.map((b) => [b.id, round(b.covers)])).toEqual([['run', 0.6]])
  })

  it('says nothing of a fixture lower than the sill', () => {
    const plan = room([run], [door(), window_(1)])
    const cover = windowCover(plan.walls[2]!, plan.openings[1]!, fixtureObstacles(plan.items!, 'ground').map((o) => ({ ...o, height: 0.9 })))
    expect(cover.covered).toBe(0)
    expect(cover.by).toEqual([])
  })

  it('does not call a low seat in front of glazing to the floor a blocked window', () => {
    const glass: Opening = { ...window_(0), height: 2.4 }
    const plan = room([run], [door(), glass])
    const at = (height: number) =>
      windowCover(plan.walls[2]!, plan.openings[1]!, fixtureObstacles(plan.items!, 'ground').map((o) => ({ ...o, height })))
    expect(at(0.8).by).toEqual([])
    expect(at(0.8).covered).toBe(0)
    expect(at(1.6).by.map((b) => b.id)).toEqual(['run'])
  })
})

describe('the turning space a room\'s free floor holds (use/turning-space)', () => {
  it('is the widest circle clear of the walls, and of the fixtures', () => {
    const empty = floorOf(room())
    expect(round(turningSpace(empty.polygon, empty.holes, []).diameter)).toBeCloseTo(2.8, 2)
    // A 0.8 m deep run across the middle of the room leaves 1.0 m either side of it.
    const plan = room([{ id: 'island', kind: 'kitchen-run', at: [2, 1.5], size: [3.8, 0.8], height: 0.9 }])
    const { polygon, holes } = floorOf(plan)
    expect(turningSpace(polygon, holes, fixtureObstacles(plan.items!, 'ground')).diameter).toBeCloseTo(1, 2)
  })
})

describe('the floor in front of and beside a fixture (use/space-by-fixture)', () => {
  it('measures straight out from its front and its sides to the walls', () => {
    const plan = room([wc([2, 0.4])]) // x 1.8 to 2.2, y 0.1 to 0.7
    const { polygon, holes } = floorOf(plan)
    const space = fixtureSpace(plan.items![0]!, polygon, holes, fixtureObstacles(plan.items!, 'ground'))
    expect([round(space.front), round(space.left), round(space.right)]).toEqual([2.2, 1.7, 1.7])
  })

  it('stops at another fixture, and turns with the fixture', () => {
    const basin: Item = { id: 'basin', kind: 'basin', at: [2.65, 0.3], size: [0.5, 0.4], height: 0.85 }
    const plan = room([wc([2, 0.4]), basin]) // the basin from x 2.4: 0.2 m to the right of the toilet
    const { polygon, holes } = floorOf(plan)
    const obstacles = fixtureObstacles(plan.items!, 'ground')
    expect(round(fixtureSpace(plan.items![0]!, polygon, holes, obstacles).right)).toBe(0.2)
    // Turned to face -X with its back on the right wall (x 3.9): its front is at x 3.3.
    const turned = room([wc([3.6, 1.5], 90)])
    const space = fixtureSpace(turned.items![0]!, floorOf(turned).polygon, [], fixtureObstacles(turned.items!, 'ground'))
    expect(round(space.front)).toBe(3.2)
  })
})

describe('the way through a room (use/passage-width)', () => {
  /** The room with its door in w1 and a 0.9 m doorless opening in w3 at the far end. */
  const through = (items: Item[] = []): FloorPlan => room(items, [door(), { id: 'o2', wall: 'w3', type: 'opening', offset: 0.5, width: 0.9, sill: 0, height: 2.1 }])
  const mouths = (plan: FloorPlan) => {
    const { polygon, holes } = floorOf(plan)
    return { polygon, holes, a: openingMouth(plan.walls[0]!, plan.openings[0]!, polygon)!, b: openingMouth(plan.walls[2]!, plan.openings[1]!, polygon)! }
  }

  it('is no narrower than its doorways in an empty room', () => {
    const plan = through()
    const { polygon, holes, a, b } = mouths(plan)
    const way = passageWidth(polygon, holes, [], a, b)!
    expect(way.atDoorway).toBe(true)
    expect(way.width).toBeGreaterThan(0.85)
  })

  it('finds the narrowest point between a fixture and a wall, and names the fixture', () => {
    // A bath from x 0.1 to 3.3 across the middle: the way round it is 0.6 m wide, beside the right wall.
    const bath: Item = { id: 'bath', kind: 'bath', at: [1.7, 1.5], size: [3.2, 0.7], height: 0.55 }
    const plan = through([bath])
    const { polygon, holes, a, b } = mouths(plan)
    const way = passageWidth(polygon, holes, fixtureObstacles(plan.items!, 'ground'), a, b)!
    expect(way.width).toBeGreaterThan(0.56)
    expect(way.width).toBeLessThanOrEqual(0.6 + 1e-9)
    expect(way.beside).toEqual({ fixtures: ['bath'], wall: true })
    expect(way.atDoorway).toBe(false)
    expect(way.at.x).toBeGreaterThan(3.3)
  })

  it('is null when a fixture closes the way, and reaches a point mouth inside the room', () => {
    const wall: Item = { id: 'run', kind: 'kitchen-run', at: [2, 1.5], size: [3.8, 0.6], height: 0.9 }
    const plan = through([wall])
    const { polygon, holes, a, b } = mouths(plan)
    expect(passageWidth(polygon, holes, fixtureObstacles(plan.items!, 'ground'), a, b)).toBeNull()
    const toMiddle = passageWidth(polygon, holes, fixtureObstacles(plan.items!, 'ground'), a, pointMouth({ x: 2, y: 0.6 }))
    expect(toMiddle).not.toBeNull()
  })

  it('opens a dividing line along the room\'s outline', () => {
    const plan = room()
    plan.walls[2] = { ...plan.walls[2]!, virtual: true }
    const { polygon } = floorOf(plan)
    const mouth = lineMouth(plan.walls[2]!, polygon)!
    expect(Math.abs(mouth[0].x - mouth[1].x)).toBeCloseTo(3.8, 1)
    expect(lineMouth(plan.walls[0]!, polygon)).toBeNull()
  })
})

describe('every indicator', () => {
  it('says what it measures and names a figure of Grid\'s own from the table, which says it is not a code figure', () => {
    for (const [code, entry] of Object.entries(USE_INDICATORS)) {
      expect(code).toMatch(/^use\//)
      expect(entry.measures.length, code).toBeGreaterThan(20)
      expect(TOLERANCES[entry.figure].decides, code).toMatch(/^Grid's own size, not a code figure\./)
    }
    expect(INDICATOR_NOTE).toMatch(/^An indicator/)
    expect(INDICATOR_NOTE).toContain('not a rule')
  })
})
