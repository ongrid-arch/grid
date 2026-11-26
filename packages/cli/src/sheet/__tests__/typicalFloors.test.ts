import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { SheetWords } from '@ongrid/floorplan/types/sheet'
import type { LoadedPlan } from '../../command/plan'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { sheetPages } from '../pages'

/** SHT-21: alike floors are printed once, as a typical floor, with an area schedule after them. */
const date = new Date('2026-11-26T12:00:00Z')

/** A tower: a lobby and the lift core on the ground floor, then `upper` alike office floors; `odd` has a meeting room in place of its core. */
function tower(upper: number, odd?: number): LoadedPlan {
  const lines = [
    'plan "Harbour Point"',
    'building office',
    'walls outside 0.3 inside 0.1 height 2.9',
    'floor l0 "Ground" level 0 elevation 0 height 3.5',
    'room lobby "Lobby" foyer 8 x 10 at 0,0',
    'room c0 "Core" lift 4 x 10 east of lobby',
    'door d0 between lobby and c0, centred, 0.9 wide',
    'door entry in lobby south, centred, 1.8 wide, opens out, hinged west',
  ]
  for (let n = 1; n <= upper; n++) {
    lines.push(`floor l${n} "Level ${n}" level ${n} elevation ${(3.9 + (n - 1) * 3.6).toFixed(2)} height 2.9`)
    lines.push(`room o${n} "Office" office 8 x 10 at 0,0`)
    lines.push(n === odd ? `room m${n} "Meeting" meeting 4 x 6 east of o${n}` : `room c${n} "Core" lift 4 x 10 east of o${n}`)
    lines.push(`door d${n} between o${n} and ${n === odd ? 'm' : 'c'}${n}, centred, 0.9 wide`)
  }
  const result = compileRoomsText(lines.join('\n') + '\n')
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  const { issues, broken } = validatePlan(plan)
  return { file: 'tower', plan, issues, broken }
}

const client = (loaded: LoadedPlan, words: SheetWords | null = null) => sheetPages(loaded, words, 'client', { name: 'tower', date })

describe('a tower of alike floors on a client sheet (SHT-21)', () => {
  const loaded = tower(9)
  const sheet = client(loaded)

  it('is a cover, the ground floor, one typical floor and the area schedule', () => {
    expect(sheet.pages.map((p) => p.kind)).toEqual(['cover', 'floor', 'floor', 'summary', 'summary'])
    expect(sheet.pages.map((p) => p.title)).toEqual(['tower', 'Ground', 'Typical floor', 'Area schedule', 'Area schedule'])
  })

  it('names the nine floors the typical floor stands for', () => {
    const page = sheet.pages[2]!
    expect(page.stands).toEqual(Array.from({ length: 9 }, (_, i) => `l${i + 1}`))
    expect(page.floor).toBe('l1')
    expect(page.subtitle).toBe(`Printed once for 9 floors: ${Array.from({ length: 9 }, (_, i) => `Level ${i + 1}`).join(', ')}`)
    expect(page.notes[0]).toMatch(/^The table is of one of these floors; the 9 floors together have [\d.]+ m² of net area\.$/)
  })

  it('still counts all ten floors on the cover', () => {
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'floors')!.value).toBe('10')
  })

  it('gives the area by floor page and by use, each adding up to the net area', () => {
    const net = planAreas(surveyPlan(loaded.plan)).net
    const [byFloor, byUse] = [sheet.pages[3]!.table!, sheet.pages[4]!.table!]
    expect(byFloor.rows.map((r) => r.name)).toEqual(['Ground', 'Typical floor × 9'])
    expect(byUse.rows.map((r) => r.name)).toEqual(['foyer', 'lift', 'office'])
    for (const table of [byFloor, byUse]) {
      const sum = table.rows.reduce((total, r) => total + Number(r.area), 0)
      expect(sum.toFixed(1)).toBe(table.total!.area)
      expect(Number(table.total!.area)).toBeCloseTo(net, 1)
    }
    // The core over the core below is counted there (SHT-11), so the typical floor's use is its office.
    expect(byFloor.rows[1]!.detail).toMatch(/^office [\d.]+$/)
  })

  it('keeps a floor with its own words in sheet.json a page of its own', () => {
    const words: SheetWords = { version: '1', floors: { l5: ['The fifth floor has the roof garden door.'] } }
    const own = client(loaded, words)
    expect(own.pages.filter((p) => p.kind === 'floor').map((p) => p.title)).toEqual(['Ground', 'Typical floor', 'Level 5'])
    expect(own.pages.find((p) => p.title === 'Typical floor')!.stands).toHaveLength(8)
  })

  it('does not fold floors that differ', () => {
    const odd = client(tower(4, 4))
    expect(odd.pages.filter((p) => p.kind === 'floor').map((p) => [p.title, p.stands?.length ?? 1])).toEqual([['Ground', 1], ['Typical floor', 3], ['Level 4', 1]])
  })

  it('folds nothing, and adds no schedule, when no two floors are alike', () => {
    const two = client(tower(1))
    expect(two.pages.map((p) => p.kind)).toEqual(['cover', 'floor', 'floor'])
    expect(two.pages.every((p) => p.stands === undefined)).toBe(true)
  })

  it('keeps every floor on the check sheet, each with its own ids', () => {
    const check = sheetPages(loaded, null, 'check', { name: 'tower', date })
    expect(check.pages.filter((p) => p.kind === 'floor')).toHaveLength(10)
  })
})
