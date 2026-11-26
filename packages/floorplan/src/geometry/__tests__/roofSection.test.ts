/**
 * LVL-20: sloped roofs cut in sections, the walls under them cut and raised to them, dormers, and the
 * headroom given along the line.
 *
 * The box: one room, 8 × 6 m on its walls' lines (0.3 m outside walls stated exterior and 2.4 m
 * high, so 7.7 × 5.7 m inside), on a floor that states a gable from 2.4 m eaves on the south and
 * north walls (y = 0 and y = 6) to a 4.4 m ridge over y = 3: a rise of 2 m over 3 m, 2/3 a metre.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { validatePlan } from '../validate'
import { planSection, type PlanSection } from '../section'
import { dormerPlace, floorRoofShape, roofUnderside, roomHeadroom, undersideAlong, wallPeak, wallTopProfile } from '../roofs'
import { buildScene } from '../scene3d'
import type { Vec2 } from '../vec2'

type Raw = Record<string, unknown>

function box(roof: Raw, extra: { kind?: string; height?: number; walls?: Raw[]; openings?: Raw[] } = {}): FloorPlan {
  const wall = (id: string, start: number[], end: number[]): Raw => ({ id, start, end, thickness: 0.3, kind: extra.kind ?? 'exterior', height: extra.height ?? 2.4 })
  return parseFloorPlan({
    floors: [{ id: 'ground', name: 'Loft', level: 0, roof }],
    walls: [wall('s', [0, 0], [8, 0]), wall('e', [8, 0], [8, 6]), wall('n', [8, 6], [0, 6]), wall('w', [0, 6], [0, 0]), ...(extra.walls ?? [])],
    rooms: [{ id: 'r', name: 'Loft room', boundary: ['s', 'e', 'n', 'w'], use: 'bedroom' }],
    openings: extra.openings ?? []
  })
}

const GABLE = { shape: 'gable', eaves: 2.4, ridge: 4.4, ridgeRuns: 'east-west' }

/** The highest point of the cut over x, from the cut's outlines (their edges crossing x). */
function cutTopAt(section: PlanSection, x: number): number {
  let top = -Infinity
  for (const piece of section.cut) {
    const ring = piece.outline
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) {
        if (a.x === x) top = Math.max(top, a.y)
        continue
      }
      top = Math.max(top, a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x))
    }
  }
  return top
}

const partsOf = (section: PlanSection, kind: string, id?: string): Vec2[][] =>
  section.parts.filter((p) => p.kind === kind && (id === undefined || p.id === id)).flatMap((p) => p.rings.map((r) => [...r]))
const ys = (rings: readonly (readonly Vec2[])[]): number[] => rings.flat().map((p) => p.y)

describe('a section through a sloped roof (LVL-20)', () => {
  // Across the ridge, at x = 4, looking east: the picture's x runs along the line, from y = -2.
  const across = (plan: FloorPlan): PlanSection => planSection(plan, { from: { x: 4, y: -2 }, to: { x: 4, y: 8 }, toward: 'right' })

  it('cuts a gable on its slopes from the eaves to the ridge, with no flat slab and no wall above the roof', () => {
    const section = across(box(GABLE))
    const roof = partsOf(section, 'roof')
    expect(roof.length).toBeGreaterThan(1)
    // The roof's underside is never level across the room: it runs from the eaves to the ridge.
    const bottom = Math.min(...ys(roof))
    const top = Math.max(...ys(roof))
    expect(bottom).toBeLessThan(2.4)
    expect(top).toBeGreaterThan(4.4)
    expect(top).toBeLessThan(4.4 + 0.25 * 1.21 + 0.01)
    // Halfway up the south slope (1.5 m in from the south wall's line), the roof is cut at 3.4 m.
    const looking = section.right
    const xAt = (y: number): number => (looking.y > 0 ? y + 2 : 8 - y)
    expect(cutTopAt(section, xAt(1.5))).toBeCloseTo(3.4 + 0.25 * Math.sqrt(1 + (2 / 3) ** 2), 2)
    // The walls cut stand under the roof: none rises past the underside over its line.
    for (const ring of partsOf(section, 'wall')) expect(Math.max(...ring.map((p) => p.y))).toBeLessThanOrEqual(2.4 + 0.15 * (2 / 3) + 0.01)
    expect(section.roofs).toEqual([{ floor: 'ground', level: expect.any(Number), shape: 'gable', pitch: expect.closeTo((Math.atan(2 / 3) * 180) / Math.PI, 6), eaves: 2.4, ridge: 4.4 }])
    const roofNote = section.assumed.find((a) => a.kind === 'roof')!
    expect(roofNote.words).toBe('The roof over "Loft" is drawn on its slopes, as the floor states it (a gable roof), and taken as 0.25 m thick.')
    expect(roofNote.words).not.toContain('not draw')
  })

  it('sees the gable end beyond as a pentagon up to the ridge', () => {
    const section = across(box(GABLE))
    // Looking east, the east wall's inside face is beyond the cut.
    const gable = section.beyond.filter((f) => f.kind === 'wall' && f.id === 'e' && f.edge === null)
    expect(gable.length).toBeGreaterThan(0)
    const points = gable.flatMap((f) => f.pieces.flatMap((p) => p.outline))
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(4.4 - 0.15 * 0, 1)
    // Its top is no level line at 2.4 m: it rises to the ridge.
    expect(points.filter((p) => p.y > 2.5).length).toBeGreaterThan(0)
  })

  it('cuts the roof level at the ridge along it', () => {
    const along = planSection(box(GABLE), { from: { x: -2, y: 3 }, to: { x: 10, y: 3 }, toward: 'left' })
    const roof = partsOf(along, 'roof')
    expect(Math.min(...ys(roof))).toBeCloseTo(4.4, 2)
    // The gable ends cut along the ridge stand to it.
    for (const id of ['e', 'w']) expect(Math.max(...ys(partsOf(along, 'wall', id)))).toBeCloseTo(4.4, 2)
  })

  it('cuts a hip and a mono-pitch roof on their slopes', () => {
    const hip = across(box({ shape: 'hip', eaves: 2.4, pitch: 30 }))
    expect(Math.max(...ys(partsOf(hip, 'roof')))).toBeGreaterThan(2.4 + Math.tan(Math.PI / 6) * 3 - 0.01)
    const mono = across(box({ shape: 'mono-pitch', eaves: 2.4, ridge: 3.1, highSide: 'north' }))
    const roof = partsOf(mono, 'roof')
    expect(Math.min(...ys(roof))).toBeLessThan(2.4)
    expect(Math.max(...ys(roof))).toBeGreaterThan(3.1)
    // The north wall, under the high side, rises to the roof: it no longer stops at 2.4 m.
    expect(Math.max(...ys(partsOf(mono, 'wall', 'n')))).toBeGreaterThan(3.0)
  })

  it('gives the rooms under the roof their headroom along the line and one height', () => {
    const plan = box(GABLE)
    const section = across(plan)
    const room = section.rooms.find((r) => r.room === 'r')!
    const measured = roomHeadroom(plan, 'r')!
    expect(room.height).toBeCloseTo(measured.highest, 2)
    expect(room.height).toBeCloseTo(4.4, 2)
    // 1.5 m and 2.2 m headroom bands: the underside reaches 2.2 m from 2.4 m eaves everywhere in
    // the room (its faces stand 0.15 m in, at 2.5 m), so both bands span the room's floor.
    expect(room.headroom!.map((h) => h.height)).toEqual([1.5, 2.2])
    for (const band of room.headroom!) {
      expect(band.from).toBeCloseTo(room.from, 2)
      expect(band.to).toBeCloseTo(room.to, 2)
    }
    // Under a 1.0 m eaves, the 1.5 m band starts 0.75 m in from the wall's line, 2.2 m at 1.8 m.
    const low = across(box({ shape: 'gable', eaves: 1, ridge: 3, ridgeRuns: 'east-west' }, { height: 1 }))
    const bands = low.rooms[0]!.headroom!
    const width = (h: number): number => bands.filter((b) => b.height === h).reduce((sum, b) => sum + b.to - b.from, 0)
    expect(width(1.5)).toBeCloseTo(6 - 2 * 0.75, 2)
    expect(width(2.2)).toBeCloseTo(6 - 2 * 1.8, 2)
  })

  it('lists the outside walls it raised to the roof past the height they state', () => {
    const section = across(box(GABLE, { height: 2.0 }))
    const note = section.assumed.find((a) => a.kind === 'wall-roof')!
    expect(note.ids).toEqual(['s', 'n'])
    expect(note.hatched).toBe(true)
    expect(note.words).toBe('2 walls cut on "Loft" rise to the roof over them, past the heights they state, as outside walls under a stated roof do ("s", "n").')
    // At the eaves height they state, no note.
    expect(across(box(GABLE)).assumed.some((a) => a.kind === 'wall-roof')).toBe(false)
  })
})

describe('outside walls meet the roof (LVL-20)', () => {
  it('closes a gable end whose walls state the eaves height, in the profile, the 3D model and the opening check', () => {
    const plan = box(GABLE)
    const profile = wallTopProfile(plan, plan.walls.find((w) => w.id === 'e')!)!
    expect(profile.map((p) => [Number(p.u.toFixed(6)), Number(p.z.toFixed(6))])).toEqual([[0, 2.4], [3, 4.4], [6, 2.4]])
    expect(wallPeak(plan, plan.walls.find((w) => w.id === 'e')!)).toBeCloseTo(4.4, 9)
    // The side walls stay at the eaves.
    expect(wallTopProfile(plan, plan.walls.find((w) => w.id === 's')!)).toBeNull()
    const scene = buildScene(plan)
    expect(scene.walls.find((w) => w.id === 'e')!.elevation.height).toBeCloseTo(4.4, 9)
    // A window in the gable above the eaves fits the gable, not the 2.4 m the wall states.
    const windowed = box(GABLE, { openings: [{ id: 'g', wall: 'e', type: 'window', offset: 2.5, width: 1, sill: 2.6, height: 1 }] })
    expect(validatePlan(windowed).issues.filter((i) => i.id === 'g')).toEqual([])
  })

  it('raises a mono-pitch extension\'s walls to the roof over them', () => {
    const plan = box({ shape: 'mono-pitch', eaves: 2.4, ridge: 3.1, highSide: 'north' })
    const north = plan.walls.find((w) => w.id === 'n')!
    expect(wallPeak(plan, north)).toBeCloseTo(3.1, 9)
    const side = wallTopProfile(plan, plan.walls.find((w) => w.id === 'e')!)!
    expect(side[0]!.z).toBeCloseTo(2.4, 9)
    expect(side[side.length - 1]!.z).toBeCloseTo(3.1, 9)
  })

  it('keeps an inside wall\'s own height, and names the gap over an outside wall not stated exterior', () => {
    const partition = { id: 'p', start: [4, 0], end: [4, 6], thickness: 0.1, kind: 'partition', height: 2.4 }
    const plan = box(GABLE, { walls: [partition] })
    expect(wallTopProfile(plan, plan.walls.find((w) => w.id === 'p')!)).toBeNull()
    const left = box(GABLE, { kind: 'interior' })
    const lines = validatePlan(left).issues.filter((i) => i.code === 'wall/under-roof')
    expect(lines.map((i) => i.id).sort()).toEqual(['e', 'w'])
    expect(lines[0]!.message).toBe(
      'Wall "e" stops under the roof over floor "Loft": it is 2.40 m high, and the roof\'s underside over it is at 2.40 to 4.40 m, so a gap of up to 2.00 m is left over it. A wall stated exterior rises to the roof: state its kind exterior, or give it the height that meets the roof'
    )
    expect(validatePlan(box(GABLE)).issues.filter((i) => i.code === 'wall/under-roof')).toEqual([])
  })
})

describe('dormers (LVL-20)', () => {
  // A box dormer on the south slope, its front 1 m in from the south wall's line (the roof 3.07 m
  // there), 2 m wide, with a 3.6 m ceiling: it runs back until the slope reaches 3.6 m, 1.8 m in.
  const dormer = { id: 'd1', shape: 'box', at: [4, 1], width: 2, height: 3.6 }

  it('places a box dormer on its slope and raises the underside under it', () => {
    const plan = box({ ...GABLE, dormers: [dormer] })
    const shape = floorRoofShape(plan, 'ground')!
    expect(shape.dormers).toHaveLength(1)
    expect(shape.dormers[0]!.depth).toBeCloseTo(0.8, 9)
    expect(roofUnderside(shape, { x: 4, y: 1.2 })).toBeCloseTo(3.6, 9)
    expect(roofUnderside(shape, { x: 6, y: 1.2 })).toBeCloseTo(2.4 + (2 / 3) * 1.2, 9)
    const pieces = undersideAlong(shape, { x: 4, y: 0 }, { x: 4, y: 6 })
    expect(pieces.map((p) => [Number(p.from.toFixed(6)), Number(p.to.toFixed(6))])).toEqual([[0, 1], [1, 1.8], [1.8, 3], [3, 6]])
    expect(validatePlan(plan).issues.filter((i) => i.code.startsWith('floor/dormer')).map((i) => i.code)).toEqual(['floor/dormers-not-drawn'])
  })

  it('cuts the dormer in the section, its front rising from the slope', () => {
    const plan = box({ ...GABLE, dormers: [dormer] })
    const section = planSection(plan, { from: { x: 4, y: -2 }, to: { x: 4, y: 8 }, toward: 'left' })
    // Looking west from the line, x runs along it from y = -2: the dormer's front is at x = 3.
    expect(cutTopAt(section, 3.5)).toBeCloseTo(3.6 + 0.25, 2)
    expect(cutTopAt(section, 2.5)).toBeLessThan(3.4)
  })

  it('counts the floor under a dormer in the headroom bands', () => {
    const bare = roomHeadroom(box({ shape: 'gable', eaves: 1, ridge: 3, ridgeRuns: 'east-west' }, { height: 1 }), 'r')!
    const dormered = roomHeadroom(box({ shape: 'gable', eaves: 1, ridge: 3, ridgeRuns: 'east-west', dormers: [{ id: 'd', shape: 'box', at: [4, 0.6], width: 2, height: 2.4 }] }, { height: 1 }), 'r')!
    const at = (h: number, r: typeof bare): number => r.bands.find((b) => b.height === h)!.area
    expect(at(2.2, dormered)).toBeGreaterThan(at(2.2, bare) + 1)
    expect(dormered.highest).toBeCloseTo(bare.highest, 9)
  })

  it('gives a gable dormer its own ridge', () => {
    const plan = box({ ...GABLE, dormers: [{ id: 'g', shape: 'gable', at: [4, 1], width: 2, height: 3.2, pitch: 45 }] })
    const shape = floorRoofShape(plan, 'ground')!
    const place = shape.dormers[0]!
    expect(place.top).toBeCloseTo(4.2, 9)
    expect(roofUnderside(shape, { x: 4, y: 1.1 })).toBeCloseTo(4.2, 9)
    expect(roofUnderside(shape, { x: 3.5, y: 1.1 })).toBeCloseTo(3.7, 9)
  })

  it('leaves out a dormer with no place, and says why', () => {
    const shape = floorRoofShape(box(GABLE), 'ground')!
    const problem = (d: Raw): string | null => {
      const place = dormerPlace(shape, d as never)
      return 'problem' in place ? place.problem.key : null
    }
    expect(problem({ ...dormer, height: 2.6 })).toBe('issue.floor/dormer-misplaced.low')
    expect(problem({ ...dormer, at: [4, 2.9], height: 4.6 })).toBe('issue.floor/dormer-misplaced.acrossSlopes')
    expect(problem({ ...dormer, at: [7.5, 1] })).toBe('issue.floor/dormer-misplaced.outside')
    const flat = floorRoofShape(box({ shape: 'flat', eaves: 2.4 }), 'ground')!
    expect('problem' in dormerPlace(flat, dormer as never)).toBe(true)
    const plan = box({ ...GABLE, dormers: [{ ...dormer, height: 2.6 }] })
    const issues = validatePlan(plan).issues.filter((i) => i.code.startsWith('floor/dormer'))
    expect(issues.map((i) => [i.code, i.message])).toEqual([
      ['floor/dormer-misplaced', 'Dormer "d1" in the roof over floor "Loft" is no higher than the roof at its front, so it would not stand out of the slope: it is left out']
    ])
  })

  it('refuses a dormer the schema cannot read, by its field', () => {
    expect(() => box({ ...GABLE, dormers: [{ at: [6, 0.6], width: 1.8 }] })).toThrow()
  })
})
