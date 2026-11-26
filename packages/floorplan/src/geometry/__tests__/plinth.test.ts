/**
 * VEW-16: a floor on the ground that stands clear of the ground the site states is carried down to
 * it on a plinth, in its facades and its sections alike, so no strip is left open under it.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planFacade } from '../facade'
import { planSection, type SectionLine } from '../section'
import { plinthUnder } from '../ground'
import { planEnvelope } from '../envelope'
import { signedArea } from '../vec2'

const wall = (id: string, start: [number, number], end: [number, number], floor: string) => ({ id, start, end, thickness: 0.3, height: 2.7, floor })

/** One floor, 10 m by 8 m, on Grid's own 0.25 m slab, and the ground where `site` puts it. */
function house(site: Record<string, unknown> | undefined, floor: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({
    version: '1',
    floors: [{ id: 'ground', name: 'Ground floor', level: 0, ...floor }],
    ...(site === undefined ? {} : { site }),
    walls: [wall('s', [0, 0], [10, 0], 'ground'), wall('e', [10, 0], [10, 8], 'ground'), wall('n', [10, 8], [0, 8], 'ground'), wall('w', [0, 8], [0, 0], 'ground')],
    rooms: [{ id: 'r', name: 'Living', boundary: ['s', 'e', 'n', 'w'], floor: 'ground' }],
    openings: [{ id: 'front', wall: 's', type: 'door', offset: 4.5, width: 1, height: 2.1 }]
  })
}

/** Across the house from south to north, looking west: x is y + 2. */
const ACROSS: SectionLine = { from: { x: 5, y: -2 }, to: { x: 5, y: 10 }, toward: 'left' }

const yRange = (rings: readonly (readonly { x: number; y: number }[])[]): [number, number] => [Math.min(...rings.flat().map((p) => p.y)), Math.max(...rings.flat().map((p) => p.y))]
const xRanges = (rings: readonly (readonly { x: number; y: number }[])[]): [number, number][] =>
  rings.map((ring) => [Math.min(...ring.map((p) => p.x)), Math.max(...ring.map((p) => p.x))] as [number, number]).sort((a, b) => a[0] - b[0])

describe('the plinth under a floor that stands clear of the ground (VEW-16)', () => {
  const plan = house({ ground: -0.45 })

  it('runs from the ground to the underside of the base slab', () => {
    const slab = planEnvelope(plan).floors[0]!.slab
    expect(plinthUnder(slab, -0.45)).toEqual({ bottom: -0.45, top: -0.25 })
    expect(plinthUnder(slab, -0.25)).toBeNull()
    expect(plinthUnder(slab, 0)).toBeNull()
    expect(plinthUnder(null, -0.45)).toBeNull()
  })

  it('stands a facade on the ground: a plinth band along the whole front, no strip open', () => {
    const facade = planFacade(plan, 'south')
    const plinths = facade.faces.filter((f) => f.kind === 'plinth')
    expect(plinths).toHaveLength(1)
    expect(plinths[0]).toMatchObject({ floor: 'ground', wall: null, u0: -0.15, u1: 10.15, bottom: -0.45, top: 0 })
    // It is drawn before the wall at its depth (VEW-29: the slab states no thickness, so no band of its own).
    expect(facade.faces.map((f) => f.kind)).toEqual(['plinth', 'wall', 'roof'])
    // The silhouette reaches the ground, the whole width of the house.
    expect(facade.outline).toHaveLength(1)
    const zs = facade.outline[0]!.map(([, z]) => z)
    expect(Math.min(...zs)).toBe(-0.45)
    expect(facade.extent!.bottom).toBe(-0.45)
  })

  it('cuts a plinth under each outside wall a section crosses, joined to the wall and the slab', () => {
    const section = planSection(plan, ACROSS)
    const plinth = section.parts.filter((p) => p.kind === 'plinth')
    expect(plinth).toHaveLength(1)
    expect(plinth[0]!.id).toBe('ground')
    expect(yRange(plinth[0]!.rings)).toEqual([-0.45, -0.25])
    expect(xRanges(plinth[0]!.rings)).toEqual([[1.85, 2.15], [9.85, 10.15]])
    // One cut piece, from the ground to the roof.
    expect(section.cut).toHaveLength(1)
    expect(Math.min(...section.cut[0]!.outline.map((p) => p.y))).toBe(-0.45)
    // The plinth's faces beyond the cut: the inside of the far one, seen under the slab.
    expect(section.beyond.some((f) => f.kind === 'plinth' && f.pieces.length > 0)).toBe(true)
    // The ground runs on under the house, so the plinths stand on it.
    expect(section.ground.segments).toEqual([[0, 12]])
    // VEW-65: the drawing takes in the earth, a metre under the ground the plinths stand on.
    expect(section.ground.earth.dug).toEqual([])
    expect(section.bounds.min.y).toBe(-1.45)
  })

  it('leaves a floor at the ground as it was: no ground stated, or the ground at the slab\'s foot', () => {
    for (const site of [undefined, { ground: -0.25 }, { ground: -0.1 }]) {
      const flat = house(site)
      expect(planFacade(flat, 'south').faces.some((f) => f.kind === 'plinth')).toBe(false)
      const section = planSection(flat, ACROSS)
      expect(section.parts.some((p) => p.kind === 'plinth')).toBe(false)
      expect(section.beyond.some((f) => f.kind === 'plinth')).toBe(false)
      expect(section.ground.segments).toEqual([[0, 1.85], [10.15, 12]])
    }
  })

  it('gives no plinth to a floor that says it stands on something other than the ground', () => {
    const raised = house({ ground: -0.45 }, { below: 'outside' })
    expect(planFacade(raised, 'south').faces.some((f) => f.kind === 'plinth')).toBe(false)
    expect(planSection(raised, ACROSS).parts.some((p) => p.kind === 'plinth')).toBe(false)
  })

  it('gives the plinth to the lowest floor only: the floor above stands on the one below', () => {
    const two = parseFloorPlan({
      ...house({ ground: -0.45 }),
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'First floor', level: 1 }
      ],
      walls: [...house(undefined).walls, wall('fs', [0, 0], [10, 0], 'first'), wall('fe', [10, 0], [10, 8], 'first'), wall('fn', [10, 8], [0, 8], 'first'), wall('fw', [0, 8], [0, 0], 'first')],
      rooms: [...house(undefined).rooms, { id: 'f', name: 'Bedroom', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' }]
    })
    const plinths = planFacade(two, 'south').faces.filter((f) => f.kind === 'plinth')
    expect(plinths.map((f) => f.floor)).toEqual(['ground'])
    const section = planSection(two, ACROSS)
    expect(section.parts.filter((p) => p.kind === 'plinth').map((p) => p.floor)).toEqual(['ground'])
    expect(section.cut).toHaveLength(1)
    expect(section.cut[0]!.holes.every((hole) => Math.abs(signedArea(hole)) > 0)).toBe(true)
  })
})
