/**
 * The one wording of every finding and notice of the plan checks (MSG-1, AU4-1), by its key in
 * the message files (MSG-11). Plain words,
 * rooms by their names: these lines are shown to the user as they are, so no data-model words,
 * and never anything that reads as "this plan complies".
 *
 * Each wording is written once, as parts (`wordings`), and every place that shows it uses it:
 * the report's `message` quotes the names (`messages`, MSG-9: a room named with a sentence still
 * reads as a name), the notes a person reads set the names apart (`notes.ts`), and the result
 * record (`@ongrid/rules`) repeats the message. None of them words a finding its own way.
 */

import { quoted } from '../../types/planText'
import { english, joined, name, num, said, sayParts, type MessageKey, type Said, type Value } from '../../messages/say'
import { metresText } from '../rounding'
import type { RuleFinding } from './types'

/** A run of a wording; `name` marks a room or floor name as the plan writes it. */
export interface WordingPart {
  readonly text: string
  readonly name?: true
}

/** A wording as one line of text, every name in quotes. */
export function wordingText(parts: readonly WordingPart[]): string {
  return parts.map((part) => (part.name ? quoted(part.text) : part.text)).join('')
}

/** A sentence as its runs in English, names set apart: the notes a person reads. */
const parts = (sentence: Said): WordingPart[] => sayParts('en', sentence.key, sentence.values)

/** The kinds of opening a plan has (C2). */
export type OpeningKind = 'door' | 'window' | 'opening'

/** How a list of openings is named: `these doors`, `those doors`, or the plain `doors`. */
export type OpeningsDeterminer = 'these' | 'those' | 'plain'

/**
 * LVL-5 (lab A-16, MS-13): openings named by what they are, never a window called a door: `this
 * window`, `these doors`, `these doors and windows`. With no kinds given, the words of every kind
 * (`these doors or windows`). MSG-11: by key (`check.openings.*`), in any language.
 */
export function openingsSaid(kinds: readonly OpeningKind[] | undefined, count: number, determiner: OpeningsDeterminer): Said {
  const order: readonly OpeningKind[] = ['door', 'window', 'opening']
  const present = kinds === undefined || kinds.length === 0 ? [] : order.filter((k) => kinds.includes(k))
  if (present.length === 0) return said(`check.openings.any.${determiner}`)
  if (present.length === 1) {
    const one = { these: 'this', those: 'that', plain: 'a' } as const
    return said(`check.openings.${present[0]!}.${count === 1 ? one[determiner] : determiner}` as MessageKey)
  }
  return said(`check.openings.mixed.${determiner}`, { kinds: joined(present.map((k) => said(`check.openings.${k}.plain` as MessageKey)), 'join.comma', 'join.and') })
}

/** Whether `openingsSaid` names one opening of a known kind, and so says `it` of it. */
export const oneKnownOpening = (kinds: readonly OpeningKind[] | undefined, count: number): boolean => count === 1 && kinds !== undefined && kinds.length > 0

/**
 * LVL-5: the same names in English (`openingsSaid`), with the words for them that go with it:
 * `it` for one opening of a known kind, `they` for the rest.
 */
export function openingWords(kinds: readonly OpeningKind[] | undefined, count: number): { these: string; plain: string; they: string; them: string } {
  const one = oneKnownOpening(kinds, count)
  return { these: english(openingsSaid(kinds, count, 'these')), plain: english(openingsSaid(kinds, count, 'plain')), they: one ? 'it' : 'they', them: one ? 'it' : 'them' }
}

/**
 * MSG-11: each wording by its key (`check.*` in the message files) and values, so the report,
 * the notes and the record say it in any language from one wording.
 */
export const saids = {
  noExit: (floor: string): Said => said('check.noExit', { floor: name(floor) }),
  roomWithoutDoor: (room: string): Said => said('check.roomWithoutDoor', { room: name(room) }),
  noRoute: (room: string): Said => said('check.noRoute', { room: name(room) }),
  noRouteToAnyDoorOut: (room: string): Said => said('check.noRouteToAnyDoorOut', { room: name(room) }),
  noStairs: (floor: string): Said => said('check.noStairs', { floor: name(floor) }),
  noStair: (floor: string): Said => said('check.noStair', { floor: name(floor) }),
  /**
   * LVL-3: rooms used as a stair (or a lift) on one level that lie over none on the level below.
   * `upper` and `lower` hold at least one name each; floors likewise.
   */
  outOfLine: (kind: 'stair' | 'lift', upper: readonly string[], upperFloors: readonly string[], lower: readonly string[], lowerFloors: readonly string[]): Said =>
    said(`check.outOfLine.${kind}`, {
      upper: joined(upper.map(name), 'join.and'),
      upperFloors: joined(upperFloors.map(name), 'join.and'),
      lower: joined(lower.map(name), 'join.or'),
      lowerFloors: joined(lowerFloors.map(name), 'join.and')
    }),
  /**
   * LVL-5 (lab WR-9): a stair room or a lift shaft moved from the one below it. `shift` says how
   * far and which way, by `shiftedSaid`, and `upperAt` and `lowerAt` where each stands
   * (`shiftedBoxSaid`).
   */
  shifted: (kind: 'stair' | 'lift', upper: string, upperFloor: string, lower: string, lowerFloor: string, how: Said, upperAt: Value, lowerAt: Value): Said =>
    said(`check.shifted.${kind}`, { upper: name(upper), upperFloor: name(upperFloor), how, lower: name(lower), lowerFloor: name(lowerFloor), upperAt, lowerAt }),
  wayOutNotDrawn: (floor: string): Said => said('check.wayOutNotDrawn', { floor: name(floor) }),
  /**
   * `rooms` holds at least one name. One wording for one room or many (MSG-1). MSG-5: what rests
   * on them (a door beside them, the floor's way out) was not checked either.
   */
  roomsNotDrawn: (floor: string, rooms: readonly string[]): Said => said('check.roomsNotDrawn', { floor: name(floor), rooms: joined(rooms.map(name), 'join.comma') }),
  /**
   * MSG-5: `openings` holds at least one id, and names them. LVL-5: `kinds`, the type of each, words
   * them as what they are (`openingsSaid`).
   */
  doorsNotDrawn: (floor: string, openings: readonly string[], kinds?: readonly OpeningKind[]): Said => {
    const listed = { floor: name(floor), openings: joined(openings.map(name), 'join.comma') }
    if (kinds === undefined || kinds.length === 0) return said('check.doorsNotDrawn', listed)
    return said(`check.doorsNotDrawn.kinds.${oneKnownOpening(kinds, openings.length) ? 'one' : 'many'}`, { ...listed, these: openingsSaid(kinds, openings.length, 'these') })
  },
  doorToUndrawnSpace: (room: string): Said => said('check.doorToUndrawnSpace', { room: name(room) }),
  /**
   * CNT-6 (lab EL-4): a door, or an open side, between rooms of two different homes (`other` is the
   * room in the other home), or a door through a wall the plan says has a neighbour beyond it
   * (`other` null).
   */
  betweenHomes: (room: string, other: string | null, open: boolean): Said =>
    other === null ? said('check.doorIntoNeighbour', { room: name(room) }) : said(open ? 'check.openBetweenHomes' : 'check.doorBetweenHomes', { room: name(room), other: name(other) }),
  /** CNT-6 (lab R-10): a flat none of whose doors opens onto a common part, a space not drawn or the outside. */
  flatWithoutFrontDoor: (flat: string): Said => said('check.flatWithoutFrontDoor', { flat: name(flat) }),
  /** CNT-6 (lab R-10): the floor's way out goes on through common parts the plan does not draw. */
  wayOutThroughCommonParts: (floor: string): Said => said('check.wayOutThroughCommonParts', { floor: name(floor) }),
  /** `height` as the check prints it, in metres. */
  doorOutAboveGround: (room: string, height: string): Said => said('check.doorOutAboveGround', { room: name(room), height: num(height) }),
  /**
   * LVL-4: a door, window or opening in an outside wall that lies below the ground the site states
   * (lab VE-7). Its depth is the finding's `belowGround`: its top when it lies wholly below, else its foot.
   */
  belowGround: (kind: 'door' | 'window' | 'opening', room: string | null, wall: string, wholly: boolean, depth: string): Said => {
    const end = wholly ? 'top' : kind === 'window' ? 'sill' : kind === 'door' ? 'threshold' : 'foot'
    return said(`check.belowGround.${wholly ? 'wholly' : 'partly'}`, {
      what: said(`check.below.${kind}.${room === null ? 'wall' : 'room'}` as MessageKey, room === null ? { wall: name(wall) } : { room: name(room) }),
      end: said(`check.below.end.${end}` as MessageKey),
      depth: num(depth)
    })
  },
  /** MSG-18: a door or doorless opening no person fits through. Its size is the finding's `passage`. */
  openingTooSmall: (room: string): Said => said('check.openingTooSmall', { room: name(room) }),
  /** MSG-17 (lab CH-6): a door onto outside floor closed in on every side, with no way on to the open air. */
  doorIntoClosedCourt: (room: string): Said => said('check.doorIntoClosedCourt', { room: name(room) }),
  /**
   * LVL-17: a door or doorless opening between rooms whose floors stand further apart than a step.
   * The levels and the rise in metres as the check prints them; the lower room first.
   */
  doorBetweenLevels: (kind: 'door' | 'opening', lower: string, lowerAt: string, upper: string, upperAt: string, rise: string): Said =>
    said(`check.doorBetweenLevels.${kind}`, { lower: name(lower), lowerAt: num(lowerAt), upper: name(upper), upperAt: num(upperAt), rise: num(rise) }),
  /** MSG-17 (lab AB-1): a let left only through other lets' rooms; `flat` when the let is a flat. */
  letThroughAnotherLet: (lot: string, through: readonly string[], flat: boolean): Said =>
    said(flat ? 'check.letThroughAnotherLet.flat' : 'check.letThroughAnotherLet', { let: name(lot), through: joined(through.map(name), 'join.comma', 'join.and') }),
  /**
   * BRF-3 (lab EL-16): the set-back the person asked for, in their words: "you asked for 3.00 m", or
   * for one assumed for them, that it is assumed. Their figure, never a code's. `asked` in metres.
   */
  asked: (asked: string, source: 'given' | 'assumed' | null): Said => said(source === 'assumed' ? 'check.asked.assumed' : 'check.asked', { asked: num(asked) }),
  /** BRF-3: the building stands nearer an edge of its plot than the set-back asked for. `boundary` names the edge (`boundaryEdgeSaid`). */
  setbackShort: (distance: string, boundary: Value, asked: string, source: 'given' | 'assumed' | null): Said =>
    said('check.setbackShort', { distance: num(distance), boundary, asked: saids.asked(asked, source) }),
  /** BRF-3: the building reaches past an edge of its plot. */
  overBoundary: (past: string, boundary: Value): Said => said('check.overBoundary', { past: num(past), boundary })
}

export const wordings = {
  noExit: (floor: string): WordingPart[] => parts(saids.noExit(floor)),
  roomWithoutDoor: (room: string): WordingPart[] => parts(saids.roomWithoutDoor(room)),
  noRoute: (room: string): WordingPart[] => parts(saids.noRoute(room)),
  noRouteToAnyDoorOut: (room: string): WordingPart[] => parts(saids.noRouteToAnyDoorOut(room)),
  noStairs: (floor: string): WordingPart[] => parts(saids.noStairs(floor)),
  noStair: (floor: string): WordingPart[] => parts(saids.noStair(floor)),
  outOfLine: (...args: Parameters<typeof saids.outOfLine>): WordingPart[] => parts(saids.outOfLine(...args)),
  shifted: (...args: Parameters<typeof saids.shifted>): WordingPart[] => parts(saids.shifted(...args)),
  wayOutNotDrawn: (floor: string): WordingPart[] => parts(saids.wayOutNotDrawn(floor)),
  roomsNotDrawn: (floor: string, rooms: readonly string[]): WordingPart[] => parts(saids.roomsNotDrawn(floor, rooms)),
  doorsNotDrawn: (floor: string, openings: readonly string[], kinds?: readonly OpeningKind[]): WordingPart[] => parts(saids.doorsNotDrawn(floor, openings, kinds)),
  doorToUndrawnSpace: (room: string): WordingPart[] => parts(saids.doorToUndrawnSpace(room)),
  betweenHomes: (room: string, other: string | null, open: boolean): WordingPart[] => parts(saids.betweenHomes(room, other, open)),
  flatWithoutFrontDoor: (flat: string): WordingPart[] => parts(saids.flatWithoutFrontDoor(flat)),
  wayOutThroughCommonParts: (floor: string): WordingPart[] => parts(saids.wayOutThroughCommonParts(floor)),
  doorOutAboveGround: (room: string, height: string): WordingPart[] => parts(saids.doorOutAboveGround(room, height)),
  belowGround: (...args: Parameters<typeof saids.belowGround>): WordingPart[] => parts(saids.belowGround(...args)),
  openingTooSmall: (room: string): WordingPart[] => parts(saids.openingTooSmall(room)),
  doorIntoClosedCourt: (room: string): WordingPart[] => parts(saids.doorIntoClosedCourt(room)),
  doorBetweenLevels: (...args: Parameters<typeof saids.doorBetweenLevels>): WordingPart[] => parts(saids.doorBetweenLevels(...args)),
  letThroughAnotherLet: (lot: string, through: readonly string[], flat: boolean): WordingPart[] => parts(saids.letThroughAnotherLet(lot, through, flat))
}

/**
 * What a door or opening no person fits through falls short at, as drawn (MSG-18): "It is 0.30 m
 * wide", "Its sill is 1.50 m above the floor". `drawn` is already printed against the size.
 */
export function passageSaid(passage: NonNullable<RuleFinding['passage']>): Said {
  const size = num(metresText(passage.drawn, 2, passage.passable))
  return said(`check.passage.${passage.kind}.${passage.short}`, { size })
}

export function passageText(passage: NonNullable<RuleFinding['passage']>): string {
  return english(passageSaid(passage))
}

/** A way on the drawing, east (+x) or west, north (+y) or south. */
const wayOf = (axis: 'x' | 'y', by: number): Said => said(`describe.way.${axis === 'x' ? (by > 0 ? 'east' : 'west') : by > 0 ? 'north' : 'south'}`)

/**
 * LVL-5 (lab WR-9): how far a stair room or a shaft is moved from the one below, and which way:
 * `moved` east and north ("1.20 m east"), or for a shaft not moved as a whole, each side that
 * stands off the one below's ("its east side 0.60 m west"). `digits` as the figures are printed.
 */
export function shiftWays(shift: { readonly east: number; readonly north: number; readonly sides: readonly { readonly side: 'north' | 'east' | 'south' | 'west'; readonly by: number }[] }, digits?: number): { readonly moved: readonly Said[]; readonly sides: readonly Said[] } {
  const by = (value: number): Value => num(metresText(Math.abs(value), digits))
  const moved = [
    shift.east === 0 ? null : said('check.shifted.way', { by: by(shift.east), way: wayOf('x', shift.east) }),
    shift.north === 0 ? null : said('check.shifted.way', { by: by(shift.north), way: wayOf('y', shift.north) })
  ].filter((w): w is Said => w !== null)
  const sides = shift.sides.map((s) =>
    said('check.shifted.side', { side: said(`describe.way.${s.side}`), by: by(s.by), way: wayOf(s.side === 'east' || s.side === 'west' ? 'x' : 'y', s.by) })
  )
  return { moved, sides }
}

/** LVL-5: the words between a moved stair room or shaft and the one below it (`check.shifted.how.*`). */
export function shiftedHowSaid(ways: ReturnType<typeof shiftWays>): Said {
  if (ways.moved.length > 0) return said('check.shifted.how.moved', { ways: joined(ways.moved, 'join.and') })
  return said(`check.shifted.how.sides.${ways.sides.length === 1 ? 'one' : 'many'}`, { sides: joined(ways.sides, 'join.and') })
}

/** LVL-5: where a stair room or a shaft stands on the plan, as "(1.20, 0.00) to (2.40, 3.00)". */
export function shiftedBoxSaid(box: { readonly min: { readonly x: number; readonly y: number }; readonly max: { readonly x: number; readonly y: number } }): Said {
  const at = (value: number): Value => num(metresText(value, 2))
  return said('check.shifted.box', { x0: at(box.min.x), y0: at(box.min.y), x1: at(box.max.x), y1: at(box.max.y) })
}

/**
 * BRF-3 (lab EL-16): the set-back the person asked for, in their words: "you asked for 3.00 m", or
 * for one assumed for them, that it is assumed. Their figure, never a code's.
 */
export function askedText(asked: string, source: 'given' | 'assumed' | null): string {
  return english(saids.asked(asked, source))
}

/** BRF-3: the building stands nearer an edge of its plot than the set-back asked for. */
export function setbackShortText(distance: string, boundary: string, asked: string, source: 'given' | 'assumed' | null): string {
  return english(saids.setbackShort(distance, boundary, asked, source))
}

/** BRF-3: the building reaches past an edge of its plot. */
export function overBoundaryText(past: string, boundary: string): string {
  return english(saids.overBoundary(past, boundary))
}

/** The same wordings as report lines. */
export const messages = {
  noExit: (floor: string): string => english(saids.noExit(floor)),
  roomWithoutDoor: (room: string): string => english(saids.roomWithoutDoor(room)),
  noRoute: (room: string): string => english(saids.noRoute(room)),
  noRouteToAnyDoorOut: (room: string): string => english(saids.noRouteToAnyDoorOut(room)),
  noStairs: (floor: string): string => english(saids.noStairs(floor)),
  noStair: (floor: string): string => english(saids.noStair(floor)),
  outOfLine: (...args: Parameters<typeof saids.outOfLine>): string => english(saids.outOfLine(...args)),
  shifted: (...args: Parameters<typeof saids.shifted>): string => english(saids.shifted(...args)),
  wayOutNotDrawn: (floor: string): string => english(saids.wayOutNotDrawn(floor)),
  cannotBeDrawn: (floor: string, rooms: readonly string[], openings: readonly string[], kinds?: readonly OpeningKind[]): string =>
    english(rooms.length > 0 ? saids.roomsNotDrawn(floor, rooms) : saids.doorsNotDrawn(floor, openings, kinds)),
  doorToUndrawnSpace: (room: string): string => english(saids.doorToUndrawnSpace(room)),
  betweenHomes: (room: string, other: string | null, open: boolean): string => english(saids.betweenHomes(room, other, open)),
  flatWithoutFrontDoor: (flat: string): string => english(saids.flatWithoutFrontDoor(flat)),
  wayOutThroughCommonParts: (floor: string): string => english(saids.wayOutThroughCommonParts(floor)),
  doorOutAboveGround: (room: string, height: string): string => english(saids.doorOutAboveGround(room, height)),
  belowGround: (...args: Parameters<typeof saids.belowGround>): string => english(saids.belowGround(...args)),
  openingTooSmall: (room: string): string => english(saids.openingTooSmall(room)),
  doorIntoClosedCourt: (room: string): string => english(saids.doorIntoClosedCourt(room)),
  doorBetweenLevels: (...args: Parameters<typeof saids.doorBetweenLevels>): string => english(saids.doorBetweenLevels(...args))
}
