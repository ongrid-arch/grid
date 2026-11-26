import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { buildScene, sceneShell } from '@ongrid/floorplan/geometry'
import { toGlb } from '@ongrid/floorplan/geometry/export/gltf'
import * as Three from 'three'
import { DARK_COLORS_3D, LIGHT_COLORS_3D, planStill, stillScene, type RasterImage } from '..'
import { GROUND_FILL } from '../../canvas3d/Ground3D'

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
      // VEW-66: and the ground round it.
      expect(meshes.length).toBe(model.walls.length + model.slabs.length + model.shell!.slab.length + parts + 1)
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

  // VEW-58: a floor cut away has its walls lowered, whatever the number of storeys.
  it('cuts the walls of a one-storey building shown as a cutaway', () => {
    const whole = planStill(flat, { width: 300, height: 200 })
    const cut = planStill(flat, { width: 300, height: 200, focus: 'ground' })
    expect(Buffer.from(whole.data).equals(Buffer.from(cut.data))).toBe(false)
    const walls = (focus?: string): number => {
      const still = stillScene(flat, { colors: LIGHT_COLORS_3D, width: 300, height: 200, ...(focus ? { focus } : {}) })
      try {
        let top = -Infinity
        still.scene.traverseVisible((object) => {
          const mesh = object as THREE.Mesh
          if (!mesh.isMesh || mesh.geometry.getAttribute('position') === undefined) return
          mesh.geometry.computeBoundingBox()
          if (mesh.parent?.name.startsWith('shell:') !== true) top = Math.max(top, mesh.geometry.boundingBox!.max.y)
        })
        return top
      } finally {
        still.close()
      }
    }
    expect(walls()).toBeGreaterThan(2)
    expect(walls('ground')).toBeLessThanOrEqual(1.2 + 1e-6)
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
      const open = planStill(gabled, { width: 300, height: 200, focus: 'ground', roof: false })
      expect(Buffer.from(cut.data).equals(Buffer.from(open.data))).toBe(true)
      expect(Buffer.from(asked.data).equals(Buffer.from(open.data))).toBe(false)
    })
  })

  describe('a house over two basements (VEW-66)', () => {
    /** A closed box 6 by 4 of walls `height` high on `floor`, with its room. */
    const storey = (floor: string, height: number) => {
      const corners: [number, number][] = [
        [0, 0],
        [6, 0],
        [6, 4],
        [0, 4]
      ]
      const walls = corners.map((start, i) => ({ id: `${floor}-w${i}`, start, end: corners[(i + 1) % 4]!, thickness: 0.2, height, kind: 'exterior' as const, floor }))
      return { walls, room: { id: `${floor}-room`, name: floor, boundary: walls.map((w) => w.id), floor } }
    }
    const dig = (ground: number): FloorPlan => {
      const parts = [storey('b2', 3), storey('b1', 3), storey('g', 3)]
      return {
        version: '1',
        units: 'm',
        floors: [
          { id: 'b2', name: 'Lower basement', level: -2 },
          { id: 'b1', name: 'Basement', level: -1 },
          { id: 'g', name: 'Ground floor', level: 0 }
        ],
        site: { ground },
        walls: parts.flatMap((p) => p.walls),
        rooms: parts.map((p) => p.room),
        openings: []
      } as FloorPlan
    }

    it('lays the ground at the ground, cut away over the building', () => {
      const still = stillScene(dig(0), { colors: LIGHT_COLORS_3D, width: 300, height: 200 })
      try {
        expect(still.ground.y).toBe(0)
        const sheets: Three.Mesh[] = []
        still.scene.traverseVisible((object) => {
          const mesh = object as Three.Mesh
          if (mesh.isMesh && (mesh.material as Three.Material).transparent && (mesh.material as Three.Material).opacity === GROUND_FILL.opacity) sheets.push(mesh)
        })
        expect(sheets).toHaveLength(1)
        const box = new Three.Box3().setFromObject(sheets[0]!)
        expect(box.min.y).toBeCloseTo(GROUND_FILL.y, 6)
        expect(box.max.y).toBeCloseTo(GROUND_FILL.y, 6)
        // Round the building, past its walls: a hole is cut over it, so it is more than one square of triangles.
        expect(box.max.x - box.min.x).toBeGreaterThan(6 + 2 * 39)
        expect(sheets[0]!.geometry.getIndex()?.count ?? sheets[0]!.geometry.getAttribute('position').count).toBeGreaterThan(6)
      } finally {
        still.close()
      }
    })

    it('shows the basements under the ground faded toward the background', () => {
      const still = stillScene(dig(0), { colors: LIGHT_COLORS_3D, width: 300, height: 200 })
      // The middle of an outside face of the upper basement that the camera faces, on screen.
      const eye = still.camera.position.clone()
      const faces = [
        { point: new Three.Vector3(3, -1.6, 0.1), normal: new Three.Vector3(0, 0, 1) },
        { point: new Three.Vector3(3, -1.6, -4.1), normal: new Three.Vector3(0, 0, -1) },
        { point: new Three.Vector3(6.1, -1.6, -2), normal: new Three.Vector3(1, 0, 0) },
        { point: new Three.Vector3(-0.1, -1.6, -2), normal: new Three.Vector3(-1, 0, 0) }
      ]
      const face = faces.find((f) => eye.clone().sub(f.point).dot(f.normal) > 0)!
      const at = face.point.clone().project(still.camera)
      still.close()
      const x = Math.round(((at.x + 1) / 2) * 300)
      const y = Math.round(((1 - at.y) / 2) * 200)
      const distance = (image: RasterImage): number => {
        const pixel = hex(image, x, y)
        const channel = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
        return [0, 1, 2].reduce((sum, i) => sum + Math.abs(channel(pixel, i) - channel(LIGHT_COLORS_3D.background, i)), 0)
      }
      // The same building with the ground stated under all of it: nothing is buried.
      const buried = distance(planStill(dig(0), { width: 300, height: 200 }))
      const open = distance(planStill(dig(-20), { width: 300, height: 200 }))
      expect(open).toBeGreaterThan(0)
      expect(buried).toBeLessThan(open * (1 - GROUND_FILL.opacity) + 6)
    })

    it('leaves the background round the building the background', () => {
      const image = planStill(dig(0), { width: 300, height: 200 })
      expect(hex(image, 0, 0)).toBe(LIGHT_COLORS_3D.background)
      expect(hex(image, 299, 0)).toBe(LIGHT_COLORS_3D.background)
    })
  })

  it('refuses a size it cannot draw', () => {
    expect(() => planStill(flat, { width: 0 })).toThrow(/width is a whole number of pixels/)
    expect(() => planStill(flat, { height: 1.5 })).toThrow(/height is a whole number of pixels/)
    expect(() => planStill(flat, { width: 8000, height: 8000 })).toThrow(/larger than/)
  })
})
