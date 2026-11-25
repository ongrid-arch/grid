/**
 * WRT-25: a floor that moved up or down, or has another level, is a change, with its old and new
 * figures. Found when a mezzanine written at 13.75 m and written again at 4.25 m was answered as
 * the same building, and `grid diff` counted the move as a "wall or opening change".
 *
 * The warehouse is written rooms first: a hall on the ground floor and an office on a mezzanine.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { english, registerMessages, say, sayValue } from '../../messages/say'
import { es } from '../../messages/es'
import { compareBuildings, floorChanges } from '../diff'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  return { ...plan, written: stampFor(plan) }
}

const warehouse = (ground: string, mezzanine: string): string => `plan "Warehouse"
walls outside 0.3 inside 0.1 height 3
floor ground "Ground" level 0 ${ground}
room hall "Hall" storage 20 x 10 at 0,0
floor mezz "Mezzanine" ${mezzanine}
room office "Office" office 6 x 4 at 0,0
`

const high = written(warehouse('elevation 0 height 13', 'level 1 elevation 13.75 height 3'))
const low = written(warehouse('elevation 0 height 13', 'level 1 elevation 4.25 height 3'))

describe('a mezzanine moved down (lab: answered "the same building")', () => {
  const compared = compareBuildings(high, low)

  it('is not the same building', () => {
    expect(compared.sameBuilding).toBe(false)
  })

  it('says the floor first, with how far it moved and both elevations', () => {
    expect(compared.changes[0]?.text).toBe('Floor "Mezzanine" moved down 9.50 m: elevation 13.75 m → 4.25 m')
    expect(compared.changes[0]?.entities).toEqual([{ type: 'floor', id: 'mezz' }])
    expect(compared.changes).toHaveLength(1)
  })

  it('says it in the verdict, never as a wall or opening change', () => {
    expect(compared.verdict).toContain('Floor "Mezzanine" moved down 9.50 m: elevation 13.75 m → 4.25 m')
    expect(compared.verdict).not.toContain('wall or opening change')
  })

  it('keeps the figures as data', () => {
    expect(compared.floors).toEqual([
      expect.objectContaining({ floor: 'mezz', name: 'Mezzanine', level: null, elevation: { before: 13.75, after: 4.25 }, stands: { before: 13.75, after: 4.25 }, height: null, slab: null })
    ])
  })

  it('says the move up the other way round', () => {
    expect(compareBuildings(low, high).changes[0]?.text).toBe('Floor "Mezzanine" moved up 9.50 m: elevation 4.25 m → 13.75 m')
  })
})

describe('a floor that states no elevation', () => {
  const plain = (ground: string, mezzanine: string): FloorPlan => written(warehouse(ground, mezzanine))

  it('says a level changed, and where the floor stands now', () => {
    const before = plain('height 4', 'level 1 height 3')
    const after = plain('height 4', 'level 2 height 3')
    // Levels are an order: with nothing between them, level 2 stands where level 1 did.
    const [change] = floorChanges(before, after)
    expect(change).toMatchObject({ floor: 'mezz', level: { before: 1, after: 2 }, stands: null })
    expect(english(change!.said)).toBe('Floor "Mezzanine" level 1 → 2')
    expect(compareBuildings(before, after).sameBuilding).toBe(false)
  })

  it('says a floor raised by a taller storey under it, worked out as the 3D view stacks it', () => {
    const before = plain('height 4', 'level 1 height 3')
    const after = plain('height 13', 'level 1 height 3')
    const compared = compareBuildings(before, after)
    const lines = compared.changes.map((l) => l.text)
    expect(lines).toContain('Floor "Ground" height 4.00 m → 13.00 m')
    const moved = compared.floors.find((f) => f.floor === 'mezz')!
    expect(moved.stands!.after - moved.stands!.before).toBeCloseTo(9, 6)
    // The mezzanine stands on its slab (0.25 m, as none is stated) over the ground floor's ceiling.
    expect(lines).toContain('Floor "Mezzanine" moved up 9.00 m: standing at 4.25 → 13.25 m')
  })

  it('says an elevation stated where there was none', () => {
    const before = plain('height 13', 'level 1 height 3')
    const after = plain('height 13', 'level 1 elevation 4.25 height 3')
    const [change] = floorChanges(before, after)
    expect(english(change!.said)).toMatch(/^Floor "Mezzanine" moved down \d+\.\d\d m: elevation not stated → 4\.25 m; standing at \d+\.\d\d → 4\.25 m$/)
  })
})

describe('floors that did not change', () => {
  it('leave the same building the same', () => {
    const again = written(warehouse('elevation 0 height 13', 'level 1 elevation 13.75 height 3'))
    const compared = compareBuildings(high, again)
    expect(compared.floors).toEqual([])
    expect(compared.sameBuilding).toBe(true)
  })

  it('say nothing for a plan of one floor', () => {
    const one = written('plan "Shed"\nwalls outside 0.3 inside 0.1 height 3\nroom shed "Shed" storage 4 x 3 at 0,0\n')
    expect(floorChanges(one, one)).toEqual([])
  })

  it('pair floors by name only when asked, for two plans written apart', () => {
    const renamed = parseFloorPlan({ ...low, floors: low.floors!.map((f) => (f.id === 'mezz' ? { ...f, id: 'm1' } : f)), rooms: low.rooms.map((r) => (r.floor === 'mezz' ? { ...r, floor: 'm1' } : r)), walls: low.walls.map((w) => (w.floor === 'mezz' ? { ...w, floor: 'm1' } : w)) })
    expect(floorChanges(high, renamed)).toEqual([])
    expect(floorChanges(high, renamed, { byName: true }).map((f) => f.floor)).toEqual(['m1'])
  })
})

describe('in Spanish', () => {
  it('says the move with the words of es.ts', () => {
    registerMessages('es', es)
    const [change] = floorChanges(high, low)
    expect(sayValue('es', change!.said)).toBe('Planta "Mezzanine" bajada 9,50 m: cota 13,75 m → 4,25 m')
    expect(say('es', 'diff.floor.notStated')).toBe('sin indicar')
  })
})
