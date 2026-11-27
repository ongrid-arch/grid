/**
 * CNT-60: the 3D view and every still draw the site from the core's blocks: the neighbours, the
 * fences, the trees and the pools' water on the ground, and a party wall in the cut colour.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { LIGHT_COLORS_3D, stillScene } from '..'
import { buildingGround, buildingLayout } from '../../canvas3d/building'
import { CUT_WALL_COLOR, SITE_LOOK, siteGeometries } from '../../canvas3d/Site3D'

const flat = JSON.parse(readFileSync(resolve(__dirname, '../../../../cli/fixtures/two-bed-flat.json'), 'utf8')) as FloorPlan

function sited(): FloorPlan {
  return {
    ...flat,
    walls: flat.walls.map((wall) => (wall.id === 'west' ? { ...wall, kind: 'separating' as const, beyond: 'neighbour' as const } : wall)),
    site: {
      ground: -0.15,
      boundary: [[-8, -6], [18, -6], [18, 14], [-8, 14]],
      things: [
        { id: 'pool', kind: 'pool', points: [[12, -4], [16, -4], [16, -1], [12, -1]] },
        { id: 'oak', kind: 'tree', at: [14, 10], height: 8, canopy: 5 },
        { id: 'fence', kind: 'fence', points: [[-8, -6], [18, -6]], height: 1.5 }
      ]
    },
    context: [{ id: 'next-door', points: [[-8, 0], [-0.2, 0], [-0.2, 7.5], [-8, 7.5]], height: 6 }]
  } as FloorPlan
}

const colourOf = (mesh: THREE.Mesh): string => `#${((mesh.material as THREE.MeshStandardMaterial).color as THREE.Color).getHexString()}`

describe('CNT-60: the site in 3D', () => {
  it('gives the ground the site\'s blocks, standing on it', () => {
    const plan = sited()
    const ground = buildingGround(plan, buildingLayout(plan, null))
    expect(ground.y).toBeCloseTo(-0.15)
    const kinds = ground.site.map((b) => `${b.kind}:${b.id}`)
    expect(kinds).toEqual(['neighbour:next-door', 'water:pool', 'trunk:oak', 'crown:oak', 'fence:fence'])
    const fence = ground.site.find((b) => b.kind === 'fence')!
    expect(fence.bottom).toBeCloseTo(-0.15)
    expect(fence.top).toBeCloseTo(1.35)
    expect(buildingGround(flat, buildingLayout(flat, null)).site).toEqual([])
  })

  it('makes one geometry per block, each in its kind\'s look, the water seen through', () => {
    const plan = sited()
    const parts = siteGeometries(buildingGround(plan, buildingLayout(plan, null)).site)
    expect(parts).toHaveLength(5)
    for (const part of parts) {
      part.geometry.computeBoundingBox()
      const box = part.geometry.boundingBox!
      expect(box.min.y).toBeCloseTo(part.block.bottom, 5)
      expect(box.max.y).toBeCloseTo(part.block.top, 5)
      part.geometry.dispose()
    }
    expect(SITE_LOOK.water.opacity).toBeLessThan(1)
  })

  it('draws the site and the party wall in a still', () => {
    const still = stillScene(sited(), { colors: LIGHT_COLORS_3D, width: 300, height: 200 })
    try {
      const site = still.scene.getObjectByName('site')
      expect(site).toBeDefined()
      const meshes = site!.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true)
      expect(meshes.map((m) => m.name)).toEqual(['neighbour:next-door', 'water:pool', 'trunk:oak', 'crown:oak', 'fence:fence'])
      const water = meshes.find((m) => m.name === 'water:pool')!
      expect((water.material as THREE.Material).transparent).toBe(true)
      const cut: THREE.Mesh[] = []
      still.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh === true && (o as THREE.Mesh).material instanceof THREE.MeshStandardMaterial && colourOf(o as THREE.Mesh) === CUT_WALL_COLOR) cut.push(o as THREE.Mesh)
      })
      expect(cut).toHaveLength(1)
    } finally {
      still.close()
    }
  })

  it('draws no site in a still of a plan with none', () => {
    const still = stillScene(flat, { colors: LIGHT_COLORS_3D, width: 300, height: 200 })
    try {
      expect(still.scene.getObjectByName('site')).toBeUndefined()
    } finally {
      still.close()
    }
  })
})
