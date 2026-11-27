import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench } from './replay/harness'

/**
 * HND-6: grid_export answers with every part of the plan its file leaves out, and refuses a file
 * that would hold nothing of the plan.
 */

const sample = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) as {
  walls: { id: string; start: number[]; end: number[] }[]
  rooms: { id: string }[]
  openings: { id: string }[]
}

/** The flat with its first wall made zero-length, and a second copy of its first room. */
function broken(): Record<string, unknown> {
  const plan = structuredClone(sample)
  plan.walls[0]!.end = [...plan.walls[0]!.start]
  return { ...plan, rooms: [...plan.rooms, { ...plan.rooms[0]! }] }
}

describe('grid_export says what the file leaves out (HND-6)', () => {
  const b = bench({
    'plan.json': sample,
    'broken.json': broken(),
    'empty.json': { version: '1', units: 'm', walls: [], rooms: [], openings: [] },
  })
  afterAll(() => b.close())

  it('leaves nothing out of the sound flat, and says nothing', async () => {
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'ifc' })
    expect(reply.isError).toBe(false)
    expect(reply.data).toMatchObject({ leftOut: 0, leftOutParts: [] })
    expect(reply.text).not.toContain('Left out')
  })

  it('lists each part left out, by kind, id, place, floor and code', async () => {
    const reply = await b.call('grid_export', { plan: 'broken.json', format: 'ifc' })
    expect(reply.isError).toBe(false)
    const parts = reply.data!['leftOutParts'] as { kind: string; id: string | null; place: string | null; floor: string | null; code: string | null }[]
    expect(reply.data!['leftOut']).toBe(parts.length)
    const wall = sample.walls[0]!.id
    expect(parts).toContainEqual({ kind: 'wall', id: wall, place: null, floor: 'ground', code: 'wall/zero-length' })
    // The second copy of the room, which the reader left out (MSG-6), by its place in the file.
    expect(parts[0]).toEqual({ kind: 'room', id: sample.rooms[0]!.id, place: `rooms[${sample.rooms.length}]`, floor: null, code: 'plan/id-clash' })
    expect(parts.every((part) => part.code !== null)).toBe(true)
    expect(reply.text).toMatch(/^Left out \d+ parts of the plan, and the file says so: .*grid check says why\.$/m)
    expect(readFileSync(join(b.folder, 'exports', 'broken.ifc'), 'latin1')).toContain(`IFCPROPERTYSINGLEVALUE('Parts',$,IFCINTEGER(${parts.length}),$)`)
  })

  it('refuses a plan with nothing to draw, and writes nothing', async () => {
    const reply = await b.call('grid_export', { plan: 'empty.json', format: 'glb' })
    expect(reply).toMatchObject({ isError: true, text: 'Nothing to export: empty.json has no wall, room or fixture that can be drawn. No file was written.' })
    expect(existsSync(join(b.folder, 'exports', 'empty.glb'))).toBe(false)
  })
})

/** A GLB's JSON chunk, the first after its 12-byte header. */
function glbJson(bytes: Buffer): { scenes: { nodes: number[] }[]; nodes: { name?: string; children?: number[]; translation?: number[] }[] } {
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as ReturnType<typeof glbJson>
}

const house = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-floor-house.json'), 'utf8')) as Record<string, unknown>

describe('grid_export holds the whole building in a glb or obj (VEW-64)', () => {
  const b = bench({ 'house.json': house })
  afterAll(() => b.close())

  it('writes every floor under one root and says so, leaving no floor out', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'glb' })
    expect(reply.isError).toBe(false)
    const floors = reply.data!['floors'] as { id: string; elevation: number }[]
    expect(floors.map((floor) => floor.id)).toEqual(['ground', 'first'])
    expect(floors[0]!.elevation).toBe(0)
    expect(floors[1]!.elevation).toBeGreaterThan(2)
    expect(reply.data!['floorsLeftOut']).toEqual([])
    expect(reply.data!['written']).toBe('exports/house.glb')
    expect(reply.text).toContain('Holds all 2 floors of the plan, each a node named by its id and raised to its elevation, under one root node, "building".')
    const glb = glbJson(readFileSync(join(b.folder, 'exports', 'house.glb')))
    const nodes = glb.nodes
    const root = nodes[glb.scenes[0]!.nodes[0]!]!
    expect(root.name).toBe('building')
    expect(root.children!.map((i) => nodes[i]!.name)).toEqual(['ground', 'first'])
    expect(nodes.find((node) => node.name === 'first')!.translation).toEqual([0, floors[1]!.elevation, 0])
  })

  it('writes one floor at its elevation when one is named, and names the floor it leaves out', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'obj', floor: 'first' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['floorsLeftOut']).toEqual(['ground'])
    // VEW-72: named after the floor, not its place in the plan.
    expect(reply.data!['written']).toBe('exports/house-first-floor.obj')
    expect(reply.text).toMatch(/^Holds floor "first" only, written at its elevation, \d+\.\d\d m; the other floor is not in this file: leave the floor out to export the whole building\.$/m)
  })

  it('VEW-72: a dxf with no floor named holds every floor, each on a layout named after it', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'dxf' })
    expect(reply.isError).toBe(false)
    expect((reply.data!['floors'] as { id: string }[]).map((floor) => floor.id)).toEqual(['ground', 'first'])
    expect(reply.data!['floorsLeftOut']).toEqual([])
    expect(reply.data!['written']).toBe('exports/house.dxf')
    expect(reply.text).toContain('Holds all 2 floors of the plan, side by side in model space from the lowest, each on a paper layout of its own named after the floor.')
    // At 1:100, unstated, with every floor on its sheet, as before: the answer says nothing of the scale.
    expect(reply.text).not.toContain('Its sheets')
    expect(reply.data!['sheets']).toEqual([
      { floor: 'ground', scale: 100, stated: false, fits: true, fitsAt: null },
      { floor: 'first', scale: 100, stated: false, fits: true, fitsAt: null }
    ])
    const dxf = readFileSync(join(b.folder, 'exports', 'house.dxf'), 'utf8')
    expect(dxf).toContain('\r\nGround floor\r\n')
    expect(dxf).toContain('\r\nFirst floor\r\n')
  })

  it('VEW-72: a dxf of one floor named by its name is named after it, and says what it leaves out', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'dxf', floor: 'First floor' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['written']).toBe('exports/house-first-floor.dxf')
    expect(reply.data!['floorsLeftOut']).toEqual(['ground'])
    expect(reply.text).toContain('Holds floor "first" only; the other floor is not in this file: leave the floor out for every floor in one file, or ask for all floors for a file each.')
  })

  it('VEW-72: floor all writes one file per floor, each named after its floor', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'dxf', floor: 'all' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['files']).toEqual([
      { written: 'exports/house-ground-floor.dxf', floors: ['ground'] },
      { written: 'exports/house-first-floor.dxf', floors: ['first'] }
    ])
    expect(reply.text).not.toContain('Holds floor')
    for (const file of ['house-ground-floor.dxf', 'house-first-floor.dxf']) expect(existsSync(join(b.folder, 'exports', file))).toBe(true)
  })

  it('VEW-72: writes to out, at a stated scale', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'dxf', out: 'house-plans.dxf', scale: 200 })
    expect(reply.isError).toBe(false)
    expect(reply.data!['written']).toBe('house-plans.dxf')
    expect(reply.text).toContain('Its sheets are A3 at 1:200, the scale stated.')
    expect(readFileSync(join(b.folder, 'house-plans.dxf'), 'utf8')).toContain('scale 1:200 on A3')
  })

  it('VEW-72: refuses out with floor all, and an out of another format', async () => {
    expect(await b.call('grid_export', { plan: 'house.json', format: 'dxf', floor: 'all', out: 'x.dxf' })).toMatchObject({ isError: true })
    expect(await b.call('grid_export', { plan: 'house.json', format: 'dxf', out: 'x.ifc' })).toMatchObject({ isError: true })
    expect(existsSync(join(b.folder, 'x.dxf'))).toBe(false)
  })

  it("VEW-72: tags the dxf's openings with the schedule's marks, and the ifc with the same", async () => {
    await b.call('grid_export', { plan: 'house.json', format: 'dxf', floor: 'ground' })
    await b.call('grid_export', { plan: 'house.json', format: 'ifc' })
    const dxf = readFileSync(join(b.folder, 'exports', 'house-ground-floor.dxf'), 'utf8')
    const ifc = readFileSync(join(b.folder, 'exports', 'house.ifc'), 'latin1')
    expect(dxf).toMatch(/\r\nMARK\r\n/)
    const marks = [...dxf.matchAll(/\r\n1\r\n([DW]\d+)\r\n7\r\nStandard\r\n/g)].map((m) => m[1])
    expect(marks.length).toBeGreaterThan(0)
    for (const mark of marks) expect(ifc).toContain(`,'${mark}',`)
  })

  it('says nothing of floors for a plan of one floor', async () => {
    const flat = bench({ 'plan.json': sample })
    try {
      const reply = await flat.call('grid_export', { plan: 'plan.json', format: 'glb' })
      expect(reply.data!['floors']).toEqual([{ id: 'ground', elevation: 0 }])
      expect(reply.text).not.toContain('Holds')
    } finally {
      flat.close()
    }
  })
})

describe('grid_export: materials, roofs and curves in a glb or obj (VEW-73)', () => {
  const drum = {
    version: '1',
    units: 'm',
    walls: [{ id: 'round', start: [8, 5], end: [8, 5], thickness: 0.2, height: 2.7, kind: 'exterior', arc: { centre: [5, 5], sweep: 360 } }],
    rooms: [{ id: 'drum', name: 'Drum', boundary: ['round'] }],
    openings: [],
  }
  const b = bench({ 'plan.json': sample, 'drum.json': drum })
  afterAll(() => b.close())

  type Doc = { meshes: { name: string; primitives: { attributes: Record<string, number>; indices: number; material: number }[] }[]; materials: { name: string }[]; accessors: { count: number }[] }
  const docOf = (file: string): Doc => glbJson(readFileSync(join(b.folder, file))) as unknown as Doc

  it('writes grid.mtl beside an obj and answers with it', async () => {
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'obj' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['materials']).toBe('exports/grid.mtl')
    expect(reply.text).toContain('Wrote "exports/grid.mtl" in the project folder.')
    expect(readFileSync(join(b.folder, 'exports', 'plan.obj'), 'utf8')).toMatch(/^mtllib grid\.mtl$/m)
    expect(readFileSync(join(b.folder, 'exports', 'grid.mtl'), 'utf8')).toMatch(/^newmtl wall$/m)
    // Beside out too.
    const out = await b.call('grid_export', { plan: 'plan.json', format: 'obj', out: 'model.obj' })
    expect(out.data!['materials']).toBe('grid.mtl')
    expect(existsSync(join(b.folder, 'grid.mtl'))).toBe(true)
  })

  it('answers no materials file for a glb, whose materials are inside it', async () => {
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'glb' })
    expect(reply.data!['materials']).toBeNull()
    const doc = docOf('exports/plan.glb')
    expect(doc.materials.map((m) => m.name)).toContain('wall')
    expect(doc.meshes.some((m) => m.name.startsWith('roof_'))).toBe(true)
    expect(Object.keys(doc.meshes[0]!.primitives[0]!.attributes)).toEqual(['POSITION', 'NORMAL', 'TEXCOORD_0'])
  })

  it('leaves the roofs out with roofs false', async () => {
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'glb', roofs: false, out: 'open.glb' })
    expect(reply.isError).toBe(false)
    expect(docOf('open.glb').meshes.some((m) => m.name.startsWith('roof_'))).toBe(false)
  })

  it('writes a round wall lighter with arcSegments', async () => {
    await b.call('grid_export', { plan: 'drum.json', format: 'glb', arcSegments: 24, out: 'light.glb' })
    const doc = docOf('light.glb')
    const wall = doc.meshes.find((m) => m.name === 'wall_round')!.primitives[0]!
    expect(doc.accessors[wall.indices]!.count).toBe(24 * 12 * 3)
  })

  it('refuses either for a dxf or an ifc, by the argument name', async () => {
    const roofs = await b.call('grid_export', { plan: 'plan.json', format: 'dxf', roofs: false })
    expect(roofs).toMatchObject({ isError: true, text: 'roofs false applies to GLB and OBJ only: leave it out for this format.' })
    const arcs = await b.call('grid_export', { plan: 'plan.json', format: 'ifc', arcSegments: 32 })
    expect(arcs).toMatchObject({ isError: true, text: 'arcSegments applies to GLB and OBJ only: leave it out for this format.' })
  })
})
