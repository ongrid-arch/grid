/**
 * WRT-70: a plan read back as rooms text and written again keeps a part typed by the plan's
 * default types (`types.defaults`) typed by them: the file names a type only on the parts that
 * named one, so a later change of the default still reaches every other part. A part that named
 * its type keeps it, and a raw line pins no default either.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, statedOpening, statedWall, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { carryFacts } from '../facts'
import { readRoomsText } from '../read'

const TWO_BED = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) as FloorPlan

/** The two-bed flat with a default partition, outside wall and window type, its walls and windows stating none of what the types give, and the spine naming its own. */
function typedFile(): Record<string, unknown> {
  return {
    ...TWO_BED,
    types: {
      walls: [
        { id: 'stud', name: 'Stud partition', thickness: 0.1 },
        { id: 'block', name: 'Block wall', thickness: 0.3 },
        { id: 'thick-stud', name: 'Thick stud partition', thickness: 0.1 },
      ],
      windows: [{ id: 'casement', name: 'Casement', height: 1.2 }],
      defaults: { walls: { interior: 'stud', exterior: 'block' }, window: 'casement' },
    },
    walls: TWO_BED.walls.map((w) => {
      const { thickness: _t, ...rest } = w
      return w.id === 'spine' ? { ...rest, wallType: 'thick-stud' } : rest
    }),
    openings: TWO_BED.openings.map((o) => {
      if (o.type !== 'window') return o
      const { height: _h, ...rest } = o
      return rest
    }),
  }
}

/** What `grid describe --as rooms` and `grid write` do: read back, write again, carry the facts, write each part as stated. */
function writtenAgain(file: Record<string, unknown>): { walls: Record<string, unknown>[]; openings: Record<string, unknown>[] } {
  const before = parseFloorPlan(file)
  const text = readRoomsText(before).text
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = carryFacts(before, parseFloorPlan(result.plan)).plan
  return { walls: plan.walls.map((w) => statedWall(w) as Record<string, unknown>), openings: plan.openings.map((o) => statedOpening(o) as Record<string, unknown>) }
}

describe('WRT-70 the read-back names a type only on the parts that name one', () => {
  it('leaves the walls and windows typed by a default unnamed, and the spine its own type', () => {
    const out = writtenAgain(typedFile())
    const spine = out.walls.find((w) => w['id'] === 'spine')!
    expect(spine['wallType']).toBe('thick-stud')
    for (const wall of out.walls.filter((w) => w['id'] !== 'spine')) expect(wall, String(wall['id'])).not.toHaveProperty('wallType')
    for (const window of out.openings.filter((o) => o['type'] === 'window')) expect(window, String(window['id'])).not.toHaveProperty('windowType')
  })

  it('leaves to the default what it gives, so a change of the defaults reaches every part they type', () => {
    const out = writtenAgain(typedFile())
    for (const wall of out.walls) expect(wall, String(wall['id'])).not.toHaveProperty('thickness')
    for (const window of out.openings.filter((o) => o['type'] === 'window')) expect(window, String(window['id'])).not.toHaveProperty('height')
    const file = typedFile()
    const types = file['types'] as { walls: unknown[]; windows: unknown[] }
    const changed = {
      ...file,
      walls: out.walls,
      openings: out.openings,
      types: {
        walls: [...types.walls, { id: 'stud-150', name: 'Stud partition 150', thickness: 0.15 }],
        windows: [...types.windows, { id: 'tall', name: 'Tall casement', height: 1.5 }],
        defaults: { walls: { interior: 'stud-150', exterior: 'block' }, window: 'tall' },
      },
    }
    const read = parseFloorPlan(changed)
    expect(read.walls.filter((w) => w.kind === 'interior' && w.id !== 'spine').map((w) => [w.wallType, w.thickness])).toEqual([0, 1, 2, 3].map(() => ['stud-150', 0.15]))
    expect(read.walls.find((w) => w.id === 'spine')!.wallType).toBe('thick-stud')
    expect(read.openings.filter((o) => o.type === 'window').map((o) => [o.windowType, o.height])).toEqual([0, 1, 2, 3, 4, 5].map(() => ['tall', 1.5]))
  })

  it('writes no default type into a raw line', () => {
    const file = typedFile()
    const free = { id: 'screen', start: [1, 1], end: [2, 1], kind: 'interior' }
    const before = parseFloorPlan({ ...file, walls: [...(file['walls'] as unknown[]), free] })
    const text = readRoomsText(before).text
    const line = text.split('\n').find((l) => l.startsWith('raw wall') && l.includes('"screen"'))
    expect(line).toBeDefined()
    expect(line).not.toContain('wallType')
  })
})
