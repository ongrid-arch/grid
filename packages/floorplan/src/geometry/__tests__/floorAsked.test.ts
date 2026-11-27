/** LVL-25: a floor named by its id, name, level, a word of its name or an ordinal. */
import { describe, expect, it } from 'vitest'
import { floorAsked } from '../floorAsked'
import type { FloorPlan } from '../plan'

const plan = (floors: Array<{ id: string; name?: string; level: number }>): FloorPlan => ({ version: '1', units: 'm', walls: [], rooms: [], openings: [], floors }) as unknown as FloorPlan

const hotel = plan([
  { id: 'l10', name: 'Level 10', level: 10 },
  { id: 'g', name: 'Ground floor', level: 0 },
  { id: 'l1', name: 'First floor', level: 1 },
  { id: 'l2', name: 'Second floor', level: 2 },
  { id: 'l3', name: 'Third floor', level: 3 },
  { id: 'm', name: 'Mezzanine', level: 1.5 },
])

describe('floorAsked (LVL-25)', () => {
  it('takes the id, then the name in any capitals and spacing', () => {
    expect(floorAsked(hotel, 'l2')).toEqual({ id: 'l2' })
    expect(floorAsked(hotel, 'L2')).toEqual({ id: 'l2' })
    expect(floorAsked(hotel, 'Second floor')).toEqual({ id: 'l2' })
    expect(floorAsked(hotel, '  second   FLOOR ')).toEqual({ id: 'l2' })
  })

  it('takes a level as a number', () => {
    expect(floorAsked(hotel, '2')).toEqual({ id: 'l2' })
    expect(floorAsked(hotel, 'level 10')).toEqual({ id: 'l10' })
    expect(floorAsked(hotel, '3rd')).toEqual({ id: 'l3' })
    expect(floorAsked(hotel, '1.5')).toEqual({ id: 'm' })
    expect(floorAsked(hotel, '0')).toEqual({ id: 'g' })
  })

  it('takes a word of the name, then an ordinal', () => {
    expect(floorAsked(hotel, 'third')).toEqual({ id: 'l3' })
    expect(floorAsked(hotel, 'mezzanine')).toEqual({ id: 'm' })
    expect(floorAsked(hotel, 'ground')).toEqual({ id: 'g' })
    const numbered = plan([
      { id: 'a', name: 'Level 0', level: 0 },
      { id: 'b', name: 'Level 1', level: 1 },
      { id: 'c', name: 'Level 2', level: 2 },
    ])
    expect(floorAsked(numbered, 'second')).toEqual({ id: 'c' })
    expect(floorAsked(numbered, 'Level 2')).toEqual({ id: 'c' })
  })

  it('says apart a word several floors answer to, and none', () => {
    expect(floorAsked(hotel, 'floor')).toBeNull()
    expect(floorAsked(hotel, 'level')).toBeNull()
    const two = plan([
      { id: 'a', name: 'East wing first', level: 1 },
      { id: 'b', name: 'West wing first', level: 1 },
    ])
    expect(floorAsked(two, 'first')).toEqual({ among: ['a', 'b'] })
    expect(floorAsked(hotel, 'roof')).toBeNull()
  })
})
