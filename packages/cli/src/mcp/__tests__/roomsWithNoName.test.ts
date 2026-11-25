import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadPlan } from '../../command/plan'
import { drawPlan } from '../../draw/drawPlan'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'

/**
 * WRT-43: a room with no name is drawn and measured by its id, and an answer that names rooms
 * never writes one as "". Taking the names off a plan's rooms to tidy the drawing once left every
 * one of them out of every view and measure.
 */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

interface Room { id: string; name?: unknown; boundary?: unknown }

/** The flat with each room's name changed by `change`, in a project of its own. */
function project(change: (rooms: Room[]) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'grid-no-name-'))
  made.push(dir)
  const plan = JSON.parse(readFileSync(sample, 'utf8')) as { rooms: Room[] }
  change(plan.rooms)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
  return { project: openProject(dir, dir), ids: plan.rooms.map((r) => r.id) }
}

const tool = (name: string) => GRID_TOOLS.find((t) => t.name === name)!
const text = async (name: string, args: Record<string, unknown>, context: { project: ReturnType<typeof openProject> }): Promise<string> => (await tool(name).run({ plan: 'plan.json', ...args }, context)).text

/** No name at all on any room, as an agent that took them off to tidy the drawing leaves them. */
const noNames = (rooms: Room[]): void => {
  for (const room of rooms) delete room.name
}
/** Blank names on every room. */
const blankNames = (rooms: Room[]): void => {
  for (const room of rooms) room.name = ''
}

describe('rooms with no name (WRT-43)', () => {
  it('are drawn, each labelled with its id', async () => {
    for (const change of [noNames, blankNames]) {
      const { project: p, ids } = project(change)
      const plan = loadPlan(p, 'plan.json').plan
      expect(plan.rooms.map((r) => r.id)).toEqual(ids)
      const svg = await drawPlan(plan, { format: 'svg' })
      const labels = [...svg.matchAll(/<text[^>]*data-part="label"[^>]*>([^<]*)</g)].map((m) => m[1])
      expect(labels.sort()).toEqual([...ids].sort())
    }
  })

  it('are measured, counted and listed by id, never as ""', async () => {
    const named = project(() => {})
    const wholeNet = /Net: ([\d.]+) m²/.exec(await text('grid_areas', {}, named))![1]
    for (const change of [noNames, blankNames]) {
      const context = project(change)
      const areas = await text('grid_areas', {}, context)
      expect(/Net: ([\d.]+) m²/.exec(areas)![1]).toBe(wholeNet)
      const takeoff = await text('grid_takeoff', {}, context)
      const schedule = await text('grid_schedule', {}, context)
      const access = await text('grid_measure', { what: 'access' }, context)
      for (const answer of [areas, takeoff, schedule, access]) {
        expect(answer).not.toContain('""')
        for (const id of context.ids) expect(answer).toContain(`"${id}"`)
      }
    }
  })

  it('are named once in the check, by the id used', async () => {
    const context = project((rooms) => delete rooms[0]!.name)
    const check = await text('grid_check', {}, context)
    expect(check).toContain('[plan/value-left-out]')
    expect(check).toContain('to keep the default, "bed2"')
    expect(check).not.toContain('[plan/part-left-out]')
  })
})

describe('a view of a room that is in no view (WRT-43)', () => {
  const broken = () => project((rooms) => (rooms[4]!.boundary = 'east, north'))

  it('says why the reader left it out, for a crop, an eye view and a 3D view', async () => {
    for (const args of [{ kind: 'plan', crop: 'lounge' }, { kind: 'eye', room: 'lounge' }, { kind: '3d', room: 'lounge' }]) {
      const refused = tool('grid_view').run({ plan: 'plan.json', ...args }, broken())
      await expect(refused).rejects.toThrow(/names room "lounge", which was left out when the plan was read: rooms\[4\]\.boundary is the text "east, north", and the format takes a list/)
    }
  })

  it('still names the nearest rooms for an id the plan never had', async () => {
    await expect(tool('grid_view').run({ plan: 'plan.json', kind: 'plan', crop: 'lounge-2' }, project(blankNames))).rejects.toThrow(/Its nearest rooms: .*\(no name\)/)
  })
})
