import { describe, expect, it } from 'vitest'
import { edit, stairRoomHouse, twoFloorHouse } from '../../test-support/plans'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planForFloor } from '../floors'
import { buildScene } from '../scene3d'
import { floorMesh, type Mesh } from '../export/mesh'
import { toGlb } from '../export/gltf'
import { toObj } from '../export/obj'
import { parseGlb } from '../export/__tests__/glb-reader'

/**
 * LVL-27: a room's floor in 3D is open where its storey's slab is: a void (LVL-4) has none, and a
 * room over a stair, a stair room or a lift shaft below is laid round the opening, so no floor
 * covers it in the 3D view, the GLB or the OBJ file.
 */
const sceneOf = (plan: FloorPlan, floor: string) => buildScene(planForFloor(parseFloorPlan(plan), floor))
const slabOf = (plan: FloorPlan, floor: string, room: string) => sceneOf(plan, floor).slabs.find((s) => s.roomId === room)!

/** The area a floor mesh covers on plan: every face, as a floor with no offset has only its top. */
function meshArea(mesh: Mesh | null): number {
  if (mesh === null) return 0
  return mesh.faces.reduce((sum, [a, b, c]) => {
    const [p, q, r] = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!]
    return sum + Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2
  }, 0)
}

const withVoid = (): FloorPlan => edit(twoFloorHouse(), (p) => {
  p.rooms = p.rooms.map((r) => (r.id === 'landing' ? { ...r, void: true } : r))
  p.openings = p.openings.filter((o) => o.id !== 'd_up')
})

describe('LVL-27 a void has no floor in 3D', () => {
  it('lays no floor for the void, and keeps its outline for the room', () => {
    const slab = slabOf(withVoid(), 'first', 'landing')
    expect(slab.pieces).toEqual([])
    expect(slab.polygon.length).toBeGreaterThan(2)
    expect(floorMesh(slab)).toBeNull()
  })

  it('writes no floor node for it in the GLB or the OBJ, and keeps the other rooms\' floors', () => {
    const scene = sceneOf(withVoid(), 'first')
    const nodes = (parseGlb(toGlb(scene)).json.nodes ?? []).map((n) => n.name ?? '')
    expect(nodes.some((name) => /floor/i.test(name) && /landing/i.test(name))).toBe(false)
    expect(nodes.some((name) => /floor/i.test(name) && /study/i.test(name))).toBe(true)
    const obj = toObj(scene)
    expect(/^o .*floor.*landing/im.test(obj)).toBe(false)
    expect(/^o .*floor.*study/im.test(obj)).toBe(true)
  })

  it('draws the landing\'s floor when it is no void', () => {
    const slab = slabOf(twoFloorHouse(), 'first', 'landing')
    expect(slab.pieces).toBeUndefined()
    expect(meshArea(floorMesh(slab))).toBeCloseTo(4.85 * 7.8, 6)
  })
})

describe('LVL-27 a room floor is open over a stair or a stair room below', () => {
  it('lays no floor in a stair room over the stair room below, and a whole one at its foot', () => {
    const plan = stairRoomHouse()
    const upper = slabOf(plan, 'first', 'first-stair')
    expect(upper.pieces).toEqual([])
    expect(floorMesh(upper)).toBeNull()
    const foot = slabOf(plan, 'ground', 'ground-stair')
    expect(foot.pieces).toBeUndefined()
    expect(meshArea(floorMesh(foot))).toBeCloseTo(7.03, 2)
  })

  it('cuts only the flights and landings of a stated stair out of the room\'s floor', () => {
    const plan = { ...stairRoomHouse(), stairs: [{ id: 's', from: 'ground', to: 'first', width: 0.9, run: [[5, 0.6], [5, 3.4]] as [number, number][] }] }
    const upper = slabOf(plan, 'first', 'first-stair')
    expect(upper.pieces!.length).toBeGreaterThan(0)
    expect(meshArea(floorMesh(upper))).toBeCloseTo(7.03 - 2.52, 1)
    // The room beside it keeps its whole floor.
    expect(slabOf(plan, 'first', 'first-main').pieces).toBeUndefined()
  })
})
