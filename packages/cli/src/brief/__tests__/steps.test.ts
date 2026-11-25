/**
 * ARE-44: the brief's "step" figure reads every change of level on the way in, as the access
 * measure does: a door's sill, a raised floor between rooms, and the ground outside the entrance.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import type { BriefLine } from '../lines'

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

const TEXT = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room hall "Hall" corridor 3 x 3',
  'room board "Boardroom" office 4 x 3 east of hall',
  'door d-in in hall south, centred, 0.9 wide',
  'door d-board between hall and board, centred, 0.9 wide',
  '',
].join('\n')

interface Tweak {
  boardOffset?: number
  hallOffset?: number
  ground?: number
}

function planWith(tweak: Tweak): unknown {
  const compiled = compileRoomsText(TEXT)
  expect(compiled.problems).toEqual([])
  const plan = JSON.parse(JSON.stringify(compiled.plan)) as { rooms: Array<{ id: string; floorOffset?: number }>; site?: Record<string, unknown> }
  for (const room of plan.rooms) {
    if (room.id === 'board' && tweak.boardOffset !== undefined) room.floorOffset = tweak.boardOffset
    if (room.id === 'hall' && tweak.hallOffset !== undefined) room.floorOffset = tweak.hallOffset
  }
  if (tweak.ground !== undefined) plan.site = { ...(plan.site ?? {}), ground: tweak.ground }
  return plan
}

async function stepLines(tweak: Tweak): Promise<BriefLine[]> {
  b = bench({ 'flat.json': planWith(tweak) })
  const reply = await b.call('grid_write_brief', { plan: 'flat.json', brief: { figures: { step: { value: 0.02, level: 'must', source: 'given', quote: 'no step' } } } })
  expect(reply.isError, reply.text).toBe(false)
  return (reply.data as { lines: BriefLine[] }).lines.filter((l) => l.wish === 'step')
}

describe('ARE-44: the step line', () => {
  it('is met when every floor is level and every sill is flush', async () => {
    const lines = await stepLines({ ground: 0 })
    expect(lines.map((l) => l.state)).toEqual(['met'])
  })

  it('misses a raised boardroom floor behind a flush door', async () => {
    const lines = await stepLines({ boardOffset: 0.15 })
    const missed = lines.filter((l) => l.state === 'missed')
    expect(missed).toHaveLength(1)
    expect(missed[0]).toMatchObject({ drawn: '0.15', parts: [{ kind: 'opening', id: 'd-board' }] })
    expect(missed[0]!.text).toContain('0.15 m')
  })

  it('misses the step from the stated ground up to the entrance floor', async () => {
    const lines = await stepLines({ hallOffset: 0.15, boardOffset: 0.15, ground: 0 })
    const missed = lines.filter((l) => l.state === 'missed')
    expect(missed.map((l) => l.parts[0]!.id)).toEqual(['d-in'])
    expect(missed[0]).toMatchObject({ drawn: '0.15' })
  })

  it('says nothing about the ground when the plan states none', async () => {
    const lines = await stepLines({ hallOffset: 0.15, boardOffset: 0.15 })
    expect(lines.map((l) => l.state)).toEqual(['met'])
  })
})
