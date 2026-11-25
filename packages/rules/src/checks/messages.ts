/**
 * The one wording of every finding and notice of the figure checks (MSG-1, AU4-1), by its key
 * in the message files (MSG-11). Plain words, rooms by their names: these lines are shown to the user as they are, so no
 * data-model words, and never anything that reads as "this plan complies".
 *
 * Each wording is written once, as parts (`wordings`): the report's `message` quotes the names
 * (`messages`, MSG-9), and the notes a person reads set them apart. Neither words a finding its
 * own way.
 */

import { figureText, type WordingPart } from '@ongrid/floorplan/geometry'
import { english, name, num, said, sayParts, type Said, type Value } from '@ongrid/floorplan/messages'

/** What a skipped figure check is called in its notice. */
export type FigureSubject = 'Room sizes' | 'Escape openings'

/** MSG-11: a figure check's subject by its key: `sizes` or `escapes`. */
const SUBJECT_KEY: Record<FigureSubject, 'sizes' | 'escapes'> = { 'Room sizes': 'sizes', 'Escape openings': 'escapes' }

/** A sentence as its runs in English, names set apart: the notes a person reads. */
const parts = (sentence: Said): WordingPart[] => sayParts('en', sentence.key, sentence.values)

/**
 * MSG-11: each wording by its key (`check.*` in the message files) and values. `readFor` and
 * `building` are the kinds of building as a sentence names them: a `Said`
 * (`buildingKindsSaid`, `buildingTypeSaid`), or their English.
 */
export const saids = {
  roomTooSmall: (room: string, minimum: number): Said => said('check.roomTooSmall', { room: name(room), minimum: num(figureText(minimum)) }),
  noEscapeOpening: (room: string): Said => said('check.noEscapeOpening', { room: name(room) }),
  noEscapeOpeningBelowGround: (room: string): Said => said('check.noEscapeOpening.belowGround', { room: name(room) }),
  escapeWindowTooSmall: (room: string): Said => said('check.escapeWindowTooSmall', { room: name(room) }),
  escapeWindowTooHigh: (room: string): Said => said('check.escapeWindowTooHigh', { room: name(room) }),
  /** One wording for one room or many, on one floor or several (MSG-1). */
  noUse: (floor: string, count: number): Said => said('check.noUse', { floor: name(floor), count }),
  /** `country`: Grid's name for the place, from its list (COD-3), never the text it was given. */
  noFiguresForPlace: (what: FigureSubject, country: string): Said => said('check.noFiguresForPlace', { what: said(`check.subject.${SUBJECT_KEY[what]}`), country }),
  /** COD-3 (lab W-12): no place is stated; the sentence no longer counts what the US figures would have given (the record's `withoutPlace.usLines` still does). */
  noPlace: (): Said => said('check.noPlace'),
  /** MSG-2 (lab CH-4): `count` bedrooms on a floor above the third storey. */
  aboveEscapeStoreys: (floor: string, count: number): Said => said('check.aboveEscapeStoreys', { floor: name(floor), count }),
  /** MSG-2 (lab CH-1): a plan with walls and no rooms. */
  noRooms: (): Said => said('check.noRooms'),
  /** CNT-5 (lab EL-2): the plan says it is a kind of building the check's figures were not read for. */
  notForBuilding: (what: FigureSubject, readFor: Value, building: Value): Said =>
    said('check.notForBuilding', { what: said(`check.subject.${SUBJECT_KEY[what]}`), readFor, building }),
  /** CNT-5: the same, for one floor the plan says is that kind. */
  floorNotForBuilding: (floor: string, what: FigureSubject, readFor: Value, building: Value): Said =>
    said('check.floorNotForBuilding', { floor: name(floor), what: said(`check.subject.${SUBJECT_KEY[what]}.inner`), readFor, building })
}

export const wordings = {
  roomTooSmall: (room: string, minimum: number): WordingPart[] => parts(saids.roomTooSmall(room, minimum)),
  noEscapeOpening: (room: string): WordingPart[] => parts(saids.noEscapeOpening(room)),
  noEscapeOpeningBelowGround: (room: string): WordingPart[] => parts(saids.noEscapeOpeningBelowGround(room)),
  escapeWindowTooSmall: (room: string): WordingPart[] => parts(saids.escapeWindowTooSmall(room)),
  escapeWindowTooHigh: (room: string): WordingPart[] => parts(saids.escapeWindowTooHigh(room)),
  noUse: (floor: string, count: number): WordingPart[] => parts(saids.noUse(floor, count)),
  noFiguresForPlace: (what: FigureSubject, country: string): WordingPart[] => parts(saids.noFiguresForPlace(what, country)),
  noPlace: (): WordingPart[] => parts(saids.noPlace()),
  aboveEscapeStoreys: (floor: string, count: number): WordingPart[] => parts(saids.aboveEscapeStoreys(floor, count)),
  noRooms: (): WordingPart[] => parts(saids.noRooms()),
  notForBuilding: (what: FigureSubject, readFor: Value, building: Value): WordingPart[] => parts(saids.notForBuilding(what, readFor, building)),
  floorNotForBuilding: (floor: string, what: FigureSubject, readFor: Value, building: Value): WordingPart[] => parts(saids.floorNotForBuilding(floor, what, readFor, building))
}

/** The same wordings as report lines, in English. */
export const messages = {
  roomTooSmall: (room: string, minimum: number): string => english(saids.roomTooSmall(room, minimum)),
  noEscapeOpening: (room: string): string => english(saids.noEscapeOpening(room)),
  noEscapeOpeningBelowGround: (room: string): string => english(saids.noEscapeOpeningBelowGround(room)),
  escapeWindowTooSmall: (room: string): string => english(saids.escapeWindowTooSmall(room)),
  escapeWindowTooHigh: (room: string): string => english(saids.escapeWindowTooHigh(room)),
  noUse: (floor: string, count: number): string => english(saids.noUse(floor, count)),
  noFiguresForPlace: (what: FigureSubject, country: string): string => english(saids.noFiguresForPlace(what, country)),
  noPlace: (): string => english(saids.noPlace()),
  aboveEscapeStoreys: (floor: string, count: number): string => english(saids.aboveEscapeStoreys(floor, count)),
  noRooms: (): string => english(saids.noRooms()),
  notForBuilding: (what: FigureSubject, readFor: Value, building: Value): string => english(saids.notForBuilding(what, readFor, building)),
  floorNotForBuilding: (floor: string, what: FigureSubject, readFor: Value, building: Value): string => english(saids.floorNotForBuilding(floor, what, readFor, building))
}
