/**
 * CNT-60: a GLB of the whole building carries the site: one node `site` under the building's root,
 * holding the ground cut to the plot and the site's blocks, each in its material; a party wall is
 * written in the cut material.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../../types/floorplan'
import { exportPlan } from '../../../export/planExport'
import { limit } from '../../tolerances'
import { parseGlb, readMeshes, samplePlan, type Glb } from './glb-reader'

const ids = { projectId: 'p', projectName: 'Plot', now: new Date(0) }

function sitedPlan(): FloorPlan {
  const sample = samplePlan()
  return {
    ...sample,
    walls: sample.walls.map((wall, i) => (i === 0 ? { ...wall, kind: 'separating' as const, beyond: 'neighbour' as const } : wall)),
    site: {
      ground: -0.2,
      boundary: [[-6, -6], [10, -6], [10, 9], [-6, 9]],
      things: [
        { id: 'pool', kind: 'pool', points: [[5, -4], [9, -4], [9, -1], [5, -1]] },
        { id: 'oak', kind: 'tree', at: [-4, 6], height: 8, canopy: 4 }
      ]
    },
    context: [{ id: 'next', name: 'Next door', points: [[10, 0], [16, 0], [16, 3], [10, 3]], height: 7 }]
  }
}

const glbOf = (plan: FloorPlan, floorId?: string): Glb => parseGlb(exportPlan(plan, 'glb', { ...ids, ...(floorId === undefined ? {} : { floorId }) }).data as Uint8Array)

type Node = NonNullable<Glb['json']['nodes']>[number]
const nodes = (glb: Glb): Node[] => glb.json.nodes as Node[]
const materialOfMesh = (glb: Glb, name: string): string => {
  const mesh = glb.json.meshes!.find((m) => (m as { name?: string }).name === name) as { primitives: { material: number }[] }
  return (glb.json.materials![mesh.primitives[0]!.material] as { name: string }).name
}

describe('CNT-60: the site in a GLB', () => {
  it('holds a site node under the building with the ground, the water, the tree and the neighbour', () => {
    const glb = glbOf(sitedPlan())
    const root = nodes(glb)[glb.json.scenes![0]!.nodes![0]!]!
    expect(root.name).toBe('building')
    const site = root.children!.map((i) => nodes(glb)[i]!).find((n) => n.name === 'site')
    expect(site).toBeDefined()
    const held = site!.children!.map((i) => nodes(glb)[i]!.name)
    expect(held).toEqual(['ground_site', 'neighbour_next', 'water_pool', 'trunk_oak', 'crown_oak'])
    expect(materialOfMesh(glb, 'ground_site')).toBe('ground')
    expect(materialOfMesh(glb, 'water_pool')).toBe('water')
    expect(materialOfMesh(glb, 'crown_oak')).toBe('planting')
    expect(materialOfMesh(glb, 'neighbour_next')).toBe('context')
  })

  it('lays the ground at the site\'s level and sinks the water below it', () => {
    const meshes = readMeshes(glbOf(sitedPlan()))
    const ys = (name: string): number[] => meshes.find((m) => m.name === name)!.points.map((p) => p.y)
    expect(ys('ground_site').every((y) => Math.abs(y + 0.2) < 1e-5)).toBe(true)
    expect(Math.max(...ys('water_pool'))).toBeCloseTo(-0.2 - limit('poolWaterBelowEdge'), 4)
    expect(Math.max(...ys('neighbour_next'))).toBeCloseTo(6.8, 4)
  })

  it('writes a party wall in the cut material and the others in the wall material', () => {
    const glb = glbOf(sitedPlan())
    const walls = glb.json.meshes!.map((m) => (m as { name: string }).name).filter((n) => n.startsWith('wall_'))
    const cut = walls.filter((n) => materialOfMesh(glb, n) === 'cut')
    expect(cut).toHaveLength(1)
    expect(walls.length).toBeGreaterThan(1)
  })

  it('writes no site node for a plan with no site, nor for one floor asked alone', () => {
    expect(nodes(glbOf(samplePlan())).some((n) => n.name === 'site')).toBe(false)
    expect(nodes(glbOf(sitedPlan(), 'ground')).some((n) => n.name === 'site')).toBe(false)
  })
})
