import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { LoadedPlan } from '../../command/plan'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { COVER_FIGURES_MAX } from '../coverFigures'
import { sheetPages } from '../pages'

/**
 * SHT-21: a client cover leads with the figures the building's kind is judged by. A station, a
 * hospital, a shed or a hall never says "0 bedrooms", and a mezzanine never gives a floor to floor.
 */
const date = new Date('2026-11-26T12:00:00Z')

type Raw = Record<string, unknown> & { items?: unknown[]; site?: Record<string, unknown> }

function load(text: string, edit: (raw: Raw) => void = () => {}): LoadedPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const raw = structuredClone(result.plan) as unknown as Raw
  edit(raw)
  const plan = parseFloorPlan(raw)
  const { issues, broken } = validatePlan(plan)
  return { file: 'kind', plan, issues, broken }
}

function cover(loaded: LoadedPlan) {
  const page = sheetPages(loaded, null, 'client', { name: 'kind', date }).pages[0]!
  const figure = (label: string): string | undefined => page.figures.find((f) => f.label === label)?.value
  return { page, figure, labels: page.figures.map((f) => f.label) }
}

/** `count` items of a kind in a row, starting at a point. */
function items(kind: string, count: number, at: [number, number], size: [number, number], floor?: string): unknown[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${kind}-${i + 1}`, kind, at: [at[0] + i * (size[0] + 0.3), at[1]], size, height: 0.8, ...(floor ? { floor } : {}) }))
}

const STATION = `plan "Riverside Halt"
building transport
walls outside 0.3 inside 0.15 height 6
room p1 "Platform 1" platform 40 x 6 at 0,0
room hall "Concourse" concourse 40 x 10 north of p1
room p2 "Platform 2" platform 40 x 6 north of hall
room g1 "Gate 1" gate 4 x 3 inside hall corner nw
door entry in p1 west, centred, 3 wide, opens out, hinged north
`

const HOSPITAL = `plan "Hill Ward"
building health
walls outside 0.3 inside 0.15 height 3
room ward "Ward" ward 12 x 8 at 0,0
room theatre "Theatre" operating 7 x 8 east of ward
room corridor "Corridor" corridor * x 2 north of ward until theatre
door d1 between ward and corridor, centred, 1.2 wide
door d2 between theatre and corridor, centred, 1.2 wide
door entry in corridor west, centred, 1.5 wide, opens in, hinged north
`

const WAREHOUSE = `plan "Dock Shed"
building warehouse
walls outside 0.3 inside 0.15
floor ground "Ground" level 0 elevation 0 height 13.5
room shed "Shed" storage 30 x 20 at 0,0
door dock1 in shed south, 4 from west, 4 wide, height 4.5, roller
door dock2 in shed south, 12 from west, 4 wide, height 4.5, roller
door entry in shed west, centred, 1 wide, opens out, hinged north
floor mezz "Mezzanine" level 1 elevation 4.25 height 3
room office "Office" office 10 x 5 at 0,0
`

const HALL = `plan "North Concert Hall"
building culture
walls outside 0.4 inside 0.2
floor ground "Ground" level 0 elevation 0 height 16.5
room hall "Hall" auditorium 30 x 24 at 0,0
room foyer "Foyer" foyer 30 x 8 south of hall
door d1 between hall and foyer, centred, 2 wide
door entry in foyer south, centred, 3 wide, opens out, hinged west
floor terrace "Terrace" level 1 elevation 6 height 3.5
room upper "Upper terrace" - 30 x 6 at 0,18
`

const KINDERGARTEN = `plan "Little Oaks"
building school
walls outside 0.3 inside 0.12 height 3
room c1 "Class 1" classroom 7 x 7 at 0,0
room c2 "Class 2" classroom 7 x 7 east of c1
room c3 "Class 3" classroom 7 x 7 east of c2
room nap "Rest room" bedroom 7 x 5 north of c1
room hall "Hall" corridor * x 5 east of nap until c3
door d1 between c1 and nap, centred, 0.9 wide
door entry in hall north, centred, 1.2 wide, opens out, hinged west
`

const OFFICE = `plan "Quay Office"
building office
walls outside 0.3 inside 0.1 height 3
room open "Open office" office 20 x 12 at 0,0
room meet "Meeting" meeting 6 x 12 east of open
door d1 between open and meet, centred, 0.9 wide
door entry in open south, centred, 1.2 wide, opens out, hinged west
`

const HOME = (building: string) => `plan "Studio"
${building}
walls outside 0.3 inside 0.1 height 2.6
room living "Living" living 6 x 5 at 0,0
room bath "Bath" bathroom 2 x 5 east of living
door d1 between living and bath, centred, 0.8 wide
door entry in living south, centred, 0.9 wide, opens in, hinged west
`

const TOWER = `plan "Pier Tower"
building office
walls outside 0.3 inside 0.1 height 2.9
floor l0 "Level 0" level 0 elevation 0 height 2.9
room a0 "Office" office 12 x 10 at 0,0
floor l1 "Level 1" level 1 elevation 3.6 height 2.9
room a1 "Office" office 12 x 10 at 0,0
floor l2 "Level 2" level 2 elevation 7.2 height 2.9
room a2 "Office" office 12 x 10 at 0,0
`

describe('the cover by building kind (SHT-21)', () => {
  it('gives a station its platforms and gates, and no bedrooms', () => {
    const { figure, labels } = cover(load(STATION))
    expect(figure('platforms')).toBe('2')
    expect(figure('gate')).toBe('1')
    expect(labels.join(' ')).not.toMatch(/bedroom/)
  })

  it('gives a hospital its beds and operating theatres, and no bedrooms', () => {
    const { figure, labels } = cover(load(HOSPITAL, (raw) => { raw.items = items('bed', 6, [1, 1], [1, 2.1]) }))
    expect(figure('beds')).toBe('6')
    expect(figure('operating theatre')).toBe('1')
    expect(labels.join(' ')).not.toMatch(/bedroom/)
  })

  it('gives a shed its loading doors and the clear height of its tallest room, and no floor to floor from its mezzanine', () => {
    const loaded = load(WAREHOUSE)
    const { figure, labels } = cover(loaded)
    expect(figure('loading doors')).toBe('2')
    expect(figure('clear height, Shed')).toBe('13.50 m')
    expect(figure('floor')).toBe('1')
    expect(labels).not.toContain('floor to floor')
    expect(JSON.stringify(cover(loaded).page.figures)).not.toContain('4.25')
    expect(labels.join(' ')).not.toMatch(/bedroom/)
  })

  it('gives a concert hall its seats and the clear height of its hall, not of a terrace in it', () => {
    const { figure, labels } = cover(load(HALL, (raw) => { raw.items = items('chair', 12, [2, 2], [0.5, 0.5]) }))
    expect(figure('seats')).toBe('12')
    expect(figure('clear height, Hall')).toBe('16.50 m')
    expect(labels).not.toContain('floor to floor')
    expect(labels.join(' ')).not.toMatch(/bedroom/)
  })

  it('gives a kindergarten its classrooms, and never counts its rest room as a bedroom', () => {
    const { figure, labels } = cover(load(KINDERGARTEN))
    expect(figure('classrooms')).toBe('3')
    expect(labels.join(' ')).not.toMatch(/bedroom/)
  })

  it('gives an office no count it does not have', () => {
    const { page, labels } = cover(load(OFFICE))
    expect(labels.join(' ')).not.toMatch(/bedroom|platform|seat|bed\b/)
    expect(page.figures.map((f) => f.value)).not.toContain('not known')
  })

  it('still gives a home its bedrooms, a studio\'s none too', () => {
    expect(cover(load(HOME('building home'))).figure('bedrooms')).toBe('0')
    // A plan that states no kind shows a count only where there is one.
    expect(cover(load(HOME(''))).labels.join(' ')).not.toMatch(/bedroom/)
  })

  it('gives a tower its floors, floor to floor and height to the roof', () => {
    const { figure } = cover(load(TOWER))
    expect(figure('floors')).toBe('3')
    expect(figure('floor to floor')).toBe('3.60 m')
    expect(figure('height to the roof')).toMatch(/^\d+\.\d\d m$/)
  })

  it('gives the floor area ratio, gross external over the site, when the plan has a site boundary', () => {
    const loaded = load(OFFICE, (raw) => { raw.site = { boundary: [[-10, -10], [40, -10], [40, 30], [-10, 30]] } })
    const gross = planAreas(surveyPlan(loaded.plan)).grossExternal!
    expect(cover(loaded).figure('floor area ratio')).toBe((gross / 2000).toFixed(2))
    expect(cover(load(OFFICE)).labels).not.toContain('floor area ratio')
  })

  it('never prints more than six figures, and puts the rest in one line under them', () => {
    // No kind stated, with many things to count: each count shows, past six in one line.
    const text = `plan "Everything"
walls outside 0.3 inside 0.1 height 3
room b1 "Bedroom" bedroom 4 x 4 at 0,0
room p1 "Platform" platform 10 x 4 east of b1
room g1 "Gate" gate 4 x 4 east of p1
room c1 "Class" classroom 6 x 4 east of g1
room x1 "Cell" cell 3 x 4 east of c1
door entry in b1 south, centred, 0.9 wide, opens in, hinged west
`
    const { page } = cover(load(text, (raw) => { raw.items = items('chair', 3, [24, 1], [0.5, 0.5]) }))
    expect(COVER_FIGURES_MAX).toBe(6)
    expect(page.figures.length).toBe(6)
    expect(page.notes.find((n) => n.startsWith('Also: '))).toMatch(/cell|seats/)
  })

  it('gives a row of split-level houses up a street the storeys, floor to floor and height of one house', () => {
    // ARE-76: six houses stepping 0.6 m up the street, each a street half and a garden half a level
    // up, each with a bedroom floor a storey over it; every house a building of the plan.
    const houses = Array.from({ length: 6 }, (_, n) => n)
    const floor = (n: number, part: string, i: number, room: string): string => {
      const y = i % 2 === 0 ? 0 : 4
      const depth = i % 2 === 0 ? 4 : 4.5
      return `floor h${n}${part} "House ${n + 1} ${part}" level ${n * 2 + i / 2} elevation ${Math.round((n * 0.6 + i * 1.4) * 1000) / 1000} height 2.5\nroom h${n}${part}r "${room}" ${room === 'Bedroom' ? 'bedroom' : 'living'} 5 x ${depth} at ${n * 5},${y}\n`
    }
    const text = `plan "Rising street"\nbuilding home\nwalls outside 0.3 inside 0.1\n${houses.map((n) => floor(n, 'f0', 0, 'Living') + floor(n, 'b0', 1, 'Living') + floor(n, 'f1', 2, 'Bedroom') + floor(n, 'b1', 3, 'Bedroom')).join('')}`
    const loaded = load(text, (raw) => {
      raw['buildings'] = houses.map((n) => ({ id: `h${n}`, name: `House ${n + 1}`, floors: ['f0', 'b0', 'f1', 'b1'].map((p) => `h${n}${p}`) }))
      raw.site = { ground: -0.15 }
    })
    const { figure } = cover(loaded)
    expect(figure('floors')).toBe('2')
    expect(figure('buildings')).toBe('6')
    expect(figure('floor to floor')).toBe('2.80 m')
    // 0.15 m of ground, three half levels of 1.4 m, the top floor's 2.5 m and its roof slab: the same for every house.
    expect(figure('height to the roof')).toBe('7.10 m')
  })

  it('says its one rounding rule once, on the cover', () => {
    const { page } = cover(load(OFFICE))
    expect(page.notes.filter((n) => n.startsWith('Rounding: '))).toEqual(['Rounding: areas to 0.1 m², or to more places where the rows of a table need them to add up to its total; lengths to the centimetre, ratios to two places, counts whole.'])
  })
})
