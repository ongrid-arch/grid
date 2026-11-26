import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { gridFileKind, holdsAPlan, SHEET_WORDS_SUFFIX } from '../planFile'
import { SHEET_SUFFIX } from '../../sheet/sheetFile'

/**
 * WRT-13: a plan is told by what it holds, and Grid's own files (grid.json and the files kept
 * beside a plan) are never written as a plan, nor is any other JSON file that is not one.
 */

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.rooms'), 'utf8')
const TSCONFIG = '{"compilerOptions":{"strict":true},"include":["src"]}\n'

describe('what holds a plan', () => {
  it('is told by its walls, rooms, openings or written stamp, not by a version', () => {
    expect(holdsAPlan({ walls: [] })).toBe(true)
    expect(holdsAPlan({ rooms: [] })).toBe(true)
    expect(holdsAPlan({ openings: [] })).toBe(true)
    expect(holdsAPlan({ written: { revision: 'x' } })).toBe(true)
    expect(holdsAPlan({ version: '1', units: 'm' })).toBe(false)
    expect(holdsAPlan({})).toBe(false)
    expect(holdsAPlan({ compilerOptions: {} })).toBe(false)
  })
})

describe('writing over a file that is not a plan', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({})
    writeFileSync(join(b.folder, 'tsconfig.json'), TSCONFIG)
    for (const name of ['plan.markers.json', 'plan.seen.json', 'plan.brief.json', 'plan.preview.json', 'plan.scan.json']) writeFileSync(join(b.folder, name), '{"kept":"as it is"}\n')
  })
  afterAll(() => b.close())

  const same = (file: string, text: string): void => expect(readFileSync(join(b.folder, file), 'utf8')).toBe(text)

  for (const file of ['grid.json', 'plan.markers.json', 'plan.seen.json', 'plan.brief.json', 'plan.preview.json', 'plan.scan.json', 'sub/grid.json']) {
    it(`refuses ${file}, with or without replace, and leaves it as it was`, async () => {
      const before = (() => { try { return readFileSync(join(b.folder, file), 'utf8') } catch { return null } })()
      for (const replace of [false, true]) {
        const ran = await b.call('grid_write_rooms', { plan: file, rooms: FLAT, replace })
        expect(ran.isError, ran.text).toBe(true)
        expect(ran.text).toContain('not a plan')
      }
      const after = (() => { try { return readFileSync(join(b.folder, file), 'utf8') } catch { return null } })()
      expect(after).toBe(before)
    })
  }

  it('refuses a JSON file that holds nothing a plan holds, even with replace', async () => {
    for (const replace of [false, true]) {
      const ran = await b.call('grid_write_rooms', { plan: 'tsconfig.json', rooms: FLAT, replace })
      expect(ran.isError, ran.text).toBe(true)
      expect(ran.text).toContain('holds no walls, rooms or openings')
    }
    same('tsconfig.json', TSCONFIG)
  })

  it('refuses to draw or check such a file instead of drawing a blank page', async () => {
    for (const tool of ['grid_check', 'grid_describe', 'grid_view']) {
      const ran = await b.call(tool, { plan: 'tsconfig.json', ...(tool === 'grid_view' ? { kind: 'plan' } : {}) })
      expect(ran.isError, `${tool}: ${ran.text}`).toBe(true)
      expect(ran.text).toContain('holds no walls, rooms or openings')
    }
  })

  it('still writes a new plan, and a plan with no version or empty lists', async () => {
    expect((await b.call('grid_write_rooms', { plan: 'new.json', rooms: FLAT })).isError).toBe(false)
    b.write('empty.json', { walls: [], rooms: [], openings: [] })
    expect((await b.call('grid_write_rooms', { plan: 'empty.json', rooms: FLAT })).isError).toBe(false)
    b.write('noversion.json', { units: 'm', walls: [], rooms: [], openings: [] })
    expect((await b.call('grid_check', { plan: 'noversion.json' })).isError).toBe(false)
  })
})

/**
 * CMD-45: a change written to another file (out, a fit-out's plan) is held to the same rules, so
 * an edit never writes over grid.json, a file kept beside a plan or a JSON file that is no plan;
 * and a plan with nothing in it is refused by the plan view rather than drawn as a blank page.
 */
describe('writing a change to a file that is not a plan', () => {
  let b: Bench
  beforeAll(async () => {
    b = bench({})
    writeFileSync(join(b.folder, 'tsconfig.json'), TSCONFIG)
    writeFileSync(join(b.folder, 'notes.json'), 'not json at all\n')
    for (const name of ['plan.brief.json', 'plan.occupancy.json', 'plan.sheet.json', 'firm-standards.json']) writeFileSync(join(b.folder, name), '{"kept":"as it is"}\n')
    expect((await b.call('grid_write_rooms', { plan: 'plan.json', rooms: FLAT })).isError).toBe(false)
  })
  afterAll(() => b.close())

  const text = (file: string): string | null => {
    try {
      return readFileSync(join(b.folder, file), 'utf8')
    } catch {
      return null
    }
  }
  const room = (): string => (JSON.parse(text('plan.json')!) as { rooms: { id: string }[] }).rooms[0]!.id

  it('knows the occupancy, sheet and firm files as Grid\'s own', () => {
    expect(gridFileKind('plan.occupancy.json')).toContain('beside a plan')
    expect(gridFileKind('plan.sheet.json')).toContain('beside a plan')
    expect(gridFileKind('firm-standards.json')).toContain('standards')
    expect(gridFileKind('plan.json')).toBeNull()
    expect(SHEET_WORDS_SUFFIX).toBe(SHEET_SUFFIX)
  })

  for (const file of ['grid.json', 'plan.brief.json', 'plan.occupancy.json', 'plan.sheet.json', 'firm-standards.json', 'tsconfig.json', 'notes.json', 'new.markers.json']) {
    it(`refuses an edit with out ${file} and leaves it as it was`, async () => {
      const before = text(file)
      const ran = await b.call('grid_rename_room', { room: room(), name: 'Lounge', out: file })
      expect(ran.isError, ran.text).toBe(true)
      expect(ran.text).toMatch(/not a (plan file|Grid plan)/)
      expect(ran.text).toContain('never written')
      expect(text(file)).toBe(before)
    })
  }

  it('refuses a fit-out written over a file that is not a plan, even with replace', async () => {
    for (const file of ['grid.json', 'tsconfig.json']) {
      const before = text(file)
      const ran = await b.call('grid_start_fit_out', { base: 'plan.json', plan: file, replace: true })
      expect(ran.isError, ran.text).toBe(true)
      expect(text(file)).toBe(before)
    }
  })

  it('still writes a change to a new file and over another plan', async () => {
    expect((await b.call('grid_rename_room', { room: room(), name: 'Lounge', out: 'copy.json' })).isError).toBe(false)
    expect((await b.call('grid_rename_room', { room: room(), name: 'Den', out: 'copy.json' })).isError).toBe(false)
    expect(text('copy.json')).toContain('Den')
  })

  it('refuses to draw a plan with nothing in it, and still checks it', async () => {
    b.write('empty.json', { walls: [], rooms: [], openings: [] })
    const view = await b.call('grid_view', { plan: 'empty.json', kind: 'plan' })
    expect(view.isError, view.text).toBe(true)
    expect(view.text).toContain('holds nothing to draw')
    expect((await b.call('grid_check', { plan: 'empty.json' })).isError).toBe(false)
  })
})
