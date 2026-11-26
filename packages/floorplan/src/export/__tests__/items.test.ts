/**
 * CNT-48: every fixture and piece of furniture the plan holds is in the GLB and the OBJ, as one
 * object named `item_<id>` on its own floor, or the file's `leftOut` names it. A furnished house
 * of two floors exports every item and leaves none out; an item Grid's checks call broken is
 * named and is not in the file.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { parseGlb, readMeshes } from '../../geometry/export/__tests__/glb-reader'
import { itemFootprint, itemSolid } from '../../geometry/items'
import { registerItemKind } from '../../geometry/itemKinds'
import { exportPlan } from '../planExport'

const ids = { projectId: 'project-1', projectName: 'House', now: new Date('2026-11-26T12:00:00.000Z') }
const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))
const objObjects = (obj: string): string[] => obj.split('\n').filter((l) => l.startsWith('o ')).map((l) => l.slice(2))

function written(lines: readonly string[]): FloorPlan {
  const result = compileRoomsText(lines.join('\n'))
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(result.plan)
}

const house = written([
  'walls outside 0.3 inside 0.1 height 2.7',
  'floor ground "Ground" level 0 height 3',
  'room kitchen "Kitchen" kitchen 4 x 3.5 at 0,0',
  'room bath "Bathroom" bathroom 2.4 x 2 east of kitchen',
  'item run kitchen-run-3000 in kitchen against north, at west',
  'item island kitchen-run 1.8 x 0.9 at 2,1.4',
  'item tub bath in bath against north, at west',
  'item wc1 wc in bath against east, 0.1 from south',
  'floor first "First" level 3 height 3',
  'room bed "Bedroom" bedroom 4 x 3.5 at 0,0',
  'item bed1 double-bed in bed against north, at west',
  'item robe wardrobe in bed against east, full width',
])
const ITEMS = ['run', 'island', 'tub', 'wc1', 'bed1', 'robe']

describe('a furnished house of two floors', () => {
  it('holds every item in the GLB, on its own floor, and leaves none out', () => {
    expect((house.items ?? []).map((i) => i.id).sort()).toEqual([...ITEMS].sort())
    const out = exportPlan(house, 'glb', ids)
    expect(out.leftOut).toEqual([])
    const meshes = readMeshes(parseGlb(out.data as Uint8Array))
    for (const id of ITEMS) expect(meshes.some((m) => m.name === `item_${id}`), id).toBe(true)
    // The bed stands on the first floor, 3 m up (the GLB is y up).
    const bed = meshes.find((m) => m.name === 'item_bed1')!
    expect(Math.min(...bed.points.map((p) => p.y))).toBeGreaterThanOrEqual(3 - 1e-6)
  })

  it('holds every item in the OBJ and leaves none out', () => {
    const out = exportPlan(house, 'obj', ids)
    expect(out.leftOut).toEqual([])
    const objects = objObjects(text(out.data))
    for (const id of ITEMS) expect(objects, id).toContain(`item_${id}`)
  })

  it('names an item it cannot draw in leftOut and in the file, and writes nothing of it', () => {
    const broken: FloorPlan = { ...house, items: [...house.items!, { ...house.items![0]!, id: 'ghost', kind: 'spaceship' }] }
    for (const format of ['glb', 'obj'] as const) {
      const out = exportPlan(broken, format, ids)
      expect(out.leftOut.map((p) => [p.kind, p.id])).toEqual([['item', 'ghost']])
      const body = text(out.data)
      expect(body).toContain('"ghost"')
      expect(body).not.toContain('item_ghost')
    }
  })
})

describe('an item whose kind\'s blocks are all cut away', () => {
  it('stands as its footprint box rather than vanishing', () => {
    // A kind of its own whose only block stands above any height it is given.
    const unregister = registerItemKind({
      kind: 'hanging-lamp',
      group: 'furniture',
      word: 'hanging lamp',
      about: 'A lamp hung from the ceiling.',
      symbol: (p) => ({ rings: [p.box(-0.5, -0.5, 0.5, 0.5)], lines: [] }),
      solid: (p) => [{ outline: p.box(-0.5, -0.5, 0.5, 0.5), bottom: 50, top: 51 }],
    })
    try {
      const lamp = { id: 'l', kind: 'hanging-lamp', at: [1, 1] as [number, number], size: [0.4, 0.4] as [number, number], height: 0.3 }
      expect(itemSolid(lamp)).toEqual([{ outline: itemFootprint(lamp), bottom: 0, top: 0.3 }])
    } finally {
      unregister()
    }
  })
})
