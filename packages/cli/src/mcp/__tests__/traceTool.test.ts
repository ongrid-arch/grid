/**
 * VEW-67: the trace image set, placed, scaled and turned through `grid_place_trace` and
 * `grid edit trace`, and drawn under the plan in the preview's own drawing. The house is
 * 9 × 10 m to its outside faces, from 0,0 to 9,10; its scan is 900 × 1000 px at 1 cm a pixel.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tracePixelToPlan, traceScale } from '@ongrid/floorplan/geometry'
import { loadCanvas } from '../../draw/canvas'
import { pinnedPlacement } from '../../edit/trace'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living" living 8.4 x 9.4 at 0.3,0.3', 'door front in living south, centred, 0.9 wide, opens in']

let b: Bench
const image = (name: string): Record<string, unknown> | undefined => (JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>)['referenceImage'] as Record<string, unknown> | undefined
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
async function refused(args: Record<string, unknown>, words: string): Promise<void> {
  const reply = await b.call('grid_place_trace', { plan: 'house.json', out: 'never.json', ...args })
  expect(reply.isError, reply.text).toBe(true)
  expect(reply.text).toContain(words)
}

beforeAll(async () => {
  b = bench({})
  await ok('grid_write_rooms', { plan: 'house.json', rooms: HOUSE.join('\n') })
  const { createCanvas } = await loadCanvas()
  const canvas = createCanvas(900, 1000)
  canvas.getContext('2d').fillRect(0, 0, 900, 1000)
  writeFileSync(join(b.folder, 'scan.png'), canvas.toBuffer('image/png'))
})
afterAll(() => b.close())

describe('grid_place_trace', () => {
  it('sets the picture and its scale from a scale bar, and answers with where it lies', async () => {
    const reply = await ok('grid_place_trace', { plan: 'house.json', image: 'scan.png', calibrate_from: '100,950', calibrate_to: '600,950', length: 5, at: '0,10', out: 'traced.json' })
    expect(image('traced.json')).toEqual({ path: 'scan.png', at: [0, 10], calibration: { from: [100, 950], to: [600, 950], length: 5 } })
    expect(reply.text).toContain('The trace image "scan.png", 900 × 1000 px, is drawn under the plan, 1 px = 0.01 m, set from two points on it 500 px apart that are 5 m apart on the building.')
    expect(reply.data?.['referenceImage']).toMatchObject({ path: 'scan.png' })
    expect(String(reply.data?.['trace'])).toContain('is drawn under the plan')
  })

  it('keeps what a call does not give, and turns, scales and moves it', async () => {
    await ok('grid_place_trace', { plan: 'traced.json', rotation: 90, opacity: 0.6, out: 'turned.json' })
    expect(image('turned.json')).toEqual({ path: 'scan.png', at: [0, 10], rotation: 90, opacity: 0.6, calibration: { from: [100, 950], to: [600, 950], length: 5 } })
    // A stated scale takes the calibration's place, as the schema allows one.
    await ok('grid_place_trace', { plan: 'turned.json', scale: 0.02, at: '1,2', out: 'scaled.json' })
    expect(image('scaled.json')).toEqual({ path: 'scan.png', at: [1, 2], rotation: 90, opacity: 0.6, scale: 0.02 })
  })

  it('lines it up by two pixels pinned to two points of the plan', async () => {
    // The scan's corners (0, 0) and (900, 1000) show the house's (0, 10) and (9, 0).
    const reply = await ok('grid_place_trace', { plan: 'traced.json', pin_pixels: ['0,0', '900,1000'], pin_points: ['0,10', '9,0'], out: 'pinned.json' })
    const placed = image('pinned.json')!
    expect(placed['calibration']).toBeUndefined()
    expect(placed['scale']).toBeCloseTo(0.01, 12)
    expect(placed['rotation']).toBe(0)
    expect((placed['at'] as number[])[0]).toBeCloseTo(0, 9)
    expect((placed['at'] as number[])[1]).toBeCloseTo(10, 9)
    expect(reply.text).toContain('Pinned pixel (0, 0) to (0, 10) and pixel (900, 1000) to (9, 0): 1 px = 0.01 m, turned 0°')
  })

  it('works a pin out for a picture turned and scaled, pixel to point', () => {
    for (const rotation of [0, 30, -135, 180]) {
      const at = { x: 3, y: -2 }
      const scale = { metresPerPixel: 0.025, from: 'scale' as const }
      const pixels = [[40, 70], [800, 310]] as const
      const points = pixels.map(([u, v]) => tracePixelToPlan({ at, rotation, scale }, { x: u, y: v })).map((p) => [p.x, p.y] as const)
      const pinned = pinnedPlacement(pixels, [points[0]!, points[1]!])
      expect(pinned.scale).toBeCloseTo(0.025, 12)
      expect(((pinned.rotation - rotation + 540) % 360) - 180).toBeCloseTo(0, 9)
      expect(pinned.at[0]).toBeCloseTo(3, 9)
      expect(pinned.at[1]).toBeCloseTo(-2, 9)
    }
    expect(traceScale({ scale: 0.5 }).metresPerPixel).toBe(0.5)
  })

  it('takes a PDF page, and refuses a page for a picture', async () => {
    await ok('grid_place_trace', { plan: 'traced.json', image: 'sheets/survey.pdf', page: 2, out: 'paged.json' })
    expect(image('paged.json')).toMatchObject({ path: 'sheets/survey.pdf', page: 2, at: [0, 10] })
    // Back to a picture, its page goes.
    await ok('grid_place_trace', { plan: 'paged.json', image: 'scan.png', out: 'unpaged.json' })
    expect(image('unpaged.json')!['page']).toBeUndefined()
    await refused({ plan: 'traced.json', page: 2 }, 'page names a page of a PDF')
  })

  it('takes it out, and refuses what would not be read', async () => {
    const reply = await ok('grid_place_trace', { plan: 'traced.json', remove: true, out: 'removed.json' })
    expect(image('removed.json')).toBeUndefined()
    expect(reply.text).toContain('Took the trace image out.')
    await refused({ remove: true }, 'The plan has no trace image to take out.')
    await refused({ rotation: 10 }, 'The plan has no trace image yet: give path')
    await refused({ image: 'notes.txt' }, '"notes.txt" does not end in .png, .jpg, .jpeg or .pdf')
    await refused({ image: '../outside.png' }, '"../outside.png"')
    await refused({ image: 'scan.png', calibrate_from: '1,1', length: 3 }, 'Give calibrate_from, calibrate_to and length together')
    await refused({ image: 'scan.png', calibrate_from: '1,1', calibrate_to: '1,1', length: 3 }, 'referenceImage.calibration.to is the same point as from')
    await refused({ image: 'scan.png', scale: 0.01, pin_pixels: ['0,0', '1,1'], pin_points: ['0,0', '1,1'] }, 'Give one way to scale it')
    await refused({ image: 'scan.png', pin_pixels: ['5,5', '5,5'], pin_points: ['0,0', '1,1'] }, 'pin_pixels are the same pixel')
    await refused({ image: 'scan.png', pin_pixels: ['0,0', '1,1'] }, 'Give pin_pixels and pin_points together')
    await refused({ image: 'scan.png', floor: 'roof' }, 'That floor is not in this plan.')
    await refused({ image: 'scan.png', calibrate_from: '1.5m,0', calibrate_to: '3,0', length: 1 }, 'calibrate_from takes u,v in the picture\'s pixels')
  })
})

describe('the trace image in the preview', () => {
  it('is drawn under the plan in the preview page\'s own drawing', async () => {
    const reply = await ok('grid_preview_sync', { plan: 'traced.json' })
    const svg = String((reply.data?.['drawing'] as { svg?: string }).svg)
    expect(svg).toContain('data-part="trace-image"')
    expect(svg).toContain('href="data:image/png;base64,')
    const plain = await ok('grid_preview_sync', { plan: 'house.json' })
    expect(String((plain.data?.['drawing'] as { svg?: string }).svg)).not.toContain('trace-image')
  })
})
