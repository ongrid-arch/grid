import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { buildFloorPlan, buildScene } from '@ongrid/floorplan/geometry'
import { planToSvg } from '../planSvg'
import { placeRoomLabels } from '../../canvas2d/labelPlacement'
import { floorSlabGeometry } from '../../canvas3d/Slab3D'

/**
 * ARE-6: a ring gallery round a courtyard, drawn. The room is one path, its outline and its
 * hole, and its name and area go on the gallery's floor, never in the courtyard (lab AR-5:
 * drawn as two halves, each half's label landed in the courtyard).
 */

const ring = (): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/ring-gallery.json'), 'utf8')))

/** The courtyard, to the faces of its walls. */
const inCourtyard = (x: number, y: number): boolean => x > 2.85 && x < 7.15 && y > 2.85 && y < 7.15

describe('a room with a hole in a picture', () => {
  it('draws the room as one path of two loops, the hole the other way round', () => {
    const svg = planToSvg(ring())
    const rooms = [...svg.matchAll(/<path [^>]*data-part="room"[^>]*>/g)].map((m) => m[0])
    expect(rooms).toHaveLength(1)
    const d = /d="([^"]+)"/.exec(rooms[0]!)![1]!
    const loops = d.split('Z').filter((loop) => loop.length > 0)
    expect(loops).toHaveLength(2)
    // Shoelace in screen coordinates: the two loops wind opposite ways, so the hole is open
    // under the default fill rule.
    const signed = loops.map((loop) => {
      const points = loop.replace(/^M/, '').split('L').map((pair) => pair.split(',').map(Number) as [number, number])
      return points.reduce((sum, [x, y], i) => {
        const [u, v] = points[(i + 1) % points.length]!
        return sum + x * v - u * y
      }, 0) / 2
    })
    expect(Math.sign(signed[0]!)).toBe(-Math.sign(signed[1]!))
    expect(Math.abs(signed[0]!)).toBeCloseTo(94.09, 3)
    expect(Math.abs(signed[1]!)).toBeCloseTo(18.49, 3)
  })

  it('puts the label in the gallery, with the area less the courtyard', () => {
    const drawing = buildFloorPlan(ring())
    const room = drawing.rooms[0]!
    for (const mpp of [1 / 20, 1 / 70, 1 / 200]) {
      const [placed] = placeRoomLabels(
        [{ id: room.id, polygon: room.polygon, holes: room.holes, name: room.name, areaText: '75.60 m²' }],
        { swings: [], walls: [], dimensions: [] },
        mpp
      )
      expect(placed).not.toBeNull()
      const { box } = placed!
      // The whole label box is clear of the courtyard.
      const clear = box.maxX <= 2.85 || box.minX >= 7.15 || box.maxY <= 2.85 || box.minY >= 7.15
      expect(clear, `at ${mpp}`).toBe(true)
    }
    const svg = planToSvg(ring())
    expect(svg).toContain('75.60')
    const label = /<g transform="translate\(([-\d.]+) ([-\d.]+)\)[^>]*><text data-part="label"/.exec(svg)!
    expect(inCourtyard(Number(label[1]), -Number(label[2]))).toBe(false)
  })

  it('leaves the courtyard open in the 3D slab', () => {
    const slab = buildScene(ring()).slabs[0]!
    const geometry = floorSlabGeometry(slab)
    const position = geometry.getAttribute('position')
    // Three's frame: the plan's y is −z. No vertex of the slab lies inside the courtyard.
    for (let i = 0; i < position.count; i++) {
      expect(inCourtyard(position.getX(i), -position.getZ(i))).toBe(false)
    }
    geometry.dispose()
  })
})
