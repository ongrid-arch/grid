/**
 * CNT-4: flats, from the plan's own list (C18). The four-flat floor's areas per flat come from
 * the list, not from the rooms' names (lab EL-1); a flat type placed four times, two of them
 * mirrored, writes four flats of one type; a duplex holds rooms on two floors; and the list's own
 * faults are named, each leaving out only what it names.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { planAreaFigures } from '../areas'
import { flatOutlines, planFlats } from '../flats'
import { planForFloor } from '../floors'
import { buildFloorPlan } from '../floorplan'
import { validatePlan } from '../validate'
import { duplexHouse, edit, flat, twoFloorHouse } from '../../test-support/plans'
import type { FloorPlan } from '../plan'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')
const text = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')
const written = (rooms: string): FloorPlan => {
  const result = compileRoomsText(rooms)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}
const flatCodes = (plan: FloorPlan): string[] => validatePlan(plan).issues.filter((i) => i.code.startsWith('flat/')).map((i) => `${i.code} ${i.id}`)

/** The lab's four-flat floor (AC-1, EL-1), as the lab drew it: room names with a flat's letter in front, no flats list. */
const original = (): FloorPlan => parseFloorPlan(JSON.parse(text('four-flats.plan.json')))

describe('CNT-4 the four-flat floor, flat by flat (lab EL-1)', () => {
  it('gives 68.27 m² for flats A and B and 99.23 m² for C and D, from the flats rooms text writes', () => {
    const plan = written(text('four-flats.rooms'))
    expect(plan.flatTypes).toEqual([{ id: 'flat1', name: 'One bedroom' }, { id: 'flat2', name: 'Two bedrooms' }])
    const figures = planAreaFigures(plan)
    expect(figures.flats.map((f) => [f.id, f.name, f.type, f.mirrored, f.rooms.length, Number(f.net.toFixed(2))])).toEqual([
      ['A', 'Flat A', 'flat1', false, 5, 68.27],
      ['B', 'Flat B', 'flat1', true, 5, 68.27],
      ['C', 'Flat C', 'flat2', false, 6, 99.23],
      ['D', 'Flat D', 'flat2', true, 6, 99.23]
    ])
    // The common parts: the stair, the lift, the riser and the corridor.
    expect(figures.notInFlats).toBeCloseTo(84.49, 2)
    expect(figures.notInFlats + figures.flats.reduce((s, f) => s + f.net, 0)).toBeCloseTo(figures.net.area!, 9)
    expect(flatCodes(plan)).toEqual([])
  })

  it('reads the flats from the list, never from the names: the lab\'s own file gives none until it lists them, and the same figures with every name changed', () => {
    const lab = original()
    // Every room is named "Flat A …" to "Flat D …", and no figure is read from that.
    expect(lab.rooms.filter((r) => /^Flat [A-D] /.test(r.name))).toHaveLength(22)
    expect(planAreaFigures(lab).flats).toEqual([])
    expect(planAreaFigures(lab).notInFlats).toBeCloseTo(planAreaFigures(lab).net.area!, 9)

    const listed: FloorPlan = {
      ...lab,
      flatTypes: [{ id: 'one-bed', name: 'One bedroom' }, { id: 'two-bed', name: 'Two bedrooms' }],
      flats: [
        { id: 'A', type: 'one-bed', rooms: ['A-living', 'A-bed1', 'A-kitchen', 'A-hall', 'A-bath'] },
        { id: 'B', type: 'one-bed', rooms: ['B-living', 'B-bed1', 'B-kitchen', 'B-hall', 'B-bath'], mirrored: true },
        { id: 'C', type: 'two-bed', rooms: ['C-living', 'C-bed1', 'C-bed2', 'C-kitchen', 'C-hall', 'C-bath'] },
        { id: 'D', type: 'two-bed', rooms: ['D-living', 'D-bed1', 'D-bed2', 'D-kitchen', 'D-hall', 'D-bath'], mirrored: true }
      ]
    }
    const areas = (plan: FloorPlan): number[] => planAreaFigures(plan).flats.map((f) => Number(f.net.toFixed(2)))
    expect(areas(listed)).toEqual([68.27, 68.27, 99.23, 99.23])
    // The same list with every room's name changed to one that names no flat.
    const renamed = { ...listed, rooms: listed.rooms.map((r, i) => ({ ...r, name: `Room ${i + 1}` })) }
    expect(areas(renamed)).toEqual([68.27, 68.27, 99.23, 99.23])
    // And the list decides: flat A given C's living room is that much larger.
    const moved = edit(listed, (p) => {
      p.flats![0]!.rooms.push('C-living')
      p.flats![2]!.rooms = p.flats![2]!.rooms.filter((id) => id !== 'C-living')
    })
    const living = planAreaFigures(listed).floors[0]!.rooms.find((r) => r.id === 'C-living')!.area
    expect(planAreaFigures(moved).flats[0]!.net).toBeCloseTo(68.2671 + living, 6)
  })

  it('draws each flat as one outline along the middle of the walls round it, the next flat\'s on the other side of the same line', () => {
    const plan = written(text('four-flats.rooms'))
    const outlines = flatOutlines(plan)
    expect(outlines.map((o) => [o.id, o.rings.length, o.rings[0]!.length])).toEqual([['A', 1, 4], ['B', 1, 4], ['C', 1, 4], ['D', 1, 4]])
    const box = (id: string): number[] => {
      const ring = outlines.find((o) => o.id === id)!.rings[0]!
      return [Math.min(...ring.map((p) => p.x)), Math.min(...ring.map((p) => p.y)), Math.max(...ring.map((p) => p.x)), Math.max(...ring.map((p) => p.y))].map((v) => Number(v.toFixed(4)) + 0)
    }
    // Flat A from the middle of the outside walls (x 0, y 0) to the middle of the wall it shares with the stair and the corridor.
    expect(box('A')).toEqual([0, 0, 10, 7.6])
    // Flats C and D meet on one line, the middle of the wall between them.
    expect(box('C')[2]).toBeCloseTo(box('D')[0]!, 6)
    expect(buildFloorPlan(plan).flats.map((f) => f.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(buildFloorPlan(original()).flats).toEqual([])
  })
})

describe('CNT-4 a flat type placed many times, mirrored (WRT-4)', () => {
  const ROW = [
    'plan "Four of one flat"',
    'walls outside 0.3 inside 0.1 height 2.7',
    'unit one flat "One bedroom" "Flat {n}"',
    '  room living "Flat {n} Living room" living 5 x 4',
    '  room bed    "Flat {n} Bedroom"     bedroom 3 x 4 east of living',
    '  door d-bed between living and bed, 1 from south, 0.8 wide',
    'end',
    'repeat one 2 east as A at 0,0',
    'repeat one 2 east as B north of A1 mirror east-west'
  ].join('\n')

  it('writes four flats of the one type, two of them mirrored, each its own rooms and the same size', () => {
    const plan = written(ROW)
    expect(plan.flatTypes).toEqual([{ id: 'one', name: 'One bedroom' }])
    expect(plan.flats!.map((f) => [f.id, f.name, f.type, f.mirrored === true, f.rooms])).toEqual([
      ['A1', 'Flat A1', 'one', false, ['living-A1', 'bed-A1']],
      ['A2', 'Flat A2', 'one', false, ['living-A2', 'bed-A2']],
      ['B1', 'Flat B1', 'one', true, ['living-B1', 'bed-B1']],
      ['B2', 'Flat B2', 'one', true, ['living-B2', 'bed-B2']]
    ])
    const nets = planAreaFigures(plan).flats.map((f) => f.net)
    for (const net of nets) expect(net).toBeCloseTo(32, 6)
    expect(flatCodes(plan)).toEqual([])
    // The mirrored ones are mirror images: the bedroom on the other side of the living room.
    const rooms = buildFloorPlan(plan).rooms
    const x = (id: string): number => rooms.find((r) => r.id === id)!.labelAt.x
    expect(x('bed-A1') > x('living-A1')).toBe(true)
    expect(x('bed-B1') < x('living-B1')).toBe(true)
  })

  it('makes a flat of each copy of a floor, with the copy\'s id in front, and keeps a removed room out of its flat', () => {
    const plan = written([
      ...ROW.split('\n').slice(0, 7),
      'floor g "Ground floor" level 0',
      'place one as A at 0,0',
      'floor f1 "First floor" level 1 copy g',
      'remove bed-A'
    ].join('\n'))
    expect(plan.flats!.map((f) => [f.id, f.rooms])).toEqual([
      // LVL-16: the floor that places a flat first keeps its ids as written; the copy's take its id in front.
      ['A', ['living-A', 'bed-A']],
      ['f1-A', ['f1-living-A']]
    ])
  })
})

describe('CNT-4 a duplex: one flat on two floors', () => {
  it('holds rooms on both floors, measured floor by floor and in all, with no fault', () => {
    const plan = duplexHouse()
    expect(flatCodes(plan)).toEqual([])
    const [duplex, studio] = planAreaFigures(plan).flats
    expect(duplex!.floors).toEqual(['ground', 'first'])
    expect(Object.keys(duplex!.byFloor)).toEqual(['ground', 'first'])
    const rooms = planAreaFigures(plan).floors.flatMap((f) => f.rooms)
    const of = (ids: string[]): number => rooms.filter((r) => ids.includes(r.id)).reduce((s, r) => s + r.area, 0)
    expect(duplex!.byFloor['ground']).toBeCloseTo(of(['hall', 'kitchen']), 9)
    expect(duplex!.byFloor['first']).toBeCloseTo(of(['landing', 'study']), 9)
    expect(duplex!.net).toBeCloseTo(of(['hall', 'kitchen', 'landing', 'study']), 9)
    expect(studio!.floors).toEqual(['ground'])
    expect(planAreaFigures(plan).notInFlats).toBeCloseTo(0, 9)
  })

  it('is drawn on each of its floors, and a floor asked for alone measures its part of it', () => {
    const plan = duplexHouse()
    expect(flatOutlines(planForFloor(plan, 'ground')).map((o) => o.id)).toEqual(['D1', 'S1'])
    expect(flatOutlines(planForFloor(plan, 'first')).map((o) => o.id)).toEqual(['D1'])
    const first = planAreaFigures(plan, { floors: ['first'] }).flats
    expect(first.map((f) => f.id)).toEqual(['D1'])
    expect(first[0]!.net).toBeCloseTo(planAreaFigures(plan).flats[0]!.byFloor['first']!, 9)
    // A floor's slice is no fault: the duplex's rooms on the other floor are still the plan's.
    expect(validatePlan(planForFloor(plan, 'first')).issues.filter((i) => i.code.startsWith('flat/'))).toEqual([])
  })
})

describe('CNT-4 the flats list\'s own faults', () => {
  const listed = (flats: NonNullable<FloorPlan['flats']>, flatTypes?: FloorPlan['flatTypes']): FloorPlan => ({ ...flat(), flats, ...(flatTypes === undefined ? {} : { flatTypes }) })

  it('names a room the plan does not have, with the room most likely meant, and counts the rest', () => {
    const plan = listed([{ id: 'F', rooms: ['hall', 'kitchn'] }])
    const issue = validatePlan(plan).issues.find((i) => i.code === 'flat/unknown-room')!
    expect(issue).toMatchObject({ entity: 'flat', id: 'F', severity: 'warning' })
    expect(issue.message).toContain('"kitchn"')
    expect(issue.message).toContain('"kitchen" is the room most likely meant')
    expect(planFlats(plan)[0]!.rooms.map((r) => r.id)).toEqual(['hall'])
    expect(planAreaFigures(plan).flats[0]!.rooms).toEqual(['hall'])
  })

  it('names a room in two flats and counts it in the flat whose id comes first, whatever the file\'s order', () => {
    const f1 = { id: 'F1', rooms: ['hall', 'kitchen'] }
    const f2 = { id: 'F2', rooms: ['kitchen', 'bedroom'] }
    for (const plan of [listed([f1, f2]), listed([f2, f1])]) {
      expect(flatCodes(plan)).toEqual(['flat/room-in-two F2'])
      const rooms = new Map(planAreaFigures(plan).flats.map((f) => [f.id, f.rooms] as const))
      expect(rooms.get('F1')).toEqual(['hall', 'kitchen'])
      expect(rooms.get('F2')).toEqual(['bedroom'])
    }
  })

  it('names a placement of a type the plan does not state, a flat listed twice and a type stated twice', () => {
    const plan = listed(
      [{ id: 'F', type: 'one-bd', rooms: ['hall'] }, { id: 'F', rooms: ['kitchen'] }, { id: 'G', type: 'two-bed', rooms: ['bedroom'] }],
      [{ id: 'one-bed' }, { id: 'one-bed', name: 'Again' }, { id: 'two-bed' }]
    )
    expect(flatCodes(plan).sort()).toEqual(['flat/duplicate-id F', 'flat/duplicate-type one-bed', 'flat/unknown-type F'])
    expect(validatePlan(plan).issues.find((i) => i.code === 'flat/unknown-type')!.message).toContain('"one-bed" is the type most likely meant')
    // The first flat with the id is the flat; the second is left out of every figure.
    expect(planAreaFigures(plan).flats.map((f) => [f.id, f.rooms])).toEqual([['F', ['hall']], ['G', ['bedroom']]])
    // A plan that states no types at all says so.
    expect(validatePlan(listed([{ id: 'F', type: 'x', rooms: ['hall'] }])).issues.find((i) => i.code === 'flat/unknown-type')!.message).toContain('(it states none)')
  })

  it('names a zone listed without its room, which adds nothing to the flat', () => {
    const plan = edit(flat(), (p) => {
      p.walls.push({ id: 'zone-line', start: [5, 0], end: [5, 4], thickness: 0, height: 2.7, kind: 'partition', virtual: true })
      p.rooms.push({ id: 'cook', name: 'Cooking', use: 'kitchen', boundary: ['s2', 'e1', 'kb2', 'zone-line'], partOf: 'kitchen' })
      p.flats = [{ id: 'F', rooms: ['hall', 'cook'] }]
    })
    expect(flatCodes(plan)).toEqual(['flat/zone-without-room F'])
    const figure = planAreaFigures(plan).flats[0]!
    expect(figure.rooms).toEqual(['hall'])
    expect(figure.notCounted).toEqual([{ id: 'cook', why: 'zone' }])
  })

  it('reads a plan without flats exactly as before', () => {
    const plan = twoFloorHouse()
    expect(planFlats(plan)).toEqual([])
    expect(flatCodes(plan)).toEqual([])
    expect(planAreaFigures(plan).flats).toEqual([])
    expect(buildFloorPlan(plan).flats).toEqual([])
  })

  it('refuses a flat with no rooms, as the format holds it', () => {
    expect(() => parseFloorPlan({ ...flat(), flats: [{ id: 'F', rooms: [] }] })).toThrow(/at least one room/)
  })
})
