/**
 * SHT-22: writing on the drawing and the sketch in rooms text. A two-storey house: on each floor
 * a 2.4 × 5 m room by the west wall (a hall below, a landing above) and a 5 × 5 m room east of
 * it. Every line writes the plan's own `annotations` or `sketch`, which the drawing, the sheet
 * and the DXF export draw.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { buildFloorPlan } from '../../geometry/floorplan'
import { planForFloor } from '../../geometry/floors'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { givenIds, noteLines, noteOfLine, notePart, notePlaceOf, NoteRefused, routeHead, routeShaft } from '../notes'

const HOUSE = [
  'walls outside 0.3 inside 0.1 height 2.7',
  'floor ground "Ground" level 0 height 2.7',
  'room hall "Hall" corridor 2.4 x 5 at 0,0',
  'room living "Living" living 5 x 5 east of hall',
  'door front in hall south, centred, 0.9 wide, opens in',
  'door d0 between hall and living, centred, 0.8 wide',
  'floor first "First" level 1 height 2.7',
  'room landing "Landing" corridor 2.4 x 5 at 0,0',
  'room bed "Bed" bedroom 5 x 5 east of landing',
  'door d1 between landing and bed, centred, 0.8 wide',
]
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HOUSE, ...lines].join('\n'))
const planOf = (...lines: string[]): FloorPlan => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

describe('writing on the drawing in rooms text (SHT-22)', () => {
  it('writes notes, tags, symbols and the key, at a point or in a room, on the floor of their block', () => {
    const plan = planOf(
      'tag "You are here" at 1.2,2',
      'note "Fire extinguisher by the door" in bed id fe-note',
      'symbol entrance at 1.2,-0.5 on ground "Way in"',
      'symbol north at 8,4 turn -30',
      'key',
    )
    expect(plan.annotations).toEqual([
      { id: 'tag-1', kind: 'tag', text: 'You are here', at: [1.2, 2], floor: 'first' },
      { id: 'fe-note', kind: 'note', text: 'Fire extinguisher by the door', room: 'bed' },
      { id: 'symbol-1', kind: 'symbol', text: 'Way in', symbol: 'entrance', at: [1.2, -0.5] },
      { id: 'symbol-2', kind: 'symbol', symbol: 'north', at: [8, 4], floor: 'first', turn: -30 },
      { id: 'key-1', kind: 'key', floor: 'first' },
    ])
  })

  it('takes a line written under the ground floor as on it, which the file leaves unstated (C5)', () => {
    const result = compileRoomsText([...HOUSE.slice(0, 6), 'tag "FE" at 0.5,0.5', ...HOUSE.slice(6)].join('\n'))
    expect(result.problems).toEqual([])
    expect(result.plan!.annotations).toEqual([{ id: 'tag-1', kind: 'tag', text: 'FE', at: [0.5, 0.5] }])
  })

  it('writes sketch lines, shapes, rectangles, arcs and text with their category', () => {
    const plan = planOf(
      'sketch line fence -1,-1 9,-1 on ground',
      'sketch shape garden 0,-1 3,-1 3,-4 on ground',
      'sketch rect street -2,-6 10,-4 on ground id main-street',
      'sketch arc pond at 4,-3 radius 1 start 0 end 180 on ground',
      'sketch text street at 4,-5 "High Street" on ground',
    )
    expect(plan.sketch).toEqual([
      { id: 'sketch-1', kind: 'line', category: 'fence', points: [[-1, -1], [9, -1]] },
      { id: 'sketch-2', kind: 'shape', category: 'garden', points: [[0, -1], [3, -1], [3, -4]] },
      { id: 'main-street', kind: 'rect', category: 'street', from: [-2, -6], to: [10, -4] },
      { id: 'sketch-4', kind: 'arc', category: 'pond', at: [4, -3], radius: 1, start: 0, end: 180 },
      { id: 'sketch-5', kind: 'text', category: 'street', at: [4, -5], text: 'High Street' },
    ])
  })

  it('draws a route as a line with its arrowhead at its end, which the drawing holds', () => {
    const plan = planOf('route 1.2,4 1.2,1 1.2,-1 on ground', 'arrow exit 2,4 2,0')
    const [first, second] = plan.sketch!
    expect(first).toMatchObject({ id: 'route-1', kind: 'line', category: 'route' })
    expect(first!.floor).toBeUndefined()
    expect(first!.points!.slice(0, 3)).toEqual([[1.2, 4], [1.2, 1], [1.2, -1]])
    // The head: a V of two sides 0.4 m long, back up the last leg, either side of it.
    const [left, tip, right] = first!.points!.slice(3)
    expect(tip).toEqual([1.2, -1])
    expect(left![1]).toBeCloseTo(-1 + 0.4 * Math.cos((28 * Math.PI) / 180), 3)
    expect(left![0]).toBeCloseTo(1.2 - 0.4 * Math.sin((28 * Math.PI) / 180), 3)
    expect(right![0]).toBeCloseTo(1.2 + 0.4 * Math.sin((28 * Math.PI) / 180), 3)
    expect(routeShaft(first!)).toEqual([[1.2, 4], [1.2, 1], [1.2, -1]])
    expect(second).toMatchObject({ id: 'route-2', category: 'exit', floor: 'first' })
    // The drawing of the ground floor draws it, head and all, as the sketch it is.
    const drawn = buildFloorPlan(planForFloor(plan, 'ground')).sketch
    expect(drawn.map((s) => s.id)).toEqual(['route-1'])
    expect(drawn[0]!.points).toHaveLength(6)
  })

  it('keeps a short last leg\'s head to half of it, and finds no route in a plain line', () => {
    const head = routeHead([[0, 0], [0.4, 0]])!
    expect(head[0]![0]).toBeCloseTo(0.4 - 0.2 * Math.cos((28 * Math.PI) / 180), 3)
    expect(routeHead([[1, 1], [1, 1]])).toBeNull()
    expect(routeShaft({ kind: 'line', points: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] })).toBeNull()
  })

  it('lists what it placed, by floor, in the answer', () => {
    const result = write('tag "You are here" at 1.2,2', 'route 1,4 1,1', 'tag "FE" in hall')
    expect(result.guesses).toContain('Drawn on the plan, never measured: floor first: 1 tag, 1 route (tag-1, route-1).')
    expect(result.guesses).toContain('Drawn on the plan, never measured: floor ground: 1 tag (tag-2).')
  })

  it('refuses a line it cannot place, naming what to write', () => {
    const problem = (line: string): string => {
      const result = write(line)
      expect(result.plan).toBeNull()
      return result.problems.map((p) => `${p.code}: ${p.message}`).join('\n')
    }
    expect(problem('tag at 1,1')).toMatch(/^rooms\/note: Line 11: a tag needs its text, in quotes\. Write 'tag "<text>" at x,y \| in <room>/)
    expect(problem('note "Exit"')).toMatch(/a note needs its place: at x,y, or in a room/)
    expect(problem('tag "FE" in kitchen')).toMatch(/the plan has no room 'kitchen': its rooms are hall, living, landing, bed/)
    expect(problem('tag "FE" at 1,1 on roof')).toMatch(/the plan has no floor 'roof': its floors are ground, first/)
    expect(problem('symbol at 1,1')).toMatch(/a symbol says which: north or entrance/)
    expect(problem('sketch line 0,0 1,1')).toMatch(/names its category/)
    expect(problem('route 1,1')).toMatch(/a route needs 2 points or more/)
    expect(problem('tag "FE" at 1,1 colour red')).toMatch(/'colour' is not understood on a tag line/)
    expect(problem('tag "A" at 1,1 id x\ntag "B" at 2,2 id x')).toMatch(/rooms\/duplicate-id: Line 12: the id 'x' is used on line 11 already/)
    expect(problem('raw note {"id": "n", "kind": "note"}')).toMatch(/the raw note would not be read/)
  })

  it('takes Grid\'s own JSON in a raw line, as the plan file holds it', () => {
    const plan = planOf('raw note {"id": "n1", "kind": "note", "text": "Kept", "at": [1, 1], "floor": "ground"}', 'raw sketch {"id": "s1", "kind": "line", "category": "Fire Exit", "points": [[0, 0], [1, 1]]}')
    expect(plan.annotations).toEqual([{ id: 'n1', kind: 'note', text: 'Kept', at: [1, 1], floor: 'ground' }])
    expect(plan.sketch).toEqual([{ id: 's1', kind: 'line', category: 'Fire Exit', points: [[0, 0], [1, 1]] }])
  })

  it('reads the annotations and the sketch back as lines, so writing the text again keeps them', () => {
    const plan = planOf(
      'tag "You are here" at 1.2,2',
      'note "Say \\"hello\\" at the desk, it\'s open" in hall',
      'symbol north at 8,4 turn -30 id compass',
      'route exit 1.2,4 1.2,1 on ground',
      'sketch arc pond at 4,-3 radius 1 start 0 end 180 on ground',
      'raw note {"id": "kept", "kind": "tag", "text": "Ground, stated", "at": [1, 1], "floor": "ground"}',
    )
    const back = readRoomsText(plan).text
    expect(back).toContain('tag "You are here" at 1.2,2\n')
    expect(back).toContain('symbol north at 8,4 turn -30 id compass\n')
    expect(back).toContain('route exit 1.2,4 1.2,1 on ground\n')
    expect(back).toContain('sketch arc pond at 4,-3 radius 1 start 0 end 180 on ground\n')
    expect(back).toContain('raw note {"id":"kept"')
    const again = compileRoomsText(back)
    expect(again.problems).toEqual([])
    expect(again.plan!.annotations).toEqual(plan.annotations)
    expect(again.plan!.sketch).toEqual(plan.sketch)
  })

  it('writes an id only when it is not the one Grid would give', () => {
    const plan = parseFloorPlan({
      ...planOf(),
      annotations: [
        { id: 'tag-2', kind: 'tag', text: 'A', at: [1, 1] },
        { id: 'tag-1', kind: 'tag', text: 'B', at: [2, 2] },
        { id: 'tag-3', kind: 'tag', text: 'C', at: [3, 3] },
      ],
    })
    const lines = noteLines(plan, 'ground')
    expect(lines).toEqual(['tag "A" at 1,1 id tag-2', 'tag "B" at 2,2 id tag-1', 'tag "C" at 3,3'])
    expect(givenIds([{ prefix: 'tag', id: 'tag-2' }, { prefix: 'tag', id: 'tag-1' }, { prefix: 'tag' }])).toEqual(['tag-2', 'tag-1', 'tag-3'])
  })

  it('reads one line and places it the same way for a tool', () => {
    const plan = planOf()
    const words = noteOfLine('tag "FE" in living')
    expect(notePart(words, 'fe-1', notePlaceOf(plan))).toEqual({ id: 'fe-1', kind: 'tag', text: 'FE', room: 'living' })
    expect(() => notePart(noteOfLine('tag "FE" at 1,1 in living'), 'x', notePlaceOf(plan))).toThrow(NoteRefused)
  })
})
