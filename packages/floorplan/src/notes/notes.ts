/**
 * The plan checks as notes a person reads on the plan.
 *
 * A note's title is the finding's one wording (`geometry/rules/messages.ts`, MSG-1), the same
 * words as the report's `message`, with the names as their own segments so the list can set
 * them apart without parsing text. The detail says more, from the finding's code and ids. Pure.
 */
import { limit, metresText, passageText, planCheckWordings as wordings, planFloors, type RuleFinding, type RulesReport, type WordingPart } from '../geometry'
import type { FloorPlan } from '../types/floorplan'
import { english, said } from '../messages/say'

/** A run of text; `name` marks a room or floor name as the plan writes it. */
export type NoteText = WordingPart

export interface PlanNote {
  /** Stable for the same finding: code, floor, rooms and openings. */
  readonly id: string
  readonly floor: string
  /** The room to show; null for a note about a whole floor. */
  readonly room: string | null
  /** Set only on a room's note in a plan with more than one floor. */
  readonly floorName: string | null
  readonly title: readonly NoteText[]
  readonly detail: readonly NoteText[]
  /** What the note is about: getting out, or the building against its plot (BRF-3). */
  readonly tag: 'Exit' | 'Site'
}

export interface PlanNotesView {
  readonly notes: readonly PlanNote[]
  /** What the check did not cover, in its own words. Not notes, and not counted. */
  readonly notChecked: readonly string[]
  /** What the checks never look at, whatever the plan. The same lines every time. */
  readonly limits: readonly string[]
  /** Ends every list. */
  readonly label: string
}

const name = (text: string): NoteText => ({ text, name: true })
const words = (text: string): NoteText => ({ text })
const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`)

/** "A", "A and B", "A, B and C", each a name. */
function joined(rooms: readonly string[]): NoteText[] {
  return rooms.flatMap((room, i) => {
    const sep = i === 0 ? [] : [words(i === rooms.length - 1 ? ' and ' : ', ')]
    return [...sep, name(room)]
  })
}

export function planNotes(plan: FloorPlan, report: RulesReport): PlanNotesView {
  const floors = planFloors(plan)
  const floorNames = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const roomNames = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const doors = new Set(plan.openings.filter((o) => o.type === 'door').map((o) => o.id))
  const roomName = (id: string): string => roomNames.get(id) ?? id
  const floorName = (id: string): string => floorNames.get(id) ?? id
  const flatNames = new Map((plan.flats ?? []).map((f) => [f.id, f.name ?? f.id] as const))
  const flatName = (id: string): string => flatNames.get(id) ?? id

  // A floor whose only door out leads to a space not drawn words its cut-off rooms the longer way.
  const wayOutNotDrawn = new Set(report.notChecked.filter((n) => n.reason === 'way_out_not_drawn' || n.reason === 'way_out_through_common_parts').map((n) => n.floor))

  const noteOf = (finding: RuleFinding): PlanNote => {
    const room = finding.rooms[0] ?? null
    const id = [finding.code, finding.floor, finding.rooms.join(','), finding.openings.join(',')].join(':')
    const base = {
      id,
      floor: finding.floor,
      room: finding.code === 'no_exit' ? null : room,
      floorName: finding.code !== 'no_exit' && finding.code !== 'no_stair' && floors.length > 1 ? floorName(finding.floor) : null,
      tag: finding.code === 'setback_short' || finding.code === 'over_boundary' ? ('Site' as const) : ('Exit' as const)
    }
    switch (finding.code) {
      case 'no_route_to_exit': {
        const through = finding.through ?? []
        const beyond = [...new Set(through.map((step) => step.room))].map(roomName)
        const onlyDoor = through.length === 1 && doors.has(through[0]!.via)
        return {
          ...base,
          title: wayOutNotDrawn.has(finding.floor) ? wordings.noRouteToAnyDoorOut(roomName(room!)) : wordings.noRoute(roomName(room!)),
          // `through` is optional in the report: an older one, or a future code path, may lack it.
          detail: beyond.length === 0
            ? [words('None of its doors leads to a way out.')]
            : onlyDoor
            ? [words('Its only door opens into '), ...joined(beyond), words('.')]
            : [words('It only opens into '), ...joined(beyond), words('.')]
        }
      }
      case 'room_without_door':
        return {
          ...base,
          title: wordings.roomWithoutDoor(roomName(room!)),
          detail: [words('Nothing joins it to another room.')]
        }
      case 'no_exit':
        return {
          ...base,
          title: wordings.noExit(floorName(finding.floor), finding.openings.length > 0),
          detail: [words(finding.openings.length > 0 ? english(said('check.detail.noExitCannotPass')) : 'No door leads outside.')]
        }
      // LVL-14: a floor above the ground that nothing joins to the ground floor.
      case 'no_stair':
        return {
          ...base,
          title: wordings.noStair(floorName(finding.floor)),
          detail: [words(english(said('check.detail.noStair')))]
        }
      case 'door_to_undrawn_space':
        return {
          ...base,
          title: wordings.doorToUndrawnSpace(roomName(room!)),
          detail: [words("If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.")]
        }
      // CNT-6 (lab EL-4, R-10): homes kept apart, and a flat's front door.
      case 'door_between_homes': {
        const other = finding.rooms[1]
        const open = finding.openings[0] !== undefined && !plan.openings.some((o) => o.id === finding.openings[0])
        return {
          ...base,
          title: wordings.betweenHomes(roomName(room!), other === undefined ? null : roomName(other), open),
          detail: [words(english(said('check.detail.betweenHomes')))]
        }
      }
      case 'flat_without_front_door':
        return {
          ...base,
          title: wordings.flatWithoutFrontDoor(flatName(finding.flat ?? '')),
          detail: [words(english(said('check.detail.flatWithoutFrontDoor')))]
        }
      case 'flat_entrance_without_door':
        return {
          ...base,
          title: wordings.flatEntranceWithoutDoor(flatName(finding.flat ?? '')),
          detail: [words(english(said('check.detail.flatEntranceWithoutDoor')))]
        }
      case 'door_to_outside_above_ground':
        return {
          ...base,
          title: finding.elevation === undefined ? [words(finding.message)] : wordings.doorOutAboveGround(roomName(room!), metresText(finding.elevation)),
          detail: [words('It is not counted as a way out. If it opens onto a balcony, a terrace or an outside stair, draw that as a room.')]
        }
      case 'stair_out_of_line':
      case 'lift_out_of_line': {
        const stair = finding.code === 'stair_out_of_line'
        return {
          ...base,
          title: [words(stair ? 'The stair ' : 'The lift shaft '), name(roomName(room!)), words(' does not line up with the floor below')],
          detail: [
            words(
              stair
                ? 'It lies over no stair room on the floor below, so the way out is not followed down it. Move it over the stair below, or state the stair in the plan\'s stairs.'
                : 'It lies over no lift shaft on the floor below. Move it over the shaft below.'
            )
          ]
        }
      }
      case 'stair_shifted':
      case 'lift_shifted': {
        // LVL-5: the finding's own sentence says where and by how much.
        return {
          ...base,
          title: [words(finding.message)],
          detail: [words('If it is meant, mark the room with overhang "meant". Otherwise move it back over the one below.')]
        }
      }
      case 'opening_below_ground': {
        const opening = plan.openings.find((o) => o.id === finding.openings[0])
        const wall = opening?.wall ?? finding.openings[0] ?? ''
        const depth = finding.belowGround === undefined ? 0 : finding.belowGround.wholly ? finding.belowGround.top : finding.belowGround.foot
        return {
          ...base,
          title: wordings.belowGround(opening?.type ?? 'window', room === null ? null : roomName(room), wall, finding.belowGround?.wholly ?? false, metresText(depth)),
          detail: [words('The ground level is the one the site states. If the ground in front of it is dug away, for a light well or an outside stair, draw that space.')]
        }
      }
      case 'setback_short':
      case 'over_boundary':
        // BRF-3: the distance and the set-back, as the finding words them; the figures are the person's.
        return {
          ...base,
          room: null,
          floorName: null,
          title: [words(finding.message)],
          detail: [
            words(
              (finding.boundary?.northStated === false ? 'The ways are read with north as the top of the drawing: the plan states no north. ' : '') +
                "Measured from the building's outside face, every floor at or above the ground floor, to the edge of the plot's boundary. The set-back is your own figure, not a code's."
            )
          ]
        }
      case 'door_into_closed_court':
        return {
          ...base,
          title: wordings.doorIntoClosedCourt(roomName(room!)),
          detail: [words(english(said('check.detail.doorIntoClosedCourt')))]
        }
      // LVL-17: a door between floors further apart than a step, named with both levels.
      case 'door_between_levels': {
        const l = finding.levels
        const kind = doors.has(finding.openings[0] ?? '') ? 'door' : 'opening'
        return {
          ...base,
          title:
            l === undefined
              ? [words(finding.message)]
              : wordings.doorBetweenLevels(kind, roomName(l.lower.room), metresText(l.lower.at), roomName(l.upper.room), metresText(l.upper.at), metresText(l.rise, 2, limit('passableRise'))),
          detail: [words(english(said('check.detail.doorBetweenLevels')))]
        }
      }
      case 'let_through_another_let': {
        const lets = finding.lets
        const who = finding.flat !== undefined ? flatName(finding.flat) : roomName(room!)
        return {
          ...base,
          title: wordings.letThroughAnotherLet(who, (lets?.through ?? []).map(roomName), finding.flat !== undefined),
          detail: [words(english(said('check.detail.letThroughAnotherLet')))]
        }
      }
      case 'opening_too_small_to_pass': {
        const p = finding.passage
        return {
          ...base,
          title: wordings.openingTooSmall(roomName(room!)),
          detail: [
            words(p === undefined ? '' : `${passageText(p)}. `),
            words(
              `Grid counts a door or an opening as a way through when it is at least ${metresText(limit('passableWidth'))} m wide and ` +
                `${metresText(limit('passableHeight'))} m high, with its sill no more than ${metresText(limit('passableSill'))} m above the floor. ` +
                "That is Grid's own size, not a code figure."
            )
          ]
        }
      }
    }
  }

  return {
    notes: report.findings.map(noteOf),
    notChecked: report.notChecked.map((n) => sentence(n.message)),
    limits: report.limits.map(sentence),
    label: sentence(report.label)
  }
}
