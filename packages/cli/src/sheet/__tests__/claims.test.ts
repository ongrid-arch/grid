/**
 * SHT-12: a client sheet's words never claim the building is accessible, complies or is approved,
 * and its first page lists what Grid measured under the person's own access figures.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { SheetWordsRefused } from '@ongrid/floorplan/types/sheet'
import { openProject } from '../../fs/projectFiles'
import { loadPlan } from '../../command/plan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { accessNotes } from '../accessNotes'
import { parseSheetWordsChecked, sheetClaims } from '../claims'
import { sheetPages } from '../pages'

const LAB = resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')
function labPlan(name: string): Record<string, unknown> {
  for (const line of gunzipSync(readFileSync(LAB)).toString('utf8').split('\n')) {
    if (line.length === 0) continue
    const stored = JSON.parse(line) as { name: string; text: string }
    if (stored.name === name) return JSON.parse(stored.text) as Record<string, unknown>
  }
  throw new Error(`${name} is not in the lab data`)
}
const NARROW = 'J/scenarios/7-wheelchair-user/probe-narrow-everything.json'
const BRIEF = {
  figures: {
    door_width: { value: 0.8, level: 'must', source: 'given', quote: 'doors 80 cm clear' },
    corridor_width: { value: 1.2, level: 'must', source: 'given', quote: 'a hall 1.2 m' },
  },
}

const words = (extra: Record<string, unknown>) => ({ version: '1', ...extra })

describe('the words a client sheet refuses', () => {
  it.each([
    ['a headline claiming access and compliance', { headline: 'A fully accessible home that complies with the access standard' }, 'headline'],
    ['an intro that says approved', { intro: ['Fine.', 'The layout is approved.'] }, 'intro[1]'],
    ['a floor paragraph that says it passes', { floors: { ground: ['It passes every check.'] } }, 'floors (key 1) paragraph 1'],
    ['wheelchair friendly', { headline: 'A wheelchair-friendly flat' }, 'headline'],
    ['Spanish', { intro: ['Una casa accesible y que cumple la norma.'] }, 'intro[0]'],
  ])('refuses %s, naming the field and the words', (_what, extra, field) => {
    expect(() => parseSheetWordsChecked(words(extra), ['ground'])).toThrow(SheetWordsRefused)
    try {
      parseSheetWordsChecked(words(extra), ['ground'])
    } catch (error) {
      expect((error as Error).message).toContain(`${field} says`)
    }
  })

  it('leaves ordinary words and quoted words alone', () => {
    const ok = words({ headline: 'A quiet flat above the park', intro: ['Two bedrooms, one bath.', 'The agent called it "fully accessible", which Grid has not checked.'] })
    expect(sheetClaims(parseSheetWordsChecked(ok, []))).toEqual([])
  })
})

describe('grid_sheet and the words', () => {
  let b: Bench | null = null
  afterEach(() => {
    b?.close()
    b = null
  })

  it('refuses claim words in the sheet argument and writes nothing', async () => {
    b = bench({ 'probe.json': labPlan(NARROW) })
    const reply = await b.call('grid_sheet', { plan: 'probe.json', layout: 'client', sheet: words({ headline: 'Fully accessible and compliant with the standard' }) })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('The sheet words: headline says')
    expect(reply.text).toContain('"accessible"')
  })

  it('refuses claim words in sheet.json beside the plan', async () => {
    b = bench({ 'probe.json': labPlan(NARROW), 'sheet.json': words({ intro: ['This building complies.'] }) })
    const reply = await b.call('grid_sheet', { plan: 'probe.json', layout: 'client' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('"complies"')
  })

  it('writes the sheet when the words hold no claim', async () => {
    b = bench({ 'probe.json': labPlan(NARROW) })
    const reply = await b.call('grid_sheet', { plan: 'probe.json', layout: 'client', sheet: words({ headline: 'A small flat', intro: ['Two bedrooms.'] }) })
    expect(reply.isError, reply.text).toBe(false)
  }, 60000)
})

describe('the open access notes on the first page', () => {
  let b: Bench | null = null
  afterEach(() => {
    b?.close()
    b = null
  })

  it('lists the doors and the hall under the person\'s figures, and no word of access being met', async () => {
    b = bench({ 'probe.json': labPlan(NARROW) })
    expect((await b.call('grid_write_brief', { plan: 'probe.json', brief: BRIEF })).isError).toBe(false)
    const project = openProject(b.folder, b.folder, 'project')
    const loaded = loadPlan(project, 'probe.json')
    const notes = accessNotes(project, 'probe.json', loaded)
    expect(notes.filter((n) => n.kind === 'door').length).toBeGreaterThanOrEqual(6)
    expect(notes.some((n) => n.kind === 'corridor')).toBe(true)
    const sheet = sheetPages(loaded, null, 'client', { name: 'probe', date: new Date('2026-11-21T12:00:00Z'), accessNotes: notes })
    const text = sheet.pages[0]!.notes.join('\n')
    expect(text).toContain('Under your figure of 0.80 m: the door between')
    expect(text).toContain('Under your figure of 1.20 m: the corridor Hall narrows to 0.70 m.')
    expect(text).toContain('More measurements are under your figures')
    expect(text).not.toMatch(/accessible|complies/i)
  })

  it('prints none without a brief', () => {
    b = bench({ 'probe.json': labPlan(NARROW) })
    const project = openProject(b.folder, b.folder, 'project')
    expect(accessNotes(project, 'probe.json', loadPlan(project, 'probe.json'))).toEqual([])
  })
})
