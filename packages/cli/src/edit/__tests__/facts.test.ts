/**
 * WRT-74: `setFacts`, the change behind grid_set_facts, on CNT-9's office: the patch it makes,
 * a zone's number refused, and a floor's fact on a plan that lists no floors.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { surveyPlan } from '../../quantities/survey'
import { setFacts } from '../facts'
import { EditRefused } from '../refused'

const office = (): ReturnType<typeof surveyPlan> => surveyPlan(parseFloorPlan(factsOffice()))

let b: Bench
beforeAll(async () => {
  b = bench({ 'zones.json': factsOffice() })
  const merged = await b.call('grid_merge_rooms', { plan: 'zones.json', room: 'g-office', with: 'g-meeting', zones: true })
  expect(merged.isError, merged.text).toBe(false)
})
afterAll(() => b.close())

describe('setFacts (WRT-74)', () => {
  it('narrows the parts named by id to those the selection picks', () => {
    const patch = setFacts(office(), { parts: ['g-office', 'g-reception', 'd-g1'], selection: { kinds: ['room'], where: ['department = Sales'] }, set: { status: 'let' } })
    expect([...patch.rooms.keys()]).toEqual(['g-office'])
    expect(patch.openings.size).toBe(0)
    expect(patch.rooms.get('g-office')).toEqual({ properties: { department: 'Sales', 'head count': 8, finish: 'Carpet', status: 'let' } })
  })

  it('puts a floor\'s facts in the floors list, and refuses one on a plan that lists no floors', () => {
    const patch = setFacts(office(), { parts: ['ground'], set: { occupancy: 20 } })
    expect(patch.parts?.get('floors')?.get('ground')).toEqual({ properties: { 'fire compartment': 'FC-1', occupancy: 20 } })
    const single = parseFloorPlan(factsOffice())
    const noFloors = surveyPlan({ ...single, floors: undefined, rooms: single.rooms.filter((r) => r.floor === undefined), walls: single.walls.filter((w) => w.floor === undefined) })
    expect(() => setFacts(noFloors, { parts: ['ground'], set: { occupancy: 20 } })).toThrow(EditRefused)
    expect(() => setFacts(noFloors, { parts: ['ground'], set: { occupancy: 20 } })).toThrow(/lists no floors/)
  })

  it('takes every fact out as null, so the file keeps no empty facts', () => {
    const patch = setFacts(office(), { parts: ['w-g1'], unset: ['glazing', 'Openable'] })
    expect(patch.openings.get('w-g1')).toEqual({ properties: null })
  })

  it('refuses a number for a zone: its room\'s number counts', async () => {
    const zoned = surveyPlan(parseFloorPlan(JSON.parse(readFileSync(join(b.folder, 'zones.json'), 'utf8'))))
    expect(() => setFacts(zoned, { parts: ['g-meeting'], number: '9' })).toThrow(/is a zone of .* give .* the number/)
  })
})
