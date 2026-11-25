/**
 * A way out must lead somewhere real (MSG-17): to open air, never into a courtyard closed in on
 * every side (lab CH-6), and for a let, through its own rooms and the common parts, never through
 * another let's room (lab AB-1). Across floors the way is followed down the stairs (LVL-3).
 *
 * The infill houses are the lab's own (G/s08). The lets are the core's test flat and two-floor
 * house, with each room's tenure (CNT-5) stated.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Room } from '../plan'
import { checkPlanSanity } from '../rules'
import { floorGraph } from '../rules/graph'
import { planForFloor } from '../floors'
import { planNotes } from '../../notes/notes'
import { labPlan } from '../../test-support/lab'
import { edit, flat, stairHouse } from '../../test-support/plans'

const summary = (plan: FloorPlan): string[] =>
  checkPlanSanity(plan).findings.map((f) => `${f.code} ${f.floor} ${[...f.rooms, ...f.openings].join(',')}`)

const codes = (plan: FloorPlan): string[] => checkPlanSanity(plan).findings.map((f) => f.code)

describe('a way out leads to open air (lab CH-6)', () => {
  it('names a door onto a courtyard closed in on every side when it is the only way out', () => {
    // The lab's infill house with no street door and its courtyard not drawn as a room: before,
    // the door into the courtyard, in a wall stated exterior, was taken as the way out: no notes.
    const plan = labPlan('G/scenarios/s08g-infill-no-street-door-court-not-room.json')
    expect(summary(plan)).toEqual(['door_into_closed_court ground living,d-court', 'no_exit ground ',
      'no_route_to_exit ground backhall', 'no_route_to_exit ground bedA', 'no_route_to_exit ground bedB', 'no_route_to_exit ground link', 'no_route_to_exit ground living'])
    const graph = floorGraph(planForFloor(plan, 'ground'))
    expect(graph.exits).toEqual([])
    expect(graph.closedCourts).toEqual([{ room: 'living', opening: 'd-court' }])
  })

  it('says the courtyard door is not a way out in the words a person reads', () => {
    const plan = labPlan('G/scenarios/s08g-infill-no-street-door-court-not-room.json')
    const note = planNotes(plan, checkPlanSanity(plan)).notes.find((n) => n.id.startsWith('door_into_closed_court'))!
    expect(note.title.map((p) => p.text).join('')).toBe('A door from Living and kitchen opens onto an outside space closed in on every side, so it is not a way out')
  })

  it('gives the same house with its courtyard drawn as a room no door to the outside', () => {
    expect(codes(labPlan('G/scenarios/s08d-infill-no-street-door.json'))).toEqual(['no_exit', ...Array(6).fill('no_route_to_exit')])
  })

  it('says nothing of the courtyard door of a house with a street door', () => {
    expect(codes(labPlan('G/scenarios/s08a-infill-courtyard.json'))).toEqual([])
    expect(codes(labPlan('G/scenarios/s08b-infill-court-not-a-room.json'))).toEqual([])
    // The courtyard door is still not a way out.
    const graph = floorGraph(planForFloor(labPlan('G/scenarios/s08b-infill-court-not-a-room.json'), 'ground'))
    expect(graph.exits.map((e) => e.opening)).toEqual(['d-front'])
    expect(graph.closedCourts.map((e) => e.opening)).toEqual(['d-court'])
  })

  it('takes the courtyard door as the way out once a gate leads from the courtyard to the street', () => {
    // A gate through the back of the courtyard, a wall with no room on either side, to open ground.
    // The courtyard lies between x 2.5 and 7, y 8 and 12: the gate is in its east wall, at y 9.5.
    const plan = edit(labPlan('G/scenarios/s08g-infill-no-street-door-court-not-room.json'), (copy) => {
      copy.openings.push({ id: 'gate', wall: 'pw-e', type: 'door', offset: 9, width: 1, height: 2.1, sill: 0 } as Opening)
    })
    expect(codes(plan)).toEqual([])
    const graph = floorGraph(planForFloor(plan, 'ground'))
    expect(graph.exits.map((e) => e.opening)).toEqual(['d-court'])
    expect(graph.closedCourts).toEqual([])
  })

  it('reads a door onto a garden that is not closed in as a way out, as before', () => {
    expect(codes(flat())).toEqual([])
  })
})

/** The test flat as a house of rooms to let: the hall common, the three rooms each let alone. */
function letHouse(): FloorPlan {
  const tenure: Record<string, Room['tenure']> = { hall: 'common', kitchen: 'private', bedroom: 'private', bathroom: 'private' }
  const names: Record<string, string> = { hall: 'Hall', kitchen: 'Room 1', bedroom: 'Room 2', bathroom: 'Room 3' }
  return edit(flat(), (copy) => {
    copy.rooms = copy.rooms.map((r) => ({ ...r, name: names[r.id]!, use: r.id === 'hall' ? 'corridor' : 'bedroom', tenure: tenure[r.id] }))
  })
}

describe('a let is left through the common parts (lab AB-1)', () => {
  it('names a let reached only through another let', () => {
    // Room 3's only door opens into Room 2.
    const report = checkPlanSanity(letHouse())
    expect(report.findings.map((f) => [f.code, f.rooms, f.message])).toEqual([
      ['let_through_another_let', ['bathroom', 'bedroom'], 'The only way out of "Room 3" goes through "Room 2", private to another let']
    ])
    expect(report.findings[0]!.lets).toEqual({ own: ['bathroom'], through: ['bedroom'] })
    expect(report.findings[0]!.ruleId).toBe('room-reaches-exit')
  })

  it('says nothing once the room passed through is common, or the lets give Room 3 a door onto the hall', () => {
    const common = edit(letHouse(), (copy) => {
      copy.rooms.find((r) => r.id === 'bedroom')!.tenure = 'shared'
    })
    expect(codes(common)).toEqual([])
  })

  it('reads private rooms as one household where the plan marks no common parts', () => {
    const household = edit(letHouse(), (copy) => {
      copy.rooms.find((r) => r.id === 'hall')!.tenure = 'private'
    })
    expect(codes(household)).toEqual([])
  })

  it('takes a private bathroom in no flat as an en-suite, no let of its own', () => {
    const ensuite = edit(letHouse(), (copy) => {
      copy.rooms.find((r) => r.id === 'bathroom')!.use = 'bathroom'
    })
    expect(codes(ensuite)).toEqual([])
  })

  it('names a flat whose front door opens into a room another let holds', () => {
    // Flat F2 (Room 3) opens into Room 2, a room let alone; F1 is Room 1.
    const plan = edit(letHouse(), (copy) => {
      copy.flats = [{ id: 'F2', name: 'Flat 2', rooms: ['bathroom'] }]
    })
    const report = checkPlanSanity(plan)
    expect(report.findings.map((f) => [f.code, f.flat, f.message])).toEqual([
      ['let_through_another_let', 'F2', 'The only way out of the flat "Flat 2" goes through "Room 2", private to another let']
    ])
  })

  it('follows the way out of a let upstairs down the stair (LVL-3)', () => {
    // The stair joins the hall to the landing; the study's only door opens onto the landing.
    const upstairs = (landing: Room['tenure']): FloorPlan =>
      edit(stairHouse(), (copy) => {
        const tenure: Record<string, Room['tenure']> = { hall: 'common', landing, study: 'private', kitchen: 'common', bedroom: 'private', bathroom: undefined }
        copy.rooms = copy.rooms.map((r) => ({ ...r, tenure: tenure[r.id] }))
        // The study's balcony door is no way out upstairs.
        copy.openings = copy.openings.filter((o) => o.id !== 'balcony')
      })
    expect(summary(upstairs('private')).filter((s) => s.startsWith('let_'))).toEqual(['let_through_another_let first study,landing'])
    expect(summary(upstairs('common')).filter((s) => s.startsWith('let_'))).toEqual([])
  })
})
