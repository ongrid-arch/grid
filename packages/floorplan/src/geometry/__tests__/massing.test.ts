/**
 * BRF-4 (C17, lab FD-1): a floor outline before any wall, and with rooms inside it.
 *
 * FD-1's plot is the lab's I series plot (`I/scenarios/s5-plot`): corners (0, 0), (18, 0),
 * (22, 25) and (0, 25), 500 m² by hand ((18 + 22) / 2 × 25). The massing outline is the outside
 * face of the house the second attempt drew in it, (3, 5), (15.762, 5), (18.482, 22) and (3, 22):
 * (12.762 + 15.482) / 2 × 17 = 240.074 m² a floor by hand, on two floors 3 m high.
 */
import { describe, expect, it } from 'vitest'
import { labPlanText } from '../../test-support/lab'
import { parseFloorPlan, safeParseFloorPlan } from '../../types/floorplan'
import { planAreaFigures } from '../areas'
import { planEnvelope } from '../envelope'
import { indexPlan } from '../plan'
import { siteMeasures } from '../site'
import { buildingHeight, planStoreys } from '../storeys'
import { validatePlan } from '../validate'
import { readPlanParts } from '../../types/readParts'
import { readingNotes } from '../../types/reading'
import { readRoomsText } from '../../rooms/read'
import { compileRoomsText } from '../../rooms/compile'

const PLOT = [[0, 0], [18, 0], [22, 25], [0, 25]]
const OUTLINE = [[3, 5], [15.762, 5], [18.482, 22], [3, 22]]
const BY_HAND = ((15.762 - 3 + (18.482 - 3)) / 2) * 17

const massing = (floors: Record<string, unknown>[] = []) =>
  parseFloorPlan({
    version: '1',
    units: 'm',
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0, height: 3, building: 'home', outline: OUTLINE, homes: 2, parking: 3 },
      { id: 'first', name: 'First floor', level: 1, height: 3, building: 'home', outline: OUTLINE, homes: 2 },
      ...floors,
    ],
    site: { boundary: PLOT, streets: [1], setbacks: [{ from: 'all', distance: 3, source: 'given' }] },
  })

/** The second attempt's house, walls and rooms, on the ground floor, with an outline stated. */
const house = (outline: number[][]) => {
  const raw = JSON.parse(labPlanText('I/scenarios/s5-plot/attempt-2-house-only.json')) as Record<string, unknown>
  return parseFloorPlan({ ...raw, floors: [{ id: 'ground', name: 'Ground floor', level: 0, outline }], site: { boundary: PLOT } })
}

describe('FD-1: massing on the plot, before any wall', () => {
  it('gives the gross area per floor and a storey count with no wall in the plan', () => {
    const plan = massing()
    expect(plan.walls).toEqual([])
    const areas = planAreaFigures(plan)
    expect(areas.floors.map((f) => [f.floor, f.massing, f.grossExternal])).toEqual([
      ['ground', true, expect.closeTo(BY_HAND, 6)],
      ['first', true, expect.closeTo(BY_HAND, 6)],
    ])
    expect(areas.grossExternal.area).toBeCloseTo(2 * BY_HAND, 6)
    expect(areas.grossExternal.rule.name).toBe('Gross external area')
    expect(areas.floors[0]!.grossInternal).toBeNull()
    expect(areas.grossInternal.area).toBeNull()
    expect(areas.floors[0]!.why).toMatch(/outline with no walls yet/)
    expect(areas.net.area).toBe(0)
    expect(areas.notes[0]).toMatch(/^Floors "Ground floor", "First floor" are massing/)

    const storeys = planStoreys(plan)
    expect([storeys.above, storeys.below]).toEqual([2, 0])
    expect(storeys.storeys.map((s) => s.floors)).toEqual([['ground'], ['first']])
  })

  it('counts a basement apart, two floors on one level as one storey, and a floor holding nothing in none', () => {
    const plan = massing([
      { id: 'cellar', name: 'Cellar', level: -1, height: 2.5, outline: OUTLINE },
      { id: 'annex', name: 'Annex', level: 1, height: 3, outline: [[4, 6], [6, 6], [6, 8], [4, 8]] },
      { id: 'roof', name: 'Roof', level: 2 },
    ])
    const storeys = planStoreys(plan)
    expect([storeys.above, storeys.below]).toEqual([2, 1])
    expect(storeys.storeys.find((s) => s.level === 1)!.floors).toEqual(['first', 'annex'])
    expect(storeys.empty).toEqual(['roof'])
  })

  it('gives the slab and the roof from the outline, and stands 6.50 m high to the top of its roof', () => {
    const plan = massing()
    const envelope = planEnvelope(plan)
    expect(envelope.floors.map((f) => [f.floor, f.slab?.area, f.roof?.area ?? null])).toEqual([
      ['ground', expect.closeTo(BY_HAND, 6), null],
      ['first', expect.closeTo(BY_HAND, 6), expect.closeTo(BY_HAND, 6)],
    ])
    // 3 m, the first floor's 0.25 m slab, 3 m and the 0.25 m roof over it.
    expect(buildingHeight(plan)).toEqual({ height: 6.5, floor: 'first', ground: 0, groundStated: false, from: 'floor' })
  })

  it('stands on the plot: 48.0% covered and 3 m from the west edge, measured from the outline', () => {
    const site = siteMeasures(massing())
    expect(site.boundary!.area).toBe(500)
    expect(site.coverage).toBeCloseTo(BY_HAND / 500, 6)
    expect(site.edges.find((e) => e.edge.edge === 4)!.distance).toBeCloseTo(3, 6)
    expect(site.edges.every((e) => e.short === null)).toBe(true)
  })

  it('leaves a massing floor unchecked inside: no floor no room claims, no empty top floor, no empty plan', () => {
    const plan = massing()
    const codes = validatePlan(plan, indexPlan(plan)).issues.map((i) => i.code)
    expect(codes).not.toContain('floor/unclaimed')
    expect(codes).not.toContain('floor/empty-top')
    expect(readingNotes(JSON.parse(JSON.stringify(plan))).map((n) => n.kind)).not.toContain('empty')
  })
})

describe('a floor outline with rooms inside it', () => {
  it('reads as before when the outline is the walls\' own outside face', () => {
    const raw = JSON.parse(labPlanText('I/scenarios/s5-plot/attempt-2-house-only.json')) as Record<string, unknown>
    const plain = planAreaFigures(parseFloorPlan(raw))
    const outlined = planAreaFigures(house(OUTLINE))
    // The outline is the outside face to the millimetre; the walls' join keeps more digits.
    expect(outlined.grossExternal.area).toBeCloseTo(plain.grossExternal.area!, 2)
    expect(outlined.grossInternal.area).toBeCloseTo(plain.grossInternal.area!, 2)
    expect(outlined.net.area).toBe(plain.net.area)
  })

  it('gives the floor no room claims inside the outline past the walls, and the slab and roof over it', () => {
    // The outline reaches 4 m further north than the house: a wing still to draw.
    const wing = [[3, 5], [15.762, 5], [18.482, 22], [18.482, 26], [3, 26]]
    const plan = house(wing)
    const areas = planAreaFigures(plan)
    const plain = planAreaFigures(house([[3, 5], [15.762, 5], [18.482, 22], [3, 22]]))
    const extra = 4 * (18.482 - 3)
    expect(areas.floors[0]!.unclaimed! - plain.floors[0]!.unclaimed!).toBeCloseTo(extra, 2)
    expect(areas.grossExternal.area! - plain.grossExternal.area!).toBeCloseTo(extra, 2)
    expect(areas.floors[0]!.massing).toBe(false)
    const unclaimed = validatePlan(plan, indexPlan(plan)).issues.filter((i) => i.code === 'floor/unclaimed')
    expect(unclaimed.map((i) => i.message).some((m) => m.includes(`${extra.toFixed(2)} m²`))).toBe(true)
    const envelope = planEnvelope(plan).floors[0]!
    expect(envelope.slab!.area).toBeCloseTo(plain.grossExternal.area! + extra, 2)
    expect(envelope.roof!.area).toBeCloseTo(envelope.slab!.area, 6)
  })

  it('says when the walls reach past the outline the floor states (floor/past-outline)', () => {
    // An outline 2 m short of the house's west face: the walls reach 2 × 17 = 34 m² past it.
    const plan = house([[5, 5], [15.762, 5], [18.482, 22], [5, 22]])
    const past = validatePlan(plan, indexPlan(plan)).issues.filter((i) => i.code === 'floor/past-outline')
    expect(past).toHaveLength(1)
    expect(past[0]!.message).toBe('Floor "ground"\'s walls reach 34.00 m² past the outline it states. The slab, the roof and the gross area take in both, so the floor is larger than its outline.')
    expect(planAreaFigures(plan).grossExternal.area).toBeCloseTo(planAreaFigures(house(OUTLINE)).grossExternal.area!, 3)
  })
})

describe('the outline in the plan file (C17)', () => {
  it('is optional and never defaulted: a floor that states none reads as before', () => {
    const plan = parseFloorPlan({ version: '1', units: 'm', floors: [{ id: 'g', name: 'G', level: 0 }] })
    expect(plan.floors![0]).toEqual({ id: 'g', name: 'G', level: 0 })
  })

  it('refuses an outline that crosses itself, or homes that are not a whole number', () => {
    const bow = safeParseFloorPlan({ version: '1', units: 'm', floors: [{ id: 'g', name: 'G', outline: [[0, 0], [4, 4], [4, 0], [0, 4]] }] })
    expect(bow).toBeNull()
    expect(safeParseFloorPlan({ version: '1', units: 'm', floors: [{ id: 'g', name: 'G', homes: 1.5 }] })).toBeNull()
    expect(safeParseFloorPlan({ version: '1', units: 'm', floors: [{ id: 'g', name: 'G', outline: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]] }] })?.floors?.[0]?.outline).toHaveLength(5)
  })

  it('leaves a faulty outline out on its own when read part by part, and keeps the floor', () => {
    const read = readPlanParts({ version: '1', units: 'm', floors: [{ id: 'g', name: 'G', outline: [[0, 0], [4, 4], [4, 0], [0, 4]] }] })
    expect(read.plan?.floors?.[0]?.id).toBe('g')
    expect(read.plan?.floors?.[0]?.outline).toBeUndefined()
  })

  it('keeps the outline, the homes and the parking through rooms text, on a raw floor line', () => {
    const plan = house(OUTLINE)
    const withCounts = parseFloorPlan({ ...plan, floors: [{ ...plan.floors![0]!, homes: 1, parking: 2 }] })
    const reading = readRoomsText(withCounts)
    expect(reading.text).toContain('raw floor {"outline":[[3,5],[15.762,5],[18.482,22],[3,22]],"homes":1,"parking":2}')
    const again = compileRoomsText(reading.text)
    expect('plan' in again && again.plan !== null ? again.plan.floors?.[0] : null).toMatchObject({ outline: OUTLINE, homes: 1, parking: 2 })
  })
})
