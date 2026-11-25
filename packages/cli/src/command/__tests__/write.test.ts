import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * `grid write` (WRT-2): a plan written rooms first, the walls worked out; `grid describe --as
 * rooms` reads it back; a write that would lose a change made some other way is refused with
 * the difference. Run in this process through `runGrid`, as the built file runs it.
 */

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.rooms'), 'utf8')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

interface Ran {
  readonly status: number
  readonly out: string
  readonly err: string
}

async function grid(dir: string, ...args: string[]): Promise<Ran> {
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

async function project(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'grid-write-'))
  made.push(dir)
  expect((await grid(dir, 'init')).status).toBe(0)
  writeFileSync(join(dir, 'plan.rooms'), FLAT)
  return dir
}

interface PlanFile {
  walls: Array<{ height: number }>
  rooms: Array<{ id: string; boundary: string[] }>
  written?: unknown
  projectId?: unknown
}

const planOf = (dir: string): PlanFile => JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as PlanFile

describe('grid write', () => {
  it('writes the project plan from rooms text over the starter plan, and says what it worked out', async () => {
    const dir = await project()
    const ran = await grid(dir, 'write', 'plan.rooms')
    expect(ran.err).toBe('')
    expect(ran.status).toBe(0)
    // MSG-3: the label first, then what was written.
    expect(ran.out).toMatch(/^General guidance, not your local rules\nWrote plan\.json from rooms text/)
    expect(ran.out).toContain('1 floor, 6 rooms; 9 walls and their kinds worked out; 13 openings placed')
    expect(ran.out).toContain('Sizes are to the inside faces unless a room says otherwise (the default).')
    const plan = planOf(dir)
    expect(plan.rooms.map((r) => r.id)).toEqual(['living', 'kitchen', 'bed1', 'hall', 'bath', 'bed2'])
    expect(plan.written).toMatchObject({ from: 'rooms' })
    // grid init's project id is kept: rooms text does not hold it.
    expect(typeof plan.projectId).toBe('string')
    expect((await grid(dir, 'check', '--json')).out).not.toContain('derived-edited')
    // Written again, nothing has changed in between: written again.
    expect((await grid(dir, 'write', 'plan.rooms')).out).toContain('is the same building as the plan before')
  })

  it('refuses to write over a change made some other way, with the difference, and writes nothing', async () => {
    const dir = await project()
    await grid(dir, 'write', 'plan.rooms')
    const plan = planOf(dir)
    plan.walls[0]!.height = 3
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const ran = await grid(dir, 'write', 'plan.rooms')
    expect(ran.status).toBe(1)
    expect(ran.out).toBe('')
    expect(ran.err.trim().split('\n')).toHaveLength(1)
    expect(ran.err).toMatch(/^grid: plan\.json was changed since Grid last wrote it from rooms text/)
    // The difference names the wall height the write would undo (lab AB-2).
    expect(ran.err).toContain('1 wall another height (3.00 → 2.60 m)')
    expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
    // --replace writes over it.
    expect((await grid(dir, 'write', 'plan.rooms', '--replace')).status).toBe(0)
  })

  it('reads the plan back as rooms text that writes it again, the change kept', async () => {
    const dir = await project()
    await grid(dir, 'write', 'plan.rooms')
    const plan = planOf(dir)
    plan.walls[0]!.height = 3
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
    const back = await grid(dir, 'describe', '--as', 'rooms')
    expect(back.status).toBe(0)
    expect(back.out).toMatch(/^based on [0-9a-f]{16}$/m)
    expect(back.out).toContain('height 3')
    writeFileSync(join(dir, 'back.rooms'), back.out)
    const ran = await grid(dir, 'write', 'back.rooms')
    expect(ran.err).toBe('')
    expect(ran.out).toContain('is the same building as the plan before: every wall, opening and room is where it was.')
    expect(planOf(dir).walls[0]!.height).toBe(3)
    // Read back from that version, it is refused once the plan changed again.
    const again = planOf(dir)
    again.walls[1]!.height = 2.4
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(again, null, 2))
    const stale = await grid(dir, 'write', 'back.rooms')
    expect(stale.status).toBe(1)
    expect(stale.err).toMatch(/^grid: This rooms text was read from another version of plan\.json/)
  })

  it('names a change of wall height in the comparison (lab AB-2)', async () => {
    const dir = await project()
    await grid(dir, 'write', 'plan.rooms')
    const higher = (await grid(dir, 'describe', '--as', 'rooms')).out.replace('height 2.6', 'height 2.7')
    writeFileSync(join(dir, 'higher.rooms'), higher)
    const ran = await grid(dir, 'write', 'higher.rooms')
    expect(ran.status).toBe(0)
    expect(ran.out).toContain('but 9 walls another height (2.60 → 2.70 m)')
  })

  describe('floors the rooms text does not mention', () => {
    const OUTLINE = '[[0,0],[6,0],[6,5],[0,5]]'
    const THREE = [
      'plan "Block"',
      'walls outside 0.3 inside 0.1 height 2.7',
      'floor ground "Ground floor" level 0',
      `raw floor {"homes": 4, "parking": 2, "outline": ${OUTLINE}}`,
      'room living "Living" living 4 x 4 at 0.15,0.15',
      'floor first "First floor" level 1',
      `raw floor {"homes": 6, "outline": ${OUTLINE}}`,
      'room bed "Bed" bedroom 4 x 4 at 0.15,0.15',
      'floor second "Second floor" level 2',
      'room study "Study" office 4 x 4 at 0.15,0.15',
      '',
    ].join('\n')
    const ONE = 'plan "Block"\nwalls outside 0.3 inside 0.1 height 2.7\nfloor ground "Ground floor" level 0\nroom living "Living" living 4 x 4 at 0.15,0.15\n'

    async function block(): Promise<string> {
      const dir = await project()
      writeFileSync(join(dir, 'block.rooms'), THREE)
      writeFileSync(join(dir, 'one.rooms'), ONE)
      const wrote = await grid(dir, 'write', 'block.rooms')
      expect(wrote.err).toBe('')
      expect(wrote.status).toBe(0)
      return dir
    }

    it('refuses to drop floors, naming each with what stands on it, and writes nothing', async () => {
      const dir = await block()
      const before = readFileSync(join(dir, 'plan.json'), 'utf8')
      const ran = await grid(dir, 'write', 'one.rooms')
      expect(ran.status).toBe(1)
      expect(ran.out).toBe('')
      expect(ran.err.trim().split('\n')).toHaveLength(1)
      expect(ran.err).toContain('has 2 floors this rooms text does not mention')
      expect(ran.err).toContain('First floor (first): 1 room, an outline, 6 homes')
      expect(ran.err).toContain('Second floor (second): 1 room')
      expect(ran.err).toContain('--replace')
      expect(ran.err).not.toContain('Ground floor')
      expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
    })

    it('drops them with --replace and says which, in the answer', async () => {
      const dir = await block()
      const ran = await grid(dir, 'write', 'one.rooms', '--replace')
      expect(ran.status).toBe(0)
      expect(ran.out).toContain('Floors dropped, as asked: First floor (first)')
      expect(ran.out).toContain('Second floor (second)')
    })

    it('writes the whole plan read back, which keeps every floor', async () => {
      const dir = await block()
      const back = await grid(dir, 'describe', '--as', 'rooms')
      writeFileSync(join(dir, 'back.rooms'), back.out)
      const ran = await grid(dir, 'write', 'back.rooms')
      expect(ran.err).toBe('')
      expect(ran.status).toBe(0)
      expect(ran.out).not.toContain('Floors dropped')
    })

    it('refuses rooms text with no rooms, with and without --replace', async () => {
      const dir = await project()
      await grid(dir, 'write', 'plan.rooms')
      writeFileSync(join(dir, 'empty.rooms'), 'plan "Nothing"\nwalls outside 0.3 inside 0.1 height 2.7\n')
      const before = readFileSync(join(dir, 'plan.json'), 'utf8')
      for (const extra of [[], ['--replace']]) {
        const ran = await grid(dir, 'write', 'empty.rooms', ...extra)
        expect(ran.status).toBe(1)
        expect(ran.err).toContain('it has no rooms, so it would write an empty plan')
        expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
      }
    })
  })

  it('refuses rooms that overlap in one line naming both, and leaves the plan as it was', async () => {
    const dir = await project()
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    writeFileSync(join(dir, 'bad.rooms'), 'walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 4 x 4\nroom bed "Bed" bedroom 3 x 4 at 3.6,0\n')
    const ran = await grid(dir, 'write', 'bad.rooms')
    expect(ran.status).toBe(1)
    expect(ran.err.trim().split('\n')).toHaveLength(1)
    expect(ran.err).toContain("rooms/overlap: Rooms 'living' (line 2) and 'bed' (line 3) overlap")
    expect(readFileSync(join(dir, 'plan.json'), 'utf8')).toBe(before)
  })

  it('refuses a room boundary edited by hand, with its own code', async () => {
    const dir = await project()
    await grid(dir, 'write', 'plan.rooms')
    const plan = planOf(dir)
    plan.rooms[3]!.boundary.reverse()
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
    const check = JSON.parse((await grid(dir, 'check', '--json')).out)
    expect(JSON.stringify(check)).toContain('room/derived-edited')
  })

  it('refuses options it does not take, and a plan given as the rooms file', async () => {
    const dir = await project()
    expect((await grid(dir, 'write', 'plan.json')).err).toContain('write reads rooms text, not a plan')
    expect((await grid(dir, 'write', 'plan.rooms', '--floor', 'x')).status).toBe(2)
    expect((await grid(dir, 'describe', '--as', 'rooms', '--for', 'agent')).err).toContain('--as rooms reads the plan back as rooms text, which has no --for')
  })

  it('reminds the first write over the starter plan that no brief is kept, in one line, and writes it (BRF-1)', async () => {
    const dir = await project()
    const first = await grid(dir, 'write', 'plan.rooms')
    expect(first.status).toBe(0)
    expect(first.err).toBe('')
    expect(first.out.split('\n').filter((line) => line.startsWith('No brief is kept beside this plan ("plan.brief.json")'))).toHaveLength(1)
    expect(planOf(dir).written).toMatchObject({ from: 'rooms' })
    const again = await grid(dir, 'write', 'plan.rooms')
    expect(again.out).not.toContain('No brief is kept')
  })

  it('says each line of the brief beside the plan after the write, and after an edit (BRF-1)', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'plan.brief.json'), JSON.stringify({ version: '1', rooms: [{ name: 'Bathroom', area: 4.5, level: 'must', source: 'given', quote: 'a bathroom of 4.5' }] }))
    const ran = await grid(dir, 'write', 'plan.rooms')
    expect(ran.status).toBe(0)
    expect(ran.out).not.toContain('No brief is kept')
    expect(ran.out).toMatch(/(met|missed) \(must\): "Bathroom" area asked 4\.5, drawn \d+\.\d\d m²\./)
    const edit = await grid(dir, 'edit', 'rename', '--room', 'bed1', '--name', 'Main bedroom')
    expect(edit.status).toBe(0)
    expect(edit.out).toMatch(/"Bathroom" area asked 4\.5, drawn \d+\.\d\d m²\./)
  })

  it('keeps a wall height the text did not state out of the plan file, so the check names no field of its own (found with BRF-6)', async () => {
    const dir = await project()
    writeFileSync(join(dir, 'bare.rooms'), 'room a "A" - 3 x 3\nroom b "B" - 3 x 3 east of a\n')
    expect((await grid(dir, 'write', 'bare.rooms')).status).toBe(0)
    const walls = (JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { walls: Array<Record<string, unknown>> }).walls
    expect(walls.filter((w) => 'unstated' in w || 'height' in w)).toEqual([])
    const check = await grid(dir, 'check', '--json')
    expect(check.out).not.toContain('plan/unknown-field')
  })
})
