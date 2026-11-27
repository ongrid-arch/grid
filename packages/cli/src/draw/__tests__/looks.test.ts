import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { fitTo } from '@ongrid/viewer/src/canvas2d/viewport'
import { planPicture } from '@ongrid/viewer/src/picture'
import { runGrid } from '../../command/main'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { PLAN_BOX, SHEET_LOOK, UNDECIDED_NOTE, planPictureOptions, sheetPages } from '../../sheet/pages'
import { inspectPlan } from '@ongrid/rules'
import { drawPlan } from '../drawPlan'

/**
 * SHT-1: which look each way of drawing a plan uses. Working for every picture an agent gets
 * (`grid_view`), technical for sheets and files to hand on (`grid sheet`, `grid draw`).
 */

const fixtures = resolve(__dirname, '../../../fixtures')
const flat = join(fixtures, 'two-bed-flat.json')
/** Its first floor has two doors with no stated swing, "balcony" and "d_up". */
const house = join(fixtures, 'two-floor-house.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-looks-'))
  made.push(dir)
  writeFileSync(join(dir, 'flat.json'), readFileSync(flat))
  writeFileSync(join(dir, 'house.json'), readFileSync(house))
  return dir
}

async function grid(dir: string, ...args: string[]) {
  let out = ''
  let err = ''
  const status = await runGrid(args, { stdout: (d) => (out += String(d)), stderr: (t) => (err += t), stdoutIsTerminal: false, cwd: dir })
  return { status, out, err }
}

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!

describe('grid draw: a file to hand on', () => {
  it('draws the technical look unless --look names another', async () => {
    const dir = folder()
    const drawn = await grid(dir, 'draw', 'flat.json')
    expect(drawn.status).toBe(0)
    // With what grid check finds marked on it, as grid draw always draws it (MSG-8).
    const faults = inspectPlan(read(flat)).lines
    expect(drawn.out).toBe(await drawPlan(read(flat), { format: 'svg', look: 'technical', faults }))
    expect(drawn.out).toContain('data-part="wall-outlines"')
    const working = await grid(dir, 'draw', 'flat.json', '--look', 'working')
    expect(working.out).toBe(await drawPlan(read(flat), { format: 'svg', faults }))
  })

  it('names the doors it draws as undecided, on standard error', async () => {
    const dir = folder()
    const drawn = await grid(dir, 'draw', 'house.json', '--floor', 'first')
    expect(drawn.status).toBe(0)
    expect(drawn.err).toBe('Drew 2 doors with no stated swing as undecided, a dashed line and "?": "balcony", "d_up". Set each one\'s hinge and swing in the plan.\n')
    expect((await grid(dir, 'draw', 'house.json', '--floor', 'first', '--look', 'working')).err).toBe('')
  })

  it('refuses a look it does not have, and a look for the 3D model', async () => {
    const dir = folder()
    const unknown = await grid(dir, 'draw', 'flat.json', '--look', 'sketch')
    expect(unknown.status).toBe(2)
    // SHT-10: a file is always on light paper, so the dark look is no longer one of them.
    expect(unknown.err).toContain('--look "sketch" is not a look Grid draws: use one of working, technical, simple, large.')
    const still = await grid(dir, 'draw', 'flat.json', '--3d', '--look', 'technical')
    expect(still.status).toBe(2)
    expect(still.err).toContain('--look is for a floor plan, not the 3D model')
  })
})

describe('grid_view: every picture an agent gets', () => {
  const context = () => {
    const dir = folder()
    return { project: openProject(dir, dir) }
  }

  it('is drawn in the working look unless another is asked', async () => {
    const answer = await view.run({ plan: 'flat.json', kind: 'plan' }, context())
    expect(answer.text).toMatch(/^Plan of floor "[^"]+", working, with inside sizes/)
  })

  it('takes the older names, and says which look they stand for', async () => {
    const mono = await view.run({ plan: 'flat.json', kind: 'plan', look: 'mono' }, context())
    expect(mono.text).toContain('technical (asked as mono)')
    const light = await view.run({ plan: 'flat.json', kind: 'plan', look: 'light' }, context())
    expect(light.text).toContain('working (asked as light)')
  })

  it('notes the doors a technical picture draws as undecided, and says what to do', async () => {
    const technical = await view.run({ plan: 'house.json', kind: 'plan', floor: 'first', look: 'technical' }, context())
    expect(technical.text).toContain('Drawn with a dashed line and "?" as undecided, 2 doors with no stated swing: "balcony", "d_up". Ask the person')
    const working = await view.run({ plan: 'house.json', kind: 'plan', floor: 'first' }, context())
    expect(working.text).not.toContain('undecided')
  })
})

describe('grid sheet: drawn in the technical look at its own scale', () => {
  const loadedFrom = (file: string) => {
    const plan = FloorPlanSchema.parse(read(file))
    const { issues, broken } = validatePlan(plan)
    return { file, plan, issues, broken }
  }
  const sheetOf = (file: string, layout: 'client' | 'check') =>
    sheetPages(loadedFrom(file), null, layout, { name: 'plan', date: new Date(Date.UTC(2026, 10, 22)) })

  it('asks for the technical look, at the box\'s scale on paper', () => {
    const loaded = loadedFrom(house)
    for (const page of sheetOf(house, 'client').pages) {
      if (page.picture?.kind !== 'plan') continue
      const { options } = planPictureOptions(page.picture)
      expect(options.look).toBe(SHEET_LOOK)
      // The frame's metres across the box's millimetres.
      const metres = fitTo(page.picture.frame, PLAN_BOX.width / PLAN_BOX.height).width
      expect(options.paperScale).toBeCloseTo((metres * 1000) / ((PLAN_BOX.width * 25.4) / 72), 9)
      expect(planPicture(loaded.plan, options).look.name).toBe('technical')
    }
  })

  it.each(['client', 'check'] as const)('keys the undecided mark on a %s floor page that has one, and only there', (layout) => {
    // Every floor of the house has a door with no stated swing; every door of the flat is hung.
    for (const page of sheetOf(house, layout).pages.filter((p) => p.kind === 'floor')) expect(page.notes).toContain(UNDECIDED_NOTE)
    for (const page of sheetOf(flat, layout).pages) expect(page.notes).not.toContain(UNDECIDED_NOTE)
  })
})
