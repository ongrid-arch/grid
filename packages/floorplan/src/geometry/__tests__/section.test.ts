/**
 * LVL-9: a section along a line, drawn from the model (lab SE-5, N-section). The cut parts join
 * into connected shapes, the levels are the plan's, and what the plan does not state is hatched and
 * listed.
 */
import { describe, expect, it } from 'vitest'
import { labPlan } from '../../test-support/lab'
import { edit, stairHouse, twoFloorHouse } from '../../test-support/plans'
import { planStairs } from '../stairs'
import { brokenOnFloor } from '../validate'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { levelText, planSection, sectionFrame, type PlanSection, type SectionLine } from '../section'
import { drawingMarks } from '../drawingMarks'
import { planFacade } from '../facade'
import { buildFloorPlan } from '../floorplan'
import { planForFloor } from '../floors'
import { signedArea } from '../vec2'

/** The lab's townhouse (A/scenarios/townhouse.json): three floors, a stair room on each, no stated stair. */
const townhouse = (): FloorPlan => labPlan('A/scenarios/townhouse.json')
/** Down the middle of its stair rooms (x 4.3 to 5.5, y 3.5 to 7.5), from the street to the garden, looking west. */
const THROUGH_STAIR: SectionLine = { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 13 }, toward: 'left' }

const area = (section: PlanSection): number => section.cut.reduce((sum, p) => sum + Math.abs(signedArea(p.outline)) - p.holes.reduce((h, ring) => h + Math.abs(signedArea(ring)), 0), 0)
const ringsArea = (rings: readonly (readonly { x: number; y: number }[])[]): number => rings.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0)

describe('a section through the townhouse stair (lab SE-5)', () => {
  const section = planSection(townhouse(), THROUGH_STAIR)

  it('cuts twelve walls, three slabs and the roof, one by one', () => {
    const walls = section.parts.filter((p) => p.kind === 'wall')
    expect(walls.map((p) => p.id)).toEqual(['g-s', 'g-n', 'g-cs', 'g-cn', 'f-s', 'f-n', 'f-cs', 'f-cn', 't-s', 't-n', 't-cs', 't-cn'])
    expect(walls.every((p) => p.rings.length === 1)).toBe(true)
    expect(section.parts.filter((p) => p.kind === 'slab').map((p) => p.id)).toEqual(['ground', 'first', 'second'])
    expect(section.parts.filter((p) => p.kind === 'roof').map((p) => p.id)).toEqual(['second'])
    // The rectangles cut, one per wall and per piece of slab: the twelve-and-more of SE-5.
    expect(section.parts.flatMap((p) => p.rings).length).toBeGreaterThanOrEqual(16)
  })

  it('joins them into one connected shape, not twelve separate rectangles', () => {
    expect(section.cut).toHaveLength(1)
    // The rooms the walls and slabs close round are its holes: three floors of three rooms cut, less
    // the stairwell, which is open from the ground floor to the roof (LVL-4's opening over a stair room).
    expect(section.cut[0]!.holes).toHaveLength(7)
    // Joined, nothing is lost or counted twice.
    const parts = ringsArea(section.parts.flatMap((p) => p.rings))
    expect(area(section)).toBeCloseTo(parts, 6)
  })

  it('stands each floor\'s walls on its slab and under the slab or roof above', () => {
    const wall = (id: string) => section.parts.find((p) => p.id === id)!.rings[0]!
    const slab = (id: string) => section.parts.find((p) => p.kind === 'slab' && p.id === id)!.rings
    const ys = (ring: readonly { y: number }[]) => [Math.min(...ring.map((p) => p.y)), Math.max(...ring.map((p) => p.y))]
    expect(ys(wall('g-s'))).toEqual([0, 2.7])
    expect(ys(slab('first')[0]!)).toEqual([2.7, 2.95])
    expect(ys(wall('f-s'))[0]).toBe(2.95)
    expect(ys(section.parts.find((p) => p.kind === 'roof')!.rings[0]!)[0]).toBe(ys(wall('t-s'))[1])
  })

  it('says which side of each outside wall cut is outside, and runs the ground past the building', () => {
    expect(section.parts.find((p) => p.id === 'g-s')!.outside).toBe('left')
    expect(section.parts.find((p) => p.id === 'g-n')!.outside).toBe('right')
    expect(section.parts.find((p) => p.id === 'g-cs')!.outside).toBeNull()
    // The outline runs from y = -0.15 to 11.15: 1.85 to 13.15 across the section, and the ground
    // runs to the line's ends, past the building.
    expect(section.ground.segments).toEqual([[0, 1.85], [13.15, 15]])
  })

  it('looks the other way when asked: the picture is mirrored', () => {
    const back = planSection(townhouse(), { ...THROUGH_STAIR, toward: 'right' })
    expect(back.parts.find((p) => p.id === 'g-s')!.outside).toBe('right')
    expect(back.cut).toHaveLength(1)
    expect(back.look).toEqual({ x: 1, y: -0 })
  })

  it('draws what lies beyond the cut farthest first', () => {
    expect(section.beyond.length).toBeGreaterThan(0)
    for (let i = 1; i < section.beyond.length; i++) expect(section.beyond[i - 1]!.depth).toBeGreaterThanOrEqual(section.beyond[i]!.depth)
    // Looking west from x = 4.9, the stair room's far wall (g-stw at x = 4.3) is seen, 0.55 m away.
    const stw = section.beyond.find((f) => f.id === 'g-stw' && f.edge === null)!
    expect(stw.depth).toBeCloseTo(0.55, 9)
  })

  it('gives each room cut its own height, from its floor', () => {
    const kitchen = section.rooms.find((r) => r.room === 'g-rear')!
    expect(kitchen).toMatchObject({ floor: 'ground', floorLevel: 0, height: 2.7, heightStated: false })
    expect(section.rooms.find((r) => r.room === 'f-rear')).toMatchObject({ floorLevel: 2.95, height: 2.9 })
  })

  it('lists the stair rooms with no stated stair, and draws no flight in them', () => {
    expect(section.parts.some((p) => p.kind === 'stair')).toBe(false)
    expect(section.assumed.find((a) => a.kind === 'no-stair')!.ids).toEqual(['g-stair', 'f-stair', 't-stair'])
  })
})

describe('a section through a stated stair (LVL-3)', () => {
  const plan = stairHouse()
  // Along the walking line, from the hall's front wall to the back of the house, looking east.
  const section = planSection(plan, { from: { x: 0.6, y: -1 }, to: { x: 0.6, y: 9 }, toward: 'right' })

  it('cuts the flight tread by tread, joined to the slabs it stands on and rises to', () => {
    const stair = section.parts.find((p) => p.kind === 'stair')!
    expect(stair.id).toBe('s1')
    // VEW-11: one shape for the flight, its top a step up at every riser line.
    expect(stair.rings).toHaveLength(1)
    const ring = stair.rings[0]!
    expect(signedArea(ring)).toBeGreaterThan(0)
    const laid = planStairs(plan, brokenOnFloor).stairs[0]!
    const treads = [...new Set(ring.map((p) => p.y))].filter((y) => Math.abs(y / laid.riserHeight - Math.round(y / laid.riserHeight)) < 1e-4 && y > 0)
    expect(treads).toHaveLength(laid.risers - 1)
    expect(section.cut).toHaveLength(1)
  })

  it('draws the flight over a waist with the soffit beneath, never solid to the floor (VEW-11)', () => {
    const ring = section.parts.find((p) => p.kind === 'stair')!.rings[0]!
    const laid = planStairs(plan, brokenOnFloor).stairs[0]!
    const { riserHeight: riser, going } = laid
    // Across the section x runs back along the walking line: the foot at x = 8.4, the top at 5.6.
    const footX = Math.max(...ring.map((p) => p.x))
    const lowAt = (x: number) => Math.min(...ring.filter((p) => Math.abs(p.x - x) < 1e-3).map((p) => p.y))
    // Halfway up the flight the underside stands well off the floor, at the soffit.
    const s = 7 * going
    const soffit = s * (riser / going) - 0.15 * Math.hypot(1, riser / going)
    expect(lowAt(footX - s)).toBeCloseTo(soffit, 4)
    expect(lowAt(footX - s)).toBeGreaterThan(1)
    // Square to the slope, the flight is the waist thick under the roots of its steps.
    const rootAt = (sAlong: number) => sAlong * (riser / going)
    const square = (rootAt(s) - lowAt(footX - s)) / Math.hypot(1, riser / going)
    expect(square).toBeCloseTo(0.15, 4)
    // The underside is one straight line from the foot to the top, the soffit.
    const bottom = ring.filter((p) => p.y < rootAt(footX - p.x) - 1e-6 && p.y > 0)
    const slopes = bottom.slice(1).map((p, i) => (p.y - bottom[i]!.y) / (p.x - bottom[i]!.x))
    for (const slope of slopes) expect(slope).toBeCloseTo(-riser / going, 3)
    // Nothing of the stair is cut under its soffit: a point under the middle of the flight is open.
    const under = { x: footX - s, y: 0.5 }
    expect(section.cut.some((piece) => solidAt(piece, under))).toBe(false)
  })

  it('lists the waist it takes, which the plan does not state (VEW-11)', () => {
    const waist = section.assumed.find((a) => a.kind === 'waist')!
    expect(waist).toMatchObject({ ids: ['s1'], hatched: false })
    expect(waist.words).toContain('0.15 m')
  })

  it('cuts one tread slice across the flight, from the soffit to the tread', () => {
    const across = planSection(plan, { from: { x: -1, y: 2 }, to: { x: 3, y: 2 }, toward: 'right' })
    const laid = planStairs(plan, brokenOnFloor).stairs[0]!
    const { riserHeight: riser, going } = laid
    const ring = across.parts.find((p) => p.kind === 'stair')!.rings[0]!
    expect(ring).toHaveLength(4)
    const s = 2 - 0.6
    const top = Math.max(...ring.map((p) => p.y))
    const low = Math.min(...ring.map((p) => p.y))
    expect(top).toBeCloseTo((Math.floor(s / going) + 1) * riser, 5)
    expect(low).toBeCloseTo(s * (riser / going) - 0.15 * Math.hypot(1, riser / going), 5)
  })

  it('lists the risers Grid worked out', () => {
    expect(section.assumed.find((a) => a.kind === 'risers')!.ids).toEqual(['s1'])
  })

  it('draws no line from the floor at the foot up to the top along the flight, so no box closes under it (VEW-69)', () => {
    const laid = planStairs(plan, brokenOnFloor).stairs[0]!
    const lines = section.beyond.filter((f) => f.kind === 'stair' && f.edge !== null).map((f) => f.edge!)
    // Each line beyond the flight is its top end at most: a riser and a waist tall, never the flight's rise.
    for (const [a, b] of lines) expect(Math.abs(b.y - a.y)).toBeLessThan(laid.riserHeight + 0.4)
  })

  it('draws the risers of a flight seen at an angle stepping up and away, not as a box on the floor at its foot (VEW-69)', () => {
    // South-west of the stair, looking north-east at its foot and its west side.
    const line: SectionLine = { from: { x: -4, y: 0 }, to: { x: 1, y: -5 }, toward: 'left' }
    const seen = planSection(plan, line).beyond.filter((f) => f.kind === 'stair' && f.edge === null)
    const laid = planStairs(plan, brokenOnFloor).stairs[0]!
    const frame = sectionFrame(line)
    const foot = laid.flights[0]!.from
    const x = (foot.x - frame.start.x) * frame.right.x + (foot.y - frame.start.y) * frame.right.y
    // Over the middle of the foot, the first risers stand, and higher up nothing of the stair does.
    expect(seen.some((f) => f.pieces.some((p) => solidAt(p, { x, y: laid.riserHeight / 2 })))).toBe(true)
    expect(seen.some((f) => f.pieces.some((p) => solidAt(p, { x, y: laid.rise * 0.8 })))).toBe(false)
  })
})

describe('a section through a stair that turns at a landing (VEW-11)', () => {
  const plan = edit(stairHouse(), (copy) => {
    copy.stairs![0]!.run = [[0.6, 0.6], [0.6, 2.4], [2.2, 2.4]]
  })
  const laid = planStairs(plan, brokenOnFloor).stairs[0]!
  // Along the first flight, through the landing, looking east.
  const section = planSection(plan, { from: { x: 0.6, y: -1 }, to: { x: 0.6, y: 9 }, toward: 'right' })

  it('draws the landing as a slab and the flight joined to it, open beneath both', () => {
    expect(laid.landings).toHaveLength(1)
    const level = laid.landings[0]!.risersBelow * laid.riserHeight
    const stair = section.parts.find((p) => p.kind === 'stair')!
    const landing = stair.rings.find((ring) => ring.length === 4 && Math.max(...ring.map((p) => p.y)) === Math.round(level * 1e6) / 1e6)!
    expect(landing).toBeDefined()
    expect(Math.min(...landing.map((p) => p.y))).toBeCloseTo(level - Math.max(0.15, laid.riserHeight), 5)
    // The flight and its landing are one shape.
    const pieces = section.cut.filter((piece) => piece.outline.some((p) => Math.abs(p.y - level) < 1e-5))
    expect(pieces).toHaveLength(1)
    // Under the landing is open, down to the floor.
    const middle = { x: (Math.min(...landing.map((p) => p.x)) + Math.max(...landing.map((p) => p.x))) / 2, y: level / 2 }
    expect(section.cut.some((piece) => solidAt(piece, middle))).toBe(false)
  })

  it('shows the second flight beyond the cut by its side, its profile', () => {
    // North of the stair, looking south at the second flight's side.
    const facing = planSection(plan, { from: { x: 3, y: 4 }, to: { x: -1, y: 4 }, toward: 'left' })
    const sides = facing.beyond.filter((f) => f.kind === 'stair' && f.pieces.length === 1 && f.pieces[0]!.outline.length > 8)
    expect(sides.length).toBeGreaterThan(0)
  })

  it('draws a flight seen from its foot as one face, not one column per riser (VEW-41)', () => {
    for (const toward of ['left', 'right'] as const) {
      const seen = planSection(plan, { from: { x: -1, y: 0 }, to: { x: 3, y: 0 }, toward }).beyond.filter((f) => f.kind === 'stair')
      // Whichever way it looks, the flights give their sides, their top end and at most one riser face.
      expect(seen.filter((f) => f.edge === null && f.pieces[0]!.outline.length === 4).length).toBeLessThanOrEqual(3)
      expect(seen.length).toBeLessThan(10)
    }
  })
})

describe('the levels of a section (LVL-9 done-when 2)', () => {
  const stated = (): FloorPlan => ({
    ...twoFloorHouse(),
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0, elevation: 0, slab: 0.3, height: 2.6 },
      { id: 'first', name: 'First floor', level: 1, elevation: 3.1, slab: 0.3, height: 2.5 }
    ],
    site: { ground: -0.45 }
  })
  const line: SectionLine = { from: { x: 2, y: -2 }, to: { x: 2, y: 10 }, toward: 'left' }

  it('stands every level mark at the level the plan states', () => {
    const section = planSection(parseFloorPlan(stated()), line)
    expect(section.levels.map((l) => [l.floor, l.level, l.source])).toEqual([['ground', 0, 'stated'], ['first', 3.1, 'stated']])
    expect(section.levels.map((l) => levelText(l.level))).toEqual(['±0.000', '+3.100'])
    expect(section.ground).toMatchObject({ level: -0.45, stated: true })
  })

  it('hatches nothing and lists no level, slab or ground the plan states', () => {
    const section = planSection(parseFloorPlan(stated()), line)
    // VEW-33: the ground floor's walls (2.70 m) stop 0.10 m short of the first floor's slab (3.10 less 0.30):
    // drawn up to it, and listed, since the plan's levels leave that gap.
    expect(section.assumed.map((a) => a.kind)).toEqual(['roof', 'wall-top', 'room-height'])
    expect(section.assumed.find((a) => a.kind === 'wall-top')!.words).toContain('stop short of the slab of "First floor" over them, by up to 0.10 m')
    // The slab the floor states is cut at its own thickness.
    const slab = section.parts.find((p) => p.kind === 'slab' && p.id === 'first')!.rings[0]!
    expect(Math.min(...slab.map((p) => p.y))).toBeCloseTo(2.8, 9)
  })

  it('works out the levels a plan does not state, and lists each one with the slabs and the roof it took', () => {
    const section = planSection(townhouse(), THROUGH_STAIR)
    expect(section.levels.map((l) => [l.floor, l.level, l.source])).toEqual([['ground', 0, 'datum'], ['first', 2.95, 'worked-out'], ['second', 6.1, 'worked-out']])
    expect(section.assumed.filter((a) => a.kind === 'level').map((a) => a.ids[0])).toEqual(['first', 'second'])
    const hatched = section.assumed.filter((a) => a.hatched)
    expect(hatched.map((a) => `${a.kind}:${a.ids.join(',')}`)).toEqual(['slab:ground', 'slab:first', 'slab:second', 'roof:second'])
    // Each hatches exactly what it is about: the slab's or the roof's cut pieces.
    for (const a of hatched) {
      const part = section.parts.find((p) => p.kind === a.kind && p.id === a.ids[0])!
      expect(a.pieces.reduce((sum, p) => sum + Math.abs(signedArea(p.outline)), 0)).toBeCloseTo(ringsArea(part.rings), 6)
    }
    expect(section.assumed.find((a) => a.kind === 'ground')!.words).toBe('The ground is taken at ±0.000, the ground floor\'s level: the site states no ground level.')
    expect(section.assumed.find((a) => a.kind === 'roof')!.words).toBe('The roof over "Second floor" is taken as flat and 0.25 m thick, on its walls: the plan states no roof.')
  })

  it('uses the room\'s own height, not the storey\'s tallest wall', () => {
    const plan = stated()
    const lower = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'hall' ? { ...r, height: 2.4 } : r)) }
    const section = planSection(parseFloorPlan(lower), line)
    expect(section.rooms.find((r) => r.room === 'hall')).toMatchObject({ height: 2.4, heightStated: true })
    expect(section.rooms.find((r) => r.room === 'bedroom')).toMatchObject({ height: 2.6, heightStated: false })
  })

  it('hatches and lists walls whose height nothing states', () => {
    const plan = twoFloorHouse()
    const bare = parseFloorPlan({ ...plan, walls: plan.walls.map((w) => Object.fromEntries(Object.entries(w).filter(([key]) => key !== 'height'))) })
    const section = planSection(bare, line)
    const walls = section.assumed.filter((a) => a.kind === 'wall-height')
    expect(walls.map((a) => a.hatched)).toEqual([true, true])
    expect(walls[0]!.ids).toEqual(['s1', 'n2', 'hb'])
  })
})

describe('a section under a roof the floor states (after LVL-6)', () => {
  /** The lab's converted loft with the gable its walls show, as LVL-6's tests state it. */
  const loft = (roof: Record<string, unknown>): FloorPlan => {
    const raw = JSON.parse(JSON.stringify(labPlan('A/scenarios/loft-sloped.json'))) as { floors: { id: string }[] }
    for (const f of raw.floors) if (f.id === 'attic') Object.assign(f, { roof })
    return parseFloorPlan(raw)
  }
  const ACROSS_RIDGE: SectionLine = { from: { x: 2, y: -1 }, to: { x: 2, y: 7 }, toward: 'left' }

  it('says a sloped roof is drawn on its slopes, not that the plan states no roof', () => {
    const roof = planSection(loft({ shape: 'gable', eaves: 1, ridge: 3.6, ridgeRuns: 'east-west' }), ACROSS_RIDGE).assumed.find((a) => a.kind === 'roof')
    expect(roof?.words).toBe('The roof over "Attic (converted loft)" is drawn on its slopes, as the floor states it (a gable roof), and taken as 0.25 m thick.')
    expect(roof?.hatched).toBe(true)
  })

  it('says a stated flat roof is the floor\'s, with Grid\'s thickness', () => {
    const roof = planSection(loft({ shape: 'flat', eaves: 2.6 }), ACROSS_RIDGE).assumed.find((a) => a.kind === 'roof')
    expect(roof?.words).toBe('The roof over "Attic (converted loft)" is drawn flat at its eaves, as the floor states it, and taken as 0.25 m thick.')
  })
})

describe('a line that cuts nothing', () => {
  it('gives the ground along the line and nothing else', () => {
    const section = planSection(townhouse(), { from: { x: 20, y: 5 }, to: { x: 30, y: 5 }, toward: 'left' })
    expect(section.parts).toEqual([])
    expect(section.cut).toEqual([])
    expect(section.ground.segments).toEqual([[0, 10]])
  })
})

describe('the marks on a plan', () => {
  const plan = townhouse()
  const drawing = buildFloorPlan(planForFloor(plan, 'first'))
  const around = drawing.bounds

  it('marks the section\'s line and the way it looks', () => {
    const marks = drawingMarks(plan, 'first', drawing, around, { section: THROUGH_STAIR })
    expect(marks.section).toEqual({ from: THROUGH_STAIR.from, to: THROUGH_STAIR.to, look: sectionFrame(THROUGH_STAIR).look, label: 'A' })
    expect(marks.elevations).toEqual([])
    expect(marks.levels).toEqual([])
  })

  it('stands an elevation mark outside each side, named by the way it faces', () => {
    const marks = drawingMarks(plan, 'first', drawing, around, { elevations: true })
    expect(marks.elevations.map((m) => m.faces)).toEqual(['south', 'east', 'north', 'west'])
    expect(marks.elevations.every((m) => !m.northStated)).toBe(true)
    // Outside what the picture frames, looking back at the building.
    const south = marks.elevations[0]!
    expect(south.at.y).toBeLessThan(around.min.y)
    expect(south.look).toEqual({ x: -0, y: 1 })
    // With north stated a quarter turn to the left, the top of the drawing faces east.
    const turned = drawingMarks({ ...plan, north: 90 }, 'first', drawing, around, { elevations: true })
    expect(turned.elevations.map((m) => m.faces)).toEqual(['west', 'south', 'east', 'north'])
  })

  it('names the facade that draws each side, the drawing\'s side whatever north the plan states (LVL-8)', () => {
    const marks = drawingMarks(plan, 'first', drawing, around, { elevations: true })
    expect(marks.elevations.map((m) => m.facade)).toEqual(['south', 'east', 'north', 'west'])
    const turned = drawingMarks({ ...plan, north: 90 }, 'first', drawing, around, { elevations: true })
    expect(turned.elevations.map((m) => m.facade)).toEqual(['south', 'east', 'north', 'west'])
    // Each mark looks at the walls that facade draws: the one it names shows a wall the mark faces.
    for (const mark of marks.elevations) expect(planFacade(plan, mark.facade).walls.length).toBeGreaterThan(0)
  })

  it('marks each room\'s floor level, worked out when the floor states none', () => {
    const marks = drawingMarks(plan, 'first', drawing, around, { levels: true })
    expect(marks.levels.map((m) => m.room).sort()).toEqual(drawing.rooms.map((r) => r.id).sort())
    expect(marks.levels.every((m) => m.level === 2.95 && !m.stated)).toBe(true)
  })
})

/** Whether a point of the section is inside a cut piece: in its outline and in none of its holes. */
function solidAt(piece: { outline: readonly { x: number; y: number }[]; holes: readonly (readonly { x: number; y: number }[])[] }, p: { x: number; y: number }): boolean {
  return contains(piece.outline, p) && !piece.holes.some((hole) => contains(hole, p))
}

/** Whether a point is inside a ring (even-odd), off its edges. */
function contains(ring: readonly { x: number; y: number }[], p: { x: number; y: number }): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

describe('a level written in a display (VEW-20)', () => {
  it('keeps the sign and the datum in every unit, with the display\'s decimal mark', () => {
    expect(levelText(94.9)).toBe('+94.900')
    expect(levelText(-2.6)).toBe('−2.600')
    expect(levelText(94.9, { length: 'mm', area: 'm2', decimal: 'point' })).toBe('+94900')
    expect(levelText(94.9, { length: 'cm', area: 'm2', decimal: 'comma' })).toBe('+9490,0')
    expect(levelText(0.0001, { length: 'mm', area: 'm2', decimal: 'point' })).toBe('±0')
    expect(levelText(3.2, { length: 'ft-in', area: 'ft2', decimal: 'point' })).toBe('+10\'-6"')
    expect(levelText(-3.2, { length: 'ft-in', area: 'ft2', decimal: 'point' })).toBe('−10\'-6"')
  })
})

describe('a glazed wall type in section (VEW-23)', () => {
  const plan = (): FloorPlan =>
    edit(twoFloorHouse(), (p) => {
      p.types = { walls: [{ id: 'curtain', name: 'Curtain wall', thickness: 0.15, glazed: true }, { id: 'precast', name: 'Precast', thickness: 0.15 }] }
      for (const w of p.walls) if (w.id === 's1' || w.id === 's2') w.wallType = 'curtain'
      for (const w of p.walls) if (w.id === 'n1' || w.id === 'n2') w.wallType = 'precast'
    })
  const line: SectionLine = { from: { x: 3, y: -2 }, to: { x: 3, y: 10 }, toward: 'left' }

  it('lists a glazed wall apart from the solid cut and keeps a solid wall solid', () => {
    const section = planSection(plan(), line)
    const walls = section.parts.filter((p) => p.kind === 'wall')
    const glazed = walls.filter((p) => p.glazed === true).map((p) => p.id)
    expect(glazed.length).toBeGreaterThan(0)
    expect(glazed.every((id) => id.startsWith('s'))).toBe(true)
    expect(section.glass.map((p) => p.id)).toEqual(glazed)
    expect(walls.some((p) => p.glazed !== true && p.id.startsWith('n'))).toBe(true)
    expect(ringsArea(section.glass.flatMap((p) => p.rings))).toBeGreaterThan(0)
  })

  it('leaves the glazed wall out of the solid cut', () => {
    const all = planSection(edit(plan(), (p) => { delete p.types }), line)
    expect(all.glass).toEqual([])
    expect(area(planSection(plan(), line))).toBeLessThan(area(all))
  })
})

describe('where a section line stands against the building (VEW-38)', () => {
  const plan = townhouse()
  it('misses the building when it runs over open ground', () => {
    const section = planSection(plan, { from: { x: 40, y: -2 }, to: { x: 40, y: 13 }, toward: 'left' })
    expect(section.reach).toEqual({ missesBuilding: true, startInside: false, endInside: false })
  })
  it('is neither missing nor ending inside when it runs past the building at both ends', () => {
    expect(planSection(plan, THROUGH_STAIR).reach).toEqual({ missesBuilding: false, startInside: false, endInside: false })
  })
  it('ends inside the building when its last point stands in a room', () => {
    const section = planSection(plan, { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 5 }, toward: 'left' })
    expect(section.reach).toEqual({ missesBuilding: false, startInside: false, endInside: true })
  })
  it('starts inside the building when its first point stands in a room', () => {
    const section = planSection(plan, { from: { x: 4.9, y: 5 }, to: { x: 4.9, y: 13 }, toward: 'left' })
    expect(section.reach.startInside).toBe(true)
    expect(section.reach.endInside).toBe(false)
  })
})

describe('walls, slabs and a stair near them join as one outline (VEW-57)', () => {
  /** The stair's side stands `gap` from the hall's west wall (its inner face is at x 0.1). */
  const cutWith = (gap: number) => {
    const plan = edit(stairHouse(), (copy) => {
      copy.stairs![0]!.run = [[0.55 + gap, 0.6], [0.55 + gap, 3.4]]
    })
    return planSection(plan, { from: { x: -1, y: 2 }, to: { x: 4, y: 2 }, toward: 'left' })
  }
  const small = (section: PlanSection) => section.cut.flatMap((p) => p.holes).filter((h) => Math.abs(signedArea(h)) < 1e-5)

  it('draws a stair a few centimetres off a wall touching it', () => {
    const touching = cutWith(0).cut.length
    expect(cutWith(0.02).cut).toHaveLength(touching)
    expect(cutWith(0.04).cut).toHaveLength(touching)
  })

  it('leaves a stair well clear of the wall apart from it', () => {
    expect(cutWith(0.2).cut.length).toBeGreaterThan(cutWith(0).cut.length)
  })

  it('leaves no hole too small to be a room', () => {
    for (const gap of [0, 0.02, 0.04]) expect(small(cutWith(gap))).toEqual([])
  })
})
