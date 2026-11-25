/** MSG-22: rooms text writes ids every tool takes, in plain letters, and says which it changed. */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { plainIdsFor, withPlainIds } from '../ids'
import { readRoomsText } from '../read'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { ID_PATTERN, planIdText, plainId, readPlainId } from '../../types/planText'

const text = [
  'room salón "Salón" salón 4 x 3.5 at 0,0',
  'room baño "Baño" baño 2 x 2 east of salón',
  'room küche "Küche" Küche 3 x 2 north of salón',
  'door puerta between salón and baño, centred, 0.8 wide',
].join('\n')

describe('ids in plain letters', () => {
  it('takes the accents off an id, wherever the text names it, and keeps the names as written', () => {
    const done = compileRoomsText(text)
    expect(done.problems).toEqual([])
    const plan = done.plan!
    expect(plan.rooms.map((r) => [r.id, r.name, r.use])).toEqual([
      ['salon', 'Salón', 'living'],
      ['bano', 'Baño', 'bathroom'],
      ['kuche', 'Küche', 'kitchen'],
    ])
    expect(plan.openings.map((o) => o.id)).toEqual(['puerta'])
    const folded = done.warnings.find((w) => w.code === 'rooms/id-folded')
    expect(folded?.message).toContain("'baño' is 'bano'")
    expect(folded?.message).toContain("'salón' is 'salon'")
    expect(folded?.message).toContain("'küche' is 'kuche'")
  })

  it('says nothing when every id is plain', () => {
    const done = compileRoomsText('room living "Salón" living 4 x 3.5 at 0,0')
    expect(done.warnings.filter((w) => w.code === 'rooms/id-folded')).toEqual([])
  })

  it('refuses an id with letters that have no plain form, on its line, and writes no plan', () => {
    const done = compileRoomsText(['room living "Salón" living 4 x 3.5 at 0,0', 'room 客厅 "客厅" 客厅 4 x 3 north of living'].join('\n'))
    expect(done.plan).toBeNull()
    expect(done.problems).toHaveLength(1)
    expect(done.problems[0]).toMatchObject({ code: 'rooms/bad-id', line: 2 })
    expect(done.problems[0]!.message).toContain("'客厅'")
  })

  it('spells out the letters that have no accent to take off', () => {
    expect(plainId('Straße')).toBe('Strasse')
    expect(plainId('cœur-ø')).toBe('coeur-o')
    expect(plainId('客厅')).toBe('客厅')
    expect(plainId('plain-id_2.b')).toBe('plain-id_2.b')
  })

  it('offers a plain id made from the room\'s use on the refused line, and keeps the name in quotes', () => {
    const done = compileRoomsText(['room 客厅 "客厅" 客厅 4 x 3 at 0,0', 'room 卧室 "睡房" bedroom 3 x 3 east of 客厅'].join('\n'))
    expect(done.plan).toBeNull()
    expect(done.problems.map((p) => p.line)).toEqual([1, 2])
    expect(done.problems[0]!.message).toContain("such as 'living'")
    expect(done.problems[0]!.message).toContain('room living "客厅"')
    expect(done.problems[1]!.message).toContain("such as 'bedroom'")
    expect(done.problems[1]!.message).toContain('room bedroom "睡房"')
  })
})

describe('one id rule (CMD-24)', () => {
  it('reads an id as typed in plain letters, or refuses it', () => {
    expect(readPlainId('baño')).toBe('bano')
    expect(readPlainId('w-living.2_b')).toBe('w-living.2_b')
    expect(readPlainId('客厅')).toBeNull()
    expect(readPlainId('a b')).toBeNull()
    expect(readPlainId('')).toBeNull()
    expect(readPlainId('a'.repeat(64))).toBe('a'.repeat(64))
    expect(readPlainId('a'.repeat(65))).toBeNull()
    const pattern = new RegExp(ID_PATTERN)
    for (const id of ['bano', 'w-living.2_b', '客厅', 'a b', 'a'.repeat(65)]) expect(pattern.test(id)).toBe(readPlainId(id) === id)
  })

  it('takes any id a plan may hold, as the plan holds it, for records that send the plan\'s ids back', () => {
    expect(planIdText('客厅')).toBe(true)
    expect(planIdText('baño')).toBe(true)
    expect(planIdText('a\nb')).toBe(false)
    expect(planIdText('')).toBe(false)
    expect(planIdText(3)).toBe(false)
  })
})

/** A plan whose file holds ids with no plain form, as rooms text wrote them before MSG-22. */
function olderPlan(): FloorPlan {
  const done = compileRoomsText(['room living "客厅" living 4 x 3 at 0,0', 'room bedroom "卧室" bedroom 3 x 3 east of living', 'room bedroom-2 "卧室" bedroom 3 x 3 north of living', 'door d1 between living and bedroom, centred, 0.8 wide'].join('\n'))
  expect(done.problems).toEqual([])
  const older: Record<string, string> = { living: '客厅', bedroom: '卧室', 'bedroom-2': '次卧' }
  const swap = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') return key === 'name' || key === 'use' ? value : (older[value] ?? value.split('-').map((piece) => older[piece] ?? piece).join('-'))
    if (Array.isArray(value)) return value.map((item) => swap(item))
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v, k)]))
    return value
  }
  const { written: _written, ...plan } = done.plan! as FloorPlan
  void _written
  return parseFloorPlan(swap(plan))
}

describe('a plan that holds ids with no plain form (CMD-24)', () => {
  it('gives each a plain id no other part has, from what the part is and the ids it is made of', () => {
    const plan = olderPlan()
    expect(plan.rooms.map((r) => r.id)).toEqual(['客厅', '卧室', '次卧'])
    const plain = plainIdsFor(plan)
    expect([...plain.keys()].filter((id) => plan.rooms.some((r) => r.id === id))).toEqual(['客厅', '卧室', '次卧'])
    expect(plain.get('客厅')).toBe('living')
    expect(plain.get('卧室')).toBe('bedroom')
    expect(plain.get('次卧')).toBe('bedroom-2')
    const wall = plan.walls.find((w) => w.id.includes('客厅') && w.id.includes('卧室') && !w.id.includes('次卧'))!
    expect(plain.get(wall.id)).toBe(wall.id.replace('客厅', 'living').replace('卧室', 'bedroom'))
    expect([...plain.values()].every((id) => readPlainId(id) === id)).toBe(true)
    expect(new Set(plain.values()).size).toBe(plain.size)
  })

  it('replaces them wherever the plan names them, and keeps every name as written', () => {
    const plan = olderPlan()
    const { plan: plainPlan, renamed } = withPlainIds(plan)
    expect(renamed.length).toBeGreaterThan(3)
    const ids = JSON.stringify({ ...plainPlan, rooms: plainPlan.rooms.map((room) => ({ ...room, name: '' })) })
    expect(ids).not.toMatch(/[-"](?:客厅|卧室|次卧)[-"]/u)
    expect(plainPlan.rooms.map((r) => [r.id, r.name])).toEqual([['living', '客厅'], ['bedroom', '卧室'], ['bedroom-2', '卧室']])
    expect(plainPlan.rooms.flatMap((r) => r.boundary).every((id) => plainPlan.walls.some((w) => w.id === id))).toBe(true)
    expect(plainPlan.openings.every((o) => plainPlan.walls.some((w) => w.id === o.wall))).toBe(true)
    expect(withPlainIds(plainPlan).renamed).toEqual([])
  })

  it('reads back as rooms text with plain ids, which writes the same rooms again', () => {
    const { plan } = withPlainIds(olderPlan())
    const reading = readRoomsText(plan)
    expect(reading.text).toContain('room living "客厅" living 4 x 3')
    const again = compileRoomsText(reading.text)
    expect(again.problems).toEqual([])
    expect(again.plan!.rooms.map((r) => [r.id, r.name])).toEqual(plan.rooms.map((r) => [r.id, r.name]))
    expect(again.plan!.openings.map((o) => o.id)).toEqual(['d1'])
  })
})
