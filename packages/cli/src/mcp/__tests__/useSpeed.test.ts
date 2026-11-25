/**
 * CNT-23: grid_measure what=use on a plan with thousands of items. It looks only at the items
 * that stand in or against the room asked about, and answers in a time that stays far inside the
 * limit however many chairs stand elsewhere. Time is the process's own CPU time, so a loaded
 * machine does not fail it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

/** A 50 × 40 m hall full of chairs in rows, and a small office beside it with one. */
function hall(chairs: number): unknown {
  const wall = (id: string, start: number[], end: number[], kind = 'exterior') => ({ id, start, end, thickness: 0.2, height: 3, kind })
  const items: unknown[] = []
  for (let i = 0; i < chairs; i++) {
    items.push({ id: `c${i}`, kind: 'chair', at: [1 + (i % 50) * 0.9, 1 + Math.floor(i / 50) * 0.9], size: [0.5, 0.5], height: 0.9 })
  }
  items.push({ id: 'desk-chair', kind: 'chair', at: [53, 2], size: [0.5, 0.5], height: 0.9 })
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s1', [0, 0], [50, 0]), wall('s2', [50, 0], [56, 0]), wall('e', [56, 0], [56, 40]),
      wall('n2', [56, 40], [50, 40]), wall('n1', [50, 40], [0, 40]), wall('w', [0, 40], [0, 0]),
      { ...wall('div', [50, 0], [50, 40], 'interior'), thickness: 0.1 },
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s1', 'div', 'n1', 'w'], use: 'assembly' },
      { id: 'office', name: 'Office', boundary: ['s2', 'e', 'n2', 'div'], use: 'office' },
    ],
    openings: [{ id: 'door', wall: 'div', type: 'door', offset: 5, width: 0.9, height: 2.1 }],
    items,
  }
}

/** The CPU seconds a call takes, user and system. */
async function cpuSeconds(run: () => Promise<unknown>): Promise<number> {
  const start = process.cpuUsage()
  await run()
  const used = process.cpuUsage(start)
  return (used.user + used.system) / 1e6
}

describe('what=use on a plan with 2,022 items', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({ 'hall.json': hall(2022) })
  })
  afterAll(() => b.close())

  it('answers for the small room without looking at the chairs next door', async () => {
    let text = ''
    const seconds = await cpuSeconds(async () => {
      const reply = await b.call('grid_measure', { plan: 'hall.json', what: 'use', room: 'office' })
      expect(reply.isError, reply.text).toBe(false)
      text = reply.text
    })
    expect(text).toContain('desk-chair')
    // About a second of work; it used to run past three minutes.
    expect(seconds).toBeLessThan(10)
  }, 120_000)

  it('answers for the crowded room in seconds', async () => {
    const seconds = await cpuSeconds(async () => {
      const reply = await b.call('grid_measure', { plan: 'hall.json', what: 'use', room: 'hall' })
      expect(reply.isError, reply.text).toBe(false)
      expect(reply.text).toContain('Indicator')
    })
    expect(seconds).toBeLessThan(20)
  }, 180_000)
})
