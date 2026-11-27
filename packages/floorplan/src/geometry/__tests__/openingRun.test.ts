/**
 * VEW-77: openings on curved walls follow the curve, and may run on along a smooth run of walls
 * and round a whole circle's start.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { buildScene } from '../scene3d'
import { openingSymbol } from '../openingSymbol'
import { openingAxis, openingReach, runGuests, smoothNext } from '../openingRun'
import { openingChord, wallLength, wallParts } from '../wall'

type Tuple = [number, number]

const T = 0.3
const wall = (id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall => ({ id, start, end, thickness: T, height: 3, kind: 'exterior', ...extra })
const at = (r: number, degrees: number): Tuple => [r * Math.cos((degrees * Math.PI) / 180), r * Math.sin((degrees * Math.PI) / 180)]
const door = (id: string, wallId: string, offset: number, width = 0.9): Opening => ({ id, wall: wallId, type: 'door', offset, width, sill: 0, height: 2.1 })
const window = (id: string, wallId: string, offset: number, width: number): Opening => ({ id, wall: wallId, type: 'window', offset, width, sill: 0.9, height: 1.5 })

/** A round room of radius `r` walled by `n` curved walls, each turning 360/n degrees. */
function ring(n: number, r = 3, change: (w: Wall, i: number) => Wall = (w) => w): Wall[] {
  const step = 360 / n
  return Array.from({ length: n }, (_, i) => change(wall(`a${i}`, at(r, i * step), at(r, (i + 1) * step), { arc: { centre: [0, 0], sweep: step } }), i))
}

const planOf = (walls: Wall[], openings: Opening[]): FloorPlan => ({
  version: '1',
  units: 'm',
  walls,
  rooms: [{ id: 'r', name: 'Pavilion', boundary: walls.map((w) => w.id) }],
  openings
})

const codes = (plan: FloorPlan, id: string): string[] => validatePlan(plan).issues.filter((i) => i.id === id).map((i) => i.code)
const fromCentre = (p: { x: number; y: number }): number => Math.hypot(p.x, p.y)

describe('a smooth run of walls (VEW-77)', () => {
  it('carries a door past the end of a short curved wall onto the next', () => {
    const walls = ring(24)
    const each = wallLength(walls[0]!)
    expect(each).toBeLessThan(0.9)
    const plan = planOf(walls, [door('d1', 'a0', 0.3)])
    expect(codes(plan, 'd1')).toEqual([])
    const reach = openingReach(walls, plan.openings[0]!, walls[0]!)!
    expect(reach.map((s) => s.wall.id)).toEqual(['a0', 'a1'])
    expect(reach[1]!.from).toBe(0)
    expect(reach[1]!.to).toBeCloseTo(0.3 + 0.9 - each, 9)
    // The next wall leaves its gap; the door is drawn once.
    const guests = runGuests(walls, plan.openings).get('a1')!
    expect(guests).toHaveLength(1)
    expect(guests[0]!.offset).toBe(0)
    const drawing = buildFloorPlan(plan)
    expect(drawing.openings.filter((o) => o.id === 'd1')).toHaveLength(1)
    const a1 = drawing.walls.find((w) => w.id === 'a1')!
    const solid = a1.curve!.runs[0]!.left.points[0]!
    expect(Math.atan2(solid.y, solid.x)).toBeGreaterThan((15 * Math.PI) / 180 + 0.1)
    // Its two edges are on the circle, a chord 0.9 m along it apart.
    const d1 = drawing.openings.find((o) => o.id === 'd1')!
    expect(fromCentre(d1.from)).toBeCloseTo(3, 6)
    expect(fromCentre(d1.to)).toBeCloseTo(3, 6)
    expect(Math.hypot(d1.to.x - d1.from.x, d1.to.y - d1.from.y)).toBeCloseTo(2 * 3 * Math.sin(0.9 / 6), 6)
  })

  it('crosses several walls, back past a start too, and a wall that runs the other way', () => {
    // The second wall is drawn from its far end back, its sweep the other way round.
    const walls = ring(36, 3, (w, i) => (i === 1 ? { ...w, start: w.end, end: w.start, arc: { centre: [0, 0], sweep: -10 } } : w))
    const plan = planOf(walls, [door('d1', 'a0', 0.2, 1.2), window('w1', 'a5', -0.4, 1)])
    expect(codes(plan, 'd1')).toEqual([])
    expect(codes(plan, 'w1')).toEqual([])
    const reach = openingReach(walls, plan.openings[0]!, walls[0]!)!
    expect(reach.map((s) => [s.wall.id, s.reversed])).toEqual([
      ['a0', false],
      ['a1', true],
      ['a2', false]
    ])
    // On the wall drawn backwards the door covers the whole of it.
    expect(reach[1]!.from).toBeCloseTo(0, 9)
    const back = openingReach(walls, plan.openings[1]!, walls[5]!)!
    expect(back.map((s) => s.wall.id)).toEqual(['a4', 'a5', 'a6'])
    expect(back[0]!.to).toBeCloseTo(wallLength(walls[4]!), 9)
    // The axis runs on round the circle from edge to edge.
    const axis = openingAxis(walls, plan.openings[0]!, walls[0]!)!
    for (const p of axis.points) expect(fromCentre(p.point)).toBeCloseTo(3, 6)
    expect(axis.points.at(-1)!.at - axis.points[0]!.at).toBeCloseTo(1.2, 9)
  })

  it('stops at a corner, a joint three walls meet at and a change of thickness', () => {
    const square = [wall('s', [0, 0], [4, 0]), wall('e', [4, 0], [4, 4]), wall('n', [4, 4], [0, 4]), wall('w', [0, 4], [0, 0])]
    expect(smoothNext(square, square[0]!, 'end')).toBeNull()
    expect(codes(planOf(square, [door('d1', 's', 3.5)]), 'd1')).toContain('opening/out-of-wall')

    const walls = ring(24)
    expect(smoothNext(walls, walls[0]!, 'end')?.wall.id).toBe('a1')
    const spur = wall('spur', at(3, 15), at(5, 15))
    expect(smoothNext([...walls, spur], walls[0]!, 'end')).toBeNull()
    const thicker = walls.map((w, i) => (i === 1 ? { ...w, thickness: 0.4 } : w))
    expect(smoothNext(thicker, thicker[0]!, 'end')).toBeNull()
    expect(codes(planOf(thicker, [door('d1', 'a0', 0.3)]), 'd1')).toContain('opening/out-of-wall')
  })

  it('carries on along straight pieces that turn a little, and an opening on the next wall is an overlap', () => {
    // A curve traced by straight pieces at 2.5 degrees.
    const walls = Array.from({ length: 144 }, (_, i) => wall(`p${i}`, at(4, i * 2.5), at(4, (i + 1) * 2.5)))
    const plan = planOf(walls, [door('d1', 'p0', 0, 0.9), window('w1', 'p4', 0, 0.1)])
    expect(codes(plan, 'd1')).toEqual([])
    expect(runGuests(walls, plan.openings).get('p4')).toHaveLength(1)
    expect(codes(plan, 'w1')).toContain('opening/overlap')
  })
})

describe('an opening round a whole circle\'s start (VEW-77)', () => {
  const circle = wall('c', [3, 0], [3, 0], { arc: { centre: [0, 0], sweep: 360 } })
  const length = 2 * Math.PI * 3

  it('straddles the start and leaves its gap on both sides of it', () => {
    const plan = planOf([circle], [window('w1', 'c', length - 0.5, 1.2), door('d1', 'c', -0.4)])
    expect(codes(plan, 'w1')).toEqual([])
    expect(codes(plan, 'd1')).toEqual([])
    const parts = wallParts(circle, [plan.openings[0]!])
    const lintels = parts.filter((p) => p.kind === 'lintel').map((p) => [p.from, p.to])
    expect(lintels).toHaveLength(2)
    expect(lintels[0]![0]).toBe(0)
    expect(lintels[0]![1]).toBeCloseTo(0.7, 9)
    expect(lintels[1]![0]).toBeCloseTo(length - 0.5, 9)
    expect(lintels[1]![1]).toBeCloseTo(length, 9)
    const solid = parts.filter((p) => p.kind === 'solid')
    expect(solid).toHaveLength(1)
    expect(solid[0]!.from).toBeCloseTo(0.7, 9)
    expect(solid[0]!.to).toBeCloseTo(length - 0.5, 9)
    // The door before the start: its gap from 0.4 m short of it to 0.5 m past it.
    const doorParts = wallParts(circle, [plan.openings[1]!]).filter((p) => p.kind === 'solid')
    expect(doorParts[0]!.from).toBeCloseTo(0.5, 9)
    expect(doorParts[0]!.to).toBeCloseTo(length - 0.4, 9)
  })

  it('refuses one wider than the whole circle', () => {
    expect(codes(planOf([circle], [window('w1', 'c', 0, length + 0.5)]), 'w1')).toContain('opening/out-of-wall')
  })
})

describe('a window on a curve follows it (VEW-77)', () => {
  // A bay a quarter circle of radius 3 m, closed by a straight wall across its chord.
  const bay = [wall('b', [3, 0], [0, 3], { arc: { centre: [0, 0], sweep: 90 } }), wall('c', [0, 3], [3, 0])]
  const plan: FloorPlan = { ...planOf(bay, [window('w1', 'b', 1, 2.4), door('d1', 'b', 3.6, 0.9)]), rooms: [{ id: 'r', name: 'Bay', boundary: ['b', 'c'] }] }

  it('in plan: its path, its faces and its glass lie on the curve', () => {
    const drawing = buildFloorPlan(plan)
    const w1 = drawing.openings.find((o) => o.id === 'w1')!
    expect(w1.path!.length).toBeGreaterThan(10)
    for (const p of w1.path!) expect(fromCentre(p.point)).toBeCloseTo(3, 6)
    const lines = openingSymbol(w1)!.pieces.flatMap((piece) => (piece.shape === 'line' ? [piece] : []))
    expect(lines.length).toBeGreaterThan(30)
    for (const line of lines) {
      const r = line.part === 'glass' ? 3 : undefined
      for (const p of [line.from, line.to]) {
        const d = fromCentre(p)
        if (r !== undefined) expect(Math.abs(d - r)).toBeLessThan(0.001)
        else expect(Math.min(Math.abs(d - 3 - T / 2), Math.abs(d - 3 + T / 2))).toBeLessThan(0.001)
      }
    }
    // A door keeps its straight leaf on the chord between its edges.
    const d1 = drawing.openings.find((o) => o.id === 'd1')!
    const chord = openingChord(bay[0]!, 3.6, 4.5)
    expect(d1.from.x).toBeCloseTo(chord.start.x, 9)
    expect(d1.to.y).toBeCloseTo(chord.end.y, 9)
  })

  it('in 3D: its frame and glass stand inside the wall faces, and the wall over it bows', () => {
    const scene = buildScene(plan)
    const w1 = scene.openings.find((o) => o.id === 'w1')!
    expect(w1.parts.filter((p) => p.part === 'glass').length).toBeGreaterThan(10)
    for (const part of w1.parts) {
      for (const p of part.outline) {
        expect(fromCentre(p)).toBeGreaterThan(3 - T / 2 - 0.001)
        expect(fromCentre(p)).toBeLessThan(3 + T / 2 + 0.001)
      }
    }
    const b = scene.walls.find((w) => w.id === 'b')!
    const head = 0.9 + 1.5
    const lintels = b.pieces!.filter((p) => Math.abs(p.elevation.outline[0]!.y - head) < 1e-9)
    expect(lintels.length).toBeGreaterThan(10)
    for (const piece of lintels) expect(fromCentre(piece.basis.origin)).toBeCloseTo(3, 6)
  })

  it('across a joint: a window over two arcs that meet is drawn once, along both', () => {
    const halves = [wall('h1', [3, 0], at(3, 45), { arc: { centre: [0, 0], sweep: 45 } }), wall('h2', at(3, 45), [0, 3], { arc: { centre: [0, 0], sweep: 45 } }), wall('c', [0, 3], [3, 0])]
    const across: FloorPlan = { ...planOf(halves, [window('w1', 'h1', 1.5, 2)]), rooms: [{ id: 'r', name: 'Bay', boundary: ['h1', 'h2', 'c'] }] }
    expect(validatePlan(across).issues.filter((i) => i.severity === 'error')).toEqual([])
    const scene = buildScene(across)
    expect(scene.openings.filter((o) => o.id === 'w1')).toHaveLength(1)
    const drawing = buildFloorPlan(across)
    const w1 = drawing.openings.find((o) => o.id === 'w1')!
    expect(w1.path!.at(-1)!.at - w1.path![0]!.at).toBeCloseTo(2, 9)
    expect(Math.atan2(w1.to.y, w1.to.x)).toBeGreaterThan(Math.PI / 4)
  })
})
