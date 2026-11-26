import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { MEASURES, planAreaFigures, usualGross, type FloorAreaFigures } from '../areas'
import { edit, flat, madeVirtual, stairRoomHouse } from '../../test-support/plans'

/**
 * ARE-9: net, gross internal and gross external area from the spaces, each saying what it
 * measures, named as ARE-8 decided (lab AR-6, AR-16, AC-9).
 */
const FIXTURES = resolve(__dirname, '../../../fixtures')
const fixture = (name: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')))
const fixtureNames = readdirSync(FIXTURES).filter((name) => name.endsWith('.json'))

/** The same plan twice, one floor above the other. */
function twoFloors(plan: FloorPlan): FloorPlan {
  const up = (id: string): string => `${id}-up`
  return parseFloorPlan({
    ...plan,
    floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
    walls: [...plan.walls.map((w) => ({ ...w, floor: 'ground' })), ...plan.walls.map((w) => ({ ...w, id: up(w.id), floor: 'first' }))],
    rooms: [
      ...plan.rooms.map((r) => ({ ...r, floor: 'ground' })),
      ...plan.rooms.map((r) => ({ ...r, id: up(r.id), floor: 'first', boundary: r.boundary.map(up), ...(r.holes ? { holes: r.holes.map((h) => h.map(up)) } : {}) })),
    ],
    openings: [...plan.openings.map((o) => ({ ...o, floor: 'ground' })), ...plan.openings.map((o) => ({ ...o, id: up(o.id), wall: up(o.wall), floor: 'first' }))],
  })
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

/** Gross external, less what the floor is made of: 0 to the last digits on every floor. */
const externalGap = (f: FloorAreaFigures): number => f.grossExternal! - (f.net + f.overStairs + f.outsideRooms + f.walls! + f.unclaimed! - f.offSpace!)
const internalGap = (f: FloorAreaFigures): number => f.grossInternal! + f.outsideRooms - (f.net + f.overStairs + f.outsideRooms + (f.walls! - f.outerWalls!) + f.unclaimed! - f.offSpace!)

describe('ARE-9 the lab flat (AR-6): net, gross internal and gross external, each with what it measures', () => {
  const areas = planAreaFigures(fixture('two-bed-flat.json'))

  it('is 62.65 m² net inside 75.05 m² gross external, with a gross internal figure between them', () => {
    expect(areas.net.area).toBeCloseTo(62.65, 6)
    expect(areas.grossExternal.area).toBeCloseTo(75.05, 6)
    // 9.5 × 7.9 m outside, 0.3 m outer walls: 8.9 × 7.3 m inside them.
    expect(areas.grossInternal.area).toBeCloseTo(8.9 * 7.3, 6)
  })

  it('gives every figure its rule: what it measures, what it does not take off, what the plan cannot say', () => {
    for (const figure of [areas.net, areas.grossInternal, areas.grossExternal]) {
      expect(figure.rule).toBe(MEASURES[figure.measure])
      for (const sentence of [figure.rule.measures, figure.rule.notTakenOff, figure.rule.cannotSay]) expect(sentence).toMatch(/^[A-Z].{20,}\.$/)
      expect(figure.why).toBeNull()
    }
    expect(areas.grossInternal.rule.measures).toContain('inside face')
    expect(areas.grossExternal.rule.measures).toContain('outside face')
  })
})

describe('ARE-9 per floor, net plus walls plus unclaimed floor is the gross', () => {
  it.each(fixtureNames)('%s: within 1e-6 m², on every floor, and the rooms match the spaces', (name) => {
    const plan = fixture(name)
    // A fixture of one floor is also stacked on itself; one of several floors (CNT-9's stand-in
    // for S-10) already is, and `twoFloors` would put its upper walls on the ground floor.
    const stacked = (plan.floors?.length ?? 0) > 1 ? [] : [twoFloors(plan)]
    for (const areas of [plan, ...stacked].map((p) => planAreaFigures(p))) {
      for (const f of areas.floors) {
        expect(Math.abs(f.offSpace!)).toBeLessThan(1e-6)
        expect(Math.abs(f.grossExternal! - (f.net + f.walls! + f.unclaimed!))).toBeLessThan(1e-6)
        expect(Math.abs(internalGap(f))).toBeLessThan(1e-6)
        expect(f.grossInternal!).toBeGreaterThanOrEqual(f.net)
        expect(f.grossInternal!).toBeLessThanOrEqual(f.grossExternal!)
      }
    }
  })

  it('takes the walls that face outside from the worked-out answer (MSG-13), not from the stated kind', () => {
    const stated = fixture('two-bed-flat.json')
    const unstated = parseFloorPlan({ ...stated, walls: stated.walls.map((w) => ({ ...w, kind: 'interior' })) })
    expect(planAreaFigures(unstated).grossInternal.area).toBeCloseTo(planAreaFigures(stated).grossInternal.area!, 9)
  })

  it('says how much room floor is not enclosed floor counted once, and the sum still holds', () => {
    // Two copies of one room: its floor counted twice.
    const plan = fixture('two-bed-flat.json')
    const twice = parseFloorPlan({ ...plan, rooms: [...plan.rooms, { ...plan.rooms[0]!, id: 'copy' }] })
    const areas = planAreaFigures(twice)
    const f = areas.floors[0]!
    expect(f.offSpace).toBeCloseTo(areas.floors[0]!.rooms.find((r) => r.id === 'copy')!.area, 6)
    expect(Math.abs(externalGap(f))).toBeLessThan(1e-6)
    expect(areas.notes.some((n) => n.includes('counted twice'))).toBe(true)
  })
})

describe('ARE-9 per-use and per-floor figures add up to the totals (AC-9)', () => {
  const plan = twoFloors(fixture('three-bed-house.json'))
  const areas = planAreaFigures(plan)

  it('adds the floors up to each total', () => {
    expect(areas.floors).toHaveLength(2)
    for (const [measure, pick] of [['net', (f: FloorAreaFigures) => f.net], ['grossInternal', (f: FloorAreaFigures) => f.grossInternal!], ['grossExternal', (f: FloorAreaFigures) => f.grossExternal!]] as const) {
      expect(areas[measure].area).toBeCloseTo(areas.floors.reduce((s, f) => s + pick(f), 0), 9)
    }
  })

  it('adds the uses up to the net, on each floor and in all', () => {
    const total = (byUse: Readonly<Record<string, number>>): number => Object.values(byUse).reduce((a, b) => a + b, 0)
    for (const f of areas.floors) expect(total(f.byUse)).toBeCloseTo(f.net, 9)
    expect(total(areas.byUse)).toBeCloseTo(areas.net.area!, 9)
    expect(Object.keys(areas.byUse).length).toBeGreaterThan(1)
  })

  it('names a room it could not draw as left out of every figure', () => {
    const base = fixture('two-bed-flat.json')
    const ghost = { id: 'ghost', name: 'Box room', boundary: ['no-such-wall-a', 'no-such-wall-b', 'no-such-wall-c'] }
    const broken = planAreaFigures(parseFloorPlan({ ...base, rooms: [...base.rooms, ghost] }))
    expect(broken.leftOut).toEqual([{ id: 'ghost', name: 'Box room', floor: broken.floors[0]!.floor }])
    expect(broken.floors[0]!.rooms.map((r) => r.id)).not.toContain('ghost')
    expect(broken.net.area).toBeCloseTo(62.65, 6)
    expect(broken.notes.find((n) => n.startsWith('Left out of every figure'))).toContain('"Box room"')
  })

  it('lists rooms named outside apart: in no net, gross internal or gross external figure (ARE-29)', () => {
    const base = fixture('two-bed-flat.json')
    const room = base.rooms[0]!
    const whole = planAreaFigures(base)
    const apart = planAreaFigures(base, { outside: new Set([room.id]) })
    const area = whole.floors[0]!.rooms.find((r) => r.id === room.id)!.area
    expect(apart.net.area).toBeCloseTo(whole.net.area! - area, 9)
    expect(apart.outsideRooms).toBeCloseTo(area, 9)
    // The walls round it face outside now, so the floor under them is no gross internal floor either.
    expect(apart.grossInternal.area!).toBeLessThanOrEqual(whole.grossInternal.area! - area + 1e-9)
    expect(apart.grossExternal.area).toBeCloseTo(whole.grossExternal.area! - area, 6)
    expect(apart.grossExternal.area!).toBeGreaterThanOrEqual(apart.grossInternal.area!)
  })

  it('treats a room named outside as outdoor space for both gross figures (ARE-29)', () => {
    const base = fixture('two-bed-flat.json')
    const id = base.rooms[0]!.id
    const named = planAreaFigures(base, { outside: new Set([id]) })
    const marked = planAreaFigures({ ...base, rooms: base.rooms.map((r) => (r.id === id ? { ...r, outdoor: 'other' as const } : r)) })
    expect(named.grossExternal.area).toBeCloseTo(marked.grossExternal.area!, 9)
    expect(named.grossInternal.area).toBeCloseTo(marked.grossInternal.area!, 9)
    expect(named.net.area).toBeCloseTo(marked.net.area!, 9)
  })

  it('gives a floor whose outer walls are not known no gross internal figure, and says why', () => {
    const base = fixture('two-bed-flat.json')
    const empty = planAreaFigures(parseFloorPlan({ ...base, rooms: [], openings: [], walls: base.walls.map((w) => ({ ...w, kind: 'interior' })) }))
    expect(empty.grossInternal.area).toBeNull()
    expect(empty.grossInternal.why).toMatch(/no wall on this floor faces outside/)
    expect(empty.grossExternal.area).toBeCloseTo(75.05, 6)
  })
})

describe('ARE-8 which gross measure comes first', () => {
  it('follows the stated country: the inside face in the UK and most of Europe, the outside face for US homes', () => {
    expect(usualGross('GB')).toBe('grossInternal')
    expect(usualGross('es')).toBe('grossInternal')
    expect(usualGross('US')).toBe('grossExternal')
    expect(usualGross('JP')).toBeNull()
    expect(usualGross(undefined)).toBeNull()
  })

  it('gives both when no country is stated or none is usual there, and either or both when asked', () => {
    const plan = fixture('two-bed-flat.json')
    expect(planAreaFigures(plan).reader).toMatchObject({ gross: ['grossInternal', 'grossExternal'], chosen: 'none', country: null })
    expect(planAreaFigures(plan, { country: 'JP' }).reader).toMatchObject({ gross: ['grossInternal', 'grossExternal'], chosen: 'none', country: 'JP' })
    expect(planAreaFigures(plan, { country: 'gb' }).reader).toMatchObject({ gross: ['grossInternal'], chosen: 'country', country: 'GB' })
    expect(planAreaFigures(plan, { country: 'US' }).reader).toMatchObject({ gross: ['grossExternal'], chosen: 'country' })
    expect(planAreaFigures(plan, { country: 'US', gross: 'grossInternal' }).reader).toMatchObject({ gross: ['grossInternal'], chosen: 'asked' })
    expect(planAreaFigures(plan, { country: 'GB', gross: 'both' }).reader.gross).toEqual(['grossInternal', 'grossExternal'])
  })
})

describe('ARE-8 the measures table', () => {
  const ROOT = resolve(__dirname, '../../../../..')

  it('is in docs/areas.md in the same words as MEASURES', () => {
    const section = readFileSync(join(ROOT, 'docs', 'areas.md'), 'utf8')
    const rows = section
      .split('\n')
      .filter((line) => /^\| (Net|Gross|Area by headroom|Outdoor area|Area to the party walls|Free floor|Living area under air|Total under roof)/.test(line))
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    expect(rows).toEqual(Object.values(MEASURES).map((m) => [m.name, m.measures, m.notTakenOff, m.cannotSay]))
  })

  it('names no measuring standard in the code, the messages or the docs, except through a figure record', () => {
    // Built from parts, so that this file does not name them either.
    const names = [['RI', 'CS'], ['IP', 'MS'], ['Z7', '65'], ['BO', 'MA'], ['DIN ', '277'], ['WoF', 'lV'], ['N', 'RM\\b'], ['Code of Measuring', ' Practice'], ['Wohnfl', 'äche']]
    const pattern = new RegExp(`\\b(?:${names.map((n) => n.join('')).join('|')})`)
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx|md)$/.test(name)) files.push(path)
      }
    }
    for (const pkg of readdirSync(join(ROOT, 'packages'))) walk(join(ROOT, 'packages', pkg, 'src'))
    files.push(join(ROOT, 'README.md'), join(ROOT, 'AGENTS.md'), ...readdirSync(join(ROOT, 'docs')).filter((name) => name.endsWith('.md')).map((name) => join(ROOT, 'docs', name)))
    // Figure records carry their document, edition and clause (`packages/rules`).
    const records = join(ROOT, 'packages', 'rules', 'src', 'checks', 'figures.ts')
    const found = files.filter((file) => file !== records && pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(ROOT, file))
    expect(files.length).toBeGreaterThan(100)
    expect(found).toEqual([])
  })
})

describe('SHT-11, lab DR-5: a stair drawn as a room on floor after floor is counted once', () => {
  // The three-floor house with a 1.85 × 3.8 m stair room on each floor, one over the other, as
  // the lab's townhouse draws its stair (`stairRoomHouse`).
  const STAIR = 1.85 * 3.8

  it('counts the stair on the floor it rises from, and the rooms over it in no net figure', () => {
    const areas = planAreaFigures(stairRoomHouse())
    expect(areas.byUse['stair']).toBeCloseTo(STAIR, 9)
    const [ground, first, second] = areas.floors
    expect(ground!.byUse['stair']).toBeCloseTo(STAIR, 9)
    expect(first!.byUse['stair']).toBeUndefined()
    expect(second!.byUse['stair']).toBeUndefined()
    expect(ground!.overStairs).toBe(0)
    expect(first!.overStairs).toBeCloseTo(STAIR, 9)
    expect(second!.overStairs).toBeCloseTo(STAIR, 9)
    // The rooms over it keep their own area, and name the stair room they are counted with.
    const over = first!.rooms.find((room) => room.id === 'first-stair')!
    expect(over.area).toBeCloseTo(STAIR, 9)
    expect(over.countedWith).toEqual({ floor: 'ground', room: 'ground-stair' })
    expect(second!.rooms.find((room) => room.id === 'second-stair')!.countedWith).toEqual({ floor: 'ground', room: 'ground-stair' })
    expect(ground!.rooms.find((room) => room.id === 'ground-stair')!.countedWith).toBeUndefined()
    // The net total is less the two rooms over the stair; the gross figures are as they were.
    expect(areas.net.area).toBeCloseTo(sum(areas.floors.map((f) => sum(f.rooms.map((room) => room.area)))) - 2 * STAIR, 9)
    for (const f of areas.floors) expect(Math.abs(externalGap(f))).toBeLessThan(1e-6)
    expect(areas.notes.some((note) => note.startsWith('"Stair" on "Ground floor" is a stair that rises through 2 stair rooms over it ("First floor", "Second floor")'))).toBe(true)
  })

  it('counts stair rooms that do not line up on every floor, as before', () => {
    const areas = planAreaFigures(stairRoomHouse({ shifted: true }))
    // The first floor's stair room is moved: no floor's stair lies over another's.
    expect(areas.floors.map((f) => f.overStairs)).toEqual([0, 0, 0])
    expect(areas.floors.every((f) => f.byUse['stair']! > 0)).toBe(true)
  })

  it('counts a lift shaft once, on the floor it rises from, as a stair is (ARE-22)', () => {
    const areas = planAreaFigures(stairRoomHouse({ use: 'lift' }))
    expect(areas.floors.map((f) => f.overStairs)).toEqual([0, expect.closeTo(STAIR, 9), expect.closeTo(STAIR, 9)])
    expect(areas.byUse['lift']).toBeCloseTo(STAIR, 9)
    const over = areas.floors[1]!.rooms.find((room) => room.id === 'first-stair')!
    expect(over.countedWith).toEqual({ floor: 'ground', room: 'ground-stair' })
    expect(areas.notes.some((note) => note.startsWith('"Stair" on "Ground floor" is a lift that rises through 2 lift rooms over it'))).toBe(true)
  })

  it('counts lift rooms that do not line up on every floor', () => {
    const areas = planAreaFigures(stairRoomHouse({ use: 'lift', shifted: true }))
    expect(areas.floors.map((f) => f.overStairs)).toEqual([0, 0, 0])
    expect(areas.floors.every((f) => f.byUse['lift']! > 0)).toBe(true)
  })

  it('leaves a floor asked for alone with its stair room counted on the floor below', () => {
    const first = planAreaFigures(stairRoomHouse(), { floors: ['first'] }).floors[0]!
    expect(first.overStairs).toBeCloseTo(STAIR, 9)
    expect(first.byUse['stair']).toBeUndefined()
  })

  it('stacks no zone (CNT-8): a stair zone of an open room is counted once, in its room', () => {
    // The second floor is one open room, its partition a dividing line its two parts list: the
    // hall and the stair are zones of it. The stair zone lies over the first floor's stair room.
    const zoned = edit(madeVirtual(stairRoomHouse(), 'second-x'), (copy) => {
      copy.walls.find((w) => w.id === 'second-x')!.thickness = 0
      copy.rooms.push({ id: 'second-open', name: 'Open room', floor: 'second', boundary: ['second-s1', 'second-s2', 'second-e', 'second-n2', 'second-n1', 'second-w'] })
      for (const room of copy.rooms) if (room.id === 'second-main' || room.id === 'second-stair') room.partOf = 'second-open'
    })
    const areas = planAreaFigures(zoned)
    const [ground, first, second] = areas.floors
    const zone = second!.rooms.find((room) => room.id === 'second-stair')!
    expect(zone.zoneOf).toBe('second-open')
    expect(zone.countedWith).toBeUndefined()
    expect(second!.overStairs).toBe(0)
    // The first floor's stair room is still counted with the ground floor's.
    expect(first!.rooms.find((room) => room.id === 'first-stair')!.countedWith).toEqual({ floor: 'ground', room: 'ground-stair' })
    expect(first!.overStairs).toBeCloseTo(STAIR, 9)
    // The open room is the second floor's net; its stair zone's floor goes to the stair, once.
    expect(second!.net).toBeCloseTo(second!.rooms.find((room) => room.id === 'second-open')!.area, 9)
    expect(second!.byUse['stair']).toBeCloseTo(zone.area, 9)
    expect(ground!.byUse['stair']).toBeCloseTo(STAIR, 9)
    for (const f of areas.floors) {
      expect(sum(Object.values(f.byUse))).toBeCloseTo(f.net, 9)
      expect(Math.abs(externalGap(f))).toBeLessThan(1e-6)
    }
  })
})

describe('ARE-39 gross internal follows the rooms beside each wall, not the kind it was built as', () => {
  it('counts a wall stated exterior that now has rooms on both faces as floor, like a partition', () => {
    const asPartition = planAreaFigures(flat())
    const builtOutside = planAreaFigures(edit(flat(), (p) => { p.walls.find((w) => w.id === 'hk')!.kind = 'exterior' }))
    expect(builtOutside.grossInternal.area).toBeCloseTo(asPartition.grossInternal.area!, 6)
    expect(builtOutside.grossExternal.area).toBeCloseTo(asPartition.grossExternal.area!, 6)
  })
})
