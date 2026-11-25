/**
 * VEW-26: a floor far longer than it is wide is drawn in pieces along its length, each at a
 * readable scale; a house is drawn whole.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { house } from '../../canvas2d/__tests__/fixtures'
import { pictureFrame, pictureTiles, pictureView, TILE_PX_PER_METRE } from '../planSvg'

/** A row of `count` rooms, each `size` by 15 m, along x (or up y). */
function strip(count: number, size: number, upward = false): FloorPlan {
  const at = (a: number, b: number): [number, number] => (upward ? [b, a] : [a, b])
  const walls = [
    { id: 'long-a', start: at(0, 0), end: at(count * size, 0) },
    { id: 'long-b', start: at(0, 15), end: at(count * size, 15) },
    ...Array.from({ length: count + 1 }, (_, i) => ({ id: `cross-${i}`, start: at(i * size, 0), end: at(i * size, 15) })),
  ].map((w) => ({ ...w, thickness: 0.3, height: 3, kind: 'exterior' }))
  const rooms = Array.from({ length: count }, (_, i) => ({ id: `r${i}`, name: `Hall ${i}`, boundary: ['long-a', `cross-${i + 1}`, 'long-b', `cross-${i}`], use: 'office' }))
  return parseFloorPlan({ version: '1', units: 'm', walls, rooms, openings: [] })
}

describe('a long floor in pieces (VEW-26)', () => {
  it('draws a house whole', () => {
    expect(pictureTiles(house())).toEqual([])
  })

  it('splits a floor of 800 m by 15 m into pieces that cover it, overlap and read at the scale', () => {
    const plan = strip(40, 20)
    const whole = pictureFrame(plan)
    const tiles = pictureTiles(plan)
    expect(tiles.length).toBeGreaterThan(5)
    expect(tiles[0]!.min.x).toBeCloseTo(whole.min.x, 6)
    expect(tiles.at(-1)!.max.x).toBeCloseTo(whole.max.x, 6)
    for (let i = 1; i < tiles.length; i++) expect(tiles[i]!.min.x).toBeLessThan(tiles[i - 1]!.max.x)
    for (const tile of tiles) {
      expect(tile.min.y).toBeCloseTo(whole.min.y, 6)
      expect(tile.max.y).toBeCloseTo(whole.max.y, 6)
      const view = pictureView(plan, { frame: tile })
      expect(view.width / view.view.width).toBeGreaterThanOrEqual(TILE_PX_PER_METRE)
    }
    const drawnWhole = pictureView(plan)
    expect(drawnWhole.width / drawnWhole.view.width).toBeLessThan(TILE_PX_PER_METRE / 4)
  })

  it('splits a floor that runs up the drawing from its top down', () => {
    const plan = strip(40, 20, true)
    const tiles = pictureTiles(plan)
    expect(tiles.length).toBeGreaterThan(1)
    expect(tiles[0]!.max.y).toBeGreaterThan(tiles[1]!.max.y)
  })

  it('draws a short strip whole, read at the scale already', () => {
    expect(pictureTiles(strip(4, 10))).toEqual([])
  })
})
