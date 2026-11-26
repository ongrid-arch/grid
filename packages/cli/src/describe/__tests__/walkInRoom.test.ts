/**
 * MSG-31: an item against an inner wall that faces back toward you, but stands metres into the
 * room, is said by where it stands, never as "in the wall you stand in".
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../../quantities/survey'
import { planWalk, walkText } from '../walk'

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })

/** A lounge 10 × 12 m with a 4 × 6 m corner cut from its south-west: the cut's north face looks south, back at the door. */
const LOUNGE = {
  version: '1',
  units: 'm',
  walls: [
    wall('s', [4, 0], [10, 0]),
    wall('e', [10, 0], [10, 12]),
    wall('n', [10, 12], [0, 12]),
    wall('w', [0, 12], [0, 6]),
    wall('step', [0, 6], [4, 6]),
    wall('cut', [4, 6], [4, 0]),
  ],
  rooms: [{ id: 'lounge', name: 'Lounge', boundary: ['s', 'e', 'n', 'w', 'step', 'cut'], use: 'living' }],
  openings: [{ id: 'in', wall: 's', type: 'door', offset: 2.55, width: 0.9, sill: 0, height: 2.1 }],
  items: [{ id: 'table', kind: 'table', label: 'Table', at: [2, 6.4], size: [1.6, 0.6], height: 0.75 }],
}

describe('an item against a wall that faces back, far into the room (MSG-31)', () => {
  const survey = surveyPlan(parseFloorPlan(LOUNGE))
  const walk = planWalk(survey)
  const lounge = walk.floors[0]!.stops[0]!

  it('is not in the wall you stand in', () => {
    expect(lounge.behind.map((t) => t.id)).toEqual([])
    expect(lounge.inRoom.map((t) => t.id)).toEqual(['table'])
    expect(lounge.inRoom[0]!.near!.ahead).toBeGreaterThan(5)
  })

  it('is said as standing in the room, in words', () => {
    const text = walkText(survey, walk, 'person')
    expect(text).not.toContain('In the wall you stand in: the Table')
    expect(text).toContain('Standing clear of the walls: the Table')
  })
})
