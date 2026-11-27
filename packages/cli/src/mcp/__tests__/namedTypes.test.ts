/**
 * CNT-15 (C24): named wall, door and window types, and room finishes, through the tool server.
 * The three things the card is done when: one change to the partition type changes every
 * partition of it (lab RT-22, CP2-3); the IFC writes each type's material, and "Not stated" when
 * none is given (AU3-4); and a kitchen's tiled floor survives a knock-through (AC-4). Then the
 * schedules, the take-off and the estimate grouped by type and by finish, and a plan written
 * again from rooms text keeping both.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench, type Reply } from './replay/harness'

const FLOORPLAN_FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const TWO_BED = JSON.parse(readFileSync(resolve(FLOORPLAN_FIXTURES, 'two-bed-flat.json'), 'utf8')) as FloorPlan
const INSIDE = TWO_BED.walls.filter((w) => w.kind === 'interior').map((w) => w.id)

/** The two-bed flat with its kitchen tiled and its living room in oak. */
const finished = (): FloorPlan => ({
  ...TWO_BED,
  rooms: TWO_BED.rooms.map((r) => (r.id === 'kitchen' ? { ...r, finishes: { floor: 'Porcelain tile', walls: 'Tiled splashback' } } : r.id === 'living' ? { ...r, finishes: { floor: 'Oak boards' } } : r)),
})

let b: Bench
beforeAll(() => {
  b = bench({
    'flat.json': TWO_BED,
    'inside.json': { ...TWO_BED, walls: TWO_BED.walls.map((w) => ({ ...w, kind: 'interior' as const })) },
    'finished.json': finished(),
    'defaulted.json': {
      ...TWO_BED,
      types: {
        walls: [{ id: 'stud-100', name: 'Stud partition 100', thickness: 0.1 }, { id: 'block-300', name: 'Block wall 300', thickness: 0.3 }],
        windows: [{ id: 'casement', name: 'Casement', height: 1.2 }],
        defaults: { walls: { interior: 'stud-100', exterior: 'block-300' }, window: 'casement' },
      },
      walls: TWO_BED.walls.map((w) => ({ ...w, thickness: undefined, ...(w.id === 'spine' ? { wallType: 'stud-100' } : {}) })),
      openings: TWO_BED.openings.map((o) => (o.type === 'window' ? { ...o, height: undefined } : o)),
    },
    'misnamed.json': { ...TWO_BED, types: { walls: [{ id: 'stud-100', name: 'Stud partition 100', thickness: 0.1 }] }, walls: TWO_BED.walls.map((w) => (w.id === 'spine' ? { ...w, wallType: 'stud-10' } : w)) },
  })
})
afterAll(() => b.close())

async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
const fileOf = (file: string): Record<string, unknown> & { walls: Record<string, unknown>[]; openings: Record<string, unknown>[]; rooms: Record<string, unknown>[] } => JSON.parse(readFileSync(join(b.folder, file), 'utf8'))
const readOf = (file: string): FloorPlan => parseFloorPlan(fileOf(file))

describe('CNT-15 one change to a type changes every part of it (done when 1)', () => {
  it('adds the partition type and gives it to the flat\'s inside walls, which then read its thickness', async () => {
    const reply = await ok('grid_change_type', { plan: 'flat.json', out: 'typed.json', of: 'wall', type: 'stud-100', name: 'Stud partition 100', thickness: 0.1, material: 'Plasterboard on timber studs', parts: INSIDE })
    expect(reply.text).toContain('Added wall type "stud-100" ("Stud partition 100").')
    expect(reply.text).toContain('its own thickness')
    const file = fileOf('typed.json')
    for (const wall of file.walls.filter((w) => INSIDE.includes(w['id'] as string))) {
      expect(wall['wallType']).toBe('stud-100')
      expect(wall).not.toHaveProperty('thickness')
    }
    expect(readOf('typed.json').walls.filter((w) => w.wallType === 'stud-100').map((w) => w.thickness)).toEqual(INSIDE.map(() => 0.1))
  })

  it('makes every partition of the type 120 mm in one call, writing only the type', async () => {
    const before = fileOf('typed.json')
    const reply = await ok('grid_change_type', { plan: 'typed.json', out: 'thicker.json', of: 'wall', type: 'stud-100', thickness: 0.12 })
    expect(reply.text).toContain('Wall type "stud-100" ("Stud partition 100"): thickness 0.10 m → 0.12 m.')
    expect(reply.text).toContain(`${INSIDE.length} walls take it`)
    const after = fileOf('thicker.json')
    // The walls in the file are as they were: the change is the type's alone.
    expect(after.walls).toEqual(before.walls)
    expect((after['types'] as { walls: { thickness: number }[] }).walls[0]!.thickness).toBe(0.12)
    const read = readOf('thicker.json')
    expect(read.walls.filter((w) => INSIDE.includes(w.id)).every((w) => w.thickness === 0.12)).toBe(true)
    expect(read.walls.filter((w) => !INSIDE.includes(w.id)).every((w) => w.thickness === 0.3)).toBe(true)
    // The rooms measure the thicker walls: the living room is smaller than before.
    const areas = async (plan: string): Promise<number> => ((await ok('grid_measure', { plan, what: 'room', room: 'living' })).data!['answer'] as { area: number }).area
    expect(await areas('thicker.json')).toBeLessThan(await areas('typed.json'))
  })

  it('says how many walls take a new default type, and offers the other kind when none do', async () => {
    const some = await ok('grid_change_type', { plan: 'flat.json', out: 'some.json', of: 'wall', type: 'stud-100', name: 'Stud partition 100', thickness: 0.1, kind: 'interior', default: true })
    expect(some.text).toMatch(/\d+ walls take it/)
    const none = await ok('grid_change_type', { plan: 'inside.json', out: 'none.json', of: 'wall', type: 'ext-300', name: 'Outer 300', thickness: 0.3, kind: 'exterior', default: true })
    expect(none.text).toContain('No wall takes it')
    expect(none.text).toContain('Change its kind to interior')
  })

  it('makes it the default for inside walls, raises them, and refuses a field the type does not have', async () => {
    const reply = await ok('grid_change_type', { plan: 'thicker.json', out: 'raised.json', of: 'wall', type: 'stud-100', height: 2.5, kind: 'interior', default: true })
    expect(reply.text).toContain('It is the default for interior walls that name no type.')
    expect((fileOf('raised.json')['types'] as { defaults: unknown }).defaults).toEqual({ walls: { interior: 'stud-100' } })
    const refused = await b.call('grid_change_type', { plan: 'thicker.json', of: 'door', type: 'stud-100', thickness: 0.1 })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('A door type has no thickness')
  })

  it('works the same from the command line: grid edit type', async () => {
    const { runEdit } = await import('../../command/edit')
    let out = ''
    await runEdit(['type', 'thicker.json', '--of', 'door', '--type', 'D80', '--name', 'Internal door 800', '--width', '0.8', '--material', 'Oak', '--parts', 'door-living,door-kitchen,door-bed1,door-bed2'], b.folder, (text) => (out += text))
    expect(out).toContain('Added door type "D80" ("Internal door 800").')
    const read = readOf('thicker.json')
    expect(read.openings.filter((o) => o.doorType === 'D80').map((o) => o.id).sort()).toEqual(['door-bed1', 'door-bed2', 'door-kitchen', 'door-living'])
  })
})

describe('CNT-15 the IFC writes each type\'s material (done when 2)', () => {
  it('writes the partition type\'s material, the door type\'s, and "Not stated" for the outside walls, which state none', async () => {
    await ok('grid_export', { plan: 'thicker.json', format: 'ifc' })
    const ifc = readFileSync(join(b.folder, 'exports', 'thicker.ifc'), 'latin1')
    expect(ifc).toContain("IFCMATERIAL('Plasterboard on timber studs')")
    expect(ifc).toContain("IFCMATERIAL('Oak')")
    expect(ifc).toContain("IFCMATERIAL('Not stated')")
    expect(ifc).not.toContain("IFCMATERIAL('Exterior wall')")
    expect(ifc).toMatch(/IFCWALLTYPE\('[^']+',#\d+,'Stud partition 100',/)
  })
})

describe('CNT-15 a kitchen\'s tiled floor survives a knock-through (done when 3, lab AC-4)', () => {
  it('refuses to make the tiled kitchen and the oak living room one floor in silence', async () => {
    const refused = await b.call('grid_merge_rooms', { plan: 'finished.json', room: 'kitchen', with: 'living', use: 'living' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('"Kitchen" has a floor finish of "Porcelain tile" and "Living room" of "Oak boards"')
    expect(refused.text).toContain('zones: true')
  })

  it('keeps the kitchen tiled as a zone of the open-plan room, by its own area', async () => {
    await ok('grid_merge_rooms', { plan: 'finished.json', out: 'open.json', room: 'kitchen', with: 'living', zones: true, name: 'Kitchen and living' })
    // The kitchen as a zone: to the dividing line where the wall stood, so half the wall's floor is its own.
    const before = ((await ok('grid_measure', { plan: 'open.json', what: 'room', room: 'kitchen' })).data!['answer'] as { area: number }).area
    expect(before).toBeGreaterThan(13.2)
    const read = readOf('open.json')
    expect(read.rooms.find((r) => r.id === 'kitchen')!.finishes).toEqual({ floor: 'Porcelain tile', walls: 'Tiled splashback' })
    const s = await ok('grid_schedule', { plan: 'open.json', of: 'finishes' })
    const totals = s.data!['totals'] as { surface: string; finish: string | null; quantity: number; rooms: string[] }[]
    const tile = totals.find((t) => t.surface === 'floor' && t.finish === 'Porcelain tile')!
    expect(tile.rooms).toEqual(['kitchen'])
    expect(tile.quantity).toBeCloseTo(before, 6)
    expect(totals.find((t) => t.surface === 'floor' && t.finish === 'Oak boards')!.rooms).toEqual(['living'])
    expect(s.text).toContain('"Kitchen" (a zone of "kitchen-living")')
    // The estimate prices the tiles as tiles, never by the merged room's use.
    const estimate = await ok('grid_takeoff', { plan: 'open.json', for: 'estimate' })
    const lines = estimate.data!['lines'] as { key: string; quantity: number }[]
    expect(lines.find((l) => l.key === 'floor:finish:Porcelain tile')!.quantity).toBeCloseTo(before, 6)
  })

  it('sets a finish with grid_rename_room, and takes one out with none', async () => {
    const reply = await ok('grid_rename_room', { plan: 'finished.json', out: 'bath.json', room: 'bath', floor_finish: 'Porcelain tile', wall_finish: 'Ceramic tile' })
    expect(reply.text).toContain('"Bathroom": floor finish not stated → "Porcelain tile".')
    await ok('grid_rename_room', { plan: 'bath.json', room: 'bath', wall_finish: 'none' })
    expect(readOf('bath.json').rooms.find((r) => r.id === 'bath')!.finishes).toEqual({ floor: 'Porcelain tile' })
  })
})

describe('CNT-15 quantities by type and by finish', () => {
  it('lists the doors of a named type as one row by its name and material, before the others', async () => {
    const s = await ok('grid_schedule', { plan: 'thicker.json', of: 'doors' })
    const rows = s.data!['rows'] as { basis: string; key: string; name: string | null; material: string | null; count: number }[]
    expect(rows[0]).toMatchObject({ basis: 'named', key: 'door-type:D80', name: 'Internal door 800', material: 'Oak', count: 4 })
    expect(rows.slice(1).every((r) => r.basis === 'kind-and-size')).toBe(true)
    expect(s.text).toContain('4 × "Internal door 800", door 0.80 m wide')
    const csv = await ok('grid_schedule', { plan: 'thicker.json', of: 'doors', format: 'csv' })
    expect(csv.text.split('\n')[1]).toBe('number,type,name,material,kind,width m,height m,opens width m,opens height m,count,marks,phase,section')
  })

  it('gives the walls of each named type, and each finish, in the take-off', async () => {
    const t = await ok('grid_takeoff', { plan: 'thicker.json' })
    const types = t.data!['wallTypes'] as { type: string; count: number; material: string | null; gross: number }[]
    expect(types).toEqual([expect.objectContaining({ type: 'stud-100', count: INSIDE.length, material: 'Plasterboard on timber studs' })])
    expect(t.text).toContain('Walls by type: "Stud partition 100"')
    const plain = await ok('grid_takeoff', { plan: 'flat.json' })
    expect(plain.data).not.toHaveProperty('wallTypes')
    expect(plain.data).not.toHaveProperty('finishes')
    const f = await ok('grid_takeoff', { plan: 'finished.json' })
    expect((f.data!['finishes'] as { finish: string | null }[]).map((x) => x.finish)).toContain('Porcelain tile')
  })

  it('prices the walls of a named type by its type in the estimate, and the others by kind as before', async () => {
    const e = await ok('grid_takeoff', { plan: 'thicker.json', for: 'estimate' })
    const keys = (e.data!['lines'] as { key: string }[]).map((l) => l.key)
    expect(keys).toContain('wall-type:stud-100:0.12')
    expect(keys).toContain('wall:exterior:0.3')
    expect(keys).not.toContain('wall:interior:0.1')
    expect(keys).toContain('door-type:D80')
  })
})

describe('CNT-15 written again from rooms text', () => {
  it('keeps each wall\'s type and each room\'s finish by id, and leaves to the type what it gives the same', async () => {
    const first = await ok('grid_describe', { plan: 'finished.json', as: 'rooms' })
    await ok('grid_write_rooms', { plan: 'rt.json', rooms: first.data!['text'] as string })
    const inside = readOf('rt.json').walls.filter((w) => w.kind === 'interior').map((w) => w.id)
    await ok('grid_change_type', { plan: 'rt.json', of: 'wall', type: 'stud-100', name: 'Stud partition 100', thickness: 0.1, parts: inside })
    // Rooms text keeps a room's finishes (its raw line); a new one is kept too.
    expect(readOf('rt.json').rooms.find((r) => r.id === 'kitchen')!.finishes).toEqual({ floor: 'Porcelain tile', walls: 'Tiled splashback' })
    await ok('grid_rename_room', { plan: 'rt.json', room: 'kitchen', floor_finish: 'Terrazzo' })
    const again = await ok('grid_describe', { plan: 'rt.json', as: 'rooms' })
    const written = await ok('grid_write_rooms', { plan: 'rt.json', rooms: again.data!['text'] as string })
    expect(written.text).toContain('the same building as the plan before')
    const file = fileOf('rt.json')
    const typed = file.walls.filter((w) => w['wallType'] === 'stud-100')
    expect(typed.map((w) => w['id']).sort()).toEqual([...inside].sort())
    // Rooms text writes each wall's thickness; the type gives the same, so it is left to the type.
    expect(typed.every((w) => w['thickness'] === undefined)).toBe(true)
    expect(file.rooms.find((r) => r['id'] === 'kitchen')!['finishes']).toEqual({ floor: 'Terrazzo', walls: 'Tiled splashback' })
    // And so a change to the type still reaches them.
    await ok('grid_change_type', { plan: 'rt.json', of: 'wall', type: 'stud-100', thickness: 0.12 })
    expect(readOf('rt.json').walls.filter((w) => inside.includes(w.id)).every((w) => w.thickness === 0.12)).toBe(true)
  })
})

describe('WRT-70 written again from rooms text, a part typed by a default stays typed by it', () => {
  it('names a type only on the wall that named one, and the defaults still type the rest', async () => {
    const text = await ok('grid_describe', { plan: 'defaulted.json', as: 'rooms' })
    await ok('grid_write_rooms', { plan: 'defaulted.json', rooms: text.data!['text'] as string })
    const file = fileOf('defaulted.json')
    expect(file.walls.filter((w) => w['wallType'] !== undefined).map((w) => w['id'])).toEqual(['spine'])
    expect(file.walls.every((w) => w['thickness'] === undefined)).toBe(true)
    expect(file.openings.filter((o) => o['type'] === 'window').every((o) => o['windowType'] === undefined && o['height'] === undefined)).toBe(true)
    const read = readOf('defaulted.json')
    expect(read.walls.filter((w) => w.kind === 'exterior').every((w) => w.wallType === 'block-300' && w.thickness === 0.3)).toBe(true)
    expect(read.openings.filter((o) => o.type === 'window').every((o) => o.windowType === 'casement' && o.height === 1.2)).toBe(true)
  })
})

describe('CNT-15 the check names a type the plan does not hold', () => {
  it('gives the line its wording, what is needed and the fix, with the type most likely meant', async () => {
    const reply = await ok('grid_check', { plan: 'misnamed.json', full: true })
    const lines = (reply.data!['lines'] as { code: string; message: string; needed: string; fix: string; found: string }[]).filter((l) => l.code === 'type/unknown')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ message: 'Wall "spine" names a type the plan\'s types do not hold', needed: 'a type in the plan\'s types, by id' })
    expect(lines[0]!.found).toContain('"stud-100" is the type most likely meant')
  })
})
