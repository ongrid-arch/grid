/**
 * SHT-25: a sheet of an office block of a few hundred walls over two floors. The plan a sheet is
 * made from is frozen, so what the geometry works out from it (the envelope, each facade and
 * section) is worked out once for the whole sheet; the sheet it gives is the same, byte for byte,
 * as from the same plan not frozen. Each page reports when it is done, and its preview places the
 * page's pictures without drawing them again.
 *
 * The time is printed; the guard is generous, to catch a sheet that has become far slower rather
 * than a busy machine.
 */
import { describe, expect, it } from 'vitest'
import { deepFreeze } from '@ongrid/floorplan/geometry/kept'
import type { LoadedPlan } from '../../command/plan'
import { officeBlock } from '../../draw/__tests__/officeBlock'
import { sheetPages, type SheetLayout } from '../pages'
import { sheetPdf } from '../pdf'

const GUARD_MS = 30_000
const date = new Date('2026-11-27T12:00:00Z')

const frozen = (loaded: LoadedPlan): LoadedPlan => ({ ...loaded, plan: deepFreeze(loaded.plan) })

async function made(loaded: LoadedPlan, layout: SheetLayout, previews: boolean) {
  const reports: [number, number][] = []
  const start = performance.now()
  const sheet = sheetPages(loaded, null, layout, { name: 'block', date })
  const out = await sheetPdf(loaded.plan, sheet, { previews, onPage: (done, total) => reports.push([done, total]) })
  return { ...out, reports, ms: performance.now() - start }
}

describe('a sheet of an office block of a few hundred walls (SHT-25)', () => {
  it('is made within the guard, page by page, and is the same from a frozen plan as from one not frozen', async () => {
    const block = officeBlock(2)
    expect(block.plan.walls.length).toBeGreaterThanOrEqual(300)
    const check = await made(frozen(block), 'check', true)
    const client = await made(frozen(officeBlock(2)), 'client', true)
    console.log(`SHT-25 sheet times, ${block.plan.walls.length} walls over 2 floors: check ${check.ms.toFixed(0)} ms (${check.sheet.pages.length} pages), client ${client.ms.toFixed(0)} ms (${client.sheet.pages.length} pages), previews included`)
    expect(check.ms).toBeLessThan(GUARD_MS)
    expect(client.ms).toBeLessThan(GUARD_MS)

    for (const sheet of [check, client]) {
      const total = sheet.sheet.pages.length
      expect(sheet.reports).toEqual(Array.from({ length: total }, (_, i) => [i + 1, total]))
      expect(sheet.previews).toHaveLength(total)
    }

    // Not frozen, nothing is kept: every drawing is worked out afresh, and the sheet is the same.
    const open = await made(officeBlock(2), 'check', false)
    expect(Buffer.from(open.pdf).equals(Buffer.from(check.pdf))).toBe(true)
  }, 300_000)
})
