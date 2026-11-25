// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { buildSteps } from '@ongrid/floorplan/geometry'
import { createPlayback } from '../../preview/playback'
import type { PlanBuild } from '../../preview/useBuildFrame'
import { fakeScheduler } from '../../preview/__tests__/fakeScheduler'
import { Canvas2D } from '../Canvas2D'
import { EMPTY, edit, house } from './fixtures'

/**
 * Task 4.1: the 2D view draws a build frame. jsdom shows no motion, so each
 * test stops the clock at a known point and reads what the frame put on the
 * page: partial paths, opacities, offsets.
 */

beforeAll(() => {
  class ImmediateResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width: 800, height: 600 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver
      )
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ImmediateResizeObserver as unknown as typeof ResizeObserver
})

afterEach(cleanup)

function playing(prev: FloorPlan, next: FloorPlan) {
  const time = fakeScheduler(act)
  const clock = createPlayback<PlanBuild>(time.scheduler)
  const view = render(<Canvas2D floorPlan={next} build={clock} />)
  act(() => clock.play({ prev, next, steps: buildSteps(prev, next) }))

  /** Runs the clock until `id`'s step is in flight with `t` past `at`. */
  const stopAt = (id: string, at = 0.5) =>
    time.until(() =>
      clock.getSnapshot().inFlight.some((f) => f.step.id === id && f.t >= at)
    )
  const tOf = (id: string) => clock.getSnapshot().inFlight.find((f) => f.step.id === id)!.t

  return { ...view, clock, time, stopAt, tOf }
}

const parts = (container: HTMLElement, selector: string) =>
  Array.from(container.querySelectorAll<SVGElement>(selector))

/** The x and y (model, so y flipped back) of every point in a path. */
function points(d: string): { x: number; y: number }[] {
  return Array.from(d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g), (m) => ({
    x: Number(m[1]),
    y: -Number(m[2])
  }))
}

const opacity = (el: Element | null) => Number(el?.getAttribute('opacity') ?? '1')

describe('Canvas2D plays a build', () => {
  it('traces a new wall from its start, before the next one appears', () => {
    const { container, stopAt } = playing(EMPTY, house())
    stopAt('w1', 0.5)

    const w1 = parts(container, '[data-part="wall"][data-id="w1"]')
    expect(w1.length).toBeGreaterThan(0)
    const xs = w1.flatMap((path) => points(path.getAttribute('d')!).map((p) => p.x))
    // w1 runs from x = 0 to x = 6: half way, it reaches neither end's far side.
    expect(Math.min(...xs)).toBeCloseTo(0)
    expect(Math.max(...xs)).toBeLessThan(6)
    expect(Math.max(...xs)).toBeGreaterThan(1)

    expect(container.querySelector('[data-id="w3"]')).toBeNull()
    expect(container.querySelector('[data-id="o1"]')).toBeNull()
    expect(container.querySelector('[data-id="r1"]')).toBeNull()
  })

  it('opens a door from its centre', () => {
    const { container, stopAt } = playing(EMPTY, house())
    stopAt('o1', 0.4)

    const door = container.querySelector('[data-part="opening"][data-id="o1"]')!
    const xs = points(door.getAttribute('d')!).map((p) => p.x)
    // The door spans 1 → 1.9 when open, centred on 1.45.
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.9)
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(1.45)
    // The rest of the gap is still wall, so the wall parts from the centre.
    expect(container.querySelectorAll('[data-part="wall"][data-closing]').length).toBe(2)
  })

  it('fades a room in, its fill first', () => {
    const { container, stopAt } = playing(EMPTY, house())
    stopAt('r1', 0.3)

    const fill = opacity(container.querySelector('[data-part="room"][data-id="r1"]'))
    expect(fill).toBeGreaterThan(0)
    expect(fill).toBeLessThan(1)
    // r2 has not started.
    expect(container.querySelector('[data-id="r2"]')).toBeNull()
  })

  it('slides a moved wall from where it was', () => {
    const next = edit((plan) => {
      const w5 = plan.walls.find((w) => w.id === 'w5')!
      w5.start = [4, 0]
      w5.end = [4, 4]
    })
    const { container, stopAt, tOf, clock } = playing(house(), next)
    stopAt('w5', 0.5)

    const group = container.querySelector('g[data-moving="w5"]')!
    const match = /translate\((-?[\d.e-]+)[ ,]+(-?[\d.e-]+)\)/.exec(group.getAttribute('transform')!)!
    // Drawn at its new place, shifted back by what is left of the move.
    expect(Number(match[1])).toBeCloseTo(-(1 - tOf('w5')), 1)
    expect(Number(match[2])).toBeCloseTo(0)

    act(() => clock.finish())
    expect(container.querySelector('g[data-moving]')).toBeNull()
  })

  it('fades a removed wall out from the old plan', () => {
    const next = edit((plan) => {
      plan.walls = plan.walls.filter((w) => w.id !== 'w5')
      plan.openings = plan.openings.filter((o) => o.wall !== 'w5')
      plan.rooms = [{ id: 'r1', name: 'Living', boundary: ['w1', 'w2', 'w3', 'w4'] }]
    })
    const { container, stopAt, clock } = playing(house(), next)
    stopAt('w5', 0.4)

    const leaving = parts(container, '[data-leaving] [data-id="w5"], [data-leaving][data-id="w5"]')
    expect(leaving.length).toBeGreaterThan(0)
    const layer = container.querySelector('[data-leaving]')!
    expect(opacity(layer.closest('[opacity]'))).toBeLessThan(1)

    act(() => clock.finish())
    expect(container.querySelector('[data-leaving]')).toBeNull()
    expect(container.querySelector('[data-id="w5"]')).toBeNull()
  })

  it('hides changed dimensions until the dimensions step', () => {
    const { container, stopAt, clock } = playing(EMPTY, house())
    stopAt('r2', 0.5)
    expect(container.querySelectorAll('[data-part="dimension"]').length).toBe(0)

    act(() => clock.finish())
    // SHT-4: the chains outside (3 openings below, then the walls: VEW-22 marks the thin
    // partition at its centre line, one wall size fewer on each of the two sides it meets), an overall size on
    // each side, and the two rooms' widths and depths.
    expect(container.querySelectorAll('[data-part="dimension"]').length).toBe(25)
  })

  it('never hides a dimension that did not change', () => {
    const next = edit((plan) => {
      plan.openings.push({
        id: 'o3',
        wall: 'w2',
        type: 'window',
        offset: 1,
        width: 1.2,
        height: 1.2,
        sill: 0.9
      })
    })
    const { container, stopAt } = playing(house(), next)
    stopAt('o3', 0.1)
    const dims = parts(container, '[data-part="dimension"]')
    // SHT-4: the window starts a chain of openings on the right, which pushes that side's walls
    // chain (3) and overall size out: those 4 move, so they wait with the 3 new ones.
    expect(dims.length).toBe(21)
    for (const dim of dims) expect(opacity(dim)).toBe(1)
  })

  it('ends on exactly what the plan draws on its own', () => {
    const next = house()
    const live = playing(EMPTY, next)
    act(() => live.clock.finish())
    const still = render(<Canvas2D floorPlan={next} />)

    const drawn = (root: HTMLElement) =>
      parts(root, '[data-part]:not([data-part="pulse"])').map((el) => el.outerHTML)
    expect(drawn(live.container)).toEqual(drawn(still.container))
  })
})
