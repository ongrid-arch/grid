/**
 * WRT-48: what rooms text does not read is refused by name, with its line and what was expected,
 * never dropped or misread: a raw part's unknown field, a raw floor's, a raw line of a kind raw
 * does not take, words after the plan's name, and a wall line naming no room.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'

const HALL = 'walls outside 0.3 inside 0.1 height 3\nroom hall "Hall" living 5 x 4 at 0,0\nroom bed "Bedroom" bedroom 3 x 4 east of hall\n'

const wall = (extra: string): string => `raw wall {"id": "fence", "start": [10, 0], "end": [14, 0], "thickness": 0.1, "height": 1.2, "kind": "exterior"${extra}}`

describe('a raw part with a field Grid does not have is refused by name (WRT-48)', () => {
  it('names a curve written as bulge, spline or ellipse, and says how a curve is written', () => {
    for (const key of ['bulge', 'spline', 'ellipse']) {
      const result = compileRoomsText(`${HALL}${wall(`, "${key}": 0.5`)}\n`)
      expect(result.plan).toBeNull()
      expect(result.problems).toHaveLength(1)
      const problem = result.problems[0]!
      expect(problem.code).toBe('rooms/raw')
      expect(problem.line).toBe(4)
      expect(problem.message).toContain(`"${key}"`)
      expect(problem.message).toContain('"arc"')
      expect(problem.message).toContain('"centre"')
    }
  })

  it("names facts written beside a room's fields, and points to properties", () => {
    const room = 'raw room {"id": "crypt", "name": "Crypt", "boundary": [], "facts": {"age": "old"}}'
    const result = compileRoomsText(`${HALL}${room}\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 4]])
    expect(result.problems[0]!.message).toContain('"facts"')
    expect(result.problems[0]!.message).toContain('"properties"')
  })

  it("names a window's inset, with the fields an opening has", () => {
    const opening = 'raw opening {"id": "w9", "type": "window", "wall": "ext-south", "offset": 1, "width": 1, "height": 1.2, "sill": 0.9, "inset": 0.1}'
    const result = compileRoomsText(`${HALL}${opening}\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 4]])
    expect(result.problems[0]!.message).toContain('"inset"')
    expect(result.problems[0]!.message).toContain('"offset"')
  })

  it('offers the nearest field for a misspelt one, and names a misspelt field inside one', () => {
    const misspelt = compileRoomsText(`${HALL}${wall(', "thicknes": 0.2')}\n`)
    expect(misspelt.problems[0]!.message).toContain('"thicknes"')
    expect(misspelt.problems[0]!.message).toContain('"thickness"')
    const inside = compileRoomsText(`${HALL}${wall(', "arc": {"center": [12, -1], "sweep": 60}')}\n`)
    expect(inside.problems.map((p) => p.code)).toContain('rooms/raw')
    expect(inside.problems.find((p) => p.code === 'rooms/raw')!.message).toContain('"center"')
    expect(inside.problems.find((p) => p.code === 'rooms/raw')!.message).toContain('"centre"')
  })

  it('still writes a raw part whose fields are all Grid’s, a curved wall and properties among them', () => {
    const result = compileRoomsText(`${HALL}${wall(', "arc": {"centre": [12, -1], "sweep": 60}, "properties": {"finish": "brick"}')}\n`)
    expect(result.problems).toEqual([])
    const fence = parseFloorPlan(result.plan).walls.find((w) => w.id === 'fence')!
    expect(fence.arc).toEqual({ centre: [12, -1], sweep: 60 })
    expect(fence.properties).toEqual({ finish: 'brick' })
  })
})

describe('a raw floor reads only the floor fields, on the floor it is written under (WRT-48)', () => {
  it('names a field a raw floor does not take', () => {
    const result = compileRoomsText(`${HALL}raw floor {"roof": {"kind": "flat"}, "ceiling": 2.6}\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 4]])
    expect(result.problems[0]!.message).toContain('"ceiling"')
    expect(result.problems[0]!.message).toContain('"roof"')
  })

  it('applies a raw floor with no floor line to the ground floor, and writes it', () => {
    const result = compileRoomsText(`${HALL}raw floor {"parapet": 1.1}\n`)
    expect(result.problems).toEqual([])
    const plan = parseFloorPlan(result.plan)
    expect(plan.floors?.map((f) => [f.id, f.parapet])).toEqual([['ground', 1.1]])
    expect(plan.rooms.every((r) => (r.floor ?? 'ground') === 'ground')).toBe(true)
  })
})

describe('raw takes wall, room, opening, floor, stair, bay or ramp (WRT-48, CNT-46)', () => {
  it('refuses another kind by its word, and says where that part goes', () => {
    const cases: Array<[string, string]> = [
      ['door', 'raw opening'],
      // LVL-21: a stair is raw stair, or a stair line of its own.
      ['staircase', 'raw stair {'],
      // CNT-41: the site has lines of its own.
      ['site', 'site boundary x,y'],
      ['column', '"columns"'],
      // CNT-45: an item is raw item, or an item line of its own.
      ['items', 'raw item {'],
    ]
    for (const [kind, where] of cases) {
      const result = compileRoomsText(`${HALL}raw ${kind} {"id": "x1"}\n`)
      expect(result.plan).toBeNull()
      expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 4]])
      const message = result.problems[0]!.message
      expect(message).toContain(`raw ${kind}`)
      expect(message).toContain('wall, room, opening, floor, stair, item, bay or ramp')
      expect(message).toContain(where)
      expect(message).not.toContain('A line starts with one of')
    }
  })

  it('takes a raw stair (LVL-21), and refuses one written with capitals by its kind, never as a word rooms text does not know (WRT-68)', () => {
    const stair = 'raw stair {"id": "s1", "from": "ground", "to": "first", "width": 0.9, "start": [5.36, 0.3], "end": [5.36, 3.9]}'
    const taken = compileRoomsText(`${HALL}${stair}\n`)
    expect(taken.problems).toEqual([])
    expect(taken.plan!.stairs).toEqual([{ id: 's1', from: 'ground', to: 'first', width: 0.9, run: [[5.36, 0.3], [5.36, 3.9]] }])
    for (const line of [stair.replace('raw stair', 'Raw stair'), stair.replace('raw stair', 'RAW STAIR')]) {
      const result = compileRoomsText(`${HALL}${line}\n`)
      expect(result.plan).toBeNull()
      expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 4]])
      const message = result.problems[0]!.message
      expect(message).toContain("'raw stair'")
      expect(message).not.toContain('is not a word')
      expect(message).not.toContain('A line starts with one of')
    }
  })

  it('refuses a kind raw takes written with capitals, offering it in small letters (WRT-68)', () => {
    for (const written of ['Raw wall', 'RAW WALL', 'raw Wall']) {
      const result = compileRoomsText(`${HALL}${wall('').replace('raw wall', written)}\n`)
      expect(result.plan).toBeNull()
      expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 4]])
      const message = result.problems[0]!.message
      expect(message).toContain(`'${written}'`)
      expect(message).toContain("'raw wall'")
      expect(message).not.toContain('is not a word')
    }
  })

  it('refuses a raw line with no JSON after its kind the same way', () => {
    const result = compileRoomsText(`${HALL}raw wall\n`)
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/raw', 4]])
    expect(result.problems[0]!.message).not.toContain('A line starts with one of')
  })
})

describe('the plan line takes one name (WRT-48)', () => {
  it('refuses words after the name, offering the line written right', () => {
    const result = compileRoomsText(`plan north 0\n${HALL}`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/syntax', 1]])
    expect(result.problems[0]!.message).toContain('plan "north 0"')
  })

  it('still reads a quoted name with spaces', () => {
    const result = compileRoomsText(`plan "My house"\n${HALL}`)
    expect(result.problems).toEqual([])
    expect(result.name).toBe('My house')
  })
})

describe('a wall line names rooms written on its floor (WRT-48)', () => {
  it('refuses wall between a room and a name that is no room, with the nearest and the rooms', () => {
    const result = compileRoomsText(`${HALL}wall between hall and bedd 0.2\n`)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/unknown-room', 4]])
    expect(result.problems[0]!.message).toContain("'bedd'")
    expect(result.problems[0]!.message).toContain("'bed'")
    expect(result.problems[0]!.message).toContain('hall')
  })

  it('refuses an outside wall line on a name that is no room', () => {
    const result = compileRoomsText(`${HALL}wall garage north 0.4\n`)
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/unknown-room', 4]])
    expect(result.problems[0]!.message).toContain("'garage'")
  })

  it('takes a wall line written above the rooms it names', () => {
    const result = compileRoomsText(`walls outside 0.3 inside 0.1 height 3\nwall between hall and bed 0.2\nroom hall "Hall" living 5 x 4 at 0,0\nroom bed "Bedroom" bedroom 3 x 4 east of hall\n`)
    expect(result.problems).toEqual([])
  })
})
