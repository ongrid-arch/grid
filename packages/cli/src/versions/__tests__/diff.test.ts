import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { runGrid } from '../../command/main'
import { openProject } from '../../fs/projectFiles'
import { bench } from '../../mcp/__tests__/replay/harness'
import { lastCommitted } from '../git'
import { MARKERS_MAX, readMarkers } from '../markers'

/**
 * WRT-8: `grid mark`, `grid diff` and the tools `grid_mark_start` and `grid_diff`, run in this
 * process through `runGrid` and the tool server, in folders with no git and with one.
 */

const FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const flat = readFileSync(join(FIXTURES, 'two-bed-flat.json'), 'utf8')
const roomsText = readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(files: Record<string, string> = { 'plan.json': flat }): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-diff-'))
  made.push(dir)
  writeFileSync(join(dir, 'grid.json'), '{"version":1}\n')
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

async function grid(dir: string, ...args: string[]): Promise<{ status: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const status = await runGrid(args, {
    stdout: (data) => (out += typeof data === 'string' ? data : Buffer.from(data).toString('utf8')),
    stderr: (text) => (err += text),
    stdoutIsTerminal: false,
    cwd: dir,
  })
  return { status, out, err }
}

const gitThere = spawnSync('git', ['--version']).status === 0

function git(dir: string, ...args: string[]): void {
  const run = spawnSync('git', ['-c', 'user.name=Grid test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr.toString()}`)
}

describe('a start marker, an edit and grid diff, in a folder with no git (done-when 4, 3)', () => {
  it('names the door that now joins other rooms, and reads a split merged back as no change', async () => {
    const dir = project()
    expect(existsSync(join(dir, '.git'))).toBe(false)
    expect(await grid(dir, 'mark', 'start')).toMatchObject({ status: 0, out: expect.stringContaining('Marked "start"') })

    // Split the first bedroom: its door, near its west side, now opens into the new store.
    const split = await grid(dir, 'edit', 'split', '--room', 'bed1', '--side', 'west', '--size', '1.45', '--new-room', 'store', '--new-name', 'Store', '--new-use', 'storage')
    expect(split.status, split.err).toBe(0)
    const after = await grid(dir, 'diff', '--since', 'start', '--rooms', 'bed1')
    expect(after.status, after.err).toBe(0)
    const issues = after.out.split('Verdict:')[0]!
    expect(issues).toContain('Door "door-bed1" joined "bed1" and "hall"; it now joins "hall" and "store"')
    expect(after.out).toMatch(/Verdict: \d+ issues? to look at first\. \d+ changes, room by room: "Bedroom 1" 13\.64 m² → /)
    expect(after.out).toContain('Room added: "Store"')
    expect(after.out).toContain('Nothing changed outside the rooms named ("bed1")')

    // CNT-8: merging rooms of two uses asks which one; the split took a bedroom, so it goes back as one.
    const merged = await grid(dir, 'edit', 'merge', '--room', 'bed1', '--with', 'store', '--use', 'bedroom')
    expect(merged.status, merged.err).toBe(0)
    const back = await grid(dir, 'diff')
    expect(back.status, back.err).toBe(0)
    expect(back.out).toContain('Verdict: Same building: every room, wall and opening stands where it stood.')
    expect(back.out).toContain('Changes: none.')

    const json = JSON.parse((await grid(dir, 'diff', '--json')).out) as { sameBuilding: boolean; changes: unknown[]; since: { kind: string; name: string } }
    expect(json).toMatchObject({ sameBuilding: true, changes: [], since: { kind: 'marker', name: 'start' } })
  })

  it('answers through the tools with the summary and a three-colour picture', async () => {
    const b = bench({ 'plan.json': JSON.parse(flat) as unknown })
    try {
      expect((await b.call('grid_mark_start', {})).isError).toBe(false)
      const edit = await b.call('grid_split_room', { room: 'bed1', side: 'west', size: 1.45, new_room: 'store', new_name: 'Store', new_use: 'storage' })
      expect(edit.isError, edit.text).toBe(false)
      const reply = await b.call('grid_diff', { since: 'start', show: 'summary' })
      expect(reply.isError, reply.text).toBe(false)
      expect(reply.image).toBe(true)
      expect(reply.text).toContain('Verdict:')
      expect(reply.text).toContain('door-bed1')
      expect(reply.text).toContain('removed in red, added in green, what changed in amber (a wall or opening at its new place with its old place outlined')
      expect(reply.data).toMatchObject({ sameBuilding: false, since: { kind: 'marker', name: 'start' }, changes: [], picture: { floor: 'ground' } })
      const none = await b.call('grid_diff', { picture: false, show: 'issues' })
      expect(none.image).toBe(false)
    } finally {
      b.close()
    }
  })
})

/** The comparison's first line: the one after what it was compared with. */
const firstLine = (text: string): string | undefined => {
  const lines = text.split('\n')
  return lines[lines.findIndex((line) => line.startsWith('Compared with')) + 1]
}

describe('a plan mirrored or turned (WRT-4, lab Y-5)', () => {
  it('says first, after grid_mirror, that the plan is mirrored and every room keeps its size', async () => {
    const b = bench({ 'plan.json': JSON.parse(flat) as unknown })
    try {
      expect((await b.call('grid_mark_start', {})).isError).toBe(false)
      const edit = await b.call('grid_mirror', { how: 'left-right' })
      expect(edit.isError, edit.text).toBe(false)
      const reply = await b.call('grid_diff', {})
      expect(reply.isError, reply.text).toBe(false)
      const lines = reply.text.split('\n')
      // The first line of the comparison, right after what it was compared with.
      expect(lines[lines.findIndex((line) => line.startsWith('Compared with')) + 1]).toBe('The plan is mirrored left to right (east and west swap), and every room keeps its size.')
      expect(reply.text).toContain('Verdict: The plan is mirrored left to right (east and west swap), and every room keeps its size. Nothing else changed.')
      expect(reply.text).toContain('Changes: none.')
      expect(reply.image).toBe(false)
      expect(reply.data).toMatchObject({ sameBuilding: false, turn: { id: 'mirror-left-right', mirrored: true, degrees: 0 }, changes: [] })
    } finally {
      b.close()
    }
  })

  it("mirrors and turns a plan with an opening pattern: its door swings the other way with the plain doors, and nothing else changed (LVL-8)", async () => {
    const rows = compileRoomsText([
      'walls outside 0.3 inside 0.1 height 2.6',
      'unit cell',
      '  room room "Cell {n}" office 3 x 4',
      '  door door in room north, centred, 0.9 wide, opens into room, hinged west',
      'end',
      'repeat cell 3 east as 1 at 0,0',
      'room store "Store" storage 2 x 4 east of 3',
    ].join('\n')).plan!
    const front = { id: 'front', wall: 'ext-south', opening: { type: 'door', width: 0.9, height: 2.1, hinge: 'start', swing: 'left' }, count: 3, margins: { start: 1, end: 1 } }
    const b = bench({ 'plan.json': { ...rows, patterns: [front] } })
    const stated = (): { opening: { swing?: string } } => (JSON.parse(readFileSync(join(b.folder, 'plan.json'), 'utf8')) as { patterns: Array<{ opening: { swing?: string } }> }).patterns[0]!
    try {
      expect((await b.call('grid_mark_start', {})).isError).toBe(false)
      const mirrored = await b.call('grid_mirror', { how: 'left-right' })
      expect(mirrored.isError, mirrored.text).toBe(false)
      expect(mirrored.text).toContain('Its opening pattern stays a pattern, and the openings it places follow its wall.')
      expect(stated()).toEqual({ ...front, opening: { ...front.opening, swing: 'right' } })
      const once = await b.call('grid_diff', {})
      expect(once.isError, once.text).toBe(false)
      expect(firstLine(once.text)).toBe('The plan is mirrored left to right (east and west swap), and every room keeps its size.')
      expect(once.text).toContain('Changes: none.')

      expect((await b.call('grid_mark_start', {})).isError).toBe(false)
      const turned = await b.call('grid_mirror', { turn: 90 })
      expect(turned.isError, turned.text).toBe(false)
      expect(stated().opening.swing).toBe('right')
      const twice = await b.call('grid_diff', {})
      expect(firstLine(twice.text)).toBe('The plan is turned a quarter counter-clockwise, and every room keeps its size.')
      expect(twice.text).toContain('Changes: none.')
    } finally {
      b.close()
    }
  })

  it('says a quarter turn is a quarter turn, from grid edit mirror --turn, either way', async () => {
    const dir = project()
    expect((await grid(dir, 'mark', 'start')).status).toBe(0)
    const turned = await grid(dir, 'edit', 'mirror', '--turn', '90')
    expect(turned.status, turned.err).toBe(0)
    expect(turned.out).toContain('Turned the plan a quarter counter-clockwise (90°) about the middle of its walls')
    const after = await grid(dir, 'diff')
    expect(after.status, after.err).toBe(0)
    expect(firstLine(after.out)).toBe('The plan is turned a quarter counter-clockwise, and every room keeps its size.')
    expect(after.out).toContain('Changes: none.')
    expect((await grid(dir, 'mark', 'start')).status).toBe(0)
    expect((await grid(dir, 'edit', 'mirror', '--turn', '-90')).status).toBe(0)
    expect(firstLine((await grid(dir, 'diff')).out)).toBe('The plan is turned a quarter clockwise, and every room keeps its size.')
  })
})

describe('a one-number edit to a flat written rooms first (done-when 2)', () => {
  it('has at most two change lines and says the kitchen door stayed where it was', async () => {
    const dir = project({ 'flat.rooms': roomsText })
    expect((await grid(dir, 'write', 'flat.rooms')).status).toBe(0)
    expect((await grid(dir, 'mark')).status).toBe(0)
    writeFileSync(join(dir, 'flat.rooms'), roomsText.replace('living   4.4 x 4.2', 'living   4.7 x 4.2'))
    expect((await grid(dir, 'write', 'flat.rooms', '--replace')).status).toBe(0)
    const run = await grid(dir, 'diff', '--json')
    const data = JSON.parse(run.out) as { roomsFirst: boolean; changes: Array<{ text: string }>; stayed: Array<{ opening: string; text: string }> }
    expect(data.roomsFirst).toBe(true)
    expect(data.changes.length).toBeLessThanOrEqual(2)
    expect(data.stayed.find((s) => s.opening === 'door-kitchen')?.text).toMatch(/^Door "door-kitchen" stayed where it was/)
  })
})

describe('a survey written rooms first whose rear wall was made thinner (WRT-19)', () => {
  it('lists the wall before and after, in the text and the data, and names it in the rooms behind it', async () => {
    const dir = project({ 'flat.rooms': roomsText.replace('walls outside 0.3 ', 'walls outside 0.34 ') })
    expect((await grid(dir, 'write', 'flat.rooms')).status).toBe(0)
    expect((await grid(dir, 'mark')).status).toBe(0)
    const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { walls: Array<{ id: string; thickness: number }> }
    plan.walls.find((w) => w.id === 'ext-north')!.thickness = 0.3
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
    const text = await grid(dir, 'diff')
    expect(text.status, text.err).toBe(0)
    expect(text.out).toContain('Wall "ext-north" thickness 0.34 → 0.30 m, by "Kitchen", "Hall" and "Bedroom 2"')
    expect(text.out).toContain('because wall "ext-north" went from 0.34 to 0.30 m thick')
    const data = JSON.parse((await grid(dir, 'diff', '--json')).out) as { roomsFirst: boolean; changes: Array<{ text: string; entities: Array<{ type: string; id: string }> }>; rooms: Array<{ room: string; walls: string[] }> }
    expect(data.roomsFirst).toBe(true)
    expect(data.changes.filter((c) => c.entities.some((e) => e.type === 'wall')).map((c) => c.entities)).toEqual([[{ type: 'wall', id: 'ext-north' }]])
    expect(data.rooms.find((r) => r.room === 'kitchen')?.walls).toEqual(['ext-north'])
  })
})

describe('a house written again with a floor above it (WRT-20)', () => {
  it('says the floor added with its rooms, and the rooms below it as they were', async () => {
    const ground = 'room living "Living" living 2.8 x 4.7 at 0.15,0.15\nroom kitchen "Kitchen" kitchen 2.8 x 4.7 east of living\n'
    const head = 'plan "House"\nwalls outside 0.3 inside 0.1 height 2.7\n'
    const dir = project({ 'house.rooms': `${head}\n${ground}` })
    expect((await grid(dir, 'write', 'house.rooms')).status).toBe(0)
    expect((await grid(dir, 'mark')).status).toBe(0)
    writeFileSync(join(dir, 'house.rooms'), `${head}\nfloor ground "Ground floor" level 0\n${ground}\nfloor first "First floor" level 1\ncopy ground\nrename living bed "Bedroom" bedroom\nrename kitchen bath "Bath" -\n`)
    expect((await grid(dir, 'write', 'house.rooms', '--replace')).status).toBe(0)
    const run = await grid(dir, 'diff')
    expect(run.status, run.err).toBe(0)
    expect(run.out).toMatch(/Floor added: "First floor", 2 rooms, \d+\.\d\d m²/)
    expect(run.out).not.toContain('moved to floor')
    const data = JSON.parse((await grid(dir, 'diff', '--json')).out) as { rooms: Array<{ room: string; status: string }> }
    expect(data.rooms.filter((r) => r.room === 'living' || r.room === 'kitchen').map((r) => r.status)).toEqual(['unchanged', 'unchanged'])
  })
})

describe('a mezzanine written again lower down (WRT-25)', () => {
  it('says the move in the write verdict and in grid diff, with both elevations', async () => {
    const text = (elevation: string): string =>
      `plan "Warehouse"\nwalls outside 0.3 inside 0.1 height 3\nfloor ground "Ground" level 0 elevation 0 height 13\nroom hall "Hall" storage 20 x 10 at 0,0\nfloor mezz "Mezzanine" level 1 elevation ${elevation} height 3\nroom office "Office" office 6 x 4 at 0,0\n`
    const dir = project({ 'store.rooms': text('13.75') })
    expect((await grid(dir, 'write', 'store.rooms')).status).toBe(0)
    expect((await grid(dir, 'mark')).status).toBe(0)
    writeFileSync(join(dir, 'store.rooms'), text('4.25'))
    const written = await grid(dir, 'write', 'store.rooms')
    expect(written.status, written.err).toBe(0)
    expect(written.out).not.toContain('the same building')
    expect(written.out).toContain('but floor "Mezzanine" moved down 9.50 m: elevation 13.75 m → 4.25 m.')
    const run = await grid(dir, 'diff')
    expect(run.status, run.err).toBe(0)
    // VEW-33: the ground floor's walls now rise past the lowered mezzanine, and the check says so.
    expect(run.out).toContain('Verdict: 2 issues to look at first. 1 change, room by room: Floor "Mezzanine" moved down 9.50 m: elevation 13.75 m → 4.25 m; 2 rooms as they were.')
    expect(run.out).not.toContain('wall or opening change')
    const data = JSON.parse((await grid(dir, 'diff', '--json')).out) as { sameBuilding: boolean; floors: unknown[] }
    expect(data.sameBuilding).toBe(false)
    expect(data.floors).toEqual([expect.objectContaining({ floor: 'mezz', elevation: { before: 13.75, after: 4.25 }, stands: { before: 13.75, after: 4.25 } })])
  })
})

describe('the markers', () => {
  it('keeps at most a few, replaces one set again, takes one off, and names them when one is missing', async () => {
    const dir = project()
    for (let i = 1; i <= MARKERS_MAX; i++) expect((await grid(dir, 'mark', `m${i}`)).status).toBe(0)
    const sixth = await grid(dir, 'mark', 'm6')
    expect(sixth.status).toBe(1)
    expect(sixth.err).toContain(`at most ${MARKERS_MAX} markers`)
    expect(await grid(dir, 'mark', 'm1')).toMatchObject({ status: 0, out: expect.stringContaining('Set marker "m1"') })
    expect((await grid(dir, 'mark', 'm2', '--remove')).status).toBe(0)
    expect(readMarkers(openProject(dir, dir), 'plan.json').map((m) => m.name)).toEqual(['m1', 'm3', 'm4', 'm5'])
    const missing = await grid(dir, 'diff', '--since', 'start')
    expect(missing).toMatchObject({ status: 1 })
    expect(missing.err).toContain('The plan has no marker "start": it has m1, m3, m4, m5.')
    expect((await grid(dir, 'mark', 'git')).err).toContain('names the last committed version')
    expect((await grid(dir, 'diff', '--show', 'everything')).status).toBe(2)
  })

  it('refuses to compare with nothing, saying how to set a marker', async () => {
    const dir = project()
    const run = await grid(dir, 'diff')
    expect(run.status).toBe(1)
    expect(run.err).toContain('There is nothing to compare the plan with')
    expect(run.err).toContain('grid mark start')
  })
})

describe.skipIf(!gitThere)('the last committed version, read from the project\'s .git without running git', () => {
  it('reads a loose object, then the same after the objects are packed with deltas', async () => {
    const dir = project()
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'add', 'plan.json')
    git(dir, 'commit', '-q', '-m', 'first')
    const p = openProject(dir, dir)
    expect(lastCommitted(p, 'plan.json')).toMatchObject({ text: flat, branch: 'refs/heads/main' })

    // A second version, committed, then everything packed: the plan comes back from a delta.
    const changed = flat.replace('"Bedroom 2"', '"Box room"')
    writeFileSync(join(dir, 'plan.json'), changed)
    git(dir, 'commit', '-q', '-am', 'second')
    git(dir, 'gc', '-q', '--aggressive')
    expect(existsSync(join(dir, '.git', 'objects', 'pack'))).toBe(true)
    expect(lastCommitted(p, 'plan.json').text).toBe(changed)

    // An edit since: grid diff with no marker compares with git.
    writeFileSync(join(dir, 'plan.json'), changed.replace('"Box room"', '"Study"'))
    const run = await grid(dir, 'diff')
    expect(run.status, run.err).toBe(0)
    expect(run.out).toContain('Compared with the plan as last committed on main')
    expect(run.out).toContain('"Box room" renamed "Study"')
  })

  it('says why when the plan is not in the last commit', async () => {
    const dir = project({ 'plan.json': flat, 'other.json': flat })
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'add', 'other.json')
    git(dir, 'commit', '-q', '-m', 'first')
    const run = await grid(dir, 'diff', 'plan.json', '--since', 'git')
    expect(run.status).toBe(1)
    expect(run.err).toContain('"plan.json" is not in the last commit')
  })
})

describe('openings on a wall that moved (WRT-12)', () => {
  it('says, after a side moved 0.5 m east, that its windows moved with their wall and none stayed', async () => {
    const b = bench({ 'plan.json': JSON.parse(flat) as unknown })
    try {
      expect((await b.call('grid_mark_start', {})).isError).toBe(false)
      const edit = await b.call('grid_move_room_side', { room: 'bed1', side: 'east', by: 0.5 })
      expect(edit.isError, edit.text).toBe(false)
      const reply = await b.call('grid_diff', { picture: false })
      expect(reply.isError, reply.text).toBe(false)
      expect(reply.text).toContain('Openings that moved with their wall or room (2):\n  Window "win-bath" moved with its wall, 0.50 m east on the drawing, in "Bathroom"\n  Window "win-bed2" moved with its wall, 0.50 m east on the drawing, in "Bedroom 2"')
      expect(reply.text).not.toContain('stayed where it was')
      expect(reply.text).toContain('2 openings moved with their walls')
      const data = reply.data as { stayed: unknown[]; movedWith: Array<{ opening: string; with: string; by: number[] }> }
      expect(data.stayed).toEqual([])
      expect(data.movedWith.map((m) => [m.opening, m.with])).toEqual([['win-bath', 'wall'], ['win-bed2', 'wall']])
      expect(data.movedWith[0]!.by[0]).toBeCloseTo(0.5, 6)
    } finally {
      b.close()
    }
  })
})

describe('a part whose phase changed between two versions (MSG-25)', () => {
  /** The flat with the phases named set on its parts, as its file. */
  const phased = (phases: Record<string, string>): string => {
    const plan = JSON.parse(flat) as { walls: { id: string }[]; openings: { id: string }[]; rooms: { id: string }[] }
    const set = <T extends { id: string }>(part: T): T => (phases[part.id] === undefined ? part : { ...part, phase: phases[part.id] })
    return JSON.stringify({ ...plan, walls: plan.walls.map(set), openings: plan.openings.map(set), rooms: plan.rooms.map(set) }, null, 2)
  }

  it('names a window blocked up since the marker, with its phase before and after', async () => {
    const dir = project({ 'plan.json': phased({ 'win-bath': 'demolished' }) })
    expect((await grid(dir, 'mark', 'start')).status).toBe(0)
    writeFileSync(join(dir, 'plan.json'), phased({ 'win-bath': 'demolished', 'win-bed1': 'demolished' }))
    const after = await grid(dir, 'diff', '--since', 'start')
    expect(after.status, after.err).toBe(0)
    expect(after.out).toContain('Changes (1):\n  1. Window "win-bed1" now to be demolished (was existing), in "Bedroom 1"')
    const json = JSON.parse((await grid(dir, 'diff', '--since', 'start', '--json')).out) as { sameBuilding: boolean; changes: { text: string; entities: unknown[] }[] }
    expect(json.sameBuilding).toBe(false)
    expect(json.changes).toEqual([{ text: 'Window "win-bed1" now to be demolished (was existing), in "Bedroom 1"', entities: [{ type: 'opening', id: 'win-bed1' }], rooms: ['bed1'] }])
  })

  it('compares the plan with itself by phase as before: the window to be demolished is removed', async () => {
    const dir = project({ 'plan.json': phased({ 'win-bed1': 'demolished' }) })
    const byPhase = await grid(dir, 'diff', '--since', 'phase')
    expect(byPhase.status, byPhase.err).toBe(0)
    expect(byPhase.out).toContain('Window removed: "win-bed1", 1.40 m wide, in "Bedroom 1"')
    expect(byPhase.out).not.toContain('now to be demolished')
  })
})

describe('the issues of a comparison by phase (CMD-31)', () => {
  it('says no door whose room the work replaces: the knock-through is the work', async () => {
    const dir = project({ 'plan.json': readFileSync(join(FIXTURES, 'refurbishment.json'), 'utf8') })
    const byPhase = await grid(dir, 'diff', '--since', 'phase', '--show', 'issues')
    expect(byPhase.status, byPhase.err).toBe(0)
    expect(byPhase.out).toContain('Issues: none.')
    expect(byPhase.out).not.toContain('Door "d-living"')
  })

  it('says an old window the work leaves between two rooms', async () => {
    const plan = JSON.parse(readFileSync(join(FIXTURES, 'refurbishment.json'), 'utf8')) as { walls: unknown[]; rooms: unknown[] }
    // A new room built against the old north wall, over the bathroom's window.
    plan.walls.push(
      { id: 'x1', start: [10, 6], end: [10, 9], thickness: 0.3, height: 2.7, kind: 'exterior', phase: 'new' },
      { id: 'x2', start: [10, 9], end: [5, 9], thickness: 0.3, height: 2.7, kind: 'exterior', phase: 'new' },
      { id: 'x3', start: [5, 9], end: [5, 6], thickness: 0.3, height: 2.7, kind: 'exterior', phase: 'new' },
    )
    plan.rooms.push({ id: 'utility', name: 'Utility room', use: 'utility', boundary: ['wn', 'x3', 'x2', 'x1'], phase: 'new' })
    const dir = project({ 'plan.json': JSON.stringify(plan) })
    const byPhase = await grid(dir, 'diff', '--since', 'phase', '--show', 'issues')
    expect(byPhase.status, byPhase.err).toBe(0)
    expect(byPhase.out).toContain('Issues (1):\n  1. Window "win-bath" now stands between "Bathroom" and "Utility room"; before the work one side of it was outside')
  })
})

describe('the floor a comparison is narrowed to (CMD-32)', () => {
  const head = 'plan "House"\nwalls outside 0.3 inside 0.1 height 2.7\n'
  const house = (kitchen: string, bath: string): string =>
    `${head}\nfloor ground "Ground floor" level 0\nroom living "Living" living 2.8 x 4.7 at 0.15,0.15\nroom kitchen "Kitchen" kitchen ${kitchen} x 4.7 east of living\n`
    + `\nfloor first "First floor" level 1\nroom bed "Bedroom" bedroom 2.8 x 4.7 at 0.15,0.15\nroom bath "Bath" bathroom ${bath} x 4.7 east of bed\n`
  /** A house of two floors, marked, then a room made wider on each floor. */
  async function edited(): Promise<string> {
    const dir = project({ 'house.rooms': house('2.8', '2.8') })
    const written = await grid(dir, 'write', 'house.rooms')
    expect(written.status, written.err).toBe(0)
    expect((await grid(dir, 'mark')).status).toBe(0)
    writeFileSync(join(dir, 'house.rooms'), house('3.4', '3.2'))
    const again = await grid(dir, 'write', 'house.rooms', '--replace')
    expect(again.status, again.err).toBe(0)
    return dir
  }

  it('refuses a floor the plan does not have, naming the floors it has, with or without a picture', async () => {
    const dir = await edited()
    for (const args of [['--floor', 'roof'], ['--floor', 'roof', '--picture', 'diff.png']]) {
      const run = await grid(dir, 'diff', ...args)
      expect(run.status).not.toBe(0)
      expect(run.out).toBe('')
      expect(run.err).toContain('--floor "roof" is not a floor of this plan. Its floors: "ground", "first".')
    }
    expect(existsSync(join(dir, 'diff.png'))).toBe(false)
  })

  it('lists only the changes on the floor asked for, and says how many it left out', async () => {
    const dir = await edited()
    const whole = await grid(dir, 'diff')
    expect(whole.status, whole.err).toBe(0)
    expect(whole.out).toContain('"Kitchen"')
    expect(whole.out).toContain('"Bath"')
    const first = await grid(dir, 'diff', '--floor', 'first')
    expect(first.status, first.err).toBe(0)
    const changes = first.out.slice(first.out.indexOf('Changes'))
    expect(changes).toMatch(/^Changes on floor "first" \(\d+ of \d+; \d+ on other floors or about none, left out\):/)
    expect(changes).toContain('Bath')
    expect(changes).not.toContain('Kitchen')
    const rooms = first.out.slice(first.out.indexOf('Rooms:'), first.out.indexOf('Changes'))
    expect(rooms).toContain('Bath')
    expect(rooms).not.toContain('Kitchen')
    const data = JSON.parse((await grid(dir, 'diff', '--floor', 'first', '--json')).out) as { floor: string; otherFloors: number; changes: Array<{ text: string }>; rooms: Array<{ room: string }> }
    expect(data.floor).toBe('first')
    expect(data.otherFloors).toBeGreaterThan(0)
    expect(data.changes.some((c) => c.text.includes('Kitchen'))).toBe(false)
    expect(data.changes.some((c) => c.text.includes('Bath'))).toBe(true)
    expect(data.rooms.map((r) => r.room)).not.toContain('kitchen')
    const all = JSON.parse((await grid(dir, 'diff', '--json')).out) as { floor: null; otherFloors: number; changes: unknown[] }
    expect(all).toMatchObject({ floor: null, otherFloors: 0 })
    expect(all.changes.length).toBe(data.changes.length + data.otherFloors)
    const drawn = await grid(dir, 'diff', '--floor', 'first', '--picture', 'diff.png')
    expect(drawn.status, drawn.err).toBe(0)
    expect(drawn.out).toContain('Wrote the picture of floor "first"')
    expect(drawn.out.slice(drawn.out.indexOf('Changes'))).not.toContain('Kitchen')
  })

  it('CMD-35: --out writes the picture as --picture does, and both together are refused', async () => {
    const dir = await edited()
    const out = await grid(dir, 'diff', '--floor', 'first', '--out', 'by-out.png')
    expect(out.status, out.err).toBe(0)
    expect(out.out).toContain('Wrote the picture of floor "first" to by-out.png')
    const both = await grid(dir, 'diff', '--out', 'a.png', '--picture', 'b.png')
    expect(both.status).toBe(2)
    expect(both.err).toContain('--out and --picture are the same file')
  })

  it('narrows the tool the same way, and refuses an unknown floor there too', async () => {
    const dir = await edited()
    const b = bench({ 'plan.json': JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as unknown, 'plan.markers.json': JSON.parse(readFileSync(join(dir, 'plan.markers.json'), 'utf8')) as unknown })
    try {
      const reply = await b.call('grid_diff', { floor: 'ground', picture: false })
      expect(reply.isError, reply.text).toBe(false)
      expect(reply.text).toMatch(/Changes on floor "ground" \(\d+ of \d+;/)
      expect(reply.text.slice(reply.text.indexOf('Changes'))).not.toContain('Bath')
      expect(reply.data).toMatchObject({ floor: 'ground', picture: null })
      const refused = await b.call('grid_diff', { floor: 'roof' })
      expect(refused.isError).toBe(true)
      expect(refused.text).toContain('Its floors: "ground" and "first"')
    } finally {
      b.close()
    }
  })
})
