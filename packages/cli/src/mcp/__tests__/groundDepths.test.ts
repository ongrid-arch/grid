/**
 * ARE-82: grid_measure what=ground, each floor below the ground with its depth, formation level,
 * retained height on each side, area below the ground and dig, and the excavation in all.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from './replay/harness'

let b: Bench | undefined
afterAll(() => b?.close())
const open = (files: Record<string, unknown>): Bench => {
  b?.close()
  b = bench(files)
  return b
}

const box = (p: string, floor: string, x1: number, y1: number) => [
  { id: `${p}s`, floor, start: [0, 0], end: [x1, 0], kind: 'exterior' },
  { id: `${p}e`, floor, start: [x1, 0], end: [x1, y1], kind: 'exterior' },
  { id: `${p}n`, floor, start: [x1, y1], end: [0, y1], kind: 'exterior' },
  { id: `${p}w`, floor, start: [0, y1], end: [0, 0], kind: 'exterior' },
]

/** A house 10 × 8 m over a basement of the same size, 3 m under the ground. */
const house = {
  version: '1',
  floors: [
    { id: 'b1', name: 'Basement', level: -1, elevation: -3, height: 2.7, slab: 0.25 },
    { id: 'ground', name: 'Ground floor', level: 0, elevation: 0, height: 2.7, slab: 0.25 },
  ],
  site: { ground: 0 },
  walls: [...box('g', 'ground', 10, 8), ...box('a', 'b1', 10, 8)],
  rooms: [
    { id: 'hall', name: 'Hall', floor: 'ground', boundary: ['gs', 'ge', 'gn', 'gw'], use: 'living' },
    { id: 'den', name: 'Den', floor: 'b1', boundary: ['as', 'ae', 'an', 'aw'], use: 'living' },
  ],
  openings: [],
}

describe('grid_measure what=ground (ARE-82)', () => {
  it('gives each floor below the ground, its depth, formation level, retained height and dig, with its rule', async () => {
    const reply = await open({ 'house.json': house }).call('grid_measure', { plan: 'house.json', what: 'ground' })
    expect(reply.isError, reply.text).not.toBe(true)
    const text = reply.text
    expect(text).toContain('"Basement": floor level -3.00 m, the ground round it at 0.00 m; its floor is 3.00 m below the ground, wholly under it.')
    expect(text).toContain('Formation level -3.25 m, the underside of its slab on the ground: 3.25 m below the ground.')
    expect(text).toContain('2.70 m on the north')
    // The basement's outline to the outside face, 10.2 × 8.2 m, dug 3.25 m.
    expect(text).toContain('Area below the ground: 83.64 m², its gross external area.')
    expect(text).toContain('Dug out under it: 83.64 m² down 3.25 m, 271.8 m³.')
    expect(text).toContain('Excavation in all: 271.8 m³, assumed.')
    expect(text).not.toContain('"Ground floor":')
    const data = reply.data as { what: string; answer: { floors: { floor: string; formation: { level: number } }[]; excavation: number }; rule: string }
    expect(data.what).toBe('ground')
    expect(data.answer.floors.map((f) => f.floor)).toEqual(['b1'])
    expect(data.answer.floors[0]!.formation.level).toBe(-3.25)
    expect(data.answer.excavation).toBeCloseTo(83.64 * 3.25, 3)
    expect(data.rule).toContain('formation level is the underside')
  })

  it('takes no other argument', async () => {
    const reply = await open({ 'house.json': house }).call('grid_measure', { plan: 'house.json', what: 'ground', room: 'den' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('what=ground takes no other argument, not room.')
  })
})
