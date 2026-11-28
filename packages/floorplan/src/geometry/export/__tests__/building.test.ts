/**
 * VEW-64: the GLB and the OBJ of a plan of several floors hold the whole building when no floor
 * is named: every floor at its elevation, in the GLB under one root node with one child node per
 * floor, named by its id and moved up to its elevation. A named floor is that floor alone, at its
 * elevation too. Before, each file held the ground floor only and an upper floor's file stood at
 * height 0, so every 3D program needed a script to stack them.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../../types/floorplan'
import { exportPlan } from '../../../export/planExport'
import { floorElevations } from '../../elevations'
import { parseGlb, readMeshes, samplePlan, type Glb } from './glb-reader'

const ids = { projectId: 'p', projectName: 'Tower', now: new Date(0) }

/** The sample room's four walls and room, on a floor of its own, with ids of their own. */
function storeyOf(floor: string): Pick<FloorPlan, 'walls' | 'rooms'> {
  const sample = samplePlan()
  return {
    walls: sample.walls.map((wall) => ({ ...wall, id: `${floor}-${wall.id}`, floor })),
    rooms: sample.rooms.map((room) => ({ ...room, id: `${floor}-${room.id}`, floor, boundary: room.boundary.map((w) => `${floor}-${w}`) }))
  }
}

/** Three storeys of the sample room, one above the other. */
function threeFloors(): FloorPlan {
  const sample = samplePlan()
  const first = storeyOf('first')
  const second = storeyOf('second')
  return {
    ...sample,
    floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }, { id: 'second', name: 'Second', level: 2 }],
    walls: [...sample.walls, ...first.walls, ...second.walls],
    rooms: [...sample.rooms, ...first.rooms, ...second.rooms]
  }
}

type Node = NonNullable<Glb['json']['nodes']>[number] & { extras?: Record<string, unknown> }
const nodes = (glb: Glb): Node[] => glb.json.nodes as Node[]
const named = (glb: Glb, name: string): Node => nodes(glb).find((node) => node.name === name)!

/** The lowest and highest model height of a mesh (glTF is Y up). */
function heights(glb: Glb, name: string): [number, number] {
  const mesh = readMeshes(glb).find((m) => m.name === name)
  expect(mesh, name).toBeDefined()
  const ys = mesh!.points.map((p) => p.y)
  return [Math.min(...ys), Math.max(...ys)]
}

describe('VEW-64: the whole building in one GLB', () => {
  const plan = threeFloors()
  const levels = floorElevations(plan).floors
  const level = (floor: string): number => levels.get(floor)!.floorLevel

  it('has one root, the building, with a child node per floor named by its id and raised to its elevation', () => {
    expect(level('first')).toBeGreaterThan(2)
    expect(level('second')).toBeGreaterThan(level('first'))
    const glb = parseGlb(exportPlan(plan, 'glb', ids).data as Uint8Array)
    const roots = glb.json.scenes![0]!.nodes!
    expect(roots).toHaveLength(1)
    const root = nodes(glb)[roots[0]!]!
    expect(root.name).toBe('building')
    expect(root.translation).toBeUndefined()
    expect(root.children!.map((i) => nodes(glb)[i]!.name)).toEqual(['ground', 'first', 'second'])
    for (const floor of ['first', 'second']) {
      const node = named(glb, floor)
      expect(node.translation).toEqual([0, level(floor), 0])
      expect(node.extras).toEqual({ gridFloor: floor, gridElevation: level(floor) })
    }
    // The ground floor stands at 0 and is moved by nothing.
    expect(named(glb, 'ground').translation).toBeUndefined()
  })

  it('holds every floor\'s walls, rooms and slabs, and the roof, each floor\'s points at its height', () => {
    const glb = parseGlb(exportPlan(plan, 'glb', ids).data as Uint8Array)
    const names = readMeshes(glb).map((m) => m.name)
    for (const floor of ['ground', 'first', 'second']) {
      const prefix = floor === 'ground' ? '' : `${floor}-`
      expect(names).toContain(`wall_${prefix}w1`)
      expect(names).toContain(`floor_${prefix}r1`)
      expect(names).toContain(`slab_${floor}`)
    }
    expect(names).toContain('roof_second')
    // Every name once: one namer for the file.
    expect(new Set(names).size).toBe(names.length)
    for (const floor of ['first', 'second']) {
      const [bottom, top] = heights(glb, `wall_${floor}-w1`)
      expect(bottom).toBeCloseTo(level(floor), 6)
      expect(top).toBeCloseTo(level(floor) + 2.5, 6)
    }
    // The second floor's roof lies on its walls.
    expect(heights(glb, 'roof_second')[0]).toBeCloseTo(level('second') + 2.5, 6)
  })

  it('says which floors it holds and leaves none out', () => {
    const made = exportPlan(plan, 'glb', ids)
    expect(made.floors).toEqual([{ id: 'ground', elevation: 0 }, { id: 'first', elevation: level('first') }, { id: 'second', elevation: level('second') }])
    expect(made.floorsLeftOut).toEqual([])
    expect(made.fileName).toBe('tower.glb')
  })

  it('gives a named floor alone, its elevation on the root node, and names the floors it leaves out', () => {
    const made = exportPlan(plan, 'glb', { ...ids, floorId: 'first' })
    const glb = parseGlb(made.data as Uint8Array)
    const roots = glb.json.scenes![0]!.nodes!
    expect(roots).toHaveLength(1)
    const root = nodes(glb)[roots[0]!]!
    expect(root.name).toBe('first')
    expect(root.translation).toEqual([0, level('first'), 0])
    expect(readMeshes(glb).every((m) => m.name.startsWith('wall_first') || m.name.startsWith('floor_first') || m.name.startsWith('ceiling_first') || m.name.endsWith('_first'))).toBe(true)
    expect(heights(glb, 'wall_first-w1')[0]).toBeCloseTo(level('first'), 6)
    expect(made.floors).toEqual([{ id: 'first', elevation: level('first') }])
    expect(made.floorsLeftOut).toEqual(['ground', 'second'])
    expect(made.fileName).toBe('tower-first.glb')
  })

  it('keeps a site offset on the root, and the floors\' elevations on their own nodes', () => {
    const far: FloorPlan = {
      ...plan,
      walls: plan.walls.map((w) => ({ ...w, start: [w.start[0] + 432000, w.start[1] + 4580000], end: [w.end[0] + 432000, w.end[1] + 4580000] })),
      site: { origin: [432000, 4580000] }
    }
    const glb = parseGlb(exportPlan(far, 'glb', ids).data as Uint8Array)
    expect(named(glb, 'building').translation).toEqual([432000, 0, -4580000])
    expect(named(glb, 'second').translation).toEqual([0, level('second'), 0])
    const wall = readMeshes(glb).find((m) => m.name === 'wall_second-w1')!
    expect(Math.min(...wall.points.map((p) => p.x))).toBeGreaterThan(431999)
    expect((glb.json.asset as { extras?: { gridOrigin?: { note?: string } } }).extras?.gridOrigin?.note).toContain('"building"')
  })

  it('falls back to the ground floor alone for a floor the plan does not have', () => {
    const made = exportPlan(plan, 'glb', { ...ids, floorId: 'gone' })
    expect(made.floors.map((f) => f.id)).toEqual(['ground'])
    expect(made.floorsLeftOut).toEqual(['first', 'second'])
  })
})

describe('VEW-64: the whole building in one OBJ', () => {
  const plan = threeFloors()
  const levels = floorElevations(plan).floors

  /** The z range of each named object. */
  const ranges = (obj: string): Map<string, [number, number]> => {
    const out = new Map<string, [number, number]>()
    let current: [number, number] | null = null
    for (const line of obj.split('\n')) {
      if (line.startsWith('o ')) out.set(line.slice(2), (current = [Infinity, -Infinity]))
      else if (line.startsWith('v ') && current !== null) {
        const z = Number(line.split(' ')[3])
        current[0] = Math.min(current[0], z)
        current[1] = Math.max(current[1], z)
      }
    }
    return out
  }

  it('writes every floor at its elevation, each opened by a comment naming it', () => {
    const made = exportPlan(plan, 'obj', ids)
    const obj = made.data as string
    for (const floor of ['ground', 'first', 'second']) {
      expect(obj).toContain(`# grid-floor "${floor}" elevation=${levels.get(floor)!.floorLevel.toFixed(6)}`)
    }
    expect(obj).toContain("# Each floor is written at its elevation: Z is the height above the ground floor's floor level.")
    expect(obj).not.toMatch(/^g /m)
    const z = ranges(obj)
    expect(z.get('wall_w1')![0]).toBeCloseTo(0, 6)
    expect(z.get('wall_second-w1')![0]).toBeCloseTo(levels.get('second')!.floorLevel, 6)
    expect(z.has('roof_second')).toBe(true)
    expect(made.floorsLeftOut).toEqual([])
    expect(made.fileName).toBe('tower.obj')
  })

  it('writes a named floor alone at its elevation', () => {
    const made = exportPlan(plan, 'obj', { ...ids, floorId: 'second' })
    const z = ranges(made.data as string)
    expect([...z.keys()].some((name) => name.startsWith('wall_first'))).toBe(false)
    expect(z.get('wall_second-w1')![0]).toBeCloseTo(levels.get('second')!.floorLevel, 6)
    expect(made.floorsLeftOut).toEqual(['ground', 'first'])
  })
})

describe('VEW-72: a DXF holds every floor unless one is named', () => {
  it('holds every floor when none is named, and leaves none out', () => {
    const made = exportPlan(threeFloors(), 'dxf', ids)
    expect(made.floors.map((floor) => floor.id)).toEqual(['ground', 'first', 'second'])
    expect(made.floorsLeftOut).toEqual([])
    expect(made.fileName).toBe('tower.dxf')
    expect(made.sheets.map((sheet) => [sheet.floor, sheet.scale, sheet.fits])).toEqual([['ground', 100, true], ['first', 100, true], ['second', 100, true]])
  })

  it('holds the floor named alone, and names the floors it leaves out', () => {
    const made = exportPlan(threeFloors(), 'dxf', { ...ids, floorId: 'first' })
    expect(made.floors.map((floor) => floor.id)).toEqual(['first'])
    expect(made.floorsLeftOut).toEqual(['ground', 'second'])
    expect(made.fileName).toBe('tower-first.dxf')
  })
})
