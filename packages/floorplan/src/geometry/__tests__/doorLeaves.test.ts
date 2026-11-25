/**
 * ARE-27: one clear-width rule for doors, leaf by leaf. Each leaf of a door gets its own clear
 * width; a pair is judged by the leaf the plan says opens, or by both leaves opened together; and
 * the allowance for an open leaf goes by the door's kind.
 */
import { describe, expect, it } from 'vitest'
import { outline } from '../../test-support/outline'
import type { Opening } from '../plan'
import { doorwayClearance, openLeafAllowance } from '../use'
import { TOLERANCES } from '../tolerances'

const { walls } = outline([[0, 0], [6, 0], [6, 3], [0, 3]])
const w1 = walls[0]!
const leaf = TOLERANCES.useOpenLeaf.value
const r = (v: number): number => Math.round(v * 1000) / 1000

function door(extra: Partial<Opening> = {}): Opening {
  return { id: 'd1', wall: 'w1', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', ...extra }
}

describe('a door\'s leaves and the width it is judged by (ARE-27)', () => {
  it('judges a single door by its one leaf, less the open leaf', () => {
    const d = doorwayClearance(w1, door({ width: 1 }), [])
    expect(d.judgedBy).toBe('leaf')
    expect(d.leaves.map((l) => [r(l.width), r(l.clear), l.active])).toEqual([[1, r(1 - leaf), true]])
    expect(r(d.clear)).toBe(r(1 - leaf))
  })

  it('gives each leaf of a pair its clear width, and opens a pair with no active leaf as two leaves', () => {
    const d = doorwayClearance(w1, door({ width: 1.8, kind: 'double' }), [])
    expect(d.judgedBy).toBe('pair')
    expect(d.leaves.map((l) => [r(l.width), r(l.clear), l.active])).toEqual([[0.9, r(0.9 - leaf), true], [0.9, r(0.9 - leaf), true]])
    // Not one 1.75 m opening: each leaf takes its own allowance.
    expect(r(d.clear)).toBe(r(1.8 - 2 * leaf))
    expect(r(d.leaf)).toBe(r(2 * leaf))
  })

  it('judges a pair by the active leaf its plan states, at the end it hangs from', () => {
    const atStart = doorwayClearance(w1, door({ width: 1.5, kind: 'double', opens: { width: 1 } }), [])
    expect(atStart.judgedBy).toBe('leaf')
    expect(atStart.leaves.map((l) => [r(l.from), r(l.to), l.active])).toEqual([[1, 2, true], [2, 2.5, false]])
    expect(r(atStart.clear)).toBe(r(1 - leaf))
    const atEnd = doorwayClearance(w1, door({ width: 1.5, kind: 'double', hinge: 'end', opens: { width: 1 } }), [])
    expect(atEnd.leaves.map((l) => [r(l.from), r(l.to), l.active])).toEqual([[1, 1.5, false], [1.5, 2.5, true]])
    expect(r(atEnd.clear)).toBe(r(1 - leaf))
  })

  it('judges a single door with a fixed panel by the part that opens, not the whole hole', () => {
    const d = doorwayClearance(w1, door({ width: 1.2, opens: { width: 0.8 } }), [])
    expect(r(d.hole)).toBe(1.2)
    expect(r(d.clear)).toBe(r(0.8 - leaf))
  })

  it('takes nothing off a door that slides, slides into its wall, rolls up or lifts', () => {
    for (const kind of ['sliding', 'pocket', 'roller', 'garage'] as const) {
      const d = doorwayClearance(w1, door({ width: 1.8, kind }), [])
      expect([kind, r(d.clear), d.leaf]).toEqual([kind, 1.8, 0])
      expect(openLeafAllowance({ type: 'door', kind })).toBe(0)
    }
    for (const kind of [undefined, 'single', 'double', 'folding'] as const) expect(openLeafAllowance({ type: 'door', kind })).toBe(leaf)
    expect(openLeafAllowance({ type: 'opening', kind: undefined })).toBe(0)
  })

  it('leaves a doorless opening its whole hole, with no leaf', () => {
    const d = doorwayClearance(w1, door({ type: 'opening', width: 1.2 }), [])
    expect([d.judgedBy, r(d.clear), d.leaves.length]).toEqual(['hole', 1.2, 0])
  })
})
