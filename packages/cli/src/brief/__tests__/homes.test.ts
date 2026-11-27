/** ARE-72: the usual rooms of a home offered as assumed lines, and the homes' questions after the check. */
import { afterEach, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { briefLines, briefText, type BriefLine } from '../lines'

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

/** A flat with a bedroom, a living room and a bathroom, a front door, and no kitchen. */
function noKitchen(extra: readonly string[] = []): FloorPlan {
  const compiled = compileRoomsText([
    'walls outside 0.3 inside 0.1 height 2.6',
    'room hall "Hall" corridor 2 x 4',
    'room bed "Bedroom" bedroom 3.5 x 4 east of hall',
    'room liv "Living" living 4 x 4 west of hall',
    'room ba "Bathroom" bathroom 2 x 2.5 north of hall',
    'door d-in in hall south, centred, 0.9 wide',
    ...extra,
    '',
  ].join('\n'))
  expect(compiled.problems).toEqual([])
  return compiled.plan as unknown as FloorPlan
}

const assumed = (lines: readonly BriefLine[]): BriefLine[] => lines.filter((l) => l.source === 'assumed' && l.where === null)

describe('ARE-72: the usual rooms, offered as assumed lines', () => {
  it('offers a kitchen the home lacks, with no brief yet, under a heading that says so', () => {
    const lines = briefLines(noKitchen(), null)
    const [kitchen, ...rest] = assumed(lines)
    expect(rest).toEqual([])
    expect(kitchen).toMatchObject({ state: 'missed', level: 'should', source: 'assumed', wish: 'room' })
    expect(kitchen!.text).toBe("missed (should, assumed): a kitchen in every home, Grid's assumption, missing from the home: confirm it with the person, then write the wish in the brief with grid_write_brief (level avoid when it is left out on purpose).")
    expect(briefText(lines, null)[0]).toBe('Against the drawing, with no brief yet: the sizes in room names and the rooms Grid assumes every home has.')
  })

  it('says nothing once the brief speaks of a kitchen, at any level', async () => {
    b = bench({ 'p.json': noKitchen() })
    const reply = await b.call('grid_write_brief', { plan: 'p.json', brief: { rooms: [{ name: 'Kitchen', level: 'avoid', source: 'given', quote: 'no kitchen, they eat in the canteen' }] } })
    expect(reply.isError, reply.text).toBe(false)
    const lines = (reply.data as { lines: BriefLine[] }).lines
    expect(assumed(lines)).toEqual([])
    expect(lines.some((l) => l.state === 'met' && l.text.includes('"Kitchen"'))).toBe(true)
  })

  it('offers a kitchen beside a brief that names other rooms only', async () => {
    b = bench({ 'p.json': noKitchen() })
    const reply = await b.call('grid_write_brief', { plan: 'p.json', brief: { rooms: [{ use: 'bedroom', count: 1, level: 'must', source: 'given', quote: 'one bedroom' }] } })
    expect(reply.isError, reply.text).toBe(false)
    expect(assumed((reply.data as { lines: BriefLine[] }).lines).map((l) => l.text)).toEqual([expect.stringContaining('a kitchen in every home')])
  })

  it('leaves a survey alone', () => {
    const plan = noKitchen()
    const surveyed = { ...plan, taped: [{ between: ['hall', 'bed'], length: 3 }] } as unknown as FloorPlan
    expect(assumed(briefLines(surveyed, null))).toEqual([])
  })
})

describe('ARE-72: the homes after the check', () => {
  it('lists what a home lacks, a 0.5 m² bedroom and a bedroom used as living, with no brief and no place', async () => {
    b = bench({ 'p.json': noKitchen(['room tiny "Box" bedroom 0.7 x 0.7 east of ba', 'room b2 "Bedroom 2" living 3 x 3 east of bed']) })
    const check = await b.call('grid_check', { plan: 'p.json' })
    expect(check.isError, check.text).toBe(false)
    expect(check.text).toContain("Worth a look in the homes (3): Grid's own questions, with no place needed")
    expect(check.text).toContain('  No kitchen in the home: no room in it is used as one or named so.')
    expect(check.text).toContain('  "Box" in the home, used as bedroom, has 0.49 m² of net floor, under the 4 m² Grid asks about: is the size meant?')
    expect(check.text).toContain('  "Bedroom 2" in the home is named as bedroom but used as living')
  })

  it('says nothing of a home with nothing to ask', async () => {
    b = bench({ 'p.json': noKitchen(['room k "Kitchen" kitchen 3 x 3 north of bed']) })
    const check = await b.call('grid_check', { plan: 'p.json' })
    expect(check.isError, check.text).toBe(false)
    expect(check.text).not.toContain('in the homes')
  })
})
