import { describe, expect, it } from 'vitest'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { levelText, type SectionLine } from '@ongrid/floorplan/geometry'
import { ELEVATION_PX, PAPER_PENS, lengthText } from '../look'
import { facadePicture } from '../facade'
import { pictureToSvg, planPicture, planToSvg } from '../planSvg'
import { sectionPicture } from '../section'

/**
 * LVL-9: a section as a picture, in the plan's looks and paper line weights (SHT-1). The geometry
 * is the core's (`planSection`, `drawingMarks`); this only paints it.
 */
const THROUGH_STAIR: SectionLine = { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 13 }, toward: 'left' }
const townhouse = () => labPlan('A/scenarios/townhouse.json')

const tagsOf = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])
const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
/** The words of every `<text>` inside each group of one part, groups within it and all. */
function textsOf(svg: string, part: string): string[] {
  return [...svg.matchAll(new RegExp(`<g [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => {
    let depth = 1
    let at = m.index! + m[0].length
    const start = at
    while (depth > 0) {
      const open = svg.indexOf('<g', at)
      const close = svg.indexOf('</g>', at)
      if (open !== -1 && open < close) {
        depth++
        at = open + 2
      } else {
        depth--
        at = close + 4
      }
    }
    return [...svg.slice(start, at).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((t) => t[1]).join(' ')
  })
}

describe('a section in the technical look', () => {
  const picture = sectionPicture(townhouse(), THROUGH_STAIR, { look: 'technical', paperScale: 100 })
  const svg = pictureToSvg(picture)
  const metres = (mm: number): number => Number(lengthText((mm * 100) / 1000))

  it('draws the cut as one solid shape under the heavy outline of the plan\'s cut walls', () => {
    expect(tagsOf(svg, 'section-cut')).toHaveLength(1)
    expect(attr(tagsOf(svg, 'section-cut')[0]!, 'fill')).toBe('#8c8c8c')
    const outline = tagsOf(svg, 'section-cut-outline')
    expect(outline).toHaveLength(1)
    // As the plan's wall outline: twice the cut pen, its inner half under the fill.
    expect(Number(attr(outline[0]!, 'stroke-width'))).toBe(metres(2 * PAPER_PENS[100].cut))
  })

  it('runs a heavy ground line past the building, and draws what lies beyond lighter', () => {
    const ground = tagsOf(svg, 'section-ground')
    expect(ground).toHaveLength(1)
    // A facade's ground line (LVL-8): the cut pen, none of it under a fill.
    expect(Number(attr(ground[0]!, 'stroke-width'))).toBe(metres(PAPER_PENS[100].cut))
    expect(attr(ground[0]!, 'd')).toBe('M0.0000,0.0000L1.8500,0.0000M13.1500,0.0000L15.0000,0.0000')
    const beyond = tagsOf(svg, 'section-beyond')
    expect(beyond.length).toBeGreaterThan(0)
    for (const tag of beyond) expect(Number(attr(tag, 'stroke-width'))).toBe(metres(PAPER_PENS[100].finest))
  })

  it('hatches each slab and the roof the plan does not state, and lists them with what else it took', () => {
    const hatch = tagsOf(svg, 'section-hatch')
    expect(hatch.map((tag) => `${attr(tag, 'data-kind')}:${attr(tag, 'data-ids')}`)).toEqual(['slab:ground', 'slab:first', 'slab:second', 'roof:second'])
    for (const tag of hatch) expect(attr(tag, 'fill')).toBe('url(#section-hatch)')
    expect(svg).toContain('<pattern id="section-hatch" patternUnits="userSpaceOnUse"')
    const listed = textsOf(svg, 'section-taken').join(' ')
    for (const taken of picture.section.assumed) expect(listed.replace(/\s+/g, ' ')).toContain(taken.words.split(' ').slice(0, 6).join(' '))
    expect(svg).toContain('Hatched: taken by Grid, not stated in the plan')
  })

  it('marks every floor\'s level, the roof and the ground beside the drawing', () => {
    expect(textsOf(svg, 'section-level')).toEqual(['±0.000 Ground floor', '+2.950 First floor', '+6.100 Second floor'])
    expect(textsOf(svg, 'section-roof-level')).toEqual(['+8.850 Roof'])
    expect(textsOf(svg, 'section-ground-level')).toEqual(['±0.000 Ground'])
  })

  it('names each room cut with its height', () => {
    const rooms = tagsOf(svg, 'section-room')
    expect(rooms.length).toBe(9)
    expect(textsOf(svg, 'section-room')).toContain('Kitchen + dining 2.70 m')
    expect(textsOf(svg, 'section-room')).toContain('Bedroom 1 2.50 m')
  })

  it('is labelled as a section, with the guidance label', () => {
    expect(svg).toContain('aria-label="Section A–A through 9 rooms, and a key of what to look at"')
    expect(svg).toContain('General guidance, not your local rules')
  })
})

describe('a section in the working look', () => {
  it('draws the cut solid with no outline, the ground as a facade draws it on screen', () => {
    const picture = sectionPicture(townhouse(), THROUGH_STAIR)
    const svg = pictureToSvg(picture)
    const mpp = picture.view.width / picture.width
    expect(tagsOf(svg, 'section-cut-outline')).toEqual([])
    expect(attr(tagsOf(svg, 'section-cut')[0]!, 'fill')).toBe('#232320')
    expect(Number(attr(tagsOf(svg, 'section-ground')[0]!, 'stroke-width'))).toBe(Number(lengthText(ELEVATION_PX.ground * mpp)))
  })
})

describe('levels a plan states', () => {
  it('are the levels the section marks (LVL-9 done-when 2)', () => {
    const plan = parseFloorPlan({
      ...twoFloorHouse(),
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0, elevation: 0.15, slab: 0.3, height: 2.6 },
        { id: 'first', name: 'First floor', level: 1, elevation: 3.2, slab: 0.3, height: 2.5 }
      ]
    })
    const svg = pictureToSvg(sectionPicture(plan, { from: { x: 2, y: -2 }, to: { x: 2, y: 10 }, toward: 'left' }, { look: 'technical' }))
    expect(textsOf(svg, 'section-level')).toEqual([`${levelText(0.15)} Ground floor`, `${levelText(3.2)} First floor`])
    expect(textsOf(svg, 'section-level')).toEqual(['+0.150 Ground floor', '+3.200 First floor'])
    // The slabs are stated: only the roof is hatched.
    expect(tagsOf(svg, 'section-hatch').map((tag) => attr(tag, 'data-kind'))).toEqual(['roof'])
  })
})

describe('the marks on a plan', () => {
  it('are none unless asked for: a plan picture is unchanged', () => {
    const plain = planToSvg(townhouse(), { floor: 'first', look: 'technical' })
    expect(plain).toBe(planToSvg(townhouse(), { floor: 'first', look: 'technical', marks: {} }))
    for (const part of ['section-mark', 'elevation-mark', 'level-mark']) expect(tagsOf(plain, part)).toEqual([])
  })

  it('draw the section\'s line, an elevation mark on each side and each room\'s level', () => {
    const picture = planPicture(townhouse(), { floor: 'first', look: 'technical', marks: { section: THROUGH_STAIR, elevations: true, levels: true } })
    const svg = pictureToSvg(picture)
    expect(tagsOf(svg, 'section-mark')).toHaveLength(1)
    expect(tagsOf(svg, 'section-mark-head')).toHaveLength(2)
    expect(attr(tagsOf(svg, 'section-mark-line')[0]!, 'stroke-dasharray')).toBeDefined()
    expect(tagsOf(svg, 'elevation-mark').map((tag) => attr(tag, 'data-faces'))).toEqual(['south', 'east', 'north', 'west'])
    // LVL-8: the facade that draws each side.
    expect(tagsOf(svg, 'elevation-mark').map((tag) => attr(tag, 'data-facade'))).toEqual(['south', 'east', 'north', 'west'])
    const levels = tagsOf(svg, 'level-mark')
    expect(levels.length).toBe(5)
    for (const tag of levels) expect(attr(tag, 'data-level')).toBe('2.95')
    expect(textsOf(svg, 'level-mark')[0]).toBe('+2.950')
    // The view frames the marks: the cut line's ends are inside it.
    const { view } = picture
    for (const p of [THROUGH_STAIR.from, THROUGH_STAIR.to]) {
      expect(p.x).toBeGreaterThan(view.x)
      expect(-p.y).toBeGreaterThan(view.y)
      expect(-p.y).toBeLessThan(view.y + view.height)
    }
  })
})

describe('a section and a facade of one plan (after LVL-8)', () => {
  it('draw the ground line and the lines seen beyond with the same pens', () => {
    const section = pictureToSvg(sectionPicture(townhouse(), THROUGH_STAIR, { look: 'technical', paperScale: 100 }))
    const facade = pictureToSvg(facadePicture(townhouse(), { side: 'south', look: 'technical', paperScale: 100 }))
    const width = (tag: string): number => Number(attr(tag, 'stroke-width'))
    expect(width(tagsOf(section, 'section-ground')[0]!)).toBeCloseTo(width(tagsOf(facade, 'facade-ground')[0]!), 9)
    // What a section sees beyond is drawn as a facade's faces set back (its second plane).
    expect(width(tagsOf(section, 'section-beyond')[0]!)).toBeCloseTo((PAPER_PENS[100].finest * 100) / 1000, 9)
  })
})


describe('levels in the plan\'s units (VEW-20)', () => {
  const tower = () =>
    parseFloorPlan({
      ...twoFloorHouse(),
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0, elevation: 0, slab: 0.3, height: 2.6 },
        { id: 'first', name: 'First floor', level: 1, elevation: 3.2, slab: 0.3, height: 2.5 }
      ]
    })
  const line: SectionLine = { from: { x: 2, y: -2 }, to: { x: 2, y: 10 }, toward: 'left' }
  const levels = (svg: string): string[] => textsOf(svg, 'section-level')
  const facadeLevels = (svg: string): string[] => [...svg.matchAll(/data-part="facade-level-name"[^>]*><text[^>]*>([^<]*)</g)].map((m) => m[1]!)

  it('writes a millimetre plan in millimetres, and a feet-and-inches plan in feet and inches', () => {
    const mm = pictureToSvg(sectionPicture({ ...tower(), display: { length: 'mm' } }, line, { look: 'technical' }))
    expect(levels(mm)).toEqual(['±0 Ground floor', '+3200 First floor'])
    const ft = pictureToSvg(sectionPicture({ ...tower(), display: { length: 'ft-in', area: 'ft2', decimal: 'point' } }, line, { look: 'technical' }))
    expect(levels(ft)).toEqual(['±0\'-0" Ground floor', '+10\'-6" First floor'])
  })

  it('follows the display a call asks for over the plan\'s own', () => {
    const asked = pictureToSvg(sectionPicture(tower(), line, { look: 'technical', display: { length: 'cm', area: 'm2', decimal: 'point' } }))
    expect(levels(asked)).toEqual(['±0.0 Ground floor', '+320.0 First floor'])
  })

  it('writes a section and an elevation of the same plan the same way: the level first, then the name', () => {
    const plan = { ...tower(), display: { length: 'mm' as const } }
    const section = levels(pictureToSvg(sectionPicture(plan, line, { look: 'technical' })))
    const elevation = facadeLevels(pictureToSvg(facadePicture(plan, { side: 'south', look: 'technical' })))
    expect(elevation).toEqual(section)
  })
})
