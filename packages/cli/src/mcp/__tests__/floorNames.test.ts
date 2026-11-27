/**
 * LVL-25: a floor named the way the person names it (its name, its level, a word of its name)
 * wherever a tool takes a floor, the floors of a refusal in level order, and a room named with its
 * floor whenever a room of another floor has its name.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench } from './replay/harness'
import { roomCalled, surveyPlan } from '../../quantities/survey'
import { comparePlans } from '../../quantities/compare'

const text = (size: string): string =>
  [
    'walls outside 0.3 inside 0.15 height 2.8',
    'floor l10 "Level 10" level 10',
    'room hall "Hall" corridor 6 x 2 at 0,0',
    'floor g "Ground floor" level 0',
    'room lobby "Lobby" corridor 6 x 2 at 0,0',
    'floor l2 "Second floor" level 2',
    `room key "Key 122" bedroom ${size} at 0,0`,
    'floor l3 "Third floor" level 3',
    'room key "Key 122" bedroom 4 x 3 at 0,0',
  ].join('\n')

function plan(size = '4 x 3'): Record<string, unknown> {
  const result = compileRoomsText(text(size))
  expect(result.problems).toEqual([])
  return result.plan as unknown as Record<string, unknown>
}

describe('floors by name or level, and rooms named with their floor (LVL-25)', () => {
  const b = bench({ 'plan.json': plan() })
  afterAll(() => b.close())

  it('finds the floor by its name, its level or a word of its name', async () => {
    for (const floor of ['l2', 'Second floor', 'second floor', '2', 'level 2', 'second']) {
      const reply = await b.call('grid_find', { plan: 'plan.json', floor, where: ['kind = room'] })
      expect(reply.isError, `${floor}: ${reply.text}`).toBe(false)
      expect((reply.data!['ids'] as string[]).length).toBe(1)
      expect(reply.data!['floors']).toEqual(['l2'])
    }
    const third = await b.call('grid_describe', { plan: 'plan.json', length: 'walk', floor: 'third' })
    expect(third.isError, third.text).toBe(false)
  })

  it('refuses a floor not there with the floors in level order, each with its name', async () => {
    const reply = await b.call('grid_find', { plan: 'plan.json', floor: 'roof', where: ['kind = room'] })
    expect(reply.isError).toBe(true)
    const order = ['"g"', '"l2"', '"l3"', '"l10"'].map((id) => reply.text.indexOf(id))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
    expect(reply.text).toContain('"l2" ("Second floor")')
    expect(reply.text).not.toContain('roof')
  })

  it('names a room with its floor when a room of another floor has its name', () => {
    const survey = surveyPlan(parseFloorPlan(plan()))
    const names = survey.rooms.map((room) => roomCalled(room.facts))
    expect(names).toContain('Key 122 (Second floor)')
    expect(names).toContain('Key 122 (Third floor)')
    expect(names).toContain('Lobby')
  })

  it('compares the rooms of one name floor by floor', () => {
    const before = surveyPlan(parseFloorPlan(plan()))
    const after = surveyPlan(parseFloorPlan(plan('5 x 3')))
    const rows = comparePlans(before, after).rooms.filter((row) => row.name.startsWith('Key 122'))
    expect(rows.map((row) => row.name).sort()).toEqual(['Key 122 (Second floor)', 'Key 122 (Third floor)'])
    const second = rows.find((row) => row.name === 'Key 122 (Second floor)')!
    expect(second.after! - second.before!).toBeCloseTo(3, 1)
  })
})
