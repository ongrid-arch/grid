/**
 * CMD-51: a room written as a polygon whose corners lie on one circle is answered with how to
 * write it as a circle; a rectangle, an L and an octagon drawn on purpose are not.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

/** `n` corners on a circle of radius `r` round 20,20, as rooms text points. */
function ring(n: number, r: number): string {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return `${(20 + r * Math.cos(a)).toFixed(3)},${(20 + r * Math.sin(a)).toFixed(3)}`
  }).join(' ')
}

let b: Bench
beforeAll(() => {
  b = bench({})
})
afterAll(() => b.close())

describe('a curve written as a polygon (CMD-51)', () => {
  it('says how to write a 24-sided room on a circle as a circle', async () => {
    const reply = await b.call('grid_write_rooms', { plan: 'round.json', rooms: `room hall "Hall" living polygon ${ring(24, 6)}` })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/Room 'hall' is drawn with 24 straight walls whose corners lie on one circle/)
    const written = reply.text.match(/write '(circle [\d.]+ at [\d.]+,[\d.]+)'/)
    expect(written, reply.text).not.toBeNull()
    expect(written![1]).toMatch(/ at 20,20$/)
  })

  it('says nothing of a rectangle, an L or an octagon', async () => {
    for (const rooms of [
      'room a "A" living 4 x 5 at 0,0',
      'room l "L" living polygon 0,0 6,0 6,3 3,3 3,6 0,6',
      `room o "Octagon" living polygon ${ring(8, 4)}`,
    ]) {
      const reply = await b.call('grid_write_rooms', { plan: 'plain.json', rooms, replace: true })
      expect(reply.isError, reply.text).toBe(false)
      expect(reply.text).not.toMatch(/lie on one circle/)
    }
  })
})
