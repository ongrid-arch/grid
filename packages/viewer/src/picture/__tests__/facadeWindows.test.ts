/**
 * VEW-63: a window on a facade picture drawn as the core sees it: its head, its lights in a glass
 * tone, the members of its frame and sashes, and its sill, in every look; a door as before.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { facadeToSvg } from '../facade'
import { LIGHT_LOOK } from '../look'

const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.3, height: 2.7, floor: 'ground' })

const house = (): FloorPlan =>
  parseFloorPlan({
    version: '1',
    floors: [{ id: 'ground', name: 'Ground floor', level: 0 }],
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
    rooms: [{ id: 'r', name: 'Living', boundary: ['s', 'e', 'n', 'w'], floor: 'ground' }],
    types: { windows: [{ id: 'timber-sash', name: 'Timber sash', kind: 'double', material: 'timber' }] },
    openings: [
      { id: 'pair', wall: 's', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2, windowType: 'timber-sash' },
      { id: 'fixed', wall: 's', type: 'window', offset: 4, width: 1.2, sill: 0.9, height: 1.2, kind: 'fixed' },
      { id: 'door', wall: 's', type: 'door', offset: 7, width: 1, height: 2.1 },
    ],
  })

const tags = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
/** The part of the SVG inside one window's group. */
const windowGroup = (svg: string, id: string): string => {
  const start = svg.indexOf(`<g data-part="facade-window" data-id="${id}"`)
  expect(start).toBeGreaterThanOrEqual(0)
  return svg.slice(start, svg.indexOf('</g>', start))
}

describe('a window on a facade picture (VEW-63)', () => {
  it('draws each window with its head, its hole, its lights, its frame and its sill', () => {
    const svg = facadeToSvg(house(), { side: 'south' })
    expect(tags(svg, 'facade-window')).toHaveLength(2)
    const pair = windowGroup(svg, 'pair')
    expect(pair).toContain('data-kind="double"')
    expect(tags(pair, 'facade-window-light')).toHaveLength(2)
    expect(tags(pair, 'facade-window-frame').length).toBeGreaterThanOrEqual(12)
    expect(tags(pair, 'facade-window-head')).toHaveLength(1)
    expect(tags(pair, 'facade-window-sill')).toHaveLength(1)
    expect(tags(pair, 'facade-opening')).toHaveLength(1)
    // The sill is drawn last, in front of the frame.
    expect(pair.lastIndexOf('facade-window-sill')).toBeGreaterThan(pair.lastIndexOf('facade-window-frame'))
    expect(tags(windowGroup(svg, 'fixed'), 'facade-window-light')).toHaveLength(1)
  })

  it('fills the glass with the look\'s window tone, and a pale grey where the look\'s windows are the paper', () => {
    const working = tags(facadeToSvg(house(), { side: 'south' }), 'facade-window-light')
    expect(working.every((tag) => tag.includes(`fill="${LIGHT_LOOK.window}"`))).toBe(true)
    const technical = tags(facadeToSvg(house(), { side: 'south', look: 'technical' }), 'facade-window-light')
    expect(technical.length).toBe(3)
    expect(technical.every((tag) => !tag.includes('fill="#ffffff"'))).toBe(true)
  })

  it('draws a door as before, one outline with no window parts', () => {
    const svg = facadeToSvg(house(), { side: 'south' })
    const door = tags(svg, 'facade-opening').filter((tag) => tag.includes('data-id="door"'))
    expect(door).toHaveLength(1)
    expect(svg).not.toContain('data-part="facade-window" data-id="door"')
  })
})
