/**
 * VEW-42: with no floor named, a picture, an export of one floor and the brief's footprint take
 * the ground floor of a house with a basement, not the basement. A floor that is named is kept.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { exportPlan } from '@ongrid/floorplan/export'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import type { BriefLine } from '../../brief/lines'
import { drawPlan } from '../drawPlan'

function box(floor: string, w: number, d: number): FloorPlan['walls'] {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({ id: `${floor}-${id}`, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' as const, floor })
  return [wall('s', [0, 0], [w, 0]), wall('e', [w, 0], [w, d]), wall('n', [w, d], [0, d]), wall('w', [0, d], [0, 0])]
}

/** A basement, 10 × 8 m, under a ground floor of 6 × 4 m; the basement is listed first. */
const house = {
  version: '1',
  units: 'm',
  floors: [
    { id: 'basement', name: 'Basement', level: -1 },
    { id: 'ground', name: 'Ground floor', level: 0 },
  ],
  walls: [...box('basement', 10, 8), ...box('ground', 6, 4)],
  rooms: [
    { id: 'cellar', name: 'Cellar', use: 'storage', floor: 'basement', boundary: ['s', 'e', 'n', 'w'].map((w) => `basement-${w}`) },
    { id: 'living', name: 'Living room', use: 'living', floor: 'ground', boundary: ['s', 'e', 'n', 'w'].map((w) => `ground-${w}`) },
  ],
  openings: [],
} as unknown as FloorPlan

const NOW = new Date('2026-01-01T00:00:00Z')
const dxf = (floorId?: string) => exportPlan(house, 'dxf', { projectId: 'p', projectName: 'House', now: NOW, ...(floorId === undefined ? {} : { floorId }) })

describe('the floor taken when none is named', () => {
  it('draws the ground floor, and the basement when it is named', async () => {
    const plain = await drawPlan(house, { format: 'svg' })
    expect(plain).toBe(await drawPlan(house, { format: 'svg', floor: 'ground' }))
    expect(plain).not.toBe(await drawPlan(house, { format: 'svg', floor: 'basement' }))
  })

  it('exports the ground floor, and the basement when it is named', () => {
    expect(dxf().data).toBe(dxf('ground').data)
    expect(dxf().data).not.toBe(dxf('basement').data)
    expect(dxf().fileName).toBe(dxf('ground').fileName)
  })

  describe('the brief\'s footprint', () => {
    let b: Bench | undefined
    afterEach(() => b?.close())

    it('is the ground floor\'s walls, not the basement\'s', async () => {
      b = bench({ 'plan.json': house })
      const reply = await b.call('grid_write_brief', { plan: 'plan.json', brief: { footprint: { width: 6, depth: 4, level: 'must', source: 'given', quote: 'a footprint of six by four' } } })
      expect(reply.isError, reply.text).toBe(false)
      const [line] = (reply.data as { lines: BriefLine[] }).lines
      expect(line!.state).toBe('met')
      expect(line!.text).toContain('drawn 6.20 x 4.20 m')
    })
  })
})
