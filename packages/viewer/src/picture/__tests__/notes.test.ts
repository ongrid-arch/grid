import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
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

  it('leaves the notes out of both when notes are off', () => {
    const picture = planPicture(withNotes(), { show: { notes: false } })
    expect(JSON.stringify(picture)).not.toContain(NOTE)
    // VEW-22: every note, tag and symbol, and the notes' list in the band, as hide notes asks.
    const svg = pictureToSvg(picture)
    expect(svg).not.toContain('Existing boiler')
    for (const part of ['note-note', 'note-tag', 'note-symbol', 'note-mark', 'notes-title', 'notes-number', 'notes-text']) expect(parts(svg, part), part).toEqual([])
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
