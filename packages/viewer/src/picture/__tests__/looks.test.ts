import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { edit } from '../../canvas2d/__tests__/fixtures'
import { LINE_PX, LOOKS, PAPER_PENS, TECHNICAL_LOOK, WORKING_LOOK, lengthText, lineMetres, paperScaleOf, penSetFor } from '../look'
import { PAINT_ATTRIBUTES } from '../scene'
import { planPicture, planToSvg, undecidedDoorsOf } from '../planSvg'
import { toSvg, type SvgChild, type SvgNode } from '../svgNode'

/**
 * SHT-1: named looks, drawn by the one drawing function from the same geometry. Working for the
 * screen and every picture an agent gets, technical for sheets and files to hand on.
 */

/** The house, its front door hung, the door between the rooms left undecided, and a window. */
function plan(): FloorPlan {
  return edit((p) => {
    p.openings[0] = { ...p.openings[0]!, hinge: 'start', swing: 'left' }
    p.openings.push({ id: 'o3', wall: 'w3', type: 'window', offset: 1, width: 1.2, height: 1.2, sill: 0.9 })
  })
}

const tagsOf = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]

const strokeOf = (svg: string, part: string): number[] => tagsOf(svg, part).map((tag) => Number(attr(tag, 'stroke-width')))

/** Parts only a look's own symbols add: everything else is the drawing both looks share. */
// SHT-10: and the detail a paper look draws at 1:50 and larger: frames, sills and hatches.
const LOOK_PARTS = new Set(['wall-outlines', 'window-symbol', 'door-undecided', 'dimension-tick', 'opening-detail', 'wall-hatches'])

/** The drawing with its paint taken off and the look's own symbols left out: its geometry. */
function geometryOf(nodes: readonly SvgChild[]): SvgChild[] {
  return nodes.flatMap((node): SvgChild[] => {
    if (typeof node === 'string') return [node]
    if (LOOK_PARTS.has(String(node.attrs['data-part']))) return []
    // SHT-4: a drafted look turns a dimension's number along its line, where every look puts it.
    const own = node.attrs['data-part'] === 'dimension-text' ? ['transform'] : []
    const attrs = Object.fromEntries(
      Object.entries(node.attrs).filter(([name]) => !(PAINT_ATTRIBUTES as readonly string[]).includes(name) && !own.includes(name))
    )
    return [{ ...node, attrs, children: geometryOf(node.children) } satisfies SvgNode]
  })
}

describe('named looks', () => {
  it('draws the working look by default, and light is its older name', () => {
    expect(planToSvg(plan(), { look: 'working' })).toBe(planToSvg(plan()))
    expect(planToSvg(plan(), { look: 'light' })).toBe(planToSvg(plan()))
    expect(planPicture(plan()).look).toBe(WORKING_LOOK)
  })

  it('draws every look from the same geometry: only the paint and the look\'s own symbols differ', () => {
    const working = planPicture(plan(), { look: 'working' })
    for (const name of ['technical', 'dark'] as const) {
      const other = planPicture(plan(), { look: name })
      expect(other.view).toEqual(working.view)
      expect(toSvg(geometryOf(other.nodes))).toBe(toSvg(geometryOf(working.nodes)))
    }
  })

  it('refuses a look it does not have, by name', () => {
    expect(() => planToSvg(plan(), { look: 'sketch' as never })).toThrow(/no look called "sketch"/)
  })

  it('keeps the working look\'s lines in screen pixels, whatever paper scale is asked', () => {
    const picture = planPicture(plan())
    const mpp = picture.view.width / picture.width
    for (const paperScale of [undefined, 50, 200]) {
      const svg = planToSvg(plan(), paperScale === undefined ? {} : { paperScale })
      expect(strokeOf(svg, 'door-leaf')).toEqual([Number(lengthText(LINE_PX.doorLeaf * mpp))])
    }
  })
})

describe('the technical look: line weights in millimetres on paper', () => {
  it.each([50, 100, 200] as const)('at 1:%i draws each line with its pen, times the scale', (scale) => {
    const svg = planToSvg(plan(), { look: 'technical', paperScale: scale })
    const pens = PAPER_PENS[scale]
    const metres = (mm: number): number => Number(lengthText((mm * scale) / 1000))
    // The outline is drawn twice the pen's width, its inner half under the wall's fill.
    for (const width of strokeOf(svg, 'wall-outline')) expect(width).toBe(Number(lengthText((2 * pens.cut * scale) / 1000)))
    expect(strokeOf(svg, 'door-leaf')).toEqual([metres(pens.medium)])
    expect(strokeOf(svg, 'door-arc')).toEqual([metres(pens.finest)])
    // SHT-10: at 1:50 a window's glass is two panes, each with the same pen.
    expect(strokeOf(svg, 'window-glass')).toEqual(scale === 50 ? [metres(pens.fine), metres(pens.fine)] : [metres(pens.fine)])
    for (const width of strokeOf(svg, 'dimension-line')) expect(width).toBe(metres(pens.finest))
  })

  it('has four weights, heaviest for the cut walls, finer at a smaller scale', () => {
    for (const pens of Object.values(PAPER_PENS)) {
      expect(new Set(Object.values(pens)).size).toBe(4)
      expect(pens.cut).toBeGreaterThan(pens.medium)
      expect(pens.medium).toBeGreaterThan(pens.fine)
      expect(pens.fine).toBeGreaterThan(pens.finest)
    }
    expect(PAPER_PENS[50].cut).toBeGreaterThan(PAPER_PENS[100].cut)
    expect(PAPER_PENS[100].cut).toBeGreaterThan(PAPER_PENS[200].cut)
  })

  it('draws wider lines in plan metres at 1:200 than at 1:100 than at 1:50', () => {
    const outline = (scale: number): number => strokeOf(planToSvg(plan(), { look: 'technical', paperScale: scale }), 'wall-outline')[0]!
    expect(outline(50)).toBeLessThan(outline(100))
    expect(outline(100)).toBeLessThan(outline(200))
  })

  it('takes the pen set of the nearest of 1:50, 1:100 and 1:200 for any other scale', () => {
    expect([30, 50, 70, 71, 100, 141, 142, 200, 500].map(penSetFor)).toEqual([50, 50, 50, 100, 100, 100, 200, 200, 200])
    const at87 = lineMetres(TECHNICAL_LOOK, 0.01, 87)
    expect(at87.width('wallOutline')).toBeCloseTo((PAPER_PENS[100].cut * 87) / 1000, 12)
  })

  it('uses the picture\'s own scale when none is asked: each pixel a CSS pixel on paper', () => {
    const picture = planPicture(plan(), { look: 'technical' })
    const mpp = picture.view.width / picture.width
    const scale = paperScaleOf(mpp)
    const svg = planToSvg(plan(), { look: 'technical' })
    expect(strokeOf(svg, 'door-leaf')).toEqual([Number(lengthText((PAPER_PENS[penSetFor(scale)].medium * scale) / 1000))])
    // One pixel of the picture is 25.4 / 96 mm, so the leaf is its pen's width in pixels at 96 dpi.
    expect((strokeOf(svg, 'door-leaf')[0]! / mpp) * (25.4 / 96)).toBeCloseTo(PAPER_PENS[penSetFor(scale)].medium, 2)
  })

  it('refuses a paper scale that is not a number above 0', () => {
    for (const paperScale of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => planToSvg(plan(), { look: 'technical', paperScale })).toThrow(/paper scale/)
    }
  })
})

describe('the technical look: its basics', () => {
  const svg = planToSvg(plan(), { look: 'technical', paperScale: 100 })

  it('is black on white', () => {
    expect(svg).toContain(`<rect data-part="paper"`)
    expect(attr(tagsOf(svg, 'paper')[0]!, 'fill')).toBe('#ffffff')
    for (const tag of tagsOf(svg, 'room')) expect(attr(tag, 'fill')).toBe('#ffffff')
    for (const part of ['label', 'dimension-text']) {
      for (const tag of tagsOf(svg, part).filter((t) => !t.includes('data-kind'))) expect(attr(tag, 'fill')).toMatch(/^#(000000|3c3c3c)$/)
    }
    for (const part of ['wall-outline', 'door-leaf', 'door-arc', 'window-face', 'window-glass']) {
      for (const tag of tagsOf(svg, part)) expect(attr(tag, 'stroke'), part).toBe('#000000')
    }
  })

  it('outlines the cut walls heaviest, with their fill as a tone inside, drawn over the outline', () => {
    const outlines = strokeOf(svg, 'wall-outline')
    expect(outlines.length).toBe(plan().walls.length + plan().openings.length)
    const others = [...svg.matchAll(/stroke-width="([^"]+)"/g)].map((m) => Number(m[1])).filter((w) => !outlines.includes(w))
    // What shows of the outline is half its stroke: still the heaviest line on the page.
    expect(Math.min(...outlines) / 2).toBeGreaterThan(Math.max(...others.filter((w) => w < 1)))
    // SHT-10: each kind of wall its own tone: the outside walls darker than the inside one.
    for (const tag of tagsOf(svg, 'wall')) {
      expect(attr(tag, 'fill')).toBe(TECHNICAL_LOOK.walls.fill[attr(tag, 'data-wall-kind') as 'outside' | 'inside' | 'partition'])
      expect(attr(tag, 'stroke')).toBeUndefined()
    }
    expect(new Set(tagsOf(svg, 'wall').map((tag) => attr(tag, 'fill'))).size).toBe(2)
    expect(svg.indexOf('data-part="wall-outlines"')).toBeLessThan(svg.indexOf('data-part="wall"'))
    // The gaps are left open, so the outline shows across each wall's cut end.
    for (const tag of tagsOf(svg, 'opening')) {
      expect(attr(tag, 'fill')).toBe('none')
      expect(attr(tag, 'stroke')).toBe('none')
    }
  })

  it('draws a window as the break bridged by two face lines and a glass line', () => {
    const symbols = tagsOf(svg, 'window-symbol')
    expect(symbols.map((tag) => attr(tag, 'data-opening'))).toEqual(['o3'])
    const faces = tagsOf(svg, 'window-face')
    const glass = tagsOf(svg, 'window-glass')
    expect([faces.length, glass.length]).toEqual([2, 1])
    // Wall w3 runs along y = 4 and is 0.2 thick: the faces sit on its two faces, the glass between.
    const ys = (tags: string[]): number[] => tags.map((tag) => -Number(attr(tag, 'y1'))).sort((a, b) => a - b)
    expect(ys(faces)[0]).toBeCloseTo(3.9, 9)
    expect(ys(faces)[1]).toBeCloseTo(4.1, 9)
    expect(ys(glass)[0]).toBeCloseTo(4, 9)
    expect(attr(tagsOf(svg, 'opening').find((t) => t.includes('data-id="o3"'))!, 'fill')).toBe('none')
  })

  it('draws a door with no stated swing with its own undecided mark, and names it', () => {
    const marks = tagsOf(svg, 'door-undecided')
    expect(marks.map((tag) => attr(tag, 'data-opening'))).toEqual(['o2'])
    expect(svg).toMatch(/data-part="door-undecided-mark"[^>]*>\?<\/text>/)
    expect(attr(tagsOf(svg, 'door-undecided-line')[0]!, 'stroke-dasharray')).toBeTruthy()
    // The hung door keeps its swing and gets no mark.
    expect(tagsOf(svg, 'door-symbol').map((tag) => attr(tag, 'data-opening'))).toEqual(['o1'])
    expect(planPicture(plan(), { look: 'technical' }).undecidedDoors).toEqual(['o2'])
    expect(undecidedDoorsOf(plan())).toEqual(['o2'])
  })

  it('ends every dimension line in two 45-degree ticks and turns its number along it (SHT-4)', () => {
    const groups: SvgNode[] = []
    const walk = (nodes: readonly SvgChild[]): void => {
      for (const node of nodes) {
        if (typeof node === 'string') continue
        if (node.attrs['data-part'] === 'dimension') groups.push(node)
        else walk(node.children)
      }
    }
    walk(planPicture(plan(), { look: 'technical', paperScale: 100 }).nodes)
    expect(groups.length).toBeGreaterThan(10)
    const part = (group: SvgNode, name: string): SvgNode[] => {
      const found: SvgNode[] = []
      const visit = (nodes: readonly SvgChild[]): void => {
        for (const node of nodes) {
          if (typeof node === 'string') continue
          if (node.attrs['data-part'] === name) found.push(node)
          else visit(node.children)
        }
      }
      visit(group.children)
      return found
    }
    const vector = (node: SvgNode): [number, number] => [Number(node.attrs.x2) - Number(node.attrs.x1), Number(node.attrs.y2) - Number(node.attrs.y1)]
    for (const group of groups) {
      const along = vector(part(group, 'dimension-line')[0]!)
      const ticks = part(group, 'dimension-tick')
      expect(ticks).toHaveLength(2)
      // Each tick crosses its end of the line at 45 degrees.
      for (const tick of ticks) {
        const across = vector(tick)
        const cos = (along[0] * across[0] + along[1] * across[1]) / (Math.hypot(...along) * Math.hypot(...across))
        expect(Math.abs(cos)).toBeCloseTo(Math.SQRT1_2, 3)
      }
      // A number on an upright line reads from the bottom: turned a quarter, never upside down.
      const text = part(group, 'dimension-text')[0]
      if (text && Math.abs(along[0]) < 1e-9) expect(text.attrs.transform).toBe('rotate(-90)')
      if (text && Math.abs(along[1]) < 1e-9) expect(text.attrs.transform).toBeUndefined()
    }
  })

  it('leaves all of it to the technical look: the working look draws the app\'s plain drawing', () => {
    const working = planToSvg(plan())
    for (const part of ['wall-outlines', 'window-symbol', 'door-undecided', 'dimension-tick']) expect(working).not.toContain(`data-part="${part}"`)
    expect(tagsOf(working, 'dimension-text').some((tag) => attr(tag, 'transform') !== undefined)).toBe(false)
    expect(planPicture(plan()).undecidedDoors).toEqual([])
    expect(LOOKS.working.undecidedDoors || LOOKS.working.glass || LOOKS.working.wallOutline !== null || LOOKS.working.draftedDimensions).toBe(false)
  })
})
