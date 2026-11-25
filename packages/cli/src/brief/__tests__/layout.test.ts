/**
 * BRF-6: from a list of rooms and sizes to a first layout.
 *
 * Lab WR-19: an estate agent's listing gives five rooms with their inside sizes. The lab's agent
 * drew them twice (`I/scenarios/s4-listing/`): keeping every size took a stepped outline and a
 * nine-sided hall (`attempt-1-exact-sizes.json`); a tidy outline left three rooms too large
 * (`attempt-2-tidy-outline.json`). The sizes below are the five rooms as the exact-sizes plan
 * draws them, to the faces of the walls: the listing's own text is not kept in the lab data.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import type { BriefLine } from '../lines'
import { runGrid } from '../../command/main'

const LAB = resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')

function labPlan(name: string): unknown {
  for (const line of gunzipSync(readFileSync(LAB)).toString('utf8').split('\n')) {
    if (line.length === 0) continue
    const stored = JSON.parse(line) as { name: string; text: string }
    if (stored.name === name) return JSON.parse(stored.text)
  }
  throw new Error(`${name} is not in the lab data`)
}

const EXACT = 'I/scenarios/s4-listing/attempt-1-exact-sizes.json'
const TIDY = 'I/scenarios/s4-listing/attempt-2-tidy-outline.json'

/** The estate agent's five rooms, each with its inside size as listed. */
export const LISTING = {
  rooms: [
    { name: 'Bedroom 1', use: 'bedroom', inside: [4.1, 3.2], level: 'must', source: 'given', quote: 'Bedroom 1, 4.10 x 3.20 m' },
    { name: 'Kitchen', quote: 'kitchen 10 x 12 ft', use: 'kitchen', inside: [2.4, 3.0], level: 'must', source: 'given', quote: 'Kitchen, 2.40 x 3.00 m' },
    { name: 'Bathroom', use: 'bathroom', inside: [1.7, 2.0], level: 'must', source: 'given', quote: 'Bathroom, 1.70 x 2.00 m' },
    { name: 'Lounge', use: 'living', inside: [4.5, 3.6], level: 'must', source: 'given', quote: 'Lounge, 4.50 x 3.60 m' },
    { name: 'Bedroom 2', use: 'bedroom', inside: [2.7, 3.1], level: 'must', source: 'given', quote: 'Bedroom 2, 2.70 x 3.10 m' },
  ],
}

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

const linesOf = (data: Record<string, unknown> | undefined): BriefLine[] => data?.['lines'] as BriefLine[]
const missed = (lines: readonly BriefLine[]): string[] => lines.filter((l) => l.state === 'missed').map((l) => l.text)

describe('WR-19: the estate agent\'s five rooms', () => {
  it('today: the agent fits them alone, and the tidy outline leaves three rooms too large', async () => {
    b = bench({ 'exact.json': labPlan(EXACT), 'tidy.json': labPlan(TIDY) })
    for (const plan of ['exact.json', 'tidy.json']) {
      const brief = await b.call('grid_write_brief', { plan, brief: LISTING })
      expect(brief.isError, brief.text).toBe(false)
    }
    // Keeping every size: the five rooms are as listed.
    const exact = await b.call('grid_write_brief', { plan: 'exact.json' })
    expect(missed(linesOf(exact.data))).toEqual([])
    // The tidy outline: three rooms deeper than listed, 0.48, 2.04 and 1.35 m² too large.
    const tidy = await b.call('grid_write_brief', { plan: 'tidy.json' })
    expect(missed(linesOf(tidy.data))).toEqual([
      'missed (must): "Kitchen" inside asked 2.4 x 3, drawn 2.40 x 3.20 m.',
      'missed (must): "Bathroom" inside asked 1.7 x 2, drawn 1.70 x 3.20 m.',
      'missed (must): "Bedroom 2" inside asked 2.7 x 3.1, drawn 2.70 x 3.60 m.',
    ])
  })

  it('done when: the five rooms produce a first layout, with each size not kept and by how much', async () => {
    b = bench({})
    const brief = await b.call('grid_write_brief', { plan: 'plan.json', brief: LISTING })
    expect(brief.isError, brief.text).toBe(false)
    const done = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'tidy' })
    expect(done.isError, done.text).toBe(false)
    const layout = done.data?.['layout'] as { shape: string; rooms: string; outline: number[]; added: string | null; notKept: Array<{ room: string; text: string; by: number }>; notPlaced: string[] }
    expect(layout.shape).toBe('tidy')
    expect(layout.added).toBe('Hall')
    expect(layout.outline).toEqual([7, 8.9])
    expect(layout.rooms).toBe([
      '# A first layout from the brief (BRF-6), in a rectangle: rooms that do not fit it are made larger. Change it and write it again.',
      'room hall "Hall" corridor 7 x 1.1',
      'room kitchen "Kitchen" kitchen 2.4 x 3.1 south of hall align west',
      'room bathroom "Bathroom" bathroom 1.7 x 3.1 east of kitchen align north',
      'room bedroom-2 "Bedroom 2" bedroom 2.7 x 3.1 east of bathroom align north',
      'room bedroom-1 "Bedroom 1" bedroom 3.3 x 4.5 north of hall align west',
      'room lounge "Lounge" living 3.6 x 4.5 east of bedroom-1 align south',
      '',
    ].join('\n'))
    // Each size not kept, in the brief's own line for it, and by how much.
    expect(layout.notKept.map((x) => [x.room, x.by, x.text])).toEqual([
      ['kitchen', 0.24, 'met (must): "Kitchen" inside asked 2.4 x 3, drawn 2.40 x 3.10 m: 0.24 m² more.'],
      ['bathroom', 1.87, 'missed (must): "Bathroom" inside asked 1.7 x 2, drawn 1.70 x 3.10 m: 1.87 m² more.'],
      ['bedroom-1', 1.73, 'missed (must): "Bedroom 1" inside asked 4.1 x 3.2, drawn 3.30 x 4.50 m: 1.73 m² more.'],
    ])
    expect(layout.notPlaced).toEqual([])
    expect(done.text).toContain('Sizes not kept (3):\n  met (must): "Kitchen" inside asked 2.4 x 3, drawn 2.40 x 3.10 m: 0.24 m² more.')
    expect(done.text).toContain('Added "Hall", 1.10 m wide (Grid\'s own size, not a code figure)')
    expect(done.text).toContain('It places no door or window')

    // An ordinary plan written from rooms text: it reads back as the rooms it holds, and the check
    // finds nothing in the drawing but the doors not yet placed.
    const plan = JSON.parse(readFileSync(join(b.folder, 'plan.json'), 'utf8')) as { written?: unknown; rooms: unknown[] }
    expect(plan.written).toBeDefined()
    expect(plan.rooms).toHaveLength(6)
    const check = await b.call('grid_check', { plan: 'plan.json' })
    expect(check.text).toContain('General guidance, not your local rules')
    expect(((check.data as { lines: Array<{ code: string }> }).lines).map((l) => l.code).sort()).toEqual(['floor/no-exit', 'room/no-door'])
    const back = await b.call('grid_describe', { plan: 'plan.json', as: 'rooms' })
    expect(compileRoomsText(back.text).problems).toEqual([])

    // The same brief gives the same plan, byte for byte.
    const first = readFileSync(join(b.folder, 'plan.json'), 'utf8')
    const again = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'tidy' })
    expect(again.isError, again.text).toBe(false)
    expect(readFileSync(join(b.folder, 'plan.json'), 'utf8')).toBe(first)
  })

  it('keeps every size with layout=sizes, the outline stepping', async () => {
    b = bench({})
    await b.call('grid_write_brief', { plan: 'plan.json', brief: LISTING })
    const done = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'sizes' })
    expect(done.isError, done.text).toBe(false)
    const layout = done.data?.['layout'] as { notKept: unknown[] }
    expect(layout.notKept).toEqual([])
    expect(done.text).toContain('Every size asked for is kept.')
    expect(missed(linesOf({ lines: (done.data?.['brief'] as { lines: BriefLine[] }).lines }))).toEqual([])
  })

  it('writes the same layout through grid write --layout, and refuses it with no brief', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-layout-'))
    try {
      const run = async (...args: string[]): Promise<{ status: number; out: string; err: string }> => {
        let out = ''
        let err = ''
        const status = await runGrid(args, { stdout: (d) => (out += typeof d === 'string' ? d : Buffer.from(d).toString('utf8')), stderr: (t) => (err += t), stdoutIsTerminal: false, cwd: dir })
        return { status, out, err }
      }
      expect((await run('init')).status).toBe(0)
      const none = await run('write', '--layout', 'tidy')
      expect(none.status).toBe(1)
      expect(none.err).toMatch(/^grid: No first layout was written: there is no brief beside the plan \("plan\.brief\.json"\)/)
      expect((await run('write', '--layout', 'square')).err).toContain('--layout takes tidy or sizes')
      expect((await run('write', 'plan.rooms', '--layout', 'tidy')).err).toContain('a rooms text file or --layout, not both')
      // HND-12's scan is a third way in: a layout and a scan together are refused, naming both.
      const withScan = await run('write', '--layout', 'tidy', '--scan', 'scans/flat.json')
      expect(withScan.status).toBe(2)
      expect(withScan.err).toContain('write takes --layout or --scan, not both')
      expect((await run('write')).err).toContain('grid write <plan.rooms>, --layout tidy|sizes or --scan <scan.json>')
      writeFileSync(join(dir, 'plan.brief.json'), JSON.stringify({ version: '1', ...LISTING }))
      const done = await run('write', '--layout', 'tidy')
      expect(done.status, done.err).toBe(0)
      expect(done.out).toContain('Sizes not kept (3):')
      expect(done.out).toContain('missed (must): "Bathroom" inside asked 1.7 x 2, drawn 1.70 x 3.10 m: 1.87 m² more.')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('names the rooms it could not place, and refuses rooms text, a layout and a scan together', async () => {
    b = bench({})
    await b.call('grid_write_brief', { plan: 'plan.json', brief: { rooms: [...LISTING.rooms, { use: 'bedroom', count: 3, level: 'should', source: 'assumed' }] } })
    const done = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'tidy' })
    expect(done.isError, done.text).toBe(false)
    expect((done.data?.['layout'] as { notPlaced: string[] }).notPlaced).toEqual(['"Bedroom 3": no size asked. Give it an area or an inside size in the brief.'])
    const both = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'tidy', rooms: 'room a "A" - 3 x 3' })
    expect(both.isError).toBe(true)
    expect(both.text).toContain('Pass rooms or layout, not both')
    const neither = await b.call('grid_write_rooms', { plan: 'plan.json' })
    expect(neither.isError).toBe(true)
    expect(neither.text).toContain('Pass rooms (the rooms text to write), layout (tidy or sizes, a first layout from the brief beside the plan) or scan')
    // HND-12: a scan is the third way in, and the answer carries it, null for a layout.
    expect(done.data?.['scan']).toBeNull()
    const withScan = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'tidy', scan: 'scans/flat.json' })
    expect(withScan.isError).toBe(true)
    expect(withScan.text).toContain('Pass layout or scan, not both')
    const all = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'tidy', scan: 'scans/flat.json', rooms: 'room a "A" - 3 x 3' })
    expect(all.isError).toBe(true)
    expect(all.text).toContain('Pass one of rooms, layout and scan, not all three')
  })
})

describe('a room asked for by its area alone', () => {
  it('is drawn at a shape a person can use beside deep rooms, and its area met', async () => {
    b = bench({})
    const brief = {
      rooms: [
        { name: 'Primary bedroom', quote: 'primary bedroom 13 x 14 ft', use: 'bedroom', inside: [3.96, 4.27], level: 'must', source: 'given' },
        { name: 'Bedroom', quote: 'bedroom 10 x 11 ft', use: 'bedroom', inside: [3.05, 3.35], level: 'must', source: 'given' },
        { name: 'Kitchen', quote: 'kitchen 10 x 12 ft', use: 'kitchen', inside: [3.05, 3.66], level: 'must', source: 'given' },
        { name: 'Living room', quote: 'living room 16 x 13 ft', use: 'living', inside: [4.88, 3.96], level: 'must', source: 'given' },
        { name: 'Half bath', use: 'bathroom', area: 2.79, level: 'must', source: 'given', quote: 'a half bath, about 30 square feet' },
      ],
    }
    expect((await b.call('grid_write_brief', { plan: 'plan.json', brief })).text).not.toContain('left out')
    const done = await b.call('grid_write_rooms', { plan: 'plan.json', layout: 'sizes' })
    expect(done.isError, done.text).toBe(false)
    const layout = done.data?.['layout'] as { rooms: string; notKept: unknown[] }
    expect(layout.notKept).toEqual([])
    expect(layout.rooms).toContain('room half-bath "Half bath" bathroom 1.2 x 2.325 ')
    const drawn = compileRoomsText(layout.rooms).rooms.find((r) => r.id === 'half-bath')!
    expect(Math.min(drawn.width, drawn.depth)).toBeGreaterThanOrEqual(1.2 - 1e-9)
    expect(missed(linesOf({ lines: (done.data?.['brief'] as { lines: BriefLine[] }).lines }))).toEqual([])
  })
})

describe('AB-11: a door between two rooms that do not touch', () => {
  it('is refused with the alignment that would make them touch, as the line to write', async () => {
    b = bench({})
    const rooms = [
      'room corridor "Corridor" corridor 1.2 x 7',
      'room bed1 "Bedroom 1" bedroom 3.5 x 3.4 west of corridor',
      'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1',
      'door d2 between bed2 and corridor, centred, 0.8 wide',
    ]
    const refused = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: rooms.join('\n') })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('\'bed2\' and \'corridor\' do not share a wall')
    expect(refused.text).toContain('With line 3 written \'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1 align east\', they share a wall.')
    // The line offered, written in its place, writes the plan.
    const fixed = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: [rooms[0], rooms[1], 'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1 align east', rooms[3]].join('\n') })
    expect(fixed.isError, fixed.text).toBe(false)
  })
})
