import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { buildScene, sceneShell } from '@ongrid/floorplan/geometry'
import { toGlb } from '@ongrid/floorplan/geometry/export/gltf'
import { DARK_COLORS_3D, LIGHT_COLORS_3D, planStill, stillScene, type RasterImage } from '..'

const flat = JSON.parse(readFileSync(resolve(__dirname, '../../../../cli/fixtures/two-bed-flat.json'), 'utf8')) as FloorPlan

/** The same flat with a storey on top. */
function twoStoreys(plan: FloorPlan): FloorPlan {
  const up = <T extends { id: string }>(x: T): T => ({ ...x, id: `${x.id}-1`, floor: 'first' })
  return {
    ...plan,
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls: [...plan.walls, ...plan.walls.map(up)],
    rooms: [...plan.rooms, ...plan.rooms.map((r) => ({ ...up(r), boundary: r.boundary.map((b) => `${b}-1`) }))],
    openings: [...plan.openings, ...plan.openings.map((o) => ({ ...o, id: `${o.id}-1`, wall: `${o.wall}-1` }))]
  } as FloorPlan
}

function hex(image: RasterImage, x: number, y: number): string {
  const i = (y * image.width + x) * 4
  return `#${[...image.data.subarray(i, i + 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** How many pixels are not the background. */
function drawn(image: RasterImage, background: string): number {
  let count = 0
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (hex(image, x, y) !== background) count++
  return count
}

describe('planStill', () => {
  it('draws the two-bed flat at 1200 by 800, on the 3D background, the building in the middle', () => {
    const image = planStill(flat)
    expect([image.width, image.height, image.data.length]).toEqual([1200, 800, 1200 * 800 * 4])
    expect(hex(image, 0, 0)).toBe(LIGHT_COLORS_3D.background)
    expect(hex(image, 600, 400)).not.toBe(LIGHT_COLORS_3D.background)
  })

  it('draws the same pixels every time', () => {
    const one = planStill(flat, { width: 300, height: 200 })
    const two = planStill(flat, { width: 300, height: 200 })
    expect(Buffer.from(one.data).equals(Buffer.from(two.data))).toBe(true)
  })

  it('draws the dark theme on its own background', () => {
    const image = planStill(flat, { look: 'dark', width: 300, height: 200 })
    expect(hex(image, 0, 0)).toBe(DARK_COLORS_3D.background)
  })

  it('takes every wall, slab and door and window part from the scene the app builds', () => {
    const still = stillScene(flat, { colors: LIGHT_COLORS_3D, width: 300, height: 200 })
    try {
      const meshes: THREE.Mesh[] = []
      still.scene.traverseVisible((object) => {
        if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh)
      })
      const model = buildScene(flat)
      // LVL-4: and the slab the floor stands on, from its outline. One floor alone has no roof drawn.
      expect(model.shell!.slab).toHaveLength(1)
      // CNT-14: and every box of each door's and window's frame, leaves and glass.
      const parts = model.openings.reduce((sum, opening) => sum + opening.parts.length, 0)
      expect(parts).toBeGreaterThan(0)
      expect(meshes.length).toBe(model.walls.length + model.slabs.length + model.shell!.slab.length + parts)
      // Its lights are the app's, read from the scene rather than written down twice.
      const lights = still.scene.children.filter((object) => (object as THREE.Light).isLight)
      expect(lights.map((light) => light.type).sort()).toEqual(['DirectionalLight', 'HemisphereLight'])
    } finally {
      still.close()
    }
  })

  it('shows a floor as a cutaway, as the app does when a floor is chosen', () => {
    const plan = twoStoreys(flat)
    const whole = planStill(plan, { width: 300, height: 200 })
    const ground = planStill(plan, { width: 300, height: 200, focus: 'ground' })
    expect(Buffer.from(whole.data).equals(Buffer.from(ground.data))).toBe(false)
    // Without the storey above, less of the picture is building.
    expect(drawn(ground, LIGHT_COLORS_3D.background)).toBeLessThan(drawn(whole, LIGHT_COLORS_3D.background))
  })

  // VEW-19: a one-storey plan with its roof stated is drawn with it, as its GLB is.
  describe('the roof', () => {
    const gabled = { ...flat, floors: [{ id: 'ground', name: 'Ground floor', level: 0, roof: { shape: 'gable', eaves: 2.6, pitch: 30 } }] } as FloorPlan
    const roofMeshes = (plan: FloorPlan, roof?: boolean): number => {
      const still = stillScene(plan, { colors: LIGHT_COLORS_3D, width: 300, height: 200, ...(roof === undefined ? {} : { roof }) })
      try {
        let count = 0
        still.scene.traverseVisible((object) => {
          if ((object as THREE.Mesh).isMesh && object.parent?.name.startsWith('shell:') === true) count++
        })
        return count - sceneShell(plan)!.slab.length
      } finally {
        still.close()
      }
    }

    it('draws a stated gable over one storey from the opening camera, and leaves it off when asked', () => {
      expect(sceneShell(gabled)!.roof!.pieces.length).toBeGreaterThan(1)
      expect(roofMeshes(gabled, true)).toBe(sceneShell(gabled)!.roof!.pieces.length)
      expect(roofMeshes(gabled, false)).toBe(0)
      const closed = planStill(gabled, { width: 300, height: 200 })
      const open = planStill(gabled, { width: 300, height: 200, roof: false })
      expect(Buffer.from(closed.data).equals(Buffer.from(open.data))).toBe(false)
    })

    it('draws the roof the GLB of the same plan has', () => {
      const glb = Buffer.from(toGlb(buildScene(gabled)))
      expect(glb.toString('latin1')).toContain('roof')
      expect(roofMeshes(gabled, true)).toBeGreaterThan(0)
    })

    it('leaves a cutaway open unless the roof is asked for', () => {
      const cut = planStill(gabled, { width: 300, height: 200, focus: 'ground' })
      const asked = planStill(gabled, { width: 300, height: 200, focus: 'ground', roof: true })
      const open = planStill(gabled, { width: 300, height: 200, roof: false })
      expect(Buffer.from(cut.data).equals(Buffer.from(open.data))).toBe(true)
      expect(Buffer.from(asked.data).equals(Buffer.from(open.data))).toBe(false)
    })
  })

  it('refuses a size it cannot draw', () => {
    expect(() => planStill(flat, { width: 0 })).toThrow(/width is a whole number of pixels/)
    expect(() => planStill(flat, { height: 1.5 })).toThrow(/height is a whole number of pixels/)
    expect(() => planStill(flat, { width: 8000, height: 8000 })).toThrow(/larger than/)
  })
})
