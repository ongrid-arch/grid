import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { CAPTION_PX, DARK_LOOK, LIGHT_LOOK, fileHeight, planPicture, planToSvg } from '@ongrid/viewer/src/picture'
import { drawPlan } from '../drawPlan'
import { twoBedFlat } from './twoBedFlat'

/**
 * Pictures of a plan from a plain function call, in plain Node: no browser, no app.
 */

const dir = mkdtempSync(join(tmpdir(), 'grid-draw-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from a PNG's header. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** The colour of one pixel of a PNG, as `#rrggbb`. */
async function pixelAt(bytes: Uint8Array, x: number, y: number): Promise<string> {
  const image = await loadImage(Buffer.from(bytes))
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data
  return `#${[r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('')}`
}

/** Where a plan point (metres, y up) lands in the picture, in pixels. */
function pixelOf(plan: FloorPlan, x: number, y: number): { x: number; y: number } {
  const { view, width, height } = planPicture(plan)
  return { x: ((x - view.x) / view.width) * width, y: ((-y - view.y) / view.height) * height }
}

describe('drawPlan', () => {
  it('runs without a browser', () => {
    expect('document' in globalThis).toBe(false)
    expect('window' in globalThis).toBe(false)
  })

  it('writes an SVG file', async () => {
    const svg = await drawPlan(twoBedFlat(), { format: 'svg' })
    const file = join(dir, 'plan.svg')
    writeFileSync(file, svg)
    const written = readFileSync(file, 'utf8')
    expect(written).toBe(planToSvg(twoBedFlat()))
    expect(written).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /)
    for (const name of ['Bedroom 1', 'Bedroom 2', 'Bathroom', 'Kitchen', 'Living room']) {
      expect(written).toContain(`>${name}</text>`)
    }
  })

  it('writes a PNG file the size of the picture', async () => {
    const png = await drawPlan(twoBedFlat(), { format: 'png' })
    const file = join(dir, 'plan.png')
    writeFileSync(file, png)
    const written = new Uint8Array(readFileSync(file))
    expect([...written.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    const picture = planPicture(twoBedFlat())
    // VEW-17: the caption band with the label is under the picture.
    expect(pngSize(written)).toEqual({ width: picture.width, height: fileHeight(picture) })
  })

  it('draws the plan in the PNG: paper, room and wall in their colours', async () => {
    const plan = twoBedFlat()
    const png = await drawPlan(plan, { format: 'png' })
    // A corner of the picture, outside the plan and its dimensions.
    expect(await pixelAt(png, 2, 2)).toBe(LIGHT_LOOK.paper)
    // Inside Bedroom 2, clear of its label and dimension lines.
    const room = pixelOf(plan, 0.6, 0.6)
    expect(await pixelAt(png, room.x, room.y)).toBe(LIGHT_LOOK.room)
    // The middle of the solid west wall, which faces the outside.
    const wall = pixelOf(plan, 0, 2)
    expect(await pixelAt(png, wall.x, wall.y)).toBe(LIGHT_LOOK.wallExterior)
  })

  it('draws a sharper PNG at a scale, with the same drawing', async () => {
    const plan = twoBedFlat()
    const png = await drawPlan(plan, { format: 'png', scale: 2 })
    const picture = planPicture(plan)
    expect(pngSize(png)).toEqual({ width: picture.width * 2, height: fileHeight(picture) * 2 })
    const room = pixelOf(plan, 0.6, 0.6)
    expect(await pixelAt(png, room.x * 2, room.y * 2)).toBe(LIGHT_LOOK.room)
  })

  it('takes the picture options: size, look, dimensions', async () => {
    const png = await drawPlan(twoBedFlat(), { format: 'png', width: 640, height: 480, look: 'technical' })
    expect(pngSize(png)).toEqual({ width: 640, height: 480 + CAPTION_PX })
    expect(await pixelAt(png, 2, 2)).toBe('#ffffff')
    expect(await drawPlan(twoBedFlat(), { format: 'svg', look: 'technical', showDimensions: false })).toBe(
      planToSvg(twoBedFlat(), { look: 'technical', showDimensions: false })
    )
  })

  it('draws a file on light paper whatever look it is asked for: dark draws the working look (SHT-10)', async () => {
    const png = await drawPlan(twoBedFlat(), { format: 'png', width: 640, height: 480, look: 'dark' })
    expect(await pixelAt(png, 2, 2)).toBe(LIGHT_LOOK.paper)
    expect(await pixelAt(png, 2, 2)).not.toBe(DARK_LOOK.paper)
    expect(await drawPlan(twoBedFlat(), { format: 'svg', look: 'dark' })).toBe(await drawPlan(twoBedFlat(), { format: 'svg', look: 'working' }))
    expect(await drawPlan(twoBedFlat(), { format: 'svg', look: DARK_LOOK })).toBe(await drawPlan(twoBedFlat(), { format: 'svg', look: 'working' }))
  })

  it('refuses a format or a scale it cannot draw', async () => {
    await expect(drawPlan(twoBedFlat(), { format: 'jpeg' as 'png' })).rejects.toThrow(RangeError)
    await expect(drawPlan(twoBedFlat(), { format: 'png', scale: 0 })).rejects.toThrow(RangeError)
    await expect(drawPlan(twoBedFlat(), { format: 'png', scale: Number.NaN })).rejects.toThrow(RangeError)
  })

  it('takes under a second a picture for a typical plan', async () => {
    for (const format of ['svg', 'png'] as const) {
      const start = performance.now()
      await drawPlan(twoBedFlat(), { format })
      expect(performance.now() - start, format).toBeLessThan(1000)
    }
  })
})
