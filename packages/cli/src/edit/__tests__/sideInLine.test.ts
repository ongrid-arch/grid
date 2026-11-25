import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'

/**
 * WRT-26: a wall that runs on in line with a room's side, past the room, is not "at an angle".
 * Two rooms side by side, their south walls in one line, with a wall between them: moving the
 * west room's south side carries the wall between and leaves the other room's south wall alone.
 */

const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

type Pair = [number, number]
const wall = (id: string, start: Pair, end: Pair): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })

function plan(party: boolean): Record<string, unknown> {
  const walls = [wall('s1', [0, 0], [4, 0]), wall('s2', [4, 0], [8, 0]), wall('e', [8, 0], [8, 3]), wall('n2', [8, 3], [4, 3]), wall('n1', [4, 3], [0, 3]), wall('w', [0, 3], [0, 0])]
  if (party) walls.push({ ...wall('mid', [4, 0], [4, 3]), kind: 'interior' })
  return {
    version: '1',
    units: 'm',
    walls,
    rooms: party
      ? [{ id: 'a', name: 'Kitchen', use: 'kitchen', boundary: ['s1', 'mid', 'n1', 'w'] }, { id: 'b', name: 'Lounge', use: 'living', boundary: ['s2', 'e', 'n2', 'mid'] }]
      : [{ id: 'a', name: 'Hall', use: 'hall', boundary: ['s1', 's2', 'e', 'n2', 'n1', 'w'] }],
    openings: [],
  }
}

function run(raw: Record<string, unknown>, args: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'grid-side-line-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(raw))
  const tool = GRID_TOOLS.find((t) => t.name === 'grid_move_room_side')!
  return { dir, answer: tool.run({ plan: 'plan.json', out: 'moved.json', ...args }, { project: openProject(dir, dir) }) }
}

describe('a side with a wall in line beyond it', () => {
  it('moves the side, carries the wall between the rooms and leaves the in-line wall where it is', async () => {
    const { dir, answer } = run(plan(true), { room: 'a', side: 'south', by: 1 })
    const result = await answer
    expect(result.text).not.toMatch(/at an angle/)
    const moved = JSON.parse(readFileSync(join(dir, 'moved.json'), 'utf8')) as { walls: { id: string; start: Pair; end: Pair }[] }
    const get = (id: string) => moved.walls.find((w) => w.id === id)!
    expect(get('s1').start[1]).toBe(-1)
    expect(get('mid').start).toEqual([4, -1])
    expect(get('s2').start).toEqual([4, 0])
  })

  it('names the wall in line when nothing across carries its end', async () => {
    await expect(async () => await run(plan(false), { room: 'a', side: 'south', by: 1 }).answer).rejects.toThrow(/Wall "s2" runs on in line.*step in the line/)
  })
})
