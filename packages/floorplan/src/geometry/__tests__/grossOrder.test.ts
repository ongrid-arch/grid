/**
 * ARE-20: the gross figures held in order. Gross external holds gross internal, and gross internal
 * holds the net; a figure the drawing puts out of order is still given, with a doubt that says why.
 * An outdoor space inside the walls (a cloister's garth) is out of both gross figures, whatever
 * walls bound it; and rooms can be measured apart, as one building from the one built against it.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planAreaFigures } from '../areas'

type Pt = [number, number]
const wall = (id: string, start: Pt, end: Pt, extra: Record<string, unknown> = {}) => ({ id, start, end, thickness: 0.6, height: 4, ...extra })
const square = (p: string, a: number, b: number, extra: Record<string, unknown> = {}) => [
  wall(`${p}s`, [a, a], [b, a], extra),
  wall(`${p}e`, [b, a], [b, b], extra),
  wall(`${p}n`, [b, b], [a, b], extra),
  wall(`${p}w`, [a, b], [a, a], extra),
]

/**
 * A cloister: a walk 30 m square on the walls' middle lines, round a garth 10 m square, every wall
 * 0.6 m thick. By hand: the walk's floor is 29.4² less 10.6², 752 m², the garth's 9.4², 88.36 m²,
 * and the outline 30.6², 936.36 m².
 */
function cloister(options: { garthWalls?: Record<string, unknown>; outerWalls?: Record<string, unknown>; garth?: 'courtyard' | 'none' } = {}): FloorPlan {
  const walk = { id: 'walk', name: 'Cloister walk', boundary: ['os', 'oe', 'on', 'ow'], holes: [['cs', 'ce', 'cn', 'cw']] }
  const garth = { id: 'garth', name: 'Garth', boundary: ['cs', 'ce', 'cn', 'cw'], outdoor: 'courtyard' }
  return parseFloorPlan({
    walls: [...square('o', 0, 30, options.outerWalls), ...square('c', 10, 20, options.garthWalls)],
    rooms: options.garth === 'none' ? [walk] : [walk, garth],
  })
}

const ground = (plan: FloorPlan) => planAreaFigures(plan).floors[0]!

describe('ARE-20 a courtyard inside the walls is out of both gross figures', () => {
  it('takes a garth marked as a courtyard out of gross internal when its walls are worked out', () => {
    const f = ground(cloister())
    expect(f.net).toBeCloseTo(752, 6)
    // Before, the corners of the garth's walls joined the garth to the walk, and gross internal kept it: 841.80.
    expect(f.grossInternal!).toBeCloseTo(752, 6)
    expect(f.grossExternal!).toBeCloseTo(936.36 - 88.36, 6)
    expect(f.outdoor).toBeCloseTo(88.36, 6)
    expect(f.doubts).toEqual({ grossInternal: null, grossExternal: null })
  })

  it('gives the same when the walls are stated outside walls', () => {
    const f = ground(cloister({ garthWalls: { kind: 'exterior' }, outerWalls: { kind: 'exterior' } }))
    expect(f.grossInternal!).toBeCloseTo(752, 6)
    expect(f.grossExternal!).toBeCloseTo(848, 6)
  })

  it('takes it out of gross internal behind an open arcade too, drawn as virtual walls', () => {
    const f = ground(cloister({ garthWalls: { virtual: true, thickness: 0 } }))
    // The walk runs to the arcade's line: 29.4² less 10², 764.36; the garth is 10², 100.
    expect(f.net).toBeCloseTo(764.36, 6)
    // Before, gross internal kept the garth and came out at 864.36, above gross external.
    expect(f.grossInternal!).toBeCloseTo(764.36, 4)
    expect(f.grossExternal!).toBeCloseTo(936.36 - 100, 4)
    expect(f.grossExternal!).toBeGreaterThanOrEqual(f.grossInternal!)
  })

  it('still counts floor no room claims, as the rule says, in both', () => {
    const f = ground(cloister({ garth: 'none' }))
    expect(f.unclaimed!).toBeCloseTo(88.36, 6)
    expect(f.grossInternal!).toBeCloseTo(864.36, 6)
    expect(f.grossExternal!).toBeCloseTo(936.36, 6)
  })
})

/**
 * A flat 6 m square on the walls' middle lines, and a corridor east of it whose walls do not
 * enclose it: its south wall stops 1 m short of the east wall's line, which stands apart. The
 * corridor's outline runs out to where the lines meet, so its floor is in the net and no gross
 * figure holds it.
 */
function openCorridor(): FloorPlan {
  const thin = (id: string, start: Pt, end: Pt) => ({ id, start, end, thickness: 0.2, height: 3 })
  return parseFloorPlan({
    walls: [thin('s', [0, 0], [6, 0]), thin('e', [6, 0], [6, 6]), thin('n', [6, 6], [0, 6]), thin('w', [0, 6], [0, 0]), thin('cs', [6, 0], [7, 0]), thin('cn', [7, 6], [6, 6]), thin('ce', [8, 1], [8, 5])],
    rooms: [
      { id: 'flat', name: 'Flat', boundary: ['s', 'e', 'n', 'w'] },
      { id: 'hall', name: 'Corridor', use: 'corridor', boundary: ['cs', 'ce', 'cn', 'e'] },
    ],
  })
}

describe('ARE-20 a gross figure below one it must hold says why', () => {
  it('doubts gross internal and gross external below the net, naming the floor that runs past the walls', () => {
    const figures = planAreaFigures(openCorridor())
    const f = figures.floors[0]!
    expect(f.net).toBeGreaterThan(f.grossInternal!)
    expect(f.offSpace!).toBeCloseTo(10.44, 6)
    expect(f.doubts.grossInternal).toBe(
      `The gross internal area is ${(f.net - f.grossInternal!).toFixed(2)} m² less than the net area, which it must hold, so it is not proven: ` +
        "10.44 m² of the rooms' floor lies on walls or outside them, so the net counts it and no gross figure holds it; grid_check names the rooms."
    )
    expect(f.doubts.grossExternal).toMatch(/^The gross external area is \d+\.\d\d m² less than the net area, which it must hold, so it is not proven: /)
    expect(figures.grossInternal.doubt).toBe(`On floor "ground": ${f.doubts.grossInternal}`)
    expect(figures.net.doubt).toBeNull()
    expect(figures.notes).toContain(figures.grossInternal.doubt)
  })

  it('has no doubt on a plan whose figures are in order', () => {
    const figures = planAreaFigures(cloister())
    expect(figures.grossInternal.doubt).toBeNull()
    expect(figures.grossExternal.doubt).toBeNull()
    expect(figures.notes.some((note) => note.includes('which it must hold'))).toBe(false)
  })
})

/**
 * Two buildings built against each other: a chapel 10 × 8 m on the walls' middle lines and a
 * sacristy 6 × 8 m east of it, sharing one 0.3 m wall, every wall 0.3 m thick.
 */
function attached(): FloorPlan {
  const w = (id: string, start: Pt, end: Pt) => ({ id, start, end, thickness: 0.3, height: 4 })
  return parseFloorPlan({
    walls: [w('as', [0, 0], [10, 0]), w('party', [10, 0], [10, 8]), w('an', [10, 8], [0, 8]), w('aw', [0, 8], [0, 0]), w('bs', [10, 0], [16, 0]), w('be', [16, 0], [16, 8]), w('bn', [16, 8], [10, 8])],
    rooms: [
      { id: 'chapel', name: 'Chapel', boundary: ['as', 'party', 'an', 'aw'] },
      { id: 'sacristy', name: 'Sacristy', boundary: ['bs', 'be', 'bn', 'party'] },
    ],
  })
}

describe('ARE-20 one building measured apart from the one built against it', () => {
  it('gives the chapel its net and its area to the middle of the wall it shares', () => {
    const apart = planAreaFigures(attached(), { apart: new Set(['chapel']) }).apart!
    expect(apart.rooms).toEqual(['chapel'])
    // 9.7 × 7.7 inside; to the middle of the shared wall 9.85 × 7.7; to the outside face 10.15 × 8.3.
    expect(apart.net).toBeCloseTo(9.7 * 7.7, 9)
    expect(apart.byFloor).toEqual({ ground: apart.net })
    expect(apart.toPartyWalls!.grossInternal).toBeCloseTo(9.85 * 7.7, 6)
    expect(apart.toPartyWalls!.grossExternal).toBeCloseTo(10.15 * 8.3, 6)
    expect(apart.notCounted).toEqual([])
  })

  it('adds up with the other building to the whole', () => {
    const plan = attached()
    const whole = planAreaFigures(plan)
    const a = planAreaFigures(plan, { apart: new Set(['chapel']) }).apart!
    const b = planAreaFigures(plan, { apart: new Set(['sacristy']) }).apart!
    expect(a.toPartyWalls!.grossInternal + b.toPartyWalls!.grossInternal).toBeCloseTo(whole.grossInternal.area!, 6)
    expect(a.toPartyWalls!.grossExternal + b.toPartyWalls!.grossExternal).toBeCloseTo(whole.grossExternal.area!, 6)
  })

  it('names an id that is no room the net counts, and gives none when none is asked for', () => {
    const apart = planAreaFigures(cloister(), { apart: new Set(['walk', 'garth']) }).apart!
    expect(apart.rooms).toEqual(['walk'])
    expect(apart.notCounted).toEqual(['garth'])
    expect('apart' in planAreaFigures(cloister())).toBe(false)
  })
})
