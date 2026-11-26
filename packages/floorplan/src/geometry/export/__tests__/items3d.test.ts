/**
 * CNT-42: fixtures and furniture are raised in 3D as the plain blocks their kind gives (the kinds
 * registry), on the floor of the room each stands in, and the OBJ and the GLB write each item as
 * a solid of its own.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Item } from '../../../types/floorplan'
import { flat } from '../../../test-support/plans'
import { buildScene } from '../../scene3d'
import { toObj } from '../obj'
import { toGlb } from '../gltf'
import { parseGlb, readMeshes } from './glb-reader'

const furnished = (items: Item[], plan: FloorPlan = flat()): FloorPlan => ({ ...plan, items })

const sofa: Item = { id: 'sofa', kind: 'sofa', at: [2, 6], size: [2, 0.9], height: 0.85 }
const table: Item = { id: 'table', kind: 'table', at: [7, 2], size: [1.2, 0.8], height: 0.75 }
const plant: Item = { id: 'plant', kind: 'plant', at: [3.5, 7.5], size: [0.5, 0.5], height: 1.2 }

describe('items in 3D', () => {
  it('raises each item Grid can draw, by its kind, between its floor and its height', () => {
    const scene = buildScene(furnished([sofa, table, plant, { id: 'piano', kind: 'piano', at: [7, 6], size: [1.5, 0.6], height: 1.3 }]))
    expect(scene.items!.map((i) => [i.id, i.kind])).toEqual([
      ['sofa', 'sofa'],
      ['table', 'table'],
      ['plant', 'plant'],
    ])
    for (const item of scene.items!) {
      const tops = item.blocks.map((b) => b.top)
      expect(Math.max(...tops), item.id).toBeCloseTo([sofa, table, plant].find((i) => i.id === item.id)!.height, 9)
      expect(Math.min(...item.blocks.map((b) => b.bottom)), item.id).toBe(0)
    }
    // A table is a top on four legs, a sofa a back, a seat and two arms, a plant its pot and leaves.
    expect(scene.items!.map((i) => i.blocks.length)).toEqual([4, 5, 2])
  })

  it('gives no items for a plan with none, and raises an item from its room\'s raised floor', () => {
    expect(buildScene(flat()).items).toEqual([])
    const plan = furnished([sofa])
    const raised: FloorPlan = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'bedroom' ? { ...r, floorOffset: 0.3 } : r)) }
    const [item] = buildScene(raised).items!
    expect(Math.min(...item!.blocks.map((b) => b.bottom))).toBeCloseTo(0.3, 9)
    expect(Math.max(...item!.blocks.map((b) => b.top))).toBeCloseTo(1.15, 9)
  })

  it('makes each item a solid of its own in the OBJ and the GLB', () => {
    const scene = buildScene(furnished([sofa, table, plant]))
    const obj = toObj(scene)
    expect(obj.split('\n').filter((line) => line.startsWith('o item_'))).toEqual(['o item_sofa', 'o item_table', 'o item_plant'])
    const meshes = readMeshes(parseGlb(toGlb(scene))).filter((m) => m.name.startsWith('item_'))
    expect(meshes.map((m) => m.name)).toEqual(['item_sofa', 'item_table', 'item_plant'])
    // glTF's y is up: the plant stands 1.2 m tall.
    expect(Math.max(...meshes[2]!.points.map((p) => p.y))).toBeCloseTo(1.2, 5)
  })
})
