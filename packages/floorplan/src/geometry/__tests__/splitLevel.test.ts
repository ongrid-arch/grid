/**
 * LVL-11: a floor is set against the floors under its own footprint, in its own building, by
 * where they stand; a half level beside another floor of its building is a split level, said once
 * for the plan, and never a floor that reaches past or sits back from the floor below.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { validatePlan } from '../validate'

type Box = readonly [number, number, number, number]

/** A floor drawn as one room in a box of four 0.3 m outside walls, from (x0, y0) to (x1, y1) on their centre lines. */
interface BoxFloor {
  readonly id: string
  readonly name: string
  readonly level: number
  readonly box: Box
  readonly elevation?: number
  readonly height?: number
  readonly meant?: boolean
}

function plan(floors: readonly BoxFloor[], buildings?: readonly { id: string; name: string; floors: string[] }[]): FloorPlan {
  const walls = floors.flatMap(({ id, box: [x0, y0, x1, y1] }) => {
    const wall = (side: string, start: number[], end: number[]) => ({ id: `${id}-${side}`, start, end, thickness: 0.3, kind: 'exterior', height: 2.5, floor: id })
    return [wall('s', [x0, y0], [x1, y0]), wall('e', [x1, y0], [x1, y1]), wall('n', [x1, y1], [x0, y1]), wall('w', [x0, y1], [x0, y0])]
  })
  return parseFloorPlan({
    floors: floors.map((f) => ({
      id: f.id,
      name: f.name,
      level: f.level,
      ...(f.elevation === undefined ? {} : { elevation: f.elevation }),
      ...(f.height === undefined ? {} : { height: f.height }),
      ...(f.meant === true ? { overhang: 'meant' } : {})
    })),
    walls,
    rooms: floors.map((f) => ({ id: `${f.id}-r`, name: `Room on ${f.name}`, floor: f.id, boundary: ['s', 'e', 'n', 'w'].map((side) => `${f.id}-${side}`), use: 'living' })),
    openings: [{ id: 'door', wall: `${floors[0]!.id}-s`, type: 'door', offset: 1, width: 0.9, height: 2.1 }],
    ...(buildings === undefined ? {} : { buildings })
  })
}

const NOTES = new Set(['floor/out-of-line', 'floor/set-back', 'floor/split-level'])
const floorNotes = (p: FloorPlan) => validatePlan(p).issues.filter((i) => NOTES.has(i.code))

/**
 * A row of split-level houses stepping up a street 0.6 m a house: each house is a front half on
 * the street and a back half 1.4 m up, each with a floor 2.8 m over it.
 */
function terrace(houses: number, withBuildings: boolean): FloorPlan {
  const floors: BoxFloor[] = []
  for (let h = 0; h < houses; h++) {
    const [x0, x1, e] = [5 * h, 5 * h + 5, 0.6 * h]
    const front: Box = [x0, 0, x1, 4.5]
    const back: Box = [x0, 4.5, x1, 9.1]
    floors.push(
      { id: `h${h + 1}-f0`, name: `House ${h + 1} front`, level: 4 * h, box: front, elevation: e, height: 2.5 },
      { id: `h${h + 1}-b0`, name: `House ${h + 1} back`, level: 4 * h + 1, box: back, elevation: e + 1.4, height: 2.5 },
      { id: `h${h + 1}-f1`, name: `House ${h + 1} front upstairs`, level: 4 * h + 2, box: front, elevation: e + 2.8, height: 2.5 },
      { id: `h${h + 1}-b1`, name: `House ${h + 1} back upstairs`, level: 4 * h + 3, box: back, elevation: e + 4.2, height: 2.5 }
    )
  }
  const buildings = withBuildings
    ? Array.from({ length: houses }, (_, h) => ({ id: `h${h + 1}`, name: `House ${h + 1}`, floors: ['f0', 'b0', 'f1', 'b1'].map((k) => `h${h + 1}-${k}`) }))
    : undefined
  return plan(floors, buildings)
}

/** A house on a slope: three levels, each a half level up from the one before and north of it. */
const chalet = (meant: readonly string[] = []): FloorPlan =>
  plan([
    { id: 'bottom', name: 'Bedroom level', level: -2, box: [0, 0, 10, 7.5], elevation: -3, height: 2.6, meant: meant.includes('bottom') },
    { id: 'middle', name: 'Living level', level: -1, box: [0, 7.5, 10, 16], elevation: -1.5, height: 3, meant: meant.includes('middle') },
    { id: 'top', name: 'Road level', level: 0, box: [0, 16, 10, 22.5], elevation: 0, height: 2.6, meant: meant.includes('top') }
  ])

describe('a row of split-level houses (LVL-11)', () => {
  it('sets no house against its neighbour and says the split levels once, with buildings stated', () => {
    const notes = floorNotes(terrace(6, true))
    expect(notes.map((i) => [i.code, i.id, i.severity])).toEqual([['floor/split-level', 'h1-b0', 'warning']])
    expect(notes[0]!.message).toBe(
      'The plan has split levels, each floor a half level up beside the floor it steps from, with no floor under it: ' +
        '"House 1 back" stands 1.40 m above "House 1 front", on its north side; "House 2 back" stands 1.40 m above "House 2 front", on its north side; ' +
        '"House 3 back" stands 1.40 m above "House 3 front", on its north side, and 3 more half levels. ' +
        'Each floor is set only against the floors under it. If a step is not meant, change that floor\'s elevation; if it is, mark the floor with overhang "meant".'
    )
  })

  it('sets each floor against the floors under it with no buildings stated', () => {
    const notes = floorNotes(terrace(3, false))
    expect(notes.map((i) => i.code)).toEqual(['floor/split-level'])
    // A back half steps from its own front half, the floor it shares the wall between them with,
    // though house 2's street floor, nearer in height, touches it at a corner.
    expect(notes[0]!.message).toContain('"House 1 back" stands 1.40 m above "House 1 front", on its north side')
    // House 2's street floor stands 0.6 m up beside house 1's: a half level of it, on its east.
    expect(notes[0]!.message).toContain('"House 2 front" stands 0.60 m above "House 1 front", on its east side')
    expect(notes[0]!.message).toContain('"House 2 back" stands 1.40 m above "House 2 front", on its north side')
    expect(notes[0]!.message).not.toContain('upstairs')
  })
})

describe('a house of three half levels down a slope (LVL-11)', () => {
  it('is said once as split levels, by how far up and on which side each steps, never all round', () => {
    const notes = floorNotes(chalet())
    expect(notes.map((i) => [i.code, i.id])).toEqual([['floor/split-level', 'middle']])
    expect(notes[0]!.message).toContain(
      ': "Living level" stands 1.50 m above "Bedroom level", on its north side; "Road level" stands 1.50 m above "Living level", on its north side. '
    )
    expect(notes[0]!.message).not.toContain('all round')
  })

  it('leaves out a half level marked overhang "meant", and says nothing when every one is', () => {
    const notes = floorNotes(chalet(['middle']))
    expect(notes.map((i) => [i.code, i.id])).toEqual([['floor/split-level', 'top']])
    expect(notes[0]!.message).not.toContain('"Living level" stands')
    expect(floorNotes(chalet(['middle', 'top']))).toEqual([])
  })
})

describe('the floors under a floor (LVL-11)', () => {
  it('sets a floor over both halves of a split level against both', () => {
    const notes = floorNotes(
      plan([
        { id: 'front', name: 'Front', level: 0, box: [0, 0, 5, 4.5], elevation: 0, height: 2.5 },
        { id: 'back', name: 'Back', level: 1, box: [0, 4.5, 5, 9.1], elevation: 1.4, height: 2.5 },
        { id: 'top', name: 'Top', level: 2, box: [0, 0, 5, 9.1], elevation: 4.2, height: 2.5 }
      ])
    )
    expect(notes.map((i) => [i.code, i.id])).toEqual([['floor/split-level', 'back']])
  })

  it('sets no floor against a basement under it, and a floor over the ground against nothing under that', () => {
    const notes = floorNotes(
      plan([
        { id: 'basement', name: 'Basement', level: -1, box: [0, 0, 20, 10] },
        { id: 'ground', name: 'Ground floor', level: 0, box: [0, 0, 10, 10] },
        { id: 'first', name: 'First floor', level: 1, box: [0, 0, 10, 10] }
      ])
    )
    // CNT-40: the ground floor sits inside a larger basement dug into the earth: no set-back.
    expect(notes).toEqual([])
  })

  it('does not set the floor over a house against a garden studio beside it at the level below', () => {
    const notes = floorNotes(
      plan([
        { id: 'ground', name: 'Ground floor', level: 0, box: [0, 0, 10, 8] },
        { id: 'studio', name: 'Studio', level: 0, box: [20, 0, 24, 4] },
        { id: 'first', name: 'First floor', level: 1, box: [0, 0, 10, 8] }
      ])
    )
    expect(notes).toEqual([])
  })

  it('still says a floor a storey up beside the floor below, with nothing under it, is out of line', () => {
    const stated = floorNotes(
      plan([
        { id: 'g', name: 'Ground floor', level: 0, box: [0, 0, 10, 8], elevation: 0, height: 2.7 },
        { id: 'f', name: 'First floor', level: 1, box: [10, 0, 20, 8], elevation: 3, height: 2.7 }
      ])
    )
    expect(stated.map((i) => [i.code, i.id])).toEqual([['floor/out-of-line', 'f']])
    const unstated = floorNotes(
      plan([
        { id: 'g', name: 'Ground floor', level: 0, box: [0, 0, 10, 8] },
        { id: 'f', name: 'First floor', level: 1, box: [10, 0, 20, 8] }
      ])
    )
    expect(unstated.map((i) => [i.code, i.id])).toEqual([['floor/out-of-line', 'f']])
  })
})
