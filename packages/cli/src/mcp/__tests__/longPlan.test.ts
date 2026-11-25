/**
 * VEW-26: a plan view of a floor far longer than it is wide says so, and draws it a piece at a
 * time with tile; a house is drawn whole and refuses tile.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

/** A row of 40 rooms, each 20 by 15 m: a floor 800 m long. */
function strip(): unknown {
  const walls = [
    { id: 'long-a', start: [0, 0], end: [800, 0] },
    { id: 'long-b', start: [0, 15], end: [800, 15] },
    ...Array.from({ length: 41 }, (_, i) => ({ id: `cross-${i}`, start: [i * 20, 0], end: [i * 20, 15] })),
  ].map((w) => ({ ...w, thickness: 0.3, height: 3, kind: 'exterior' }))
  const rooms = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `Hall ${i}`, boundary: ['long-a', `cross-${i + 1}`, 'long-b', `cross-${i}`], use: 'office' }))
  return { version: '1', units: 'm', walls, rooms, openings: [] }
}

let b: Bench
beforeAll(() => {
  b = bench({ 'strip.json': strip(), 'flat.json': JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) })
})
afterAll(() => b.close())

describe('a long floor drawn in pieces (VEW-26)', () => {
  it('says a long floor is drawn in pieces, and draws one with tile', async () => {
    const whole = await b.call('grid_view', { plan: 'strip.json', kind: 'plan' })
    expect(whole.isError, whole.text).toBe(false)
    const said = whole.text.match(/tile=1 to tile=(\d+) draw it in \d+ pieces along its length/)
    expect(said, whole.text).not.toBeNull()
    const count = Number(said![1])
    expect(count).toBeGreaterThan(5)
    const piece = await b.call('grid_view', { plan: 'strip.json', kind: 'plan', tile: 2 })
    expect(piece.isError, piece.text).toBe(false)
    expect(piece.text).toContain(`piece 2 of ${count} along its length`)
    expect(piece.text).toContain('tile=3 draws the next.')
    const px = (text: string): number => Number(text.match(/1 m = ([\d.]+) px/)![1])
    expect(px(piece.text)).toBeGreaterThan(px(whole.text) * 4)
  })

  it('refuses a piece a floor does not have, and tile with crop', async () => {
    for (const [args, why] of [
      [{ plan: 'flat.json', tile: 1 }, /drawn whole large enough to read/],
      [{ plan: 'strip.json', tile: 999 }, /tile takes 1 to \d+/],
      [{ plan: 'strip.json', tile: 1.5 }, /whole number/],
      [{ plan: 'strip.json', tile: 1, crop: 'r3' }, /crop or tile, not both/],
    ] as const) {
      const reply = await b.call('grid_view', { kind: 'plan', ...args })
      expect(reply.isError, reply.text).toBe(true)
      expect(reply.text).toMatch(why)
    }
  })

  it('draws a house whole and says nothing of pieces', async () => {
    const reply = await b.call('grid_view', { plan: 'flat.json', kind: 'plan' })
    expect(reply.text).not.toContain('tile=')
  })
})
