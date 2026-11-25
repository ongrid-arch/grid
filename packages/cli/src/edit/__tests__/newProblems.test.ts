import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { loadPlan } from '../../command/plan'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { ToolRefusal } from '../../mcp/toolkit'

/**
 * WRT-18: a change that would leave the drawing with a problem it did not have is refused and
 * nothing is written, whatever the problem's severity; a side that cannot move as far as asked
 * is refused with the largest move that fits, and a wall drawn to the moved wall's face follows it.
 */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(plan: string = readFileSync(sample, 'utf8')): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-new-problems-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), plan)
  return dir
}

const tool = (name: string) => GRID_TOOLS.find((t) => t.name === name)!

async function refusal(name: string, args: Record<string, unknown>, dir: string): Promise<string> {
  try {
    await tool(name).run({ plan: 'plan.json', out: 'out.json', ...args }, { project: openProject(dir, dir) })
  } catch (error) {
    expect(error).toBeInstanceOf(ToolRefusal)
    return (error as Error).message
  }
  throw new Error(`${name} wrote the change`)
}

function problems(dir: string, file: string): number {
  const project = openProject(dir, dir)
  return validatePlan(loadPlan(project, file).plan).issues.length
}

/** The `by` the refusal offers, as a number. */
function offered(message: string): number {
  const match = /largest move that fits is by (-?\d+\.\d+)/.exec(message)
  expect(match, message).not.toBeNull()
  return Number(match![1])
}

describe('a change that would write a new drawing problem', () => {
  it('refuses a side moved past the opposite wall and offers the largest move that fits', async () => {
    const dir = project()
    const message = await refusal('grid_move_room_side', { room: 'bed2', side: 'north', by: -5 }, dir)
    expect(message).toMatch(/nothing was written/i)
    expect(message).toMatch(/not enclosed/)
    expect(existsSync(join(dir, 'out.json'))).toBe(false)
    const by = offered(message)
    expect(by).toBeLessThan(0)
    expect(by).toBeGreaterThan(-5)
    const inside = Number(/to (\d+\.\d+) m inside/.exec(message)![1])
    expect(inside).toBeGreaterThanOrEqual(0.3)
    const answer = await tool('grid_move_room_side').run({ plan: 'plan.json', room: 'bed2', side: 'north', by, out: 'fits.json' }, { project: openProject(dir, dir) })
    expect((answer.data as { drawingProblems: { after: number } }).drawingProblems.after).toBe(0)
  })

  it('refuses a wall moved so that a wall now ends inside a door', async () => {
    const dir = project()
    const message = await refusal('grid_move_room_side', { room: 'kitchen', side: 'north', by: 1 }, dir)
    expect(message).toMatch(/ends on wall "spine" inside door "bed2-door"/)
    const by = offered(message)
    expect(by).toBeGreaterThan(0)
    expect(by).toBeLessThan(1)
    await tool('grid_move_room_side').run({ plan: 'plan.json', room: 'kitchen', side: 'north', by, out: 'fits.json' }, { project: openProject(dir, dir) })
    expect(problems(dir, 'fits.json')).toBe(0)
  })

  it('refuses a door widened across the wall that meets its wall', async () => {
    const dir = project()
    const message = await refusal('grid_change_opening', { opening: 'bath-door', width: 2, keep: 'start' }, dir)
    expect(message).toMatch(/bath-door/)
    expect(message).toMatch(/nothing was written/i)
    expect(existsSync(join(dir, 'out.json'))).toBe(false)
  })

  it('still writes a change that leaves the drawing as sound as it was', async () => {
    const dir = project()
    await tool('grid_move_room_side').run({ plan: 'plan.json', room: 'bed2', side: 'north', by: -1.5, out: 'out.json' }, { project: openProject(dir, dir) })
    expect(problems(dir, 'out.json')).toBe(0)
  })
})

describe('moving a side', () => {
  it('carries a wall drawn to the face of the moved wall', async () => {
    const plan = {
      version: '1',
      units: 'm',
      walls: [
        { id: 'south', start: [0, 0], end: [6, 0], thickness: 0.2 },
        { id: 'east', start: [6, 0], end: [6, 4], thickness: 0.2 },
        { id: 'north', start: [6, 4], end: [0, 4], thickness: 0.2 },
        { id: 'west', start: [0, 4], end: [0, 0], thickness: 0.2 },
        { id: 'mid', start: [3, 0.1], end: [3, 3.9], thickness: 0.1 },
      ],
      rooms: [
        { id: 'a', name: 'Room A', boundary: ['south', 'mid', 'north', 'west'] },
        { id: 'b', name: 'Room B', boundary: ['south', 'east', 'north', 'mid'] },
      ],
      openings: [],
    }
    const dir = project(JSON.stringify(plan))
    expect(problems(dir, 'plan.json')).toBe(0)
    const answer = await tool('grid_move_room_side').run({ plan: 'plan.json', room: 'a', side: 'north', by: 1, out: 'out.json' }, { project: openProject(dir, dir) })
    expect(answer.text).toMatch(/walls that end on it followed: .*"mid"/)
    const written = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')) as { walls: Array<{ id: string; end: number[] }> }
    expect(written.walls.find((w) => w.id === 'mid')!.end).toEqual([3, 4.9])
    expect(problems(dir, 'out.json')).toBe(0)
  })
})
