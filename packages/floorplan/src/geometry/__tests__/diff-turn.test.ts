/**
 * WRT-4: a mirrored or turned plan is said to be so in the comparison's first sentence, before
 * any wall is listed (lab Y-5), and a flat entered with its y running down the page reads as the
 * flat mirrored top to bottom (lab WR-16). The flat is the repository's two-bedroom flat, the
 * lab's own: its WR-16 entry is this flat with every y taken from 7.6, as built here.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type OpeningPattern } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { compareBuildings, diffPlans, findTurn, turnPlan } from '../diff'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'

const FIXTURES = resolve(__dirname, '../../../fixtures')
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, 'two-bed-flat.json'), 'utf8')))

/**
 * Every point of the walls moved by `map`, ids and offsets as they were, and a mirror's swings
 * turned to the other face; the rooms' wall lists as they were, as the lab's WR-16 file has them.
 */
function moved(plan: FloorPlan, map: (p: readonly [number, number]) => [number, number], mirrored: boolean): FloorPlan {
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, start: map(w.start), end: map(w.end) })),
    openings: plan.openings.map((o) => (mirrored && o.swing !== undefined ? { ...o, swing: o.swing === 'left' ? ('right' as const) : ('left' as const) } : o)),
  }
}

describe('a plan mirrored or turned (lab Y-5, WR-16)', () => {
  it('reads a flat entered with y running down the page as the flat mirrored top to bottom, every room its size (WR-16)', () => {
    const before = flat()
    // As the lab's agent entered it: y from the top of the page, every id and offset as drawn.
    const yDown = moved(before, (p) => [p[0], Math.round((7.6 - p[1]) * 1000) / 1000], true)
    // Today: the id diff lists the walls as moved.
    expect(diffPlans(before, yDown).changes.filter((c) => c.entity.type === 'wall').length).toBeGreaterThan(4)
    const compared = compareBuildings(before, yDown)
    expect(compared.turn).toMatchObject({ id: 'mirror-top-bottom', mirrored: true, degrees: 0 })
    expect(compared.verdict.split('. ')[0]).toBe('The plan is mirrored top to bottom (north and south swap), and every room keeps its size')
    expect(compared.changes).toEqual([])
    expect(compared.sameBuilding).toBe(false)
    expect(compared.rooms.every((room) => room.status === 'unchanged')).toBe(true)
  })

  it('says a plan mirrored left to right is mirrored, and lists nothing else, under new ids too (Y-5)', () => {
    const before = flat()
    const after = moved(before, (p) => [9.2 - p[0], p[1]], true)
    const compared = compareBuildings(before, after)
    expect(compared.verdict).toBe('The plan is mirrored left to right (east and west swap), and every room keeps its size. Nothing else changed.')
    expect(compared.changes).toEqual([])
    expect(compared.issues).toEqual([])
  })

  it("reads a plan's opening patterns as the openings they place, so a pattern's doors mirror with the rest (LVL-8)", () => {
    const garden: OpeningPattern = { id: 'garden', wall: 'ext-north', opening: { type: 'door', width: 0.9, height: 2.1, sill: 0, hinge: 'start', swing: 'left' }, count: 2, margins: { start: 5, end: 1 } }
    const before = { ...flat(), patterns: [garden] }
    const swung: OpeningPattern = { ...garden, opening: { ...garden.opening, swing: 'right' } }
    const mirrored = { ...moved(flat(), (p) => [Math.round((9.2 - p[0]) * 1000) / 1000, p[1]], true), patterns: [swung] }
    const compared = compareBuildings(before, mirrored)
    expect(compared.turn).toMatchObject({ id: 'mirror-left-right', mirrored: true })
    expect(compared.changes).toEqual([])
    // The pattern's doors left swinging as they were are the only change, by the ids it gives them.
    const unswung = compareBuildings(before, { ...mirrored, patterns: [garden] })
    expect(unswung.turn).toMatchObject({ id: 'mirror-left-right' })
    expect(unswung.changes.length).toBeGreaterThan(0)
    expect(JSON.stringify(unswung.changes)).toContain('garden-')
  })

  it('tells each quarter turn and the half turn apart, counter-clockwise as Grid draws it', () => {
    const before = flat()
    const cases = [
      { map: (p: readonly [number, number]): [number, number] => [-p[1], p[0]], id: 'turn-90', text: 'The plan is turned a quarter counter-clockwise' },
      { map: (p: readonly [number, number]): [number, number] => [p[1], -p[0]], id: 'turn-270', text: 'The plan is turned a quarter clockwise' },
      { map: (p: readonly [number, number]): [number, number] => [-p[0], -p[1]], id: 'turn-180', text: 'The plan is turned half round' },
      { map: (p: readonly [number, number]): [number, number] => [p[1], p[0]], id: 'mirror-diagonal', text: 'The plan is mirrored across the diagonal from bottom left to top right' },
    ] as const
    for (const { map, id, text } of cases) {
      const mirrored = id.startsWith('mirror')
      const compared = compareBuildings(before, moved(before, map, mirrored))
      expect(compared.turn?.id, id).toBe(id)
      expect(compared.verdict.startsWith(`${text}`), id).toBe(true)
      expect(compared.verdict, id).toContain('every room keeps its size')
      expect(compared.changes, id).toEqual([])
    }
  })

  it('lists what else changed after the turn, room by room, and drops "keeps its size" when one did not', () => {
    const before = flat()
    const after = moved(before, (p) => [9.2 - p[0], p[1]], true)
    // The kitchen's east wall moved 0.3 m into the hall after the mirror.
    const kitchen = after.rooms.find((r) => r.id === 'kitchen')!
    const hall = after.rooms.find((r) => r.id === 'hall')!
    const shared = kitchen.boundary.find((id) => hall.boundary.includes(id))!
    const wall = after.walls.find((w) => w.id === shared)!
    const dx = wall.start[0] > 4 ? -0.3 : 0.3
    const resized = { ...after, walls: after.walls.map((w) => (w.id === shared ? { ...w, start: [w.start[0] + dx, w.start[1]] as [number, number], end: [w.end[0] + dx, w.end[1]] as [number, number] } : w)) }
    const compared = compareBuildings(before, resized)
    expect(compared.turn?.id).toBe('mirror-left-right')
    // The mirror first, even before the issue the moved wall raises; then what changed.
    expect(compared.verdict).toMatch(/^The plan is mirrored left to right \(east and west swap\)\. (\d+ issues? to look at first\. )?Besides, 5 changes, room by room: /)
    expect(compared.verdict).toContain('"Kitchen" 13.20 m² → 14.10 m²')
    expect(compared.changes.map((c) => c.text)).toContain('Wall "spine" moved 0.30 m, by "Living room", "Kitchen", "Hall" and "Bedroom 1"')
    expect(compared.changes.length).toBeGreaterThan(0)
  })

  it('does not call a plan turned when the plain way stands as many walls in place', () => {
    const before = flat()
    expect(findTurn(before, before)).toBeNull()
    const box = parseFloorPlan({
      walls: [
        { id: 's', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.6 },
        { id: 'e', start: [4, 0], end: [4, 4], thickness: 0.2, height: 2.6 },
        { id: 'n', start: [4, 4], end: [0, 4], thickness: 0.2, height: 2.6 },
        { id: 'w', start: [0, 4], end: [0, 0], thickness: 0.2, height: 2.6 },
      ],
      rooms: [{ id: 'r', name: 'Room', boundary: ['s', 'e', 'n', 'w'] }],
      openings: [],
    })
    // A square room is itself turned or mirrored: it is the same room, not a turned one.
    expect(compareBuildings(box, turnPlan(box, 'turn-90')).turn).toBeNull()
  })

  it('reads a flat written rooms first and mirrored as mirrored, its rooms by their own names', () => {
    const result = compileRoomsText(readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8'))
    const plan = parseFloorPlan(result.plan)
    const before = { ...plan, written: stampFor(plan) }
    const after = turnPlan(before, 'mirror-left-right')
    const compared = compareBuildings(before, after)
    expect(compared.roomsFirst).toBe(true)
    expect(compared.turn?.id).toBe('mirror-left-right')
    expect(compared.changes).toEqual([])
  })

  // MSG-21: the mirrored copy of the earlier plan kept each room's old boundary fingerprint, so
  // every room read as edited by hand, was left out as broken, and each opening joined "a space
  // that is not drawn".
  it('compares a flat written rooms first and mirrored with no issues, every room its size (MSG-21)', () => {
    const result = compileRoomsText(readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8'))
    const plan = parseFloorPlan(result.plan)
    const before = { ...plan, written: stampFor(plan) }
    // As the mirror edit writes it: the walls mirrored, and the rooms' boundaries printed again.
    const mirrored = turnPlan(plan, 'mirror-left-right')
    const after = { ...mirrored, written: stampFor(mirrored) }
    const compared = compareBuildings(before, after)
    expect(compared.issues).toEqual([])
    expect(compared.verdict).toBe('The plan is mirrored left to right (east and west swap), and every room keeps its size. Nothing else changed.')
    expect(compared.rooms.every((room) => room.status === 'unchanged')).toBe(true)
  })

  it('keeps a plan written rooms first drawable when it mirrors it, and a room edited by hand still edited (MSG-21)', () => {
    const result = compileRoomsText(readFileSync(join(FIXTURES, 'rooms/flat.rooms'), 'utf8'))
    const plan = parseFloorPlan(result.plan)
    const stamped = { ...plan, written: stampFor(plan) }
    const derivedEdited = (p: FloorPlan): string[] => validatePlan(p, indexPlan(p)).issues.filter((i) => i.code === 'room/derived-edited').map((i) => i.id)
    for (const id of ['mirror-left-right', 'mirror-top-bottom', 'turn-90', 'mirror-diagonal'] as const) expect(derivedEdited(turnPlan(stamped, id))).toEqual([])
    // One room's walls listed from another wall by hand: found before the mirror and after it.
    const room = stamped.rooms[0]!
    const edited = { ...stamped, rooms: stamped.rooms.map((r) => (r.id === room.id ? { ...r, boundary: [...r.boundary.slice(1), r.boundary[0]!] } : r)) }
    expect(derivedEdited(edited)).toEqual([room.id])
    expect(derivedEdited(turnPlan(edited, 'mirror-left-right'))).toEqual([room.id])
  })
})
