import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { DARK_WORKING_LOOK, LOOK_NAMES, LOOKS, TECHNICAL_LOOK, WORKING_LOOK, detailShown, fileLook, lookWithColors, DARK_LOOK, FILE_LOOK_NAMES } from '../look'
import { planPicture, planToSvg } from '../planSvg'

/**
 * SHT-10: the refinements after the basics, each an option of the named looks: walls by kind,
 * the detail at 1:50 and larger, what lies above the cut dashed, tints by use and by floor finish
 * with a key, and files always on light paper. Each is held by a snapshot of what it draws.
 */

/**
 * Three rooms in a row, 9 by 4: brick outside walls, an inside wall between the first two rooms
 * and a stud partition between the last two; a hung front door, a window and a high window.
 */
function plan(): FloorPlan {
  return parseFloorPlan({
    version: '1',
    units: 'm',
    types: {
      walls: [
        { id: 'brick', name: 'Brick wall', material: 'Brick' },
        { id: 'stud', name: 'Stud partition', material: 'Plasterboard' }
      ]
    },
    walls: [
      { id: 'w1', start: [0, 0], end: [9, 0], thickness: 0.3, height: 2.7, kind: 'exterior', wallType: 'brick' },
      { id: 'w2', start: [9, 0], end: [9, 4], thickness: 0.3, height: 2.7, kind: 'exterior', wallType: 'brick' },
      { id: 'w3', start: [9, 4], end: [0, 4], thickness: 0.3, height: 2.7, kind: 'exterior', wallType: 'brick' },
      { id: 'w4', start: [0, 4], end: [0, 0], thickness: 0.3, height: 2.7, kind: 'exterior', wallType: 'brick' },
      { id: 'w5', start: [3, 0], end: [3, 4], thickness: 0.15, height: 2.7, kind: 'interior' },
      { id: 'w6', start: [6, 0], end: [6, 4], thickness: 0.1, height: 2.7, kind: 'partition', wallType: 'stud' }
    ],
    rooms: [
      { id: 'r1', name: 'Living', boundary: ['w1', 'w5', 'w3', 'w4'], use: 'living', finishes: { floor: 'Oak' } },
      { id: 'r2', name: 'Kitchen', boundary: ['w1', 'w6', 'w3', 'w5'], use: 'kitchen', finishes: { floor: 'Tile' } },
      { id: 'r3', name: 'Bedroom', boundary: ['w1', 'w2', 'w3', 'w6'], use: 'bedroom', finishes: { floor: 'Oak' } }
    ],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0, hinge: 'start', swing: 'left' },
      { id: 'o2', wall: 'w3', type: 'window', offset: 1, width: 1.2, height: 1.2, sill: 0.9 },
      { id: 'o3', wall: 'w2', type: 'window', offset: 1.5, width: 1, height: 0.5, sill: 1.6 }
    ]
  })
}

const tagsOf = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
/** What a part is drawn with, by the id it carries, without its shape. */
const paintBy = (svg: string, part: string, key: string, names: readonly string[]): Record<string, Record<string, string | undefined>> =>
  Object.fromEntries(tagsOf(svg, part).map((tag) => [attr(tag, key) ?? '', Object.fromEntries(names.map((name) => [name, attr(tag, name)]))]))
const keyWords = (svg: string): string[] => [...svg.matchAll(/<g data-part="key-entry"[^>]*>.*?<text[^>]*>([^<]*)<\/text><\/g>/g)].map((m) => m[1]!)

describe('walls drawn by kind (SHT-10)', () => {
  it('fills outside, inside and partition walls apart, in every look', () => {
    for (const name of LOOK_NAMES) {
      const fills = LOOKS[name].walls.fill
      expect(new Set([fills.outside, fills.inside, fills.partition]).size, name).toBe(3)
    }
    const working = planToSvg(plan())
    const technical = planToSvg(plan(), { look: 'technical', paperScale: 100 })
    expect({
      working: paintBy(working, 'wall', 'data-id', ['data-wall-kind', 'fill']),
      technical: paintBy(technical, 'wall', 'data-id', ['data-wall-kind', 'fill']),
      outlines: paintBy(technical, 'wall-outline', 'data-wall', ['stroke-width'])
    }).toMatchSnapshot()
  })

  it('outlines a partition with a lighter pen than the walls cut through, on paper', () => {
    const svg = planToSvg(plan(), { look: 'technical', paperScale: 100 })
    const width = (id: string): number => Number(attr(tagsOf(svg, 'wall-outline').find((tag) => attr(tag, 'data-wall') === id)!, 'stroke-width'))
    expect(width('w6')).toBeLessThan(width('w5'))
    expect(width('w5')).toBe(width('w1'))
  })

  it('keys each kind of wall the drawing has, in its own fill', () => {
    const svg = planToSvg(plan(), { show: { key: true } })
    expect(keyWords(svg).slice(0, 3)).toEqual(['Outside wall', 'Inside wall', 'Partition'])
  })
})

describe('the detail at 1:50 and larger (SHT-10)', () => {
  it('is an option of the technical look only, drawn at the 1:50 pens', () => {
    expect(TECHNICAL_LOOK.detail).not.toBeNull()
    expect(WORKING_LOOK.detail).toBeNull()
    expect(DARK_WORKING_LOOK.detail).toBeNull()
    expect([50, 70, 71, 100].map((scale) => detailShown(TECHNICAL_LOOK, 0.01, scale))).toEqual([true, true, false, false])
    expect(detailShown(WORKING_LOOK, 0.01, 50)).toBe(false)
  })

  it('hatches each wall of a material with its own hatch, frames each door and window, gives a window two panes and its sills', () => {
    const svg = planToSvg(plan(), { look: 'technical', paperScale: 50, show: { key: false } })
    const hatches = tagsOf(svg, 'wall-hatch')
    expect(hatches.map((tag) => [attr(tag, 'data-wall'), attr(tag, 'data-material')])).toEqual([
      ['w1', 'Brick'],
      ['w2', 'Brick'],
      ['w3', 'Brick'],
      ['w4', 'Brick'],
      ['w6', 'Plasterboard']
    ])
    // A hatched wall is on the paper, its hatch over it; the wall with no material keeps its tone.
    expect(paintBy(svg, 'wall', 'data-id', ['fill'])).toEqual({ w1: { fill: '#ffffff' }, w2: { fill: '#ffffff' }, w3: { fill: '#ffffff' }, w4: { fill: '#ffffff' }, w5: { fill: TECHNICAL_LOOK.walls.fill.inside }, w6: { fill: '#ffffff' } })
    const detail = svg.match(/<g data-part="opening-detail" data-opening="o2".*?<\/g>/)![0]
    expect(tagsOf(detail, 'frame')).toHaveLength(2)
    expect(tagsOf(detail, 'sill')).toHaveLength(2)
    const window = svg.match(/<g data-part="window-symbol" data-opening="o2".*?<\/g>/)![0]
    expect(tagsOf(window, 'window-glass')).toHaveLength(2)
    expect({ stud: hatches[4], detail, window }).toMatchSnapshot()
  })

  it('keys each material by its hatch, and draws none of it at 1:100', () => {
    const at50 = planToSvg(plan(), { look: 'technical', paperScale: 50 })
    expect(keyWords(at50)).toEqual(expect.arrayContaining(['Wall: Brick', 'Wall: Plasterboard']))
    const at100 = planToSvg(plan(), { look: 'technical', paperScale: 100 })
    for (const part of ['wall-hatches', 'opening-detail']) expect(at100).not.toContain(`data-part="${part}"`)
    expect(tagsOf(at100.match(/<g data-part="window-symbol" data-opening="o2".*?<\/g>/)![0], 'window-glass')).toHaveLength(1)
    // Nothing on it carries a meaning of the plan's own, so no key is drawn.
    expect(at100).not.toContain('data-part="key-entry"')
  })
})

describe('what lies above the cut, dashed (SHT-10)', () => {
  it('marks a window above the plan\'s cut, and draws it dashed in every look', () => {
    for (const name of LOOK_NAMES) expect(LOOKS[name].aboveDashed, name).toBe(true)
    const working = planToSvg(plan())
    const technical = planToSvg(plan(), { look: 'technical', paperScale: 100 })
    const high = tagsOf(working, 'opening').find((tag) => attr(tag, 'data-id') === 'o3')!
    const low = tagsOf(working, 'opening').find((tag) => attr(tag, 'data-id') === 'o2')!
    expect(attr(high, 'data-above')).toBe('true')
    expect(attr(high, 'stroke-dasharray')).toBeDefined()
    expect(attr(low, 'stroke-dasharray')).toBeUndefined()
    const symbol = technical.match(/<g data-part="window-symbol" data-opening="o3".*?<\/g>/)![0]
    for (const line of [...tagsOf(symbol, 'window-face'), ...tagsOf(symbol, 'window-glass')]) expect(attr(line, 'stroke-dasharray')).toBeDefined()
    expect({ working: high, technical: symbol }).toMatchSnapshot()
  })
})

describe('tints by room use and floor finish, with a key (SHT-10)', () => {
  it('fills each room by its use from the look\'s tints and keys them, with no key asked for', () => {
    const svg = planToSvg(plan(), { show: { colourBy: 'use' } })
    expect(paintBy(svg, 'room', 'data-id', ['fill'])).toEqual({ r1: { fill: WORKING_LOOK.tints.uses.living }, r2: { fill: WORKING_LOOK.tints.uses.kitchen }, r3: { fill: WORKING_LOOK.tints.uses.bedroom } })
    expect(keyWords(svg)).toEqual(expect.arrayContaining(['Room: bedroom', 'Room: living', 'Room: kitchen']))
  })

  it('fills each room by its floor finish, one tint per finish in the order the rooms name them, and keys them', () => {
    const svg = planToSvg(plan(), { show: { colourBy: 'finish' } })
    const [oak, tile] = WORKING_LOOK.tints.finishes
    expect(paintBy(svg, 'room', 'data-id', ['fill'])).toEqual({ r1: { fill: oak }, r2: { fill: tile }, r3: { fill: oak } })
    expect(keyWords(svg)).toEqual(expect.arrayContaining(['Floor: Oak', 'Floor: Tile']))
    expect({ rooms: paintBy(svg, 'room', 'data-id', ['fill']), key: keyWords(svg) }).toMatchSnapshot()
  })

  it('tints the dark look\'s rooms dark, and leaves the key off when asked', () => {
    const svg = planToSvg(plan(), { look: 'dark', show: { colourBy: 'use', key: false } })
    expect(attr(tagsOf(svg, 'room')[0]!, 'fill')).toBe(DARK_WORKING_LOOK.tints.uses.living)
    expect(svg).not.toContain('data-part="key-entry"')
  })
})

describe('files are always light (SHT-10)', () => {
  it('draws a file of the dark look, or of colours of your own on dark paper, in the working look', () => {
    expect(fileLook(DARK_WORKING_LOOK)).toBe(WORKING_LOOK)
    expect(fileLook(lookWithColors(DARK_LOOK))).toBe(WORKING_LOOK)
    expect(fileLook(TECHNICAL_LOOK)).toBe(TECHNICAL_LOOK)
    expect(fileLook(WORKING_LOOK)).toBe(WORKING_LOOK)
    // VEW-76: the looks for people are on light paper too.
    expect(FILE_LOOK_NAMES).toEqual(['working', 'technical', 'simple', 'large'])
    // The screen still draws the dark look as it is.
    expect(planPicture(plan(), { look: 'dark' }).look).toBe(DARK_WORKING_LOOK)
  })
})
