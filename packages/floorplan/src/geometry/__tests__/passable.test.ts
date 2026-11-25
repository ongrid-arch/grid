/**
 * An opening counts as a way through only if a person fits through it (MSG-18, lab CH-6).
 *
 * The plans are the lab's: a hall and a bedroom side by side behind one dividing wall, with the
 * one opening each case is about. The sizes a person passes through are Grid's own
 * (`passableWidth`, `passableHeight`, `passableSill`), not code figures.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from '../plan'
import { checkPlanSanity, passageText } from '../rules'
import { floorGraph, shortOf } from '../rules/graph'
import { withTolerances } from '../tolerances'
import { planNotes } from '../../notes/notes'

const wall = (id: string, start: [number, number], end: [number, number], kind: 'exterior' | 'interior') => ({
  id,
  start,
  end,
  thickness: 0.2,
  height: 2.7,
  kind
})

const door = (id: string, onWall: string, extra: Partial<Opening> = {}): Opening => ({
  id,
  wall: onWall,
  type: 'door',
  offset: 1,
  width: 0.9,
  height: 2.1,
  sill: 0,
  ...extra
})

const windows: Opening[] = [
  { id: 'hall-win', wall: 'n', type: 'window', offset: 4, width: 1.2, sill: 0.9, height: 1.2 },
  { id: 'bed-win', wall: 's', type: 'window', offset: 4, width: 1.2, sill: 0.9, height: 1.2 }
]

/** The lab's two rooms, with the openings given and the two windows. */
function house(...openings: Opening[]): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [6.4, 0], 'exterior'),
      wall('e', [6.4, 0], [6.4, 3.2], 'exterior'),
      wall('n', [6.4, 3.2], [0, 3.2], 'exterior'),
      wall('w', [0, 3.2], [0, 0], 'exterior'),
      wall('mid', [3.2, 0], [3.2, 3.2], 'interior')
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s', 'mid', 'n', 'w'], use: 'living' },
      { id: 'bed', name: 'Bedroom', boundary: ['s', 'e', 'n', 'mid'], use: 'bedroom' }
    ],
    openings: [...windows, ...openings]
  }
}

const bedDoor = door('bed-door', 'mid')
const front = door('front', 's')
const codes = (plan: FloorPlan): string[] => checkPlanSanity(plan).findings.map((f) => `${f.code} ${f.rooms.join('+')}`)

describe('the lab cases that cleared their notes (CH-6)', () => {
  it('starts from plans whose notes the cases cleared', () => {
    expect(codes(house(bedDoor))).toEqual(['no_exit ', 'no_route_to_exit bed', 'no_route_to_exit hall'])
    expect(codes(house(front))).toEqual(['room_without_door bed'])
    expect(codes(house(bedDoor, front))).toEqual([])
  })

  it('a 5 x 5 cm hole in the outside wall is not the way out', () => {
    const slot: Opening = { id: 'slot', wall: 's', type: 'opening', offset: 1, width: 0.05, height: 0.05, sill: 0 }
    const report = checkPlanSanity(house(bedDoor, slot))
    expect(report.findings.map((f) => f.code)).toEqual(['no_exit', 'no_route_to_exit', 'no_route_to_exit', 'opening_too_small_to_pass'])
    expect(report.findings[3]).toMatchObject({
      ruleId: 'room-has-door',
      rooms: ['hall'],
      openings: ['slot'],
      message: 'An opening from "Hall" is too small for a person to get through, so it is not a way through',
      passage: { kind: 'opening', short: 'width', drawn: 0.05, passable: 0.4 }
    })
  })

  it('a door whose threshold is 1.5 m above the floor is not the way out', () => {
    const high = door('high', 's', { height: 1, sill: 1.5 })
    const report = checkPlanSanity(house(bedDoor, high))
    expect(report.findings.map((f) => f.code)).toEqual(['no_exit', 'no_route_to_exit', 'no_route_to_exit', 'opening_too_small_to_pass'])
    expect(report.findings[3]).toMatchObject({
      passage: { kind: 'door', short: 'sill', drawn: 1.5, passable: 0.3 }
    })
    expect(passageText(report.findings[3]!.passage!)).toBe('The door has its sill 1.50 m above the floor')
  })

  it('a 0.3 m door as a room\'s only door is not a door', () => {
    const slim = door('slim', 'mid', { width: 0.3 })
    const report = checkPlanSanity(house(front, slim))
    expect(report.findings.map((f) => `${f.code} ${f.rooms.join('+')}`)).toEqual([
      'opening_too_small_to_pass bed+hall',
      'room_without_door bed'
    ])
    expect(report.findings[0]!.message).toBe('An opening from "Bedroom" is too small for a person to get through, so it is not a way through')
    expect(report.findings[0]!.passage).toEqual({ kind: 'door', short: 'width', drawn: 0.3, passable: 0.4 })
  })
})

describe('the size a person passes through', () => {
  it('lets a door drawn at exactly the size through, and names one a millimetre short with the digits that show it', () => {
    const atSize = door('front', 's', { width: 0.4, height: 1.2, sill: 0.3 })
    expect(shortOf(atSize)).toBeNull()
    expect(codes(house(bedDoor, atSize))).toEqual([])
    const short = door('front', 's', { width: 0.399 })
    const passage = checkPlanSanity(house(bedDoor, short)).findings[3]!.passage!
    expect(passage).toEqual({ kind: 'door', short: 'width', drawn: 0.399, passable: 0.4 })
    expect(passageText(passage)).toBe('The door is 0.399 m wide')
  })

  it('names a door too low to pass, even stooping', () => {
    expect(shortOf(door('d', 'mid', { height: 1.1 }))).toBe('height')
    expect(codes(house(front, door('low', 'mid', { height: 1.1 })))).toEqual([
      'opening_too_small_to_pass bed+hall',
      'room_without_door bed'
    ])
  })

  it('takes a step at the threshold as at the floor', () => {
    expect(shortOf(door('d', 's', { sill: 0.2 }))).toBeNull()
  })

  it('reads the sizes from the table when the check runs', () => {
    const slim = door('slim', 'mid', { width: 0.3 })
    expect(withTolerances({ passableWidth: 0.25 }, () => codes(house(front, slim)))).toEqual([])
  })

  it('is no route, exit or door into a space not drawn in the floor graph', () => {
    const graph = floorGraph(house(front, door('slim', 'mid', { width: 0.3 })))
    expect(graph.links).toEqual([])
    expect(graph.exits.map((e) => e.opening)).toEqual(['front'])
    expect(graph.undrawn).toEqual([])
    expect(graph.tooSmall).toEqual([{ opening: 'slim', rooms: ['bed', 'hall'], short: 'width' }])
  })

  it('says nothing of a window, which is never a way through', () => {
    expect(floorGraph(house(front, bedDoor)).tooSmall).toEqual([])
  })

  it('is said in the notes with the sizes Grid uses, as its own and not a code figure', () => {
    const plan = house(front, door('slim', 'mid', { width: 0.3 }))
    const note = planNotes(plan, checkPlanSanity(plan)).notes.find((n) => n.id.startsWith('opening_too_small_to_pass'))!
    expect(note.title.map((p) => p.text).join('')).toBe('An opening from Bedroom is too small for a person to get through, so it is not a way through')
    expect(note.detail.map((p) => p.text).join('')).toBe(
      'The door is 0.30 m wide. Grid counts a door or an opening as a way through when it is at least 0.40 m wide and 1.20 m high, with its sill no more than 0.30 m above the floor. ' +
        "That is Grid's own size, not a code figure."
    )
  })
})
