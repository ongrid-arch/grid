import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { holdsAPlan } from '../planFile'

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
