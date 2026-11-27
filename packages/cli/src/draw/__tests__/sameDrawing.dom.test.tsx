// @vitest-environment jsdom
/**
 * VEW-1: the app's 2D view and `grid draw` draw a plan with one function, `planScene` in
 * `@ongrid/viewer`. For the same plan, size and look, the SVG `grid draw` writes holds, byte
 * for byte, what the app's `<svg>` holds: the file only adds its own root and a sheet of paper.
 *
 * The app is the real `Canvas2D`, rendered in jsdom. The command's side is `drawFile`, the
 * function `grid draw` calls, and `drawPlan`, the one it calls in turn, at the size the command
 * draws (1200 pixels wide, as tall as the plan's shape asks). The plans are the buildings in
 * `packages/floorplan/fixtures/`, in each named look as a file draws it: a file is always on
 * light paper (`fileLookOf`), and ends with the label, which the app shows in its own frame.
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { Canvas2D } from '@ongrid/viewer/src/canvas2d/Canvas2D'
import { installResizeObserver, type ResizeController } from '@ongrid/viewer/src/canvas2d/__tests__/canvas-test-utils'
import { fileLookOf, LOOK_NAMES, pictureView, type LookName } from '@ongrid/viewer/src/picture'
import { drawFile } from '../../command/draw'
import { drawPlan } from '../drawPlan'

const FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const BUILDINGS = readdirSync(FIXTURES)
  .filter((name) => name.endsWith('.json'))
  .sort()

const building = (name: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')))

let resize: ResizeController
beforeAll(() => {
  resize = installResizeObserver()
})
afterEach(cleanup)

/** What the app's 2D view draws inside its `<svg>`, at the size `grid draw` draws the plan. */
function appDrawing(plan: FloorPlan, look: LookName): { inner: string; viewBox: string | null } {
  const { width, height } = pictureView(plan)
  resize.set(width, height)
  const { container } = render(<Canvas2D floorPlan={plan} look={fileLookOf(look)} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no canvas drawn')
  return { inner: svg.innerHTML, viewBox: svg.getAttribute('viewBox') }
}

// Every picture file puts the plan in its own frame above its key and the label's caption band
// (MSG-3, VEW-17), which the app shows in its own frame instead: that frame holds the app's drawing.
const FRAMED = /<svg x="0" y="0" ([^>]*)>([\s\S]*)<\/svg>(?:<g data-part="key"|<g data-part="guidance-label")/
const LABEL = /<g data-part="guidance-label"[^>]*>(?:(?!<\/g>)[\s\S])*<\/g><\/svg>\n$/

// VEW-76: the looks for people are pictures only, which the app's screen does not draw.
const CASES = BUILDINGS.flatMap((name) => LOOK_NAMES.filter((look) => look !== 'simple' && look !== 'large').map((look) => [name, look] as const))

describe('the app and grid draw draw the same SVG', () => {
  it('has the buildings to compare', () => {
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(8)
  })

  it.each(CASES)('for %s in the %s look', async (name, look) => {
    const app = appDrawing(building(name), look)
    const file = await drawPlan(building(name), { format: 'svg', look })

    // Make sure there is something to compare.
    expect(app.inner.length).toBeGreaterThan(1000)
    const framed = FRAMED.exec(file)
    expect(framed, 'the plan in its own frame above the key and the caption').not.toBeNull()
    expect(framed![1]).toContain(`viewBox="${app.viewBox}"`)
    expect(framed![2]).toBe(app.inner)
    expect(file, 'the file ends with the label').toMatch(LABEL)
  })

  it('through the function grid draw calls, with what went wrong, where the floor drawn has nothing to mark', async () => {
    // `drawFile` marks the result record's lines on the drawing and lists them under it (MSG-8);
    // the app marks none. On a floor with none of them, the drawing is the app's, byte for byte.
    let compared = 0
    for (const name of BUILDINGS) {
      const plan = building(name)
      const loaded = { file: name, plan, issues: [], broken: new Set<string>() }
      const file = String((await drawFile(loaded, { png: false }, 1)).file)
      const app = appDrawing(plan, 'technical')
      // The plan sits in its own frame above the key and the caption.
      const drawing = FRAMED.exec(file)?.[2]
      expect(drawing, name).toBeDefined()
      if (/data-part="(fault-mark|undrawn)/.test(drawing!)) continue
      expect(drawing, name).toBe(app.inner)
      compared += 1
    }
    expect(compared, 'buildings with no mark on the floor drawn').toBeGreaterThan(0)
  })
})
