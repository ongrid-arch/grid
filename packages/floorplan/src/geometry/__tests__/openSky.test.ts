/**
 * LVL-12: a courtyard is the outside. Floor no room claims that a window looks into, or that lies
 * over open sky on the floor below, has no slab and no roof, its walls face outside and the check
 * does not call it unclaimed floor; a courtyard over open sky has no slab on any floor; rooms text
 * writes the wall to an outdoor space as an outside wall; a canopy on columns has its roof.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { planEnvelope } from '../envelope'
import { inPieces } from '../polygons'
import { planWallSides } from '../exposure'
import { validatePlan } from '../validate'
import { openSky } from '../openSky'
import { planSection, type PlanSection } from '../section'

/** Four wings round a 6 × 4 m courtyard, `court`, which the text writes as `kind`. */
function courtyardText(kind: string, options: { windows?: boolean; first?: string } = {}): string {
  const ground = [
    'room n "North wing" living 12 x 4 at 0,0',
    `room c "Court" - 6 x 4 south of n align west shift 3 ${kind}`,
    'room w "West wing" bedroom 2.9 x 4 west of c',
    'room e "East wing" bedroom 3 x 4 east of c',
    'room s "South wing" kitchen 12 x 4 south of c align west shift -3',
    ...(options.windows === true ? ['window k1 between n and c, centred, 1.2 wide', 'window k2 between s and c, centred, 1.2 wide'] : []),
  ]
  if (options.first === undefined) return ['walls outside 0.3 inside 0.1 height 2.7', ...ground].join('\n')
  return ['walls outside 0.3 inside 0.1 height 2.7', 'floor ground "Ground" level 0', ...ground, 'floor first "First" level 1 copy ground', ...(options.first === '' ? [] : [options.first])].join('\n')
}

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan(result.plan)
}

/** The plan with the named rooms left out: the courtyard drawn round, never drawn as a room. */
const without = (plan: FloorPlan, ...ids: string[]): FloorPlan => ({ ...plan, rooms: plan.rooms.filter((room) => !ids.includes(room.id)) })

const envelopeOf = (plan: FloorPlan, floor: string) => planEnvelope(plan).floors.find((f) => f.floor === floor)!
const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((i) => i.code)
const exposureOf = (plan: FloorPlan, id: string) => planWallSides(indexPlan(plan)).get(id)!.exposure

/** Whether a slab or a roof the section cuts runs over a point of its line, `x` metres along it. */
const overAt = (section: PlanSection, kind: 'slab' | 'roof', floor: string, x: number): boolean =>
  section.parts.some((p) => p.kind === kind && p.floor === floor && p.rings.some((ring) => Math.min(...ring.map((q) => q.x)) < x && x < Math.max(...ring.map((q) => q.x))))

describe('a courtyard not drawn as a room', () => {
  // The courtyard written as a room with no use, then left out: the walls round it are the 0.1 m
  // inside walls rooms text gives two rooms, as a plan drawn by hand may have them.
  const withWindows = without(written(courtyardText('', { windows: true })), 'c')
  const blank = without(written(courtyardText('')), 'c')
  const courtArea = 6 * 4

  it('is open to the sky when a window looks into it: no slab, no roof and no note', () => {
    const open = openSky(indexPlan(withWindows), 'ground')
    expect(open.map((s) => [s.reason, Number(s.area.toFixed(2))])).toEqual([['window', courtArea]])
    const ground = envelopeOf(withWindows, 'ground')
    const closed = envelopeOf(blank, 'ground')
    expect(ground.slab!.area).toBeCloseTo(closed.slab!.area - courtArea, 6)
    expect(ground.roof!.area).toBeCloseTo(closed.roof!.area - courtArea, 6)
    expect(codes(withWindows)).not.toContain('floor/unclaimed')
  })

  it('has its walls face outside, a window in each', () => {
    for (const id of ['w-n-south', 'w-s-north', 'w-c-e', 'w-w-c']) expect(exposureOf(withWindows, id), id).toBe('exterior')
  })

  it('is cut open in the section: no slab and no roof over it', () => {
    // Across the courtyard from west to east, at its middle: it runs from x 3 to 9 on the plan.
    const section = planSection(withWindows, { from: { x: -1, y: -2.1 }, to: { x: 13, y: -2.1 }, toward: 'left' })
    expect(overAt(section, 'slab', 'ground', 7)).toBe(false)
    expect(overAt(section, 'roof', 'ground', 7)).toBe(false)
    expect(overAt(section, 'roof', 'ground', 1)).toBe(true)
  })

  it('stays floor no room claims with no window into it and nothing open under it (ARE-4)', () => {
    expect(openSky(indexPlan(blank), 'ground')).toEqual([])
    expect(codes(blank)).toContain('floor/unclaimed')
    expect(exposureOf(blank, 'w-c-e')).toBe('interior')
  })
})

describe('a courtyard through two floors', () => {
  it('drawn as an outdoor courtyard on both floors, has no slab or roof over it on either', () => {
    const plan = written(courtyardText('outdoor courtyard', { first: '' }))
    const ground = envelopeOf(plan, 'ground')
    const first = envelopeOf(plan, 'first')
    expect(first.slab!.area).toBeCloseTo(ground.slab!.area, 6)
    expect(first.roof!.area).toBeCloseTo(first.slab!.area, 6)
    expect(ground.roof).toBeNull()
    // The courtyard's middle, 6 m along the plan and 2.3 m south of the north wing's south face.
    const section = planSection(plan, { from: { x: -1, y: -2.3 }, to: { x: 13, y: -2.3 }, toward: 'left' })
    expect(overAt(section, 'slab', 'first', 7)).toBe(false)
    expect(overAt(section, 'roof', 'first', 7)).toBe(false)
    expect(overAt(section, 'slab', 'first', 1)).toBe(true)
  })

  it('drawn on the ground floor only, is open on the floor above too, and is no unclaimed floor there', () => {
    const plan = without(written(courtyardText('outdoor courtyard', { first: '' })), 'first-c')
    expect(openSky(indexPlan(plan), 'first').map((s) => s.reason)).toEqual(['below'])
    const ground = envelopeOf(plan, 'ground')
    const first = envelopeOf(plan, 'first')
    expect(first.slab!.area).toBeCloseTo(ground.slab!.area, 6)
    expect(first.roof!.area).toBeCloseTo(first.slab!.area, 6)
    expect(validatePlan(plan).issues.filter((i) => i.code === 'floor/unclaimed')).toEqual([])
    expect(exposureOf(plan, 'first-w-c-e')).toBe('exterior')
  })

  it('keeps the slab under a terrace on the roof of rooms below', () => {
    const plan = written(
      [
        'walls outside 0.3 inside 0.1 height 2.7',
        'floor ground "Ground" level 0',
        'room a "Living" living 6 x 4 at 0,0',
        'room b "Kitchen" kitchen 6 x 3 north of a',
        'floor first "First" level 1',
        'room fa "Bedroom" bedroom 6 x 4 at 0,0',
        'room fb "Terrace" - 6 x 3 north of fa outdoor courtyard',
      ].join('\n')
    )
    const first = envelopeOf(plan, 'first')
    // The slab reaches the terrace's open sides, including the edge over the kitchen wall.
    expect(inPieces(first.slab!.pieces, { x: 3, y: 7.2 })).toBe(true)
    expect(inPieces(first.roof!.pieces, { x: 3, y: 7.2 })).toBe(false)
  })
})

describe('walls to outdoor space in rooms text', () => {
  const wallOf = (plan: FloorPlan, a: string, b: string) => {
    const walls = plan.rooms.find((r) => r.id === a)!.boundary
    // The wall between them, not an outside wall that runs along both (`ext-…`).
    const shared = plan.rooms.find((r) => r.id === b)!.boundary.filter((id) => walls.includes(id) && !id.startsWith('ext-'))
    expect(shared.length).toBe(1)
    return plan.walls.find((w) => w.id === shared[0])!
  }

  it('writes the wall between a room and a courtyard as an outside wall, at the outside thickness', () => {
    const plan = written(courtyardText('outdoor courtyard'))
    for (const room of ['n', 's', 'w', 'e']) {
      const wall = wallOf(plan, room, 'c')
      expect([wall.kind, wall.thickness], room).toEqual(['exterior', 0.3])
    }
  })

  it('keeps the back wall of the house an outside wall beside a terrace', () => {
    const text = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living room" living 5 x 4 at 0,0', 'room terrace "Terrace" - 5 x 3 north of living outdoor terrace']
    const wall = wallOf(written(text.join('\n')), 'living', 'terrace')
    expect([wall.kind, wall.thickness]).toEqual(['exterior', 0.3])
    // A wall line stated before the rooms still decides.
    const stated = wallOf(written([text[0], 'wall between living and terrace 0.2', ...text.slice(1)].join('\n')), 'living', 'terrace')
    expect(stated.thickness).toBe(0.2)
  })
})

describe('a canopy on columns', () => {
  const post = (id: string, x: number, y: number, height?: number) => ({ id, shape: 'square', width: 0.4, at: [x, y], ...(height === undefined ? {} : { height }) })
  const line = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0, height: 0, kind: 'interior', virtual: true })
  const canopy = (extra: Record<string, unknown> = {}): FloorPlan =>
    parseFloorPlan({
      version: '1',
      units: 'm',
      openings: [],
      walls: [line('a', [0, 0], [10, 0]), line('b', [10, 0], [10, 6]), line('c', [10, 6], [0, 6]), line('d', [0, 6], [0, 0])],
      rooms: [{ id: 'canopy', name: 'Canopy', boundary: ['a', 'b', 'c', 'd'], outdoor: 'other', roofed: true, ...extra }],
      columns: [post('k1', 1, 1, 5.2), post('k2', 9, 5, 5.2), post('k3', 1, 5), post('k4', 9, 1)],
    })

  it('is roofed over its whole outline at its columns\' height, with no slab', () => {
    const ground = envelopeOf(canopy(), 'ground')
    expect(ground.slab).toBeNull()
    expect(ground.roof!.area).toBeCloseTo(60, 6)
    expect(ground.roof!.bottom).toBeCloseTo(5.2, 9)
  })

  it('is roofed at the height it states', () => {
    expect(envelopeOf(canopy({ height: 4.5 }), 'ground').roof!.bottom).toBeCloseTo(4.5, 9)
  })

  it('has no roof when it states none', () => {
    expect(envelopeOf(canopy({ roofed: false }), 'ground').roof).toBeNull()
  })
})
