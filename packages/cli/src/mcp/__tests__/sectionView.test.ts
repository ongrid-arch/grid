import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'
import { readArgs, ToolRefusal } from '../toolkit'

/**
 * LVL-9: grid_view draws a section along a line (kind=section, cut, toward) and marks a plan with
 * the lines of its other drawings (marks), and says in words what the section took.
 */

const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function context() {
  const dir = mkdtempSync(join(tmpdir(), 'grid-section-view-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), labPlanText('A/scenarios/townhouse.json'))
  return { project: openProject(dir, dir) }
}

const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!
const call = async (raw: Record<string, unknown>) => view.run(readArgs(view, { plan: 'plan.json', ...raw }), context())
const THROUGH_STAIR = { from: [4.9, -2], to: [4.9, 13] }

describe('grid_view kind=section', () => {
  it('cuts the townhouse through its stair into one shape, with its levels and what it took', async () => {
    const answer = await call({ kind: 'section', cut: THROUGH_STAIR })
    expect(answer.image?.mimeType).toBe('image/png')
    const data = answer.data as { kind: string; section: { shapes: number; cut: { kind: string }[]; levels: { level: number; source: string }[]; assumed: { kind: string; hatched: boolean }[] } }
    expect(data.kind).toBe('section')
    expect(data.section.shapes).toBe(1)
    expect(data.section.cut.filter((c) => c.kind === 'wall')).toHaveLength(12)
    expect(data.section.levels.map((l) => [l.level, l.source])).toEqual([[0, 'datum'], [2.95, 'worked-out'], [6.1, 'worked-out']])
    expect(data.section.assumed.filter((a) => a.hatched).map((a) => a.kind)).toEqual(['slab', 'slab', 'slab', 'roof'])
    expect(answer.text).toContain('looking to the left of the line, working')
    expect(answer.text).toContain('It cuts 12 walls and 9 rooms; the cut parts join into 1 shape.')
    expect(answer.text).toContain('Levels: "Ground floor" ±0.000, "First floor" +2.950 (worked out), "Second floor" +6.100 (worked out); roof +8.850; ground ±0.000 (not stated).')
    expect(answer.text).toContain('  dashed: The roof over "Second floor" is taken as flat and 0.25 m thick, on its walls: the plan states no roof.')
  })

  it('refuses a section with no cut, a cut it cannot read, a side it does not know and what a section does not take', async () => {
    await expect(call({ kind: 'section' })).rejects.toThrow(new ToolRefusal('kind=section needs cut: the line to cut along, as {"from": [x, y], "to": [x, y]} in metres.'))
    await expect(call({ kind: 'section', cut: { from: [1, 2] } })).rejects.toThrow('cut.to takes a point as [x, y] in metres')
    await expect(call({ kind: 'section', cut: { from: [1, 2], to: [1, 2] } })).rejects.toThrow('cut needs two different points')
    await expect(call({ kind: 'section', cut: { ...THROUGH_STAIR, at: 1 } })).rejects.toThrow('cut takes from and to, not "at"')
    await expect(call({ kind: 'section', cut: THROUGH_STAIR, toward: 'north' })).rejects.toThrow('toward takes left or right')
    await expect(call({ kind: 'section', cut: THROUGH_STAIR, floor: 'first' })).rejects.toThrow('kind=section takes cut, toward, look, not floor.')
  })
})

describe('grid_view levels in the units asked for (VEW-20)', () => {
  it('writes a section\'s levels in the units argument instead of ignoring it', async () => {
    const answer = await call({ kind: 'section', cut: THROUGH_STAIR, units: 'mm' })
    expect(answer.text).toContain('Levels: "Ground floor" ±0, "First floor" +2950 (worked out), "Second floor" +6100 (worked out); roof +8850; ground ±0 (not stated).')
    const feet = await call({ kind: 'section', cut: THROUGH_STAIR, units: 'ft' })
    expect(feet.text).toContain('"First floor" +9\'-8"')
  })

  it('writes a facade\'s levels the same way', async () => {
    const answer = await call({ kind: 'facade', side: 'south', units: 'mm' })
    expect(answer.text).toContain('"First floor" at +2950')
    expect((await call({ kind: 'facade', side: 'south' })).text).toContain('"First floor" at +2.950')
  })
})

describe('grid_view kind=plan with marks', () => {
  it('marks the section\'s line, the elevations and the levels, and says so', async () => {
    const answer = await call({ kind: 'plan', marks: ['section', 'elevations', 'levels'], cut: THROUGH_STAIR, toward: 'right' })
    expect(answer.text).toContain('Marked on the plan: the section\'s cut line from (4.90, -2.00) to (4.90, 13.00) as a chain line named A, its arrows looking to the right;')
  })

  it('refuses cut without marks section, and marks section without cut', async () => {
    await expect(call({ kind: 'plan', cut: THROUGH_STAIR })).rejects.toThrow('kind=plan takes cut and toward only with marks section')
    await expect(call({ kind: 'plan', marks: ['section'] })).rejects.toThrow('marks section draws the line of a section on the plan: pass cut with the line.')
    await expect(call({ kind: 'plan', marks: ['levels', 'levels'] })).rejects.toThrow('marks names levels twice.')
    await expect(call({ kind: 'plan', marks: ['north'] })).rejects.toThrow('each item of marks takes one of levels, elevations, section, schedule.')
    await expect(call({ kind: '3d', marks: ['levels'] })).rejects.toThrow('kind=3d takes floor, from, bearing, tilt, distance, eye_height, lens, room, camera, view, turn, tilt_by, roof, not marks.')
  })

  it('refuses a camera with a section, and a cut with a camera (after VEW-3)', async () => {
    await expect(call({ kind: 'section', cut: THROUGH_STAIR, bearing: 200, tilt: 25 })).rejects.toThrow('kind=section takes cut, toward, look, not bearing, tilt.')
    await expect(call({ kind: 'section', cut: THROUGH_STAIR, view: 'Garden corner' })).rejects.toThrow('kind=section takes cut, toward, look, not view.')
    await expect(call({ kind: '3d', cut: THROUGH_STAIR, toward: 'left' })).rejects.toThrow('kind=3d takes floor, from, bearing, tilt, distance, eye_height, lens, room, camera, view, turn, tilt_by, roof, not toward, cut.')
  })

  it('refuses a side with a section, and a cut or marks with a facade (after LVL-8)', async () => {
    await expect(call({ kind: 'section', cut: THROUGH_STAIR, side: 'south' })).rejects.toThrow('kind=section takes cut, toward, look, not side.')
    await expect(call({ kind: 'facade', side: 'south', cut: THROUGH_STAIR, marks: ['levels'] })).rejects.toThrow('kind=facade takes side, look, not marks, cut.')
  })
})
