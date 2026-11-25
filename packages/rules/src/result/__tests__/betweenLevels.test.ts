/**
 * LVL-17 in the record: a door between two rooms whose floors stand further apart than a step is a
 * finding, `opening/between-levels`, on the door, naming both levels. Before, a foyer door onto a
 * hall's back row 3 m up was a way through and the plan came back with no finding.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { inspectPlan } from '../inspect'

beforeAll(async () => {
  await loadLanguage('es')
})

const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior') => ({ id, start, end, thickness: 0.2, height: 6, kind })

const cinema = (rise: number): string =>
  JSON.stringify({
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [8, 0], 'exterior'),
      wall('e', [8, 0], [8, 4], 'exterior'),
      wall('n', [8, 4], [0, 4], 'exterior'),
      wall('w', [0, 4], [0, 0], 'exterior'),
      wall('mid', [4, 0], [4, 4], 'interior')
    ],
    rooms: [
      { id: 'foyer', name: 'Foyer', boundary: ['s', 'mid', 'n', 'w'], use: 'reception' },
      { id: 'hall', name: 'Back row', boundary: ['s', 'e', 'n', 'mid'], use: 'assembly', floorOffset: rise }
    ],
    openings: [
      { id: 'front', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 },
      { id: 'hall-door', wall: 'mid', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }
    ]
  })

describe('a door onto a floor much higher than its own, in grid check (LVL-17)', () => {
  it('is one finding on the door, naming both levels, and the room up there has no route out', () => {
    const result = inspectPlan(cinema(3))
    const lines = result.lines.filter((l) => l.code === 'opening/between-levels')
    expect(lines.map((l) => [l.kind, l.thing, l.floor])).toEqual([['finding', { kind: 'opening', id: 'hall-door' }, lines[0]!.floor]])
    const line = lines[0]!
    expect(line.message).toBe(
      'A door joins "Foyer", its floor at 0.00 m, and "Back row", its floor at 3.00 m: 3.00 m apart, more than a step, so it is not a way through without a stair'
    )
    expect(line.found).toBe('floors 3.00 m apart on its two sides')
    expect(line.needed).toBe("floors no more than 0.30 m apart, Grid's own size for a step and not a code figure, or a stair between them")
    expect(line.fix).toContain('draw it as a room used as a stair')
    expect(result.lines.map((l) => l.code)).toContain('room/no-route-out')
  })

  it('says nothing at a step', () => {
    expect(inspectPlan(cinema(0.3)).lines.map((l) => l.code)).not.toContain('opening/between-levels')
  })

  it('is worded in Spanish too', () => {
    const line = inspectPlan(cinema(3), { language: 'es' }).lines.find((l) => l.code === 'opening/between-levels')!
    expect(line.message).toContain('más que un escalón')
    expect(line.found).toBe('suelos a 3,00 m de diferencia a sus dos lados')
  })
})
