/**
 * ARE-69: the brief said the way the person said it: a total per use, wishes per floor or
 * department, many identical misses as one line, a room with the rooms inside it, a round room by
 * its diameter, figures for some rooms, uses, a fact or a way, the whole plan's efficiency, homes
 * and storeys, the footprint inside the walls, and one wish added, removed or changed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { parseBrief, BriefRefused } from '../brief'
import { briefLines, type BriefLine } from '../lines'

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

function compiled(lines: readonly string[]): FloorPlan {
  const out = compileRoomsText([...lines, ''].join('\n'))
  expect(out.problems).toEqual([])
  return parseFloorPlan(out.plan)
}

/** A corridor with six offices along it, two in Sales, and a meeting room. */
const OFFICES = compiled([
  'walls outside 0.3 inside 0.1 height 2.8',
  'room hall "Hall" corridor 21 x 1.6',
  'room o1 "Office 1" office 3 x 4 north of hall facts department=Sales',
  'room o2 "Office 2" office 3 x 4 east of o1 facts department=Sales',
  'room o3 "Office 3" office 3 x 4 east of o2',
  'room o4 "Office 4" office 3 x 4 east of o3',
  'room o5 "Office 5" office 3 x 4 east of o4',
  'room o6 "Office 6" office 3 x 4 east of o5',
  'room m "Meeting" office 3 x 4 east of o6',
  'door d-in in hall south, centred, 1.2 wide',
  'door d1 between hall and o1, centred, 0.9 wide',
  'door d2 between hall and o2, centred, 0.9 wide',
  'door d3 between hall and o3, centred, 0.8 wide',
  'door d4 between hall and o4, centred, 0.8 wide',
  'door d5 between hall and o5, centred, 0.8 wide',
  'door d6 between hall and o6, centred, 0.8 wide',
  'door dm between hall and m, centred, 1.2 wide',
])

const said = { level: 'must', source: 'given', quote: 'what they said' } as const
const linesFor = (plan: FloorPlan, brief: Record<string, unknown>): BriefLine[] => briefLines(plan, parseBrief(brief, { versionNeeded: false }))

describe('a total per use, and wishes per floor or department', () => {
  it('measures "about 84 m² of offices" as one line for the offices together', () => {
    const lines = linesFor(OFFICES, { rooms: [{ use: 'office', total_area: 84, ...said }] })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.state).toBe('met')
    expect(lines[0]!.drawn).toBe('84.00')
    expect(lines[0]!.text).toContain('rooms used as office net area together asked 84, drawn 84.00 m² in 7 rooms')
    expect(lines[0]!.where).toBe('rooms[0]')
  })

  it('misses a total too small, in one line, and holds total_at_least', () => {
    const [short] = linesFor(OFFICES, { rooms: [{ use: 'office', total_at_least: 30000, ...said }] })
    expect(short!.state).toBe('missed')
    expect(short!.text).toContain('asked at least 30000, drawn 84.00 m²')
  })

  it('counts only the rooms of a department, or on a floor', () => {
    const [sales] = linesFor(OFFICES, { rooms: [{ use: 'office', fact: { name: 'department', value: 'sales' }, count: 2, ...said }] })
    expect(sales!.state).toBe('met')
    expect(sales!.text).toContain('with department "sales"')
    const [elsewhere] = linesFor(OFFICES, { rooms: [{ use: 'office', floor: 'Level 9', count_at_least: 1, ...said }] })
    expect(elsewhere!.state).toBe('missed')
    expect(elsewhere!.text).toContain('on floor "Level 9"')
    const floor = OFFICES.rooms[0]!.floor ?? 'ground'
    const [here] = linesFor(OFFICES, { rooms: [{ use: 'office', floor, count: 7, ...said }] })
    expect(here!.state).toBe('met')
  })

  it('says many rooms missed the same way as one line, and points a total to total_area', () => {
    const lines = linesFor(OFFICES, { rooms: [{ use: 'office', area: 30000, ...said }] })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.state).toBe('missed')
    expect(lines[0]!.text).toContain('7 of the 7 rooms used as office area asked 30000, each drawn 12.00 m²')
    expect(lines[0]!.text).toContain('give total_area')
    expect(lines[0]!.parts).toHaveLength(7)
  })

  it('keeps a line per room under four misses', () => {
    const lines = linesFor(OFFICES, { rooms: [{ name: 'Office 1', area: 20, ...said }, { name: 'Office 2', area: 12, ...said }] })
    expect(lines.map((l) => l.state)).toEqual(['missed', 'met'])
    expect(lines.map((l) => l.where)).toEqual(['rooms[0]', 'rooms[1]'])
  })
})

describe('a room with the rooms inside it, and a round room', () => {
  const STUDY = compiled([
    'walls outside 0.3 inside 0.1 height 2.7',
    'room hall "Hall" corridor 12 x 1.5',
    'room b1 "Bedroom 1" bedroom 3 x 3.5 north of hall',
    'room e1 "En-suite 1" bathroom 1.5 x 3.5 east of b1',
    'room b2 "Bedroom 2" bedroom 3 x 3.5 east of e1',
    'room e2 "En-suite 2" bathroom 1.5 x 3.5 east of b2',
    'door d-in in hall south, centred, 1.2 wide',
    'door d1 between hall and b1, centred, 0.9 wide',
    'door de1 between b1 and e1, centred, 0.8 wide',
    'door d2 between hall and b2, centred, 0.9 wide',
    'door de2 between b2 and e2, centred, 0.8 wide',
  ])

  it('measures each bedroom with its en-suite when the wish says with_inner', () => {
    const without = linesFor(STUDY, { rooms: [{ use: 'bedroom', area: 15.75, ...said }] })
    expect(without.every((l) => l.state === 'missed')).toBe(true)
    const withIt = linesFor(STUDY, { rooms: [{ use: 'bedroom', area: 15.75, with_inner: true, ...said }] })
    expect(withIt.map((l) => l.state)).toEqual(['met', 'met'])
    expect(withIt[0]!.text).toContain('"Bedroom 1" with "En-suite 1" inside it area asked 15.75, drawn 15.75 m²')
    expect(withIt[0]!.parts.map((p) => p.id)).toEqual(['b1', 'e1'])
  })

  it('meets a round room by its diameter, the widest circle it holds', () => {
    const round = compiled([
      'walls outside 0.3 inside 0.1 height 3',
      'room yard "Courtyard" assembly circle 12 at 0,0',
    ])
    const [met] = linesFor(round, { rooms: [{ name: 'Courtyard', diameter: 12, ...said }] })
    expect(met!.state).toBe('met')
    expect(met!.text).toContain('"Courtyard" diameter asked 12, drawn')
    const [missed] = linesFor(round, { rooms: [{ name: 'Courtyard', diameter: 20, ...said }] })
    expect(missed!.state).toBe('missed')
  })
})

describe('a figure for some rooms, uses, a fact or a way', () => {
  const door = (extra: Record<string, unknown>) => ({ figures: { door_width: { value: 1.1, ...extra, ...said } } })
  const missedDoors = (brief: Record<string, unknown>): string[] => linesFor(OFFICES, brief).filter((l) => l.state === 'missed').flatMap((l) => l.parts.map((p) => p.id)).sort()

  it('judges every door with no scope, as before', () => {
    expect(missedDoors(door({}))).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])
  })

  it('judges only the doors on the way from the entrance to the meeting room', () => {
    const lines = linesFor(OFFICES, door({ routes: [{ to: 'Meeting' }] }))
    expect(lines.filter((l) => l.state === 'missed')).toEqual([])
    expect(lines[0]!.text).toContain('for the way from the entrance to "Meeting"')
    expect(missedDoors(door({ routes: [{ from: 'Hall', to: 'Office 3' }] }))).toEqual(['d3'])
  })

  it('judges only the doors of rooms carrying a fact, or of named rooms', () => {
    expect(missedDoors(door({ fact: { name: 'department', value: 'Sales' } }))).toEqual(['d1', 'd2'])
    expect(missedDoors(door({ rooms: ['Office 4'] }))).toEqual(['d4'])
  })

  it('says a way it cannot find is open, and measures nothing on it', () => {
    const lines = linesFor(OFFICES, door({ routes: [{ to: 'Nowhere' }] }))
    expect(lines.some((l) => l.state === 'open' && l.text.includes('Grid finds no way'))).toBe(true)
    expect(lines.filter((l) => l.state === 'missed')).toEqual([])
  })

  it('refuses a scope on a figure measured once for the plan', () => {
    expect(() => parseBrief({ figures: { building_height: { value: 9, uses: ['office'], ...said } } }, { versionNeeded: false })).toThrow(BriefRefused)
  })
})

describe('the whole plan\'s efficiency, homes and storeys, and the footprint inside', () => {
  it('sets efficiency, homes and storeys against the plan', () => {
    const lines = linesFor(OFFICES, { figures: { efficiency: { value: 50, ...said }, homes: { value: 2, ...said }, storeys: { value: 1, ...said } } })
    const by = Object.fromEntries(lines.map((l) => [l.wish, l]))
    expect(by['efficiency']!.state).toBe('met')
    expect(by['efficiency']!.unit).toBe('%')
    expect(by['homes']!.state).toBe('missed')
    expect(by['homes']!.text).toContain('drawn 0 homes')
    expect(by['storeys']!.state).toBe('met')
    expect(by['storeys']!.text).toContain('asked exactly 1, drawn 1 storeys')
    expect(() => parseBrief({ figures: { storeys: { value: 2.5, ...said } } }, { versionNeeded: false })).toThrow(/whole number/)
  })

  it('measures the footprint inside the outside walls when asked', () => {
    const inside = linesFor(OFFICES, { footprint: { width: 21, depth: 5.6, measure: 'inside', ...said } })
    expect(inside[0]!.state).toBe('met')
    expect(inside[0]!.text).toContain('footprint inside the outside walls asked 21 x 5.6')
    const outside = linesFor(OFFICES, { footprint: { width: 21, depth: 5.6, ...said } })
    expect(outside[0]!.state).toBe('missed')
  })
})

describe('one wish added, removed or changed (grid_write_brief)', () => {
  it('adds a note, changes a size and removes a wish without writing the brief whole', async () => {
    b = bench({ 'p.json': OFFICES })
    const first = await b.call('grid_write_brief', { plan: 'p.json', brief: { rooms: [{ name: 'Office 1', area: 20, ...said }, { name: 'Meeting', ...said }] } })
    expect(first.isError, first.text).toBe(false)

    const added = await b.call('grid_write_brief', { plan: 'p.json', add: { open: [{ quote: 'a bike store by the door', about: 'its size' }] } })
    expect(added.isError, added.text).toBe(false)
    expect(added.text).toContain('Changed the brief')
    const open = (added.data as { lines: BriefLine[] }).lines.find((l) => l.wish === 'open')
    expect(open!.where).toBe('open[0]')

    const updated = await b.call('grid_write_brief', { plan: 'p.json', update: { where: 'rooms[0]', with: { area: 12 } } })
    expect(updated.isError, updated.text).toBe(false)
    expect((updated.data as { lines: BriefLine[] }).lines.find((l) => l.where === 'rooms[0]')!.state).toBe('met')

    const removed = await b.call('grid_write_brief', { plan: 'p.json', remove: ['rooms[1]', 'open[0]'] })
    expect(removed.isError, removed.text).toBe(false)
    const left = (removed.data as { lines: BriefLine[] }).lines
    expect(left.map((l) => l.where)).toEqual(['rooms[0]'])
  })

  it('refuses a place the brief does not hold, and brief with add together', async () => {
    b = bench({ 'p.json': OFFICES })
    await b.call('grid_write_brief', { plan: 'p.json', brief: { rooms: [{ name: 'Meeting', ...said }] } })
    const wrong = await b.call('grid_write_brief', { plan: 'p.json', remove: ['rooms[5]'] })
    expect(wrong.isError).toBe(true)
    expect(wrong.text).toContain('has no wish at "rooms[5]"')
    const both = await b.call('grid_write_brief', { plan: 'p.json', brief: { rooms: [{ name: 'Meeting', ...said }] }, add: { open: [{ quote: 'x' }] } })
    expect(both.isError).toBe(true)
  })
})
