/**
 * VEW-63: a window in elevation as it is built: its frame and sashes, its lights with the bars
 * where two meet, a sill under it and a head over it, from its kind (C20) and its type (C24).
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planFacade, type FacadeOpening, type FacadeWindow } from '../facade'
import { limit } from '../tolerances'

const wall = (id: string, start: [number, number], end: [number, number], extra: Record<string, unknown> = {}) => ({ id, start, end, thickness: 0.3, height: 2.7, floor: 'ground', ...extra })

/** One room 10 m by 8 m, its walls 2.7 m high, with the windows given on its south wall `s`. */
function box(openings: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({
    version: '1',
    floors: [{ id: 'ground', name: 'Ground floor', level: 0 }],
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
    rooms: [{ id: 'r', name: 'Living', boundary: ['s', 'e', 'n', 'w'], floor: 'ground' }],
    openings,
    ...extra,
  })
}

const win = (id: string, offset: number, extra: Record<string, unknown> = {}) => ({ id, wall: 's', type: 'window', offset, width: 1.2, sill: 0.9, height: 1.2, ...extra })

function seen(plan: FloorPlan, id: string, side: 'south' | 'north' = 'south'): FacadeOpening {
  const found = planFacade(plan, side).faces.flatMap((f) => f.openings).find((o) => o.id === id)
  if (found === undefined) throw new Error(`${id} is not seen`)
  return found
}

function windowOf(plan: FloorPlan, id: string, side: 'south' | 'north' = 'south'): FacadeWindow {
  const found = seen(plan, id, side).window
  if (found === undefined) throw new Error(`${id} has no window drawn`)
  return found
}

const face = limit('frameFace')
const round = (n: number): number => Number(n.toFixed(4))
const span = (r: { u0: number; u1: number }): [number, number] => [round(r.u0), round(r.u1)]
const rise = (r: { bottom: number; top: number }): [number, number] => [round(r.bottom), round(r.top)]
const pair = (a: number, b: number): [number, number] => [round(a), round(b)]

describe('a window in elevation (VEW-63)', () => {
  it('draws a fixed window as one light inside its frame, its sill to its head', () => {
    const w = windowOf(box([win('fixed', 2, { kind: 'fixed' })]), 'fixed')
    expect(w.kind).toBe('fixed')
    expect(w.lights.map(span)).toEqual([pair(2 + face, 3.2 - face)])
    expect(w.lights.map(rise)).toEqual([pair(0.9 + face, 2.1 - face)])
    // The frame: two jambs, the head and the sill, round the hole.
    expect(w.members).toHaveLength(4)
    expect(Math.min(...w.members.map((m) => m.u0))).toBeCloseTo(2, 6)
    expect(Math.max(...w.members.map((m) => m.u1))).toBeCloseTo(3.2, 6)
    expect(Math.min(...w.members.map((m) => m.bottom))).toBeCloseTo(0.9, 6)
    expect(Math.max(...w.members.map((m) => m.top))).toBeCloseTo(2.1, 6)
  })

  it('draws a pair as two lights with a bar between them where the casements meet', () => {
    const w = windowOf(box([win('pair', 2, { kind: 'double' })]), 'pair')
    expect(w.lights).toHaveLength(2)
    const [left, right] = [...w.lights].sort((a, b) => a.u0 - b.u0)
    const split = 2 + face + (1.2 - 2 * face) / 2
    expect(left!.u1).toBeCloseTo(split - face, 6)
    expect(right!.u0).toBeCloseTo(split + face, 6)
    // A member stands across the split: the bar between the two lights.
    expect(w.members.some((m) => m.u0 < split && m.u1 >= split - 1e-9 && m.bottom <= 0.9 + face + 1e-9 && m.top >= 2.1 - face - 1e-9)).toBe(true)
  })

  it('draws a single casement that opens in part beside a fixed light, at the end it hangs from', () => {
    const w = windowOf(box([win('part', 2, { kind: 'single', opens: { width: 0.5 } })]), 'part')
    expect(w.lights.map(span).sort((a, b) => a[0] - b[0])).toEqual([
      pair(2 + 2 * face, 2 + face + 0.5 - face),
      pair(2 + face + 0.5, 3.2 - face),
    ])
  })

  it('draws a window with no kind as one casement filling its frame', () => {
    const w = windowOf(box([win('plain', 2)]), 'plain')
    expect(w.kind).toBe('single')
    expect(w.lights).toHaveLength(1)
  })

  it('draws a sliding window as two sashes passing, the one on the outside last', () => {
    const w = windowOf(box([win('slider', 2, { kind: 'sliding' })]), 'slider')
    expect(w.lights).toHaveLength(2)
    // The wall runs west to east with its left face inside: the outer sash is the one on its right
    // face, from just short of the middle to the east jamb, and it is drawn last.
    const last = w.members.slice(-4)
    expect(Math.max(...last.map((m) => m.u1))).toBeCloseTo(3.2 - face, 6)
    expect(Math.min(...last.map((m) => m.u0))).toBeLessThan(2.6)
  })

  it('reads its kind from its window type when it states none', () => {
    const plan = box([win('typed', 2, { windowType: 'timber-sash' })], {
      types: { windows: [{ id: 'timber-sash', name: 'Timber sash', kind: 'double', material: 'timber' }] },
    })
    const w = windowOf(plan, 'typed')
    expect(w.kind).toBe('double')
    expect(w.lights).toHaveLength(2)
  })

  it('puts a sill under the hole, standing past each side, and a head over it', () => {
    const w = windowOf(box([win('fixed', 2, { kind: 'fixed' })]), 'fixed')
    const past = limit('sillProjection')
    expect(w.sill).not.toBeNull()
    expect(span(w.sill!)).toEqual(pair(2 - past, 3.2 + past))
    expect(rise(w.sill!)).toEqual(pair(0.9 - limit('facadeSillDepth'), 0.9))
    expect(w.head).not.toBeNull()
    expect(span(w.head!)).toEqual([2, 3.2])
    expect(rise(w.head!)).toEqual(pair(2.1, 2.1 + limit('facadeHeadDepth')))
  })

  it('keeps the sill and the head inside the wall: none from the floor, none where the head meets the top', () => {
    const plan = box([win('low', 1, { sill: 0, height: 2 }), win('high', 4, { sill: 1.5, height: 1.2 })])
    expect(windowOf(plan, 'low').sill).toBeNull()
    expect(windowOf(plan, 'high').head).toBeNull()
    expect(windowOf(plan, 'high').sill).not.toBeNull()
  })

  it('follows its wall the way the facade sees it: the end it hangs from on the left seen from the north', () => {
    const plan = box([{ id: 'nw', wall: 'n', type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2, kind: 'single', opens: { width: 0.5 } }])
    const o = seen(plan, 'nw', 'north')
    expect(span(o)).toEqual([-8, -6.8])
    const casement = [...o.window!.lights].sort((a, b) => a.u0 - b.u0)[0]!
    expect(span(casement)).toEqual(pair(-8 + 2 * face, -8 + 0.5))
  })

  it('draws no window parts for a door or a doorless opening', () => {
    const plan = box([
      { id: 'door', wall: 's', type: 'door', offset: 5, width: 1, height: 2.1 },
      { id: 'gap', wall: 's', type: 'opening', offset: 7, width: 1, height: 2.1 },
    ])
    expect(seen(plan, 'door').window).toBeUndefined()
    expect(seen(plan, 'gap').window).toBeUndefined()
  })

  it('draws a window through two floors whole, one frame from its sill to its head', () => {
    const w2 = (id: string, start: [number, number], end: [number, number], extra: Record<string, unknown> = {}) => wall(id, start, end, extra)
    const plan = parseFloorPlan({
      version: '1',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'First floor', level: 3 }],
      walls: [
        w2('s', [0, 0], [10, 0], { through: 'first' }),
        w2('e', [10, 0], [10, 8]),
        w2('n', [10, 8], [0, 8]),
        w2('wst', [0, 8], [0, 0]),
        w2('fe', [10, 0], [10, 8], { floor: 'first' }),
        w2('fn', [10, 8], [0, 8], { floor: 'first' }),
        w2('fw', [0, 8], [0, 0], { floor: 'first' }),
      ],
      rooms: [
        { id: 'g', name: 'Hall', boundary: ['s', 'e', 'n', 'wst'], floor: 'ground' },
        { id: 'f', name: 'Bedroom', boundary: ['s', 'fe', 'fn', 'fw'], floor: 'first' },
      ],
      openings: [{ id: 'stair-window', wall: 's', type: 'window', offset: 2, width: 2, sill: 0.5, height: 4.5, kind: 'fixed' }],
    })
    const w = windowOf(plan, 'stair-window')
    expect(w.lights.map(rise)).toEqual([pair(0.5 + face, 5 - face)])
    expect(Math.min(...w.members.map((m) => m.bottom))).toBeCloseTo(0.5, 6)
    expect(Math.max(...w.members.map((m) => m.top))).toBeCloseTo(5, 6)
  })
})
