/**
 * MSG-4 (lab MS-1): `grid check` and `grid_check` read the plan file as written, so a field or a
 * room use Grid does not know is named, and an empty plan is said to be empty.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { checkPlan, checkText } from '../check'
import { loadPlan } from '../plan'

const dir = mkdtempSync(join(tmpdir(), 'grid-words-not-read-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const wall = (id: string, start: [number, number], end: [number, number], extra: Record<string, unknown> = {}) =>
  ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra })
const PLAN = {
  version: '1',
  units: 'm',
  walls: [
    // `thick` for `thickness`: the wall is read at the default 0.2 m.
    { id: 's', start: [0, 0], end: [4, 0], thick: 0.3, height: 2.7, kind: 'exterior' },
    wall('e', [4, 0], [4, 4]),
    wall('n', [4, 4], [0, 4]),
    wall('w', [0, 0], [0, 4]),
  ],
  // CNT-5: `office` is a use now; `balcony` is not.
  rooms: [{ id: 'r', name: 'Balcony', use: 'balcony', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [{ id: 'd', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1 }],
}
writeFileSync(join(dir, 'plan.json'), JSON.stringify(PLAN))
writeFileSync(join(dir, 'empty.json'), '{"version":"1","units":"m","walls":[],"rooms":[],"openings":[]}')

describe('grid check', () => {
  const project = openProject(dir, dir)

  it('names thick on a wall, with the field meant, and a use Grid does not know', () => {
    const result = checkPlan(loadPlan(project, 'plan.json'), {})
    const text = checkText(result, 1)
    expect(text).toMatch(/^ {2}\d+\. worth a look, wall "s": Wall "s" has a field Grid does not know, "thick"\. \[plan\/unknown-field\]$/m)
    expect(text).toMatch(/^ {6}fix: Did you mean "thickness"\? Rename "thick" to "thickness"\./m)
    expect(text).toMatch(/^ {2}\d+\. worth a look, room "r": Room "Balcony" has a use Grid does not know, "balcony"\. \[plan\/unknown-use\]$/m)
  })

  it('says an empty plan is empty', () => {
    const result = checkPlan(loadPlan(project, 'empty.json'), {})
    // Beside MSG-2's notice that no check that looks at rooms ran.
    expect(result.result.lines.map((l) => l.code)).toEqual(['plan/empty', 'plan/not-checked-no-rooms'])
  })

  it('grid_check gives the same lines', async () => {
    const tool = GRID_TOOLS.find((t) => t.name === 'grid_check')!
    const answer = await tool.run({ plan: 'plan.json' }, { project })
    const data = answer.data as { lines: { code: string }[] }
    expect(data.lines.map((l) => l.code)).toEqual(checkPlan(loadPlan(project, 'plan.json'), {}).result.lines.map((l) => l.code))
    expect(data.lines.map((l) => l.code)).toEqual(expect.arrayContaining(['plan/unknown-field', 'plan/unknown-use']))
  })
})
