import { describe, expect, it } from 'vitest'
import type { Floor, FloorPlan, Room, Wall } from '@ongrid/floorplan/types/floorplan'
import { SLAB_THICKNESS, floorElevations, planBounds, planForFloor, type Scene3D } from '@ongrid/floorplan/geometry'
import { buildingFrame, buildingLayout, createSceneMemo, stillRoofShown, type StoreyLayout } from '../building'

/**
 * The whole building, decided without Three (design D2/D3): which storeys are
 * drawn and how, where each one stands, and how the camera frames them. R3F
 * doesn't render in jsdom, so these are the tests of what Canvas3D shows.
 */

const floor = (id: string, level: number, name = id): Floor => ({ id, name, level })

/** A closed box of four walls on `floorId`, `w` by `d` metres from the origin. */
function box(floorId: string, height: number, w = 6, d = 4): Wall[] {
  const corners: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [w, d],
    [0, d]
  ]
  return corners.map((start, i) => ({
    id: `${floorId}-w${i}`,
    start,
    end: corners[(i + 1) % 4]!,
    thickness: 0.2,
    height,
    kind: 'exterior',
    floor: floorId
  }))
}

function room(floorId: string): Room {
  return {
    id: `${floorId}-room`,
    name: `${floorId} room`,
    boundary: [0, 1, 2, 3].map((i) => `${floorId}-w${i}`),
    floor: floorId
  }
}

/** A plan with one boxed, roomed storey per entry: `[floor, wall height]`. */
function building(storeys: Array<[Floor, number]>, size?: [number, number]): FloorPlan {
  return {
    version: '1',
    units: 'm',
    floors: storeys.map(([f]) => f),
    walls: storeys.flatMap(([f, h]) => box(f.id, h, size?.[0], size?.[1])),
    rooms: storeys.map(([f]) => room(f.id)),
    openings: []
  }
}

const GROUND = floor('ground', 0, 'Ground floor')
const FIRST = floor('first', 1, 'First floor')
const SECOND = floor('second', 2, 'Second floor')
const BASEMENT = floor('basement', -1, 'Basement')

const threeStoreys = building([
  [GROUND, 3],
  [FIRST, 2.8],
  [SECOND, 2.8]
])

const looks = (storeys: readonly StoreyLayout[]): Record<string, string> =>
  Object.fromEntries(storeys.map((s) => [s.floorId, s.look]))

const bases = (storeys: readonly StoreyLayout[]): Record<string, number> =>
  Object.fromEntries(storeys.map((s) => [s.floorId, Math.round(s.base * 1000) / 1000]))

/** A seeded generator, so a failing invariant can be replayed. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('buildingLayout', () => {
  it('draws one floor as one solid storey at base 0, focused, with no roof', () => {
    const layout = buildingLayout(building([[GROUND, 3]]), null)
    expect(layout.single).toBe(true)
    expect(layout.focus).toBe('ground')
    expect(layout.storeys).toHaveLength(1)
    expect(layout.storeys[0]).toMatchObject({ floorId: 'ground', base: 0, look: 'solid' })
    expect(layout.roof).toBeNull()
  })

  it('keeps a lone basement or upper floor at base 0, as a one-storey plan always was', () => {
    for (const lone of [BASEMENT, FIRST]) {
      const layout = buildingLayout(building([[lone, 2.4]]), null)
      expect(layout.storeys[0]).toMatchObject({ floorId: lone.id, base: 0, look: 'solid' })
    }
  })

  it('treats an empty plan as one storey', () => {
    const empty: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    const layout = buildingLayout(empty, null)
    expect(layout.single).toBe(true)
    expect(layout.storeys).toHaveLength(1)
    expect(layout.storeys[0]!.base).toBe(0)
  })

  it('draws every storey solid at its floor level for the whole building', () => {
    const layout = buildingLayout(threeStoreys, null)
    const elevations = floorElevations(threeStoreys)

    expect(layout.single).toBe(false)
    expect(layout.focus).toBeNull()
    expect(looks(layout.storeys)).toEqual({ ground: 'solid', first: 'solid', second: 'solid' })
    for (const storey of layout.storeys) {
      expect(storey.base).toBe(elevations.floors.get(storey.floorId)!.floorLevel)
    }
    expect(bases(layout.storeys)).toEqual({ ground: 0, first: 3.25, second: 6.3 })
  })

  it('lists the storeys lowest first, with their names', () => {
    const layout = buildingLayout(building([[FIRST, 3], [BASEMENT, 2.5], [GROUND, 3]]), null)
    expect(layout.storeys.map((s) => s.floorId)).toEqual(['basement', 'ground', 'first'])
    expect(layout.storeys.map((s) => s.name)).toEqual(['Basement', 'Ground floor', 'First floor'])
  })

  it('puts a basement under the ground floor', () => {
    const layout = buildingLayout(building([[BASEMENT, 2.5], [GROUND, 3], [FIRST, 2.8]]), null)
    expect(bases(layout.storeys)).toEqual({ basement: -2.75, ground: 0, first: 3.25 })
  })

  it('cuts away at the focused storey: below muted, focused solid, above hidden', () => {
    const layout = buildingLayout(threeStoreys, 'first')
    expect(layout.focus).toBe('first')
    expect(looks(layout.storeys)).toEqual({ ground: 'muted', first: 'solid', second: 'hidden' })
  })

  it('mutes nothing when the lowest storey is focused', () => {
    const layout = buildingLayout(threeStoreys, 'ground')
    expect(looks(layout.storeys)).toEqual({ ground: 'solid', first: 'hidden', second: 'hidden' })
  })

  it('hides another floor that shares the focused storey’s level', () => {
    const mezzanine = floor('mezz', 0, 'Mezzanine')
    const plan = building([[GROUND, 3], [mezzanine, 3], [FIRST, 2.8]])
    expect(looks(buildingLayout(plan, 'ground').storeys)).toEqual({
      ground: 'solid',
      mezz: 'hidden',
      first: 'hidden'
    })
  })

  it('reads a focus the plan does not have as the whole building', () => {
    const layout = buildingLayout(threeStoreys, 'gone')
    expect(layout.focus).toBeNull()
    expect(looks(layout.storeys)).toEqual({ ground: 'solid', first: 'solid', second: 'solid' })
  })

  it('keeps a declared empty storey in the layout, so it can be focused', () => {
    const plan: FloorPlan = { ...threeStoreys, floors: [...threeStoreys.floors!, floor('third', 3)] }
    const layout = buildingLayout(plan, 'third')
    expect(layout.focus).toBe('third')
    expect(looks(layout.storeys)).toMatchObject({ ground: 'muted', second: 'muted', third: 'solid' })
  })

  it('raises the storeys above a taller ground floor and leaves their order alone', () => {
    const taller = building([[GROUND, 3.5], [FIRST, 2.8], [SECOND, 2.8]])
    const before = bases(buildingLayout(threeStoreys, null).storeys)
    const after = bases(buildingLayout(taller, null).storeys)
    expect(after.first! - before.first!).toBeCloseTo(0.5, 9)
    expect(after.second! - before.second!).toBeCloseTo(0.5, 9)
    expect(after.ground).toBe(0)
  })

  it('keeps bases non-decreasing in level order, for any stack', () => {
    const random = mulberry32(185)
    for (let run = 0; run < 300; run++) {
      const count = 2 + Math.floor(random() * 8)
      const used = new Set<number>()
      const storeys: Array<[Floor, number]> = []
      for (let i = 0; i < count; i++) {
        const level = Math.floor(random() * 9) - 3
        if (used.has(level)) continue
        used.add(level)
        // Some storeys are barely a wall high, to stress the order.
        storeys.push([floor(`f${level}`, level), random() < 0.2 ? 0.0001 : 2 + random() * 2])
      }
      const plan = building(storeys)
      const layout = buildingLayout(plan, null)
      for (let i = 1; i < layout.storeys.length; i++) {
        const lower = layout.storeys[i - 1]!
        const upper = layout.storeys[i]!
        expect(upper.level, `run ${run}`).toBeGreaterThanOrEqual(lower.level)
        expect(upper.base, `run ${run}`).toBeGreaterThanOrEqual(lower.base)
      }
    }
  })
})

describe('buildingLayout: the roof asked for (VEW-19)', () => {
  const gabled = building([[{ ...GROUND, roof: { shape: 'gable', eaves: 2.6, pitch: 30 } }, 3]])

  it('gives one storey a roof from base 0 when it is asked for', () => {
    const lone = building([[FIRST, 2.8]])
    const layout = buildingLayout(lone, null, floorElevations(lone), true)
    const { roof, floors } = floorElevations(lone)
    const level = floors.get('first')!.floorLevel
    expect(layout.roof).toEqual({ floorIds: ['first'], bottom: roof.bottom - level, top: roof.top - level })
    expect(layout.roof!.bottom).toBeCloseTo(layout.storeys[0]!.clearHeight, 9)
  })

  it('reaches the frame to the roof of one storey drawn with it', () => {
    const open = buildingFrame(gabled, floorElevations(gabled), null)
    const closed = buildingFrame(gabled, floorElevations(gabled), null, true)
    expect(closed.box.max[1]).toBeGreaterThan(open.box.max[1])
    expect(closed.target).toEqual(open.target)
  })

  it('gives a focused storey its roof when asked, and takes the whole building’s away when not', () => {
    expect(buildingLayout(threeStoreys, 'first', floorElevations(threeStoreys), true).roof).not.toBeNull()
    expect(buildingLayout(threeStoreys, null, floorElevations(threeStoreys), false).roof).toBeNull()
  })

  it('draws the roof in a still from outside, or when a floor states one, and never on a cutaway', () => {
    const plain = building([[GROUND, 3]])
    expect(stillRoofShown(plain, { focus: null, inside: false })).toBe(true)
    expect(stillRoofShown(plain, { focus: null, inside: true })).toBe(false)
    expect(stillRoofShown(gabled, { focus: null, inside: true })).toBe(true)
    expect(stillRoofShown(threeStoreys, { focus: null, inside: true })).toBe(true)
    expect(stillRoofShown(gabled, { focus: 'ground', inside: false })).toBe(false)
    expect(stillRoofShown(threeStoreys, { focus: 'first', inside: false })).toBe(false)
    // A floor the plan has not is no cutaway.
    expect(stillRoofShown(plain, { focus: 'attic', inside: false })).toBe(true)
  })
})

describe('buildingLayout: the roof', () => {
  it('covers the top storey’s floors in the whole-building view', () => {
    const layout = buildingLayout(threeStoreys, null)
    const { roof } = floorElevations(threeStoreys)
    expect(layout.roof).toEqual({ floorIds: ['second'], bottom: roof.bottom, top: roof.top })
    expect(layout.roof!.top - layout.roof!.bottom).toBeCloseTo(SLAB_THICKNESS, 9)
  })

  it('lies on the top storey’s walls', () => {
    const layout = buildingLayout(threeStoreys, null)
    const top = layout.storeys.find((s) => s.floorId === 'second')!
    expect(layout.roof!.bottom).toBeCloseTo(top.base + top.clearHeight, 9)
  })

  it('covers every floor that shares the top level', () => {
    const annex = floor('annex', 1, 'Annex')
    const layout = buildingLayout(building([[GROUND, 3], [FIRST, 2.8], [annex, 2.8]]), null)
    expect(layout.roof!.floorIds).toEqual(['first', 'annex'])
  })

  it('is hidden whenever a storey is focused, the top one included', () => {
    for (const focus of ['ground', 'first', 'second']) {
      expect(buildingLayout(threeStoreys, focus).roof).toBeNull()
    }
  })

  it('is never drawn for one storey', () => {
    expect(buildingLayout(building([[GROUND, 3]]), null).roof).toBeNull()
  })
})

describe('createSceneMemo: one scene per storey', () => {
  const ids = ['ground', 'first', 'second']

  /** Each storey's memo, as each Storey3D keeps its own. */
  function storeys() {
    const memos = new Map(ids.map((id) => [id, createSceneMemo()]))
    return (plan: FloorPlan): Map<string, Scene3D> =>
      new Map(ids.map((id) => [id, memos.get(id)!(planForFloor(plan, id))]))
  }

  /** The watcher parses the file again on every save: every object is new. */
  const reparsed = (plan: FloorPlan): FloorPlan => JSON.parse(JSON.stringify(plan)) as FloorPlan

  it('keeps the other storeys’ scenes when one floor changes', () => {
    const scenesOf = storeys()
    const before = scenesOf(threeStoreys)
    const moved: FloorPlan = {
      ...threeStoreys,
      walls: threeStoreys.walls.map((wall) => (wall.id === 'first-w1' ? { ...wall, thickness: 0.3 } : wall))
    }
    const after = scenesOf(reparsed(moved))

    expect(after.get('ground')).toBe(before.get('ground'))
    expect(after.get('second')).toBe(before.get('second'))
    expect(after.get('first')).not.toBe(before.get('first'))
  })

  it('keeps every scene when the file is saved again unchanged', () => {
    const scenesOf = storeys()
    const before = scenesOf(threeStoreys)
    const after = scenesOf(reparsed(threeStoreys))
    for (const id of ids) expect(after.get(id)).toBe(before.get(id))
  })

  it('raises the storeys above a taller ground floor without touching their walls', () => {
    const scenesOf = storeys()
    const before = scenesOf(threeStoreys)
    const taller = building([[GROUND, 3.5], [FIRST, 2.8], [SECOND, 2.8]])
    const after = scenesOf(taller)

    for (const id of ['first', 'second']) {
      expect(after.get(id)).toBe(before.get(id))
      expect(after.get(id)!.walls.map((w) => w.revision)).toEqual(before.get(id)!.walls.map((w) => w.revision))
    }
    expect(after.get('ground')).not.toBe(before.get('ground'))
    expect(bases(buildingLayout(taller, null).storeys).first).toBeCloseTo(3.75, 9)
  })
})

describe('buildingFrame', () => {
  /** Today's framing, before this change: Canvas3D's own formula. */
  function todaysFrame(plan: FloorPlan) {
    const { min, max, width, height } = planBounds(plan)
    const center: [number, number, number] = [(min.x + max.x) / 2, 0, -(min.y + max.y) / 2]
    const distance = Math.max(width, height, 1) * 1.4
    return {
      target: center,
      position: [center[0] + distance, distance * 0.8, center[2] + distance]
    }
  }

  const frameOf = (plan: FloorPlan, focus: string | null) =>
    buildingFrame(plan, floorElevations(plan), focus)

  it('frames one floor exactly as today, with the pivot at y = 0', () => {
    for (const plan of [building([[GROUND, 3]]), building([[GROUND, 2.7]], [12, 30]), building([[FIRST, 4]])]) {
      const today = todaysFrame(plan)
      for (const focus of [null, plan.floors![0]!.id]) {
        const frame = frameOf(plan, focus)
        expect(frame.target).toEqual(today.target)
        expect(frame.position).toEqual(today.position)
      }
    }
  })

  it('takes a ten-storey building’s height into its span, slab underside to roof top', () => {
    const tower = building(
      Array.from({ length: 10 }, (_, level) => [floor(`f${level}`, level), 3] as [Floor, number]),
      [10, 10]
    )
    const { roof } = floorElevations(tower)
    const frame = frameOf(tower, null)

    expect(frame.box.min[1]).toBeCloseTo(-SLAB_THICKNESS, 9)
    expect(frame.box.max[1]).toBeCloseTo(roof.top, 9)
    expect(frame.span).toBeCloseTo(roof.top + SLAB_THICKNESS, 9)
    expect(frame.span).toBeGreaterThan(10)
  })

  it('starts the box under the lowest basement’s slab', () => {
    const plan = building([[BASEMENT, 2.5], [GROUND, 3], [FIRST, 2.8]])
    expect(frameOf(plan, null).box.min[1]).toBeCloseTo(-2.75 - SLAB_THICKNESS, 9)
  })

  it('keeps the pivot on the footprint centre in x and z, whatever is focused', () => {
    const plan = building([[BASEMENT, 2.5], [GROUND, 3], [FIRST, 2.8]], [9, 5])
    const { min, max } = planBounds(plan)
    for (const focus of [null, 'basement', 'ground', 'first']) {
      const { target } = frameOf(plan, focus)
      expect(target[0]).toBeCloseTo((min.x + max.x) / 2, 9)
      expect(target[2]).toBeCloseTo(-(min.y + max.y) / 2, 9)
    }
  })

  it('pivots on the building’s middle when whole, and on the storey’s base when focused', () => {
    const frame = frameOf(threeStoreys, null)
    expect(frame.target[1]).toBeCloseTo((frame.box.min[1] + frame.box.max[1]) / 2, 9)

    const elevations = floorElevations(threeStoreys)
    for (const id of ['ground', 'first', 'second']) {
      expect(frameOf(threeStoreys, id).target[1]).toBe(elevations.floors.get(id)!.floorLevel)
    }
  })

  it('moves the camera by the same amount as the pivot, so the angle and distance hold', () => {
    const whole = frameOf(threeStoreys, null)
    const first = frameOf(threeStoreys, 'first')
    const dy = first.target[1] - whole.target[1]
    expect(first.position[0]).toBeCloseTo(whole.position[0], 9)
    expect(first.position[1] - whole.position[1]).toBeCloseTo(dy, 9)
    expect(first.position[2]).toBeCloseTo(whole.position[2], 9)
  })

  it('reads a focus the plan does not have as the whole building', () => {
    expect(frameOf(threeStoreys, 'gone')).toEqual(frameOf(threeStoreys, null))
  })

  it('sizes the shadow camera to cover the whole building box', () => {
    const plans = [
      building([[GROUND, 3]]),
      threeStoreys,
      building(
        Array.from({ length: 40 }, (_, level) => [floor(`f${level}`, level), 3] as [Floor, number]),
        [60, 25]
      )
    ]
    for (const plan of plans) {
      const { box, shadow } = frameOf(plan, null)
      const pos = shadow.position
      const forward = normalize(sub([0, 0, 0], pos))
      const right = normalize(cross(forward, [0, 1, 0]))
      const up = cross(right, forward)

      for (const x of [box.min[0], box.max[0]])
        for (const y of [box.min[1], box.max[1]])
          for (const z of [box.min[2], box.max[2]]) {
            const rel = sub([x, y, z], pos)
            expect(Math.abs(dot(rel, right))).toBeLessThanOrEqual(shadow.extent)
            expect(Math.abs(dot(rel, up))).toBeLessThanOrEqual(shadow.extent)
            expect(dot(rel, forward)).toBeGreaterThanOrEqual(shadow.near)
            expect(dot(rel, forward)).toBeLessThanOrEqual(shadow.far)
          }
    }
  })

  it('keeps today’s light and ±15 m shadow box for one ordinary floor', () => {
    const plan = building([[GROUND, 3]])
    const { min, max } = planBounds(plan)
    const { shadow } = frameOf(plan, null)
    expect(shadow.position).toEqual([(min.x + max.x) / 2 + 7, 18, -(min.y + max.y) / 2 + 9])
    expect(shadow.extent).toBe(15)
    expect([shadow.near, shadow.far]).toEqual([0.5, 500])
  })
})

type V = readonly [number, number, number]
const sub = (a: V, b: V): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const normalize = (a: V): [number, number, number] => {
  const l = Math.hypot(...a)
  return [a[0] / l, a[1] / l, a[2] / l]
}
