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

  it('writes a 3d picture as png and pdf', async () => {
    const p = project()
    await call(p, { kind: '3d', out: 'model.png' })
    await call(p, { kind: '3d', out: 'model.pdf' })
    expect(existsSync(join(p.dir, 'exports/model.png'))).toBe(true)
    expect(readFileSync(join(p.dir, 'exports/model.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
  })
})
