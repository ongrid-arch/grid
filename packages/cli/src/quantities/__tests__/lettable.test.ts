/** ARE-68: the lettable area, the core, efficiency, the area per person, frontage zones and the area as written. */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planAreas } from '../areas'
import { optionRow } from '../compare'
import { frontageSide, frontageZones, FRONTAGE_DEPTH } from '../frontage'
import { lettableFigures, peopleRatios, readPeople } from '../lettable'
import { planSeating } from '../seats'
import { surveyPlan } from '../survey'
import { sqFt } from '../units'
import { asWrittenAreas } from '../../mcp/lettableAnswer'
import { seatingPlan, SEATING_ITEMS } from './seatingPlan'
import { shopPlan, towerPlan } from './lettablePlans'

const tower = (options: Parameters<typeof towerPlan>[0] = {}) => surveyPlan(parseFloorPlan(towerPlan(options)))
const netOf = (areas: ReturnType<typeof planAreas>, floor: string, id: string): number => areas.floors.find((f) => f.floor === floor)!.rooms.find((r) => r.id === id)!.net!

describe('ARE-68: the lettable area and the core', () => {
  const areas = planAreas(tower())
  const figures = lettableFigures(areas)

  it('leaves the lift, stair, plant and corridor out of the lettable area', () => {
    const shop = netOf(areas, 'g', 'g-main')
    const office = netOf(areas, 'f1', 'f1-main')
    expect(shop).toBeCloseTo(7.85 * 5.8, 6)
    expect(figures.lettable).toBeCloseTo(shop + office, 6)
    expect(figures.floors.map((f) => f.lettable)).toEqual([shop, office])
    // The net to gross holds the core and the corridors; efficiency does not.
    expect(areas.netToGross!).toBeGreaterThan(figures.efficiency! + 0.1)
    expect(figures.efficiency).toBeCloseTo(figures.lettable / areas.grossInternal!, 9)
    expect(Object.keys(figures.notLettable).sort()).toEqual(['corridor', 'lift', 'plant', 'stair'])
  })

  it('counts the core on every plate, a shaft room counted once in the net included', () => {
    const first = figures.floors.find((f) => f.floor === 'f1')!
    expect(first.coreRooms.map((r) => r.id)).toEqual(['f1-lift', 'f1-stair', 'f1-plant'])
    const core = netOf(areas, 'f1', 'f1-lift') + netOf(areas, 'f1', 'f1-stair') + netOf(areas, 'f1', 'f1-plant')
    expect(first.core).toBeCloseTo(core, 9)
    expect(first.coreShare).toBeCloseTo(core / areas.floors.find((f) => f.floor === 'f1')!.grossInternal!, 9)
    // The shaft over the ground floor's is in no net figure, but it stands on the first floor's plate.
    expect(areas.floors.find((f) => f.floor === 'f1')!.rooms.find((r) => r.id === 'f1-lift')!.countedWith).toBeDefined()
  })

  it('gives the efficiency per floor type, by each floor\'s largest lettable use', () => {
    expect(figures.floorTypes.map((t) => [t.floorType, t.floors])).toEqual([['office', ['f1']], ['retail', ['g']]])
    for (const t of figures.floorTypes) expect(t.efficiency).toBeCloseTo(t.lettable / t.grossInternal!, 9)
  })

  it('reads a room\'s stated tenure before its use', () => {
    const marked = lettableFigures(planAreas(tower({ corridorTenure: 'private', mainTenure: 'common' })))
    const areas = planAreas(tower())
    expect(marked.lettable).toBeCloseTo(netOf(areas, 'g', 'g-corridor') + netOf(areas, 'f1', 'f1-corridor'), 6)
  })

  it('takes the uses or tenures the person counts as lettable instead', () => {
    const offices = lettableFigures(areas, { uses: ['office'] })
    expect(offices.lettable).toBeCloseTo(netOf(areas, 'f1', 'f1-main'), 9)
    expect(offices.chosen).toEqual({ uses: ['office'] })
    expect(offices.rules.lettable).toContain('use office')
  })

  it('appears in a row of grid_compare', () => {
    const row = optionRow('A', tower())
    expect(row.lettable).toBeCloseTo(figures.lettable, 9)
    expect(row.efficiency).toBeCloseTo(figures.efficiency!, 9)
    expect(row.people).toBeUndefined()
  })
})

describe('ARE-68: the area per person', () => {
  const areas = planAreas(tower())
  const letting = lettableFigures(areas)

  it('gives each area per one of a figure for the building', () => {
    const [ratio] = peopleRatios(areas, letting, { asked: { pupils: { count: 100 } } })
    expect(ratio!.kind).toBe('pupils')
    expect(ratio!.from).toBe('asked')
    expect(ratio!.per.grossInternal).toBeCloseTo(areas.grossInternal! / 100, 9)
    expect(ratio!.per.net).toBeCloseTo(areas.net / 100, 9)
    expect(ratio!.per.lettable).toBeCloseTo(letting.lettable / 100, 9)
  })

  it('measures a figure for named rooms on their net only, and the call before the brief', () => {
    const ratios = peopleRatios(areas, letting, { asked: { keys: { count: 4 } }, brief: { keys: { count: 99 }, covers: { count: 10, rooms: ['Shop'] } } })
    expect(ratios.map((r) => [r.kind, r.count, r.from])).toEqual([['covers', 10, 'brief'], ['keys', 4, 'asked']])
    const covers = ratios.find((r) => r.kind === 'covers')!
    expect(covers.per.net).toBeCloseTo(netOf(areas, 'g', 'g-main') / 10, 9)
    expect(covers.per.grossInternal).toBeNull()
  })

  it('uses the covers and desks counted from the furniture when no figure is given', () => {
    const survey = surveyPlan(parseFloorPlan(seatingPlan(SEATING_ITEMS)))
    const seated = planAreas(survey)
    const ratios = peopleRatios(seated, lettableFigures(seated), {}, planSeating(survey).plan)
    expect(ratios.map((r) => [r.kind, r.count, r.from])).toEqual([['covers', 4, 'counted'], ['desks', 5, 'counted']])
  })

  it('reads a figure as a whole number or a count with rooms, and refuses anything else', () => {
    expect(readPeople({ pupils: 420, covers: { count: 80, rooms: ['Dining hall'] } }, 'people')).toEqual({ pupils: { count: 420 }, covers: { count: 80, rooms: ['Dining hall'] } })
    expect(readPeople({ pupils: 0 }, 'people')).toMatch(/whole number from 1/)
    expect(readPeople({ guests: 3 }, 'people')).toMatch(/figures it knows are pupils, covers, keys/)
    expect(readPeople({ keys: { count: 2, beds: 3 } }, 'people')).toMatch(/count and rooms only/)
  })
})

describe('ARE-68: a shop by depth bands from its frontage', () => {
  const survey = surveyPlan(parseFloorPlan(shopPlan()))
  const room = survey.byId.get('shop')!

  it('finds the frontage on the wall the room opens through most, and cuts bands of 6.1 m', () => {
    const side = frontageSide(room)!
    expect(side.found).toBe('openings')
    expect(side.edge.wall?.id).toBe('south')
    const zones = frontageZones(room, side)
    expect(zones.depth).toBe(FRONTAGE_DEPTH)
    expect(zones.width).toBeCloseTo(6, 9)
    expect(zones.bands.map((b) => b.name)).toEqual(['A', 'B', 'C', 'the rest'])
    const expected = [6 * 6.1, 6 * 6.1, 6 * 6.1, 6 * (20 - 3 * 6.1)]
    zones.bands.forEach((band, i) => {
      expect(band.area).toBeCloseTo(expected[i]!, 6)
      expect(band.sqFt).toBeCloseTo(sqFt(expected[i]!), 6)
    })
    expect(zones.area).toBeCloseTo(120, 6)
    expect(zones.area).toBeCloseTo(planAreas(survey).net, 6)
  })

  it('measures from the wall named, at the depth and bands asked for', () => {
    const zones = frontageZones(room, frontageSide(room, 'north')!, 5, 2)
    expect(zones.found).toBe('named')
    expect(zones.wall).toBe('north')
    expect(zones.bands.map((b) => b.area)).toEqual([expect.closeTo(30, 6), expect.closeTo(30, 6), expect.closeTo(60, 6)])
    expect(frontageSide(room, 'nowhere')).toBeNull()
  })
})

describe('ARE-68: a room\'s area as written, to its walls\' centre lines', () => {
  it('measures the shop to the middle of its walls', () => {
    const written = asWrittenAreas(surveyPlan(parseFloorPlan(shopPlan())))
    expect(written.get('ground\u0000shop') ?? [...written.values()][0]).toBeCloseTo(6.2 * 20.2, 6)
  })

  it('measures a room between thick and thin walls to the middle of each', () => {
    const written = asWrittenAreas(tower())
    // The lift: x 9 to 12 and y 0 to 2 on centre lines.
    expect(written.get('g\u0000g-lift')).toBeCloseTo(3 * 2, 6)
  })
})
