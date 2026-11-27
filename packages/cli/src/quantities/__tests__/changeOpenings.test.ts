/**
 * ARE-71: a new opening cut through a wall that stays is priced as the work it is: the hole taken
 * out by the wall's kind and thickness, its reveals (a doorless opening's too) and a lintel,
 * marked assumed.
 */
import { describe, expect, it } from 'vitest'
import { limit } from '@ongrid/floorplan/geometry'
import { refurbishment } from '@ongrid/floorplan/test-support/phases'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planChange } from '../change'

const wall = (id: string, start: [number, number], end: [number, number], kind: string, phase: string) => ({ id, start, end, thickness: 0.3, height: 2.7, kind, phase })

/** Two rooms side by side, the wall between them 0.3 m thick and staying, with the openings given. */
function knockThrough(openings: Record<string, unknown>[], middle: 'existing' | 'new' = 'existing') {
  return parseFloorPlan({
    version: '1',
    walls: [
      wall('ws', [0, 0], [8, 0], 'exterior', 'existing'),
      wall('we', [8, 0], [8, 4], 'exterior', 'existing'),
      wall('wn', [8, 4], [0, 4], 'exterior', 'existing'),
      wall('ww', [0, 4], [0, 0], 'exterior', 'existing'),
      wall('wm', [4, 0], [4, 4], 'interior', middle),
    ],
    rooms: [],
    openings,
  })
}

const linesOf = (plan: ReturnType<typeof parseFloorPlan>) => planChange(plan).lines
const line = (plan: ReturnType<typeof parseFloorPlan>, key: string) => linesOf(plan).find((l) => l.key === key)

describe('openings cut through walls that stay (ARE-71)', () => {
  const bearing = limit('lintelBearing')

  it('gives a 2.4 m knock-through in a 0.3 m wall its hole, its reveals and an assumed lintel', () => {
    const plan = knockThrough([{ id: 'o-through', wall: 'wm', type: 'opening', offset: 0.8, width: 2.4, height: 2.1, phase: 'new' }])
    const lines = linesOf(plan)
    expect(line(plan, 'new:opening:2.4x2.1')?.quantity).toBe(1)
    const cut = line(plan, 'demolish:cut:interior:0.3')!
    expect(cut).toMatchObject({ list: 'demolish', unit: 'm2', assumed: false })
    expect(cut.quantity).toBeCloseTo(2.4 * 2.1, 6)
    expect(cut.what).toContain('interior 0.30 m thick')
    // Two sides and the head, no sill: a doorless opening has reveals too.
    expect(line(plan, 'make_good:reveals')?.quantity).toBeCloseTo((2 * 2.1 + 2.4) * 0.3, 6)
    const lintel = line(plan, 'new:lintel:interior:0.3')!
    expect(lintel).toMatchObject({ list: 'new', unit: 'm', assumed: true })
    expect(lintel.quantity).toBeCloseTo(2.4 + 2 * bearing, 6)
    expect(lintel.rule).toContain('Assumed')
    // The lists stay in the order the work is done.
    const order = ['demolish', 'make good', 'new']
    expect(lines.map((l) => order.indexOf(l.list))).toEqual([...lines.map((l) => order.indexOf(l.list))].sort((a, b) => a - b))
  })

  it('cuts nothing and puts in no lintel for an opening in a new wall', () => {
    const plan = knockThrough([{ id: 'd', wall: 'wm', type: 'door', offset: 1, width: 0.9, height: 2.1, phase: 'new' }], 'new')
    const keys = linesOf(plan).map((l) => l.key)
    expect(keys).toContain('new:door:0.9x2.1')
    expect(keys.filter((k) => k.startsWith('demolish:cut') || k.startsWith('new:lintel') || k === 'make_good:reveals')).toEqual([])
  })

  it('takes no lintel over an opening whose head reaches the wall\'s top', () => {
    const plan = knockThrough([{ id: 'o-full', wall: 'wm', type: 'opening', offset: 0.8, width: 2.4, height: 2.7, phase: 'new' }])
    expect(line(plan, 'demolish:cut:interior:0.3')?.quantity).toBeCloseTo(2.4 * 2.7, 6)
    expect(line(plan, 'new:lintel:interior:0.3')).toBeUndefined()
  })

  it('cuts only what an old opening to be demolished does not leave open already', () => {
    const same = knockThrough([
      { id: 'd-before', wall: 'wm', type: 'door', offset: 1, width: 0.9, height: 2.1, phase: 'demolished' },
      { id: 'd', wall: 'wm', type: 'door', offset: 1, width: 0.9, height: 2.1, kind: 'sliding', phase: 'new' },
    ])
    expect(line(same, 'demolish:cut:interior:0.3')).toBeUndefined()
    expect(line(same, 'new:lintel:interior:0.3')).toBeUndefined()
    const wider = knockThrough([
      { id: 'd-before', wall: 'wm', type: 'door', offset: 1, width: 0.9, height: 2.1, phase: 'demolished' },
      { id: 'd', wall: 'wm', type: 'door', offset: 1, width: 1.5, height: 2.1, phase: 'new' },
    ])
    expect(line(wider, 'demolish:cut:interior:0.3')?.quantity).toBeCloseTo((1.5 - 0.9) * 2.1, 6)
    expect(line(wider, 'new:lintel:interior:0.3')?.quantity).toBeCloseTo(1.5 + 2 * bearing, 6)
  })

  it('prices the refurbishment\'s widened bath door and new window as cuts and lintels by their walls', () => {
    const plan = refurbishment()
    // The bath door, 0.9 wide, takes the place of a 0.7 one in a 0.1 m wall; the window is cut whole in a 0.3 m one.
    expect(line(plan, 'demolish:cut:interior:0.1')?.quantity).toBeCloseTo((0.9 - 0.7) * 2.1, 6)
    expect(line(plan, 'demolish:cut:exterior:0.3')?.quantity).toBeCloseTo(1.2 * 1.2, 6)
    expect(line(plan, 'new:lintel:interior:0.1')?.quantity).toBeCloseTo(0.9 + 2 * bearing, 6)
    expect(line(plan, 'new:lintel:exterior:0.3')?.quantity).toBeCloseTo(1.2 + 2 * bearing, 6)
    // The study door is in a new wall: no cut and no lintel at its wall's kind.
    expect(line(plan, 'new:lintel:partition:0.1')).toBeUndefined()
  })
})
