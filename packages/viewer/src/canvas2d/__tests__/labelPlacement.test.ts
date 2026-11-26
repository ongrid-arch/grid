import { describe, expect, it } from 'vitest'
import { buildFloorPlan, pointInPolygon, rectInsidePolygon, rectTouchesPolygon, roomDimensions } from '@ongrid/floorplan/geometry'
import type { Dimension, PlanRoom } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { LabelRoom } from '../labelPlacement'
import {
  dimensionTextBox,
  doorSwingBox,
  formBox,
  formCorners,
  lineOutline,
  roomNumbers,
  formatArea,
  labelName,
  overlaps,
  placeDimensionLabel,
  placeRoomLabels,
  roomLabelBox
} from '../labelPlacement'

// About 70 px per metre: the "normal zoom" the issue measured (0.33 m ≈ 20-25 px).
const MPP = 1 / 70

/** A w × d room at the origin, built through the real geometry so labelAt is the real one. */
function room(name: string, w: number, d: number): PlanRoom {
  const plan: FloorPlan = {
    version: '1', units: 'm',
    walls: [
      { id: 'a', start: [0, 0], end: [w, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'b', start: [w, 0], end: [w, d], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'c', start: [w, d], end: [0, d], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'd', start: [0, d], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
    ],
    rooms: [{ id: 'r', name, boundary: ['a', 'b', 'c', 'd'] }],
    openings: [],
  }
  return buildFloorPlan(plan).rooms[0]
}

function onLine(dim: Dimension, at: { x: number; y: number }): boolean {
  const [lo, hi] = [Math.min(dim.from.x, dim.to.x), Math.max(dim.from.x, dim.to.x)]
  const [loY, hiY] = [Math.min(dim.from.y, dim.to.y), Math.max(dim.from.y, dim.to.y)]
  const eps = 1e-9
  return at.x >= lo - eps && at.x <= hi + eps && at.y >= loY - eps && at.y <= hiY + eps
}

describe('placeDimensionLabel', () => {
  it.each([
    ['Upstairs study', 4.02, 1.32, 'width'],
    ['Bathroom', 4.02, 1.38, 'width'],
    ['Landing', 1.48, 4.2, 'depth'],
  ] as const)('moves the %s number off the name and area (%s × %s m)', (name, w, d, which) => {
    const r = room(name, w, d)
    const block = roomLabelBox(r, MPP)
    const dim = roomDimensions(r).find((x) => x.id.endsWith(which))!
    // The reported bug: at its default spot the number sits on the label.
    expect(overlaps(dimensionTextBox(dim.labelAt, dim, MPP), block)).toBe(true)

    const at = placeDimensionLabel(dim, [block], MPP)
    expect(at).not.toBeNull()
    expect(overlaps(dimensionTextBox(at!, dim, MPP), block)).toBe(false)
    expect(onLine(dim, at!)).toBe(true)
  })

  it('leaves a number that is already clear exactly where it was', () => {
    const r = room('Living room', 6, 5)
    for (const dim of roomDimensions(r)) {
      expect(placeDimensionLabel(dim, [roomLabelBox(r, MPP)], MPP)).toBe(dim.labelAt)
    }
  })

  it('hides the number when the line has no clear spot', () => {
    const r = room('A very long room name indeed', 1.3, 1.3)
    const dim = roomDimensions(r)[0]
    expect(placeDimensionLabel(dim, [roomLabelBox(r, MPP)], MPP * 6)).toBeNull()
  })

  it('never returns a spot that overlaps a label or leaves its line, at any size and zoom', () => {
    // Invariant over a grid of room shapes and zooms: clear and on the line, or hidden.
    for (const w of [0.9, 1.2, 1.5, 2, 3, 4.02, 6]) {
      for (const d of [0.9, 1.2, 1.32, 2, 3, 5]) {
        for (const pxPerMetre of [15, 30, 70, 150, 400]) {
          const mpp = 1 / pxPerMetre
          const r = room('Kitchen', w, d)
          const block = roomLabelBox(r, mpp)
          for (const dim of roomDimensions(r)) {
            const at = placeDimensionLabel(dim, [block], mpp)
            if (at === null) continue
            expect(overlaps(dimensionTextBox(at, dim, mpp), block)).toBe(false)
            expect(onLine(dim, at)).toBe(true)
          }
        }
      }
    }
  })
})

describe('roomLabelBox with a review area', () => {
  it('is as wide as the "before → after" line when that is wider than the name', () => {
    const room = { name: 'WC', area: 3.2, labelAt: { x: 0, y: 0 } }
    const plain = roomLabelBox(room, 0.01)
    const review = roomLabelBox({ ...room, areaText: '20.10 → 17.60 m²' }, 0.01)
    expect(review.maxX - review.minX).toBeGreaterThan(plain.maxX - plain.minX)
    // Same height: only the width depends on the text.
    expect(review.maxY - review.minY).toBeCloseTo(plain.maxY - plain.minY, 9)
  })
})

const NONE = { swings: [], walls: [], dimensions: [] }
const ring = (...points: [number, number][]) => points.map(([x, y]) => ({ x, y }))
const labelRoom = (id: string, polygon: { x: number; y: number }[], name = 'Kitchen'): LabelRoom => ({
  id,
  polygon,
  name,
  areaText: '12.00 m²'
})

describe('placeRoomLabels', () => {
  it('centres the label on the middle of a plain room', () => {
    const [label] = placeRoomLabels([labelRoom('r', ring([0, 0], [6, 0], [6, 5], [0, 5]))], NONE, MPP)
    expect((label!.box.minX + label!.box.maxX) / 2).toBeCloseTo(3, 6)
    expect((label!.box.minY + label!.box.maxY) / 2).toBeCloseTo(2.5, 6)
  })

  it('puts a U-shaped room’s label in the room, where its corners’ average is not', () => {
    const you = ring([0, 0], [7, 0], [7, 5], [5, 5], [5, 2], [2, 2], [2, 5], [0, 5])
    const [label] = placeRoomLabels([labelRoom('u', you)], NONE, MPP)
    expect(pointInPolygon(label!.at, you)).toBe(true)
    expect(rectInsidePolygon(label!.box, you)).toBe(true)
  })

  it('steps off a door swing in the middle of the room', () => {
    const polygon = ring([0, 0], [4, 0], [4, 3], [0, 3])
    const swing = { minX: 1.2, minY: 0.8, maxX: 2.8, maxY: 2.2 }
    const [label] = placeRoomLabels([labelRoom('r', polygon)], { ...NONE, swings: [swing] }, MPP)
    expect(overlaps(label!.box, swing)).toBe(false)
    expect(rectInsidePolygon(label!.box, polygon)).toBe(true)
  })

  it('keeps off a wall standing in the room', () => {
    const polygon = ring([0, 0], [6, 0], [6, 4], [0, 4])
    const wall = ring([2.9, 0], [3.1, 0], [3.1, 3], [2.9, 3])
    const [label] = placeRoomLabels([labelRoom('r', polygon)], { ...NONE, walls: [wall] }, MPP)
    expect(label!.box.maxX <= 2.9 || label!.box.minX >= 3.1 || label!.box.minY >= 3).toBe(true)
  })

  it('leaves a room with no fitting label blank, even next to open space', () => {
    const closet = ring([0, 0], [0.12, 0], [0.12, 0.12], [0, 0.12])
    const [small] = placeRoomLabels([{ ...labelRoom('closet', closet, 'Linen closet'), number: '1' }], NONE, MPP)
    expect(small).toBeNull()
  })

  it('gives the same places every time', () => {
    const rooms = [labelRoom('a', ring([0, 0], [3, 0], [3, 3], [0, 3])), labelRoom('b', ring([0, 3.2], [0.5, 3.2], [0.5, 3.7], [0, 3.7]))]
    expect(placeRoomLabels(rooms, NONE, MPP)).toEqual(placeRoomLabels(rooms, NONE, MPP))
  })
})

describe('room labels that stay in their rooms (VEW-13)', () => {
  const numbered = (id: string, polygon: { x: number; y: number }[], name: string, number: string): LabelRoom => ({ ...labelRoom(id, polygon, name), number })

  it('turns the name along a long narrow room it is too wide to sit across', () => {
    const corridor = ring([0, 0], [1, 0], [1, 12], [0, 12])
    const [label] = placeRoomLabels([labelRoom('c', corridor, 'Dirty corridor')], NONE, MPP)
    expect(label!.form.angle).toBe(90)
    expect(label!.form.names).toEqual(['Dirty corridor'])
    expect(rectInsidePolygon(label!.box, corridor)).toBe(true)
    const redrawn = formBox(label!.form, label!.at, MPP)
    for (const side of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(redrawn[side]).toBeCloseTo(label!.box[side], 9)
  })

  it('writes a smaller, wrapped name in a room too small for the whole label', () => {
    const office = ring([0, 0], [1.2, 0], [1.2, 1.2], [0, 1.2])
    const [label] = placeRoomLabels([labelRoom('o', office, 'Two person office')], NONE, MPP)
    expect(label!.form.scale).toBeLessThan(1)
    expect(label!.form.names.length).toBe(2)
    expect(rectInsidePolygon(label!.box, office)).toBe(true)
  })

  it('falls back to the room’s number, in the room, when no name fits', () => {
    const stall = ring([0, 0], [0.6, 0], [0.6, 0.6], [0, 0.6])
    const [label] = placeRoomLabels([numbered('s', stall, 'Housekeeping store', '7')], NONE, MPP)
    expect(label!.form.keyed).toBe(true)
    expect(label!.form.names).toEqual(['7'])
    expect(rectInsidePolygon(label!.box, stall)).toBe(true)
  })

  it('numbers every stall of a row in its own stall, with no leader', () => {
    const stalls = Array.from({ length: 24 }, (_, i) => numbered(`s${i}`, ring([i * 0.7, 0], [i * 0.7 + 0.6, 0], [i * 0.7 + 0.6, 0.6], [i * 0.7, 0.6]), 'Food stall', String(i + 1)))
    const labels = placeRoomLabels(stalls, NONE, MPP)
    labels.forEach((label, i) => {
      expect(rectInsidePolygon(label!.box, stalls[i]!.polygon)).toBe(true)
    })
  })

  it('leaves a room shut in by others unlabelled rather than sending its name across them', () => {
    const tiny = ring([1, 1], [1.3, 1], [1.3, 1.3], [1, 1.3])
    const round = [
      labelRoom('w', ring([0, 0], [0.95, 0], [0.95, 2.3], [0, 2.3]), 'West'),
      labelRoom('e', ring([1.35, 0], [2.3, 0], [2.3, 2.3], [1.35, 2.3]), 'East'),
      labelRoom('s', ring([0.95, 0], [1.35, 0], [1.35, 0.95], [0.95, 0.95]), 'South'),
      labelRoom('n', ring([0.95, 1.35], [1.35, 1.35], [1.35, 2.3], [0.95, 2.3]), 'North')
    ]
    const labels = placeRoomLabels([labelRoom('t', tiny, 'Riser cupboard'), ...round], NONE, MPP)
    expect(labels[0]).toBeNull()
  })

  it('turns a long label along a diagonal room', () => {
    const turn = ({ x, y }: { x: number; y: number }) => ({ x: (x - y) * Math.SQRT1_2, y: (x + y) * Math.SQRT1_2 })
    const polygon = ring([0, 0], [8, 0], [8, 0.55], [0, 0.55]).map(turn)
    const [label] = placeRoomLabels([labelRoom('hall', polygon, 'Long diagonal corridor')], NONE, MPP)
    expect(label!.form.angle).toBeCloseTo(45)
    expect(label!.form.scale).toBe(1)
    expect(formCorners(label!.form, label!.at, MPP).every((point) => pointInPolygon(point, polygon))).toBe(true)
  })

  it('fits labels in neighbouring diagonal rooms whose bounding boxes overlap', () => {
    const turn = ({ x, y }: { x: number; y: number }) => ({ x: (x - y) * Math.SQRT1_2, y: (x + y) * Math.SQRT1_2 })
    const rooms = [0, 0.6].map((y, i) =>
      labelRoom(String(i), ring([0, y], [2.3, y], [2.3, y + 0.55], [0, y + 0.55]).map(turn), 'Diagonal passage')
    )
    const [first, second] = placeRoomLabels(rooms, NONE, MPP)
    expect(first!.form.angle).toBeCloseTo(45)
    expect(second!.form.angle).toBeCloseTo(45)
    expect(first!.form.scale).toBe(1)
    expect(second!.form.scale).toBe(1)
    expect(overlaps(first!.box, second!.box)).toBe(true)
  })

  it('keeps a label off a lift’s cross and a stair’s flight', () => {
    const lift = ring([0, 0], [2, 0], [2, 2], [0, 2])
    const cross = [lineOutline({ x: 0, y: 0 }, { x: 2, y: 2 }, MPP), lineOutline({ x: 2, y: 0 }, { x: 0, y: 2 }, MPP)]
    const [label] = placeRoomLabels([labelRoom('l', lift, 'Lift')], { ...NONE, walls: cross }, MPP)
    expect(label).not.toBeNull()
    for (const line of cross) expect(rectTouchesPolygon(label!.box, line)).toBe(false)

    const hall = ring([0, 0], [4, 0], [4, 3], [0, 3])
    const flight = ring([1, 0.2], [3, 0.2], [3, 2.8], [1, 2.8])
    const [stair] = placeRoomLabels([labelRoom('h', hall, 'Stair hall')], { ...NONE, walls: [flight] }, MPP)
    expect(stair).not.toBeNull()
    expect(rectTouchesPolygon(stair!.box, flight)).toBe(false)
  })

  it('disambiguates repeated stated numbers without taking another stated number', () => {
    expect(roomNumbers([{ number: 'A' }, { number: 'A' }, { number: 'A-2' }, { number: 'A' }]))
      .toEqual(['A', 'A-3', 'A-2', 'A-4'])
  })

  it('numbers rooms by their own number, else by their place, passing over the stated ones', () => {
    expect(roomNumbers([{}, { number: '2' }, {}, { number: 'B4' }, {}])).toEqual(['1', '2', '3', 'B4', '4'])
  })
})

describe('doorSwingBox', () => {
  it('covers the quarter circle the leaf sweeps, and nothing for a door with no swing', () => {
    const opening = {
      id: 'd',
      wallId: 'w',
      type: 'door' as const,
      from: { x: 1, y: 0 },
      to: { x: 2, y: 0 },
      normal: { x: 0, y: 1 },
      thickness: 0.2,
      width: 1
    }
    const box = doorSwingBox(opening, { hinge: 'start', swing: 'left' }, 0)!
    // From the wall's left face, y = 0.1, where the leaf hangs since SHT-2.
    expect(box.minX).toBeCloseTo(1, 12)
    expect(box.minY).toBeCloseTo(0.1, 12)
    expect(box.maxX).toBeCloseTo(2, 12)
    expect(box.maxY).toBeCloseTo(1.1, 12)
    expect(doorSwingBox(opening, {}, MPP)).toBeNull()
    expect(doorSwingBox({ ...opening, type: 'window' }, { hinge: 'start', swing: 'left' }, MPP)).toBeNull()
  })
})

describe('room tags', () => {
  it('can be upper case, numbered, and rounded as asked', () => {
    expect(labelName('Kitchen', 0)).toBe('Kitchen')
    expect(labelName('Kitchen', 2, { upperCase: true, numbered: true })).toBe('3 KITCHEN')
    expect(formatArea(12.345)).toBe('12.35 m²')
    expect(formatArea(12.345, 1)).toBe('12.3 m²')
    expect(formatArea(12.5, 0)).toBe('13 m²')
  })
})
