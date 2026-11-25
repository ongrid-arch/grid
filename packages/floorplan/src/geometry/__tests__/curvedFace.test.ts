/**
 * CNT-32: a curved wall placed by its face (HND-11 with CNT-18) is written back round its own
 * curve, so a bow-fronted room surveyed on its inside faces reads as taped however often it is
 * written; and a taped corner where a straight wall meets a curve is a corner.
 */
import { describe, expect, it } from 'vitest'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { roomArea } from '../room'
import { tapedLengths } from '../taped'
import { parseFloorPlan, statedWall } from '../../types/floorplan'

const THICK = 0.2
/** The bow's circle: through (0, 0), (4, 0) and 1 m out from the chord, so its radius is 2.5 m round (2, ±1.5). */
const SWEEP = (2 * Math.asin(0.8) * 180) / Math.PI
const SEGMENT = (2.5 ** 2 / 2) * (2 * Math.asin(0.8) - Math.sin(2 * Math.asin(0.8)))
const BOW_LENGTH = 2.5 * 2 * Math.asin(0.8)

type Raw = Record<string, unknown>

/** The bow, every way it may be written: out of the room or into it, walked west to east or back. */
const BOWS: Record<string, { readonly wall: Raw; readonly area: number }> = {
  'out, west to east': { wall: { start: [0, 0], end: [4, 0], arc: { centre: [2, 1.5], sweep: SWEEP }, face: 'left' }, area: 12 + SEGMENT },
  'out, east to west': { wall: { start: [4, 0], end: [0, 0], arc: { centre: [2, 1.5], sweep: -SWEEP }, face: 'right' }, area: 12 + SEGMENT },
  'in, west to east': { wall: { start: [0, 0], end: [4, 0], arc: { centre: [2, -1.5], sweep: -SWEEP }, face: 'left' }, area: 12 - SEGMENT },
  'in, east to west': { wall: { start: [4, 0], end: [0, 0], arc: { centre: [2, -1.5], sweep: SWEEP }, face: 'right' }, area: 12 - SEGMENT }
}

/** A room 4 m by 3 m on its inside faces whose south side is the bow, every wall placed by its inside face. */
function bowRoom(bow: Raw, taped: readonly Raw[] = []): Raw {
  const walls = [
    { id: 'S', ...bow },
    { id: 'E', start: [4, 0], end: [4, 3], face: 'left' },
    { id: 'N', start: [4, 3], end: [0, 3], face: 'left' },
    { id: 'W', start: [0, 3], end: [0, 0], face: 'left' }
  ].map((w) => ({ thickness: THICK, height: 2.7, kind: 'exterior', ...w }))
  return { version: '1', walls, rooms: [{ id: 'r', name: 'Bow', boundary: ['S', 'E', 'N', 'W'] }], openings: [], taped }
}

/** The plan as Grid writes it back: every wall by what its file stated, its face among it. */
const writtenBack = (raw: Raw): Raw => ({ ...raw, walls: parseFloorPlan(raw).walls.map((w) => statedWall(w)) })

describe('a curved wall placed by its face, written back', () => {
  for (const [way, { wall, area }] of Object.entries(BOWS)) {
    it(`keeps a bow-fronted room as taped, read and written three times (${way})`, () => {
      const first = parseFloorPlan(bowRoom(wall))
      let raw = bowRoom(wall)
      for (let pass = 0; pass < 3; pass++) {
        raw = writtenBack(raw)
        const stated = (raw['walls'] as Raw[])[0]!
        expect(stated['face']).toBe(wall['face'])
        expect((stated['start'] as number[])[0]).toBeCloseTo((wall['start'] as number[])[0]!, 9)
        expect((stated['start'] as number[])[1]).toBeCloseTo((wall['start'] as number[])[1]!, 9)
        expect((stated['end'] as number[])[0]).toBeCloseTo((wall['end'] as number[])[0]!, 9)
        expect((stated['end'] as number[])[1]).toBeCloseTo((wall['end'] as number[])[1]!, 9)
        const plan = parseFloorPlan(raw)
        expect(plan.walls[0]!.start[0]).toBeCloseTo(first.walls[0]!.start[0], 9)
        expect(plan.walls[0]!.start[1]).toBeCloseTo(first.walls[0]!.start[1], 9)
        expect(validatePlan(plan).issues.map((i) => i.code)).toEqual([])
        const measured = roomArea(plan.rooms[0]!, indexPlan(plan))
        expect(Math.abs(measured - area) / area).toBeLessThan(0.001)
      }
    })
  }

  it('keeps a half-round bay closed by one straight wall', () => {
    const bay = {
      version: '1',
      walls: [
        { id: 'S', start: [0, 0], end: [4, 0], arc: { centre: [2, 0], sweep: 180 }, face: 'left', thickness: THICK, height: 2.7, kind: 'exterior' },
        { id: 'W', start: [4, 0], end: [0, 0], face: 'left', thickness: THICK, height: 2.7, kind: 'exterior' }
      ],
      rooms: [{ id: 'r', name: 'Bay', boundary: ['S', 'W'] }],
      openings: []
    }
    let raw: Raw = bay
    for (let pass = 0; pass < 3; pass++) raw = writtenBack(raw)
    const stated = (raw['walls'] as Raw[])[0]!
    expect(stated['start']).toEqual([0, 0])
    expect(stated['end']).toEqual([4, 0])
    const plan = parseFloorPlan(raw)
    expect(validatePlan(plan).issues.map((i) => i.code)).toEqual([])
    const half = (Math.PI * 2 * 2) / 2
    expect(Math.abs(roomArea(plan.rooms[0]!, indexPlan(plan)) - half) / half).toBeLessThan(0.001)
  })

  it('keeps a round room taped on its inside face at its taped radius', () => {
    let raw: Raw = {
      version: '1',
      walls: [{ id: 'c', start: [2.9, 0], end: [2.9, 0], thickness: 0.2, height: 2.7, kind: 'exterior', face: 'left', arc: { centre: [0, 0], sweep: 360 } }],
      rooms: [{ id: 'r', name: 'Round', boundary: ['c'] }],
      openings: []
    }
    for (let pass = 0; pass < 3; pass++) raw = writtenBack(raw)
    expect((raw['walls'] as Raw[])[0]!['start']).toEqual([2.9, 0])
    const plan = parseFloorPlan(raw)
    expect(Math.hypot(plan.walls[0]!.start[0], plan.walls[0]!.start[1])).toBeCloseTo(3, 9)
  })
})

describe('a taped length on a curved wall', () => {
  const taped = [
    { room: 'r', from: ['W', 'S'], to: ['S', 'E'], length: 4 },
    { room: 'r', from: ['N', 'W'], to: ['W', 'S'], length: 3 },
    { room: 'r', from: ['E', 'N'], to: ['W', 'S'], length: 5 },
    { room: 'r', wall: 'S', length: BOW_LENGTH },
    { room: 'r', wall: 'N', length: 4 }
  ]

  for (const [way, { wall }] of Object.entries(BOWS)) {
    it(`sets a corner where a straight wall meets the bow against the drawing (${way})`, () => {
      const rows = tapedLengths(parseFloorPlan(bowRoom(wall, taped)))
      for (const row of rows) {
        expect(row.missing).toBeUndefined()
        expect(row.state).toBe('agrees')
      }
      expect(rows[0]!.drawn).toBeCloseTo(4, 3)
      expect(rows[1]!.drawn).toBeCloseTo(3, 3)
      expect(rows[2]!.drawn).toBeCloseTo(5, 3)
    })
  }

  it('counts only the curve along the bow, though the room\'s other corners lie on its circle', () => {
    const [side] = tapedLengths(parseFloorPlan(bowRoom(BOWS['out, west to east']!.wall, [{ room: 'r', wall: 'S', length: BOW_LENGTH }])))
    expect(Math.abs(side!.drawn! - BOW_LENGTH)).toBeLessThan(0.005)
  })

  it('tells the two ends of a half-round bay apart by the order its walls are named in', () => {
    const plan = parseFloorPlan({
      version: '1',
      walls: [
        { id: 'S', start: [0, 0], end: [4, 0], arc: { centre: [2, 0], sweep: 180 }, face: 'left', thickness: THICK, height: 2.7, kind: 'exterior' },
        { id: 'W', start: [4, 0], end: [0, 0], face: 'left', thickness: THICK, height: 2.7, kind: 'exterior' }
      ],
      rooms: [{ id: 'r', name: 'Bay', boundary: ['S', 'W'] }],
      openings: [],
      taped: [
        { room: 'r', from: ['W', 'S'], to: ['S', 'W'], length: 4 },
        { room: 'r', from: ['S', 'W'], to: ['W', 'S'], length: 4 }
      ]
    })
    for (const row of tapedLengths(plan)) {
      expect(row.state).toBe('agrees')
      expect(row.drawn).toBeCloseTo(4, 3)
    }
  })

  it('still says a round wall named twice makes no corner', () => {
    const plan = parseFloorPlan({
      version: '1',
      walls: [{ id: 'c', start: [3, 0], end: [3, 0], thickness: 0.2, height: 2.7, kind: 'exterior', arc: { centre: [0, 0], sweep: 360 } }],
      rooms: [{ id: 'r', name: 'Round', boundary: ['c'] }],
      openings: [],
      taped: [{ room: 'r', from: ['c', 'c'], to: ['c', 'c'], length: 1 }]
    })
    expect(tapedLengths(plan)[0]!.missing).toBe('no-corner')
  })
})
