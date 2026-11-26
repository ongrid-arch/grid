/**
 * ARE-61: a room's type, tenure and flat are fields of the query tools, and its floor is totalled
 * by type and by tenure in the areas and the comparison.
 */
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planAreas } from '../areas'
import { optionRow } from '../compare'
import { askPlan, fieldOf, groupParts, select, GRID_FIELDS } from '../query'
import { surveyPlan } from '../survey'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { toolDefinition } from '../../mcp/toolkit'
import { bench } from '../../mcp/__tests__/replay/harness'

const text = `plan "Block"
walls outside 0.2 inside 0.1 height 2.7
room a "Studio A" bedroom 4 x 4 at 0,0
room b "Studio B" bedroom 4 x 4 east of a
room hall "Hall" corridor 2 x 4 east of b
room shop "Shop" retail 4 x 4 east of hall
`

function plan(stated: boolean): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const raw = result.plan as Record<string, unknown>
  if (!stated) return parseFloorPlan(raw)
  const by: Record<string, Record<string, string>> = {
    a: { roomType: 'Deluxe', tenure: 'private' },
    b: { roomType: 'Standard', tenure: 'private' },
    hall: { tenure: 'common' },
    shop: { roomType: 'Unit', tenure: 'commercial' },
  }
  const rooms = (raw['rooms'] as { id: string }[]).map((room) => ({ ...room, ...(by[room.id] ?? {}) }))
  return parseFloorPlan({ ...raw, rooms, flatTypes: [{ id: 'one', name: 'One bedroom' }], flats: [{ id: 'f1', type: 'one', rooms: ['a'] }, { id: 'f2', type: 'one', rooms: ['b'] }] })
}

const asked = (stated = true) => askPlan(surveyPlan(plan(stated)))
const area = (name: string): number => planAreas(surveyPlan(plan(true))).floors[0]!.rooms.find((r) => r.id === name)!.net!

describe('room type, tenure and flat as fields', () => {
  it('are listed for a room, text, from Grid', () => {
    for (const name of ['room type', 'tenure', 'flat', 'flat type']) {
      const info = GRID_FIELDS.find((f) => f.name === name)!
      expect([info.type, info.kinds, info.from]).toEqual(['text', ['room'], 'grid'])
    }
  })

  it('find rooms by each', () => {
    const a = asked()
    const ids = (where: string): string[] => select(a, { kinds: ['room'], where: [where] }).map((p) => p.id)
    expect(ids('tenure = private')).toEqual(['a', 'b'])
    expect(ids('room type = deluxe')).toEqual(['a'])
    expect(ids('room type is missing')).toEqual(['hall'])
    expect(ids('flat = f2')).toEqual(['b'])
    expect(ids('flat type = One bedroom')).toEqual(['a', 'b'])
    expect(ids('flat is missing')).toEqual(['hall', 'shop'])
  })

  it('count and total by each, "not stated" for a room with none', () => {
    const a = asked()
    const rooms = select(a, { kinds: ['room'] })
    const by = (name: string) => groupParts(a, rooms, fieldOf(a, name, 'by'), [fieldOf(a, 'area', 'sum')])
    expect(by('tenure').map((g) => [g.value, g.count])).toEqual([['private', 2], ['commercial', 1], ['common', 1]])
    const types = by('room type')
    expect(types.map((g) => [g.value, g.count])).toEqual([['Deluxe', 1], ['Standard', 1], ['Unit', 1], [null, 1]])
    expect(types.find((g) => g.value === 'Deluxe')!.sums['area']).toBeCloseTo(area('a'), 3)
    expect(by('flat type')[0]!.value).toBe('One bedroom')
  })
})

describe('areas and compare by type and tenure', () => {
  it('total the net floor, floor by floor and for the building', () => {
    const areas = planAreas(surveyPlan(plan(true)))
    expect(areas.byTenure!['private']).toBeCloseTo(area('a') + area('b'), 3)
    expect(areas.byRoomType!['not said']).toBeCloseTo(area('hall'), 3)
    expect(Object.values(areas.byTenure!).reduce((x, y) => x + y, 0)).toBeCloseTo(areas.net, 3)
    expect(Object.values(areas.byRoomType!).reduce((x, y) => x + y, 0)).toBeCloseTo(areas.net, 3)
    expect(areas.floors[0]!.byTenure).toEqual(areas.byTenure)
    expect(areas.floors[0]!.rooms.find((r) => r.id === 'a')).toMatchObject({ roomType: 'Deluxe', tenure: 'private' })
  })

  it('say nothing on a plan that states none', () => {
    const areas = planAreas(surveyPlan(plan(false)))
    expect(areas.byTenure).toBeUndefined()
    expect(areas.byRoomType).toBeUndefined()
    expect(areas.floors[0]!.byTenure).toBeUndefined()
    expect('roomType' in areas.floors[0]!.rooms[0]!).toBe(false)
  })

  it('reach the comparison rows', () => {
    const row = optionRow('A', surveyPlan(plan(true)))
    expect(row.byTenure!['commercial']).toBeCloseTo(area('shop'), 3)
    expect(optionRow('B', surveyPlan(plan(false))).byTenure).toBeUndefined()
  })
})

describe('the tools answer it within their output schemas', () => {
  const ajv = new Ajv({ allErrors: true, schemaId: 'auto' })
  const problems = (tool: string, data: unknown): string[] => {
    const validate = ajv.compile(toolDefinition(GRID_TOOLS.find((t) => t.name === tool)!)['outputSchema'] as Record<string, unknown>)
    return validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.dataPath || '/'} ${e.message}`)
  }

  it('grid_areas and grid_compare, on a plan with types and tenures and one with none', async () => {
    const b = bench({ 'stated.json': plan(true), 'none.json': plan(false) })
    try {
      for (const file of ['stated.json', 'none.json']) {
        const areas = await b.call('grid_areas', { plan: file })
        expect(areas.isError, areas.text).toBe(false)
        expect(problems('grid_areas', areas.data)).toEqual([])
      }
      const stated = await b.call('grid_areas', { plan: 'stated.json' })
      expect(stated.data!['byTenure']).toBeDefined()
      expect(stated.text).toContain('Net by tenure')
      const compared = await b.call('grid_compare', { plans: ['stated.json', 'none.json'] })
      expect(compared.isError, compared.text).toBe(false)
      expect(problems('grid_compare', compared.data)).toEqual([])
      expect(compared.text).toContain('By tenure')
    } finally {
      b.close()
    }
  })
})
