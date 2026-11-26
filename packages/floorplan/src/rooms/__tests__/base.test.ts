/**
 * WRT-75: a fit-out on a base plan in rooms text. The rooms rest on the base's walls, by their
 * faces; a door in the shell is refused; the read-back names the base and writes back the same.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { baseNamedIn, fitOutReading, type BasePlan } from '../base'
import { mergeBase, validatePlan } from '../../geometry'
import { safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'

/** A shell 12 x 8 m to its walls' centre lines, its walls 0.3 m thick, a door in its south wall. */
function shell(extra: readonly string[] = []): FloorPlan {
  const made = compileRoomsText(['walls outside 0.3 inside 0.2', 'room unit "Unit" office 11.7 x 7.7 at 0.15,0.15', 'door entrance in unit south, 1 from west, 1.2 wide', ...extra].join('\n'))
  expect(made.problems).toEqual([])
  return safeParseFloorPlan(made.plan)!
}

const BASE: BasePlan = { file: 'shell.json', plan: shell() }

const FIT_OUT = [
  'base shell.json',
  'walls outside 0.2 inside 0.1',
  'room front "Reception" office 5.8 x 7.7 at 0.15,0.15',
  'room back "Treatment" office 5.8 x 7.7 east of front',
  'door d1 between front and back, centred, 0.9 wide',
].join('\n')

describe('a fit-out in rooms text (WRT-75)', () => {
  it('finds the base a text names, quoted or not', () => {
    expect(baseNamedIn(FIT_OUT)).toEqual({ file: 'shell.json', line: 1 })
    expect(baseNamedIn('# a shell\nbase "the shell.json"\n')).toEqual({ file: 'the shell.json', line: 2 })
    expect(baseNamedIn('room a "A" office 3 x 3 at 0,0')).toBeNull()
  })

  it('rests the rooms on the base walls their faces lie on, by the base ids', () => {
    const result = compileRoomsText(FIT_OUT, { base: BASE })
    expect(result.problems).toEqual([])
    const plan = result.plan!
    expect(plan.base).toBe('shell.json')
    // Only the partition is the fit-out's own; its ends are on the shell's centre lines.
    expect(plan.walls.map((w) => w.id)).toEqual(['w-front-back'])
    const partition = plan.walls[0]!
    expect([partition.start, partition.end]).toEqual([[6, 0], [6, 8]])
    const front = plan.rooms.find((r) => r.id === 'front')!
    expect(front.boundary).toEqual(['ext-south', 'w-front-back', 'ext-north', 'ext-west'])
    // The door stays where it was written: centred on the rooms' shared face.
    const d1 = plan.openings.find((o) => o.id === 'd1')!
    expect(d1.offset + d1.width / 2).toBeCloseTo(0.15 + 7.7 / 2, 6)
    expect(result.base).toEqual({ file: 'shell.json', restsOn: ['ext-south', 'ext-north', 'ext-west', 'ext-east'] })
    expect(result.walls.map((w) => w.id)).toEqual(['w-front-back'])
    // Read with its base, the fit-out is a whole plan with nothing in the drawing to fix.
    const merged = mergeBase(safeParseFloorPlan(plan)!, BASE.plan)
    expect(merged.clashes).toEqual([])
    expect(validatePlan(merged.plan).issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('rests on a base wall the rooms stand either side of, by both its faces', () => {
    const base: BasePlan = { file: 'shell.json', plan: shell(['room store "Store" storage 3 x 7.7 east of unit']) }
    const text = ['base shell.json', 'walls outside 0.3 inside 0.1', 'room shop "Shop" retail 11.7 x 7.7 at 0.15,0.15', 'room back "Back" storage 3 x 7.7 east of shop walls 0.2'].join('\n')
    const result = compileRoomsText(text, { base })
    expect(result.problems).toEqual([])
    expect(result.plan!.walls).toEqual([])
    expect(result.base!.restsOn).toContain('w-unit-store')
  })

  it('refuses a door in a wall that rests on the base, naming the base wall', () => {
    const result = compileRoomsText(`${FIT_OUT}\ndoor back-door in back east, centred, 0.9 wide`, { base: BASE })
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => [p.code, p.line])).toEqual([['rooms/base', 6]])
    expect(result.problems[0]!.message).toContain('"ext-east"')
  })

  it('says how far off a base wall a room face stands', () => {
    const result = compileRoomsText(FIT_OUT.replace('5.8 x 7.7 at 0.15,0.15', '5.8 x 7.65 at 0.15,0.15').replace('5.8 x 7.7 east', '5.8 x 7.65 east'), { base: BASE })
    expect(result.problems).toEqual([])
    const off = result.warnings.filter((w) => w.code === 'rooms/base-off')
    expect(off.length).toBeGreaterThan(0)
    expect(off[0]!.message).toContain('0.05 m off')
  })

  it('refuses a base it was not given', () => {
    const result = compileRoomsText(FIT_OUT)
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/base'])
    expect(result.problems[0]!.message).toContain('Line 1: the base plan "shell.json" was not read')
    expect(compileRoomsText('base\nroom a "A" office 3 x 3 at 0,0').problems[0]!.code).toBe('rooms/base')
  })

  it('gives a fit-out part with a base id another id, or refuses one the text chose', () => {
    const taken = compileRoomsText(`${FIT_OUT}\ndoor entrance between front and back, 1 from north, 0.8 wide`, { base: BASE })
    expect(taken.problems.map((p) => p.code)).toContain('rooms/base')
  })

  it('reads a fit-out back with its base line, and the text writes the same fit-out again', () => {
    const written = safeParseFloorPlan(compileRoomsText(FIT_OUT, { base: BASE }).plan)!
    const reading = readRoomsText(written, { base: BASE })
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toContain('\nbase shell.json\n')
    expect(reading.text).not.toContain('entrance')
    const again = compileRoomsText(reading.text, { base: BASE })
    expect(again.problems).toEqual([])
    const view = fitOutReading(written, BASE)
    const back = view.again(safeParseFloorPlan(again.plan)!)
    expect(back.walls).toEqual(view.plan.walls)
    expect(back.rooms.map((r) => [r.id, r.boundary])).toEqual(view.plan.rooms.map((r) => [r.id, r.boundary]))
    expect(back.openings).toEqual(view.plan.openings)
  })
})
