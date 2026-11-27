/**
 * SHT-25: a 1200 by 800 still and a plan picture of an office block of a few hundred walls, each
 * timed once the plan is read. The card asks for under two seconds each on a quiet machine.
 *
 * As in `pictureTime.test.ts`, the times are printed and the guard is generous (five times the
 * target), to catch a picture that has become far slower rather than a busy machine.
 */
import { describe, expect, it } from 'vitest'
import { deepFreeze } from '@ongrid/floorplan/geometry/kept'
import { drawPlan } from '../drawPlan'
import { drawStill } from '../drawStill'
import { officeBlock } from './officeBlock'

const TARGET_MS = 2_000
const GUARD_MS = 5 * TARGET_MS

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now()
  const value = await work()
  return { value, ms: performance.now() - start }
}

describe('pictures of an office block of a few hundred walls (SHT-25)', () => {
  const block = officeBlock(1)
  const plan = deepFreeze(block.plan)

  it('has a few hundred walls', () => {
    expect(plan.walls.length).toBeGreaterThanOrEqual(150)
  })

  it('draws a 1200 by 800 still and a plan picture, each within the guard', async () => {
    // The first of each loads the native canvas and warms the code: not what is timed.
    await drawStill(plan, { width: 120, height: 80 })
    await drawPlan(plan, { format: 'png', width: 200 })
    const still = await timed(() => drawStill(plan, { width: 1200, height: 800 }))
    const picture = await timed(() => drawPlan(plan, { format: 'png', width: 1200 }))
    console.log(`SHT-25 picture times, ${plan.walls.length} walls: still ${still.ms.toFixed(0)} ms, plan picture ${picture.ms.toFixed(0)} ms (target ${TARGET_MS} ms)`)
    expect(still.value.byteLength).toBeGreaterThan(0)
    expect(picture.value.byteLength).toBeGreaterThan(0)
    expect(still.ms).toBeLessThan(GUARD_MS)
    expect(picture.ms).toBeLessThan(GUARD_MS)
  }, 120_000)
})
