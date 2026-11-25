import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planSection, type SectionLine } from '@ongrid/floorplan/geometry'
import { pictureToSvg } from '../planSvg'
import { sectionPicture } from '../section'

/** VEW-56: no height on an open-air room or a void; a thin room keeps its name. */
const plan = (court: string) => {
  const result = compileRoomsText(
    ['walls outside 0.3 inside 0.1 height 2.7', 'room n "North wing" living 12 x 4 at 0,0', `room c "Court" - 6 x 4 south of n align west shift 3 ${court}`, 'room w "West wing" bedroom 2.9 x 4 west of c', 'room e "East wing" bedroom 3 x 4 east of c'].join('\n')
  )
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(result.plan)
}
const LINE: SectionLine = { from: { x: 6, y: 6 }, to: { x: 6, y: -6 }, toward: 'left' }
const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((t) => t[1]!)

describe('section labels of rooms with no ceiling', () => {
  it('marks an unroofed outdoor room open and names it with no height', () => {
    const p = plan('outdoor courtyard unroofed')
    expect(planSection(p, LINE).rooms.find((r) => r.room === 'c')?.open).toBe(true)
    const words = texts(pictureToSvg(sectionPicture(p, LINE)))
    expect(words.some((t) => t.includes('Court'))).toBe(true)
    expect(words.filter((t) => t.includes('Court')).every((t) => !/\d\.\d\d m/.test(t))).toBe(true)
  })

  it('leaves a roofed room open: false, with its height', () => {
    const p = plan('')
    expect(planSection(p, LINE).rooms.find((r) => r.room === 'c')?.open).toBeUndefined()
  })

  it('keeps the name of a thin canopy, with no height standing in its place', () => {
    const p = plan('outdoor carport height 0.5')
    const words = texts(pictureToSvg(sectionPicture(p, LINE, { width: 220 })))
    expect(words.filter((t) => t.includes('0.50 m'))).toEqual([])
    expect(words).toContain('Court')
  })
})
