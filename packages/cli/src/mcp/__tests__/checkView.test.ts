import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { inspectPlan } from '@ongrid/rules'
import { drawPlan } from '../../draw/drawPlan'
import { openProject } from '../../fs/projectFiles'
import { runGrid } from '../../command/main'
import { GRID_TOOLS } from '../serveTools'

/**
 * VEW-2: the check view. `grid_view kind=plan ids=true` returns a picture on which every room,
 * door and window carries its id, under 1.5 MB, with text that names the same ids, the areas,
 * what each door joins, the counts and the drawing's problems. All text on it is upright.
 */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const plan = JSON.parse(readFileSync(sample, 'utf8')) as {
  rooms: { id: string; name: string }[]
  openings: { id: string; type: string }[]
}
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-check-view-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(sample))
  return dir
}

const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!
const ids = [...plan.rooms.map((r) => r.id), ...plan.openings.map((o) => o.id)]

describe('the check view', () => {
  it('draws every room, door and window id, upright', async () => {
    const svg = await drawPlan(JSON.parse(readFileSync(sample, 'utf8')), { format: 'svg', labels: { ids: true } })
    const drawnOpenings = [...svg.matchAll(/data-part="opening-id" data-opening="([^"]+)"/g)].map((m) => m[1])
    const drawnRooms = [...svg.matchAll(/data-part="label"[^>]*>[^<]*\[([^\]]+)\]</g)].map((m) => m[1])
    expect(new Set([...drawnRooms, ...drawnOpenings])).toEqual(new Set(ids))
    expect(svg).not.toMatch(/rotate\(/)
  })

  it('leaves the ids off the ordinary drawing', async () => {
    const svg = await drawPlan(JSON.parse(readFileSync(sample, 'utf8')), { format: 'svg' })
    expect(svg).not.toContain('data-part="opening-id"')
    expect(svg).not.toContain('[bed1]')
  })

  it('comes back from grid_view under 1.5 MB, with the same ids, areas, doors, counts and problems in the text', async () => {
    const dir = project()
    const answer = await view.run({ plan: 'plan.json', kind: 'plan', ids: true }, { project: openProject(dir, dir) })
    expect(answer.image?.mimeType).toBe('image/png')
    expect(answer.image!.data.length).toBeLessThan(1.5 * 1024 * 1024)
    expect(new Set((answer.data as { ids: string[] }).ids)).toEqual(new Set(ids))
    for (const id of ids) expect(answer.text).toContain(id)
    expect(answer.text).toContain('5 rooms, 4 doors, 5 windows and 1 doorless opening')
    expect(answer.text).toMatch(/m²|\d+\.\d\d/)
    expect(answer.text).toMatch(/Problems in the drawing, on every floor: /)
  })

  it('refuses ids with another kind, and an unknown floor naming the floors there are', async () => {
    const dir = project()
    await expect(view.run({ plan: 'plan.json', kind: '3d', ids: true }, { project: openProject(dir, dir) })).rejects.toThrow(/kind=3d takes floor, from, bearing, tilt, distance, eye_height, lens, room, camera, view, turn, tilt_by, roof, fit, not ids/)
    await expect(view.run({ plan: 'plan.json', kind: 'plan', ids: true, floor: 'attic' }, { project: openProject(dir, dir) })).rejects.toThrow(/"ground"/)
  })

  it('is the same drawing a person gets with grid draw --ids, in grid draw\'s technical look, which refuses --3d', async () => {
    const dir = project()
    const run = async (...args: string[]) => {
      let out = ''
      let err = ''
      const status = await runGrid(args, { stdout: (d) => (out += String(d)), stderr: (t) => (err += t), stdoutIsTerminal: false, cwd: dir })
      return { status, out, err }
    }
    const drawn = await run('draw', 'plan.json', '--ids')
    expect(drawn.status).toBe(0)
    // With what grid check finds marked on it, as grid draw always draws it (MSG-8).
    const plan = parseFloorPlan(JSON.parse(readFileSync(sample, 'utf8')))
    expect(drawn.out).toBe(await drawPlan(plan, { format: 'svg', look: 'technical', labels: { ids: true }, faults: inspectPlan(plan).lines }))
    const refused = await run('draw', 'plan.json', '--ids', '--3d')
    expect(refused.status).toBe(2)
    expect(refused.err).toContain('--ids draws the ids on a floor plan, not on the 3D model')
  })
})
