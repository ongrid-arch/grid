/**
 * VEW-87: `grid_view` takes a format (png or svg), a width or a scale, and an aspect, and the
 * picture it hands back is that size and shape: a square crop of a floor is one call, and the
 * viewer's SVG with each part's data-id comes back in the answer itself.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { sitePlanFixture } from '@ongrid/floorplan/test-support/sitePlan'
import { openProject } from '../../fs/projectFiles'
import { handleLine } from '../protocol'
import { GRID_TOOLS, projectTools } from '../serveTools'
import { readArgs, ToolRefusal } from '../toolkit'

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const dir = mkdtempSync(join(tmpdir(), 'grid-view-format-'))
writeFileSync(join(dir, 'plan.json'), readFileSync(sample))
writeFileSync(join(dir, 'site.json'), JSON.stringify(sitePlanFixture()))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const context = { project: openProject(dir, dir) }

const tool = GRID_TOOLS.find((t) => t.name === 'grid_view')!
type Drawn = { text: string; data: Record<string, unknown>; image?: { data: Uint8Array }; resource?: { uri: string; mimeType: string; text: string } }
const call = async (args: Record<string, unknown>): Promise<Drawn> => (await tool.run(readArgs(tool, { plan: 'plan.json', ...args }), context)) as Drawn
const refusal = async (args: Record<string, unknown>): Promise<string> => {
  try {
    await call(args)
  } catch (error) {
    if (error instanceof ToolRefusal) return error.message
    throw error
  }
  throw new Error('not refused')
}

function size(answer: Drawn): { width: number; height: number } {
  const bytes = Buffer.from(answer.image!.data)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('grid_view format, width, scale and aspect', () => {
  it('draws each kind in the shape asked, the whole file included', async () => {
    const asked: Array<[Record<string, unknown>, string, number]> = [
      [{ kind: 'plan' }, '1:1', 1],
      [{ kind: 'plan', look: 'simple' }, '4:5', 4 / 5],
      [{ kind: 'facade', side: 'south' }, '16:9', 16 / 9],
      [{ kind: 'section', cut: { from: [3, -2], to: [3, 12] } }, '3:2', 3 / 2],
      [{ kind: 'site', plan: 'site.json' }, '1:1', 1],
      [{ kind: '3d' }, '4:5', 4 / 5],
    ]
    for (const [args, aspect, ratio] of asked) {
      const answer = await call({ ...args, aspect, width: 1000 })
      const { width, height } = size(answer)
      expect(width, aspect).toBe(1000)
      expect(height, `${args['kind'] as string} ${aspect}`).toBe(Math.round(1000 / ratio))
    }
  })

  it('frames a 3d camera for the shape, and the record carries it', async () => {
    const answer = await call({ kind: '3d', aspect: '1:1' })
    expect((answer.data['camera'] as { aspectRatio: number }).aspectRatio).toBe(1)
    expect(size(answer)).toEqual({ width: 1200, height: 1200 })
  })

  it('lays a plan out at the width asked, and scales the same picture with scale', async () => {
    const plain = await call({ kind: 'plan' })
    const wide = await call({ kind: 'plan', width: 2400 })
    expect(size(wide).width).toBe(2400)
    const twice = await call({ kind: 'plan', scale: 2 })
    expect(size(twice)).toEqual({ width: size(plain).width * 2, height: size(plain).height * 2 })
    expect(twice.data['pxPerMetre'] as number).toBeCloseTo((plain.data['pxPerMetre'] as number) * 2, 6)
    const box = (answer: Drawn) => (answer.data['boxes'] as Array<{ box: { width: number } }>)[0]!.box.width
    expect(box(twice)).toBeCloseTo(box(plain) * 2, 0)
    expect(twice.text).toContain(`${size(twice).width} × ${size(twice).height} px`)
  })

  it('hands back the svg with data-ids as a resource, and no picture', async () => {
    const answer = await call({ kind: 'plan', format: 'svg', aspect: '1:1' })
    expect(answer.image).toBeUndefined()
    expect(answer.resource!.mimeType).toBe('image/svg+xml')
    expect(answer.resource!.text).toMatch(/^<svg/)
    expect(answer.resource!.text).toContain('data-id=')
    expect(answer.text).toContain('format')
    // Over the protocol, as an embedded resource after the text.
    const tools = projectTools(openProject(dir, dir, 'project'))
    const line = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'grid_view', arguments: { plan: 'plan.json', kind: 'facade', side: 'south', format: 'svg' } } })
    const reply = JSON.parse((await handleLine(line, tools)) as string) as { result: { content: Array<{ type: string; resource?: { mimeType: string; text: string } }> } }
    const kinds = reply.result.content.map((c) => c.type)
    expect(kinds).not.toContain('image')
    const resource = reply.result.content.find((c) => c.type === 'resource')!.resource!
    expect(resource.mimeType).toBe('image/svg+xml')
    expect(resource.text).toMatch(/^<svg/)
  })

  it('refuses what cannot be drawn so, by name', async () => {
    expect(await refusal({ kind: '3d', format: 'svg' })).toMatch(/not made as an svg/)
    expect(await refusal({ kind: 'eye', room: 'living', format: 'svg' })).toMatch(/not made as an svg/)
    expect(await refusal({ kind: 'plan', width: 1000, scale: 2 })).toMatch(/width or scale/)
    expect(await refusal({ kind: 'plan', format: 'svg', scale: 2 })).toMatch(/svg has none/)
    expect(await refusal({ kind: 'plan', out: 'a.svg', scale: 2 })).toMatch(/svg has none/)
    expect(await refusal({ kind: 'plan', width: 1000.5 })).toMatch(/whole number/)
    expect(await refusal({ kind: 'plan', width: 4000, aspect: '4:5' })).toMatch(/4096/)
    expect(await refusal({ kind: 'plan', scale: 4 })).toMatch(/4096/)
    expect(await refusal({ kind: 'plan', floor: 'all', aspect: '1:1' })).toMatch(/not aspect/)
    expect(await refusal({ kind: 'plan', width: 5000 })).toMatch(/width/)
  })
})
