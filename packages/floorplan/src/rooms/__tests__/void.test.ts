/**
 * LVL-28: `void` on a room line writes the room as a void (LVL-4): open to the floor below, in no
 * area, open to the rooms it touches or is placed beside, refused where it has nothing to open to
 * or says it has a floor, and written back on its line.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText, readRoomsText, type RoomsResult } from '../index'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { indexPlan } from '../../geometry/plan'

const BELOW = ['walls outside 0.3 inside 0.1 height 3', 'floor ground level 0', 'room hall "Hall" - 10 x 8 at 0,0', 'room cafe "Cafe" - 6 x 8 east of hall', 'floor first level 1']

function write(lines: readonly string[]): { result: RoomsResult; plan: FloorPlan } {
  const result = compileRoomsText([...BELOW, ...lines].join('\n'))
  expect(result.problems).toEqual([])
  return { result, plan: parseFloorPlan(result.plan) }
}

function refused(lines: readonly string[], below = BELOW): string {
  const result = compileRoomsText([...below, ...lines].join('\n'))
  expect(result.problems.length).toBeGreaterThan(0)
  return result.problems.map((p) => p.message).join(' ')
}

/** The walls between exactly these two rooms, not the outside walls that bound both. */
function between(plan: FloorPlan, a: string, b: string): Wall[] {
  const index = indexPlan(plan)
  const key = [a, b].sort().join()
  return plan.walls.filter((w) => w.kind !== 'exterior' && (index.roomsByWall.get(w.id) ?? []).map((r) => r.id).sort().join() === key)
}

describe('a void in rooms text (LVL-28)', () => {
  it('is a void written after the use or in its slot, in no inside total', () => {
    const after = write(['room atrium "Hall void" - 6 x 8 at 0,0 void', 'room gallery "Gallery" - 4 x 8 east of atrium'])
    const slot = write(['room atrium "Lounge void" void 6 x 8 at 0,0', 'room gallery "Gallery" - 4 x 8 east of atrium'])
    for (const { plan, result } of [after, slot]) {
      const atrium = plan.rooms.find((r) => r.id === 'atrium')!
      expect(atrium.void).toBe(true)
      expect(atrium.use).toBeUndefined()
      expect(plan.rooms.find((r) => r.id === 'gallery')?.void).toBeUndefined()
      expect(result.rooms.find((r) => r.id === 'atrium')?.apart).toBe('void')
    }
  })

  it('keeps a use written before the word', () => {
    const { plan } = write(['room well "Stair well" corridor 3 x 3 at 0,0 void'])
    expect(plan.rooms.find((r) => r.id === 'well')).toMatchObject({ use: 'corridor', void: true })
  })

  it('is open to the room it is placed beside, and says so once', () => {
    const { plan, result } = write(['room atrium "Hall void" void 6 x 8 at 0,0', 'room gallery "Gallery" - 4 x 8 east of atrium'])
    const walls = between(plan, 'atrium', 'gallery')
    expect(walls.length).toBeGreaterThan(0)
    expect(walls.every((w) => w.virtual === true)).toBe(true)
    // Placed open: the gallery starts at the void's face, with no wall's width between.
    expect(Math.min(...walls.flatMap((w) => [w.start[0], w.end[0]]))).toBeCloseTo(6, 6)
    expect(result.guesses.filter((g) => g.includes("'atrium'")).length).toBe(1)
  })

  it('is open to a room placed beside it, and to a room it touches', () => {
    const beside = write(['room gallery "Gallery" - 4 x 8 at 6,0', 'room atrium "Hall void" void 6 x 8 west of gallery'])
    expect(between(beside.plan, 'atrium', 'gallery').every((w) => w.virtual === true)).toBe(true)
    const touching = write(['room atrium "Hall void" void 6 x 8 at 0,0', 'room gallery "Gallery" - 4 x 8 at 6,0'])
    expect(between(touching.plan, 'atrium', 'gallery').every((w) => w.virtual === true)).toBe(true)
  })

  it('takes a railing or a wall a line states between it and a room', () => {
    const railing = write(['room atrium "Hall void" void 6 x 8 at 0,0', 'room gallery "Gallery" - 4 x 8 east of atrium', 'wall between atrium and gallery 0.1 railing height 1.1'])
    const guard = between(railing.plan, 'atrium', 'gallery')
    expect(guard.length).toBe(1)
    expect(guard[0]).toMatchObject({ railing: true, height: 1.1 })
    expect(guard[0]!.virtual).toBeUndefined()
    expect(railing.result.guesses.some((g) => g.includes('open to each other'))).toBe(false)
    const walled = write(['room atrium "Hall void" void 6 x 8 at 0,0', 'room office "Office" office 4 x 8 east of atrium wall 0.1'])
    expect(between(walled.plan, 'atrium', 'office').every((w) => w.virtual !== true && w.thickness === 0.1)).toBe(true)
  })

  it('is refused on the lowest floor, with nothing under it to open to', () => {
    const message = refused(['room atrium "Hall void" void 6 x 8 at 0,0'], ['walls outside 0.3 inside 0.1 height 3'])
    expect(message).toContain("'atrium'")
    expect(message).toContain('below')
  })

  it('is refused as outdoor space, with a floor level of its own, or heated', () => {
    expect(refused(['room atrium "Hall void" void 6 x 8 at 0,0 outdoor courtyard'])).toContain('outdoor')
    expect(refused(['room atrium "Hall void" void 6 x 8 at 0,0 floor 0.5'])).toContain("'floor 0.5'")
    expect(refused(['room atrium "Hall void" void 6 x 8 at 0,0 conditioned'])).toContain("'conditioned'")
  })

  it('offers the word for one near it', () => {
    expect(refused(['room atrium "Hall void" - 6 x 8 at 0,0 voi'])).toContain("'void'")
  })

  it('is written back on its line, and that text writes the same plan', () => {
    const { plan } = write(['room atrium "Hall void" void 6 x 8 at 0,0', 'room gallery "Gallery" - 4 x 8 east of atrium'])
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toMatch(/room atrium "Hall void" - .* void/)
    const again = parseFloorPlan(compileRoomsText(reading.text).plan)
    expect(again.rooms.map((r) => [r.id, r.void])).toEqual(plan.rooms.map((r) => [r.id, r.void]))
    const walls = (p: FloorPlan): unknown => p.walls.map((w) => [w.start, w.end, w.thickness, w.virtual === true]).sort()
    expect(walls(again)).toEqual(walls(plan))
  })
})
