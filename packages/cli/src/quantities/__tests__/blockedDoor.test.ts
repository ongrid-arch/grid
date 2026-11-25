/**
 * ARE-46: a doorway an item leaves no clear width in is closed for the walk and every route, and
 * the answer names the item.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { routeBetween, wayGraph } from '../measure'
import { surveyPlan } from '../survey'
import { planWalk } from '../../describe/walk'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, kind: string): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
const door = (id: string, wallId: string, offset: number): Record<string, unknown> => ({ id, wall: wallId, type: 'door', offset, width: 0.9, sill: 0, height: 2.1 })
const RUN = { id: 'run', kind: 'kitchen-run', at: [3.7, 1.45], size: [0.6, 2.2], turn: 0, height: 0.9 }

/** A hall and a bedroom behind one dividing wall: the front door into the hall, the bedroom's only door in the wall between. */
function house(items: unknown[] = []): FloorPlan {
  return parseFloorPlan({
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [6.4, 0], 'exterior'),
      wall('e', [6.4, 0], [6.4, 3.2], 'exterior'),
      wall('n', [6.4, 3.2], [0, 3.2], 'exterior'),
      wall('w', [0, 3.2], [0, 0], 'exterior'),
      wall('mid', [3.2, 0], [3.2, 3.2], 'interior'),
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s', 'mid', 'n', 'w'], use: 'living' },
      { id: 'bed', name: 'Bedroom', boundary: ['s', 'e', 'n', 'mid'], use: 'bedroom' },
    ],
    openings: [door('front', 's', 1), door('bed-door', 'mid', 1)],
    items,
  })
}

describe('a doorway an item blocks (ARE-46)', () => {
  it('is a way into the room while the item is away, and is not once it stands there', () => {
    expect(routeBetween(surveyPlan(house()), 'hall', 'bed')?.steps.map((s) => s.via)).toEqual(['bed-door'])
    expect(routeBetween(surveyPlan(house([RUN])), 'hall', 'bed')).toBeNull()
    expect(routeBetween(surveyPlan(house([RUN])), 'bed', 'outside')).toBeNull()
  })

  it('is named in the way graph with the item', () => {
    expect(wayGraph(surveyPlan(house([RUN])), 'ground').blocked).toEqual([{ opening: 'bed-door', rooms: ['bed', 'hall'], by: ['run'] }])
  })

  it('is not walked through: the walk does not reach the room', () => {
    const survey = surveyPlan(house([RUN]))
    expect(planWalk(survey).floors[0]!.notReached).toEqual(['bed'])
    expect(planWalk(surveyPlan(house())).floors[0]!.notReached).toEqual([])
  })

  describe('grid_measure what=route', () => {
    let b: Bench | undefined
    afterEach(() => b?.close())

    it('says there is no way and names the doorway and the item that closes it', async () => {
      b = bench({ 'house.json': house([RUN]) })
      const reply = await b.call('grid_measure', { plan: 'house.json', what: 'route', room: 'hall', to: 'bed' })
      expect(reply.text).toContain('There is no way from "Hall" to "Bedroom"')
      expect(reply.text).toContain('The door "bed-door" between "Bedroom" and "Hall" is closed: "run" leaves none of it clear.')
      expect(reply.data).toMatchObject({ answer: { found: false, blocked: [{ via: 'bed-door', between: ['bed', 'hall'], by: ['run'] }] } })
    })
  })
})
