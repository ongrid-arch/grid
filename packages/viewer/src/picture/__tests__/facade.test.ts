/**
 * LVL-8: a facade as a picture: the faces the core works out, drawn farthest first, in the look's
 * elevation line weights (the ground heaviest, then the outline, lighter with depth), with the
 * label every picture carries (MSG-3).
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/floorplan/geometry'
import { PHASE_COLOURS } from '../phaseColour'
import { facadePicture, facadeToSvg } from '../facade'
import { PAPER_PENS, TECHNICAL_LOOK, WORKING_LOOK, lineMetres, paperScaleOf, penSetFor } from '../look'
import { pictureToSvg } from '../planSvg'

const wall = (id: string, start: [number, number], end: [number, number], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })

/** Two floors, the first set 3 m back from the south side; a door and a window on the south. */
const house = (): FloorPlan =>
  parseFloorPlan({
    version: '1',
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 },
    ],
    walls: [
      wall('gs', [0, 0], [10, 0], 'ground'),
      wall('ge', [10, 0], [10, 8], 'ground'),
      wall('gn', [10, 8], [0, 8], 'ground'),
      wall('gw', [0, 8], [0, 0], 'ground'),
      wall('fs', [0, 3], [6, 3], 'first'),
      wall('fe', [6, 3], [6, 8], 'first'),
      wall('fn', [6, 8], [0, 8], 'first'),
      wall('fw', [0, 8], [0, 3], 'first'),
    ],
    rooms: [
      { id: 'g', name: 'Living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'ground' },
      { id: 'f', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' },
    ],
    openings: [{ id: 'front', wall: 'gs', type: 'door', offset: 4.5, width: 1, height: 2.1 }],
    patterns: [{ id: 'row', wall: 'fs', opening: { type: 'window', width: 1, height: 1.2, sill: 0.9 }, count: 3, margins: { start: 0.6, end: 0.6 } }],
  })

const tags = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
const width = (tag: string): number => Number(/stroke-width="([^"]+)"/.exec(tag)![1])
/** The stroke width of the edges of the faces in one plane: the path inside each face's group. */
const faceWidths = (svg: string, tier: number): number[] =>
  [...svg.matchAll(new RegExp(`<g data-part="facade-face"[^>]*data-tier="${tier}"[^>]*><path [^>]*stroke-width="([^"]+)"`, 'g'))].map((m) => Number(m[1]))

describe('a facade as a picture', () => {
  it('holds the elevation\'s parts: its faces, its openings, the ground, the outline and each floor\'s level', () => {
    const svg = facadeToSvg(house(), { side: 'south', look: 'technical' })
    expect(tags(svg, 'facade-face').length).toBeGreaterThanOrEqual(4)
    expect(tags(svg, 'facade-opening').map((t) => /data-id="([^"]+)"/.exec(t)![1])).toEqual(['row-first-1', 'row-first-2', 'row-first-3', 'front'])
    expect(tags(svg, 'facade-ground')).toHaveLength(1)
    expect(tags(svg, 'facade-outline')).toHaveLength(1)
    expect(tags(svg, 'facade-below-ground')).toHaveLength(1)
    expect(tags(svg, 'facade-level').map((t) => /data-floor="([^"]+)"/.exec(t)![1])).toEqual(['ground', 'first'])
    expect(svg).toContain('±0.000 Ground floor')
    expect(svg).toContain('+2.950 First floor')
    expect(svg).toContain('aria-label="South facade of the plan, 2 floors at their levels"')
  })

  it('tints a new facade wall and its patterned window frames in the working look', () => {
    const plan = house()
    plan.walls.find((wall) => wall.id === 'fs')!.phase = 'new'
    plan.rooms.find((room) => room.id === 'f')!.phase = 'new'
    const working = facadeToSvg(plan, { side: 'south', look: 'working' })
    expect(working).toMatch(new RegExp(`data-wall="fs"[^>]*><path [^>]*fill="${PHASE_COLOURS.new}"`))
    expect(working).toMatch(new RegExp(`data-wall="gs"[^>]*><path [^>]*fill="${WORKING_LOOK.colors.room}"`))
    expect(tags(working, 'facade-window-frame').length).toBeGreaterThan(0)
    expect(tags(working, 'facade-window-frame').every((frame) => frame.includes(`fill="${PHASE_COLOURS.new}"`))).toBe(true)
    const technical = facadeToSvg(plan, { side: 'south', look: 'technical' })
    expect(technical).not.toContain(PHASE_COLOURS.new)
  })

  it('draws a porch\'s front wall with its door, in front of the house wall it hides (VEW-25)', () => {
    const at = (id: string, start: [number, number], end: [number, number]) => wall(id, start, end, 'ground')
    const plan = parseFloorPlan({
      version: '1',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0 }],
      walls: [at('s1', [0, 0], [2, 0]), at('s2', [2, 0], [6, 0]), at('s3', [6, 0], [10, 0]), at('e', [10, 0], [10, 8]), at('n', [10, 8], [0, 8]), at('w', [0, 8], [0, 0]), at('pw', [2, 0], [2, -2]), at('ps', [2, -2], [6, -2]), at('pe', [6, -2], [6, 0])],
      rooms: [
        { id: 'in', name: 'Living', boundary: ['s1', 's2', 's3', 'e', 'n', 'w'], floor: 'ground' },
        { id: 'po', name: 'Porch', outdoor: 'porch', boundary: ['s2', 'pw', 'ps', 'pe'], floor: 'ground' },
      ],
      openings: [
        { id: 'porch-door', wall: 'ps', type: 'door', offset: 1.5, width: 1, height: 2.1 },
        { id: 'house-door', wall: 's2', type: 'door', offset: 1.5, width: 1, height: 2.1 },
      ],
    })
    const svg = facadeToSvg(plan, { side: 'south', look: 'technical' })
    expect(tags(svg, 'facade-face').filter((t) => t.includes('data-wall="ps"'))).toHaveLength(1)
    expect(tags(svg, 'facade-opening').map((t) => /data-id="([^"]+)"/.exec(t)![1])).toEqual(['porch-door'])
  })

  it('carries the label in its corner, as every picture does (MSG-3)', () => {
    const svg = facadeToSvg(house(), { side: 'north' })
    expect(tags(svg, 'guidance-label')).toHaveLength(1)
    expect(svg).toContain(GENERAL_GUIDANCE_LABEL)
    expect(pictureToSvg(facadePicture(house(), { side: 'north' }), 1, { label: false })).not.toContain(GENERAL_GUIDANCE_LABEL)
  })

  for (const look of ['technical', 'working'] as const) {
    it(`draws the ground heaviest, then the outline, then the faces lighter the further back they stand, in the ${look} look`, () => {
      const svg = facadeToSvg(house(), { side: 'south', look })
      const ground = width(tags(svg, 'facade-ground')[0]!)
      const outline = width(tags(svg, 'facade-outline')[0]!)
      const near = Math.max(...faceWidths(svg, 0))
      const back = Math.max(...faceWidths(svg, 1))
      const opening = width(tags(svg, 'facade-opening')[0]!)
      expect(ground).toBeGreaterThan(outline)
      expect(outline).toBeGreaterThan(near)
      expect(near).toBeGreaterThan(back)
      expect(opening).toBeLessThanOrEqual(back)
    })
  }

  it('takes its widths from the look\'s pen set for its scale, in millimetres on paper', () => {
    const picture = facadePicture(house(), { side: 'south', look: 'technical', paperScale: 100 })
    const svg = pictureToSvg(picture)
    const metres = (mm: number): number => (mm * 100) / 1000
    expect(width(tags(svg, 'facade-ground')[0]!)).toBeCloseTo(metres(PAPER_PENS[100].cut), 9)
    expect(width(tags(svg, 'facade-outline')[0]!)).toBeCloseTo(metres(PAPER_PENS[100].medium), 9)
    expect(Math.max(...faceWidths(svg, 0))).toBeCloseTo(metres(PAPER_PENS[100].fine), 9)
    expect(Math.max(...faceWidths(svg, 1))).toBeCloseTo(metres(PAPER_PENS[100].finest), 9)
    // Left to its own scale, the pen set follows the picture's size, as a plan's does.
    const own = facadePicture(house(), { side: 'south', look: 'technical' })
    const mpp = own.view.width / own.width
    expect(width(tags(pictureToSvg(own), 'facade-ground')[0]!)).toBeCloseTo(lineMetres(TECHNICAL_LOOK, mpp).width('elevationGround'), 4)
    expect([50, 100, 200]).toContain(penSetFor(paperScaleOf(mpp)))
  })

  it('draws black on white in the technical look and in the app\'s colours in the working look', () => {
    const technical = facadeToSvg(house(), { side: 'south', look: 'technical' })
    expect(tags(technical, 'facade-ground')[0]).toContain('stroke="#000000"')
    const working = facadeToSvg(house(), { side: 'south', look: 'working' })
    expect(tags(working, 'facade-ground')[0]).toContain(`stroke="${WORKING_LOOK.ink}"`)
    expect(working).toContain(`fill="${WORKING_LOOK.colors.window}"`)
  })

  it('says so when nothing faces the side', () => {
    const svg = facadeToSvg(parseFloorPlan({ version: '1', walls: [], rooms: [], openings: [] }), { side: 'east' })
    expect(svg).toContain('Nothing of the plan faces east.')
    expect(tags(svg, 'facade-ground')).toEqual([])
  })
})

describe('a sloped roof drawn as a roof (VEW-12)', () => {
  /** Two floors, 10 m by 7 m, under a gable whose ridge runs east to west. */
  const gableHouse = (): FloorPlan =>
    parseFloorPlan({
      version: '1',
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'First floor', level: 1, roof: { shape: 'gable', eaves: 2.6, pitch: 40, ridgeRuns: 'east-west' } },
      ],
      walls: [
        wall('gs', [0, 0], [10, 0], 'ground'), wall('ge', [10, 0], [10, 7], 'ground'), wall('gn', [10, 7], [0, 7], 'ground'), wall('gw', [0, 7], [0, 0], 'ground'),
        wall('fs', [0, 0], [10, 0], 'first'), wall('fe', [10, 0], [10, 7], 'first'), wall('fn', [10, 7], [0, 7], 'first'), wall('fw', [0, 7], [0, 0], 'first'),
      ],
      rooms: [
        { id: 'g', name: 'Living', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'ground' },
        { id: 'f', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' },
      ],
      openings: [],
    })
  /** The SVG of the face groups of one kind, each whole. */
  const groups = (svg: string, kind: string): string[] => [...svg.matchAll(new RegExp(`<g data-part="facade-face" data-kind="${kind}"[^>]*>(?:(?!<g data-part="facade-face").)*`, 'gs'))].map((m) => m[0])
  const ys = (tag: string): number[] => ['y1', 'y2'].map((a) => Number(new RegExp(`${a}="([^"]+)"`).exec(tag)![1]))

  for (const look of ['technical', 'working'] as const) {
    it(`draws the plane facing the eaves with its covering, ridge, verges and eaves, in the ${look} look`, () => {
      const picture = facadePicture(gableHouse(), { side: 'south', look })
      const plane = picture.facade.faces.find((f) => f.kind === 'roof-plane')!
      const svg = pictureToSvg(picture)
      const [group] = groups(svg, 'roof-plane')
      expect(group).toBeDefined()
      // The covering: level courses across the plane, every one inside it, between its eaves and its ridge.
      const courses = tags(group!, 'facade-roof-course')
      expect(courses.length).toBeGreaterThan(5)
      for (const course of courses) {
        const [y1, y2] = ys(course)
        expect(y1).toBe(y2)
        expect(-y1!).toBeGreaterThanOrEqual(plane.bottom - 1e-6)
        expect(-y1!).toBeLessThanOrEqual(plane.top + 1e-6)
      }
      expect(tags(group!, 'facade-roof-ridge')).toHaveLength(1)
      expect(tags(group!, 'facade-roof-verge')).toHaveLength(2)
      expect(tags(group!, 'facade-roof-eaves')).toHaveLength(1)
      // The gutter along the eaves, in the fascia's own group so a nearer face still hides it.
      const fascia = groups(svg, 'roof').filter((g) => g.includes('data-edge="eaves"'))
      expect(fascia).toHaveLength(1)
      const [gutter] = tags(fascia[0]!, 'facade-gutter')
      expect(gutter).toContain('x="-0.45"')
      expect(gutter).toContain('width="10.9"')
      expect(tags(svg, 'facade-gutter')).toHaveLength(1)
    })
  }

  it('draws the gable end whole, from the eaves to the verge, with no edge at the walls\' 2.70 m (VEW-61)', () => {
    const svg = facadeToSvg(gableHouse(), { side: 'east', look: 'technical' })
    const gable = [...svg.matchAll(/<g data-part="facade-face"[^>]*data-wall="fe"[^>]*><path d="([^"]+)"/g)].map((m) => m[1]!)
    expect(gable).toHaveLength(1)
    const heights = [...gable[0]!.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => -Number(m[2]))
    // The first floor stands at 2.95 m: its walls' stated top would be 5.65 m, its eaves are at 5.55 m.
    expect(heights.some((z) => Math.abs(z - 5.65) < 1e-6)).toBe(false)
    expect(Math.max(...heights)).toBeGreaterThan(8)
  })

  it('draws a flat roof as before: no covering, no roof lines and no gutter', () => {
    const svg = facadeToSvg(house(), { side: 'south', look: 'technical' })
    for (const part of ['facade-roof-course', 'facade-roof-ridge', 'facade-roof-eaves', 'facade-gutter']) expect(tags(svg, part)).toEqual([])
  })
})

describe('a doorless opening (reveals)', () => {
  const shop = (type: 'opening' | 'door'): FloorPlan => {
    const w = (id: string, start: [number, number], end: [number, number], thickness = 0.3) => ({ id, start, end, thickness, height: 3, floor: 'ground' })
    return parseFloorPlan({
      version: '1',
      floors: [{ id: 'ground', name: 'Ground floor', level: 0 }],
      walls: [w('s1', [0, 0], [2, 0]), w('s2', [2, 0], [6, 0]), w('s3', [6, 0], [10, 0]), w('e', [10, 0], [10, 8]), w('n', [10, 8], [0, 8]), w('wst', [0, 8], [0, 0]), w('pw', [2, 0], [2, -2]), w('ps', [2, -2], [6, -2], 0.4), w('pe', [6, -2], [6, 0])],
      rooms: [
        { id: 'in', name: 'Shop', boundary: ['s1', 's2', 's3', 'e', 'n', 'wst'], floor: 'ground' },
        { id: 'po', name: 'Porch', outdoor: 'porch', boundary: ['s2', 'pw', 'ps', 'pe'], floor: 'ground' },
      ],
      openings: [
        { id: 'bay', wall: 'ps', type, offset: 1, width: 2, height: 2.4 },
        { id: 'shop-door', wall: 's2', type: 'door', offset: 1.5, width: 1, height: 2.1 },
      ],
    })
  }

  it('is a void with an inner edge and four corner lines, and the door behind it is drawn', () => {
    const svg = facadeToSvg(shop('opening'), { side: 'south', look: 'technical' })
    const parts = tags(svg, 'facade-reveal')
    expect(parts.filter((t) => t.startsWith('<rect'))).toHaveLength(1)
    expect(parts.filter((t) => t.startsWith('<line'))).toHaveLength(4)
    expect(tags(svg, 'facade-opening').map((t) => /data-id="([^"]+)"/.exec(t)![1])).toEqual(['shop-door', 'bay'])
    expect(tags(svg, 'facade-face').length).toBeGreaterThan(0)
    expect(svg).toContain('fill-rule="evenodd"')
  })

  it('leaves a door as a plain door, with no reveal and no hole', () => {
    const svg = facadeToSvg(shop('door'), { side: 'south', look: 'technical' })
    expect(tags(svg, 'facade-reveal')).toHaveLength(0)
    expect(svg).not.toContain('fill-rule="evenodd"')
  })
})

describe('the ground on a slope (CNT-49)', () => {
  it('draws the ground line and the paper under it following the ground along the face', () => {
    const level = facadeToSvg(house(), { side: 'east', look: 'technical' })
    const sloped = facadeToSvg({ ...house(), site: { groundSides: { north: 0, south: -2 } } }, { side: 'east', look: 'technical' })
    const line = (svg: string): number[] => {
      const tag = tags(svg, 'facade-ground')[0]!
      return ['y1', 'y2'].map((k) => Number(new RegExp(`${k}="([^"]+)"`).exec(tag)![1]))
    }
    expect(line(level)[0]).toBe(line(level)[1])
    expect(line(sloped)[0]).not.toBeCloseTo(line(sloped)[1]!, 3)
    expect(tags(level, 'facade-below-ground')[0]).toMatch(/^<rect /)
    expect(tags(sloped, 'facade-below-ground')[0]).toMatch(/^<path /)
  })
})
