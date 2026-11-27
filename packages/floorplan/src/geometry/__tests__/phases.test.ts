import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { readingNotes } from '../../types/reading'
import { refurbishment, refurbishmentRaw } from '../../test-support/phases'
import { buildFloorPlan } from '../floorplan'
import { mergeBase, partPhases, phaseClashes, phaseCounts, planHasPhases, planInState } from '../phases'
import { validatePlan } from '../validate'
import { planAreaFigures } from '../areas'
import { buildScene } from '../scene3d'
import { indexPlan } from '../plan'
import { roomColumnArea } from '../columns'

const errors = (plan: FloorPlan) => validatePlan(plan).issues.filter((i) => i.severity === 'error')

describe('existing, demolished and new (CNT-10)', () => {
  it('keeps every phase as the file states it, with no note and nothing left out', () => {
    const raw = refurbishmentRaw()
    const plan = refurbishment()
    const stated = (list: string) => (raw[list] as { id: string; phase?: string }[]).map((p) => [p.id, p.phase])
    expect(plan.walls.map((w) => [w.id, w.phase])).toEqual(stated('walls'))
    expect(plan.rooms.map((r) => [r.id, r.phase])).toEqual(stated('rooms'))
    expect(plan.openings.map((o) => [o.id, o.phase])).toEqual(stated('openings'))
    const parts = readPlanParts(raw)
    expect(parts.plan).not.toBeNull()
    expect('faults' in parts ? parts.faults : null).toEqual([])
    expect(readingNotes(raw)).toEqual([])
    // Written back as read: no default lands in the file.
    expect(JSON.parse(JSON.stringify(plan)).openings.find((o: { id: string }) => o.id === 'd-kitchen').phase).toBeUndefined()
  })

  it('reads an opening that states no phase in its wall\'s, when that is demolished or new', () => {
    const phases = partPhases(refurbishment())
    expect(phases.get('d-kitchen')).toBe('demolished')
    expect(phases.get('d-study')).toBe('new')
    expect(phaseCounts(refurbishment())).toEqual({
      existing: { walls: 6, openings: 5, rooms: 1 },
      demolished: { walls: 1, openings: 3, rooms: 3 },
      new: { walls: 1, openings: 3, rooms: 3 },
    })
  })

  it('holds two states: before the work and after it', () => {
    const plan = refurbishment()
    const before = planInState(plan, 'before')
    const after = planInState(plan, 'after')
    expect(before.walls.map((w) => w.id)).not.toContain('wst')
    expect(after.walls.map((w) => w.id)).not.toContain('wk')
    expect(before.rooms.map((r) => r.id).sort()).toEqual(['bath', 'dining', 'kitchen', 'living-old'])
    expect(after.rooms.map((r) => r.id).sort()).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    expect(after.openings.map((o) => o.id)).not.toContain('d-kitchen')
    expect(planInState(after, 'after')).toBe(after)
  })

  it('accepts a widened door as an old opening and a new one in the same place (done when 2)', () => {
    const plan = refurbishment()
    expect(errors(plan)).toEqual([])
    expect(validatePlan(plan).issues.map((i) => i.code)).not.toContain('opening/overlap')
    // The same two openings with no phase overlap, as before.
    const strip = <T extends { phase?: unknown }>(part: T): T => {
      const rest = { ...part }
      delete rest.phase
      return rest
    }
    const unphased = parseFloorPlan({ ...refurbishmentRaw(), walls: plan.walls.map(strip), rooms: plan.rooms.filter((r) => r.phase !== 'demolished').map(strip), openings: plan.openings.filter((o) => o.id !== 'd-kitchen').map(strip) })
    expect(validatePlan(unphased).issues.map((i) => i.code)).toContain('opening/overlap')
  })

  it('refuses an opening or a room that stands when its wall does not', () => {
    const raw = refurbishmentRaw()
    const openings = (raw['openings'] as Record<string, unknown>[]).map((o) => (o['id'] === 'd-kitchen' ? { ...o, phase: 'new' } : o))
    const rooms = (raw['rooms'] as Record<string, unknown>[]).map((r) => (r['id'] === 'bath' ? { ...r, boundary: ['wb', 'we', 'wn', 'wst'] } : r))
    const plan = parseFloorPlan({ ...raw, openings, rooms })
    expect(phaseClashes(plan).map((c) => [c.code, c.id, c.wall])).toEqual([
      ['opening/phase-wall', 'd-kitchen', 'wk'],
      ['room/phase-wall', 'bath', 'wst'],
    ])
    const result = validatePlan(plan)
    expect(result.broken.has('d-kitchen')).toBe(true)
    expect(result.broken.has('bath')).toBe(true)
    expect(result.issues.filter((i) => i.id === 'bath').map((i) => i.code)).toEqual(['room/phase-wall'])
  })

  it('checks a demolished part as it stands before the work', () => {
    const raw = refurbishmentRaw()
    // A demolished wall whose door does not fit it is still a fault, before the work.
    const openings = (raw['openings'] as Record<string, unknown>[]).map((o) => (o['id'] === 'd-kitchen' ? { ...o, offset: 4.8 } : o))
    const issues = validatePlan(parseFloorPlan({ ...raw, openings })).issues
    expect(issues.filter((i) => i.id === 'd-kitchen').map((i) => i.severity)).toContain('error')
  })

  it('reads a plan with no phase exactly as before', () => {
    const plan = parseFloorPlan({ version: '1', walls: [{ id: 'a', start: [0, 0], end: [4, 0] }], rooms: [], openings: [] })
    expect(planHasPhases(plan)).toBe(false)
    expect(planInState(plan, 'after')).toBe(plan)
    expect(partPhases(plan).size).toBe(0)
    expect(buildFloorPlan(plan).walls[0]).not.toHaveProperty('phase')
  })

  it('measures and models the building after the work', () => {
    const plan = refurbishment()
    const rooms = planAreaFigures(plan).floors.flatMap((f) => f.rooms.map((r) => r.id)).sort()
    expect(rooms).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    const scene = buildScene(plan)
    expect(scene.walls.map((w) => w.id)).not.toContain('wk')
  })

  it('draws the demolished walls and openings as they stood, and the rest with their phase', () => {
    const drawing = buildFloorPlan(refurbishment())
    const phaseOf = (id: string) => drawing.walls.find((w) => w.id === id)?.phase
    expect(phaseOf('wk')).toBe('demolished')
    expect(phaseOf('wst')).toBe('new')
    expect(phaseOf('ws')).toBe('existing')
    expect(drawing.walls[0]!.id).toBe('wk')
    const openings = new Map(drawing.openings.map((o) => [o.id, o.phase]))
    expect(openings.get('d-bath-old')).toBe('demolished')
    expect(openings.get('d-bath')).toBe('new')
    expect(openings.get('d-kitchen')).toBe('demolished')
    expect(drawing.rooms.map((r) => r.id).sort()).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    expect(drawing.issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('a fit-out on a base plan (CNT-10, CP4-4)', () => {
  const shell = parseFloorPlan({
    version: '1',
    walls: [
      { id: 's1', start: [0, 0], end: [8, 0], thickness: 0.3, kind: 'exterior' },
      { id: 's2', start: [8, 0], end: [8, 5], thickness: 0.3, kind: 'exterior' },
      { id: 's3', start: [8, 5], end: [0, 5], thickness: 0.3, kind: 'exterior' },
      { id: 's4', start: [0, 5], end: [0, 0], thickness: 0.3, kind: 'exterior' },
    ],
    rooms: [{ id: 'shell', name: 'Shell', boundary: ['s1', 's2', 's3', 's4'] }],
    openings: [{ id: 'entrance', wall: 's1', type: 'door', offset: 1, width: 1, height: 2.1 }],
  })
  const fitOut = parseFloorPlan({
    version: '1',
    base: 'shell.json',
    walls: [{ id: 'p1', start: [4, 0], end: [4, 5], thickness: 0.1, kind: 'partition' }],
    rooms: [
      { id: 'front', name: 'Front', boundary: ['s1', 'p1', 's3', 's4'] },
      { id: 'back', name: 'Back', boundary: ['s1', 's2', 's3', 'p1'] },
    ],
    openings: [{ id: 'd1', wall: 'p1', type: 'door', offset: 2, width: 0.8, height: 2.1 }],
  })

  it('reads the base\'s walls and openings as existing and its own parts as new', () => {
    const merged = mergeBase(fitOut, shell)
    expect([...merged.walls]).toEqual(['s1', 's2', 's3', 's4'])
    expect([...merged.openings]).toEqual(['entrance'])
    expect(merged.clashes).toEqual([])
    const phases = partPhases(merged.plan)
    expect(phases.get('s1')).toBe('existing')
    expect(phases.get('p1')).toBe('new')
    expect(phases.get('front')).toBe('new')
    expect(merged.plan.rooms.map((r) => r.id)).toEqual(['front', 'back'])
    expect(errors(merged.plan)).toEqual([])
  })

  it('names a base part whose id the fit-out uses', () => {
    const clash = parseFloorPlan({ ...fitOut, walls: [...fitOut.walls, { id: 's2', start: [0, 1], end: [1, 1] }] })
    expect(mergeBase(clash, shell).clashes).toEqual(['s2'])
  })
})

describe('a base plan\'s structure, stairs, fixtures and floors in its fit-out (WRT-85)', () => {
  const walls = [
    { id: 's1', start: [0, 0], end: [8, 0], thickness: 0.3, kind: 'exterior' },
    { id: 's2', start: [8, 0], end: [8, 5], thickness: 0.3, kind: 'exterior' },
    { id: 's3', start: [8, 5], end: [0, 5], thickness: 0.3, kind: 'exterior' },
    { id: 's4', start: [0, 5], end: [0, 0], thickness: 0.3, kind: 'exterior' },
  ]
  const shellRaw = {
    version: '1',
    floors: [
      { id: 'ground', name: 'Ground', level: 0, slab: 0.25, outline: [[-0.15, -0.15], [8.15, -0.15], [8.15, 5.15], [-0.15, 5.15]] },
      { id: 'first', name: 'First', level: 1, elevation: 3.4, height: 2.7 },
    ],
    walls: [...walls, ...walls.map((w) => ({ ...w, id: `${w.id}-1`, floor: 'first' }))],
    rooms: [{ id: 'shell', name: 'Shell', boundary: ['s1', 's2', 's3', 's4'] }],
    openings: [{ id: 'entrance', wall: 's1', type: 'door', offset: 1, width: 1, height: 2.1 }],
    columns: [
      { id: 'c1', shape: 'square', width: 0.4, at: [2, 2.5] },
      { id: 'c2', shape: 'square', width: 0.4, at: [6, 2.5] },
    ],
    grids: [{ id: 'g', origin: [0, 0], x: { spacing: [4, 4] }, y: { spacing: [5] } }],
    stairs: [{ id: 'st', from: 'ground', to: 'first', width: 0.9, run: [[7.3, 0.6], [7.3, 4.4]] }],
    items: [{ id: 'breast', kind: 'storage', label: 'Chimney breast', at: [0.5, 2.5], size: [0.6, 1.2], height: 2.6 }],
  }
  const shell = parseFloorPlan(shellRaw)
  const fitOut = parseFloorPlan({
    version: '1',
    base: 'shell.json',
    floors: [{ id: 'ground', name: 'Ground floor' }],
    walls: [],
    rooms: [{ id: 'hall', name: 'Hall', boundary: ['s1', 's2', 's3', 's4'] }],
    openings: [],
    items: [{ id: 'desk', kind: 'desk', at: [4, 1], size: [1.4, 0.7], height: 0.75 }],
  })

  it('reads the base\'s columns, grids, stairs and fixtures in after the fit-out\'s own', () => {
    const merged = mergeBase(fitOut, shell)
    expect(merged.clashes).toEqual([])
    expect(merged.plan.columns?.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(merged.plan.grids?.map((g) => g.id)).toEqual(['g'])
    expect(merged.plan.stairs?.map((s) => s.id)).toEqual(['st'])
    expect(merged.plan.items?.map((i) => i.id)).toEqual(['desk', 'breast'])
    expect([...merged.columns]).toEqual(['c1', 'c2'])
    expect([...merged.grids]).toEqual(['g'])
    expect([...merged.stairs]).toEqual(['st'])
    expect([...merged.items]).toEqual(['breast'])
  })

  it('takes the base\'s columns off the fit-out room\'s floor, as in the base', () => {
    const merged = mergeBase(fitOut, shell).plan
    const index = indexPlan(merged)
    const hall = merged.rooms.find((r) => r.id === 'hall')!
    expect(roomColumnArea(hall, index)).toBeCloseTo(0.32, 6)
    const baseIndex = indexPlan(shell)
    expect(roomColumnArea(shell.rooms[0]!, baseIndex)).toBeCloseTo(0.32, 6)
  })

  it('gives a floor the fit-out lists the base\'s levels, slab and outline where it states none', () => {
    const merged = mergeBase(fitOut, shell)
    const ground = merged.plan.floors?.find((f) => f.id === 'ground')
    expect(ground?.name).toBe('Ground floor')
    expect(ground?.slab).toBe(0.25)
    expect(ground?.outline).toEqual(shell.floors![0]!.outline)
    expect(merged.plan.floors?.find((f) => f.id === 'first')).toEqual(shell.floors![1])
    expect([...merged.floors]).toEqual(['first'])
    expect(merged.ownFloors.get('ground')).toEqual(fitOut.floors![0])
    // A value the fit-out states is its own.
    const stated = parseFloorPlan({ ...fitOut, floors: [{ id: 'first', name: 'First', level: 1, height: 3 }] })
    const first = mergeBase(stated, shell).plan.floors?.find((f) => f.id === 'first')
    expect(first?.height).toBe(3)
    expect(first?.elevation).toBe(3.4)
    // A fit-out floor at the default level takes the base's.
    const unlevelled = parseFloorPlan({ ...fitOut, floors: [{ id: 'first', name: 'First' }] })
    expect(mergeBase(unlevelled, shell).plan.floors?.find((f) => f.id === 'first')?.level).toBe(1)
  })

  it('names a base column, stair or fixture whose id the fit-out uses', () => {
    const clash = parseFloorPlan({ ...fitOut, columns: [{ id: 'c1', shape: 'round', width: 0.3, at: [4, 4] }], items: [{ id: 'breast', kind: 'desk', at: [5, 1], size: [1.4, 0.7], height: 0.75 }] })
    expect(mergeBase(clash, shell).clashes).toEqual(['c1', 'breast'])
    // Each kind is its own list: a fixture may share an id with a base column, as in any plan.
    const apart = parseFloorPlan({ ...fitOut, items: [{ id: 'c1', kind: 'desk', at: [4, 1], size: [1.4, 0.7], height: 0.75 }] })
    expect(mergeBase(apart, shell).clashes).toEqual([])
  })

  it('never changes the base or the fit-out it is given', () => {
    const before = JSON.stringify([shell, fitOut])
    mergeBase(fitOut, shell)
    expect(JSON.stringify([shell, fitOut])).toBe(before)
  })
})
