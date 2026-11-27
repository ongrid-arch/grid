import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'
import { readArgs } from '../toolkit'

/** VEW-62: grid_view writes its picture to a file in the project, with a record beside it. */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => { for (const path of made) rmSync(path, { recursive: true, force: true }) })

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'grid-view-out-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(sample))
  return { dir, context: { project: openProject(dir, dir) } }
}

const tool = GRID_TOOLS.find((t) => t.name === 'grid_view')!
const call = async (dir: ReturnType<typeof project>, args: Record<string, unknown>) =>
  (await tool.run(readArgs(tool, { plan: 'plan.json', ...args }), dir.context)) as { text: string; data: Record<string, unknown> }
const PNG = [0x89, 0x50, 0x4e, 0x47]

describe('grid_view out', () => {
  it('writes nothing without out', async () => {
    const p = project()
    await call(p, { kind: 'plan' })
    expect(existsSync(join(p.dir, 'exports'))).toBe(false)
  })

  it('writes a png into exports/ for a bare name, with the record and its bounds', async () => {
    const p = project()
    const answer = await call(p, { kind: 'plan', out: 'ground.png' })
    expect(answer.data['written']).toBe('exports/ground.png')
    expect(answer.data['record']).toBe('exports/ground.view.json')
    const bytes = readFileSync(join(p.dir, 'exports/ground.png'))
    expect([...bytes.subarray(0, 4)]).toEqual(PNG)
    const record = JSON.parse(readFileSync(join(p.dir, 'exports/ground.view.json'), 'utf8'))
    expect(record.kind).toBe('plan')
    expect(record.pxPerMetre).toBe(answer.data['pxPerMetre'])
    expect(record.width).toBe(bytes.readUInt32BE(16))
    expect(record.height).toBe(bytes.readUInt32BE(20))
    const { minX, maxX, minY, maxY } = record.bounds
    expect(maxX).toBeGreaterThan(minX)
    expect(maxY).toBeGreaterThan(minY)
    // The bounds and the pixels per metre agree: the drawing is as wide as its metres say.
    expect((maxX - minX) * record.pxPerMetre).toBeCloseTo(record.width, 0)
    expect(answer.data['worldFile']).toBe('exports/ground.pgw')
    expect(record.pixelToMetres).toEqual(answer.data['pixelToMetres'])
    const [a, b, c, d, e, f] = record.pixelToMetres.coefficients
    expect(a).toBeCloseTo(1 / record.pxPerMetre, 10)
    expect(e).toBeCloseTo(minX, 10)
    expect(f).toBeCloseTo(maxY, 10)
    const world = readFileSync(join(p.dir, 'exports/ground.pgw'), 'utf8').trim().split('\n').map(Number)
    expect(world).toEqual([a, c, b, d, e + (a + b) / 2, f + (c + d) / 2])
    expect(answer.text).toContain('exports/ground.png')
  })

  it('writes an svg of a plan and a facade, and a pdf of the same', async () => {
    const p = project()
    await call(p, { kind: 'plan', out: 'a.svg' })
    expect(readFileSync(join(p.dir, 'exports/a.svg'), 'utf8')).toMatch(/^<svg/)
    await call(p, { kind: 'facade', side: 'south', out: 'south.svg' })
    expect(readFileSync(join(p.dir, 'exports/south.svg'), 'utf8')).toMatch(/^<svg/)
    expect(JSON.parse(readFileSync(join(p.dir, 'exports/south.view.json'), 'utf8')).bounds).toBeNull()
    await call(p, { kind: 'plan', out: 'a.pdf' })
    expect(readFileSync(join(p.dir, 'exports/a.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('writes where a folder says, and never over the plan file', async () => {
    const p = project()
    await call(p, { kind: 'plan', out: 'pics/plan.png' })
    expect(existsSync(join(p.dir, 'pics/plan.png'))).toBe(true)
    expect(existsSync(join(p.dir, 'pics/plan.view.json'))).toBe(true)
    await call(p, { kind: 'plan', out: 'plan.png' })
    expect(JSON.parse(readFileSync(join(p.dir, 'plan.json'), 'utf8'))).toHaveProperty('walls')
  })

  it('refuses a name that is not a picture, an svg of a 3d view, and a path outside the project', async () => {
    const p = project()
    await expect(call(p, { kind: 'plan', out: 'plan.jpg' })).rejects.toThrow(/\.png, \.svg, \.pdf/)
    await expect(call(p, { kind: '3d', out: 'x.svg' })).rejects.toThrow(/not made as an svg/)
    await expect(call(p, { kind: 'plan', out: '../outside.png' })).rejects.toThrow(/project/)
    const away = mkdtempSync(join(tmpdir(), 'grid-view-away-'))
    made.push(away)
    symlinkSync(away, join(p.dir, 'linked'))
    await expect(call(p, { kind: 'plan', out: 'linked/x.png' })).rejects.toThrow(/outside the project/)
    expect(existsSync(join(away, 'x.png'))).toBe(false)
    mkdirSync(join(p.dir, 'ok'), { recursive: true })
  })

  it('uses elevation and section coordinates for their world files', async () => {
    const p = project()
    const facade = await call(p, { kind: 'facade', side: 'south', out: 'facade.png' })
    expect(facade.data['pixelToMetres']).toMatchObject({ space: 'facade' })
    expect(facade.data['worldFile']).toBe('exports/facade.pgw')
    const section = await call(p, { kind: 'section', cut: { from: [0, 3], to: [10, 3] }, out: 'cut.png' })
    expect(section.data['pixelToMetres']).toMatchObject({ space: 'section' })
    expect(section.data['worldFile']).toBe('exports/cut.pgw')
  })

  it('checks a linked world file before writing the PNG or record', async () => {
    const p = project()
    const away = project()
    mkdirSync(join(p.dir, 'pics'))
    symlinkSync(join(away.dir, 'plan.json'), join(p.dir, 'pics/plan.pgw'))
    await expect(call(p, { kind: 'plan', out: 'pics/plan.png' })).rejects.toThrow(/outside the project/)
    expect(existsSync(join(p.dir, 'pics/plan.png'))).toBe(false)
    expect(existsSync(join(p.dir, 'pics/plan.view.json'))).toBe(false)
  })

  it('writes a 3d picture as png and pdf', async () => {
    const p = project()
    const perspective = await call(p, { kind: '3d', out: 'model.png' })
    expect(perspective.data['pixelToMetres']).toBeNull()
    expect(perspective.data['worldFile']).toBeNull()
    expect(existsSync(join(p.dir, 'exports/model.pgw'))).toBe(false)
    await call(p, { kind: '3d', out: 'model.pdf' })
    expect(existsSync(join(p.dir, 'exports/model.png'))).toBe(true)
    expect(readFileSync(join(p.dir, 'exports/model.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
  })
})
