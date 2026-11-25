/**
 * WRT-38: a plan drawn from a survey, its walls placed by the faces the tape ran along (HND-11),
 * stays as taped through Grid's edits. Moving a side carries the walls placed by their faces that
 * end on it; the answer of a change is measured on the plan as its file will be read; and one
 * wall's thickness is set in one call (`grid_change_wall`), a wall placed by its face keeping it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { tapedLengths, type TapedRow } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { applyPatch, changeWallThickness, moveRoomSide, readingAfter, type Patch } from '../edits'
import { changeType } from '../types'

type Pair = [number, number]
type Raw = Record<string, unknown>
type RawPlan = Raw & { walls: Raw[] }

/** A wall placed by its left face, as a survey taped round the inside of the rooms gives it. */
const byFace = (id: string, start: Pair, end: Pair, thickness?: number): Raw => ({ id, start, end, face: 'left', ...(thickness === undefined ? {} : { thickness }), height: 2.7, kind: 'exterior' })

/**
 * Two rooms side by side, taped inside: the kitchen 4 m by 3 m, the lounge 3 m by 3 m, a 0.1 m
 * wall between them on its centre line. The outside walls are placed by their inside faces; the
 * east one states no thickness, the others 0.3 m.
 */
function flat(): RawPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      byFace('s', [0, 0], [7.1, 0], 0.3),
      byFace('e', [7.1, 0], [7.1, 3]),
      byFace('n', [7.1, 3], [0, 3], 0.3),
      byFace('w', [0, 3], [0, 0], 0.3),
      { id: 'mid', start: [4.05, 0], end: [4.05, 3], thickness: 0.1, height: 2.7, kind: 'interior' },
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', use: 'kitchen', boundary: ['s', 'mid', 'n', 'w'] },
      { id: 'lounge', name: 'Lounge', use: 'living', boundary: ['s', 'e', 'n', 'mid'] },
    ],
    openings: [],
    taped: [
      { room: 'kitchen', wall: 's', length: 4 },
      { room: 'kitchen', wall: 'w', length: 3 },
      { room: 'lounge', wall: 's', length: 3 },
      { room: 'lounge', wall: 'e', length: 3 },
    ],
  }
}

const nets = (plan: FloorPlan): Record<string, number | null> => Object.fromEntries(planAreas(surveyPlan(plan)).floors.flatMap((floor) => floor.rooms.map((room) => [room.id, room.net === null ? null : Math.round(room.net * 1e4) / 1e4])))
const ends = (plan: FloorPlan): Record<string, number[]> => Object.fromEntries(plan.walls.map((w) => [w.id, [...w.start, ...w.end, w.thickness].map((v) => Math.round(v * 1e6) / 1e6)]))

/** The plan the answer measures, and the plan the written file reads as: they must be the same. */
function bothReadings(raw: RawPlan, make: (plan: FloorPlan) => Patch): { answer: FloorPlan; file: FloorPlan; written: RawPlan } {
  const plan = parseFloorPlan(raw)
  const patch = make(plan)
  const written = applyPatch(raw, patch)
  return { answer: readingAfter(plan, patch), file: parseFloorPlan(written), written }
}

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

describe('moving a side of rooms drawn by their inside faces', () => {
  it('carries the walls placed by their faces that end on the side, so none is left short', () => {
    const { answer, file, written } = bothReadings(flat(), (plan) => moveRoomSide(surveyPlan(plan), 'lounge', 'east', 0.8))
    const wall = (id: string) => written.walls.find((w) => w['id'] === id)!
    // The south and north faces run on to the moved east face, 0.8 m further east.
    expect(wall('s')).toMatchObject({ start: [0, 0], end: [7.9, 0], face: 'left' })
    expect(wall('n')).toMatchObject({ start: [7.9, 3], end: [0, 3], face: 'left' })
    expect(wall('e')).toMatchObject({ start: [7.9, 0], end: [7.9, 3], face: 'left' })
    expect(wall('e')).not.toHaveProperty('thickness')
    expect(ends(answer)).toEqual(ends(file))
    expect(nets(file)).toEqual({ kitchen: 12, lounge: 11.4 })
  })

  it('the answer says the walls that followed, and every taped length but the moved room\'s agrees', async () => {
    b = bench({ 'flat.json': flat() })
    const moved = await b.call('grid_move_room_side', { plan: 'flat.json', room: 'lounge', side: 'east', by: 0.8 })
    expect(moved.isError).toBe(false)
    expect(moved.text).toMatch(/walls that end on it followed: "s" and "n"/)
    const rows = (moved.data?.['taped'] as TapedRow[]).map((row) => [row.room, row.walls[0], row.state])
    expect(rows).toEqual([['kitchen', 's', 'agrees'], ['kitchen', 'w', 'agrees'], ['lounge', 's', 'differs'], ['lounge', 'e', 'agrees']])
  })
})

describe('the answer of a change is the file as it will be read', () => {
  it('a wall placed by its face that takes a type\'s thickness keeps its face in the answer as in the file', () => {
    const { answer, file, written } = bothReadings(flat(), (plan) => changeType(surveyPlan(plan), { of: 'wall', id: 'thick', set: { name: 'Thick outside wall', thickness: 0.5 }, parts: ['s', 'e'] }))
    expect(written.walls.find((w) => w['id'] === 's')).toMatchObject({ start: [0, 0], end: [7.1, 0], face: 'left', wallType: 'thick' })
    expect(file.walls.find((w) => w.id === 's')!.start[1]).toBeCloseTo(-0.25, 9)
    expect(ends(answer)).toEqual(ends(file))
    expect(nets(answer)).toEqual(nets(file))
  })
})

describe('one wall\'s thickness (grid_change_wall)', () => {
  it('a wall placed by its face keeps its face and grows away from the room', () => {
    const { answer, file, written } = bothReadings(flat(), (plan) => changeWallThickness(surveyPlan(plan), 's', 0.5))
    expect(written.walls.find((w) => w['id'] === 's')).toEqual({ ...byFace('s', [0, 0], [7.1, 0], 0.5) })
    expect(file.walls.find((w) => w.id === 's')!.start[1]).toBeCloseTo(-0.25, 9)
    expect(ends(answer)).toEqual(ends(file))
    expect(nets(answer)).toEqual({ kitchen: 12, lounge: 9 })
    expect(tapedLengths(answer).map((row) => row.state)).toEqual(['agrees', 'agrees', 'agrees', 'agrees'])
  })

  it('states the thickness of a wall placed by its face that stated none', () => {
    const plan = parseFloorPlan(flat())
    const patch = changeWallThickness(surveyPlan(plan), 'e', 0.25)
    expect(patch.said.join(' ')).toMatch(/Wall "e": 0\.25 m thick, where it stated none \(Grid read 0\.\d\d m\)\. The face its file places it by stays where it is/)
    const after = readingAfter(plan, patch).walls.find((w) => w.id === 'e')!
    expect(after.unstated ?? []).not.toContain('thickness')
    expect(after.start[0]).toBeCloseTo(7.225, 9)
  })

  it('a wall on its centre line keeps its centre line, and a thinner one carries a wall that ended in its body', () => {
    const raw: RawPlan = {
      version: '1',
      units: 'm',
      walls: [
        { id: 's', start: [0, 0], end: [6, 0], thickness: 0.3, height: 2.7, kind: 'exterior' },
        { id: 'e', start: [6, 0], end: [6, 4], thickness: 0.3, height: 2.7, kind: 'exterior' },
        { id: 'n', start: [6, 4], end: [0, 4], thickness: 0.3, height: 2.7, kind: 'exterior' },
        { id: 'w', start: [0, 4], end: [0, 0], thickness: 0.3, height: 2.7, kind: 'exterior' },
        // Drawn to the south wall's inside face, 0.15 m off its centre line.
        { id: 'mid', start: [3, 0.15], end: [3, 4], thickness: 0.1, height: 2.7, kind: 'interior' },
      ],
      rooms: [
        { id: 'a', name: 'Kitchen', use: 'kitchen', boundary: ['s', 'mid', 'n', 'w'] },
        { id: 'b', name: 'Lounge', use: 'living', boundary: ['s', 'e', 'n', 'mid'] },
      ],
      openings: [],
    }
    const { answer, file, written } = bothReadings(raw, (plan) => changeWallThickness(surveyPlan(plan), 's', 0.1))
    expect(written.walls.find((w) => w['id'] === 's')).toMatchObject({ start: [0, 0], end: [6, 0], thickness: 0.1 })
    expect(written.walls.find((w) => w['id'] === 'mid')).toMatchObject({ start: [3, 0], end: [3, 4] })
    expect(ends(answer)).toEqual(ends(file))
  })

  it('refuses a dividing line, a wall the plan lacks and the thickness a wall has', () => {
    const plan = parseFloorPlan({ ...flat(), walls: [...flat().walls, { id: 'line', start: [1, 1], end: [2, 1], virtual: true }] })
    const survey = surveyPlan(plan)
    expect(() => changeWallThickness(survey, 'line', 0.1)).toThrow(/dividing line/)
    expect(() => changeWallThickness(survey, 'nope', 0.1)).toThrow(/no wall "nope"/)
    expect(() => changeWallThickness(survey, 's', 0.3)).toThrow(/already 0\.30 m thick/)
  })

  it('the tool writes the file and answers with the areas and taped lengths grid_check gives after', async () => {
    b = bench({ 'flat.json': flat() })
    const changed = await b.call('grid_change_wall', { plan: 'flat.json', wall: 'e', thickness: 0.4, out: 'thicker.json' })
    expect(changed.isError).toBe(false)
    expect(changed.text).toContain('Wall "e": 0.40 m thick')
    const file = JSON.parse(readFileSync(join(b.folder, 'thicker.json'), 'utf8')) as RawPlan
    expect(file.walls.find((w) => w['id'] === 'e')).toMatchObject({ start: [7.1, 0], end: [7.1, 3], face: 'left', thickness: 0.4 })
    const check = await b.call('grid_check', { plan: 'thicker.json' })
    const states = (rows: unknown): string[] => (rows as TapedRow[]).map((row) => `${row.room} ${row.walls[0]} ${row.state} ${row.drawn?.toFixed(3)}`)
    expect(states(changed.data?.['taped'])).toEqual(states(check.data?.['taped']))
    expect(states(changed.data?.['taped']).every((row) => row.includes('agrees'))).toBe(true)
  })
})
