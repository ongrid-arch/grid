/**
 * HND-11 (lab WR-14): the lab's tape survey drawn from its own numbers, its outside walls placed
 * by the inside faces the tape ran along with their thickness left out, and the lengths taped
 * kept beside the drawing. Every run says each one taped against drawn: `grid_check` and `grid
 * check`, and the answer of every change, as BRF-1's brief lines do. And Grid's edits keep a wall
 * placed by its face so: the face is moved, never a centre point written as one.
 *
 * The lab stores no list of the tape's figures, so the taped lengths are the ones the lab's
 * as-taped drawing (`I/scenarios/s3-tape-survey/attempt-3-as-taped-fixed.json`) gives, to the
 * millimetre, as a tape reads them.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { tapedLengths, type TapedRow } from '@ongrid/floorplan/geometry'
import { faceFromCentre, parseFloorPlan, type Taped } from '@ongrid/floorplan/types/floorplan'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { runGrid } from '../../command/main'

const AS_TAPED = 'I/scenarios/s3-tape-survey/attempt-3-as-taped-fixed.json'
const THICKER = 'I/scenarios/s3-tape-survey/probe-thicker-walls.json'

type Raw = Record<string, unknown>
type RawPlan = Raw & { walls: Raw[]; rooms: Array<{ id: string; boundary: string[] }> }

const rawOf = (name: string): RawPlan => JSON.parse(labPlanText(name)) as RawPlan

/** The as-taped flat with its outside walls by their inside faces and no thickness; `row` too, by its south face, when asked. */
function byFaces(options: { thickness?: number; row?: boolean } = {}): RawPlan {
  const raw = rawOf(AS_TAPED)
  return {
    ...raw,
    walls: raw.walls.map((wall) => {
      const face = wall['kind'] === 'exterior' ? 'left' : options.row === true && wall['id'] === 'row' ? 'right' : null
      if (face === null) return wall
      const [start, end] = faceFromCentre(wall['start'] as [number, number], wall['end'] as [number, number], face, wall['thickness'] as number)
      const { thickness, ...rest } = wall
      const stated = wall['kind'] === 'exterior' ? options.thickness : (thickness as number)
      return { ...rest, start, end, face, ...(stated === undefined ? {} : { thickness: stated }) }
    }),
  }
}

/** Each room's side along each outside wall and both its diagonals, as the as-taped drawing gives them. */
function tapes(): Taped[] {
  const plan = parseFloorPlan(rawOf(AS_TAPED))
  const taped: Taped[] = []
  for (const room of plan.rooms) {
    const [a, b, c, d] = room.boundary as [string, string, string, string]
    for (const wall of room.boundary.filter((id) => id.startsWith('ext-'))) taped.push({ room: room.id, wall, length: 0 })
    taped.push({ room: room.id, from: [d, a], to: [b, c], length: 0 }, { room: room.id, from: [a, b], to: [c, d], length: 0 })
  }
  const rows = tapedLengths({ ...plan, taped })
  return taped.map((entry, i) => ({ ...entry, length: Math.round(rows[i]!.drawn! * 1000) / 1000 }))
}

const TAPES = tapes()
const rowsOf = (data: Record<string, unknown> | undefined): TapedRow[] => (data?.['taped'] as TapedRow[] | undefined) ?? []

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

describe('lab WR-14: the taped lengths against the drawing, after every run', () => {
  it('grid_check gives the table: every length agrees with the walls by their faces and their thickness unknown', async () => {
    b = bench({ 'flat.json': { ...byFaces(), taped: TAPES } })
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(check.isError).toBe(false)
    expect(check.text).toContain(`Taped against drawn (${TAPES.length}; none differ)`)
    expect(check.text).toMatch(/Bedroom, the side along wall "ext-s" +3\.470 m +3\.470 m +0\.000 +agrees \(within 0\.010 m\)/)
    expect(rowsOf(check.data).map((row) => row.state)).toEqual(TAPES.map(() => 'agrees'))
    expect(check.data?.['lines'] as Array<{ code: string }>).not.toContainEqual(expect.objectContaining({ code: 'room/taped-differs' }))
  })

  it('names each taped length the lab\'s thicker guess on centre lines moved, and none when the outside walls are by their faces', async () => {
    const thicker = rawOf(THICKER)
    b = bench({ 'centre.json': { ...thicker, taped: TAPES }, 'faces.json': { ...byFaces({ thickness: 0.4 }), taped: TAPES } })
    const centre = await b.call('grid_check', { plan: 'centre.json' })
    const differs = (centre.data?.['lines'] as Array<{ code: string; message: string; found: string }>).filter((line) => line.code === 'room/taped-differs')
    expect(differs.length).toBeGreaterThan(10)
    expect(differs[0]!.message).toMatch(/^The side along wall "ext-s" taped in Room "Bedroom" is not the length drawn$/)
    expect(differs[0]!.found).toMatch(/^3\.\d{3} m drawn against 3\.\d{3} m taped, 0\.\d{3} m shorter$/)
    const faces = await b.call('grid_check', { plan: 'faces.json' })
    expect(rowsOf(faces.data).every((row) => row.state === 'agrees')).toBe(true)
  })

  it('every change answers with the table; moving a wall placed by its face moves the face, and keeps its thickness unstated', async () => {
    b = bench({ 'flat.json': { ...byFaces(), taped: TAPES } })
    const moved = await b.call('grid_move_room_side', { plan: 'flat.json', room: 'bedroom', side: 'west', by: 0.2 })
    expect(moved.isError).toBe(false)
    expect(moved.text).toMatch(/Taped against drawn \(\d+; \d+ differs?\)/)
    expect(moved.text).toMatch(/Bedroom, the side along wall "ext-s" .* differs/)
    expect(rowsOf(moved.data).find((row) => row.room === 'bedroom' && row.walls[0] === 'ext-s')?.off).toBeCloseTo(0.2, 3)
    const file = JSON.parse(readFileSync(join(b.folder, 'flat.json'), 'utf8')) as RawPlan
    const west = file.walls.find((w) => w['id'] === 'ext-w')!
    expect(west).toMatchObject({ face: 'left' })
    expect(west).not.toHaveProperty('thickness')
    expect(west).not.toHaveProperty('placedBy')
    // The face was at x = 0.16, the inside of a 0.32 m wall on x = 0; it is 0.2 m further west.
    expect((west['start'] as number[])[0]).toBeCloseTo(-0.04, 9)
    expect((west['end'] as number[])[0]).toBeCloseTo(-0.04, 9)
  })

  it('cuts a wall placed by its face into pieces on the same face when two rooms are knocked into one', async () => {
    b = bench({ 'flat.json': { ...byFaces({ row: true }), taped: TAPES } })
    const merged = await b.call('grid_merge_rooms', { plan: 'flat.json', room: 'living', with: 'bedroom', use: 'living' })
    expect(merged.isError).toBe(false)
    expect(merged.text).toContain('Taped against drawn (')
    const file = JSON.parse(readFileSync(join(b.folder, 'flat.json'), 'utf8')) as RawPlan
    const pieces = file.walls.filter((w) => String(w['id']).startsWith('row'))
    expect(pieces.length).toBeGreaterThan(0)
    for (const piece of pieces) {
      expect(piece).toMatchObject({ face: 'right', thickness: 0.12 })
      // Still the south face of the 0.12 m wall on y = 3.42.
      expect((piece['start'] as number[])[1]).toBeCloseTo(3.36, 9)
      expect((piece['end'] as number[])[1]).toBeCloseTo(3.36, 9)
    }
    const read = parseFloorPlan(file).walls.filter((w) => w.id.startsWith('row'))
    for (const wall of read) expect(wall.start[1]).toBeCloseTo(3.42, 9)
  })

  it('mirrors a wall placed by its face onto its other face, so the inside faces stay inside', async () => {
    b = bench({ 'flat.json': { ...byFaces(), taped: TAPES } })
    const mirrored = await b.call('grid_mirror', { plan: 'flat.json', how: 'left-right' })
    expect(mirrored.isError).toBe(false)
    const file = JSON.parse(readFileSync(join(b.folder, 'flat.json'), 'utf8')) as RawPlan
    for (const wall of file.walls.filter((w) => w['kind'] === 'exterior')) expect(wall['face'], String(wall['id'])).toBe('right')
    // Every room keeps its size: the taped lengths, mirrored with it, all agree.
    expect(rowsOf(mirrored.data).every((row) => row.state === 'agrees')).toBe(true)
  })
})

describe('grid check on the command line', () => {
  const made: string[] = []
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('prints the taped-against-drawn table after the notes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-taped-'))
    made.push(dir)
    const plan = { ...byFaces(), taped: [...TAPES.slice(0, 2), { id: 'hall-width', room: 'hall', wall: 'ext-s', length: 1.4 }] }
    writeFileSync(join(dir, 'flat.json'), `${JSON.stringify(plan, null, 2)}\n`)
    let out = ''
    const status = await runGrid(['check', 'flat.json'], { stdout: (data) => (out += typeof data === 'string' ? data : Buffer.from(data).toString('utf8')), stderr: () => {}, stdoutIsTerminal: false, cwd: dir })
    expect(status).toBe(0)
    const table = out.slice(out.indexOf('Taped against drawn'))
    expect(table.split('\n').slice(0, 5)).toEqual([
      'Taped against drawn (3; 1 differs): each length taped on site, set against the drawing\'s inside faces.',
      expect.stringMatching(/^ {2}What was taped +taped +drawn +off$/),
      '  Bedroom, the side along wall "ext-s"  3.470 m  3.470 m   0.000  agrees (within 0.010 m)',
      '  Bedroom, the side along wall "ext-w"  3.200 m  3.200 m   0.000  agrees (within 0.010 m)',
      expect.stringMatching(/^ {2}Hall, the side along wall "ext-s" +1\.400 m +1\.\d{3} m +-0\.\d{3} +differs \(within 0\.010 m\)$/),
    ])
    expect(out).toContain('room/taped-differs')
  })
})

describe('lab MS-12: a plan at survey coordinates with a stored origin', () => {
  it('raises no unit error in grid_check once it states a point near the building as site.origin', async () => {
    const survey = JSON.parse(labPlanText('AU1/scenarios/MS-12/f16-survey-coordinates.json')) as RawPlan
    b = bench({ 'far.json': survey, 'kept.json': { ...survey, site: { origin: [432000, 4580000] } } })
    const codes = async (plan: string): Promise<string[]> => ((await b!.call('grid_check', { plan })).data?.['lines'] as Array<{ code: string }>).map((line) => line.code)
    expect(await codes('far.json')).toContain('plan/far-from-origin')
    const kept = await codes('kept.json')
    expect(kept).not.toContain('plan/far-from-origin')
    expect(kept).not.toContain('plan/units-question')
  })
})

describe('one bad reading among the taped lengths (ARE-31)', () => {
  const BAD: Array<[string, Record<string, unknown>]> = [
    ['a negative length', { room: 'hall', wall: 'ext-s', length: -1.4 }],
    ['a zero length', { room: 'hall', wall: 'ext-s', length: 0 }],
    ['a length written as a word', { room: 'hall', wall: 'ext-s', length: 'long' }],
    ['no length', { room: 'hall', wall: 'ext-s' }],
    ['neither a wall nor corners', { room: 'hall', length: 1.4 }],
    ['a wall and corners', { room: 'hall', wall: 'ext-s', from: ['a', 'b'], to: ['c', 'd'], length: 1.4 }],
    ['one corner only', { room: 'hall', from: ['ext-s', 'ext-w'], length: 1.4 }],
    ['a corner with one wall', { room: 'hall', from: ['ext-s'], to: ['ext-w', 'row'], length: 1.4 }],
    ['a tolerance below zero', { room: 'hall', wall: 'ext-s', length: 1.4, tolerance: -0.01 }],
    ['an entry that is not an object', 7 as unknown as Record<string, unknown>],
    ['a null entry', null as unknown as Record<string, unknown>],
  ]
  for (const [what, bad] of BAD) {
    it(`leaves out ${what} with its own line and still checks the others`, async () => {
      b = bench({ 'flat.json': { ...byFaces(), taped: [TAPES[0]!, bad, TAPES[1]!] } })
      const check = await b.call('grid_check', { plan: 'flat.json' })
      expect(check.isError).toBe(false)
      expect(check.text).toContain('Taped against drawn (2; none differ)')
      expect(check.text).toMatch(/taped\[1\]/)
      expect(rowsOf(check.data).map((row) => row.state)).toEqual(['agrees', 'agrees'])
    })
  }

  it('says every bad reading, each at its place, and checks the good ones between them', async () => {
    const taped = [{ room: 'hall', wall: 'ext-s', length: -1 }, TAPES[0]!, { room: 'hall', length: 2 }, TAPES[1]!, { room: 'hall', wall: 'ext-s', length: 'x' }]
    b = bench({ 'flat.json': { ...byFaces(), taped } })
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(check.text).toContain('Taped against drawn (2; none differ)')
    for (const at of [0, 2, 4]) expect(check.text).toContain(`taped[${at}]`)
  })

  it('measures what it can when a plan is given straight to tapedLengths with a bad length in it', () => {
    const plan = parseFloorPlan(rawOf(AS_TAPED))
    const rows = tapedLengths({ ...plan, taped: [{ room: 'hall', wall: 'ext-s', length: -1 }, TAPES[0]!, { room: 'hall', wall: 'ext-s', length: Number.NaN }, TAPES[1]!] })
    expect(rows.map((row) => row.state)).toEqual(['not-measured', 'agrees', 'not-measured', 'agrees'])
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3])
  })
})
