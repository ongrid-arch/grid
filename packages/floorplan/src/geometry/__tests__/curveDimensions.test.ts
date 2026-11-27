/**
 * VEW-79: a curve is drawn as a curve. Its plan dimensions are one radius per circle, from its
 * centre to the face that looks at the centre, and one chord where it is not a whole circle, never
 * one dimension per straight piece; in a facade and a section a curved wall is one face, its
 * silhouette, not one face per piece.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { buildFloorPlan } from '../floorplan'
import { boundsWithDimensions, buildDimensions, curveDimensions, type Dimension } from '../dimensions'
import { planFacade } from '../facade'
import { planSection } from '../section'
import { tolerance } from '../tolerances'

/** The curves example of docs/rooms-first.md: a nave with an apse and a bowed side, a round pavilion and a band round half of it. */
const CURVES = `room nave "Nave" assembly 20 x 10 at 0,0
room apse "Apse" assembly arc 180 east of nave
wall nave south curve radius 14
room pav "Pavilion" assembly circle 12 at 40,5
room ring "Ring" corridor band 6.1 to 9 from 0 sweep 180 at 40,5
door d1 between nave and apse, centred, 2 wide
door d2 between pav and ring, centred, 1.2 wide
window w1 in apse east, centred, 1.5 wide
`

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems.map((p) => p.message)).toEqual([])
  return parseFloorPlan(result.plan)
}

/** A round room of `n` straight walls, its corners on a circle of radius `r` round 0,0. */
function drum(n: number, r: number): FloorPlan {
  const at = (i: number): [number, number] => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)]
  const walls = Array.from({ length: n }, (_, i) => ({ id: `w${i}`, start: at(i), end: at(i + 1), thickness: 0.3, height: 3, kind: 'exterior' }))
  return parseFloorPlan({ version: '1', name: 'Drum', walls, openings: [], rooms: [{ id: 'drum', name: 'Drum', boundary: walls.map((w) => w.id) }] })
}

const radii = (dims: readonly Dimension[]): number[] =>
  dims
    .filter((d) => d.kind === 'radius')
    .map((d) => Number(d.value.toFixed(2)))
    .sort((a, b) => a - b)

describe('a curve dimensioned as a curve (VEW-79)', () => {
  const plan = written(CURVES)
  const drawing = buildFloorPlan(plan)
  const dims = buildDimensions(drawing)

  it('gives each circle one radius, to the face that looks at its centre', () => {
    // The bowed side's 14, the apse's 5 (its 10 m chord less the wall), the pavilion's 6 and the band's 9.
    expect(radii(dims)).toEqual([5, 6, 9, 14])
    for (const dim of dims.filter((d) => d.kind === 'radius')) {
      expect(dim.centre, dim.id).toBeDefined()
      expect(dim.measuredTo, dim.id).toEqual(['centre-line', 'face'])
      // Its line ends on the curve, the radius from its centre.
      expect(Math.hypot(dim.to.x - dim.centre!.x, dim.to.y - dim.centre!.y)).toBeCloseTo(dim.value, 6)
    }
    // A radius no longer than `radiusLineLongest` is drawn from its centre.
    const pavilion = dims.find((d) => d.kind === 'radius' && Math.abs(d.value - 6) < 0.01)!
    expect(pavilion.from).toEqual(pavilion.centre)
    expect(pavilion.centre).toEqual({ x: 40, y: 5 })
  })

  it('gives each curve that is not a whole circle its chord once, and a round room none', () => {
    const chords = dims.filter((d) => d.kind === 'chord')
    expect(chords.map((d) => Number(d.value.toFixed(1))).sort((a, b) => a - b)).toEqual([10, 18, 20])
    // Pushed out past its bulge.
    for (const chord of chords) expect(chord.offset, chord.id).toBeGreaterThan(1)
  })

  it('dimensions no room side along a curve, piece by piece', () => {
    const rooms = dims.filter((d) => d.kind === 'room')
    // The nave's three straight sides, the apse's chord and the band's two ends.
    expect(rooms).toHaveLength(6)
    for (const room of drawing.rooms) expect(room.polygon.length, room.id).toBeGreaterThan(60)
  })

  it('draws two radii on one centre on different lines', () => {
    const onPavilion = dims.filter((d) => d.kind === 'radius' && d.centre!.x === 40 && d.centre!.y === 5)
    expect(onPavilion).toHaveLength(2)
    const [a, b] = onPavilion.map((d) => Math.atan2(d.to.y - 5, d.to.x - 40))
    expect(Math.abs(a! - b!)).toBeGreaterThan(0.1)
  })

  it('can be left out', () => {
    expect(buildDimensions(drawing, { curves: false }).some((d) => d.kind === 'radius' || d.kind === 'chord')).toBe(false)
  })
})

describe('a curve written as straight walls (VEW-79)', () => {
  it('gives a room of 24 straight pieces one radius, and no dimension per piece inside or out', () => {
    const dims = buildDimensions(buildFloorPlan(drum(24, 8)))
    expect(dims.filter((d) => d.kind === 'room')).toEqual([])
    expect(dims.filter((d) => d.kind === 'wall' || d.kind === 'opening' || d.chain !== undefined)).toEqual([])
    expect(radii(dims)).toEqual([7.85])
    // Its overall size, across the page both ways.
    expect(dims.filter((d) => d.kind === 'overall').map((d) => d.id).sort()).toEqual(['overall-height', 'overall-width'])
    expect(dims.some((d) => d.kind === 'chord')).toBe(false)
  })

  it('leaves a room of eight sides a polygon, dimensioned side by side', () => {
    const dims = buildDimensions(buildFloorPlan(drum(8, 8)))
    expect(dims.filter((d) => d.kind === 'radius')).toEqual([])
    expect(dims.filter((d) => d.kind === 'room')).toHaveLength(8)
  })
})

describe('a long radius (VEW-79)', () => {
  it('starts its line near the curve, with the whole radius as its figure, and keeps the frame', () => {
    const plan = written('room hall "Hall" assembly 20 x 10 at 0,0\nwall hall south curve radius 40\n')
    const drawing = buildFloorPlan(plan)
    const radius = curveDimensions(drawing).find((d) => d.kind === 'radius')!
    expect(radius.value).toBeCloseTo(40, 2)
    expect(Math.hypot(radius.to.x - radius.from.x, radius.to.y - radius.from.y)).toBeCloseTo(tolerance('radiusLineLongest'), 6)
    expect(radius.from).not.toEqual(radius.centre)
    const framed = boundsWithDimensions(drawing, buildDimensions(drawing))
    expect(framed.max.y - framed.min.y).toBeLessThan(20)
  })
})

describe('a curved wall in elevation and section (VEW-79)', () => {
  const pavilion = written('room pav "Pavilion" assembly circle 12 at 0,0\nwindow w1 in pav south, centred, 1.5 wide\nwindow w2 in pav east, centred, 1.5 wide\n')
  const wall = pavilion.walls[0]!.id

  it('is one face in a facade, its silhouette, with its windows, the one to the side narrower', () => {
    const facade = planFacade(pavilion, 'south')
    const faces = facade.faces.filter((f) => f.kind === 'wall' && f.wall === wall)
    expect(faces).toHaveLength(1)
    const face = faces[0]!
    // As wide as the drum, outside face to outside face.
    expect(face.u1 - face.u0).toBeCloseTo(12 + 2 * pavilion.walls[0]!.thickness, 1)
    // A rectangle: no corner where one piece met the next.
    expect(face.outline.length).toBeLessThanOrEqual(8)
    const front = face.openings.find((o) => o.id === 'w1')!
    const side = face.openings.find((o) => o.id === 'w2')
    expect(front.u1 - front.u0).toBeCloseTo(1.5, 1)
    // Seen from the south, the east window is edge-on or close to it.
    if (side !== undefined) expect(side.u1 - side.u0).toBeLessThan(0.5)
  })

  it('is one face a side beyond a section cut, not one per chord', () => {
    const section = planSection(pavilion, { from: { x: -10, y: -3 }, to: { x: 10, y: -3 }, toward: 'left' })
    const faces = section.beyond.filter((f) => f.kind === 'wall' && f.id === wall && f.edge === null)
    // Looking north from a cut 3 m south of the centre: the inside face of the far half, and the
    // outside face beyond the cut on either side of it.
    expect(faces).toHaveLength(3)
  })
})
