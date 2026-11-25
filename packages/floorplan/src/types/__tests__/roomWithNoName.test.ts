/* eslint-disable @typescript-eslint/no-explicit-any -- these tests write wrong values into plans on purpose */
import { describe, expect, it } from 'vitest'
import { flat } from '../../test-support/plans'
import { validatePlan } from '../../geometry'
import { readPlanParts } from '../readParts'

/**
 * WRT-43: a room with no name is drawn and measured by its id. Taking the names off a plan's
 * rooms once left every one of them out of every view and measure.
 */

const file = (): Record<string, any> => JSON.parse(JSON.stringify(flat()))

function read(raw: unknown) {
  const result = readPlanParts(raw)
  if (result.plan === null) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  return result
}

describe('a room with no name (WRT-43)', () => {
  it('is read with its id as its name, and the line says the id is used', () => {
    const raw = file()
    const id = raw.rooms[0].id as string
    delete raw.rooms[0].name
    const result = read(raw)
    expect(result.plan.rooms).toHaveLength(raw.rooms.length)
    expect(result.plan.rooms[0]!.name).toBe(id)
    expect(result.leftOut).toEqual([])
    expect(result.faults).toEqual([
      { kind: 'value-left-out', part: { list: 'rooms', index: 0, id }, path: ['rooms', 0, 'name'], found: 'missing', wants: 'a text', used: JSON.stringify(id) }
    ])
    // Drawn, so no check leaves it out or holds back what rests on it.
    expect(validatePlan(result.plan).issues.filter((i) => i.id === id)).toEqual([])
  })

  it('reads a null or a list for a name the same way', () => {
    const raw = file()
    raw.rooms[0].name = null
    raw.rooms[1].name = ['Kitchen']
    const result = read(raw)
    expect(result.plan.rooms.map((r) => r.name).slice(0, 2)).toEqual([raw.rooms[0].id, raw.rooms[1].id])
    expect(result.faults.map((f) => [f.kind, 'path' in f ? f.path.join('.') : null])).toEqual([
      ['value-left-out', 'rooms.0.name'],
      ['value-left-out', 'rooms.1.name']
    ])
  })

  it('keeps a blank name as written', () => {
    const raw = file()
    raw.rooms[0].name = ''
    const result = read(raw)
    expect(result.plan.rooms[0]!.name).toBe('')
    expect(result.faults).toEqual([])
  })

  it('still leaves out a room whose id cannot be read either', () => {
    const raw = file()
    delete raw.rooms[0].name
    raw.rooms[0].id = 7.5
    const result = read(raw)
    expect(result.faults.some((f) => f.kind === 'part-left-out' && f.part.index === 0)).toBe(true)
    expect(result.plan.rooms).toHaveLength(raw.rooms.length - 1)
  })
})
