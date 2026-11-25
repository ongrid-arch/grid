/**
 * ARE-20: grid_areas with the gross figures held in order. A gross figure below one it must hold
 * is given, marked not proven, with why; and one building is measured apart from the one built
 * against it (`apart_rooms`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

type Pt = [number, number]
const wall = (id: string, start: Pt, end: Pt, thickness: number) => ({ id, start, end, thickness, height: 3 })

/** A flat and a corridor east of it whose walls do not enclose it: its floor is in the net and in no gross figure. */
function openCorridor(): unknown {
  return {
    version: '1',
    units: 'm',
    walls: [wall('s', [0, 0], [6, 0], 0.2), wall('e', [6, 0], [6, 6], 0.2), wall('n', [6, 6], [0, 6], 0.2), wall('w', [0, 6], [0, 0], 0.2), wall('cs', [6, 0], [7, 0], 0.2), wall('cn', [7, 6], [6, 6], 0.2), wall('ce', [8, 1], [8, 5], 0.2)],
    rooms: [
      { id: 'flat', name: 'Flat', boundary: ['s', 'e', 'n', 'w'] },
      { id: 'hall', name: 'Corridor', use: 'corridor', boundary: ['cs', 'ce', 'cn', 'e'] },
    ],
    openings: [],
  }
}

/** A chapel 10 × 8 m and a sacristy 6 × 8 m built against it, sharing one wall, every wall 0.3 m. */
function attached(): unknown {
  return {
    version: '1',
    units: 'm',
    walls: [wall('as', [0, 0], [10, 0], 0.3), wall('party', [10, 0], [10, 8], 0.3), wall('an', [10, 8], [0, 8], 0.3), wall('aw', [0, 8], [0, 0], 0.3), wall('bs', [10, 0], [16, 0], 0.3), wall('be', [16, 0], [16, 8], 0.3), wall('bn', [16, 8], [10, 8], 0.3)],
    rooms: [
      { id: 'chapel', name: 'Chapel', boundary: ['as', 'party', 'an', 'aw'] },
      { id: 'sacristy', name: 'Sacristy', boundary: ['bs', 'be', 'bn', 'party'] },
    ],
    openings: [],
  }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'corridor.json': openCorridor(), 'attached.json': attached() })
})
afterAll(() => b.close())

async function ok(args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call('grid_areas', args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}

interface State { state: string; why?: string[] }

describe('ARE-20 a gross figure below the net is not proven, and says why', () => {
  it('marks both gross figures not proven, with the reason in the state and the text', async () => {
    const reply = await ok({ plan: 'corridor.json', gross: 'both' })
    const states = reply.data!['states'] as Record<string, State>
    expect((reply.data!['net'] as number)).toBeGreaterThan(reply.data!['grossInternal'] as number)
    expect(states['grossInternal']!.state).toBe('not-proven')
    expect(states['grossExternal']!.state).toBe('not-proven')
    expect(states['grossInternal']!.why).toEqual([expect.stringMatching(/^On floor "ground": The gross internal area is \d+\.\d\d m² less than the net area, which it must hold/)])
    expect(reply.text).toMatch(/Gross internal: [\d.]+ m²; not proven: On floor "ground": The gross internal area is [\d.]+ m² less than the net area, which it must hold, so it is not proven: 10\.44 m² of the rooms' floor lies on walls or outside them/)
    const floor = (reply.data!['floors'] as { states: Record<string, State> }[])[0]!
    expect(floor.states['grossInternal']!.state).toBe('not-proven')
  })

  it('leaves the gross figures proven where they are in order', async () => {
    const reply = await ok({ plan: 'attached.json', gross: 'both' })
    const states = reply.data!['states'] as Record<string, State>
    expect(states['grossInternal']).toEqual({ state: 'proven', leftOut: [], notProven: [] })
    expect(states['grossExternal']!.state).toBe('proven')
    expect(reply.text).not.toContain('which it must hold')
  })
})

describe('ARE-20 one building measured apart (apart_rooms)', () => {
  it('gives the chapel its net and its area to the middle of the shared wall', async () => {
    const reply = await ok({ plan: 'attached.json', gross: 'both', apart_rooms: ['chapel'] })
    const apart = reply.data!['apart'] as { rooms: string[]; net: number; toPartyWalls: { grossInternal: number; grossExternal: number }; state: State }
    expect(apart.rooms).toEqual(['chapel'])
    expect(apart.net).toBeCloseTo(74.69, 6)
    expect(apart.toPartyWalls.grossInternal).toBeCloseTo(75.845, 1)
    expect(apart.toPartyWalls.grossExternal).toBeCloseTo(84.245, 1)
    expect(apart.state.state).toBe('proven')
    // 75.845 and 84.245 by hand: either rounding of the last half is right.
    expect(reply.text).toMatch(/Measured apart \(1 room\): net 74\.69 m²; to the middle of the walls they share with the rest 75\.8[45] m² to the inside face of the outer walls, 84\.2[45] m² to the outside face of the outer walls\./)
  })

  it('answers as before without it, and refuses a room the plan does not have', async () => {
    expect('apart' in (await ok({ plan: 'attached.json' })).data!).toBe(false)
    const refused = await b.call('grid_areas', { plan: 'attached.json', apart_rooms: ['nave'] })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('apart_rooms')
  })
})
