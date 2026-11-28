import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { MEASURES, validatePlan } from '@ongrid/floorplan/geometry'
import { FLAT_AREA_RULE } from '@ongrid/floorplan/geometry/areas'
import { loadLanguage, say } from '@ongrid/floorplan/messages'
import { FloorPlanSchema, parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { duplexHouse } from '@ongrid/floorplan/test-support/plans'
import type { LoadedPlan } from '../../command/plan'
import { FLAT_SCHEDULE_RULE } from '../../quantities/schedule'
import { sheetPages, type Sheet } from '../pages'
import { sheetDay } from '../sheetDay'

/**
 * SHT-26: every word of a sheet from the message files in its language, no tool named on a sheet
 * for people, no square feet on a sheet in square metres, footnotes in the figures' own units, and
 * the person's own day.
 */
function fixture(name: string): LoadedPlan {
  const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures', name), 'utf8')))
  const { issues, broken } = validatePlan(plan)
  return { file: name, plan, issues, broken }
}

const date = new Date('2026-11-21T12:00:00Z')
const duplex = (): LoadedPlan => {
  const plan = parseFloorPlan(duplexHouse())
  return { file: 'duplex.json', plan, ...validatePlan(plan) }
}
const plans = (): LoadedPlan[] => [fixture('madrid-flat.json'), fixture('three-bed-house.json'), fixture('villa.json'), duplex()]
const inUnits = (loaded: LoadedPlan, display: NonNullable<LoadedPlan['plan']['display']>): LoadedPlan => ({ ...loaded, plan: { ...loaded.plan, display } })

/** The sentences a sheet prints under its tables and drawings, and its paragraphs. */
const sentences = (sheet: Sheet): string[] => sheet.pages.flatMap((page) => [...page.paragraphs, ...page.notes, ...(page.table?.note ? [page.table.note] : [])])
/** Every piece of text a sheet prints. */
const allText = (sheet: Sheet): string[] => sheet.pages.flatMap((page) => [
  page.topLine, page.title ?? '', page.subtitle ?? '', ...page.paragraphs, ...page.notes,
  ...page.figures.flatMap((f) => [f.value, f.label]),
  ...(page.table ? [page.table.heading, page.table.note ?? '', ...[...page.table.rows, ...(page.table.total ? [page.table.total] : [])].flatMap((r) => [r.name, r.detail ?? '', r.area])] : []),
])

beforeAll(async () => {
  await loadLanguage('es')
})

describe('a sheet in Spanish says every sentence in Spanish (SHT-26)', () => {
  it('prints none of the English sheet’s own sentences', () => {
    for (const loaded of plans()) {
      for (const layout of ['client', 'check'] as const) {
        const english = new Set(sentences(sheetPages(loaded, null, layout, { name: 'x', date })).filter((s) => s.split(' ').length > 4))
        const spanish = sentences(sheetPages(loaded, null, layout, { name: 'x', date, language: 'es' }))
        expect(spanish.filter((s) => english.has(s)), `${loaded.file} ${layout}`).toEqual([])
      }
    }
  })

  it('says the area rules, the limits and the schedules’ rules in Spanish', () => {
    const check = sheetPages(fixture('madrid-flat.json'), null, 'check', { name: 'x', date, language: 'es' })
    const text = sentences(check)
    expect(text).toContain(say('es', 'areas.measure.net.measures'))
    expect(text).toContain(say('es', 'check.limit.plan.6'))
    expect(text).toContain(say('es', 'sheet.rule.rooms'))
  })

  it('keeps the English words as they were', () => {
    expect(say('en', 'areas.measure.net.measures')).toBe(MEASURES.net.measures)
    expect(say('en', 'areas.measure.grossInternal.measures')).toBe(MEASURES.grossInternal.measures)
    expect(say('en', 'areas.measure.grossExternal.measures')).toBe(MEASURES.grossExternal.measures)
    expect(say('en', 'areas.rule.flat')).toBe(FLAT_AREA_RULE)
    expect(say('en', 'schedule.rule.flats')).toBe(FLAT_SCHEDULE_RULE)
  })
})

describe('a sheet names no tool, argument or command (SHT-26)', () => {
  const TOOLISH = /\bgrid_[a-z_]+|\bgrid (check|sheet|draw|measure)\b|--[a-z]+|\b(of|what)=[a-z]+/
  it('in either language, on either layout', () => {
    for (const loaded of plans()) {
      for (const layout of ['client', 'check'] as const) {
        for (const language of ['en', 'es'] as const) {
          const text = allText(sheetPages(loaded, null, layout, { name: 'x', date, language }))
          expect(text.filter((line) => TOOLISH.test(line)), `${loaded.file} ${layout} ${language}`).toEqual([])
        }
      }
    }
  })

  it('points to more measurements without naming a tool', () => {
    expect(say('en', 'sheet.access.more')).not.toMatch(/grid_/)
    expect(say('es', 'sheet.access.more')).not.toMatch(/grid_/)
  })
})

describe('units true to the figures (SHT-26)', () => {
  it('prints no square feet on a sheet in square metres', () => {
    for (const loaded of plans()) {
      for (const display of [undefined, { length: 'mm' as const }, { length: 'ft-in' as const, area: 'm2' as const }]) {
        const plan = display === undefined ? loaded : inUnits(loaded, display)
        for (const language of ['en', 'es'] as const) {
          const text = allText(sheetPages(plan, null, 'check', { name: 'x', date, language })).join('\n')
          expect(text, `${loaded.file} ${JSON.stringify(display)} ${language}`).not.toMatch(/sq ft|pies²/)
        }
      }
    }
  })

  it('keeps square metres beside square feet on a sheet in square feet', () => {
    const sheet = sheetPages(inUnits(fixture('three-bed-house.json'), { length: 'ft-in' }), null, 'check', { name: 'x', date })
    const rooms = sheet.pages.find((page) => page.title === 'Room schedule')!.table!
    expect(rooms.total!.detail).toMatch(/^\d+ rooms, \d+\.\d m²$/)
  })

  it('says the rounding of lengths in the units the lengths are printed in', () => {
    const cover = (display?: NonNullable<LoadedPlan['plan']['display']>) =>
      sheetPages(display === undefined ? fixture('three-bed-house.json') : inUnits(fixture('three-bed-house.json'), display), null, 'client', { name: 'x', date }).pages[0]!.notes
    expect(cover()).toContain(say('en', 'sheet.rounding'))
    // Metres with a decimal comma are still to the centimetre.
    expect(cover({ length: 'm', decimal: 'comma' })).toContain(say('en', 'sheet.rounding'))
    expect(cover({ length: 'mm' })).toContain(say('en', 'sheet.rounding.shown'))
    expect(cover({ length: 'mm' }).join('\n')).not.toMatch(/centimetre/)
    expect(cover({ length: 'ft-in', area: 'm2' })).toContain(say('en', 'sheet.rounding.shown'))
    expect(cover({ length: 'ft-in' })).toContain(say('en', 'sheet.rounding.feet'))
  })

  it('gives the opening sizes in the unit they are printed in', () => {
    const rule = (display?: NonNullable<LoadedPlan['plan']['display']>, language: 'en' | 'es' = 'en') =>
      sheetPages(display === undefined ? fixture('three-bed-house.json') : inUnits(fixture('three-bed-house.json'), display), null, 'check', { name: 'x', date, language })
        .pages.find((page) => page.title === say(language, 'sheet.openingSchedule'))!.table!.note
    expect(rule()).toMatch(/in metres/)
    expect(rule({ length: 'ft-in' })).toMatch(/in feet and inches/)
    expect(rule({ length: 'mm' })).toMatch(/in millimetres/)
    expect(rule({ length: 'mm' }, 'es')).toMatch(/en milímetros/)
  })
})

describe('the day a sheet is dated (SHT-26)', () => {
  const day = (d: Date) => d.toISOString().slice(0, 10)

  it('is the day asked for, and a time’s own written day', () => {
    expect(day(sheetDay('2026-01-31', {}))).toBe('2026-01-31')
    expect(day(sheetDay('2026-01-31T23:30:00-05:00', {}))).toBe('2026-01-31')
    expect(day(sheetDay('2026-02-01T00:30:00+09:00', {}))).toBe('2026-02-01')
  })

  it('is the UTC day of SOURCE_DATE_EPOCH, the same anywhere', () => {
    expect(day(sheetDay(undefined, { SOURCE_DATE_EPOCH: String(Date.UTC(2026, 0, 31, 23, 59) / 1000) }))).toBe('2026-01-31')
  })

  it('is the local day of the clock, not the UTC one', () => {
    const before = process.env['TZ']
    try {
      for (const zone of ['Europe/Madrid', 'Pacific/Auckland', 'America/Los_Angeles']) {
        process.env['TZ'] = zone
        // Just after local midnight on 1 February: wherever the machine is, the sheet says 1 FEB.
        const justAfterMidnight = new Date(2026, 1, 1, 0, 30)
        expect(day(sheetDay(undefined, {}, () => justAfterMidnight)), zone).toBe('2026-02-01')
        const late = new Date(2026, 0, 31, 23, 30)
        expect(day(sheetDay(undefined, {}, () => late)), zone).toBe('2026-01-31')
      }
    } finally {
      if (before === undefined) delete process.env['TZ']
      else process.env['TZ'] = before
    }
  })

  it('refuses a date it cannot read, as grid export does', () => {
    expect(() => sheetDay('tomorrow', {})).toThrow(/--date "tomorrow"/)
  })
})
