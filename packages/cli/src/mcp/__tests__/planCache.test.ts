/**
 * CMD-51: the tool server keeps the plan it read per version, and never answers a stale one: a
 * change to the plan file, to its base plan or to its trace image being there reads it afresh.
 */
import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as geometry from '@ongrid/floorplan/geometry'
import { openProject, type Project } from '../../fs/projectFiles'
import { surveyPlan } from '../../quantities/survey'
import { cachedPlan, forgetPlans, PLAN_VERSIONS_KEPT } from '../planCache'
import { bench, type Bench } from './replay/harness'
import { twoBedFlat } from './replay/plans'

const validations = vi.hoisted(() => ({ count: 0 }))

vi.mock('@ongrid/floorplan/geometry', async (original) => {
  const real = await original<typeof geometry>()
  return {
    ...real,
    validatePlan: (...args: Parameters<typeof real.validatePlan>) => {
      validations.count++
      return real.validatePlan(...args)
    },
  }
})

const SHELL = {
  version: '1',
  walls: [
    { id: 's1', start: [0, 0], end: [8, 0], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 's2', start: [8, 0], end: [8, 5], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 's3', start: [8, 5], end: [0, 5], thickness: 0.3, height: 3, kind: 'exterior' },
    { id: 's4', start: [0, 5], end: [0, 0], thickness: 0.3, height: 3, kind: 'exterior' },
  ],
  rooms: [{ id: 'shell', name: 'Shell', boundary: ['s1', 's2', 's3', 's4'] }],
  openings: [{ id: 'entrance', wall: 's1', type: 'door', offset: 1, width: 1, height: 2.1 }],
}

const FIT_OUT = {
  version: '1',
  base: 'shell.json',
  walls: [{ id: 'p1', start: [4, 0], end: [4, 5], thickness: 0.1, height: 3, kind: 'partition' }],
  rooms: [
    { id: 'front', name: 'Reception', use: 'reception', boundary: ['s1', 'p1', 's3', 's4'] },
    { id: 'back', name: 'Office', use: 'office', boundary: ['s1', 's2', 's3', 'p1'] },
  ],
  openings: [],
}

/** The lab's block of seven floors, stacked `copies` times. */
function tower(copies: number): unknown {
  const base = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/edits/block-588.json'), 'utf8')) as {
    floors: Array<{ id: string; name: string; level: number }>
    walls: Array<{ id: string; floor: string }>
    rooms: Array<{ id: string; boundary: string[]; floor: string }>
    openings: Array<{ id: string; wall: string; floor?: string }>
  }
  const each = <T>(make: (c: number) => T[]): T[] => Array.from({ length: copies }, (_, c) => make(c)).flat()
  const p = (c: number, id: string): string => `c${c}-${id}`
  return {
    ...base,
    floors: each((c) => base.floors.map((f) => ({ ...f, id: p(c, f.id), name: `${f.name} ${c}`, level: f.level + c * base.floors.length }))),
    walls: each((c) => base.walls.map((w) => ({ ...w, id: p(c, w.id), floor: p(c, w.floor) }))),
    rooms: each((c) => base.rooms.map((r) => ({ ...r, id: p(c, r.id), boundary: r.boundary.map((id) => p(c, id)), floor: p(c, r.floor) }))),
    openings: each((c) => base.openings.map((o) => ({ ...o, id: p(c, o.id), wall: p(c, o.wall), ...(o.floor === undefined ? {} : { floor: p(c, o.floor) }) }))),
  }
}

let b: Bench
let project: Project
beforeAll(() => {
  b = bench({ 'flat.json': twoBedFlat(), 'shell.json': SHELL, 'fitout.json': FIT_OUT })
  project = openProject(b.folder, b.folder, 'project')
})
afterAll(() => b.close())
afterEach(() => forgetPlans())

describe('the plan kept per version (CMD-51)', () => {
  it('answers the plan kept for the same version, frozen, with its survey kept too', () => {
    const first = cachedPlan(project, 'flat.json')
    const again = cachedPlan(project, 'flat.json')
    expect(again).toBe(first)
    expect(Object.isFrozen(first.plan)).toBe(true)
    expect(Object.isFrozen(first.plan.walls[0])).toBe(true)
    expect(Object.isFrozen(first.issues)).toBe(true)
    expect(surveyPlan(again.plan)).toBe(surveyPlan(first.plan))
    expect(() => (first.plan.walls as unknown[]).push({})).toThrow(TypeError)
  })

  it('reads the plan afresh when its file changes, even back to an earlier text', () => {
    const first = cachedPlan(project, 'flat.json')
    const changed = twoBedFlat() as { rooms: Array<{ name: string }> }
    changed.rooms[0]!.name = 'Front room'
    b.write('flat.json', changed)
    const second = cachedPlan(project, 'flat.json')
    expect(second).not.toBe(first)
    expect(second.plan.rooms[0]!.name).toBe('Front room')
    b.write('flat.json', twoBedFlat())
    const third = cachedPlan(project, 'flat.json')
    expect(third).not.toBe(second)
    expect(third.plan.rooms[0]!.name).toBe(first.plan.rooms[0]!.name)
  })

  it('reads a fit-out afresh when its base plan changes', () => {
    const first = cachedPlan(project, 'fitout.json')
    expect(cachedPlan(project, 'fitout.json')).toBe(first)
    b.write('shell.json', { ...SHELL, walls: SHELL.walls.map((w) => (w.id === 's2' ? { ...w, thickness: 0.4 } : w)) })
    const second = cachedPlan(project, 'fitout.json')
    expect(second).not.toBe(first)
    expect(second.plan.walls.find((w) => w.id === 's2')!.thickness).toBe(0.4)
    b.write('shell.json', SHELL)
  })

  it('reads the plan afresh when its trace image comes or goes', () => {
    b.write('traced.json', { ...(twoBedFlat() as object), referenceImage: { path: 'survey.png', scale: 50 } })
    const missing = cachedPlan(project, 'traced.json')
    expect(missing.trace?.why).toBe('missing')
    writeFileSync(join(b.folder, 'survey.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const there = cachedPlan(project, 'traced.json')
    expect(there).not.toBe(missing)
    expect(there.trace).toBeUndefined()
    rmSync(join(b.folder, 'survey.png'))
    expect(cachedPlan(project, 'traced.json').trace?.why).toBe('missing')
  })

  it('keeps no refusal: a plan put right is read', () => {
    writeFileSync(join(b.folder, 'broken.json'), '{"walls": [')
    expect(() => cachedPlan(project, 'broken.json')).toThrow(/is not JSON/)
    b.write('broken.json', twoBedFlat())
    expect(cachedPlan(project, 'broken.json').plan.rooms.length).toBeGreaterThan(0)
  })

  it('reads whole apart from part by part, and keeps no more than its limit of versions', () => {
    const parts = cachedPlan(project, 'flat.json')
    const whole = cachedPlan(project, 'flat.json', { whole: true })
    expect(whole).not.toBe(parts)
    for (let i = 0; i < PLAN_VERSIONS_KEPT; i++) {
      b.write(`other-${i}.json`, twoBedFlat())
      cachedPlan(project, `other-${i}.json`)
    }
    expect(cachedPlan(project, 'flat.json')).not.toBe(parts)
  })

  it('refuses an unknown floor before the plan is validated', async () => {
    validations.count = 0
    const reply = await b.call('grid_check', { plan: 'flat.json', floor: 'roof-garden' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/That floor is not in this plan/)
    expect(validations.count).toBe(0)
    const measure = await b.call('grid_measure', { plan: 'flat.json', what: 'use' })
    expect(measure.isError).toBe(true)
    expect(validations.count).toBe(0)
    // The count is the plan's validation: a check of the plan validates it.
    expect((await b.call('grid_check', { plan: 'flat.json' })).isError).toBe(false)
    expect(validations.count).toBeGreaterThan(0)
  })
})

describe('a later call on a large plan (CMD-51)', () => {
  let big: Bench
  beforeAll(() => {
    big = bench({ 'tower.json': tower(6) })
  })
  afterAll(() => big.close())

  it('checks and measures 42 floors again in a fraction of the first time', async () => {
    const cpu = async (name: string, args: Record<string, unknown>): Promise<number> => {
      const start = process.cpuUsage()
      const reply = await big.call(name, args)
      expect(reply.isError, reply.text).toBe(false)
      const used = process.cpuUsage(start)
      return used.user + used.system
    }
    const firstCheck = await cpu('grid_check', { plan: 'tower.json' })
    const againCheck = await cpu('grid_check', { plan: 'tower.json' })
    expect(againCheck).toBeLessThan(firstCheck / 5)
    const firstAreas = await cpu('grid_areas', { plan: 'tower.json', gross: 'internal' })
    const againAreas = await cpu('grid_areas', { plan: 'tower.json', gross: 'internal' })
    expect(againAreas).toBeLessThan(firstAreas)
  }, 120_000)
})
