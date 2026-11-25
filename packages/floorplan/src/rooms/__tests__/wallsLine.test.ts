/**
 * WRT-47: the walls line's thicknesses and height hold for rooms sized to centre lines or outside
 * faces and placed by their corner, and on every floor written after it; where a floor's own
 * height or a later walls line wins, the answer says which.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { compileRoomsText, type RoomsResult } from '../compile'

const WALLS = 'walls outside 0.3 inside 0.1 height 3.4'

/** A school on a 12 m grid, two storeys, every room sized to its walls' centre lines. */
function school(basis: 'centre' | 'outside', floorHeight = ''): string {
  const floor = (id: string, level: number, p: string): string[] => [
    `floor ${id} "${id}" level ${level}${floorHeight}`,
    `room ${p}c1 "Classroom" classroom 12 x 10.8 ${basis} at 0,0`,
    `room ${p}c2 "Classroom" classroom 12 x 10.8 ${basis} at 12,0`,
    `room ${p}corr "Corridor" corridor 24 x 3.6 ${basis} at 0,10.8`,
    `room ${p}c3 "Classroom" classroom 12 x 10.8 ${basis} at 0,14.4`,
    `room ${p}c4 "Classroom" classroom 12 x 10.8 ${basis} at 12,14.4`,
  ]
  return [WALLS, ...floor('ground', 0, 'g'), ...floor('first', 1, 'f')].join('\n') + '\n'
}

function compiled(text: string): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

const onFloor = (plan: FloorPlan, floor: string): Wall[] => plan.walls.filter((w) => w.floor === floor)
const codes = (result: RoomsResult): string[] => result.warnings.map((w) => w.code)

describe('rooms sized to centre lines, placed by their corner', () => {
  it('writes the walls line inside thickness between them, on every floor', () => {
    const { result, plan } = compiled(school('centre'))
    for (const floor of ['ground', 'first']) {
      const walls = onFloor(plan, floor)
      expect(walls.length).toBeGreaterThan(0)
      for (const w of walls) expect(w.thickness).toBeCloseTo(w.kind === 'exterior' ? 0.3 : 0.1, 9)
      expect(walls.some((w) => w.kind !== 'exterior')).toBe(true)
      // The walls line's height, written on every wall of every floor.
      for (const w of walls) expect(w.height).toBeCloseTo(3.4, 9)
    }
    expect(codes(result)).not.toContain('rooms/wall-from-gap')
  })

  it('puts the walls centre lines on the grid the corners are written on', () => {
    const { plan } = compiled(school('centre'))
    const xs = [...new Set(onFloor(plan, 'ground').filter((w) => w.start[0] === w.end[0]).map((w) => w.start[0].toFixed(4)))].sort()
    expect(xs).toEqual(['0.0000', '12.0000', '24.0000'])
    const ys = [...new Set(onFloor(plan, 'ground').filter((w) => w.start[1] === w.end[1]).map((w) => w.start[1].toFixed(4)))].sort((a, b) => Number(a) - Number(b))
    expect(ys).toEqual(['0.0000', '10.8000', '14.4000', '25.2000'])
  })

  it('gives each room its inside size from the walls round it', () => {
    const { result } = compiled(school('centre'))
    const c1 = result.rooms.find((r) => r.id === 'gc1')!
    expect(c1.width).toBeCloseTo(12 - 0.15 - 0.05, 9)
    expect(c1.depth).toBeCloseTo(10.8 - 0.15 - 0.05, 9)
    const corr = result.rooms.find((r) => r.id === 'fcorr')!
    expect(corr.width).toBeCloseTo(24 - 0.3, 9)
    expect(corr.depth).toBeCloseTo(3.6 - 0.1, 9)
  })

  it('does the same for rooms sized to their outside faces, the wall between on the line they meet on', () => {
    const { plan, result } = compiled(school('outside'))
    for (const w of plan.walls) expect(w.thickness).toBeCloseTo(w.kind === 'exterior' ? 0.3 : 0.1, 9)
    const xs = [...new Set(onFloor(plan, 'ground').filter((w) => w.start[0] === w.end[0]).map((w) => w.start[0].toFixed(4)))].sort()
    expect(xs).toEqual(['0.1500', '12.0000', '23.8500'])
    const c1 = result.rooms.find((r) => r.id === 'gc1')!
    expect(c1.width).toBeCloseTo(12 - 0.3 - 0.05, 9)
  })

  it('keeps the inside thickness on a side that is half shared and half outside', () => {
    // The hall's east side meets the office for half its length; the rest is outside.
    const text = `${WALLS}\nsizes centre\nroom hall "Hall" - 12 x 7.2 at 0,0\nroom off "Office" - 6 x 3.6 at 12,3.6\nroom corr "Corridor" - 18 x 3.6 at 0,7.2\n`
    const { result, plan } = compiled(text)
    for (const w of plan.walls) expect(w.thickness).toBeCloseTo(w.kind === 'exterior' ? 0.3 : 0.1, 9)
    expect(codes(result)).not.toContain('rooms/wall-from-gap')
    const between = plan.walls.find((w) => w.kind !== 'exterior' && w.start[0] === w.end[0])!
    expect(between.start[0]).toBeCloseTo(12, 9)
  })

  it('keeps a wall between line thickness between two such rooms', () => {
    const text = `${WALLS}\nsizes centre\nwall between a and b 0.2\nroom a "A" - 6 x 6 at 0,0\nroom b "B" - 6 x 6 at 6,0\n`
    const { plan } = compiled(text)
    const between = plan.walls.filter((w) => w.kind !== 'exterior')
    expect(between.map((w) => w.thickness)).toEqual([0.2])
    expect(between[0]!.start[0]).toBeCloseTo(6, 9)
  })

  it('still places a room beside another by the inside thickness', () => {
    const { plan } = compiled(`${WALLS}\nsizes centre\nroom a "A" - 3 x 4\nroom b "B" - 3 x 4 east of a\n`)
    const xs = plan.walls.filter((w) => w.start[0] === w.end[0]).map((w) => w.start[0]).sort((p, q) => p - q)
    expect(xs).toEqual([0, 3, 6])
    expect(plan.walls.filter((w) => w.kind !== 'exterior').map((w) => w.thickness)).toEqual([0.1])
  })
})

describe('a floor that states its own height', () => {
  it('gives its walls that height and says the walls line height is not used there', () => {
    const { result, plan } = compiled(school('centre', ' height 3'))
    for (const w of plan.walls) expect(w.height).toBeCloseTo(3, 9)
    const said = result.warnings.filter((w) => w.code === 'rooms/walls-height')
    expect(said.map((w) => w.message)).toEqual([
      expect.stringContaining("Floor 'ground'"),
      expect.stringContaining("Floor 'first'"),
    ])
    expect(said[0]!.message).toContain('3.40')
    expect(said[0]!.message).toContain('3.00')
  })

  it('says nothing when the two heights agree', () => {
    const { result } = compiled(school('centre', ' height 3.4'))
    expect(codes(result)).not.toContain('rooms/walls-height')
  })
})

describe('a walls line written between floors', () => {
  const two = (a: string, b: string): string => `room ${a} "A" - 4 x 4 at 0,0\nroom ${b} "B" - 4 x 4 east of ${a}\n`

  it('is for the floors after it: the floor before keeps its own walls, and the answer says so', () => {
    const text = `${WALLS}\nfloor g "G" level 0\n${two('a', 'b')}walls outside 0.25 inside 0.2 height 3\nfloor f "F" level 1\n${two('c', 'd')}`
    const { result, plan } = compiled(text)
    for (const w of onFloor(plan, 'g')) {
      expect(w.thickness).toBeCloseTo(w.kind === 'exterior' ? 0.3 : 0.1, 9)
      expect(w.height).toBeCloseTo(3.4, 9)
    }
    for (const w of onFloor(plan, 'f')) {
      expect(w.thickness).toBeCloseTo(w.kind === 'exterior' ? 0.25 : 0.2, 9)
      expect(w.height).toBeCloseTo(3, 9)
    }
    expect(codes(result)).not.toContain('rooms/wall-from-gap')
    const late = result.warnings.filter((w) => w.code === 'rooms/walls-late')
    expect(late).toHaveLength(1)
    expect(late[0]!.line).toBe(5)
    expect(late[0]!.message).toContain("floor 'g'")
  })

  it('applies without a word to the floor it is written on before that floor has rooms', () => {
    const text = `floor g "G" level 0\n${WALLS.replace('0.1', '0.2')}\n${two('a', 'b')}`
    const { result, plan } = compiled(text)
    expect(plan.walls.filter((w) => w.kind !== 'exterior').map((w) => w.thickness)).toEqual([0.2])
    for (const w of plan.walls) expect(w.height).toBeCloseTo(3.4, 9)
    expect(codes(result)).not.toContain('rooms/walls-late')
  })
})
