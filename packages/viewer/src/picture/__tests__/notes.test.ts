import { describe, expect, it } from 'vitest'
import { flat, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { CAPTION_PX, fileHeight, planPicture, pictureToSvg, planToSvg } from '../planSvg'

/**
 * VEW-17: a note's words are in the band under the drawing, numbered, and its mark on the plan is
 * a number; the label is in a caption band under everything, never over the drawing.
 */
const parts = (svg: string, part: string): string[] =>
  [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-part="${part}"[^>]*>`, 'g'))].map((m) => m[0])

const NOTE = 'Check the kennels back door before the screed goes down'

function withNotes(): FloorPlan {
  return {
    ...flat(),
    annotations: [
      { id: 'n1', kind: 'note', text: NOTE, at: [5, 5] },
      { id: 'n2', kind: 'tag', text: 'Existing boiler', at: [2, 2] },
      { id: 'n3', kind: 'symbol', symbol: 'north', at: [9, 9] }
    ]
  }
}

describe('notes on the 2D picture', () => {
  it('keeps the words off the plan and numbers them in the band', () => {
    const picture = planPicture(withNotes(), {})
    const onPlan = JSON.stringify(picture.nodes)
    expect(onPlan).not.toContain(NOTE)
    expect(onPlan).not.toContain('Existing boiler')
    const marks = picture.nodes.flatMap((node) => (node.attrs['data-part'] === 'note-note' || node.attrs['data-part'] === 'note-tag' ? [String(node.attrs['data-number'])] : []))
    expect(marks.sort()).toEqual(['1', '2'])
    const band = JSON.stringify(picture.key)
    expect(band).toContain(NOTE)
    expect(band).toContain('Existing boiler')
    expect(band).toContain('Notes')
  })

  it('still draws a north symbol on the plan', () => {
    expect(parts(planToSvg(withNotes()), 'note-symbol')).toHaveLength(1)
  })

  it('leaves the notes out, and keeps the person\'s tags and symbols, when notes are off', () => {
    const picture = planPicture(withNotes(), { show: { notes: false } })
    expect(JSON.stringify(picture)).not.toContain(NOTE)
    const svg = pictureToSvg(picture)
    expect(parts(svg, 'note-note')).toEqual([])
    expect(parts(svg, 'note-tag')).toHaveLength(1)
    expect(parts(svg, 'note-symbol')).toHaveLength(1)
    expect(svg).toContain('Existing boiler')
    // The tag is the only one left, so it is number 1.
    expect(parts(svg, 'note-tag')[0]).toContain('data-number="1"')
  })

  it('draws a key annotation on every floor', () => {
    const plan: FloorPlan = { ...twoFloorHouse(), annotations: [{ id: 'k', kind: 'key' }] }
    for (const floor of ['ground', 'first']) {
      const picture = planPicture(plan, { floor })
      expect(picture.key, floor).not.toBeNull()
    }
  })

  it('names a sketch category in the key by its own name', () => {
    const plan: FloorPlan = { ...flat(), sketch: [{ id: 's', kind: 'line', category: 'escape route', points: [[1, 1], [3, 3]] }] }
    const svg = pictureToSvg(planPicture(plan, {}))
    expect(svg).toContain('escape route')
    expect(svg).not.toContain('drawn only')
    expect(svg).not.toContain('Sketch:')
  })
})

describe('the label on the 2D picture', () => {
  it('is in a caption band under the drawing, not over it', () => {
    const picture = planPicture(flat(), {})
    const svg = pictureToSvg(picture)
    expect(svg).toContain('General guidance, not your local rules')
    const caption = /<g data-part="guidance-label" transform="translate\(0 ([\d.]+)\)"/.exec(svg)
    expect(Number(caption?.[1])).toBeGreaterThanOrEqual(picture.height)
    expect(fileHeight(picture)).toBe(picture.height + (picture.key?.height ?? 0) + CAPTION_PX)
    expect(svg).toContain(`viewBox="0 0 ${picture.width} ${fileHeight(picture)}"`)
  })

  it('is left out of the file when the page round it carries it', () => {
    const svg = pictureToSvg(planPicture(flat(), {}), 1, { label: false })
    expect(svg).not.toContain('General guidance')
    expect(fileHeight(planPicture(flat(), {}), false)).toBe(planPicture(flat(), {}).height)
  })
})

describe('several notes in one room', () => {
  const marks = (plan: FloorPlan): { number: string; transform: string; cy: number }[] =>
    planPicture(plan, {}).nodes.flatMap((node) =>
      node.attrs['data-part'] === 'note-note' || node.attrs['data-part'] === 'note-tag'
        ? [{ number: String(node.attrs['data-number']), transform: String(node.attrs.transform), cy: Number((node.children[0] as { attrs: Record<string, unknown> }).attrs.cy) }]
        : []
    )

  it('stack under the room label, each in its own row', () => {
    const found = marks({
      ...flat(),
      annotations: [
        { id: 'a', kind: 'note', text: 'One', room: 'kitchen' },
        { id: 'b', kind: 'note', text: 'Two', room: 'kitchen' },
        { id: 'c', kind: 'tag', text: 'Three', room: 'kitchen' },
        { id: 'd', kind: 'note', text: 'Elsewhere', room: 'hall' }
      ]
    })
    expect(found).toHaveLength(4)
    const kitchen = found.filter((m) => m.number !== '4')
    expect(new Set(kitchen.map((m) => m.transform)).size).toBe(1)
    const rows = kitchen.map((m) => m.cy)
    expect(new Set(rows).size).toBe(3)
    expect(rows).toEqual([...rows].sort((x, y) => x - y))
    // The row step clears a mark's own diameter.
    expect(rows[1]! - rows[0]!).toBeGreaterThanOrEqual(16)
    // A note in another room starts its own first row.
    expect(found.find((m) => m.number === '4')!.cy).toBe(rows[0])
  })
})
