/**
 * VEW-65: the earth under the ground line in a section. A basement stands in its hole, dug into
 * the earth, its outside walls holding the earth back; the earth lies over a basement that reaches
 * past the floor above it, and the ground line runs on over it.
 */
import { describe, expect, it } from 'vitest'
import { exterior, flat, room } from '../../test-support/plans'
import type { FloorPlan } from '../plan'
import { planSection, sectionEarth, type SectionLine, type SectionPiece } from '../section'
import { signedArea } from '../vec2'
import { inPieces, ringOf } from '../polygons'

/** The flat on the ground floor, over a cellar 10 × 12 that reaches 4 m past it under the garden. */
function basementHouse(): FloorPlan {
  const ground = flat()
  const down = (id: string, start: [number, number], end: [number, number]) => exterior(id, start, end, { floor: 'basement' })
  return {
    ...ground,
    floors: [
      { id: 'basement', name: 'Basement', level: -1 },
      { id: 'ground', name: 'Ground floor', level: 0 }
    ],
    site: { ground: 0 },
    walls: [...ground.walls, down('b-s', [0, 0], [10, 0]), down('b-e', [10, 0], [10, 12]), down('b-n', [10, 12], [0, 12]), down('b-w', [0, 12], [0, 0])],
    rooms: [...ground.rooms, room('cellar', 'Cellar', ['b-s', 'b-e', 'b-n', 'b-w'], 'basement')]
  }
}

/** Up x = 7 from the street (y −3) past the cellar's far end (y 15), looking west. */
const ACROSS: SectionLine = { from: { x: 7, y: -3 }, to: { x: 7, y: 15 }, toward: 'left' }

const areaOf = (pieces: readonly SectionPiece[]): number =>
  pieces.reduce((sum, p) => sum + Math.abs(signedArea(p.outline)) - p.holes.reduce((h, ring) => h + Math.abs(signedArea(ring)), 0), 0)
const inEarth = (pieces: readonly SectionPiece[], x: number, y: number): boolean =>
  inPieces(pieces.map((p) => [ringOf(p.outline), ...p.holes.map(ringOf)]), { x, y })

describe('the earth in a section through a house over a cellar', () => {
  const section = planSection(basementHouse(), ACROSS)
  const { earth } = section.ground

  it('goes down a metre under the cellar slab', () => {
    // The ground floor at 0 on a 0.25 m slab; the cellar 2.7 m under it, on its own 0.25 m slab.
    expect(section.levels.map((l) => l.level)).toEqual([-2.95, 0])
    expect(earth.bottom).toBeCloseTo(-4.2, 6)
    expect(section.bounds.min.y).toBeCloseTo(-4.2, 6)
  })

  it('leaves the cellar out of it, from the outside face of its walls and the underside of its slab', () => {
    // The house stands from x 2.9 to 11.1 on the line, the cellar to 15.1.
    expect(inEarth(earth.pieces, 2.8, -1)).toBe(true)
    expect(inEarth(earth.pieces, 3, -1)).toBe(false)
    expect(inEarth(earth.pieces, 7, -3.1)).toBe(false)
    expect(inEarth(earth.pieces, 7, -3.3)).toBe(true)
    expect(inEarth(earth.pieces, 15.2, -1)).toBe(true)
    // The ground floor's slab is in the ground too.
    expect(inEarth(earth.pieces, 7, -0.1)).toBe(false)
    // 18 m by 4.2 m, less the house's 8.2 m down to the cellar's slab and the 4 m of cellar under the garden.
    expect(areaOf(earth.pieces)).toBeCloseTo(18 * 4.2 - 8.2 * 3.2 - 4 * 2.95, 4)
  })

  it('lies over the cellar where it reaches under the garden, and the ground line runs over it', () => {
    expect(inEarth(earth.pieces, 13, -0.1)).toBe(true)
    expect(inEarth(earth.pieces, 13, -0.4)).toBe(false)
    expect(section.ground.segments).toEqual([[0, 2.9], [11.1, 18]])
  })

  it('stops the ground line over the cellar where its roof stands out of the ground', () => {
    // With the ground 0.15 m lower, the cellar's roof under the garden (−0.25 to 0) stands out of it.
    const lower = planSection({ ...basementHouse(), site: { ground: -0.15 } }, ACROSS)
    expect(lower.parts.some((p) => p.kind === 'roof' && p.id === 'basement')).toBe(true)
    expect(lower.ground.segments).toEqual([[0, 2.9], [15.1, 18]])
    expect(inEarth(lower.ground.earth.pieces, 13, -0.2)).toBe(false)
  })

  it('stops the ground line and the earth at the line\'s ends, not a metre past the building', () => {
    expect(section.ground.segments[0]![0]).toBe(0)
    expect(section.ground.segments.at(-1)![1]).toBe(18)
    const xs = earth.pieces.flatMap((p) => p.outline.map((q) => q.x))
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(18)
    expect(earth.open).toEqual({ start: true, end: true })
  })

  it('marks the cellar walls with the outside on one face as holding the earth back', () => {
    const retaining = section.parts.filter((p) => p.retaining === true).map((p) => p.id)
    expect(retaining).toEqual(['b-s', 'b-n'])
  })

  it('runs out to a picture\'s edges when asked', () => {
    const wide = sectionEarth(section, -5, 23)
    expect(wide.segments).toEqual([[-5, 2.9], [11.1, 23]])
    const xs = wide.pieces.flatMap((p) => p.outline.map((q) => q.x))
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-5, 23])
    expect(areaOf(wide.pieces)).toBeCloseTo(areaOf(earth.pieces) + 10 * 4.2, 4)
  })

  it('stops at the cut\'s end where the line starts inside the cellar', () => {
    const inside = planSection(basementHouse(), { from: { x: 7, y: 6 }, to: { x: 7, y: 15 }, toward: 'left' })
    expect(inside.ground.earth.open).toEqual({ start: false, end: true })
    const wide = sectionEarth(inside, -5, 14)
    const xs = wide.pieces.flatMap((p) => p.outline.map((q) => q.x))
    // Under the cellar's slab it starts at the cut's end, not past it; past the cellar it runs out.
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 14])
    expect(wide.segments).toEqual([[2.1, 14]])
  })
})

describe('the earth under a house on its plinth', () => {
  const plan: FloorPlan = { ...flat(), site: { ground: -0.6 } }
  const section = planSection(plan, { from: { x: 7, y: -2 }, to: { x: 7, y: 10 }, toward: 'left' })

  it('is whole under it: the house stands on the ground, nothing is dug', () => {
    const { earth } = section.ground
    expect(earth.dug).toEqual([])
    expect(earth.bottom).toBeCloseTo(-1.6, 6)
    expect(areaOf(earth.pieces)).toBeCloseTo(12 * 1, 4)
    expect(section.ground.segments).toEqual([[0, 12]])
    expect(section.parts.some((p) => p.retaining === true)).toBe(false)
  })
})

describe('the earth under a house on the ground', () => {
  const section = planSection(flat(), { from: { x: 7, y: -2 }, to: { x: 7, y: 10 }, toward: 'left' })

  it('goes a metre under its slab and leaves the slab out', () => {
    const { earth } = section.ground
    expect(earth.bottom).toBeCloseTo(-1.25, 6)
    expect(areaOf(earth.pieces)).toBeCloseTo(12 * 1.25 - 8.2 * 0.25, 4)
    expect(section.ground.segments).toEqual([[0, 1.9], [10.1, 12]])
  })
})
