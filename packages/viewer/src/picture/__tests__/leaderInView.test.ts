import { describe, expect, it } from 'vitest'
import { computeBounds } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planPicture } from '../planSvg'

/** VEW-44: a leader is only drawn to a label that is drawn, inside the picture's own view. */

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

describe('a leader goes with its label (VEW-44)', () => {
  it('draws no leader to a label outside a cropped picture', () => {
    const picture = planPicture(core(), { width: 150, frame: computeBounds([{ x: 5, y: -1 }, { x: 22, y: 11 }]) })
    const { view } = picture
    const leaders = picture.nodes.filter((node) => node.key?.startsWith('leader:') === true)
    expect(leaders.length).toBeGreaterThan(0)
    for (const leader of leaders) {
      const label = picture.nodes.find((node) => node.key === `label:${String(leader.key).slice('leader:'.length)}`)
      expect(label).toBeDefined()
      const [x, y] = /translate\((\S+) (\S+)\)/.exec(String(label!.attrs.transform))!.slice(1).map(Number)
      expect(x!).toBeGreaterThanOrEqual(view.x)
      expect(x!).toBeLessThanOrEqual(view.x + view.width)
      expect(y!).toBeGreaterThanOrEqual(view.y)
      expect(y!).toBeLessThanOrEqual(view.y + view.height)
    }
  })

  it('keeps every leader of an uncropped picture', () => {
    const picture = planPicture(core(), { width: 300 })
    expect(picture.nodes.filter((node) => node.key?.startsWith('leader:') === true)).toHaveLength(3)
  })
})
