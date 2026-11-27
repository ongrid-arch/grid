/**
 * WRT-79: the plan's columns written as rooms text lines, one or a grid of them, never as JSON,
 * and read back the same way. A 20 × 12 m hall.
 */
import { describe, expect, it } from 'vitest'
import { safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

const HALL = ['walls outside 0.3 inside 0.1 height 4', 'room hall "Hall" storage 20 x 12 at 0,0', 'door d1 in hall south, centred, 1.2 wide, opens in']
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HALL, ...lines].join('\n'))
const columns = (...lines: string[]): unknown => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return result.plan!.columns
}
const refused = (...lines: string[]): string => {
  const result = write(...lines)
  expect(result.plan).toBeNull()
  return result.problems[0]!.message
}

describe('the column line', () => {
  it('writes square, round, turned and labelled columns', () => {
    expect(columns('column c1 0.4 at 5,6', 'column c2 round 0.5 at 10,6 height 3.5', 'pillar c3 0.3 x 0.6 at 15,6 turn 30 "Steel"')).toEqual([
      { id: 'c1', shape: 'square', width: 0.4, at: [5, 6] },
      { id: 'c2', shape: 'round', width: 0.5, at: [10, 6], height: 3.5 },
      { id: 'c3', shape: 'square', width: 0.3, depth: 0.6, at: [15, 6], turn: 30, label: 'Steel' },
    ])
  })

  it('sets out a grid of columns, row by row from the south-west', () => {
    const grid = columns('columns c round 0.4 at 4,3, count 3 x 2, every 6 x 6') as { id: string; at: number[] }[]
    expect(grid.map((c) => c.id)).toEqual(['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6'])
    expect(grid.map((c) => c.at)).toEqual([[4, 3], [10, 3], [16, 3], [4, 9], [10, 9], [16, 9]])
  })

  it('stands a column on the floor it is written under, or the one on names', () => {
    const text = ['walls outside 0.3 inside 0.1 height 3', 'floor ground "Ground"', 'room hall "Hall" storage 20 x 12 at 0,0', 'column g1 0.4 at 5,6 through first', 'floor first "First" level 1 elevation 3', 'room loft "Loft" storage 20 x 12 at 0,0', 'column f1 0.3 at 10,6', 'column g2 0.4 at 15,6 on ground']
    const result = compileRoomsText(text.join('\n'))
    expect(result.problems).toEqual([])
    expect(result.plan!.columns!.map((c) => [c.id, c.floor, c.through])).toEqual([
      ['g1', undefined, 'first'],
      ['f1', 'first', undefined],
      ['g2', 'ground', undefined],
    ])
  })

  it('refuses what it cannot read, an id twice and a floor the plan has not', () => {
    expect(refused('column c1 at 5,6')).toMatch(/^Line 4: a column says its size/)
    expect(refused('column c1 0.4')).toBe("Line 4: a column says where its middle is: 'at x,y'.")
    expect(refused('column c1 round 0.4 x 0.6 at 5,6')).toBe("Line 4: a round column has one size, its diameter: write 'round 0.4' with no depth.")
    expect(refused('column c1 0.4 at 5,6 tall')).toMatch(/^Line 4: 'tall' is not a word a column line takes. Write 'column <id> \[square\|round\]/)
    expect(refused('columns c 0.4 at 4,3')).toMatch(/^Line 4: a grid of columns says how many/)
    expect(refused('column c1 0.4 at 5,6', 'column c1 0.4 at 9,6')).toBe("Line 5: the id 'c1' is used on line 4 too; columns share one set of ids with walls, rooms, openings and stairs.")
    expect(refused('column hall 0.4 at 5,6')).toMatch(/^Line 4: the id 'hall' is used by another part of the plan/)
    const unknown = compileRoomsText(['floor ground "Ground"', ...HALL, 'column c1 0.4 at 5,6 on roof'].join('\n'))
    expect(unknown.problems[0]!.message).toBe("Line 5: the plan has no floor 'roof'; its floors are ground.")
  })

  it('takes a raw column as the plan file holds it', () => {
    expect(columns('raw column {"id": "k", "shape": "round", "width": 0.6, "at": [3, 3]}')).toEqual([{ id: 'k', shape: 'round', width: 0.6, at: [3, 3] }])
    expect(refused('raw column {"id": "k", "shape": "oval", "width": 0.6, "at": [3, 3]}')).toMatch(/^Line 4: the raw column would not be read: its shape/)
  })
})

describe('reading columns back', () => {
  const plan = (text: string): FloorPlan => {
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    return safeParseFloorPlan(result.plan)!
  }

  it('writes column lines on their floors, and writing them again gives the same columns', () => {
    const text = ['walls outside 0.3 inside 0.1 height 3', 'floor ground "Ground"', 'room hall "Hall" storage 20 x 12 at 0,0', 'columns c round 0.4 at 4,3, count 2 x 1, every 6 through first "RC"', 'column s1 0.3 x 0.5 at 15,6 turn 15 on ground', 'floor first "First" level 1 elevation 3', 'room loft "Loft" storage 20 x 12 at 0,0', 'column f1 0.3 at 10,6 height 2.5']
    const first = plan(text.join('\n'))
    const back = readRoomsText(first)
    expect(back.text).toContain('column c-1 round 0.4 at 4,3 through first "RC"')
    expect(back.text).toContain('column s1 0.3 x 0.5 at 15,6 turn 15 on ground')
    expect(back.text).toMatch(/floor first[^\n]*\n(?:.*\n)*column f1 0.3 at 10,6 height 2.5/)
    expect(plan(back.text).columns).toEqual(first.columns)
  })
})
