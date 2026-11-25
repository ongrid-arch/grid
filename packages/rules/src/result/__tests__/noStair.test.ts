/**
 * LVL-14 in the record: a floor above the ground that nothing joins to the ground floor is a
 * finding, `floor/no-stair`, on the floor, with the rooms-text line that adds a stair. Before, a
 * two-storey house with no stair came back with no finding and one not-checked line.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { edit, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { inspectPlan } from '../inspect'

beforeAll(async () => {
  await loadLanguage('es')
})

describe('a floor above the ground with no stair, in grid check (LVL-14)', () => {
  it('is one finding on the floor, with the line that adds a stair, and no not-checked line beside it', () => {
    const result = inspectPlan(JSON.stringify(twoFloorHouse()))
    const lines = result.lines.filter((l) => l.code === 'floor/no-stair')
    expect(lines.map((l) => [l.kind, l.thing, l.floor])).toEqual([['finding', { kind: 'floor', id: 'first' }, 'first']])
    const line = lines[0]!
    expect(line.message).toBe('"First floor" stands above the ground, and nothing joins it to the ground floor: no room on it is used as a stair or a lift, and the plan states no stair to it')
    expect(line.found).toBe('a floor above the ground with no stair or lift room on it, and no stair stated to it')
    expect(line.needed).toBe('a stair joining it, through the floors between, to the ground floor')
    expect(line.fix).toBe(
      'Add a stair. In rooms text, under the line that starts "floor ground": room stair "Stair" stair 1 x 3 <where> through first, which stands on every floor up to this one. Or state it in the plan\'s stairs, from "ground" to "first".'
    )
    expect(result.lines.map((l) => l.code)).not.toContain('floor/not-checked-no-stairs')
    expect(result.counts.finding).toBe(1)
  })

  it('is looked at by the way-out check, which counts it', () => {
    const result = inspectPlan(JSON.stringify(twoFloorHouse()))
    const exit = result.coverage.find((c) => c.ruleId === 'floor-has-exit')!
    expect(exit.lookedAt).toEqual([
      { floor: 'ground', ids: ['ground'] },
      { floor: 'first', ids: ['first'] }
    ])
    expect(exit.findings).toBe(1)
  })

  it('leaves a stair room with none below it as a way out not checked', () => {
    const upstairsOnly = edit(twoFloorHouse(), (copy) => {
      copy.rooms = copy.rooms.map((r) => (r.id === 'landing' ? { ...r, use: 'stair' } : r))
    })
    const codes = inspectPlan(JSON.stringify(upstairsOnly)).lines.map((l) => l.code)
    expect(codes).not.toContain('floor/no-stair')
    expect(codes).toContain('floor/not-checked-no-stairs')
  })

  it('is worded in Spanish too', () => {
    const line = inspectPlan(JSON.stringify(twoFloorHouse()), { language: 'es' }).lines.find((l) => l.code === 'floor/no-stair')!
    expect(line.message).toContain('nada la une con la planta baja')
    expect(line.fix).toContain('through first')
  })
})
