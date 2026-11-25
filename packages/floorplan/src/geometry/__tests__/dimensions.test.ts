import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import type { PlanDrawing, PlanRoom } from '../floorplan'
import { buildFloorPlan } from '../floorplan'
import { planFloors, planForFloor } from '../floors'
import { parseFloorPlan } from '../../types/floorplan'
import { signedDistanceToOutline } from '../innerPoint'
import type { Dimension, DimensionSide } from '../dimensions'
import type { Vec2 } from '../vec2'
import {
  boundsWithDimensions,
  buildDimensions,
  dimensionAxes,
  openingDimensions,
  outsideDimensions,
  overallDimensions,
  planAxes,
  roomDimensions
} from '../dimensions'

const plan: FloorPlan = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/floor-plan.json'), 'utf8')
)
const drawing = buildFloorPlan(plan)

const DATA = resolve(__dirname, '../../../../../scoreboard/data')
let lab: { name: string; text: string }[] | null = null
function labPlans(): { name: string; text: string }[] {
  lab ??= gunzipSync(readFileSync(resolve(DATA, 'lab-plans.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { name: string; text: string })
  return lab
}
function labPlan(name: string): FloorPlan {
  const line = labPlans().find((p) => p.name === name)
  if (line === undefined) throw new Error(`no lab plan named ${name}`)
  return parseFloorPlan(JSON.parse(line.text))
}
/**
 * A third of the lab's plans, the size tests of thousands of walls left out: every drawing is
 * built, which is what takes the time.
 */
function labSample(): { name: string; text: string }[] {
  return labPlans().filter((p, i) => i % 3 === 0 && p.text.length < 40_000)
}
const floorDrawing = (p: FloorPlan, floor: string): PlanDrawing => buildFloorPlan(planForFloor(p, floor))
const byId = (dims: readonly Dimension[], id: string): Dimension => {
  const dim = dims.find((d) => d.id === id)
  if (!dim) throw new Error(`no dimension ${id} in ${dims.map((d) => d.id).join(', ')}`)
  return dim
}

/** 1 mm: the chains must add up to the overall size to within it (SHT-4). */
const MM = 0.001

/** Each side's chains, by kind, in the order they are drawn. */
function chainsOf(dims: readonly Dimension[]): Map<DimensionSide, Map<string, Dimension[]>> {
  const out = new Map<DimensionSide, Map<string, Dimension[]>>()
  for (const dim of dims) {
    if (!dim.side) continue
    const side = out.get(dim.side) ?? new Map<string, Dimension[]>()
    side.set(dim.kind, [...(side.get(dim.kind) ?? []), dim])
    out.set(dim.side, side)
  }
  return out
}

/**
 * Every chain adds up to its side's overall size, and joins up end to end. VEW-22: a line of
 * chains along a facade or wing of its own (`chain`) adds up to its own overall size.
 */
function expectChainsAddUp(dims: readonly Dimension[], name: string): number {
  let checked = 0
  const lines = new Map<string, Dimension[]>()
  for (const dim of dims) if (dim.chain !== undefined) lines.set(dim.chain, [...(lines.get(dim.chain) ?? []), dim])
  for (const [line, own] of lines) {
    const total = own.find((d) => d.kind === 'overall')
    expect(total, `${name}: overall for ${line}`).toBeDefined()
    for (const kind of ['opening', 'wall'] as const) {
      const chain = own.filter((d) => d.kind === kind)
      if (chain.length === 0) continue
      const sum = chain.reduce((s, d) => s + d.value, 0)
      expect(Math.abs(sum - total!.value), `${name}: ${line} ${kind} chain adds up`).toBeLessThanOrEqual(MM)
      checked++
    }
  }
  const overall = new Map<'across' | 'up', number>()
  const main = dims.filter((dim) => dim.chain === undefined)
  for (const dim of main) if (dim.kind === 'overall') overall.set(dim.side === 'bottom' || dim.side === 'top' ? 'across' : 'up', dim.value)
  for (const [side, chains] of chainsOf(main)) {
    const total = overall.get(side === 'bottom' || side === 'top' ? 'across' : 'up')
    expect(total, `${name}: overall for ${side}`).toBeDefined()
    for (const [kind, chain] of chains) {
      const sum = chain.reduce((s, d) => s + d.value, 0)
      expect(Math.abs(sum - total!), `${name}: ${side} ${kind} chain adds up`).toBeLessThanOrEqual(MM)
      for (let i = 1; i < chain.length; i++) {
        const gap = Math.hypot(chain[i]!.from.x - chain[i - 1]!.to.x, chain[i]!.from.y - chain[i - 1]!.to.y)
        expect(gap, `${name}: ${side} ${kind} chain joins up`).toBeLessThanOrEqual(MM)
      }
      checked++
    }
  }
  return checked
}

/** Whether the dimension line stays on the room's floor: the test's own reading of "inside". */
function lineInRoom(dim: Dimension, room: PlanRoom): boolean {
  const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const p = { x: dim.from.x + (dim.to.x - dim.from.x) * t + shift.x, y: dim.from.y + (dim.to.y - dim.from.y) * t + shift.y }
    if (signedDistanceToOutline(p, room.polygon, room.holes) < -0.011) return false
  }
  return true
}

describe('overall dimensions', () => {
  const dims = overallDimensions(drawing)

  it('measures the full width and height of the plan, to the outer faces of its walls', () => {
    const values = dims.map((d) => d.value).sort((a, b) => a - b)
    // The envelope includes half a wall on each side: 8 + 0.25 and 5 + 0.25.
    expect(values[0]).toBeCloseTo(5.25)
    expect(values[1]).toBeCloseTo(8.25)
    for (const dim of dims) expect(dim.measuredTo).toEqual(['face', 'face'])
  })

  it('places them outside the envelope, not on top of it', () => {
    for (const dim of dims) {
      const outsideBelow = dim.labelAt.y < drawing.bounds.min.y
      const outsideLeft = dim.labelAt.x < drawing.bounds.min.x
      expect(outsideBelow || outsideLeft).toBe(true)
    }
  })
})

describe('chains outside the plan (SHT-4)', () => {
  const dims = outsideDimensions(drawing)

  it('gives the openings nearest, then the walls, then the overall size, on each side', () => {
    const bottom = chainsOf(dims).get('bottom')!
    expect([...bottom.keys()]).toEqual(['opening', 'wall', 'overall'])
    const offsets = [...bottom.values()].map((chain) => chain[0]!.offset)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    // The door o1 is 0.9 m wide, 1.05 m along w1 from its axis end: 1.05 + 0.125 to the corner.
    expect(bottom.get('opening')!.map((d) => Number(d.value.toFixed(3)))).toEqual([1.175, 0.9, 6.175])
    // The walls: the corner, the room, the partition, the room, the corner.
    expect(bottom.get('wall')!.map((d) => Number(d.value.toFixed(3)))).toEqual([0.25, 4.8, 0.15, 2.8, 0.25])
  })

  it('adds up: the openings and the walls each sum to the overall size within 1 mm', () => {
    expect(expectChainsAddUp(dims, 'fixture')).toBeGreaterThanOrEqual(4)
  })

  it('adds up on every floor of a third of the lab plans', () => {
    let chains = 0
    for (const { name, text } of labSample()) {
      let p: FloorPlan
      try {
        p = parseFloorPlan(JSON.parse(text))
      } catch {
        continue
      }
      for (const floor of planFloors(p)) chains += expectChainsAddUp(outsideDimensions(floorDrawing(p, floor.id)), `${name} ${floor.id}`)
    }
    expect(chains).toBeGreaterThan(300)
  }, 120_000)

  it('dimensions a house turned 15 degrees along its walls (DR-2): 9 × 10, not 11.20 × 11.91', () => {
    const turned = buildFloorPlan(labPlan('G/scenarios/s09a-house-turned-15.json'))
    const { u } = planAxes(turned.walls)
    expect((Math.atan2(u.y, u.x) * 180) / Math.PI).toBeCloseTo(15, 1)
    const outside = outsideDimensions(turned)
    expect(byId(outside, 'overall-width').value).toBeCloseTo(9, 3)
    expect(byId(outside, 'overall-height').value).toBeCloseTo(10, 3)
    expectChainsAddUp(outside, 'turned house')
  })

  it('gives a plan with no walls none', () => {
    expect(outsideDimensions({ ...drawing, walls: [], openings: [] })).toEqual([])
  })
})

/** VEW-22: a one-floor plan from its outside corners, with walls round each room and the walls between given. */
type Pt = readonly [number, number]
function plainPlan(rooms: readonly { id: string; corners: readonly Pt[] }[], inner: readonly { id: string; start: Pt; end: Pt; thickness: number; rooms: readonly string[] }[] = []): PlanDrawing {
  const walls: Record<string, unknown>[] = []
  const boundary = new Map<string, string[]>()
  for (const room of rooms) {
    const ids: string[] = []
    room.corners.forEach((p, i) => {
      const id = `${room.id}-${i}`
      walls.push({ id, start: p, end: room.corners[(i + 1) % room.corners.length], thickness: 0.3, height: 2.6, kind: 'exterior' })
      ids.push(id)
    })
    boundary.set(room.id, ids)
  }
  for (const wall of inner) {
    walls.push({ id: wall.id, start: wall.start, end: wall.end, thickness: wall.thickness, height: 2.6, kind: 'interior' })
    for (const room of wall.rooms) boundary.get(room)?.push(wall.id)
  }
  return buildFloorPlan(parseFloorPlan({ version: '1', units: 'm', walls, rooms: rooms.map((room) => ({ id: room.id, name: room.id, boundary: boundary.get(room.id) })), openings: [] }))
}
const way = (dim: Dimension): Vec2 => dimensionAxes(dim).along
/** Whether the dimension runs along the direction, either way. */
const runsAlong = (dim: Dimension, dir: Vec2): boolean => Math.abs(way(dim).x * dir.y - way(dim).y * dir.x) < 1e-6

describe('angled plans and wings (VEW-22)', () => {
  const c = Math.cos(Math.PI / 6)
  const s = -Math.sin(Math.PI / 6)
  const turned = (x: number, y: number): Pt => [10 + x * c - y * s, y * c + x * s]
  const wings = plainPlan([
    { id: 'hall', corners: [[0, 0], [10, 0], [10, 8], [0, 8]] },
    { id: 'workshop', corners: [turned(0, 0), turned(12, 0), turned(12, 7), turned(0, 7)] }
  ])

  it('dimensions each of two wings at 30 degrees square to itself', () => {
    const dims = outsideDimensions(wings)
    const across = { x: 1, y: 0 }
    const wing = { x: c, y: s }
    // The hall's own width, along the page, and the workshop's own length, along its walls.
    expect(dims.some((d) => d.kind === 'overall' && runsAlong(d, across) && Math.abs(d.value - 10.3) < 1e-6)).toBe(true)
    expect(dims.some((d) => d.kind === 'overall' && runsAlong(d, wing) && Math.abs(d.value - 12.3) < 1e-6)).toBe(true)
    // No size of the two wings together along either one's walls: before, 25.02 ran across both.
    for (const dim of dims) expect(dim.value, dim.id).toBeLessThan(12.31)
    // Every outside dimension runs along one wing's walls or square to them.
    for (const dim of dims) expect(runsAlong(dim, across) || runsAlong(dim, { x: 0, y: 1 }) || runsAlong(dim, wing) || runsAlong(dim, { x: -s, y: c }), dim.id).toBe(true)
    expect(expectChainsAddUp(dims, 'wings')).toBeGreaterThanOrEqual(0)
  })

  it('dimensions a chamfered corner along itself, and the rest along the plan', () => {
    const chamfered = plainPlan([{ id: 'room', corners: [[0, 0], [10, 0], [10, 6], [8, 8], [0, 8]] }])
    const dims = outsideDimensions(chamfered)
    expect(byId(dims, 'overall-width').value).toBeCloseTo(10.3, 3)
    expect(runsAlong(byId(dims, 'overall-width'), { x: 1, y: 0 })).toBe(true)
    const diagonal = dims.filter((d) => d.chain !== undefined)
    expect(diagonal.length).toBeGreaterThan(0)
    for (const dim of diagonal) expect(runsAlong(dim, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }), dim.id).toBe(true)
    // Its outer face, from mitre to mitre.
    expect(diagonal.find((d) => d.kind === 'overall')!.value).toBeGreaterThan(2 * Math.SQRT2)
  })

  it('measures a fan along the page, its overall size from its outline, not along a diagonal', () => {
    const at = (r: number, deg: number): Pt => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)]
    const fan = plainPlan([{ id: 'fan', corners: [at(3, 45), at(14, 45), at(14, 63), at(14, 81), at(14, 99), at(14, 117), at(14, 135), at(3, 135), at(3, 90)] }])
    const dims = outsideDimensions(fan)
    const width = byId(dims, 'overall-width')
    expect(runsAlong(width, { x: 1, y: 0 })).toBe(true)
    expect(width.value).toBeCloseTo(fan.bounds.max.x - fan.bounds.min.x, 3)
    expect(runsAlong(byId(dims, 'overall-height'), { x: 0, y: 1 })).toBe(true)
    // Its sides at 45 degrees are dimensioned along themselves.
    expect(dims.some((d) => d.chain !== undefined && runsAlong(d, { x: Math.SQRT1_2, y: Math.SQRT1_2 }))).toBe(true)
  })

  it('leaves no sliver in a chain from a wall a little off square', () => {
    const survey = plainPlan(
      [{ id: 'flat', corners: [[0, 0], [9, 0.05], [9.04, 6.1], [0.02, 6.06]] }],
      [{ id: 'p', start: [3, 0.017], end: [3.06, 6.07], thickness: 0.3, rooms: [] }]
    )
    const chained = outsideDimensions(survey).filter((d) => d.kind === 'wall' || d.kind === 'opening')
    expect(chained.length).toBeGreaterThan(0)
    for (const dim of chained) expect(dim.value, dim.id).toBeGreaterThanOrEqual(0.01)
  })

  it('marks a thin wall that meets a facade at its centre line, with no figure for its thickness', () => {
    const flat = plainPlan(
      [{ id: 'flat', corners: [[0, 0], [8, 0], [8, 5], [0, 5]] }],
      [{ id: 'p', start: [4, 0], end: [4, 5], thickness: 0.1, rooms: [] }]
    )
    const bottom = outsideDimensions(flat).filter((d) => d.side === 'bottom' && d.kind === 'wall')
    expect(bottom.map((d) => Number(d.value.toFixed(3)))).toEqual([0.3, 3.85, 3.85, 0.3])
    expect(bottom.map((d) => d.measuredTo)).toEqual([
      ['face', 'face'],
      ['face', 'centre-line'],
      ['centre-line', 'face'],
      ['face', 'face']
    ])
  })
})

describe('room dimensions', () => {
  it('measures each room inside its own outline', () => {
    const dining = drawing.rooms.find((r) => r.name === 'Dining')!
    const values = roomDimensions(dining)
      .map((d) => d.value)
      .sort((a, b) => a - b)
    // 4.80 × 2.375 between inner faces — the same numbers the area comes from.
    expect(values[0]).toBeCloseTo(2.375)
    expect(values[1]).toBeCloseTo(4.8)
  })

  it('agrees with the area: width × depth is the room area', () => {
    for (const room of drawing.rooms) {
      const [a, b] = roomDimensions(room)
      expect(a!.value * b!.value).toBeCloseTo(room.area, 4)
    }
  })

  it('keeps its lines clear of the room label at the centroid', () => {
    // Three labels stacked on the same point is unreadable, and it is exactly
    // what happens if the dimensions run through the middle.
    for (const room of drawing.rooms) {
      for (const dim of roomDimensions(room)) {
        const away = Math.hypot(
          dim.labelAt.x - room.labelAt.x,
          dim.labelAt.y - room.labelAt.y
        )
        expect(away).toBeGreaterThan(0.3)
      }
    }
  })

  it('skips rooms too narrow to fit a label', () => {
    const sliver = {
      id: 'r9',
      name: 'Closet',
      polygon: [
        { x: 0, y: 0 },
        { x: 0.4, y: 0 },
        { x: 0.4, y: 3 },
        { x: 0, y: 3 }
      ],
      holes: [],
      area: 1.2,
      labelAt: { x: 0.2, y: 1.5 }
    }
    expect(roomDimensions(sliver)).toEqual([])
  })

  it('dimensions the L-shaped living room side by side, not as its box of 6.79 × 7.70 (DR-2)', () => {
    const odd = floorDrawing(labPlan('F/scenarios/odd-house.json'), 'ground')
    const living = odd.rooms.find((r) => r.id === 'g-living')!
    const dims = roomDimensions(living, odd.walls)
    const values = dims.map((d) => Number(d.value.toFixed(2))).sort((a, b) => a - b)
    // Seven sides: the south wall, the east wall, the bay, the north wall, the kitchen's two
    // walls and the hall's.
    expect(values).toEqual([2, 2.7, 2.88, 3.79, 3.91, 5.79, 6.79])
    expect(values).not.toContain(7.7)
    for (const dim of dims) expect(lineInRoom(dim, living), dim.id).toBe(true)
  })

  it('dimensions the living room of a house turned 15 degrees as 4.30 × 5.00 (DR-2), not 5.45 × 5.94', () => {
    const turned = buildFloorPlan(labPlan('G/scenarios/s09a-house-turned-15.json'))
    const living = turned.rooms.find((r) => r.id === 'living')!
    const dims = roomDimensions(living, turned.walls)
    expect(dims.map((d) => d.id)).toEqual(['living-width', 'living-depth'])
    expect(byId(dims, 'living-width').value).toBeCloseTo(4.3, 3)
    expect(byId(dims, 'living-depth').value).toBeCloseTo(5, 3)
    // Every room of the turned house is a rectangle: width × depth is its area.
    for (const room of turned.rooms) {
      const [a, b] = roomDimensions(room, turned.walls)
      expect(a!.value * b!.value, room.id).toBeCloseTo(room.area, 2)
    }
  })

  it('keeps every room dimension line inside its room, on every floor of a third of the lab plans', () => {
    let rooms = 0
    for (const { name, text } of labSample()) {
      let p: FloorPlan
      try {
        p = parseFloorPlan(JSON.parse(text))
      } catch {
        continue
      }
      for (const floor of planFloors(p)) {
        const d = floorDrawing(p, floor.id)
        for (const room of d.rooms) {
          for (const dim of roomDimensions(room, d.walls)) expect(lineInRoom(dim, room), `${name} ${dim.id}`).toBe(true)
          rooms++
        }
      }
    }
    expect(rooms).toBeGreaterThan(500)
  }, 120_000)
})

describe('what each dimension measures to (SHT-4)', () => {
  it('records it for both ends of every dimension: centre line, wall face or finish', () => {
    for (const dim of buildDimensions(drawing, { openings: true })) {
      expect(dim.measuredTo, dim.id).toHaveLength(2)
      for (const end of dim.measuredTo) expect(['centre-line', 'face', 'finish'], dim.id).toContain(end)
    }
  })

  it('measures a room to the dividing line it stops at, and to the faces of its walls', () => {
    const dims = buildDimensions(drawing)
    // The dining room runs from the face of w1 up to the dividing line v1.
    expect(byId(dims, 'r1-depth').measuredTo).toEqual(['face', 'centre-line'])
    expect(byId(dims, 'r1-width').measuredTo).toEqual(['face', 'face'])
    expect(byId(dims, 'r2-depth').measuredTo).toEqual(['centre-line', 'face'])
    expect(byId(dims, 'r3-width').measuredTo).toEqual(['face', 'face'])
  })

  it('measures the chains outside to the faces of the walls, and to a dividing line that meets them', () => {
    const dims = outsideDimensions(drawing)
    for (const dim of dims.filter((d) => d.side === 'bottom')) expect(dim.measuredTo, dim.id).toEqual(['face', 'face'])
    // v1, the dividing line between the dining room and the kitchen, meets w4 on the left side.
    const left = dims.filter((d) => d.side === 'left' && d.kind === 'wall')
    expect(left.map((d) => d.measuredTo)).toEqual([
      ['face', 'face'],
      ['face', 'centre-line'],
      ['centre-line', 'face'],
      ['face', 'face']
    ])
  })
})

describe('opening dimensions', () => {
  it('measures the width of every door and window', () => {
    const dims = openingDimensions(drawing)
    expect(dims).toHaveLength(3)
    for (const dim of dims) {
      const opening = drawing.openings.find((o) => dim.id.startsWith(o.id))!
      expect(dim.value).toBeCloseTo(opening.width)
    }
  })

  it('pushes the line clear of the wall body', () => {
    for (const dim of openingDimensions(drawing)) {
      const opening = drawing.openings.find((o) => dim.id.startsWith(o.id))!
      expect(dim.offset).toBeGreaterThan(opening.thickness / 2)
    }
  })
})

describe('layers', () => {
  it('defaults to the chains, the overall size and the rooms, without each opening on its wall', () => {
    const kinds = new Set(buildDimensions(drawing).map((d) => d.kind))
    expect(kinds).toEqual(new Set(['opening', 'wall', 'overall', 'room']))
    expect(buildDimensions(drawing).some((d) => d.id === 'o3-width')).toBe(false)
  })

  it('can be asked for each opening on its wall too', () => {
    expect(buildDimensions(drawing, { openings: true }).some((d) => d.id === 'o3-width')).toBe(true)
  })

  it('can leave the chains off, keeping the overall size', () => {
    const kinds = new Set(buildDimensions(drawing, { chains: false }).map((d) => d.kind))
    expect(kinds).toEqual(new Set(['overall', 'room']))
  })

  it('can be turned off entirely', () => {
    expect(buildDimensions(drawing, { overall: false, chains: false, rooms: false })).toEqual([])
  })
})

describe('framing', () => {
  it('grows the bounds so the dimensions are not clipped', () => {
    const dims = buildDimensions(drawing)
    const framed = boundsWithDimensions(drawing, dims)
    expect(framed.min.x).toBeLessThan(drawing.bounds.min.x)
    expect(framed.min.y).toBeLessThan(drawing.bounds.min.y)
    expect(framed.width).toBeGreaterThan(drawing.bounds.width)
  })
})

describe('axes', () => {
  it('gives a unit direction along the dimension and one across it', () => {
    for (const dim of buildDimensions(drawing, { openings: true })) {
      const { along, across } = dimensionAxes(dim)
      expect(Math.hypot(along.x, along.y)).toBeCloseTo(1)
      expect(Math.hypot(across.x, across.y)).toBeCloseTo(1)
      expect(along.x * across.x + along.y * across.y).toBeCloseTo(0)
    }
  })
})
