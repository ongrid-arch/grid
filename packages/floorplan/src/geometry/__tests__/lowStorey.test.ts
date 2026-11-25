/**
 * LVL-18: a storey too low to stand in and a low door onto a stair or a lift are questioned, and
 * an opening above its walls is told to raise the walls before it is told to come down. The
 * figures, `storeyLowest` and `stairDoorLowest`, are Grid's own and cite no document.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../validate'
import { limit } from '../tolerances'
import { compileRoomsText } from '../../rooms/compile'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { outline, type Point } from '../../test-support/outline'

const RECT: Point[] = [[0, 0], [6, 0], [6, 4], [0, 4]]

/** A closed outline on `floor`, its walls `height` high and renamed with `prefix`. */
function box(prefix: string, floor: string, height: number) {
  const { walls, room } = outline(RECT)
  const rename = (id: string): string => `${prefix}-${id}`
  return {
    walls: walls.map((w) => ({ ...w, id: rename(w.id), height, floor })),
    room: { ...room, id: `${prefix}-room`, name: prefix, boundary: room.boundary.map(rename), floor, use: 'parking' as const }
  }
}

/** Two decks one over the other, each on its own floor with `floors` stating the rest. */
function decks(height: number, floors: readonly Record<string, unknown>[]): FloorPlan {
  const a = box('a', 'p0', height)
  const b = box('b', 'p1', height)
  return parseFloorPlan({
    floors: [
      { id: 'p0', name: 'Deck 0', level: 0, ...floors[0] },
      { id: 'p1', name: 'Deck 1', level: 1, ...floors[1] }
    ],
    walls: [...a.walls, ...b.walls],
    rooms: [a.room, b.room]
  })
}

const asked = (plan: FloorPlan, code: string) => validatePlan(plan).issues.filter((i) => i.code === code)

/** A plan written rooms first, read as the plan file. */
function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

describe('LVL-18 a storey lower than a person stands in', () => {
  it('keeps its figures in the tolerances table', () => {
    expect(limit('storeyLowest')).toBe(2)
    expect(limit('stairDoorLowest')).toBe(1.8)
  })

  it('questions a floor that states a height under 2 m', () => {
    const issues = asked(decks(1.2, [{ height: 1.2 }, { height: 1.2 }]), 'floor/size-question')
    expect(issues.map((i) => i.id)).toEqual(['p0', 'p1'])
    expect(issues[0]!.message).toContain('Floor "p0" states it is 1.20 m high: is that meant? Grid asks about a storey lower than 2.00 m')
  })

  it('leaves a floor stating 2.4 m alone', () => {
    expect(asked(decks(2.4, [{ height: 2.4 }, { height: 2.4 }]), 'floor/size-question')).toEqual([])
  })

  it('leaves a low floor under a roof of its own alone, as a loft', () => {
    const plan = decks(1.2, [{ height: 2.6 }, { height: 1.2, roof: { shape: 'gable', eaves: 1.2, ridge: 3.5, ridgeRuns: 'east-west' } }])
    expect(asked(plan, 'floor/size-question')).toEqual([])
  })

  it('questions a storey its walls make 1.2 m high, in a plan of more than one floor', () => {
    const issues = asked(decks(1.2, [{}, {}]), 'floor/size-question')
    expect(issues.map((i) => i.id)).toEqual(['p0', 'p1'])
    expect(issues[0]!.message).toContain('Floor "p0" states no height, so its storey is 1.20 m high, the height of its tallest wall: is that meant?')
    expect(issues[0]!.severity).toBe('warning')
  })

  it('does not ask about low walls on a plan of one floor', () => {
    const { walls, room } = outline(RECT)
    const plan = parseFloorPlan({ walls: walls.map((w) => ({ ...w, height: 1.2 })), rooms: [room] })
    expect(asked(plan, 'floor/size-question')).toEqual([])
  })

  it('reads the storey from rooms text with no height on its floors', () => {
    const plan = written(
      [
        'walls outside 0.3 inside 0.1 height 1.2',
        'floor p0 "Deck 0" level 0 elevation 0',
        'room d0 "Deck 0" parking 10 x 10',
        'floor p1 "Deck 1" level 1 elevation 1.4',
        'room d1 "Deck 1" parking 10 x 10'
      ].join('\n')
    )
    expect(asked(plan, 'floor/size-question').map((i) => i.id)).toEqual(['p0', 'p1'])
  })
})

describe('LVL-18 a low door onto a stair or a lift', () => {
  const plan = (stair: number, lift: number, between: number): FloorPlan =>
    written(
      [
        'walls outside 0.3 inside 0.1 height 2.6',
        'room deck "Deck" parking 10 x 6',
        'room st "Stair" stair 3 x 3 east of deck',
        'room lf "Lift" lift 2 x 2 north of deck',
        'room store "Store" storage 3 x 3 south of deck',
        `door d-st between deck and st, centred, 0.9 wide, height ${stair}`,
        `door d-lf between deck and lf, centred, 0.9 wide, height ${lift}`,
        `door d-store between deck and store, centred, 0.9 wide, height ${between}`
      ].join('\n')
    )

  it('questions a 1.15 m door onto a stair and a 1.6 m door onto a lift', () => {
    const issues = asked(plan(1.15, 1.6, 2.1), 'opening/size-question')
    const st = issues.find((i) => i.id === 'd-st')
    const lf = issues.find((i) => i.id === 'd-lf')
    expect(st?.message).toContain('Door "d-st" opens onto stair "st" and is 1.15 m high: is that meant? Grid asks about a door to a stair or a lift lower than 1.80 m.')
    expect(lf?.message).toContain('Door "d-lf" opens onto lift "lf" and is 1.60 m high: is that meant?')
    expect(issues.map((i) => i.id).sort()).toEqual(['d-lf', 'd-st'])
  })

  it('leaves a 2.1 m stair door alone, and a 1.15 m door between two rooms that are no stair', () => {
    expect(asked(plan(2.1, 2.1, 1.15), 'opening/size-question')).toEqual([])
  })
})

describe('LVL-18 an opening above its walls is told to raise them first', () => {
  it('says walls lower than a storey are the likelier fault', () => {
    const result = compileRoomsText(
      ['walls outside 0.3 inside 0.1 height 1.2', 'room deck "Deck" parking 10 x 10', 'room st "Stair" stair 3 x 3 east of deck', 'door d1 between deck and st, centred, 0.9 wide, height 2.1'].join('\n')
    )
    const problem = result.problems.find((p) => p.code === 'rooms/opening-too-high')
    expect(problem?.message).toBe(
      "Line 4: door 'd1' reaches 2.10 m but the walls are 1.20 m high, lower than a storey a person stands in (2.00 m, Grid's own size). Raise the walls first (the floor line's height, or the walls line's, and the elevation of any floor over it); lower it only if the storey really is that low."
    )
  })

  it('offers raising the walls before lowering on walls of a storey\'s height', () => {
    const result = compileRoomsText(
      ['walls outside 0.3 inside 0.1 height 2.4', 'room deck "Deck" parking 10 x 10', 'room st "Stair" stair 3 x 3 east of deck', 'door d1 between deck and st, centred, 0.9 wide, height 2.6'].join('\n')
    )
    const message = result.problems.find((p) => p.code === 'rooms/opening-too-high')?.message ?? ''
    expect(message).toContain('If the storey is taller, raise the walls')
    expect(message.indexOf('raise the walls')).toBeLessThan(message.indexOf('lower it'))
  })
})
