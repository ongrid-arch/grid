import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
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

function context() {
  const dir = mkdtempSync(join(tmpdir(), 'grid-all-floors-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(house))
  return { project: openProject(dir, dir) }
}

const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!
const call = async (raw: Record<string, unknown>) => view.run(readArgs(view, { plan: 'plan.json', kind: 'plan', ...raw }), context())

describe('every floor in one view', () => {
  it('lays every floor side by side at one scale, named, the lowest first', async () => {
    const one = await call({ floor: 'ground' })
    const all = await call({ floor: 'all' })
    expect(all.data['floors']).toEqual(['ground', 'first'])
    expect(all.data['floor']).toBeNull()
    expect(all.text).toContain('Every floor of the plan side by side, the lowest on the left, 2 floors, each under its name: "Ground floor" ("ground"), "First floor" ("first")')
    expect(all.text).toContain('all at one scale, 1 m = ')
    expect(all.text).toContain('Each floor is framed to the same part of the plan')
    const [a, b] = [pngSize(all.image!.data), pngSize(one.image!.data)]
    expect(a.width).toBeGreaterThan(b.width)
    expect(a.width).toBeGreaterThan(a.height)
    expect(all.data['pxPerMetre']).toBeGreaterThan(0)
  })

  it('takes look and dimensions, and refuses what needs one floor', async () => {
    const clean = await call({ floor: 'all', dimensions: false, look: 'technical' })
    expect(clean.text).toContain('Drawn in the technical look, without sizes')
    await expect(call({ floor: 'all', crop: 'study' })).rejects.toThrow(/floor=all takes look and dimensions, not crop: name one floor/)
    await expect(call({ floor: 'all', kind: '3d' })).rejects.toThrow(/floor=all draws every floor's plan side by side: it is for kind=plan/)
  })
})
