/**
 * CMD-43: `grid write --from` and `grid_write_rooms` with `from`: the rooms text written beside
 * the plan, the plan written from it with each part's source kept, and writing the rooms text
 * again changing nothing. Run in this process through `runGrid` and the tool bench.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../../command/main'
import { bench } from '../../mcp/__tests__/replay/harness'
import { dxfText, smallIfc, surveyFlat } from './drawings'

const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

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

async function project(files: Record<string, string>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'grid-drawing-'))
  made.push(dir)
  expect((await grid(dir, 'init')).status).toBe(0)
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

const plan = (dir: string, file = 'plan.json'): { walls: { id: string; properties?: Record<string, unknown> }[]; openings: { id: string; properties?: Record<string, unknown> }[]; rooms: { id: string; properties?: Record<string, unknown> }[] } =>
  JSON.parse(readFileSync(join(dir, file), 'utf8'))

describe('grid write --from', () => {
  it('reads a DXF survey into rooms text beside the plan and writes the plan from it', async () => {
    const dir = await project({ 'survey.dxf': surveyFlat() })
    const run = await grid(dir, 'write', '--from', 'survey.dxf')
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
    expect(run.out).toContain('Read survey.dxf (DXF, in millimetres): 3 rooms, 2 doors, 1 window and 1 doorless opening. Its rooms text is in plan.rooms')
    expect(run.out).toContain('How it was read: A-DOOR as doors (2); A-ROOM-IDEN as names (5); A-WALL as walls (29); A-WIND as windows (1).')
    expect(run.out).toContain('"Living room" 16.00 m² (drawn 16.00 m², its label says 16.00 m²)')
    expect(run.out).toContain('Openings against the drawing: 4 of 4 placed, the furthest 0.0 mm along its wall')
    expect(run.out).toContain('Assumed, to confirm with the person')
    expect(run.out).toContain('Wrote plan.json from rooms text')
    const rooms = readFileSync(join(dir, 'plan.rooms'), 'utf8')
    expect(rooms.startsWith('# Read from survey.dxf by grid write --from.')).toBe(true)
    const p = plan(dir)
    expect(p.rooms.find((r) => r.id === 'kitchen')!.properties).toEqual({ handle: '127' })
    expect(p.openings.find((o) => o.id === 'door-2')!.properties).toEqual({ handle: '124' })
    expect(p.walls.find((w) => w.id === 'w-living-room-kitchen')!.properties!['handle']).toMatch(/^[0-9A-F]+( [0-9A-F]+)+$/)
    // The plan reads as written from rooms text: writing its rooms text again changes nothing, the sources stay.
    const before = readFileSync(join(dir, 'plan.json'), 'utf8')
    const again = await grid(dir, 'write', 'plan.rooms')
    expect(again.status).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'))).toEqual(JSON.parse(before))
    expect(again.out).toContain('Facts of your own and room numbers kept by id on')
  })

  it('reads an IFC model into floors, with the json answer', async () => {
    const dir = await project({ 'office.ifc': smallIfc() })
    const run = await grid(dir, 'write', '--from', 'office.ifc', '--plan', 'office.json', '--json')
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
    const answer = JSON.parse(run.out)
    expect(answer.roomsFile).toBe('office.rooms')
    expect(answer.format).toBe('ifc')
    expect(answer.factName).toBe('guid')
    expect(answer.rooms).toHaveLength(4)
    const p = plan(dir, 'office.json')
    expect(p.walls.every((w) => typeof w.properties?.['guid'] === 'string')).toBe(true)
    expect(p.rooms.every((r) => typeof r.properties?.['guid'] === 'string')).toBe(true)
  })

  it('keeps each element\'s GlobalId, Name and Tag as its identity, and writes them back into the IFC (CNT-59)', async () => {
    // The ground floor's door with a Tag of its own, as a BIM tool writes one.
    const model = smallIfc().replace(/(IFCDOOR\('[^']+',\$,'Door',\$,\$,#\d+,\$,)\$/, "$1'D-101'")
    const dir = await project({ 'office.ifc': model })
    expect((await grid(dir, 'write', '--from', 'office.ifc', '--plan', 'office.json')).status).toBe(0)
    type Named = { id: string; identity?: { guid?: string; name?: string; tag?: string } }
    const read = (): { walls: Named[]; openings: Named[]; rooms: Named[]; floors: Named[] } => JSON.parse(readFileSync(join(dir, 'office.json'), 'utf8'))
    const p = read()
    const inFile = new Set([...model.matchAll(/^#\d+=IFC[A-Z]+\('([^']{22})'/gm)].map((m) => m[1]!))
    // Every room, floor and opening keeps its element's GlobalId, and walls the ones they are drawn from.
    for (const part of [...p.rooms, ...p.floors, ...p.openings]) expect(inFile.has(part.identity?.guid ?? ''), part.id).toBe(true)
    expect(p.walls.filter((w) => w.identity?.guid !== undefined).length).toBeGreaterThan(0)
    const guids = [...p.walls, ...p.openings, ...p.rooms, ...p.floors].flatMap((x) => (x.identity?.guid === undefined ? [] : [x.identity.guid]))
    expect(new Set(guids).size).toBe(guids.length)
    expect(p.rooms.map((r) => r.identity?.name).sort()).toEqual(['G0.01', 'G0.02', 'G1.01', 'G1.02'])
    expect(p.floors.map((f) => f.identity?.name)).toEqual(['Ground floor', 'First floor'])
    expect(p.openings.some((o) => o.identity?.tag === 'D-101')).toBe(true)

    // Written again from its rooms text, every identity stays.
    expect((await grid(dir, 'write', 'office.rooms', '--plan', 'office.json')).status).toBe(0)
    expect(read()).toEqual(p)

    // The IFC Grid writes gives each element back its GlobalId and the door its Tag.
    expect((await grid(dir, 'export', 'office.json', '--format', 'ifc', '--out', 'out.ifc')).status).toBe(0)
    const out = readFileSync(join(dir, 'out.ifc'), 'utf8')
    for (const guid of guids) expect(out, guid).toContain(`('${guid}',`)
    expect(out).toMatch(/IFCDOOR\('[^']+',#\d+,'Door',\$,\$,#\d+,#\d+,'D-101',/)
  })

  it('refuses what it cannot read, writing nothing, and options that go with --from alone', async () => {
    const dir = await project({ 'survey.dwg': 'AC1027', 'notes.dxf': '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n' })
    const dwg = await grid(dir, 'write', '--from', 'survey.dwg')
    expect(dwg.status).not.toBe(0)
    expect(dwg.err).toContain('from reads a DXF or IFC drawing')
    const empty = await grid(dir, 'write', '--from', 'notes.dxf')
    expect(empty.status).not.toBe(0)
    expect(empty.err).toContain('nothing to read')
    expect(existsSync(join(dir, 'plan.rooms'))).toBe(false)
    const alone = await grid(dir, 'write', 'x.rooms', '--layers', 'walls=A')
    expect(alone.err).toContain('--layers goes with --from')
    const both = await grid(dir, 'write', '--from', 'survey.dxf', '--scan', 'scan.json')
    expect(both.err).toContain('write takes --from or --scan, not both')
  })

  it('never writes over a rooms file of the person\'s own, and keeps a text that does not write beside the plan', async () => {
    const dir = await project({ 'survey.dxf': surveyFlat(), 'plan.rooms': 'room a "A" - 3 x 3\n' })
    const kept = await grid(dir, 'write', '--from', 'survey.dxf')
    expect(kept.status).not.toBe(0)
    expect(kept.err).toContain('plan.rooms is there and Grid did not write it from a drawing')
    expect(readFileSync(join(dir, 'plan.rooms'), 'utf8')).toBe('room a "A" - 3 x 3\n')
    // Two rooms drawn overlapping: the text is written beside the plan, and the refusal names it.
    writeFileSync(join(dir, 'bad.dxf'), dxfText([
      { type: 'LWPOLYLINE', layer: 'ROOMS', points: [[0, 0], [4, 0], [4, 3], [0, 3]], closed: true },
      { type: 'LWPOLYLINE', layer: 'ROOMS', points: [[3, 0], [7, 0], [7, 3], [3, 3]], closed: true },
    ], { insunits: 6 }))
    const bad = await grid(dir, 'write', '--from', 'bad.dxf', '--plan', 'bad.json')
    expect(bad.status).not.toBe(0)
    expect(bad.err).toContain('Read bad.dxf into rooms text, written to bad.rooms, but the plan was not written')
    expect(bad.err).toContain('write it with grid write bad.rooms')
    expect(readFileSync(join(dir, 'bad.rooms'), 'utf8')).toContain('room room-2 "Room 2" - polygon 3,0 7,0 7,3 3,3')
    expect(existsSync(join(dir, 'bad.json'))).toBe(false)
  })
})

describe('grid_write_rooms from', () => {
  it('writes the plan from a drawing, and refuses from with rooms', async () => {
    const b = bench({})
    try {
      writeFileSync(join(b.folder, 'survey.dxf'), surveyFlat())
      const done = await b.call('grid_write_rooms', { plan: 'flat.json', from: 'survey.dxf' })
      expect(done.isError, done.text).toBe(false)
      expect(done.text).toContain('write it again with grid_write_rooms roomsFile=flat.rooms')
      const drawing = done.data!['drawing'] as { roomsFile: string; factName: string; areas: unknown[]; openings: { written: string }[] }
      expect(drawing.roomsFile).toBe('flat.rooms')
      expect(drawing.factName).toBe('handle')
      expect(drawing.areas).toHaveLength(3)
      expect(drawing.openings.every((o) => o.written === 'line')).toBe(true)
      const both = await b.call('grid_write_rooms', { plan: 'flat.json', from: 'survey.dxf', rooms: 'room a "A" - 3 x 3' })
      expect(both.isError).toBe(true)
      expect(both.text).toContain('Pass from or rooms, not both')
      const layers = await b.call('grid_write_rooms', { plan: 'flat.json', rooms: 'room a "A" - 3 x 3', layers: 'walls=A' })
      expect(layers.isError).toBe(true)
      expect(layers.text).toContain('layers goes with from')
      const ifcLayers = await b.call('grid_write_rooms', { plan: 'x.json', from: 'model.ifc', layers: 'walls=A' })
      expect(ifcLayers.isError).toBe(true)
    } finally {
      b.close()
    }
  })
})
