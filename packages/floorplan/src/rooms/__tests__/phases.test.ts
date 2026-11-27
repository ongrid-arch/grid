/**
 * WRT-81: existing, demolished and new written in rooms text, and read back the same way.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { safeParseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { phaseClashes, phaseCounts } from '../../geometry/phases'

const head = 'walls outside 0.3 inside 0.1 height 2.6\n'
const two = `${head}room a "A" office 4 x 4 at 0,0\nroom b "B" office 4 x 4 east of a\ndoor d1 between a and b, centred, 0.9 wide\ndoor f in a south, centred, 0.9 wide\n`

function planOf(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return safeParseFloorPlan(result.plan)!
}

const phaseOf = (plan: FloorPlan): Record<string, string | undefined> =>
  Object.fromEntries([...plan.walls, ...plan.rooms, ...plan.openings].map((part) => [part.id, part.phase]))

/** The plan read back as rooms text, which must have no raw line and write the same plan again. */
function readsBack(plan: FloorPlan): string {
  const reading = readRoomsText(plan)
  expect(reading.rawFloors).toEqual([])
  expect(reading.rawOpenings).toEqual([])
  expect(reading.text).not.toMatch(/^raw /m)
  const again = planOf(reading.text)
  expect(phaseCounts(again)).toEqual(phaseCounts(plan))
  for (const part of [...plan.walls, ...plan.rooms]) expect(phaseOf(again)[part.id], part.id).toBe(part.phase ?? 'existing')
  return reading.text
}

const renovation = `${head}phase existing
room a "A" office 4 x 4 at 0,0
room b "B" office 4 x 4 east of a phase demolished
room c "C" office 4 x 2 east of a phase new
room d "D" office 4 x 1.9 north of c phase new
door d1 between a and b, centred, 0.9 wide
door d2 between a and c, centred, 0.9 wide, phase new
door d3 between c and d, centred, 0.9 wide
door f in a south, centred, 0.9 wide
`

describe('phases in rooms text (WRT-81)', () => {
  it('writes a text with no phase word exactly as before', () => {
    const plan = planOf(two)
    expect(Object.values(phaseOf(plan)).every((phase) => phase === undefined)).toBe(true)
  })

  it('writes a survey as existing with one phase line', () => {
    const plan = planOf(`${head}phase existing\n${two.slice(head.length)}`)
    expect(phaseCounts(plan).existing).toEqual({ walls: 5, rooms: 2, openings: 2 })
    expect(plan.walls.every((w) => w.phase === 'existing')).toBe(true)
    expect(plan.rooms.every((r) => r.phase === 'existing')).toBe(true)
  })

  it('works out the walls of a room taken down and two rooms built in its place', () => {
    const plan = planOf(renovation)
    const phases = phaseOf(plan)
    expect(phases).toMatchObject({ a: 'existing', b: 'demolished', c: 'new', d: 'new', 'ext-south': 'existing', 'ext-east': 'existing' })
    // The wall between a and the rooms east of it stands before and after: one existing wall.
    const between = plan.walls.filter((w) => w.start[0] === 4.05 && w.end[0] === 4.05)
    expect(between.map((w) => w.phase)).toEqual(['existing'])
    // The wall between c and d is new; the door into b goes with b; the one into c is new.
    expect(plan.walls.filter((w) => w.phase === 'new')).toHaveLength(1)
    expect(phases).toMatchObject({ d1: 'demolished', d2: 'new', d3: 'new' })
    expect(phases['f']).toBeUndefined()
    expect(phaseClashes(plan)).toEqual([])
  })

  it('takes a phase on a place line, and a phase line for what follows', () => {
    const text = `${head}unit cell\n  room r "Cell {n}" bedroom 3 x 3\nend\nroom hall "Hall" corridor 6 x 2 at 0,0\nphase new\nplace cell as 1 at 0,6\n`
    const plan = planOf(text)
    expect(plan.rooms.find((r) => r.id === 'hall')?.phase).toBe('existing')
    expect(plan.rooms.filter((r) => r.phase === 'new')).toHaveLength(1)
  })

  it('makes a room that stays new, and keeps it as it was to be demolished, when the work changes its walls', () => {
    // An extension against the hall's north side: the hall's outside wall there gives way to an inside wall.
    const plan = planOf(`${head}room hall "Hall" corridor 6 x 2 at 0,0\nroom ext "Extension" office 6 x 3 north of hall phase new\n`)
    expect(plan.rooms.map((r) => [r.id, r.phase])).toEqual([['hall', 'new'], ['ext', 'new'], ['hall-before', 'demolished']])
    expect(phaseClashes(plan)).toEqual([])
    readsBack(plan)
  })

  it('marks a wall on its line, whatever its rooms give it', () => {
    const plan = planOf(`${head}wall between a and b phase demolished\nphase existing\n${two.slice(head.length)}`)
    const wall = plan.walls.find((w) => w.start[0] === 4.05)!
    expect(wall.phase).toBe('demolished')
    expect(plan.walls.filter((w) => w.phase === 'existing')).toHaveLength(4)
  })

  it('names the state a problem is in', () => {
    const result = compileRoomsText(`${head}room a "A" office 4 x 4 at 0,0\nroom b "B" office 4 x 4 east of a phase demolished\nroom c "C" office 2 x 4 east of b phase new\n`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]?.line).toBe(4)
    expect(result.problems[0]?.message).toMatch(/^Read as the building after the work \(its existing and new parts\): /)
  })

  it('refuses a phase it does not know, a phase on a line that takes none, and a phase in a fit-out', () => {
    const unknown = compileRoomsText(`${head}room a "A" office 4 x 4 at 0,0 phase old\n`)
    expect(unknown.problems.map((p) => [p.code, p.line])).toEqual([['rooms/phase', 2]])
    expect(unknown.problems[0]!.message).toMatch(/not .old./)
    expect(compileRoomsText(`${head}phase gone\nroom a "A" office 4 x 4 at 0,0\n`).problems.map((p) => p.code)).toEqual(['rooms/phase'])
    expect(compileRoomsText(`${head}room a "A" office 4 x 4 at 0,0\nnote "Keep" in a phase new\n`).problems.map((p) => p.code)).toEqual(['rooms/phase'])
    expect(compileRoomsText(`base shell.json\n${head}phase new\nroom a "A" office 4 x 4 at 0,0\n`).problems.map((p) => p.code)).toEqual(['rooms/phase'])
  })

  it('reads a word in quotes, or a room called phase, as no phase', () => {
    const plan = planOf(`${head}room a "Old phase new" office 4 x 4 at 0,0\nroom phase "Phase" office 4 x 4 east of a\ndoor d1 between phase and a, centred, 0.9 wide\n`)
    expect(plan.rooms.every((r) => r.phase === undefined)).toBe(true)
  })

  it('reads back a renovation with phase words and writes the same plan', () => {
    const text = readsBack(planOf(renovation))
    expect(text).toContain('\nphase existing\n')
    expect(text).toMatch(/^room b .* phase demolished$/m)
    expect(text).toMatch(/^door d2 .*, phase new$/m)
  })

  it('reads back a survey marked existing, and one wall marked to be demolished', () => {
    const survey = planOf(two)
    const marked: FloorPlan = { ...survey, walls: survey.walls.map((w) => ({ ...w, phase: 'existing' as const })), rooms: survey.rooms.map((r) => ({ ...r, phase: 'existing' as const })) }
    expect(readsBack(marked)).toContain('\nphase existing\n')
    const one: FloorPlan = { ...survey, walls: survey.walls.map((w) => (w.start[0] === 4.05 ? { ...w, phase: 'demolished' as const } : w)) }
    expect(readsBack(one)).toMatch(/^wall between [ab] and [ab] phase demolished$/m)
  })
})
