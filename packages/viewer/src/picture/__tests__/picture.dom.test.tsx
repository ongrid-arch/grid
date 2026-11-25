// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { Canvas2D } from '../../canvas2d/Canvas2D'
import { installResizeObserver, mixedPlan } from '../../canvas2d/__tests__/canvas-test-utils'
import { edit, house } from '../../canvas2d/__tests__/fixtures'
import { DARK_LOOK, LIGHT_LOOK } from '../look'
import { planPicture, planToSvg } from '../planSvg'
import { toSvg } from '../svgNode'

/**
 * The app's 2D view and a picture of the plan are the same drawing: for the same plan, size
 * and look, what the view draws inside its `<svg>` is, byte for byte, what the picture
 * function writes inside its own. The picture only adds its root and a sheet of paper.
 */

const WIDTH = 800
const HEIGHT = 600

beforeAll(() => {
  installResizeObserver().set(WIDTH, HEIGHT)
})

afterEach(cleanup)

/** The front door hangs on its start jamb and swings into a short wall. */
const blockedDoor = (): FloorPlan =>
  edit((plan) => {
    Object.assign(plan.openings.find((o) => o.id === 'o1')!, { hinge: 'start', swing: 'left' })
    plan.walls.push({ id: 'w6', start: [1.5, 0.1], end: [1.5, 1], thickness: 0.1, height: 2.7, kind: 'partition' })
  })

/** Room names a browser and an SVG file both have to escape. */
const awkwardNames = (): FloorPlan => {
  const plan = mixedPlan()
  plan.rooms[0]!.name = 'Kitchen & "dining" <open>'
  plan.rooms[1]!.name = "Study's nook > 2 m²"
  return plan
}

/** A closet too small for its label: the label is the room's number (VEW-13). */
const closet = (): FloorPlan =>
  edit((plan) => {
    plan.walls.push(
      { id: 'c1', start: [0.1, 3.9], end: [0.6, 3.9], thickness: 0.05, height: 2.7, kind: 'partition' },
      { id: 'c2', start: [0.6, 3.9], end: [0.6, 3.4], thickness: 0.05, height: 2.7, kind: 'partition' },
      { id: 'c3', start: [0.6, 3.4], end: [0.1, 3.4], thickness: 0.05, height: 2.7, kind: 'partition' },
      { id: 'c4', start: [0.1, 3.4], end: [0.1, 3.9], thickness: 0.05, height: 2.7, kind: 'partition' }
    )
    plan.rooms.push({ id: 'closet', name: 'Linen closet', boundary: ['c1', 'c2', 'c3', 'c4'] })
  })

const PLANS: [string, () => FloorPlan][] = [
  ['the mixed fixture plan', mixedPlan],
  ['the house fixture plan', house],
  ['a door with its swing drawn and a sweep warning', blockedDoor],
  ['room names with characters to escape', awkwardNames],
  ['a room too small for its label', closet]
]

function appSvg(plan: FloorPlan, props: Partial<Parameters<typeof Canvas2D>[0]> = {}): SVGSVGElement {
  const { container } = render(<Canvas2D floorPlan={plan} {...props} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no canvas drawn')
  return svg
}

describe('the app and the picture draw the same SVG', () => {
  it.each(PLANS)('for %s', (_name, make) => {
    const svg = appSvg(make())
    const picture = planPicture(make(), { width: WIDTH, height: HEIGHT })
    const drawn = toSvg(picture.nodes)

    // Make sure there is something to compare.
    expect(svg.querySelectorAll('[data-part]').length).toBeGreaterThan(10)
    expect(svg.innerHTML).toBe(drawn)

    const file = planToSvg(make(), { width: WIDTH, height: HEIGHT })
    expect(file).toContain(drawn)
    // MSG-3, VEW-17: the file adds the label after the drawing, in a caption band under it, and nothing else.
    // VEW-13: and the room key under the drawing, when a room is written as its number.
    expect(file.slice(file.indexOf(drawn) + drawn.length)).toMatch(/^<\/svg>(<g data-part="key"[^]*)?<g data-part="guidance-label"[^]*General guidance, not your local rules<\/text><\/g><\/svg>\n$/)
    expect(file).toContain(`viewBox="${svg.getAttribute('viewBox')}"`)
  })

  it('draws the door symbol and the warning mark it compares', () => {
    const svg = appSvg(blockedDoor())
    expect(svg.querySelector("[data-part='door-symbol']")).not.toBeNull()
    expect(svg.querySelector("[data-part='door-warning']")).not.toBeNull()
  })

  it('for another look', () => {
    const svg = appSvg(house(), { look: DARK_LOOK })
    expect(svg.innerHTML).toBe(toSvg(planPicture(house(), { width: WIDTH, height: HEIGHT, look: 'dark' }).nodes))
    expect(svg.innerHTML).toContain(`fill="${DARK_LOOK.room}"`)
  })

  it('without dimensions', () => {
    const svg = appSvg(house(), { showDimensions: false })
    const picture = planPicture(house(), { width: WIDTH, height: HEIGHT, showDimensions: false })
    expect(svg.innerHTML).toBe(toSvg(picture.nodes))
    expect(svg.querySelector("[data-part='dimension']")).toBeNull()
  })

  it('for a floor that is not the lowest', () => {
    const plan: FloorPlan = {
      ...mixedPlan(),
      floors: [
        { id: 'ground', name: 'Ground', level: 0 },
        { id: 'first', name: 'First', level: 1 }
      ]
    } as FloorPlan
    plan.walls = plan.walls.map((wall) => (['w5', 'w6', 'w7', 'w8'].includes(wall.id) ? { ...wall, floor: 'first' } : wall))
    plan.rooms = plan.rooms.map((room) => (room.id === 'r2' ? { ...room, floor: 'first' } : room))
    const svg = appSvg(plan, { floor: 'first' })
    const picture = planPicture(plan, { width: WIDTH, height: HEIGHT, floor: 'first' })
    expect(picture.rooms).toBe(1)
    expect(svg.innerHTML).toBe(toSvg(picture.nodes))
  })

  it('writes a room too small for its name as its number, in the room, with no leader (VEW-13)', () => {
    const svg = appSvg(closet())
    expect(svg.querySelector("[data-part='label-leader']")).toBeNull()
    const keyed = svg.querySelector('[data-keyed]')
    expect(keyed?.getAttribute('data-name')).toBe('Linen closet')
  })

  it('with room tags in capitals, numbered, and areas rounded', () => {
    const labels = { upperCase: true, numbered: true, areaDecimals: 0 } as const
    const svg = appSvg(house(), { labels })
    expect(svg.innerHTML).toBe(toSvg(planPicture(house(), { width: WIDTH, height: HEIGHT, labels }).nodes))
    const names = [...svg.querySelectorAll("[data-part='label']")].map((node) => node.textContent)
    expect(names).toEqual(['1 LIVING', '2 KITCHEN'])
    expect(svg.querySelector("[data-part='area']")?.textContent).toBe('11 m²')
  })

  it('gives the app the light paint by default', () => {
    const svg = appSvg(mixedPlan())
    const room = svg.querySelector("[data-part='room']")!
    expect(room.getAttribute('fill')).toBe(LIGHT_LOOK.room)
  })
})
