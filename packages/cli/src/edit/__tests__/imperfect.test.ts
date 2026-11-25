import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { ToolRefusal } from '../../mcp/toolkit'

/**
 * WRT-59: one rule for an edit on a plan the reader leaves parts of out (it goes on and says what
 * was left out, the file keeping it as written); a side split in one line moves as one; the notes
 * an edit caused lead its answer, the plot boundary's first; a rename follows into the brief; a
 * mirror or turn of massing turns the outlines; a default wall type states its kind.
 */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

type Raw = Record<string, any>
const flat = (): Raw => JSON.parse(readFileSync(sample, 'utf8')) as Raw

function project(raw: Raw, extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-imperfect-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(raw))
  for (const [name, content] of Object.entries(extra)) writeFileSync(join(dir, name), JSON.stringify(content))
  return dir
}

const run = async (dir: string, name: string, args: Record<string, unknown>): Promise<{ text: string; data: Record<string, any> }> =>
  (await GRID_TOOLS.find((t) => t.name === name)!.run({ plan: 'plan.json', out: 'out.json', ...args }, { project: openProject(dir, dir) })) as { text: string; data: Record<string, any> }

const refusal = async (dir: string, name: string, args: Record<string, unknown>): Promise<string> => {
  try {
    await run(dir, name, args)
  } catch (error) {
    expect(error).toBeInstanceOf(ToolRefusal)
    return (error as Error).message
  }
  throw new Error(`${name} wrote the change`)
}

const written = (dir: string): Raw => JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')) as Raw

describe('an edit on a plan with parts the reader leaves out', () => {
  it('goes on with a wall whose thickness is text, keeps it as written and says it was left out', async () => {
    const raw = flat()
    raw.walls[4].thickness = 'thick'
    const dir = project(raw)
    const answer = await run(dir, 'grid_rename_room', { room: 'kitchen', name: 'Cooking' })
    expect(answer.text).toMatch(/Left out of the reading, and kept in the file as written/)
    expect(answer.data['leftOut']).toHaveLength(1)
    expect(written(dir).walls[4].thickness).toBe('thick')
    expect(written(dir).rooms.find((r: Raw) => r.id === 'kitchen').name).toBe('Cooking')
  })

  it('goes on with a fact it cannot read, as it does with a part left out', async () => {
    const raw = flat()
    raw.walls[1].properties = { a: { b: 1 } }
    const dir = project(raw)
    const answer = await run(dir, 'grid_rename_room', { room: 'kitchen', name: 'Cooking' })
    expect(answer.data['leftOut'].length).toBeGreaterThan(0)
    expect(written(dir).walls[1].properties).toEqual({ a: { b: 1 } })
  })

  it('refuses a mirror, which would leave those parts where they were, and writes nothing', async () => {
    const raw = flat()
    raw.walls[4].thickness = 'thick'
    const dir = project(raw)
    expect(await refusal(dir, 'grid_mirror', { how: 'left-right' })).toMatch(/would leave it where it is.*Nothing was written/)
    expect(existsSync(join(dir, 'out.json'))).toBe(false)
  })
})

describe('a side split in one line', () => {
  const split = (): Raw => {
    const wall = (id: string, start: [number, number], end: [number, number], height: number): Raw => ({ id, start, end, thickness: 0.2, height, kind: 'exterior' })
    return {
      version: '1',
      units: 'm',
      walls: [wall('s-low', [0, 0], [2, 0], 2.4), wall('s-high', [2, 0], [4, 0], 3.2), wall('e', [4, 0], [4, 3], 2.7), wall('n', [4, 3], [0, 3], 2.7), wall('w', [0, 3], [0, 0], 2.7)],
      rooms: [{ id: 'a', name: 'Hall', use: 'hall', boundary: ['s-low', 's-high', 'e', 'n', 'w'] }],
      openings: [],
    }
  }

  it('moves every wall of the side and the walls that end on it', async () => {
    const dir = project(split())
    const answer = await run(dir, 'grid_move_room_side', { room: 'a', side: 'south', by: 1 })
    const get = (id: string): Raw => written(dir).walls.find((w: Raw) => w.id === id)
    expect(get('s-low').start).toEqual([0, -1])
    expect(get('s-high').end).toEqual([4, -1])
    expect(get('e').start).toEqual([4, -1])
    expect(get('w').end).toEqual([0, -1])
    expect(answer.text).toMatch(/Moved walls "s-low" and "s-high", in one line/)
  })
})

describe('the notes an edit caused', () => {
  it('lead the answer, the plot boundary first', async () => {
    const raw = flat()
    raw.site = { boundary: [[-1, -1], [11, -1], [11, 8.5], [-1, 8.5]] }
    const dir = project(raw)
    const answer = await run(dir, 'grid_move_room_side', { room: 'bed2', side: 'south', by: 3 })
    const first = answer.text.split('\n')[0]!
    expect(first).toMatch(/^This change caused/)
    expect(answer.data['caused'][0].code).toMatch(/boundary/)
  })

  it('say nothing when the change caused none', async () => {
    const dir = project(flat())
    const answer = await run(dir, 'grid_rename_room', { room: 'kitchen', name: 'Cooking' })
    expect(answer.text).not.toMatch(/This change caused/)
    expect(answer.data['caused']).toEqual([])
  })
})

describe('a rename and the brief', () => {
  const brief = {
    version: '1',
    rooms: [{ name: 'Kitchen', area: 12, level: 'must', source: 'given', quote: 'a kitchen of about 12 square metres' }],
    touch: [{ rooms: ['Kitchen', 'Living room'], level: 'must', source: 'given', quote: 'the kitchen open to the living room' }],
  }

  it('renames the wishes that name the room, so they are not read as missed', async () => {
    const dir = project(flat(), { 'plan.brief.json': brief })
    const answer = await run(dir, 'grid_rename_room', { room: 'kitchen', name: 'Cooking' })
    const now = JSON.parse(readFileSync(join(dir, 'plan.brief.json'), 'utf8')) as Raw
    expect(now.rooms[0].name).toBe('Cooking')
    expect(now.touch[0].rooms).toEqual(['Cooking', 'Living room'])
    expect(answer.text).toMatch(/The brief's 2 wishes about the renamed room follow it: "Kitchen" → "Cooking"/)
    expect(answer.text).toMatch(/met \(must\): "Cooking" and "Living room" asked to touch/)
  })

  it('leaves a wish alone when another room still has the old name', async () => {
    const raw = flat()
    raw.rooms.push({ ...raw.rooms[0], id: 'twin' })
    raw.rooms.find((r: Raw) => r.id === 'twin').name = 'Kitchen'
    const dir = project(raw, { 'plan.brief.json': brief })
    await run(dir, 'grid_rename_room', { room: 'kitchen', name: 'Cooking' })
    expect((JSON.parse(readFileSync(join(dir, 'plan.brief.json'), 'utf8')) as Raw).rooms[0].name).toBe('Kitchen')
  })
})

describe('a mirror or turn of massing', () => {
  const massing = (): Raw => ({
    version: '1',
    units: 'm',
    walls: [],
    rooms: [],
    openings: [],
    floors: [{ id: 'ground', name: 'Ground', level: 0, height: 3, outline: [[0, 0], [10, 0], [10, 4], [0, 4]] }],
  })

  it('mirrors the outlines', async () => {
    const raw = massing()
    raw.floors[0].outline = [[0, 0], [10, 0], [10, 4], [3, 4]]
    const dir = project(raw)
    const answer = await run(dir, 'grid_mirror', { how: 'left-right' })
    expect(written(dir).floors[0].outline).toEqual([[10, 0], [0, 0], [0, 4], [7, 4]])
    expect(answer.text).toMatch(/1 floor outlines/)
  })

  it('turns the outlines a quarter', async () => {
    const dir = project(massing())
    await run(dir, 'grid_mirror', { turn: 180 })
    expect(written(dir).floors[0].outline).toEqual([[10, 4], [0, 4], [0, 0], [10, 0]])
  })

  it('refuses a plan with nothing to turn', async () => {
    const raw = massing()
    delete raw.floors
    const dir = project(raw)
    expect(await refusal(dir, 'grid_mirror', { how: 'left-right' })).toMatch(/nothing to mirror/)
  })
})

describe('a default wall type', () => {
  it('is refused without a kind', async () => {
    const dir = project(flat())
    expect(await refusal(dir, 'grid_change_type', { of: 'wall', type: 'plain', name: 'Plain', thickness: 0.1, default: true })).toMatch(/give kind \(interior or exterior\)/)
  })

  it('is made for the kind it states', async () => {
    const dir = project(flat())
    await run(dir, 'grid_change_type', { of: 'wall', type: 'plain', name: 'Plain', thickness: 0.1, kind: 'interior', default: true })
    expect(written(dir).types.defaults.walls.interior).toBe('plain')
  })
})
