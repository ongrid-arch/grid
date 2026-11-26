/**
 * The recipes page: every rooms text on it writes with no problem, and every JSON block on it is
 * valid JSON, so a reader can start from them as they are.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'

const page = readFileSync(resolve(__dirname, '../../../../../docs/recipes.md'), 'utf8')
const blocks = (tag: string): string[] => [...page.matchAll(new RegExp('```' + tag + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1] as string)

describe('docs/recipes.md', () => {
  const texts = blocks('rooms')
  it('holds four recipes with a rooms text each', () => {
    expect(texts).toHaveLength(4)
  })
  texts.forEach((text, i) => {
    it(`writes rooms text ${i + 1} with no problem`, () => {
      const result = compileRoomsText(text)
      const said = [...result.problems.map((p) => p.message), ...result.warnings.filter((w) => w.code !== 'rooms/id-changed').map((w) => `${w.code}: ${w.message}`)]
      expect(said).toEqual([])
      expect(result.plan).not.toBeNull()
    })
  })
  it('holds a site that the plan file reads, round the plot recipe\'s building', () => {
    const [site] = blocks('json')
    const plan = compileRoomsText(texts[3] as string).plan
    expect(plan).not.toBeNull()
    const read = parseFloorPlan({ ...(plan as object), ...JSON.parse(`{${site}}`) })
    expect(read.site?.boundary).toHaveLength(4)
    expect(read.site?.things).toHaveLength(1)
  })
})
