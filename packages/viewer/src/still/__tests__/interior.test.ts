/**
 * VEW-78: a still taken in a room shows the room's ceiling overhead, its floor and walls in their
 * finishes' tints, and a sky through its glass; a glazed door and a glazed wall are glass.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { cameraRecord, type CameraRecord } from '@ongrid/floorplan/geometry'
import { LIGHT_COLORS_3D, planStill, rasterise, stillScene, type RasterImage } from '..'
import { buildingLayout } from '../../canvas3d/building'
import { finishTint, SKY } from '../../canvas3d/finishTint'

const wall = (id: string, start: number[], end: number[], extra: Record<string, unknown> = {}) => ({ id, start, end, thickness: 0.2, height: 2.7, ...extra })

/** A living room 6 by 4 with a glazed sliding door to the south, finished, and a window to the east. */
const living = parseFloorPlan({
  types: { doors: [{ id: 'slider', name: 'Glazed slider', kind: 'sliding', glazed: true }], walls: [{ id: 'curtain', name: 'Curtain wall', glazed: true }] },
  walls: [wall('s', [0, 0], [6, 0]), wall('e', [6, 0], [6, 4]), wall('n', [6, 4], [0, 4], { wallType: 'curtain' }), wall('w', [0, 4], [0, 0])],
  rooms: [{ id: 'k', name: 'Living', boundary: ['s', 'e', 'n', 'w'], finishes: { floor: 'Oak boards', walls: 'Sage paint', faces: [{ wall: 'w', finish: 'Brick slips' }] } }],
  openings: [
    { id: 'patio', wall: 's', type: 'door', kind: 'sliding', offset: 1, width: 3.6, height: 2.2, doorType: 'slider' },
    { id: 'win', wall: 'e', type: 'window', offset: 1.4, width: 1.2, height: 1.2, sill: 0.9 }
  ]
})

/** Standing at (3, 3), the eye 1.6 m up, looking level south at the door. */
const looking: CameraRecord = cameraRecord(living, { target: { room: 'k', point: [3, 0.1, 1.6] }, bearing: 0, tilt: 0, distance: 2.9, focalLength: 18, cut: 'ground' })

function rgb(image: RasterImage, x: number, y: number): [number, number, number] {
  const i = (y * image.width + x) * 4
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!]
}
const hex = (c: readonly number[]): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`

describe('a still taken in a room', () => {
  const image = planStill(living, { camera: looking, width: 300, height: 200 })

  it('stands in the room', () => {
    expect(looking.standingIn.room).toBe('k')
  })

  it('has the ceiling overhead, not the background', () => {
    const top = rgb(image, 150, 2)
    expect(hex(top)).not.toBe(LIGHT_COLORS_3D.background)
    // Taken as if from outside, the same camera sees nothing over the walls' tops.
    const open = planStill(living, { camera: looking, width: 300, height: 200, inside: false })
    expect(hex(rgb(open, 150, 2))).toBe(LIGHT_COLORS_3D.background)
  })

  it('has its oak floor warm, and the sky through the glazed door', () => {
    const [r, , b] = rgb(image, 150, 197)
    expect(r - b).toBeGreaterThan(40)
    // Through the door's glass, above the horizon: the sky is bluer than it is red.
    const [sr, , sb] = rgb(image, 120, 90)
    expect(sb).toBeGreaterThan(sr)
  })

  it('draws the glazed door\'s leaves and the curtain wall as glass', () => {
    const still = stillScene(living, { colors: LIGHT_COLORS_3D, width: 300, height: 200, camera: looking, inside: true })
    try {
      const glass: THREE.Mesh[] = []
      const names: string[] = []
      still.scene.traverseVisible((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        names.push(mesh.name)
        if (mesh.name === 'glass') glass.push(mesh)
      })
      // Two sliding leaves, the window's pane and the curtain wall.
      expect(glass.length).toBe(4)
      expect(glass.every((m) => (m.material as THREE.Material).transparent)).toBe(true)
      expect(names.filter((n) => n === 'ceiling')).toHaveLength(1)
      expect(names.filter((n) => n === 'floor finish')).toHaveLength(1)
      // Sage paint on two faces, brick slips on the west; the curtain wall is glass, not painted.
      expect(names.filter((n) => n === 'lining')).toHaveLength(3)
    } finally {
      still.close()
    }
  })

  it('keeps the floor it stands on whole, not cut as a cutaway is', () => {
    expect(buildingLayout(living, 'ground').storeys[0]!.cut).not.toBeNull()
    expect(buildingLayout(living, 'ground', undefined, undefined, true).storeys[0]!.cut).toBeNull()
  })
})

describe('the sky (rasterise)', () => {
  it('fills the picture by the way each sample looks: the zenith overhead, the ground below', () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100)
    camera.lookAt(0, 0, -1)
    const image = rasterise(new THREE.Scene(), camera, { width: 20, height: 20, supersample: 1, sky: SKY })
    const top = rgb(image, 10, 0)
    const bottom = rgb(image, 10, 19)
    expect(top[2]).toBeGreaterThan(top[0])
    expect(hex(bottom)).not.toBe(hex(top))
    expect(Math.abs(bottom[0] - parseInt(SKY.ground.slice(1, 3), 16))).toBeLessThan(30)
  })
})

describe('finishTint', () => {
  it('reads a colour word first, then a material word, and nothing from a name with neither', () => {
    expect(finishTint('Grey porcelain tile')).toBe(finishTint('Grey'))
    expect(finishTint('Oak boards')).toBe(finishTint('oak'))
    expect(finishTint('Porcelain tile')).toBe(finishTint('Tiled'))
    expect(finishTint('Oak boards')).not.toBe(finishTint('Porcelain tile'))
    expect(finishTint('Finish A')).toBeNull()
    expect(finishTint(null)).toBeNull()
  })
})
