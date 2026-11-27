/**
 * ARE-73: activity zones in front of fixtures, per kind: a box on the fixture's centre line,
 * measured for its clear depth and the clear width to each side, by compass; what stands in it,
 * the doors that swing into it and the zones it overlaps; units side by side with one front as
 * one run; only the zones with findings unless all; and the closing sentence.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../survey'
import { activityLines, activityZones, zoneFindings, type ActivityZone } from '../activity'

const L = (v: number): string => `${v.toFixed(2)} m`

/** A room `w` × `h` between wall centre lines, its walls 0.1 thick, so its floor runs from 0.05 to w − 0.05. */
function room(w: number, h: number, items: unknown[], extra: Record<string, unknown> = {}): unknown {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.1, height: 2.5, kind: 'exterior' })
  return {
    version: '1',
    units: 'm',
    walls: [wall('s', [0, 0], [w, 0]), wall('e', [w, 0], [w, h]), wall('n', [0, h], [w, h]), wall('w', [0, h], [0, 0])],
    rooms: [{ id: 'bath', name: 'Bathroom', boundary: ['s', 'e', 'n', 'w'], use: 'bathroom' }],
    openings: [],
    items,
    ...extra,
  }
}

/** A WC against the south wall, its centre line `x` along, facing north (up the drawing). */
const wc = (id: string, x: number, more: Record<string, unknown> = {}) => ({ id, kind: 'toilet', at: [x, 0.05 + 0.325], size: [0.4, 0.65], height: 0.8, ...more })

const zonesOf = (plan: unknown, ask: Parameters<typeof activityZones>[1] = {}) => activityZones(surveyPlan(parseFloorPlan(plan)), ask)
const only = (zones: readonly ActivityZone[], id: string): ActivityZone => zones.find((z) => z.items.includes(id))!

describe('ARE-73: a zone on the centre line, given as a box', () => {
  it('measures a WC 0.3 m from its side wall short to that side, by compass, and clear to the other', () => {
    const found = zonesOf(room(3, 2.4, [wc('wc', 0.35)]), { perKind: { toilet: { front: 0.7, width: 0.8 } } })
    const zone = only(found.zones, 'wc')
    expect(zone.figure).toMatchObject({ front: 0.7, width: 0.8, from: 'person', widthGiven: true })
    expect(zone.ways).toEqual({ front: 'north', left: 'west', right: 'east' })
    expect(zone.measured.left).toBeCloseTo(0.3, 6)
    expect(zone.measured.right).toBeCloseTo(2.6, 6)
    expect(zone.measured.front).toBeCloseTo(2.35 - 0.7, 6)
    expect(zone.short).toEqual(['left'])
    const line = activityLines(surveyPlan(parseFloorPlan(room(3, 2.4, [wc('wc', 0.35)]))), found, false, L).join('\n')
    expect(line).toContain('0.30 m to the west of the 0.40 m asked')
    expect(line).toContain('your figure')
  })

  it('reads an exact fit as at least the figure, never short', () => {
    // Its centre line 0.4 m from the west face, 0.7 m clear in front of it to the north face.
    const found = zonesOf(room(3, 1.45, [wc('wc', 0.45)]), { perKind: { toilet: { front: 0.7, width: 0.8 } } })
    const zone = only(found.zones, 'wc')
    expect(zone.measured.left).toBeCloseTo(0.4, 6)
    expect(zone.measured.front).toBeCloseTo(0.7, 6)
    expect(zone.short).toEqual([])
    expect(zoneFindings(zone)).toBe(false)
  })

  it('names the sides by the plan\'s north', () => {
    const found = zonesOf(room(3, 2.4, [wc('wc', 1)], { north: 90 }), {})
    expect(found.northStated).toBe(true)
    expect(only(found.zones, 'wc').ways).toEqual({ front: 'east', left: 'north', right: 'south' })
  })

  it('takes a depth per kind, as wide as the fixture, as wide as the fixture, and clearance and width for every other kind', () => {
    const basin = { id: 'basin', kind: 'basin', at: [2, 0.05 + 0.225], size: [0.55, 0.45], height: 0.85 }
    const found = zonesOf(room(3, 2.4, [wc('wc', 1), basin]), { perKind: { basin: { front: 0.9 } }, clearance: 0.75, width: 0.9 })
    expect(only(found.zones, 'basin').figure).toMatchObject({ front: 0.9, from: 'person', widthGiven: true, width: 0.9 })
    expect(only(found.zones, 'wc').figure).toMatchObject({ front: 0.75, width: 0.9, from: 'person' })
    const plain = zonesOf(room(3, 2.4, [basin]), { perKind: { basin: { front: 0.9 } } })
    expect(only(plain.zones, 'basin').figure).toMatchObject({ front: 0.9, widthGiven: false })
    expect(only(plain.zones, 'basin').figure.width).toBeCloseTo(0.55, 9)
  })

  it('falls back on the item\'s own clearance, then its kind\'s library entry, then Grid\'s own indicator', () => {
    const own = zonesOf(room(3, 2.4, [wc('wc', 1, { clearance: 0.55 })]))
    expect(only(own.zones, 'wc').figure).toMatchObject({ front: 0.55, from: 'item' })
    const library = zonesOf(room(3, 2.4, [wc('wc', 1)]))
    expect(only(library.zones, 'wc').figure).toMatchObject({ from: 'library', entry: 'wc', front: 0.6 })
    const grid = zonesOf(room(3, 2.4, [{ id: 'tank', kind: 'tank', at: [1.5, 1.2], size: [0.5, 0.5], height: 1 }]), { perKind: { tank: { width: 0.6 } } })
    expect(only(grid.zones, 'tank').figure).toMatchObject({ from: 'grid', front: 0.6, widthGiven: true })
  })
})

describe('ARE-73: what is in a zone', () => {
  it('names a fixture standing in it and the zones it overlaps', () => {
    // Two WCs whose centre lines are 0.6 m apart: their 0.8 m zones overlap by 0.2 m.
    const found = zonesOf(room(3, 2.4, [wc('a', 0.8), wc('b', 1.4), { id: 'bin', kind: 'basin', at: [2.4, 0.8], size: [0.3, 0.3], height: 0.8 }, wc('c', 2.4)]), { perKind: { toilet: { front: 0.7, width: 0.8 } } })
    expect(only(found.zones, 'a').overlaps).toEqual(['b'])
    expect(only(found.zones, 'b').overlaps).toEqual(['a'])
    expect(only(found.zones, 'c').standing).toEqual(['bin'])
    expect(only(found.zones, 'c').short).toContain('front')
  })

  it('names a door whose swing reaches into it', () => {
    const plan = room(3, 2, [wc('wc', 0.5)], {
      openings: [{ id: 'door', wall: 'n', type: 'door', offset: 0.1, width: 0.8, height: 2.1, hinge: 'start', swing: 'right' }],
    })
    const found = zonesOf(plan, { perKind: { toilet: { front: 0.7, width: 0.8 } } })
    expect(only(found.zones, 'wc').doors).toEqual(['door'])
    expect(found.doors).toBe(1)
    const unstated = zonesOf(room(3, 2, [wc('wc', 0.5)], { openings: [{ id: 'door', wall: 'n', type: 'door', offset: 0.1, width: 0.8, height: 2.1 }] }))
    expect(only(unstated.zones, 'wc').doors).toEqual([])
    expect(unstated.noSwing).toBe(1)
  })
})

describe('ARE-73: units side by side as one run', () => {
  const unit = (id: string, x: number) => ({ id, kind: 'kitchen-run', at: [x, 0.05 + 0.3], size: [0.6, 0.6], height: 0.9 })

  it('reads three abutting kitchen units as one zone, never 0 mm beside each other', () => {
    const found = zonesOf(room(4, 3, [unit('k1', 0.5), unit('k2', 1.1), unit('k3', 1.7)]), { clearance: 1.2 })
    expect(found.zones).toHaveLength(1)
    const zone = found.zones[0]!
    expect(zone.items).toEqual(['k1', 'k2', 'k3'])
    expect(zone.figure.width).toBeCloseTo(1.8, 9)
    expect(zone.measured.left).toBeCloseTo(1.05, 6)
    expect(zone.short).toEqual([])
    expect(zone.overlaps).toEqual([])
  })

  it('keeps a zone each for WCs side by side, which keep floor at their sides', () => {
    const found = zonesOf(room(4, 3, [wc('a', 1), wc('b', 1.4)]))
    expect(found.zones).toHaveLength(2)
  })
})

describe('ARE-73: the answer', () => {
  it('lists only the zones with findings unless all, and closes with what it took off', () => {
    const plan = room(4, 2.4, [wc('tight', 0.3), wc('free', 2)])
    const survey = surveyPlan(parseFloorPlan(plan))
    const found = activityZones(survey, { perKind: { toilet: { front: 0.7, width: 0.8 } } })
    const short = activityLines(survey, found, false, L)
    expect(short.filter((l) => l.includes(' in "Bathroom"'))).toHaveLength(1)
    expect(short.join('\n')).toContain('1 more zone is at least its figure all round')
    expect(short.join('\n')).toContain('The plan states no north')
    expect(short[short.length - 1]).toMatch(/^Taken off each zone: the footprints of the other fixtures on its floor \(2\)/)
    const every = activityLines(survey, found, true, L)
    expect(every.filter((l) => l.includes(' in "Bathroom"'))).toHaveLength(2)
  })

  it('measures one room when asked, and says what it left out', () => {
    const plan = room(4, 2.4, [wc('wc', 1), { id: 'out', kind: 'toilet', at: [10, 10], size: [0.4, 0.65], height: 0.8 }])
    const found = zonesOf(plan, { room: 'bath' })
    expect(found.zones.map((z) => z.items[0])).toEqual(['wc'])
    expect(found.noRoom).toBe(1)
  })

  it('measures 240 units quickly', () => {
    const items = Array.from({ length: 120 }, (_, i) => wc(`wc${i}`, 0.5 + i * 0.9)).concat(
      Array.from({ length: 120 }, (_, i) => ({ id: `b${i}`, kind: 'basin', at: [0.5 + i * 0.9, 3 - 0.05 - 0.225], size: [0.55, 0.45], height: 0.85, turn: 180 }))
    )
    const survey = surveyPlan(parseFloorPlan(room(110, 3, items)))
    const start = performance.now()
    const found = activityZones(survey, { perKind: { toilet: { front: 0.7, width: 0.8 } } })
    const took = performance.now() - start
    expect(found.zones).toHaveLength(240)
    expect(took).toBeLessThan(3000)
    const text = activityLines(survey, found, false, L).join('\n')
    expect(text.length).toBeLessThan(2000)
  })
})
