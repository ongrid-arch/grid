import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture, planToSvg } from '../planSvg'
import { LIGHT_LOOK, LOOKS, USE_FILLS, fileLook } from '../look'
import type { FaultLine } from '../faults'

/**
 * VEW-76: the looks for a picture a person sees. `simple`: rooms by use, each label with its
 * sizes and area in two units, the overall sizes only, the title and the floor's total, and none
 * of the check's notes. `large`: big names, no dimensions.
 */
const written = compileRoomsText([
  'walls outside 0.3 inside 0.1 height 2.7',
  'room living "Living room" living 5 x 4 at 0,0',
  'room bed "Bedroom" bedroom 4 x 4 east of living',
  'room garden "Garden" - 9 x 3 north of living outdoor garden',
].join('\n'))

function home(extra: Partial<FloorPlan> = {}): FloorPlan {
  expect(written.problems).toEqual([])
  return parseFloorPlan({ ...written.plan, title: 'Rose Cottage', north: 0, ...extra })
}

const tags = (svg: string, part: string): string[] => [...svg.matchAll(/<[a-z]+ [^>]*>/g)].map(([tag]) => tag).filter((tag) => tag.includes(`data-part="${part}"`))
const texts = (svg: string, part: string): string[] => [...svg.matchAll(new RegExp(`<text [^>]*data-part="${part}"[^>]*>([^<]*)</text>`, 'g'))].map((m) => m[1]!)
const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const unescape = (text: string): string => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&')

const FAULT: FaultLine = { thing: { kind: 'room', id: 'living' }, floor: 'ground', message: 'Something to check about the living room' }

describe('the simple look (VEW-76)', () => {
  it('is a named look on light paper, kept for files', () => {
    expect(LOOKS.simple.forPeople).toEqual({ large: false })
    expect(LOOKS.large.forPeople).toEqual({ large: true })
    expect(fileLook(LOOKS.simple)).toBe(LOOKS.simple)
    expect(LOOKS.working.forPeople).toBeUndefined()
  })

  it('writes each room\'s width × depth and area in two units on its label', () => {
    const svg = planToSvg(home(), { look: 'simple' })
    const sizes = texts(svg, 'size').map(unescape)
    expect(sizes).toContain('5.00 × 4.00 m (16\'-5" × 13\'-1")')
    expect(sizes).toContain('4.00 × 4.00 m (13\'-1" × 13\'-1")')
    const areas = [...svg.matchAll(/<text [^>]*data-part="area"[^>]*>(.*?)<\/text>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ''))
    expect(areas).toContain('20.00 m² (215 sq ft)')
  })

  it('draws the overall sizes only, no chains and no room size lines', () => {
    const simple = planToSvg(home(), { look: 'simple' })
    const working = planToSvg(home(), { look: 'working' })
    const kinds = (svg: string) => tags(svg, 'dimension').map((tag) => attr(tag, 'data-kind'))
    expect(kinds(working)).toContain('room')
    expect(kinds(simple).length).toBeGreaterThan(0)
    expect(new Set(kinds(simple))).toEqual(new Set(['overall']))
    expect(kinds(simple).length).toBeLessThan(kinds(working).length)
    // Each overall size with its unit and in feet and inches after it.
    expect(texts(simple, 'dimension-text').map(unescape)).toContain('9.70 m (31\'-10")')
  })

  it('marks and lists none of the check\'s notes', () => {
    const simple = planToSvg(home(), { look: 'simple', faults: [FAULT] })
    expect(simple).not.toContain('fault-mark')
    expect(simple).not.toContain('Something to check')
    expect(planToSvg(home(), { look: 'working', faults: [FAULT] })).toContain('fault-mark')
  })

  it('fills rooms by use and keeps the garden green', () => {
    const svg = planToSvg(home(), { look: 'simple' })
    const rooms = tags(svg, 'room')
    const fill = (id: string) => attr(rooms.find((tag) => attr(tag, 'data-id') === id)!, 'fill')
    expect(fill('living')).toBe(USE_FILLS.living)
    expect(fill('bed')).toBe(USE_FILLS.bedroom)
    expect(fill('garden')).toBe(LIGHT_LOOK.outdoorRoom)
  })

  it('writes the title, the north arrow and the floor\'s total with its rule under the drawing', () => {
    const svg = planToSvg(home(), { look: 'simple' })
    expect(texts(svg, 'title')).toEqual(['Rose Cottage'])
    expect(tags(svg, 'north-arrow')).toHaveLength(1)
    const totals = texts(svg, 'total').map(unescape)
    expect(totals[0]).toMatch(/^Floor area \d+\.\d\d m² \(\d+ sq ft\): the floor inside each room's walls, added up \(net area\)$/)
    expect(totals[1]).toMatch(/^Outdoor space 2\d\.\d\d m² \(\d+ sq ft\), not in the floor area$/)
    expect(texts(planToSvg(home(), { look: 'working' }), 'total')).toEqual([])
  })

  it('writes feet and inches first on a plan read in feet', () => {
    const svg = planToSvg(home({ display: { length: 'ft-in', area: 'ft2' } }), { look: 'simple' })
    expect(texts(svg, 'size').map(unescape)).toContain('16\'-5" × 13\'-1" (5.00 × 4.00 m)')
    expect(texts(svg, 'total')[0]).toMatch(/^Floor area \d+\.\d sq ft \(\d+\.\d m²\)/)
  })
})

describe('the large-print look (VEW-76)', () => {
  it('draws no dimensions and the names larger than the working look\'s', () => {
    const svg = planToSvg(home(), { look: 'large' })
    expect(tags(svg, 'dimension')).toEqual([])
    expect(texts(svg, 'size')).toEqual([])
    const names = tags(svg, 'label').map((tag) => Number(attr(tag, 'font-size')))
    expect(names.some((size) => size > 13)).toBe(true)
    expect(texts(svg, 'total')).toHaveLength(2)
    expect(Number(attr(tags(svg, 'title')[0]!, 'font-size'))).toBeGreaterThan(18)
  })

  it('is drawn in the same frame size as the working look', () => {
    const large = planPicture(home(), { look: 'large' })
    expect(large.width).toBe(1200)
    expect(large.key).not.toBeNull()
  })
})
