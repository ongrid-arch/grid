/**
 * CNT-35: a widened door is its old opening, to be demolished, and a new one in the same place.
 * The writing's own check reads each state on its own, as the drawing check does, so the two are
 * no overlap.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'

const base = 'walls outside 0.3 inside 0.1 height 2.6\nroom hall "Hall" corridor 4 x 4 at 0,0\n'
const door = (id: string, offset: number, width: number, extra: Record<string, unknown> = {}): string =>
  `raw opening ${JSON.stringify({ id, wall: 'ext-south', type: 'door', offset, width, sill: 0, height: 2.1, ...extra })}\n`
const codes = (text: string): string[] => compileRoomsText(text).problems.map((p) => p.code)

describe('openings in one place that stand in different states (CNT-35)', () => {
  it('knows the wall the doors are on', () => {
    expect(compileRoomsText(base).plan?.walls.map((w) => w.id)).toContain('ext-south')
  })

  it('accepts an old door to be demolished and a new one in its place', () => {
    const result = compileRoomsText(base + door('old', 1, 0.7, { phase: 'demolished' }) + door('wide', 0.9, 0.9, { phase: 'new' }))
    expect(result.problems).toEqual([])
  })

  it('accepts them whichever is written first, and a door that goes with a demolished wall', () => {
    expect(codes(base + door('wide', 0.9, 0.9, { phase: 'new' }) + door('old', 1, 0.7, { phase: 'demolished' }))).toEqual([])
  })

  it('still refuses two doors with no phase, and an old one beside one that stays', () => {
    expect(codes(base + door('a', 1, 0.7) + door('b', 0.9, 0.9))).toEqual(['rooms/openings-overlap'])
    expect(codes(base + door('a', 1, 0.7, { phase: 'demolished' }) + door('b', 0.9, 0.9, { phase: 'existing' }))).toEqual(['rooms/openings-overlap'])
  })

  it('says two new doors that overlap once', () => {
    expect(codes(base + door('a', 1, 0.7, { phase: 'new' }) + door('b', 0.9, 0.9, { phase: 'new' }))).toEqual(['rooms/openings-overlap'])
  })
})
