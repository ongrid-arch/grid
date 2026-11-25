/**
 * CNT-16 (C25, lab EL-6): columns as things of their own, and a structural grid.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { planAreaFigures, MEASURES } from '../areas'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { columnArea, columnFootprint, columnFloorIds, columnRise, roomColumnArea } from '../columns'
import { validatePlan } from '../validate'
import { planForFloor } from '../floors'
import { buildFloorPlan } from '../floorplan'
import { buildDimensions } from '../dimensions'
import { planGrid, gridLetter } from '../structuralGrid'
import { buildScene } from '../scene3d'
import { OFFICE, openOffice, warehouse } from '../../test-support/columns'
import { area } from '../vec2'

describe('a column comes off the room it stands in (EL-6)', () => {
  it('measures the open office with three columns at 89.68 m², not 90.09', () => {
    const plan = openOffice()
    const index = indexPlan(plan)
    const room = plan.rooms[0]!
    expect(roomColumnArea(room, index)).toBeCloseTo(3 * OFFICE.column * OFFICE.column, 9)
    expect(roomArea(room, index)).toBeCloseTo(90.09 - 0.4107, 9)
    expect(roomArea(room, index).toFixed(2)).toBe('89.68')
    const same = parseFloorPlan({ ...plan, columns: undefined })
    expect(roomArea(same.rooms[0]!, indexPlan(same)).toFixed(2)).toBe('90.09')
  })

  it('says in the net area\'s rule that columns are taken off, and in a note how much', () => {
    expect(MEASURES.net.measures).toContain('the columns standing in it')
    const figures = planAreaFigures(openOffice())
    expect(figures.net.area!.toFixed(2)).toBe('89.68')
    expect(figures.net.rule.measures).toContain('columns')
    const floor = figures.floors[0]!
    expect(floor.columns).toBeCloseTo(0.4107, 9)
    expect(floor.rooms[0]!.columns).toEqual({ area: expect.closeTo(0.4107, 9), ids: ['c1', 'c2', 'c3'] })
    expect(figures.notes.some((note) => note.startsWith('0.41 m² of floor under 3 columns is taken off'))).toBe(true)
    // The floor under the columns stays in the gross figures: gross external = net + columns + walls + unclaimed.
    expect(floor.grossExternal! - (floor.net + floor.columns + floor.walls! + floor.unclaimed! - floor.offSpace!)).toBeCloseTo(0, 6)
  })

  it('takes off only the part of a column that stands inside the room, and a round one as a circle', () => {
    // c1 half into the wall w1 (its inside face at y = 0.1): only half of it is in the room.
    const plan = openOffice({ columns: [{ id: 'c1', shape: 'square', width: 0.4, at: [3, 0.1] }, { id: 'c2', shape: 'round', width: 0.5, at: [5, 5] }] })
    const index = indexPlan(plan)
    expect(roomColumnArea(plan.rooms[0]!, index)).toBeCloseTo(0.4 * 0.2 + (Math.PI * 0.25 * 0.25), 9)
    expect(columnArea({ shape: 'round', width: 0.5 })).toBeCloseTo(Math.PI * 0.0625, 12)
    expect(columnFootprint({ id: 'x', shape: 'square', width: 1, depth: 2, at: [0, 0], turn: 90 }).map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6])).toEqual([[1, -0.5], [1, 0.5], [-1, 0.5], [-1, -0.5]])
  })

  it('takes a column on a room line off each room it stands in, clipped to each (CNT-33)', () => {
    const wall = (id: string, a: [number, number], b: [number, number], kind = 'exterior') => ({ id, start: a, end: b, thickness: 0.2, height: 2.7, kind })
    const two = (columns: unknown[]) =>
      parseFloorPlan({
        walls: [
          wall('wa', [0, 0], [5, 0]), wall('wb', [5, 0], [10, 0]), wall('re', [10, 0], [10, 5]),
          wall('wc', [10, 5], [5, 5]), wall('wd', [5, 5], [0, 5]), wall('le', [0, 5], [0, 0]),
          wall('p', [5, 0], [5, 5], 'interior'),
        ],
        rooms: [
          { id: 'ra', name: 'Nave', boundary: ['wa', 'p', 'wd', 'le'], use: 'living' },
          { id: 'rb', name: 'Aisle', boundary: ['wb', 're', 'wc', 'p'], use: 'living' },
        ],
        openings: [],
        columns,
      })
    // 1 m square pier centred on the party wall: 0.4 m² stands in each room, 0.2 m² in the wall.
    const on = two([{ id: 'c1', shape: 'square', width: 1, at: [5, 2.5] }])
    const index = indexPlan(on)
    expect(roomColumnArea(on.rooms[0]!, index)).toBeCloseTo(0.4, 9)
    expect(roomColumnArea(on.rooms[1]!, index)).toBeCloseTo(0.4, 9)
    // One whose middle is in the nave but which reaches into the aisle: each room its own part.
    const near = two([{ id: 'c1', shape: 'square', width: 1, at: [4.8, 2.5] }])
    const nearIndex = indexPlan(near)
    expect(roomColumnArea(near.rooms[0]!, nearIndex)).toBeCloseTo(0.6, 9)
    expect(roomColumnArea(near.rooms[1]!, nearIndex)).toBeCloseTo(0.2, 9)
    // The net total is the same however the column stands: less the floor it covers inside the rooms.
    const total = (plan: ReturnType<typeof two>) => planAreaFigures(plan).net.area!
    const bare = two([])
    expect(total(bare) - total(on)).toBeCloseTo(0.8, 9)
    const listed = planAreaFigures(on).floors[0]!.rooms
    expect(listed.map((r) => r.columns)).toEqual([
      { area: expect.closeTo(0.4, 9), ids: ['c1'] },
      { area: expect.closeTo(0.4, 9), ids: ['c1'] },
    ])
  })

  it('refuses a round column with a depth, and leaves out one on a floor the plan does not have', () => {
    expect(() => openOffice({ columns: [{ id: 'c1', shape: 'round', width: 0.4, depth: 0.4, at: [3, 3] }] })).toThrow(/no depth/)
    const plan = openOffice({ columns: [{ id: 'c1', shape: 'square', width: 0.4, at: [3, 3], floor: 'first' }, { id: 'w1', shape: 'square', width: 0.4, at: [4, 4] }] })
    const { issues } = validatePlan(plan)
    expect(issues.filter((i) => i.code.startsWith('plan/column')).map((i) => [i.code, i.id, i.severity])).toEqual([
      ['plan/column-unknown-floor', 'c1', 'error'],
      ['plan/column-duplicate-id', 'w1', 'error'],
    ])
    expect(roomArea(plan.rooms[0]!, indexPlan(plan)).toFixed(2)).toBe('90.09')
    // The wall that shares the column's id is not left out with it.
    expect(validatePlan(plan).broken.has('w1')).toBe(false)
  })
})

describe('a column through floors (LVL-5\'s `through`)', () => {
  const twoFloors = () => {
    const office = openOffice()
    const upper = office.walls.map((wall) => ({ ...wall, id: `u${wall.id}`, floor: 'first' }))
    return parseFloorPlan({
      ...office,
      floors: [{ id: 'ground', name: 'Ground', level: 0, height: 3 }, { id: 'first', name: 'First', level: 1, height: 3 }],
      walls: [...office.walls, ...upper],
      rooms: [...office.rooms, { id: 'r2', name: 'Upper office', use: 'office', floor: 'first', boundary: upper.map((wall) => wall.id) }],
      columns: [{ id: 'c1', shape: 'square', width: 0.4, at: [5, 5], through: 'first' }],
    })
  }

  it('stands on each floor it rises through, comes off a room on each, and rises from its foot to the top floor\'s height', () => {
    const plan = twoFloors()
    expect(columnFloorIds(plan, plan.columns![0]!)).toEqual(['ground', 'first'])
    const figures = planAreaFigures(plan)
    expect(figures.floors.map((f) => f.columns.toFixed(2))).toEqual(['0.16', '0.16'])
    const first = planForFloor(plan, 'first')
    expect(first.columns!.map((c) => [c.id, c.floor, c.through])).toEqual([['c1', 'first', undefined]])
    // Ground floor at 0, 3 m clear, a 0.25 m slab: the first floor at 3.25, 3 m clear.
    expect(columnRise(plan, plan.columns![0]!)).toBeCloseTo(6.25, 9)
  })

  it('says a through that names no floor above, and stands on its own floor only', () => {
    const plan = parseFloorPlan({ ...twoFloors(), columns: [{ id: 'c1', shape: 'square', width: 0.4, at: [5, 5], floor: 'first', through: 'ground' }] })
    expect(validatePlan(plan).issues.filter((i) => i.code === 'plan/column-through-floor').map((i) => i.message)).toEqual([
      'Column "c1" rises through floor "ground", which is not above its own floor "first", so it stands on its own floor only. No floor is above "first".',
    ])
    expect(columnFloorIds(plan, plan.columns![0]!)).toEqual(['first'])
  })

  it('is raised once in 3D, whole, from its own floor', () => {
    const plan = twoFloors()
    const ground = buildScene(planForFloor(plan, 'ground'))
    const first = buildScene(planForFloor(plan, 'first'))
    expect(ground.columns!.map((c) => [c.id, c.bottom, Math.round(c.top * 1e6) / 1e6])).toEqual([['c1', 0, 6.25]])
    expect(first.columns).toEqual([])
  })
})

describe('the drawing holds the columns and the structural grid (CNT-16)', () => {
  it('draws each column with its room, and the grid\'s lines with their names, past the outermost line across them', () => {
    const drawing = buildFloorPlan(warehouse())
    expect(drawing.columns!.map((c) => [c.id, c.room])).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`c${n}`, 'r1']))
    expect(area(drawing.columns![0]!.outline)).toBeCloseTo(0.16, 9)
    const grid = drawing.grids![0]!
    expect(grid.lines.map((line) => line.name)).toEqual(['1', '2', '3', '4', '5', 'A', 'B', 'C'])
    expect(grid.lines[0]).toMatchObject({ from: { x: 0, y: -1.5 }, to: { x: 0, y: 21.5 } })
    expect(grid.lines[5]).toMatchObject({ from: { x: -1.5, y: 0 }, to: { x: 31.5, y: 0 } })
    // Framed with the drawing.
    expect(drawing.bounds.min).toEqual({ x: -1.5, y: -1.5 })
  })

  it('dimensions the grid line to line and in all, on the centre lines', () => {
    const dims = buildDimensions(buildFloorPlan(warehouse())).filter((d) => d.kind === 'grid')
    expect(dims.map((d) => [d.id, Math.round(d.value * 1000) / 1000])).toEqual([
      ['grid:main:x:1-2', 7.5], ['grid:main:x:2-3', 7.5], ['grid:main:x:3-4', 7.5], ['grid:main:x:4-5', 7.5], ['grid:main:x:overall', 30],
      ['grid:main:y:A-B', 10], ['grid:main:y:B-C', 10], ['grid:main:y:overall', 20],
    ])
    for (const d of dims) expect(d.measuredTo).toEqual(['centre-line', 'centre-line'])
  })

  it('names lines as stated, turns the grid, and letters past Z', () => {
    const grid = planGrid({ id: 'g', origin: [1, 1], turn: 90, x: { spacing: [5], names: ['A1', 'A2'] }, y: { spacing: [] } })
    expect(grid.lines.map((l) => l.name)).toEqual(['A1', 'A2', 'A'])
    // Turned a quarter: the grid's x runs up the plan, so line A2 lies at y = 6 and runs from x = 2.5.
    expect([grid.lines[1]!.from.x, grid.lines[1]!.from.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([2.5, 6])
    expect([0, 25, 26, 27, 51, 52].map(gridLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })

  it('refuses names that do not match the lines, or repeat', () => {
    expect(() => warehouse({ grids: [{ id: 'g', origin: [0, 0], x: { spacing: [1], names: ['1'] }, y: { spacing: [] } }] })).toThrow(/2 lines/)
    expect(() => warehouse({ grids: [{ id: 'g', origin: [0, 0], x: { spacing: [1], names: ['A', 'B'] }, y: { spacing: [], names: ['A'] } }] })).toThrow(/same name/)
  })

  it('draws a grid on the floors it names, and says one it names that the plan does not have', () => {
    const plan = warehouse({ grids: [{ id: 'g', origin: [0, 0], floors: ['ground', 'roof'], x: { spacing: [5] }, y: { spacing: [5] } }] })
    expect(buildFloorPlan(planForFloor(plan, 'ground')).grids!.map((g) => g.id)).toEqual(['g'])
    expect(validatePlan(plan).issues.filter((i) => i.code === 'plan/grid-unknown-floor').map((i) => i.severity)).toEqual(['warning'])
  })

  it('changes nothing in a plan with no columns and no grid', () => {
    const plain = buildFloorPlan(parseFloorPlan({ ...openOffice(), columns: undefined }))
    expect('columns' in plain).toBe(false)
    expect('grids' in plain).toBe(false)
  })
})
