/**
 * VEW-82: a GLB a game engine or a renderer uses as it is. Before, every node said only its name,
 * every door stood closed in its hole on no hinge, a wall as long as the building was one mesh and
 * the saved views stayed in the plan file.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../../types/floorplan'
import { exportPlan } from '../../../export/planExport'
import { parseGlb, readMeshes, type Glb, type ReadMesh } from './glb-reader'
import { limit } from '../../tolerances'

const ids = { projectId: 'p', projectName: 'Two rooms', now: new Date(0) }

/** Two rooms side by side, the kitchen west of the hall, one long wall along their south side. */
function twoRooms(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [8, 0], thickness: 0.2, height: 2.5, kind: 'exterior', wallType: 'brick', properties: { fire: 'EI60' } },
      { id: 'w2', start: [8, 0], end: [8, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w3', start: [8, 3], end: [0, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w5', start: [4, 0], end: [4, 3], thickness: 0.1, height: 2.5, kind: 'partition' }
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', boundary: ['w1', 'w5', 'w3', 'w4'], use: 'kitchen', roomType: 'K1', number: '101', finishes: { floor: 'Oak', walls: 'Tile' }, properties: { zone: 'A' } },
      { id: 'hall', name: 'Hall', boundary: ['w1', 'w2', 'w3', 'w5'], use: 'hall', finishes: { walls: 'Paint' } }
    ],
    openings: [
      { id: 'd1', wall: 'w5', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left', doorType: 'flush', properties: { lock: 'yes' } },
      { id: 'n1', wall: 'w1', type: 'window', offset: 1.5, width: 1.2, sill: 0.9, height: 1.2 }
    ],
    items: [{ id: 'sink', kind: 'sink', at: [2, 2.5], size: [0.6, 0.5], height: 0.9, label: 'Sink', properties: { tap: 'mixer' } }],
    types: {
      walls: [{ id: 'brick', name: 'Brick' }],
      doors: [{ id: 'flush', name: 'Flush door' }]
    },
    views: [
      {
        name: 'Kitchen view',
        target: { room: 'kitchen', point: [2, 1.5, 1.2] },
        bearing: 180,
        bearingFrom: 'plan up',
        tilt: 0,
        distance: 3,
        lens: { focalLength: 35, sensor: { width: 36, height: 24 } },
        position: [2, -1.5, 1.2],
        direction: [0, 1, 0],
        up: [0, 0, 1],
        fieldOfView: 37.8,
        aspectRatio: 1.5
      }
    ]
  } as FloorPlan
}

type Node = {
  name?: string
  mesh?: number
  camera?: number
  children?: number[]
  translation?: number[]
  rotation?: number[]
  extras?: Record<string, unknown>
}
const nodes = (glb: Glb): Node[] => glb.json.nodes as Node[]
const named = (glb: Glb, name: string): Node => {
  const node = nodes(glb).find((n) => n.name === name)
  expect(node, name).toBeDefined()
  return node!
}
const glbOf = (plan: FloorPlan, more: Parameters<typeof exportPlan>[2] extends infer O ? Partial<O> : never = {}): Glb =>
  parseGlb(exportPlan(plan, 'glb', { ...ids, ...more }).data as Uint8Array)

/** The area of a mesh's triangles. */
function area(mesh: ReadMesh): number {
  return mesh.triangles.reduce((sum, [a, b, c]) => {
    const [p, q, r] = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!]
    const u = [q.x - p.x, q.y - p.y, q.z - p.z]
    const v = [r.x - p.x, r.y - p.y, r.z - p.z]
    return sum + Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2
  }, 0)
}

/** A point turned by a unit quaternion [x, y, z, w]. */
function turned([x, y, z, w]: number[], [px, py, pz]: number[]): number[] {
  const t = [2 * (y! * pz! - z! * py!), 2 * (z! * px! - x! * pz!), 2 * (x! * py! - y! * px!)]
  return [px! + w! * t[0]! + (y! * t[2]! - z! * t[1]!), py! + w! * t[1]! + (z! * t[0]! - x! * t[2]!), pz! + w! * t[2]! + (x! * t[1]! - y! * t[0]!)]
}

describe('VEW-82: each node says what it is in its extras', () => {
  const glb = glbOf(twoRooms())

  it('gives a wall its id, kind, floor, the rooms on its faces, its type, its finish in each room and its facts', () => {
    expect(named(glb, 'wall_w1').extras).toEqual({
      gridId: 'w1',
      gridKind: 'wall',
      gridFloor: 'ground',
      gridRooms: { left: ['hall', 'kitchen'], right: [] },
      gridFinish: { hall: 'Paint', kitchen: 'Tile' },
      gridType: 'brick',
      gridProperties: { fire: 'EI60' }
    })
    expect(named(glb, 'wall_w5').extras!['gridRooms']).toEqual({ left: ['kitchen'], right: ['hall'] })
  })

  it('gives a room\'s floor its name, number, use, finishes, type and facts', () => {
    expect(named(glb, 'floor_kitchen').extras).toEqual({
      gridId: 'kitchen',
      gridKind: 'room',
      gridFloor: 'ground',
      gridRooms: ['kitchen'],
      gridName: 'Kitchen',
      gridNumber: '101',
      gridUse: 'kitchen',
      gridFinish: { floor: 'Oak', walls: 'Tile' },
      gridType: 'K1',
      gridProperties: { zone: 'A' }
    })
  })

  it('gives each part of a door and a window its opening, the part it is, the rooms either side and its type', () => {
    expect(named(glb, 'frame_d1').extras).toMatchObject({ gridId: 'd1', gridKind: 'door', gridPart: 'frame', gridRooms: { left: ['kitchen'], right: ['hall'] }, gridType: 'flush', gridSwing: 'left', gridProperties: { lock: 'yes' } })
    expect(named(glb, 'leaf_d1').extras).toMatchObject({ gridId: 'd1', gridKind: 'door', gridPart: 'leaf', gridMotion: 'swings' })
    expect(named(glb, 'glass_n1').extras).toMatchObject({ gridId: 'n1', gridKind: 'window', gridPart: 'glass', gridRooms: { left: ['kitchen'], right: [] } })
  })

  it('gives an item its kind as its type, its label, the room it stands in and its facts', () => {
    expect(named(glb, 'item_sink').extras).toEqual({ gridId: 'sink', gridKind: 'item', gridFloor: 'ground', gridRooms: ['kitchen'], gridName: 'Sink', gridType: 'sink', gridProperties: { tap: 'mixer' } })
  })

  it('writes markup in a name as escapes in the file, the same name to a JSON reader', () => {
    const plan = twoRooms()
    const name = '<b>Kitchen</b> & \u202eevil'
    const data = exportPlan({ ...plan, rooms: plan.rooms.map((r) => (r.id === 'kitchen' ? { ...r, name } : r)) }, 'glb', ids).data as Uint8Array
    // The JSON chunk's text: its length after the 12-byte header, its bytes after the chunk's 8.
    const jsonText = new TextDecoder().decode(data.subarray(20, 20 + new DataView(data.buffer, data.byteOffset).getUint32(12, true)))
    expect(jsonText).not.toMatch(/[<>&\u202e]/)
    expect(named(parseGlb(data), 'floor_kitchen').extras!['gridName']).toBe(name)
  })

  it('gives no facts to a wall that cannot be drawn, and writes the rest', () => {
    const plan = twoRooms()
    const glb = glbOf({ ...plan, walls: plan.walls.map((w) => (w.id === 'w2' ? { ...w, end: w.start } : w)) })
    expect(nodes(glb).some((n) => n.name === 'wall_w2')).toBe(false)
    expect(named(glb, 'wall_w1').extras!['gridId']).toBe('w1')
  })

  it('groups each floor\'s parts by kind, each group saying its floor and kind', () => {
    const ground = named(glb, 'ground')
    const groups = ground.children!.map((i) => nodes(glb)[i]!)
    expect(groups.map((g) => g.name)).toEqual(['walls_ground', 'rooms_ground', 'linings_ground', 'ceilings_ground', 'items_ground', 'doors_ground', 'windows_ground', 'shell_ground'])
    for (const group of groups) {
      expect(group.mesh).toBeUndefined()
      const kind = group.extras!['gridKind']
      expect(group.extras).toEqual({ gridFloor: 'ground', gridKind: kind })
      for (const child of group.children!) {
        const extras = nodes(glb)[child]!.extras!
        expect(kind === 'shell' ? ['slab', 'roof', 'parapet'] : [kind]).toContain(extras['gridKind'])
      }
    }
  })
})

describe('VEW-82: doors', () => {
  it('stands a swinging leaf on its hinge, its points where they were', () => {
    const plan = twoRooms()
    const glb = glbOf(plan)
    const leaf = named(glb, 'leaf_d1')
    // The hinge is at the door's start end, the middle of the leaf hung on the kitchen's face: y 1 plus the frame.
    expect(leaf.translation![0]).toBeCloseTo(4 - 0.03, 6)
    expect(leaf.translation![1]).toBe(0)
    expect(-leaf.translation![2]!).toBeGreaterThan(1)
    expect(-leaf.translation![2]!).toBeLessThan(1.1)
    // In the world the leaf fills the door from its hinge along the wall, as it did with no hinge.
    const points = readMeshes(glb).find((m) => m.name === 'leaf_d1')!.points
    const ys = points.map((p) => -p.z)
    expect(Math.min(...ys)).toBeCloseTo(-leaf.translation![2]!, 6)
    expect(Math.max(...ys)).toBeGreaterThan(1.8)
    for (const p of points) expect(Math.abs(p.x - 4)).toBeLessThan(0.06)
    // Turning about +Y opens it toward the wall's left face, the kitchen (x < 4), the way it swings.
    expect(leaf.extras!['gridOpens']).toBe(1)
  })

  it('turns each swinging leaf open by the table\'s angle with doors open, toward its swing', () => {
    const glb = glbOf(twoRooms(), { doors: 'open' })
    const leaf = named(glb, 'leaf_d1')
    expect(limit('doorOpenAngle')).toBe(90)
    const local = readMeshes(parseGlb(exportPlan(twoRooms(), 'glb', ids).data as Uint8Array)).find((m) => m.name === 'leaf_d1')!.points
    const hinge = leaf.translation!
    // The leaf's free end, turned about its hinge, lies in the kitchen, west of the wall.
    const far = local.reduce((a, b) => (-b.z > -a.z ? b : a))
    const swung = turned(leaf.rotation!, [far.x - hinge[0]!, far.y - hinge[1]!, far.z - hinge[2]!])
    expect(hinge[0]! + swung[0]!).toBeLessThan(4 - 0.7)
    expect(Math.abs(-(hinge[2]! + swung[2]!) - -hinge[2]!)).toBeLessThan(0.1)
  })

  it('leaves out the leaves with doors as gaps, and keeps the frames', () => {
    const names = readMeshes(glbOf(twoRooms(), { doors: 'gaps' })).map((m) => m.name)
    expect(names).toContain('frame_d1')
    expect(names).not.toContain('leaf_d1')
    // A window is no door: its glass stays.
    expect(names).toContain('glass_n1')
  })

  it('writes an empty node for each door with doors as markers, at its threshold, turned along its wall', () => {
    const glb = glbOf(twoRooms(), { doors: 'markers' })
    expect(readMeshes(glb).some((m) => m.name.endsWith('_d1'))).toBe(false)
    const marker = named(glb, 'door_d1')
    expect(marker.mesh).toBeUndefined()
    expect(marker.translation![0]).toBeCloseTo(4, 6)
    expect(marker.translation![1]).toBe(0)
    expect(-marker.translation![2]!).toBeCloseTo(1.45, 6)
    // The partition runs north (+y), a quarter turn from +x.
    expect(marker.rotation).toEqual([0, Math.round(Math.sin(Math.PI / 4) * 1e9) / 1e9, 0, Math.round(Math.cos(Math.PI / 4) * 1e9) / 1e9])
    expect(marker.extras).toMatchObject({ gridId: 'd1', gridKind: 'door', gridSwing: 'left', gridType: 'flush' })
    expect(marker.extras!['gridWidth']).toBeCloseTo(0.9, 9)
    expect(marker.extras!['gridHeight']).toBeCloseTo(2.1, 9)
    expect(named(glb, 'doors_ground').children).toContain(nodes(glb).indexOf(marker))
  })
})

describe('VEW-82: walls split at their rooms', () => {
  it('keeps every wall whole unless asked', () => {
    expect(readMeshes(glbOf(twoRooms())).filter((m) => m.name.startsWith('wall_w1'))).toHaveLength(1)
  })

  it('splits a wall where the rooms beside it change, each piece named by its rooms, with the same faces', () => {
    const whole = readMeshes(glbOf(twoRooms())).find((m) => m.name === 'wall_w1')!
    const glb = glbOf(twoRooms(), { walls: 'rooms' })
    const pieces = readMeshes(glb).filter((m) => m.name.startsWith('wall_w1'))
    expect(pieces.map((m) => m.name)).toEqual(['wall_w1_kitchen.outside', 'wall_w1_hall.outside'])
    expect(named(glb, 'wall_w1_kitchen.outside').extras).toMatchObject({ gridId: 'w1', gridRooms: { left: ['kitchen'], right: [] }, gridFinish: { kitchen: 'Tile' } })
    expect(named(glb, 'wall_w1_hall.outside').extras).toMatchObject({ gridRooms: { left: ['hall'], right: [] }, gridFinish: { hall: 'Paint' } })
    // The two pieces cover the whole wall's faces, plus the two faces of the cut between them.
    const cut = 2.5 * 0.2
    expect(pieces.reduce((sum, m) => sum + area(m), 0)).toBeCloseTo(area(whole) + 2 * cut, 6)
    // The window stays in the kitchen's piece; the cut is at the hall's corner, past it.
    const xs = (m: ReadMesh): number[] => m.points.map((p) => p.x)
    expect(Math.max(...xs(pieces[0]!))).toBeLessThan(4.1)
    expect(Math.min(...xs(pieces[1]!))).toBeGreaterThan(3.9)
  })

  it('never cuts through a door or window', () => {
    const plan = twoRooms()
    // A window across the hall's corner on the long wall: the cut would run through it.
    const across = { ...plan, openings: [...plan.openings, { id: 'n2', wall: 'w1', type: 'window' as const, offset: 3.5, width: 1, sill: 0.9, height: 1.2 }] }
    const names = readMeshes(glbOf(across, { walls: 'rooms' })).map((m) => m.name)
    expect(names.filter((n) => n.startsWith('wall_w1'))).toEqual(['wall_w1'])
  })
})

describe('VEW-82: saved views as cameras', () => {
  it('writes each saved view as a perspective camera, standing where it stands and looking where it looks', () => {
    const glb = glbOf(twoRooms())
    const json = glb.json as unknown as { cameras: { name: string; type: string; perspective: { yfov: number; aspectRatio: number; znear: number } }[]; scenes: { nodes: number[] }[] }
    expect(json.cameras).toEqual([{ name: 'Kitchen view', type: 'perspective', perspective: { yfov: (37.8 * Math.PI) / 180, aspectRatio: 1.5, znear: limit('cameraNear') } }])
    const node = named(glb, 'view_Kitchen_view')
    expect(node.camera).toBe(0)
    expect(json.scenes[0]!.nodes).toContain(nodes(glb).indexOf(node))
    // Plan (2, -1.5, 1.2) is glTF (2, 1.2, 1.5).
    expect(node.translation).toEqual([2, 1.2, 1.5])
    // A camera looks down its -Z: the view looks north, plan +y, which is glTF -Z.
    const look = turned(node.rotation!, [0, 0, -1])
    expect(look[0]).toBeCloseTo(0, 9)
    expect(look[1]).toBeCloseTo(0, 9)
    expect(look[2]).toBeCloseTo(-1, 9)
    const up = turned(node.rotation!, [0, 1, 0])
    expect(up[1]).toBeCloseTo(1, 9)
    expect(node.extras).toEqual({ gridView: 'Kitchen view', gridTarget: [2, 1.5, 1.2], gridRoom: 'kitchen' })
  })

  it('writes no camera for a plan with no saved view', () => {
    const plan: FloorPlan = { ...twoRooms(), views: [] }
    expect((glbOf(plan).json as { cameras?: unknown }).cameras).toBeUndefined()
  })
})
