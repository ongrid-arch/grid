import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { afterAll, describe, expect, it } from 'vitest'
import { pngSize } from '../../draw/pictureFiles'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'
import { readArgs } from '../toolkit'

/**
 * VEW-74: grid_view floor=all draws every floor of the plan side by side in one picture, the
 * lowest on the left, at one scale, each named and framed to the same part of the plan.
 */

const house = resolve(__dirname, '../../../fixtures/two-floor-house.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function context(plan?: ReturnType<typeof compileRoomsText>['plan']) {
  const dir = mkdtempSync(join(tmpdir(), 'grid-all-floors-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), plan === undefined ? readFileSync(house) : JSON.stringify(plan))
  return { project: openProject(dir, dir) }
}

const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!
const call = async (raw: Record<string, unknown>, own = context()) => view.run(readArgs(view, { plan: 'plan.json', kind: 'plan', ...raw }), own)

describe('every floor in one view', () => {
  it('lays every floor side by side at one scale, named, the lowest first', async () => {
    const one = await call({ floor: 'ground' })
    const all = await call({ floor: 'all' })
    expect(all.data['floors']).toEqual(['ground', 'first'])
    expect(all.data['pixelToMetres']).toBeNull()
    const panels = all.data['panels'] as { floor: string; pixelToMetres: import('../../draw/pictureTransform').PixelTransform }[]
    expect(panels.map((panel) => panel.floor)).toEqual(['ground', 'first'])
    const atPanelTopLeft = ({ pixelToMetres: { coefficients: [a, b, c, d, e, f], area: { x, y } } }: (typeof panels)[number]) =>
      [a * x + b * y + e, c * x + d * y + f]
    expect(panels[0]!.pixelToMetres.coefficients[0]).toBe(panels[1]!.pixelToMetres.coefficients[0])
    const firstCorner = atPanelTopLeft(panels[0]!)
    atPanelTopLeft(panels[1]!).forEach((value, axis) => expect(value).toBeCloseTo(firstCorner[axis]!, 10))
    expect(all.data['floor']).toBeNull()
    expect(all.text).toContain('Every floor of the plan side by side, the lowest on the left, 2 floors, each under its name: "Ground floor" ("ground"), "First floor" ("first")')
    expect(all.text).toContain('all at one scale, 1 m = ')
    expect(all.text).toContain('Each floor is framed to the same part of the plan')
    const [a, b] = [pngSize(all.image!.data), pngSize(one.image!.data)]
    expect(a.width).toBeGreaterThan(b.width)
    expect(a.width).toBeGreaterThan(a.height)
    expect(all.data['pxPerMetre']).toBeGreaterThan(0)
  })

  it('uses the same pixel origin and scale for each floor map', async () => {
    const own = context(compileRoomsText([
      'floor ground "Ground" level 0',
      'room hall "Hall" corridor 10 x 8 at -3,-2',
      'floor first "First" level 3',
      'room landing "Landing" corridor 4 x 3 at 0,1',
    ].join('\n')).plan)
    const ground = await call({ floor: 'ground', dimensions: false }, own)
    const upper = await call({ floor: 'first', dimensions: false }, own)
    expect(ground.data['pixelToMetres']).toMatchObject({ space: 'plan' })
    expect(upper.data['pixelToMetres']).toEqual(ground.data['pixelToMetres'])
    expect(upper.data['pxPerMetre']).toBe(ground.data['pxPerMetre'])
    const close = await call({ floor: 'first', frame: 'floor', dimensions: false }, own)
    expect(close.data['pixelToMetres']).not.toEqual(ground.data['pixelToMetres'])
    expect(close.data['pxPerMetre']).toBeGreaterThan(ground.data['pxPerMetre'] as number)
  })

  it('takes look and dimensions, and refuses what needs one floor', async () => {
    const clean = await call({ floor: 'all', dimensions: false, look: 'technical' })
    expect(clean.text).toContain('Drawn in the technical look, without sizes')
    await expect(call({ floor: 'all', crop: 'study' })).rejects.toThrow(/floor=all takes look and dimensions, not crop: name one floor/)
    await expect(call({ floor: 'all', kind: '3d' })).rejects.toThrow(/floor=all draws every floor's plan side by side: it is for kind=plan/)
  })
})
