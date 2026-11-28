/**
 * ARE-82: a floor below the ground says so and how deep, for a person and for an agent, as a
 * range on a slope; a floor at or above the ground says nothing more than before.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { describeText } from '../card'
import { planFacts } from '../facts'

const box = (p: string, floor: string, x1: number, y1: number) => [
  { id: `${p}s`, floor, start: [0, 0], end: [x1, 0], kind: 'exterior' },
  { id: `${p}e`, floor, start: [x1, 0], end: [x1, y1], kind: 'exterior' },
  { id: `${p}n`, floor, start: [x1, y1], end: [0, y1], kind: 'exterior' },
  { id: `${p}w`, floor, start: [0, y1], end: [0, 0], kind: 'exterior' },
]

const basement = parseFloorPlan({
  floors: [
    { id: 'b1', name: 'Basement', level: -1, elevation: -3.2, height: 2.7, slab: 0.25 },
    { id: 'ground', name: 'Ground floor', level: 0, elevation: 0, height: 2.7, slab: 0.25 },
  ],
  site: { ground: 0 },
  walls: [...box('g', 'ground', 10, 8), ...box('a', 'b1', 10, 8)],
  rooms: [
    { id: 'hall', name: 'Hall', floor: 'ground', boundary: ['gs', 'ge', 'gn', 'gw'], use: 'living' },
    { id: 'den', name: 'Den', floor: 'b1', boundary: ['as', 'ae', 'an', 'aw'], use: 'living' },
  ],
})

describe('a floor below the ground, described (ARE-82)', () => {
  it('says how deep its floor is for a person, and nothing on the ground floor', () => {
    const lines = describeText(planFacts(basement), 'rooms', 'person').split('\n')
    expect(lines.find((l) => l.startsWith('Basement:'))).toContain('Its floor is 3.2 m below the ground.')
    expect(lines.find((l) => l.startsWith('Ground floor:'))).not.toContain('below the ground')
  })

  it('gives an agent the same as a token', () => {
    const text = describeText(planFacts(basement), 'rooms', 'agent')
    expect(text).toMatch(/FLOOR b1 "Basement" level -1 below-ground 3\.2:/)
    expect(text).toMatch(/FLOOR ground "Ground floor" level 0:/)
  })

  it('gives a range on a slope', () => {
    const slope = parseFloorPlan({
      site: { groundSides: { west: 0, east: 2 } },
      walls: box('h', 'ground', 10, 6),
      rooms: [{ id: 'room', name: 'Room', boundary: ['hs', 'he', 'hn', 'hw'], use: 'living' }],
    })
    expect(describeText(planFacts(slope), 'rooms', 'agent')).toMatch(/ below-ground 0-\d+(\.\d+)?:/)
    expect(describeText(planFacts(slope), 'rooms', 'person')).toMatch(/Its floor is 0 to \d+(\.\d+)? m below the ground\./)
  })
})
