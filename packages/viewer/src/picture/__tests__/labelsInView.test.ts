import { describe, expect, it } from 'vitest'
import { computeBounds } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture } from '../planSvg'

/** The picture shows only room labels that fit within the room and the frame. */

function core(): FloorPlan {
  const written = compileRoomsText(
    [
      'walls outside 0.3 inside 0.1 height 2.6',
      'room big "Flat" - 20 x 20',
      'room c0 "Lift" - 0.5 x 0.5 east of big',
      'room c1 "Riser" - 0.5 x 0.5 east of c0',
      'room c2 "Store" - 0.5 x 0.5 east of c1'
    ].join('\n')
  )
  expect(written.problems).toEqual([])
  return written.plan as FloorPlan
}

describe('room labels in the picture frame', () => {
  it('places the large room’s label in the crop and leaves the tight rooms blank', () => {
    const picture = planPicture(core(), { width: 150, frame: computeBounds([{ x: 5, y: -1 }, { x: 22, y: 11 }]) })
    const { view } = picture
    const labels = picture.nodes.filter((node) => node.key?.startsWith('label:'))
    expect(labels.map((node) => node.key)).toEqual(['label:big'])
    const [, x, y] = /translate\((\S+) (\S+)\)/.exec(String(labels[0]!.attrs.transform))!
    expect(Number(x)).toBeGreaterThan(view.x)
    expect(Number(x)).toBeLessThan(view.x + view.width)
    expect(Number(y)).toBeGreaterThan(view.y)
    expect(Number(y)).toBeLessThan(view.y + view.height)
    expect(picture.nodes.some((node) => node.key?.startsWith('leader:'))).toBe(false)
  })

  it('draws each tight room’s label at a size where it can fit', () => {
    const plan = core()
    const labels = (width: number) => planPicture(plan, { width }).nodes
      .filter((node) => node.key?.startsWith('label:')).map((node) => node.key)
    expect(labels(300)).toEqual(['label:big'])
    expect(labels(2400)).toEqual(['label:big', 'label:c0', 'label:c1', 'label:c2'])
  })
})
