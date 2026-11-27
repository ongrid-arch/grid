/**
 * WRT-83: structural grids, straight or radial, written as rooms text lines, the columns set out
 * on them, in a ring or at a crossing, a column with no floor on the level-0 floor, and rooms
 * sized in planning modules; and all of it read back the same way.
 */
import { describe, expect, it } from 'vitest'
import { safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

const HALL = ['walls outside 0.3 inside 0.1 height 4', 'room hall "Hall" storage 30 x 20 at 0,0', 'door d1 in hall south, centred, 1.2 wide, opens in']
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HALL, ...lines].join('\n'))
const plan = (...lines: string[]): FloorPlan => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return safeParseFloorPlan(result.plan)!
}
const refused = (...lines: string[]): string => {
  const result = write(...lines)
  expect(result.plan).toBeNull()
  return result.problems[0]!.message
}
const at = (p: FloorPlan): Record<string, number[]> => Object.fromEntries((p.columns ?? []).map((c) => [c.id, c.at.map((v) => Math.round(v * 1000) / 1000)]))

describe('the grid line', () => {
  it('writes a straight grid with its spacings, repeats, names, turn and floors', () => {
    const grids = plan('grid G1 "Main" at 1,1 x 4@7.5 names 1 2 3 4 5 y 6 8 floors ground').grids
    expect(grids).toEqual([{ id: 'G1', name: 'Main', origin: [1, 1], floors: ['ground'], x: { spacing: [7.5, 7.5, 7.5, 7.5], names: ['1', '2', '3', '4', '5'] }, y: { spacing: [6, 8] } }])
    expect(plan('grid T turn 15 x 6 y 6').grids![0]).toMatchObject({ origin: [0, 0], turn: 15 })
  })

  it('writes a radial grid from its rings and rays, as ranges or steps', () => {
    const grid = plan('grid P polar at 15,10 rings 3 2@2.5 rays 0 to 315 every 45 names 1 2 3 4 5 6 7 8').grids![0]!
    expect(grid).toEqual({ id: 'P', origin: [15, 10], x: { spacing: [45, 45, 45, 45, 45, 45, 45], names: ['1', '2', '3', '4', '5', '6', '7', '8'] }, y: { spacing: [2.5, 2.5] }, polar: { radius: 3 } })
    expect(plan('grid Q polar rings 4 8 rays 30 60 90').grids![0]).toMatchObject({ turn: 30, x: { spacing: [30, 30] }, y: { spacing: [4] }, polar: { radius: 4 } })
  })

  it('takes a raw grid as the plan file holds it', () => {
    expect(plan('raw grid {"id": "R", "origin": [0, 0], "x": {"spacing": [5]}, "y": {"spacing": [5]}}').grids).toEqual([{ id: 'R', origin: [0, 0], x: { spacing: [5] }, y: { spacing: [5] } }])
  })

  it('refuses what it cannot read', () => {
    expect(refused('grid')).toMatch(/^Line 4: a grid line starts with the grid's id/)
    expect(refused('grid G x 6')).toMatch(/^Line 4: a grid says the spacing of its x lines and of its y lines/)
    expect(refused('grid G wide x 6 y 6')).toMatch(/^Line 4: 'wide' is not a word a grid line takes/)
    expect(refused('grid G x y 6')).toMatch(/^Line 4: 'x' takes its values one by one/)
    expect(refused('grid P polar rings 4 8 x 6')).toMatch(/^Line 4: a radial grid says its rings and its rays/)
    expect(refused('grid P polar rings 8 4 rays 0 90')).toMatch(/^Line 4: the rings of a radial grid go outwards or round in order/)
    expect(refused('grid P polar rings 4 rays 0 to 360 every 90')).toMatch(/^Line 4: the grid would not be read: its x.spacing The rays of a radial grid go round less than a full turn/)
    expect(refused('grid G x 6 y 6', 'grid G x 5 y 5')).toBe("Line 5: the grid 'G' is written on line 4 too; each grid has an id of its own.")
    const unknown = compileRoomsText(['floor ground "Ground"', ...HALL, 'grid G x 6 y 6 floors roof'].join('\n'))
    expect(unknown.problems[0]!.message).toBe("Line 5: the plan has no floor 'roof'; its floors are ground.")
  })
})

describe('columns on a grid', () => {
  it('stands a column at every crossing of a grid, written before or after it', () => {
    const before = plan('columns c round 0.4 on grid G', 'grid G at 2,2 x 2@6 y 6')
    expect(Object.keys(at(before))).toEqual(['c-1-A', 'c-2-A', 'c-3-A', 'c-1-B', 'c-2-B', 'c-3-B'])
    expect(at(before)['c-3-B']).toEqual([14, 8])
    expect(before.columns![0]).toEqual({ id: 'c-1-A', shape: 'round', width: 0.4, at: [2, 2] })
  })

  it('stands one column at a crossing, either way round, with or without its id', () => {
    const p = plan('grid G at 2,2 x 6@4 y 3@5', 'column at grid 7/B 0.4', 'column k1 0.3 at grid G C/2', 'column 0.5 at grid 3/A on ground')
    expect(at(p)).toEqual({ 'c-7-B': [26, 7], k1: [6, 12], 'c-3-A': [10, 2] })
  })

  it('turns a square column with a turned grid, and as a radial grid\'s ray', () => {
    const turned = plan('grid T turn 30 x 6 y 6', 'columns t 0.3 x 0.6 on grid T')
    expect(turned.columns!.every((c) => c.turn === 30)).toBe(true)
    const radial = plan('grid P polar at 15,10 rings 4 rays 0 90 135', 'columns p 0.4 on grid P')
    expect(radial.columns!.map((c) => [c.id, c.turn])).toEqual([['p-1-A', undefined], ['p-2-A', undefined], ['p-3-A', 135]])
    expect(at(radial)['p-2-A']).toEqual([15, 14])
  })

  it('refuses a grid the text does not have, and a crossing it does not have', () => {
    expect(refused('column at grid 7/B 0.4')).toMatch(/^Line 4: the column line names a grid, and the text writes none/)
    expect(refused('grid G x 6 y 6', 'columns c 0.4 on grid H')).toBe("Line 5: the text has no grid 'H'; its grids are G.")
    expect(refused('grid G x 6 y 6', 'column at grid 7/B 0.4')).toBe("Line 5: '7/B' is no crossing on the grid G: its x lines are 1, 2 and its y lines A, B.")
    expect(refused('grid G x 6 y 6', 'grid H at 10,10 x 6 y 6', 'column at grid 1/A 0.4')).toBe("Line 6: '1/A' is a crossing on more than one grid (G, H): write 'at grid <id> 1/A'.")
    expect(refused('grid G x 6 y 6', 'column c1 0.4 at grid')).toMatch(/^Line 5: a column on a grid says where/)
  })
})

describe('a ring of columns', () => {
  it('sets out n columns evenly round a centre, square ones facing it', () => {
    const p = plan('columns ring 4 radius 5 round 0.2 at 15,10', 'columns s ring 4 radius 2 start 45 0.3 at 15,10')
    expect(at(p)).toMatchObject({ 'ring-1': [20, 10], 'ring-2': [15, 15], 'ring-3': [10, 10], 'ring-4': [15, 5] })
    expect(p.columns!.filter((c) => c.id.startsWith('s-')).map((c) => c.turn)).toEqual([45, 135, 225, 315])
  })

  it('stands round the text\'s one radial grid when it names no centre', () => {
    const p = plan('grid P polar at 15,10 rings 5.9 rays 0 to 315 every 45', 'columns ring 8 radius 5.9 round 0.2')
    expect(p.columns).toHaveLength(8)
    expect(at(p)['ring-3']).toEqual([15, 15.9])
    expect(refused('columns ring 8 radius 5.9 round 0.2')).toMatch(/^Line 4: a ring of columns says its centre with 'at x,y'/)
    expect(refused('columns r ring 8 round 0.2 at 3,3')).toMatch(/^Line 4: a ring of columns says how many and how far out/)
  })
})

describe('a column with no floor', () => {
  it('stands on the floor at level 0 when the text has no ground floor', () => {
    const text = ['walls outside 0.3 inside 0.1 height 3', 'column early 0.4 at 2,2', 'raw column {"id": "loose", "shape": "round", "width": 0.3, "at": [4, 4]}', 'floor B1 "Basement" level -1', 'room store "Store" storage 10 x 10 at 0,0', 'floor L0 "Lobby" level 0', 'room lobby "Lobby" storage 10 x 10 at 0,0', 'floor L1 "First" level 1', 'room loft "Loft" storage 10 x 10 at 0,0']
    const result = compileRoomsText(text.join('\n'))
    expect(result.problems).toEqual([])
    expect(result.plan!.columns!.map((c) => [c.id, c.floor])).toEqual([['early', 'L0'], ['loose', 'L0']])
  })
})

describe('a planning module', () => {
  it('sizes rooms and places columns in modules', () => {
    const result = compileRoomsText(['module 1.2', 'walls outside 0.3 inside 0.1 height 3', 'room a "A" office 5mod x 4mod at 0,0', 'room b "B" office 3mod x 4mod east of a', 'column c1 0.3 at 5mod,2mod'].join('\n'))
    expect(result.problems).toEqual([])
    const p = safeParseFloorPlan(result.plan)!
    expect(at(p)).toEqual({ c1: [6, 2.4] })
    const metric = compileRoomsText(['walls outside 0.3 inside 0.1 height 3', 'room a "A" office 6 x 4.8 at 0,0', 'room b "B" office 3.6 x 4.8 east of a', 'column c1 0.3 at 6,2.4'].join('\n'))
    expect(p.walls).toEqual(safeParseFloorPlan(metric.plan)!.walls)
  })

  it('refuses a length in modules with no module, and a second module line', () => {
    expect(compileRoomsText(['walls outside 0.3 inside 0.1 height 3', 'room a "A" office 5mod x 4mod at 0,0'].join('\n')).problems[0]!.message).toMatch(/'5mod' is a length in modules, and the text sets no module/)
    expect(compileRoomsText(['module 1.2', 'module 0.6', 'room a "A" office 5 x 4 at 0,0'].join('\n')).problems[0]!.message).toMatch(/^line 2: the text sets its planning module on line 1 too/i)
  })
})

describe('reading grids back', () => {
  it('writes grid lines, and writing them again gives the same grids and columns', () => {
    const first = plan('grid G1 "Main" at 1,1 x 4@7.5 y 6 8 names A B C floors ground', 'grid P polar at 15,10 rings 3 5.5 rays 0 to 270 every 90', 'columns c 0.4 on grid G1', 'raw grid {"id": "G2", "name": "Grid \\"B\\"", "origin": [0, 0], "x": {"spacing": [5]}, "y": {"spacing": [5]}}')
    const back = readRoomsText(first)
    expect(back.text).toContain('grid G1 "Main" at 1,1 x 7.5 7.5 7.5 7.5 y 6 8 names A B C floors ground')
    expect(back.text).toContain('grid P polar at 15,10 rings 3 5.5 rays 0 90 180 270')
    expect(back.text).toContain('raw grid {"id":"G2"')
    const again = compileRoomsText(back.text)
    expect(again.problems).toEqual([])
    const second = safeParseFloorPlan(again.plan)!
    expect(second.grids).toEqual(first.grids)
    expect(second.columns).toEqual(first.columns)
  })
})
