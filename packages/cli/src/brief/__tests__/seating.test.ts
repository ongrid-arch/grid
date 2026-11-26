/** ARE-67: a brief's seats, desks and covers, held to the count from the furniture. */
import { afterEach, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { seatingPlan, SEATING_ITEMS } from '../../quantities/__tests__/seatingPlan'
import type { BriefLine } from '../lines'

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

const said = { level: 'must', source: 'given', quote: 'what the person said' }

async function write(p: unknown, brief: Record<string, unknown>): Promise<{ lines: BriefLine[]; refused: { where: string; problem: string }[]; text: string }> {
  b = bench({ 'p.json': p })
  const reply = await b.call('grid_write_brief', { plan: 'p.json', brief })
  expect(reply.isError, reply.text).toBe(false)
  return { ...(reply.data as { lines: BriefLine[]; refused: { where: string; problem: string }[] }), text: reply.text }
}

const seatLines = (lines: readonly BriefLine[]) => lines.filter((l) => l.unit === 'seats' || l.unit === 'desks' || l.unit === 'covers')

describe('ARE-67: seats, desks and covers on a room wish', () => {
  it('holds a room\'s seats and covers to the furniture, met and missed', async () => {
    const { lines } = await write(seatingPlan(SEATING_ITEMS), {
      rooms: [
        { name: 'Cafe', seats_at_least: 24, ...said },
        { name: 'Cafe', covers: 4, ...said },
      ],
    })
    const [seats, covers] = seatLines(lines)
    expect(seats).toMatchObject({ state: 'missed', asked: 'at least 24', drawn: '8', unit: 'seats', parts: [{ kind: 'room', id: 'cafe' }] })
    expect(seats!.text).toContain('"Cafe" seats asked at least 24, drawn 8')
    expect(covers).toMatchObject({ state: 'met', asked: '4', drawn: '4' })
  })

  it('counts a zone\'s desks, and the rooms of a use together, each listed', async () => {
    const { lines } = await write(seatingPlan(SEATING_ITEMS), {
      rooms: [
        { name: 'Team A', desks_at_least: 3, ...said },
        { name: 'Team B', desks_at_most: 1, ...said },
        { use: 'office', desks: 5, ...said },
      ],
    })
    const [a, bLine, office] = seatLines(lines)
    expect(a).toMatchObject({ state: 'met', drawn: '3' })
    expect(bLine).toMatchObject({ state: 'missed', asked: 'at most 1', drawn: '2' })
    // The open office and its zones: the zones are counted in their room, not again.
    expect(office).toMatchObject({ state: 'met', drawn: '5', parts: [{ kind: 'room', id: 'open' }] })
  })

  it('reads a number of seats in the quote of a wish that gives none, instead of answering met', async () => {
    const { lines } = await write(seatingPlan(SEATING_ITEMS), { rooms: [{ name: 'Cafe', level: 'must', source: 'given', quote: 'a cafe with 24 seats' }] })
    const [line] = seatLines(lines)
    expect(line).toMatchObject({ state: 'missed', asked: 'at least 24', drawn: '8' })
    expect(line!.text).toContain('the number in its words')
    expect(lines.some((l) => l.state === 'met' && l.wish === 'room')).toBe(false)
  })

  it('refuses a target given both exactly and at least', async () => {
    const { refused } = await write(seatingPlan(SEATING_ITEMS), { rooms: [{ name: 'Cafe', seats: 8, seats_at_least: 6, ...said }, { name: 'Cafe', ...said }] })
    expect(refused.map((r) => r.where)).toEqual(['rooms[0]'])
    expect(refused[0]!.problem).toContain('seats_at_least')
  })
})

describe('ARE-67: the whole plan\'s seats, desks and covers', () => {
  it('takes desks, seats and covers as the person\'s own figures, met and missed', async () => {
    const { lines, text } = await write(seatingPlan(SEATING_ITEMS), {
      figures: {
        desks: { value: 110, level: 'must', source: 'given', quote: '110 desks' },
        seats: { value: 12, level: 'must', source: 'given', quote: 'a dozen seats at least' },
        covers: { value: 4, level: 'should', source: 'assumed' },
      },
    })
    const by = Object.fromEntries(lines.map((l) => [l.wish, l]))
    expect(by['desks']).toMatchObject({ state: 'missed', asked: 'at least 110', drawn: '5' })
    expect(by['seats']).toMatchObject({ state: 'met', drawn: '13' })
    expect(by['covers']).toMatchObject({ state: 'met', drawn: '4' })
    expect(text).toContain("The person's own figures")
  })

  it('refuses a number of desks that is not whole', async () => {
    const { refused } = await write(seatingPlan(SEATING_ITEMS), { figures: { desks: { value: 10.5, level: 'must', source: 'assumed' } }, open: [{ quote: 'room to grow' }] })
    expect(refused[0]!.where).toBe('figures.desks')
  })
})

describe('ARE-67: numbered rooms by name or type', () => {
  /** Six booths numbered along the cafe's east wall would need walls; six rooms named or typed so, side by side, do. */
  function booths(named: (i: number) => { name: string; roomType?: string }): unknown {
    const walls: unknown[] = []
    const rooms: unknown[] = []
    for (let i = 0; i < 6; i++) {
      const x = i * 1.2
      const w = (id: string, s: number[], e: number[]) => ({ id: `${id}${i}`, start: s, end: e, thickness: 0.1, height: 2.4, kind: 'exterior' })
      walls.push(w('s', [x, 0], [x + 1.2, 0]), w('e', [x + 1.2, 0], [x + 1.2, 1.2]), w('n', [x + 1.2, 1.2], [x, 1.2]))
      if (i === 0) walls.push({ id: 'w0', start: [0, 1.2], end: [0, 0], thickness: 0.1, height: 2.4, kind: 'exterior' })
      rooms.push({ id: `pb${i + 1}`, ...named(i + 1), boundary: [`s${i}`, `e${i}`, `n${i}`, i === 0 ? 'w0' : `e${i - 1}`] })
    }
    return { version: '1', units: 'm', walls, rooms, openings: [] }
  }

  it('counts "Phone booths" as the rooms named "Phone booth 1" and on', async () => {
    const { lines } = await write(booths((i) => ({ name: `Phone booth ${i}` })), { rooms: [{ name: 'Phone booths', count: 6, ...said }] })
    const line = lines.find((l) => l.wish === 'rooms')!
    expect(line).toMatchObject({ state: 'met', drawn: '6' })
  })

  it('counts rooms by the room type the plan states', async () => {
    const { lines } = await write(booths((i) => ({ name: `PB-${i}`, roomType: 'Phone booth' })), { rooms: [{ name: 'Phone booth', count: 6, ...said }] })
    expect(lines.find((l) => l.wish === 'rooms')).toMatchObject({ state: 'met', drawn: '6' })
  })
})
