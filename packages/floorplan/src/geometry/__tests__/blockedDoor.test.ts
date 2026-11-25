/**
 * ARE-46: a door or doorless opening an item leaves nothing clear is closed: no way through, no
 * way out, and a room only it reaches is a room no route reaches.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from '../plan'
import type { Item } from '../../types/floorplan'
import { checkPlanSanity } from '../rules'
import { floorGraph } from '../rules/graph'

const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
const door = (id: string, onWall: string, offset = 1): Opening => ({ id, wall: onWall, type: 'door', offset, width: 0.9, height: 2.1, sill: 0 })

/** A hall and a bedroom behind one dividing wall; the front door into the hall and the bedroom door in `mid`. */
function house(items: Item[] = []): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [6.4, 0], 'exterior'),
      wall('e', [6.4, 0], [6.4, 3.2], 'exterior'),
      wall('n', [6.4, 3.2], [0, 3.2], 'exterior'),
      wall('w', [0, 3.2], [0, 0], 'exterior'),
      wall('mid', [3.2, 0], [3.2, 3.2], 'interior')
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s', 'mid', 'n', 'w'], use: 'living' },
      { id: 'bed', name: 'Bedroom', boundary: ['s', 'e', 'n', 'mid'], use: 'bedroom' }
    ],
    openings: [door('front', 's', 1), door('bed-door', 'mid', 1)],
    items
  }
}

/** A kitchen run standing across the bedroom door, on the bedroom's side, as wide as the hole. */
const run: Item = { id: 'run', kind: 'kitchen-run', at: [3.7, 1.45], size: [0.6, 2.2], turn: 0, height: 0.9 }

describe('a doorway an item leaves no clear width is closed (ARE-46)', () => {
  it('is a way through while no item stands in it', () => {
    const graph = floorGraph(house())
    expect(graph.links.map((l) => l.via)).toEqual(['bed-door'])
    expect(graph.blocked).toEqual([])
  })

  it('is closed, and names the item, when one covers the whole hole', () => {
    const graph = floorGraph(house([run]))
    expect(graph.links).toEqual([])
    expect(graph.blocked).toEqual([{ opening: 'bed-door', rooms: ['bed', 'hall'], by: ['run'] }])
  })

  it('stays open when the item leaves a stretch a person fits through', () => {
    const narrow: Item = { ...run, size: [0.6, 0.3], at: [3.7, 0.6] }
    expect(floorGraph(house([narrow])).blocked).toEqual([])
  })

  it('lists the room nothing reaches', () => {
    const found = checkPlanSanity(house([run])).findings.map((f) => `${f.code} ${f.rooms.join('+')}`)
    expect(found).toContain('no_route_to_exit bed')
    expect(found).not.toContain('room_without_door bed')
  })
})
