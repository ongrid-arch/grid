/** ARE-56: a wish with a name and a use meets a room of that use when no room carries the name. */
import { afterEach, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import type { BriefLine } from '../lines'

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

function plan(utilityName: string): unknown {
  const text = [
    'walls outside 0.3 inside 0.1 height 2.6',
    'room hall "Hall" corridor 6 x 3',
    `room util "${utilityName}" utility 3 x 3 north of hall`,
    'door d-in in hall south, centred, 1.2 wide',
    'door d-u between hall and util, centred, 0.9 wide',
    '',
  ].join('\n')
  const compiled = compileRoomsText(text)
  expect(compiled.problems).toEqual([])
  return compiled.plan
}

async function lines(p: unknown, wish: Record<string, unknown>): Promise<BriefLine[]> {
  b = bench({ 'p.json': p })
  const reply = await b.call('grid_write_brief', { plan: 'p.json', brief: { rooms: [{ ...wish, level: 'must', source: 'given', quote: 'a utility room' }] } })
  expect(reply.isError, reply.text).toBe(false)
  return (reply.data as { lines: BriefLine[] }).lines.filter((l) => l.wish === 'room' || l.wish === 'rooms')
}

describe('ARE-56: a room wish by use when the name differs', () => {
  it('is met by a room of that use named otherwise, and says which room it took', async () => {
    const [line] = await lines(plan('Utility / laundry'), { name: 'Utility', use: 'utility' })
    expect(line!.state).toBe('met')
    expect(line!.text).toContain('no room is named so')
    expect(line!.text).toContain('"Utility / laundry"')
    expect(line!.parts).toEqual([{ kind: 'room', id: 'util' }])
  })

  it('prefers a room carrying the name and says nothing about the use', async () => {
    const [line] = await lines(plan('Utility'), { name: 'Utility', use: 'utility' })
    expect(line!.state).toBe('met')
    expect(line!.text).not.toContain('no room is named so')
  })

  it('stays missed when no room carries the name or the use, and for a name alone', async () => {
    const [a] = await lines(plan('Utility / laundry'), { name: 'Utility', use: 'garage' })
    expect(a!.state).toBe('missed')
    const [c] = await lines(plan('Utility / laundry'), { name: 'Utility' })
    expect(c!.state).toBe('missed')
  })

  it('measures the room taken by use against a size', async () => {
    const out = await lines(plan('Utility / laundry'), { name: 'Utility', use: 'utility', area: 9 })
    expect(out.some((l) => l.state === 'met' && l.text.includes('area'))).toBe(true)
  })
})
