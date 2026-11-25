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
