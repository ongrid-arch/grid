import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { pngSize } from '../../draw/pictureFiles'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'
import { readArgs } from '../toolkit'

/**
 * VEW-76: grid_view look=simple and look=large, the looks for a picture a person sees, and the
 * tool's description recommending simple for showing one.
 */

const house = resolve(__dirname, '../../../fixtures/two-floor-house.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function context() {
  const dir = mkdtempSync(join(tmpdir(), 'grid-simple-look-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(house))
  return { project: openProject(dir, dir) }
}

const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!
const call = async (raw: Record<string, unknown>) => view.run(readArgs(view, { plan: 'plan.json', kind: 'plan', ...raw }), context())

describe('the looks for people in grid_view', () => {
  it('recommends simple for a picture to show a person', () => {
    expect(view.description).toContain('To show the plan to a person (a buyer, a client, a family, a listing or a brochure), draw kind=plan with look=simple')
    const look = (view.args as Record<string, { enum?: readonly string[] }>)['look']!
    expect(look.enum).toEqual(expect.arrayContaining(['simple', 'large']))
  })

  it('draws a plan in the simple look and says what it shows', async () => {
    const answer = await call({ look: 'simple' })
    expect(answer.text).toContain('Plan of floor "ground", simple (rooms coloured by use, each room\'s name, width × depth and area in two units, the overall sizes along each side')
    expect(answer.text).not.toContain('with inside sizes')
    expect(pngSize(answer.image!.data).width).toBe(1200)
  })

  it('draws the large-print form and says what it shows', async () => {
    const answer = await call({ look: 'large' })
    expect(answer.text).toContain('Plan of floor "ground", large (large print: ')
    expect(pngSize(answer.image!.data).width).toBe(1200)
  })

  it('draws a facade asked for in simple as working, and says so', async () => {
    const answer = await call({ kind: 'facade', side: 'south', look: 'simple' })
    expect(answer.text).toContain('working (asked as simple)')
  })
})
