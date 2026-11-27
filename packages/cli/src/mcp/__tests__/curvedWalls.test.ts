import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench } from './replay/harness'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planToSvg } from '@ongrid/viewer/src/picture'
import { surveyPlan } from '../../quantities/survey'
import { routeBetween } from '../../quantities/measure'
import { crossingOf } from '../../quantities/walked'
import { planChange } from '../../quantities/change'
import { emptyPatch } from '../../edit/edits'
import { phasedPatch } from '../../edit/phases'

/**
 * CNT-18: a curved wall through the tool server. A round room and a living room with a half-round
 * bay, a kitchen beside the living room: what each tool answers about them, what the exports say
 * they write as straight pieces, and which edits keep to straight walls.
 */

type Tuple = [number, number]
const wall = (id: string, start: Tuple, end: Tuple, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra })

const plan = {
  version: '1',
  units: 'm',
  walls: [
    wall('round', [18, 5], [18, 5], { arc: { centre: [15, 5], sweep: 360 } }),
    wall('s', [0, 0], [4, 0], { kind: 'interior' }),
    wall('e', [4, 0], [4, 3]),
    wall('bay', [4, 3], [0, 3], { arc: { centre: [2, 3], sweep: 180 } }),
    wall('w', [0, 3], [0, 0]),
    wall('ks', [0, -3], [4, -3]),
    wall('ke', [4, -3], [4, 0]),
    wall('kw', [0, 0], [0, -3]),
  ],
  rooms: [
    { id: 'drum', name: 'Drum', boundary: ['round'], use: 'living' },
    { id: 'living', name: 'Living', boundary: ['s', 'e', 'bay', 'w'], use: 'living' },
    { id: 'kitchen', name: 'Kitchen', boundary: ['ks', 'ke', 's', 'kw'], use: 'kitchen' },
  ],
  openings: [
    { id: 'd1', wall: 'round', type: 'door', offset: 2, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' },
    { id: 'd2', wall: 's', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'd3', wall: 'ks', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'win', wall: 'bay', type: 'window', offset: 2.5, width: 1.2, sill: 0.9, height: 1.2 },
  ],
}

describe('a curved wall through the tool server (CNT-18)', () => {
  const b = bench({ 'plan.json': plan })
  afterAll(() => b.close())

  it('checks the plan with no part it cannot draw', async () => {
    const reply = await b.call('grid_check', { plan: 'plan.json', full: true })
    expect(reply.isError).toBe(false)
    expect(reply.text).not.toMatch(/can't be drawn|arc-/)
  })

  it('measures the round room within 0.1% of its hand area', async () => {
    const reply = await b.call('grid_areas', { plan: 'plan.json' })
    expect(reply.isError).toBe(false)
    const hand = Math.PI * 2.9 * 2.9
    const rooms = JSON.stringify(reply.data)
    const drum = /"id":"drum"[^}]*?"net":([0-9.]+)/.exec(rooms) ?? /"net":([0-9.]+)[^}]*?"id":"drum"/.exec(rooms)
    expect(drum, rooms.slice(0, 400)).not.toBeNull()
    expect(Math.abs(Number(drum![1]) - hand) / hand).toBeLessThan(0.001)
  })

  it('describes a curved wall by its centre and sweep', async () => {
    const agent = await b.call('grid_describe', { plan: 'plan.json', length: 'walls', for: 'agent' })
    expect(agent.text).toContain(' bay 4,3>0,3 arc(2,3 180°) 0.2 x')
    const person = await b.call('grid_describe', { plan: 'plan.json', length: 'walls', for: 'person' })
    expect(person.text).toContain('From 4, 3 to 0, 3, curving 180° anticlockwise round 2, 3 (radius 2, 6.28 along the curve)')
    const rooms = await b.call('grid_describe', { plan: 'plan.json', as: 'rooms' })
    expect(rooms.text).toContain('raw wall {"id":"bay"')
    expect(rooms.text).toContain('"arc":{"centre":[2,3],"sweep":180}')
  })

  it('exports with the curves it writes as straight pieces named, in its answer and its file', async () => {
    const dxf = await b.call('grid_export', { plan: 'plan.json', format: 'dxf' })
    expect(dxf.isError).toBe(false)
    expect(dxf.data!['approximated']).toEqual([
      { kind: 'room', id: 'drum', floor: 'ground' },
      { kind: 'room', id: 'living', floor: 'ground' },
    ])
    expect(dxf.text).toContain('Wrote the curves of 2 rooms along curved walls ("drum", "living") as straight pieces')
    const obj = await b.call('grid_export', { plan: 'plan.json', format: 'obj' })
    expect(obj.data!['approximated']).toEqual([
      { kind: 'wall', id: 'bay', floor: 'ground' },
      { kind: 'wall', id: 'round', floor: 'ground' },
      { kind: 'room', id: 'drum', floor: 'ground' },
      { kind: 'room', id: 'living', floor: 'ground' },
    ])
    expect(readFileSync(join(b.folder, 'exports', 'plan.obj'), 'utf8')).toContain('# Curved walls written as straight pieces (2): "bay", "round"')
  })

  it('refuses an edit that would move or cut a curved wall, and changes nothing', async () => {
    // CNT-22: the merge cuts the straight wall the two rooms share and leaves the bay as it is.
    const merge = await b.call('grid_merge_rooms', { plan: 'plan.json', room: 'living', with: 'kitchen', use: 'living', out: 'merged.json' })
    expect(merge.isError, merge.text).toBe(false)
    const merged = parseFloorPlan(JSON.parse(readFileSync(join(b.folder, 'merged.json'), 'utf8')))
    expect(merged.walls.find((w) => w.id === 'bay')).toEqual(parseFloorPlan(plan).walls.find((w) => w.id === 'bay'))
    expect(merged.rooms.find((r) => r.id === 'living')!.boundary).toContain('bay')
    const move = await b.call('grid_move_room_side', { plan: 'plan.json', room: 'living', side: 'north', by: 1, out: 'moved.json' })
    expect(move.isError).toBe(true)
    expect(move.text).toContain('Wall "bay" is curved')
    // A side of a straight room beside it still moves.
    const kitchen = await b.call('grid_move_room_side', { plan: 'plan.json', room: 'kitchen', side: 'south', by: 1, out: 'kitchen.json' })
    expect(kitchen.isError, kitchen.text).toBe(false)
  })

  it('finds a curved wall by its length along the curve (CNT-9)', async () => {
    const reply = await b.call('grid_find', { plan: 'plan.json', kind: ['wall'], where: ['length > 6'], fields: ['length'] })
    expect(reply.isError, reply.text).toBe(false)
    expect((reply.data!['ids'] as string[]).sort()).toEqual(['bay', 'round'])
  })

  it('squares a scan round a curved wall, and refuses to move an end on it', async () => {
    const marked = { ...plan, marks: [{ part: 'wall', id: 'ks', source: 'scanned' }, { part: 'wall', id: 'round', source: 'scanned' }] }
    const b2 = bench({ 'scan.json': marked, 'tilted.json': { ...marked, walls: marked.walls.map((w) => (w['id'] === 'e' ? { ...w, end: [4.05, 3] } : w)), marks: ['s', 'e', 'w', 'ks', 'ke', 'kw'].map((id) => ({ part: 'wall', id, source: 'scanned' })) } })
    try {
      const square = await b2.call('grid_square_scan', { plan: 'scan.json', out: 'squared.json' })
      expect(square.isError, square.text).toBe(false)
      expect(square.text).toContain('Curved wall "round" is left as it is: squaring turns straight walls only.')
      const tilted = await b2.call('grid_square_scan', { plan: 'tilted.json', out: 'tilted-out.json' })
      expect(tilted.isError).toBe(true)
      expect(tilted.text).toContain('Wall "bay" is curved, and squaring the scan changes straight walls only.')
    } finally {
      b2.close()
    }
  })

  it('changes an opening along a curved wall, and mirrors the curve', async () => {
    const wider = await b.call('grid_change_opening', { plan: 'plan.json', opening: 'win', width: 1.5, out: 'wider.json' })
    expect(wider.isError, wider.text).toBe(false)
    const written = JSON.parse(readFileSync(join(b.folder, 'wider.json'), 'utf8')) as typeof plan
    expect(written.openings.find((o) => o.id === 'win')).toMatchObject({ offset: 2.35, width: 1.5 })
    const mirrored = await b.call('grid_mirror', { plan: 'plan.json', how: 'left-right', out: 'mirrored.json' })
    expect(mirrored.isError, mirrored.text).toBe(false)
    const after = JSON.parse(readFileSync(join(b.folder, 'mirrored.json'), 'utf8')) as typeof plan
    expect(after.walls.find((w) => w.id === 'bay')).toMatchObject({ start: [14, 3], end: [18, 3], arc: { centre: [16, 3], sweep: -180 } })
    const check = await b.call('grid_areas', { plan: 'mirrored.json' })
    expect(check.isError).toBe(false)
  })

  it('turns a curved wall a quarter with its centre, so it stays on its circle (WRT-4)', async () => {
    const turned = await b.call('grid_mirror', { plan: 'plan.json', turn: 90, out: 'turned.json' })
    expect(turned.isError, turned.text).toBe(false)
    type Curved = { id: string; start: number[]; end: number[]; arc: { centre: number[]; sweep: number } }
    const after = JSON.parse(readFileSync(join(b.folder, 'turned.json'), 'utf8')) as { walls: Curved[] }
    const bay = after.walls.find((w) => w.id === 'bay')!
    const radius = (p: readonly number[]): number => Math.hypot(p[0]! - bay.arc.centre[0]!, p[1]! - bay.arc.centre[1]!)
    expect(bay.arc.sweep).toBe(180)
    expect(radius(bay.end)).toBeCloseTo(radius(bay.start), 6)
    const check = await b.call('grid_check', { plan: 'turned.json' })
    expect(check.text).not.toMatch(/arc-ends-apart/)
  })
})

/** The living room with its bay as a dividing line, and a nook beyond it in a 4 × 2.5 m box. */
const linePlan = {
  version: '1',
  units: 'm',
  walls: [
    wall('s', [0, 0], [4, 0]),
    wall('e', [4, 0], [4, 3]),
    wall('bay', [4, 3], [0, 3], { arc: { centre: [2, 3], sweep: 180 }, virtual: true, thickness: 0, height: 0 }),
    wall('w', [0, 3], [0, 0]),
    wall('ne', [4, 3], [4, 5.5]),
    wall('nn', [4, 5.5], [0, 5.5]),
    wall('nw', [0, 5.5], [0, 3]),
  ],
  rooms: [
    { id: 'living', name: 'Living', boundary: ['s', 'e', 'bay', 'w'] },
    { id: 'nook', name: 'Nook', boundary: ['bay', 'ne', 'nn', 'nw'] },
  ],
  openings: [{ id: 'd2', wall: 's', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 }],
}

/**
 * The tool server's plan with phases: a garden wall on a half circle, from a fence that stays, to
 * be demolished, and a curved dividing line to go with it.
 */
const phasedPlan = {
  ...plan,
  walls: [
    ...plan.walls,
    wall('fence', [30, -2], [30, 2]),
    wall('garden', [30, 0], [34, 0], { arc: { centre: [32, 0], sweep: 180 }, phase: 'demolished' }),
    wall('edge', [30, -5], [34, -5], { arc: { centre: [32, -5], sweep: 180 }, virtual: true, thickness: 0, height: 0, phase: 'demolished' }),
  ],
}

describe('a curved wall in the parts merged from main (VEW-9, CNT-10)', () => {
  const b = bench({ 'plan.json': plan, 'phased.json': phasedPlan })
  afterAll(() => b.close())

  it('walks a route out through a door in a curved wall, face to face through it (VEW-9)', async () => {
    const survey = surveyPlan(parseFloorPlan(plan))
    const crossing = crossingOf(survey, survey.byId.get('drum')!, 'd1')!
    // Straight through the hole, square to its chord: the wall's thickness.
    expect(Math.hypot(crossing.far.x - crossing.near.x, crossing.far.y - crossing.near.y)).toBeCloseTo(0.2, 9)
    const toMiddle = { x: 15 - crossing.near.x, y: 5 - crossing.near.y }
    expect(toMiddle.x * crossing.inward.x + toMiddle.y * crossing.inward.y).toBeGreaterThan(2.8)
    // From the middle of the drum to the middle of the hole's inside edge, a chord 0.3 rad round
    // at 2.9 m, and on through the wall: 3 cos 0.15 - 0.1 + 0.2 = 3.07 m.
    const route = routeBetween(survey, 'drum', 'outside')!
    expect(route.length).toBeCloseTo(3 * Math.cos(0.15) - 0.1 + 0.2, 3)
    const reply = await b.call('grid_measure', { plan: 'plan.json', what: 'route', room: 'drum', to: 'outside' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('Walked, 3.07 m')
    const walk = await b.call('grid_describe', { plan: 'plan.json', length: 'walk' })
    expect(walk.isError, walk.text).toBe(false)
    expect(walk.text).toContain('3 drum <OUT d1 d0.9 | SW 5.8x5.77 26.42')
  })

  it('crosses a curved dividing line at the middle of the stretch two rooms share, along the curve (VEW-9)', () => {
    const survey = surveyPlan(parseFloorPlan(linePlan))
    const living = survey.byId.get('living')!
    const nook = survey.byId.get('nook')!
    const out = crossingOf(survey, living, 'bay', nook)!
    // The top of the bay, 2 m round from either end, not the middle of its chord.
    expect(out.near.x).toBeCloseTo(2, 3)
    expect(out.near.y).toBeCloseTo(5, 3)
    expect(out.far).toEqual(out.near)
    expect(out.inward.y).toBeCloseTo(-1, 6)
    expect(crossingOf(survey, nook, 'bay', living)!.inward.y).toBeCloseTo(1, 6)
    // Walked from the living room's middle up to the top of the bay and on to the nook's middle.
    const route = routeBetween(survey, 'living', 'nook')!
    expect(route.steps.map((s) => s.via)).toEqual(['bay'])
    expect(route.length).not.toBeNull()
    expect(route.legs.map((l) => l.room)).toEqual(['living', 'nook'])
  })

  it('costs a curved wall to be demolished along its curve, with the one end it meets a wall at (CNT-10)', async () => {
    const change = planChange(parseFloorPlan(phasedPlan))
    const quantity = (key: string): number | undefined => change.lines.find((l) => l.key === key)?.quantity
    expect(quantity('demolish:wall:exterior:0.2')).toBeCloseTo(2 * Math.PI * 2.7, 6)
    expect(quantity('make_good:floor')).toBeCloseTo(2 * Math.PI * 0.2, 6)
    expect(quantity('make_good:wall_end')).toBeCloseTo(2.7, 9)
    const reply = await b.call('grid_takeoff', { plan: 'phased.json', for: 'change' })
    expect(reply.isError, reply.text).toBe(false)
  })

  it('keeps a curved wall an edit takes out of a plan with phases, to be demolished (CNT-10)', () => {
    const read = parseFloorPlan(phasedPlan)
    const piece = { id: 'cut', start: [4, 3], end: [2, 3], thickness: 0.2, height: 2.7, kind: 'exterior' }
    const patch = phasedPatch(read, { ...emptyPatch([]), removeWalls: new Set(['bay']), addWalls: [piece] })
    expect(patch.walls.get('bay')).toEqual({ phase: 'demolished' })
    expect(patch.removeWalls?.has('bay')).toBe(false)
    expect(patch.addWalls).toEqual([{ ...piece, phase: 'new' }])
  })

  it('draws a curved dividing line to be demolished along its curve (CNT-10)', () => {
    const svg = planToSvg(parseFloorPlan(phasedPlan))
    const edge = /<path [^>]*data-part="demolished-wall" data-id="edge"[^>]*>/.exec(svg) ?? /<path d="([^"]*)"[^>]*data-part="demolished-wall"[^>]*data-id="edge"/.exec(svg)
    expect(edge).not.toBeNull()
    const d = /d="([^"]*)"/.exec(edge![0])![1]!
    expect(d.split('L').length).toBeGreaterThan(100)
  })
})

describe('a curved wall in every language (MSG-11 with CNT-18)', () => {
  const b = bench({ 'plan.json': plan })
  afterAll(() => b.close())

  it('describes a curved wall in Spanish, with its decimal comma', async () => {
    const reply = await b.call('grid_describe', { plan: 'plan.json', length: 'walls', for: 'person', language: 'es' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('en curva de 180° en sentido antihorario en torno a 2; 3 (radio 2, 6,28 a lo largo de la curva)')
  })
})

// WRT-82: a write that leaves a curved wall whose sweep misses its end names it, and the sweep that reaches it.
describe('a curved raw wall written with the wrong sweep (WRT-82)', () => {
  const b = bench({})
  afterAll(() => b.close())

  it('lists the new problem by code and wall, with the sweep that reaches the end', async () => {
    const a = (102.68 * Math.PI) / 180
    const end = [Number((10 * Math.cos(a)).toFixed(6)), Number((10 * Math.sin(a)).toFixed(6))]
    const rooms = [
      'walls outside 0.3 inside 0.1 height 3',
      'room hall "Hall" living 5 x 4 at 30,0',
      `raw wall {"id": "sweep", "start": [10, 0], "end": [${end.join(', ')}], "thickness": 0.2, "height": 3, "kind": "exterior", "arc": {"centre": [0, 0], "sweep": -102.68}}`,
    ].join('\n')
    const reply = await b.call('grid_write_rooms', { plan: 'plan.json', rooms })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/New in the drawing: wall\/arc-ends-apart on "sweep": .*The sweep that reaches its end is \+102\.68 /)
    const problems = reply.data!['drawingProblems'] as { new: Array<{ code: string; id: string }> }
    expect(problems.new).toContainEqual(expect.objectContaining({ code: 'wall/arc-ends-apart', id: 'sweep' }))
  })

  it('writes a curve given through a point as its centre and sweep, and says them', async () => {
    const rooms = [
      'walls outside 0.3 inside 0.1 height 3',
      'room hall "Hall" living 5 x 4 at 30,0',
      'raw wall {"id": "bow", "start": [10, 0], "end": [16, 0], "thickness": 0.2, "height": 3, "kind": "exterior", "arc": {"through": [13, -3]}}',
    ].join('\n')
    const reply = await b.call('grid_write_rooms', { plan: 'bow.json', rooms })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toMatch(/raw wall 'bow' curves round 13,0 turning \+180 degrees/)
    const written = JSON.parse(readFileSync(join(b.folder, 'bow.json'), 'utf8')) as { walls: Array<{ id: string; arc?: unknown }> }
    expect(written.walls.find((w) => w.id === 'bow')!.arc).toEqual({ centre: [13, 0], sweep: 180 })
    expect(reply.text).not.toMatch(/New in the drawing/)
  })
})
