/**
 * Every code a result line can carry, each with its one wording, what is needed and the fix
 * (MSG-1). The words are in the message files (MSG-11: `line.<code>.says`, `.found`, `.needed`
 * and `.fix` in `@ongrid/floorplan/messages`), one file per language; this file says which
 * values each code's wording takes and, where a code has several wordings, which one a line
 * gets. A line's `message` is always made by its code's `says`, so one code cannot be worded two
 * ways (AU4-1). A finding's wording is its check's own (`checks/messages.ts`, `planCheckSaids`),
 * so the report, the notes and the record say the same words.
 *
 * Changing a wording changes it everywhere at once, and goes in the contract's changelog
 * (`docs/result-contract.md`). A code is never reused for another meaning.
 *
 * Plain words, never anything that reads as "this plan complies".
 */

import {
  areaText,
  figureText,
  fixedText,
  metresText,
  oneKnownOpening,
  openingsSaid,
  planCheckSaids,
  shiftWays,
  tapedFiguresSaid,
  tapedWhatSaid,
  tolerance,
  type PlanFix,
  type TapedRow
} from '@ongrid/floorplan/geometry'
import { en, isSaid, joined, labelOfUse, name, num, say, sayValue, said, valuesData, type Language, type MessageKey, type Said, type SayOptions, type Value, type Values } from '@ongrid/floorplan/messages'
import { ROOM_USES, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { RULE_READ_FOR } from '../checks/catalogue'
import { buildingKindsSaid, buildingTypeSaid, findingReadFor, type BuildingKind } from '../checks/figures'
import { saids as figureSaids } from '../checks/messages'
import { figureNeededSaid } from '../checks/figureWords'
import type { AppliedFigure, NotChecked, RuleFinding } from '../checks/types'
import { FIRM_MEASURES, type FirmMeasure } from './firm'

/** What a line's code is told about the thing, to word it. A text of Grid's own is a `Value`, said in the line's language. */
export interface Subject {
  /** The thing as the line names it: `Wall "w1"`, `Room "Kitchen"`, `Floor "Ground"`, `The plan`. */
  readonly label: Value
  /** The name of the room or floor alone, as the plan writes it (the id when it has none). */
  readonly name: string
  /** The floor's name, as the plan writes it. Empty for a line about the whole plan. */
  readonly floorName: string
  /** The check's own sentence about the thing. Empty when there is none. */
  readonly said: Value
  /** The ids of the other parts the line names. */
  readonly also: readonly string[]
  /** The names of the rooms a finding or notice names, as the plan writes them. */
  readonly names: readonly string[]
  /** CNT-13: the fixtures a line names, each as `kitchen run "k1"` (`itemNameSaid`). */
  readonly items?: readonly Value[]
  /** How many floors the plan has. */
  readonly floors: number
  readonly finding?: RuleFinding
  readonly notice?: NotChecked
  /** Grid's name for the place the check was for, as a sentence writes it (`the United States`; COD-3), from its list, never as stated. Empty when there is none. */
  readonly country: string
  /** On a refusal: the place in the file, as `walls[2].thickness`. */
  readonly place?: Value
  /** On a refusal: what the format wants there, in words. */
  readonly wants?: Value
  /** MSG-7: the changes to the part that would clear the line, as data. */
  readonly fixes?: readonly PlanFix[]
  /** On a word Grid does not read (MSG-4): the word, quoted, or what it is when it is not repeated. */
  readonly word?: Value
  /** On a word Grid does not read: the word Grid knows that was most likely meant. */
  readonly nearest?: string | null
  /** On a field Grid does not read: whether the part already has the field most likely meant. */
  readonly nearestWritten?: boolean
  /** On a word Grid does not read: what that place may hold, as `the fields of a wall: id, start, …`. */
  readonly known?: Value
  /** MSG-6, on a value read as meant: what it was read as. */
  readonly read?: Value
  /** MSG-6, on a value left out: the default used, or null when it is read as not stated. */
  readonly used?: Value | null
  /** MSG-6, on a part left out for its id: the part that keeps the id, as a line names it. */
  readonly kept?: Value
  /**
   * HND-11, on a taped length: what was taped, the two figures and how close they may be and
   * agree (MSG-11: said by the catalogue, `line.part.taped.*`).
   */
  readonly taped?: Pick<TapedRow, 'what' | 'walls' | 'taped' | 'drawn' | 'off' | 'within'>
  /** MSG-6: an id no part has, to rename a part to, quoted. */
  readonly rename?: string
  /** MSG-6, on an unfinished merge: what each side adds or changes, in words. */
  readonly sides?: Value
  /**
   * MSG-5, on a line that stands for the same note on several rooms (lab MS-14): their names, in
   * order, the first being `name`. The wording lists them where the one name goes.
   */
  readonly group?: readonly string[]
  /** MSG-5, on a "could not be drawn" line: the notes it holds back, in words; '' when none. */
  readonly heldSaid?: Value
  /** COD-8, on a `firm/` line: the firm's standard and what was measured for it. */
  readonly firm?: FirmSubject
}

/** COD-8: what a `firm/` line is told: the firm's figure, from its file, and what the drawing measured. */
export interface FirmSubject {
  /** The firm's least size, in the measure's unit. */
  readonly value: number
  /** The firm's own name for the standard, or null. */
  readonly name: string | null
  /** The firm's file, as the report names it. */
  readonly file: string
  /** ARE-27: the firm's own note on where the figure comes from, as its file gives it; null or absent for none. */
  readonly note?: string | null
  /** What the drawing measured; null when nothing could be. */
  readonly measured: number | null
  /** Where or between what, with the plan's names quoted (MSG-11: a sentence by key, or its text); empty when there is nothing to add. */
  readonly said: Value
}

export type Field = 'says' | 'found' | 'needed' | 'fix'

export interface CodeEntry {
  /** The values its wordings take beyond what every line is told (`commonValues`). */
  readonly values?: (s: Subject, language: Language) => Values
  /** Which wording of a field a line gets, when the code has several: the last part of its key, or '' for the first. */
  readonly variant?: Partial<Record<Field, (s: Subject) => string>>
}

/**
 * BRF-3: an edge of the plot's boundary, as a line's found names it: the way it faces, whether north
 * is stated, and whether it is on a street (`line.part.edgeFaces`).
 */
const edgeValues = (b: NonNullable<RuleFinding['boundary']>): Values => ({
  edge: b.edge,
  faces: said('line.part.edgeFaces', {
    way: said(`describe.way.${b.faces}` as MessageKey),
    north: b.northStated ? '' : said('line.part.edgeFaces.noNorth'),
    street: b.street ? said('line.part.edgeFaces.street') : ''
  })
})
/**
 * CNT-8: on a finding about a room with zones, the use the whole room was checked as, and the
 * zone it was read from when it is not the room's own (`line.room/too-small.found.whole`).
 */
const wholeRoom = (s: Subject, language: Language): Values => {
  const use = s.finding?.use
  if (use === undefined) return {}
  const as =
    use === 'bedroom' || use === 'living' || use === 'dining'
      ? said(`line.part.useAs.${use}`)
      : said('line.part.useAs', { use: language === 'en' ? use : labelOfUse(language, use) })
  const zone = s.finding?.zone
  return zone === undefined ? { as } : { as, zone: name(s.names[1] ?? zone) }
}
/** ARE-19: an escape finding that carries the openings it left out for lying below the ground. */
const below = (s: Subject): boolean => (s.finding?.openings.length ?? 0) > 0
const wholeVariant = (s: Subject): string => (s.finding?.use === undefined ? '' : s.finding.zone === undefined ? 'whole' : 'whole.zone')
/** A figure from a line's fixes (MSG-7), or null. */
const fixOf = (s: Subject, key: 'width' | 'offset' | 'height' | 'sill'): number | null => s.fixes?.find((f) => f[key] !== undefined)?.[key] ?? null
/** A fix's figure as a value, by its name, when the line has it. */
const fixValue = (s: Subject, key: 'width' | 'offset' | 'height'): Values => (fixOf(s, key) === null ? {} : { [key]: num(metresText(fixOf(s, key)!)) })
/** Which of an opening's fits a line names: both, one, or none. */
const fitsVariant = (s: Subject): string => {
  const offset = fixOf(s, 'offset') !== null
  const width = fixOf(s, 'width') !== null
  return offset && width ? 'both' : offset ? 'offset' : width ? 'width' : ''
}
/** The wall most likely meant, from a line's fixes (MSG-7). */
const meantWall = (s: Subject): string | null => s.fixes?.find((f) => f.wall !== undefined)?.wall ?? null
const FAR = tolerance('farFromOrigin')

const isRoomUse = (word: string): word is RoomUse => (ROOM_USES as readonly string[]).includes(word)

/**
 * MSG-5 (lab MS-14): a finding's wording for its room, or, on a line for several rooms, its
 * `.many` wording, with their names listed where the one name goes (`rooms`).
 */
const grouped = (s: Subject, one: Said): Value => {
  const group = s.group ?? []
  if (group.length < 2) return one
  return said(`${one.key}.many` as MessageKey, { ...one.values, rooms: joined(group.map(name), 'join.comma') })
}

/**
 * COD-2: after what a figure finding needed, the kind of building its figures were read for, as
 * "; this check's figures were read for homes (houses and flats people live in)".
 */
function readFor(s: Subject): Value {
  const kinds = s.finding === undefined ? [] : findingReadFor(s.finding)
  return kinds.length === 0 ? '' : said('line.part.readFor', { kinds: buildingKindsSaid(kinds) })
}

/** CNT-5: the kinds of building the figures of a notice's check were read for. */
function ruleReadFor(s: Subject): readonly BuildingKind[] {
  const rule = s.notice?.ruleId
  return rule === 'habitable-room-area' || rule === 'escape-opening' ? RULE_READ_FOR[rule] : []
}

/** CNT-5: the kind of building a `not_for_building` notice names, and the kinds its figures were read for. */
const buildingValues = (s: Subject): Values => ({ building: buildingTypeSaid(s.notice?.building), kinds: buildingKindsSaid(ruleReadFor(s)) })

/** A figure a finding applied, by key, as "6.5 m²". */
function figure(finding: RuleFinding | undefined, key: AppliedFigure['key']): Value | null {
  const found = finding?.figures?.find((f) => f.key === key)
  return found === undefined ? null : said('line.part.figureValue', { value: num(figureText(found.value)), unit: found.unit })
}

/** The figures a finding applied, by key, in the order given: what its `needed` names (MSG-3). */
function figuresOf(finding: RuleFinding | undefined, keys: readonly AppliedFigure['key'][]): AppliedFigure[] {
  return keys.flatMap((key) => finding?.figures?.filter((f) => f.key === key) ?? [])
}

const area = (value: number | undefined): Value => (value === undefined ? said('line.part.areaAsDrawn') : said('line.part.area', { area: num(figureText(value)) }))
const metres = (value: number | undefined): Value => (value === undefined ? said('line.part.asDrawn') : said('line.part.metres', { value: num(figureText(value)) }))

/** The rooms a route finding opens into, by id. */
function through(finding: RuleFinding | undefined): Value {
  const rooms = [...new Set((finding?.through ?? []).map((step) => step.room))]
  return rooms.length === 0 ? said('line.part.noWayOn') : said('line.part.opensInto', { rooms: joined(rooms.map(name), 'join.comma') })
}

/** MSG-7 (lab MS-13): an escape window's measures, each with what it needs and whether it falls short. */
function escapeMeasures(s: Subject): { text: Value; need: Value | null; fails: boolean }[] {
  const f = s.finding
  const minWidth = f?.figures?.find((x) => x.key === 'escapeOpeningMinWidth')?.value
  const minHeight = f?.figures?.find((x) => x.key === 'escapeOpeningMinHeight')?.value
  return [
    { text: said('line.part.inArea', { area: area(f?.area) }), need: f?.minimum === undefined ? null : area(f.minimum), fails: f?.area !== undefined && f.minimum !== undefined && f.area < f.minimum },
    { text: said('line.part.wide', { size: metres(f?.width) }), need: minWidth === undefined ? null : metres(minWidth), fails: f?.width !== undefined && minWidth !== undefined && f.width < minWidth },
    { text: said('line.part.high', { size: metres(f?.height) }), need: minHeight === undefined ? null : metres(minHeight), fails: f?.height !== undefined && minHeight !== undefined && f.height < minHeight }
  ]
}

/** The measure that fails first, against what it needs; the ones that pass after. */
function escapeWindowFound(s: Subject): Values {
  const f = s.finding
  const measures = escapeMeasures(s)
  const failing = measures.filter((m) => m.fails)
  const passing = measures.filter((m) => !m.fails)
  return {
    area: area(f?.area),
    width: metres(f?.width),
    height: metres(f?.height),
    short: joined(failing.map((m) => said('line.part.under', { measure: m.text, need: m.need ?? '' })), 'join.commaAnd'),
    passing: joined(passing.map((m) => m.text), 'join.and')
  }
}

function escapeWindowVariant(s: Subject): string {
  const measures = escapeMeasures(s)
  const failing = measures.filter((m) => m.fails).length
  const passing = measures.length - failing
  return failing === 0 ? '' : passing === 0 ? 'short' : passing === 1 ? 'one' : 'many'
}

function escapeWindowParts(s: Subject): Value[] {
  const wide = figure(s.finding, 'escapeOpeningMinWidth')
  const high = figure(s.finding, 'escapeOpeningMinHeight')
  return [
    s.finding?.minimum === undefined ? null : area(s.finding.minimum),
    wide === null ? null : said('line.part.wide', { size: wide }),
    high === null ? null : said('line.part.high', { size: high })
  ].filter((part): part is Value => part !== null)
}

function escapeWindowNeeded(s: Subject): Values {
  const parts = escapeWindowParts(s)
  const used = figuresOf(s.finding, ['escapeOpeningMinArea', 'escapeOpeningMinAreaGrade', 'escapeOpeningMinWidth', 'escapeOpeningMinHeight'])
  return { readFor: readFor(s), figure: figureNeededSaid(said('line.part.atLeast', { what: joined(parts, 'join.comma') }), used) }
}

/**
 * COD-8: the values of a `firm/` code's wording: the firm's figure and what was measured, to the
 * digits that set it apart from it, in the measure's unit (`line.firm/<code>.*`); the firm's name
 * for the standard, its file, and where it was measured. A line with nothing measured has the
 * `none` wording.
 */
function firmValues(measure: FirmMeasure): (s: Subject) => Values {
  const area = FIRM_MEASURES[measure].unit === 'm²'
  return (s) => {
    const f = s.firm
    const figure = num(figureText(f?.value ?? 0))
    const measured = f === undefined || f.measured === null ? null : num(area ? areaText(f.measured, 2, f.value) : metresText(f.measured, 2, f.value))
    return {
      figure,
      ...(measured === null ? {} : { measured }),
      what: said(`line.part.firm.what.${measure}`),
      measures: said(`line.part.firm.measures.${measure}`),
      named: f?.name ? said('line.part.firm.named', { name: name(f.name) }) : '',
      file: name(f?.file ?? ''),
      // ARE-27: the firm's own note on where its figure comes from, kept with the figure.
      note: f?.note ? said('line.part.firm.note', { note: name(f.note) }) : '',
      where: f?.said === undefined || f.said === '' ? '' : said('line.part.firm.where', { where: f.said })
    }
  }
}
const firmNone = (s: Subject): string => (s.firm === undefined || s.firm.measured === null ? 'none' : '')
const firmEntry = (measure: FirmMeasure): CodeEntry => ({ values: firmValues(measure), variant: { says: firmNone, found: firmNone } })

/**
 * HND-11: a taped length's words (what was taped, as a sentence starts it too, and the two
 * figures) and its figures as data: taped, drawn, drawn less taped and how close they may be.
 */
const tapedValues = (s: Subject): Values => {
  const row = s.taped
  if (row === undefined) return {}
  return {
    what: tapedWhatSaid(row),
    What: tapedWhatSaid(row, true),
    figures: tapedFiguresSaid(row),
    within: num(fixedText(row.within, 3)),
    taped: num(fixedText(row.taped, 3)),
    ...(row.drawn === null ? {} : { drawn: num(fixedText(row.drawn, 3)) }),
    ...(row.off === null ? {} : { off: num(fixedText(row.off, 3)) })
  }
}
const tapedNone = (s: Subject): string => (s.taped === undefined ? 'none' : '')

/**
 * LVL-5 (lab WR-9): a moved stair room or shaft, by how far and which way it is moved from the one
 * below (`line.room/stair-shifted.found`), or, for a shaft not moved as a whole, its sides.
 */
const shiftEntry: CodeEntry = {
  values: (s): Values => {
    const shift = s.finding?.shift
    const ways = shift === undefined ? null : shiftWays(shift)
    return {
      ...(s.finding === undefined ? {} : { wording: s.finding.said ?? s.finding.message }),
      ...(ways === null ? {} : ways.moved.length > 0 ? { ways: joined(ways.moved, 'join.and') } : { sideWays: joined(ways.sides, 'join.and') })
    }
  },
  variant: {
    says: (s) => (s.finding === undefined ? 'none' : ''),
    found: (s) => {
      const shift = s.finding?.shift
      return shift === undefined ? 'none' : shiftWays(shift).moved.length > 0 ? '' : 'sides'
    }
  }
}

/** LVL-5 (lab A-16, VE-9): whether a "could not be drawn" notice knows what each opening is. */
const openingKindsOf = (s: Subject) => {
  const kinds = s.notice?.openingKinds
  return kinds === undefined || kinds.length === 0 ? null : kinds
}

export const CODES = {
  // --- Reading: the plan could not be read, so nothing else ran ---------------------------------
  'plan/not-json': {},
  'plan/not-an-object': {},
  'plan/missing-field': {},
  'plan/wrong-type': {},
  'plan/unknown-word': {},
  'plan/out-of-range': {},
  'plan/not-in-format': {},
  // --- Reading: words Grid does not read (MSG-4). The plan is read without them --------------
  'plan/unknown-field': {
    values: (s): Values => (s.nearest ? { nearest: name(s.nearest) } : {}),
    variant: { found: (s) => (s.nearest ? 'nearest' : ''), fix: (s) => (s.nearest && s.nearestWritten ? 'written' : s.nearest ? 'nearest' : '') }
  },
  'plan/unknown-use': {
    values: (s, language): Values => ({
      known: said('line.part.knownUses', { uses: ROOM_USES.map((use) => labelOfUse(language, use)).join(', ') }),
      other: name(labelOfUse(language, 'other')),
      ...(s.nearest && isRoomUse(s.nearest) ? { nearest: name(labelOfUse(language, s.nearest)) } : s.nearest ? { nearest: name(s.nearest) } : {})
    }),
    variant: { found: (s) => (s.nearest ? 'nearest' : ''), fix: (s) => (s.nearest ? 'nearest' : '') }
  },
  'plan/empty': {},
  'plan/unfinished-merge': {
    variant: { fix: (s) => (s.sides ? 'sides' : '') }
  },
  // --- Reading part by part (MSG-6): the plan is read, and the rest is checked -----------------
  'plan/part-left-out': {},
  'plan/value-left-out': {
    variant: { found: (s) => (s.used ? 'used' : ''), fix: (s) => (s.used ? 'used' : '') }
  },
  'plan/read-as-meant': {},
  // MSG-20: the trace image the plan names, not followed or drawn.
  'plan/trace-left-out': {},
  'plan/blank-id': {},
  'plan/id-clash': {
    variant: { fix: (s) => (s.rename ? 'rename' : '') }
  },
  'plan/similar-id': {},
  // --- Grid itself ----------------------------------------------------------------------------
  'plan/check-failed': {},
  // --- The plan as a whole --------------------------------------------------------------------
  'plan/no-walls': {},
  'plan/far-from-origin': {
    values: (): Values => ({ far: num(String(FAR)) })
  },
  'plan/duplicate-id': {},
  'plan/similar-floor-id': {},
  'plan/duplicate-floor': {},
  'plan/units-question': {},
  'plan/level-gap': {},
  'plan/same-level': {},
  // --- Walls ----------------------------------------------------------------------------------
  'wall/too-large': {},
  'wall/zero-length': {},
  // CNT-18: a curved wall that cannot be built.
  'wall/arc-ends-apart': {},
  'wall/arc-too-tight': {},
  'wall/no-thickness': {},
  'wall/no-height': {},
  // LVL-5 (C19): a wall through floors that names no floor above its own.
  'wall/through-floor': {},
  'wall/unknown-floor': {},
  'wall/kind-differs': {},
  'wall/ends-in-opening': {},
  'wall/size-question': {},
  'wall/short': {},
  'wall/gap': {},
  'wall/overrun': {},
  'wall/duplicate': {},
  'wall/line-on-wall': {},
  'wall/crosses-room': {},
  'wall/stands-in-room': {},
  'wall/above-storey': {},
  // --- Openings -------------------------------------------------------------------------------
  'opening/too-large': {},
  'opening/broken-wall': {},
  'opening/missing-wall': {
    values: (s): Values => (meantWall(s) === null ? {} : { wall: name(meantWall(s)!) }),
    variant: { needed: (s) => (meantWall(s) === null ? '' : 'meant'), fix: (s) => (meantWall(s) === null ? '' : 'meant') }
  },
  'opening/degenerate': {},
  'opening/out-of-wall': {
    values: (s): Values => ({ ...fixValue(s, 'offset'), ...fixValue(s, 'width') }),
    variant: { needed: fitsVariant, fix: fitsVariant }
  },
  'opening/too-tall': {
    values: (s): Values => fixValue(s, 'height'),
    variant: { needed: (s) => (fixOf(s, 'height') === null ? '' : 'height'), fix: (s) => (fixOf(s, 'height') === null ? '' : 'height') }
  },
  'opening/above-roof': {
    values: (s): Values => fixValue(s, 'height'),
    variant: { needed: (s) => (fixOf(s, 'height') === null ? '' : 'height'), fix: (s) => (fixOf(s, 'height') === null ? '' : 'height') }
  },
  'opening/negative-sill': {},
  'opening/overlap': {},
  'opening/phase-wall': {},
  'opening/size-question': {},
  'opening/swing-without-hinge': {},
  'opening/hinge-without-swing': {},
  'opening/door-blocked': {
    values: (s): Values => ({ walls: joined(s.also.map(name), 'join.comma') }),
    variant: { found: (s) => (s.also.length === 1 ? 'one' : '') }
  },
  'opening/door-hits-item': {
    values: (s): Values => ({ items: joined(s.items ?? [], 'join.comma') }),
    variant: { says: (s) => ((s.items ?? []).length > 0 ? 'items' : ''), found: (s) => ((s.items ?? []).length === 1 ? 'one' : '') }
  },
  'opening/doors-collide': {
    values: (s): Values => ({ doors: joined(s.also.map(name), 'join.comma') })
  },
  // CNT-14: kinds of door and window.
  'opening/wide-single-leaf': {
    values: (): Values => ({ wide: num(figureText(tolerance('wideSingleLeaf'))) })
  },
  'opening/kind-not-for-type': {},
  'opening/part-too-large': {},
  'opening/crosses-wall': {},
  'opening/fills-wall': {},
  'opening/on-dividing-line': {},
  'opening/window-between-rooms': {},
  // --- Rooms ----------------------------------------------------------------------------------
  'room/unknown-floor': {},
  'room/cross-floor': {},
  'room/broken-wall': {},
  'room/phase-wall': {},
  'room/empty': {},
  'room/unclosed': {},
  'room/out-of-order': {},
  'room/inside-out': {},
  'room/hole-outside': {},
  'room/holes-overlap': {},
  'room/derived-edited': {},
  'room/not-enclosed': {},
  'room/space-mismatch': {},
  'room/inside-no-host': {},
  'room/zone-not-in-room': {},
  'room/overlap': {},
  'room/overlap-unknown': {},
  'room/wall-listed-twice': {},
  'room/size-question': {},
  'room/offset-question': {},
  // --- Stairs (LVL-3) --------------------------------------------------------------------------
  'stair/unknown-floor': {},
  'stair/same-floor': {},
  'stair/no-rise': {},
  'stair/run-too-short': {},
  'stair/too-few-risers': {},
  'stair/end-in-no-room': {},
  'stair/duplicate-id': {},
  // --- Opening patterns (LVL-8) ---------------------------------------------------------------
  // What kept a pattern's openings from being placed. The found is the expansion's own sentence:
  // which wall, how much room it needed and had, which opening it would have covered.
  'pattern/unknown-wall': {},
  'pattern/does-not-fit': {},
  'pattern/unknown-floor': {},
  'pattern/no-wall-above': {},
  'pattern/overlaps-opening': {},
  'pattern/id-clash': {},
  // --- Flats (CNT-4) --------------------------------------------------------------------------
  // The flats list's own faults. Each is worth a look: the flat is read without what it names
  // wrongly, and nothing else changes. The found is the check's own sentence, with the ids.
  'flat/unknown-room': {},
  'flat/room-in-two': {},
  'flat/unknown-type': {},
  'flat/duplicate-id': {},
  'flat/duplicate-type': {
    values: (s): Values => (s.also[0] === undefined ? {} : { type: name(s.also[0]) }),
    variant: { says: (s) => (s.also[0] === undefined ? 'one' : '') }
  },
  'flat/zone-without-room': {},
  // --- Buildings (CNT-6) ----------------------------------------------------------------------
  // The buildings list's own faults, as the flats list's: the building is read without what it
  // names wrongly. The found is the check's own sentence, with the ids.
  'plan/building-duplicate-id': {},
  'plan/building-unknown-floor': {},
  'plan/building-floor-in-two': {},
  // --- Named types (CNT-15) -------------------------------------------------------------------
  // The types list's own faults. Each is worth a look: the part is read as taking no type, and
  // nothing else changes. The found is the check's own sentence, with the ids.
  'type/unknown': {},
  'type/duplicate-id': {},
  'type/wrong-part': {},
  // --- Columns and structural grids (CNT-16) ----------------------------------------------------
  // A column's own faults leave it out of every view, measure and export; a grid naming a floor
  // the plan does not have is drawn on the others. The found is the check's own sentence.
  'plan/column-too-large': {},
  'plan/column-duplicate-id': {},
  'plan/column-unknown-floor': {},
  'plan/column-through-floor': {},
  'plan/grid-unknown-floor': {},
  // --- Parking bays and ramps (CNT-19) -------------------------------------------------------
  // A bay's or a ramp's own faults leave it out of every view, count and export; two bays with
  // one number, two that overlap and a ramp whose stated slope is not its levels' are worth a
  // look and kept. The found is the check's own sentence.
  'plan/bay-too-large': {},
  'plan/bay-duplicate-id': {},
  'plan/bay-unknown-floor': {},
  'plan/bay-number-repeated': {},
  'plan/bays-overlap': {},
  'plan/ramp-too-large': {},
  'plan/ramp-duplicate-id': {},
  'plan/ramp-unknown-floor': {},
  'plan/ramp-same-floor': {},
  'plan/ramp-no-rise': {},
  'plan/ramp-no-run': {},
  'plan/ramp-slope-differs': {},

  // --- Fixtures (CNT-12) ----------------------------------------------------------------------
  'item/too-large': {},
  'item/no-size': {},
  'item/unknown-kind': {},
  'item/duplicate-id': {},
  'item/unknown-floor': {},
  'item/outside-rooms': {},
  'item/into-wall': {},
  'item/too-tall': {},
  // CNT-20 (C30): the library and items standing in each other. The found is the check's own sentence.
  'item/unknown-library': {},
  'item/overlap': {},
  // CNT-21: an item hanging out of its room, and a column standing in an item or another column.
  'item/leaves-room': {},
  'plan/column-in-item': {},
  'plan/column-overlap': {},
  'item/clearance-blocked': {},
  // CNT-13: use indicators the drawing's check gives. The found is the check's own sentence:
  // what was measured, with what depth, and that it is an indicator.
  'item/blocks-doorway': {
    values: (s): Values => (s.also[0] === undefined ? {} : { opening: name(s.also[0]) }),
    variant: { says: (s) => (s.also[0] === undefined ? '' : 'opening') }
  },
  'item/blocks-window': {
    values: (s): Values => (s.also[0] === undefined ? {} : { window: name(s.also[0]) }),
    variant: { says: (s) => (s.also[0] === undefined ? '' : 'window') }
  },
  // --- The firm's own standards (COD-8) -------------------------------------------------------
  // Each is the firm's figure, from its file beside the plan, set against a CNT-13 measure or a
  // room's net area. Never a code's: the needed says so, and names the file.
  'firm/corridor-width': firmEntry('corridor_width'),
  'firm/door-clear-width': firmEntry('door_clear_width'),
  'firm/turning-circle': firmEntry('turning_circle'),
  'firm/fixture-clearance': firmEntry('fixture_clearance'),
  'firm/room-area': firmEntry('room_area'),
  'firm/room-width': firmEntry('room_width'),
  'firm/not-read': {
    values: (s): Values => ({ file: s.firm === undefined ? s.label : name(s.firm.file) })
  },

  // --- Floors ---------------------------------------------------------------------------------
  'floor/unclaimed': {},
  // LVL-5 (lab WR-9): a floor whose outline does not lie over the floor below it.
  'floor/out-of-line': {},
  // LVL-10: a floor wholly inside the floor below it, a part floor set back from it.
  'floor/set-back': {},
  // LVL-11: the plan's split levels, said once: each floor a half level up beside another of its building.
  'floor/split-level': {},
  // VEW-33: a floor's walls set against the slab of the floor over it: a gap under it, or walls past its level.
  'floor/gap-under-slab': {},
  'floor/walls-past-floor': {},
  'floor/past-outline': {},
  'floor/empty-top': {},
  'floor/rooflight-misplaced': {},
  'floor/dormers-not-drawn': {},
  'floor/size-question': {},
  'floor/spaces-unknown': {},
  'floor/overlaps-unknown': {},
  // --- Findings of the plan checks --------------------------------------------------------------
  'floor/no-exit': {
    values: (s): Values => ({ wording: planCheckSaids.noExit(s.floorName, (s.finding?.openings.length ?? 0) > 0) }),
    // ARE-50: a floor whose doors to the outside cannot be passed is not one with no door out.
    variant: { found: (s) => ((s.finding?.openings.length ?? 0) > 0 ? 'cannotPass' : '') }
  },
  // LVL-14: the floor's id and the ground floor's, for the rooms-text line that adds a stair.
  'floor/no-stair': {
    values: (s): Values => ({ wording: planCheckSaids.noStair(s.floorName), floorId: s.finding?.floor ?? '', belowId: s.finding?.stairFrom ?? '' })
  },
  'room/no-door': {
    values: (s): Values => ({ wording: grouped(s, planCheckSaids.roomWithoutDoor(s.name)) })
  },
  'room/no-route-out': {
    values: (s): Values => ({ wording: grouped(s, planCheckSaids.noRoute(s.name)), through: through(s.finding) })
  },
  'room/no-route-to-door-out': {
    values: (s): Values => ({ wording: grouped(s, planCheckSaids.noRouteToAnyDoorOut(s.name)), through: through(s.finding) })
  },
  'opening/to-undrawn-space': {
    values: (s): Values => ({ wording: grouped(s, planCheckSaids.doorToUndrawnSpace(s.name)) })
  },
  // CNT-6 (lab EL-4, R-10): homes kept apart, and each flat's front door.
  'opening/between-homes': {
    values: (s): Values => ({ wording: s.finding?.said ?? s.finding?.message ?? s.label })
  },
  'flat/entrance-without-door': {
    values: (s): Values => ({ wording: s.finding?.said ?? s.finding?.message ?? s.label })
  },
  'flat/no-front-door': {
    values: (s): Values => ({ wording: s.finding?.said ?? s.finding?.message ?? s.label })
  },
  'opening/door-out-above-ground': {
    values: (s): Values => ({
      // CNT-6: on a floor above the ground only by what it states lies below it, no height is said.
      wording: s.finding !== undefined && s.finding.elevation === undefined && s.finding.said !== undefined ? s.finding.said : grouped(s, planCheckSaids.doorOutAboveGround(s.name, metresText(s.finding?.elevation ?? 0))),
      height: num(metresText(s.finding?.elevation ?? 0))
    }),
    variant: { found: (s) => (s.finding !== undefined && s.finding.elevation === undefined ? 'below' : '') }
  },
  // MSG-17 (lab CH-6, AB-1): a way out leads to open air, and a let is left through common parts.
  'opening/into-closed-court': {
    values: (s): Values => ({ wording: grouped(s, planCheckSaids.doorIntoClosedCourt(s.name)) })
  },
  // LVL-17: a door between floors further apart than a step: the rise as drawn and Grid's own step.
  'opening/between-levels': {
    values: (s): Values => ({
      wording: s.finding?.said ?? s.finding?.message ?? s.label,
      rise: num(metresText(s.finding?.levels?.rise ?? 0, 2, tolerance('passableRise'))),
      step: num(metresText(tolerance('passableRise')))
    })
  },
  'room/through-another-let': {
    values: (s): Values => ({ wording: s.finding?.said ?? s.finding?.message ?? s.label })
  },
  'opening/below-ground': {
    values: (s): Values => {
      const b = s.finding?.belowGround
      return { wording: s.finding?.said ?? s.finding?.message ?? s.label, ...(b === undefined ? {} : { top: num(metresText(b.top)), foot: num(metresText(b.foot)) }) }
    },
    variant: { found: (s) => (s.finding?.belowGround === undefined ? '' : s.finding.belowGround.wholly ? 'wholly' : 'partly') }
  },
  // BRF-3 (lab EL-16): the building against its plot. The set-backs are the person's own figures:
  // a line says how far short of one the building stands, and never that a distance is enough.
  'plan/setback-short': {
    values: (s): Values => {
      const b = s.finding?.boundary
      const asked = b?.asked ?? null
      return {
        wording: s.finding?.said ?? s.finding?.message ?? said('line.plan/setback-short.says.none'),
        ...(b === undefined ? {} : { ...edgeValues(b), distance: num(metresText(b.distance, 2, b.asked?.distance)) }),
        ...(asked === null
          ? {}
          : {
              asked: num(metresText(asked.distance)),
              who: said(asked.source === 'assumed' ? 'line.part.setbackWho.assumed' : 'line.part.setbackWho'),
              from: said(`line.part.setbackFrom.${asked.from}`)
            })
      }
    },
    variant: { found: (s) => (s.finding?.boundary === undefined ? '' : 'edge'), needed: (s) => (s.finding?.boundary?.asked == null ? '' : 'asked') }
  },
  'plan/over-boundary': {
    values: (s): Values => {
      const b = s.finding?.boundary
      return {
        wording: s.finding?.said ?? s.finding?.message ?? said('line.plan/over-boundary.says.none'),
        ...(b === undefined ? {} : { ...edgeValues(b), past: num(metresText(b.past)) })
      }
    },
    variant: { found: (s) => (s.finding?.boundary === undefined ? '' : 'edge') }
  },
  'room/stair-out-of-line': {
    values: (s): Values => ({ wording: s.finding?.said ?? s.finding?.message ?? s.label })
  },
  'room/lift-out-of-line': {
    values: (s): Values => ({ wording: s.finding?.said ?? s.finding?.message ?? s.label })
  },
  // LVL-5 (lab WR-9): joined to the one below, but moved from it.
  'room/stair-shifted': shiftEntry,
  'room/lift-shifted': shiftEntry,
  'opening/too-small-to-pass': {
    values: (s): Values => {
      const p = s.finding?.passage
      return {
        wording: grouped(s, planCheckSaids.openingTooSmall(s.name)),
        size: num(metresText(p?.passable ?? 0)),
        ...(p === undefined ? {} : { passage: said(`line.part.passage.${p.kind}.${p.short}`, { size: num(metresText(p.drawn, 2, p.passable)) }) })
      }
    },
    variant: {
      found: (s) => (s.finding?.passage === undefined ? '' : 'passage'),
      needed: (s) => (s.finding?.passage?.short === 'sill' ? 'sill' : s.finding?.passage?.short === 'height' ? 'height' : 'width')
    }
  },
  'room/too-small': {
    values: (s, language): Values => ({
      wording: grouped(s, figureSaids.roomTooSmall(s.name, s.finding?.minimum ?? 0)),
      area: area(s.finding?.area),
      ...wholeRoom(s, language),
      figure: figureNeededSaid(said('line.part.atLeast', { what: area(s.finding?.minimum) }), figuresOf(s.finding, ['habitableRoomMinArea'])),
      readFor: readFor(s)
    }),
    variant: { found: wholeVariant }
  },
  'room/no-escape-opening': {
    values: (s): Values => ({
      wording: grouped(s, below(s) ? figureSaids.noEscapeOpeningBelowGround(s.name) : figureSaids.noEscapeOpening(s.name)),
      readFor: readFor(s)
    }),
    // ARE-19: a room left with no way out because its outside openings lie below the ground.
    variant: { found: (s) => (below(s) ? 'belowGround' : ''), fix: (s) => (below(s) ? 'belowGround' : '') }
  },
  'room/escape-window-too-small': {
    values: (s): Values => ({ wording: grouped(s, figureSaids.escapeWindowTooSmall(s.name)), ...escapeWindowFound(s), ...escapeWindowNeeded(s) }),
    variant: { found: escapeWindowVariant, needed: (s) => (escapeWindowParts(s).length === 0 ? 'none' : '') }
  },
  'room/escape-window-too-high': {
    values: (s): Values => ({
      wording: grouped(s, figureSaids.escapeWindowTooHigh(s.name)),
      sill: metres(s.finding?.sill),
      readFor: readFor(s),
      ...(s.finding?.maximum === undefined
        ? {}
        : { figure: figureNeededSaid(said('line.part.sillAtMost', { sill: metres(s.finding.maximum) }), figuresOf(s.finding, ['escapeOpeningMaxSill'])) })
    }),
    variant: { needed: (s) => (s.finding?.maximum === undefined ? 'none' : '') }
  },
  // --- What a check could not look at -----------------------------------------------------------
  'floor/not-checked-no-stairs': {
    values: (s): Values => ({ wording: planCheckSaids.noStairs(s.floorName) })
  },
  'floor/not-checked-way-out-not-drawn': {
    values: (s): Values => ({ wording: planCheckSaids.wayOutNotDrawn(s.floorName) })
  },
  // CNT-6 (lab R-10): a flat entered from a landing the plan does not draw.
  'floor/not-checked-way-out-common-parts': {
    values: (s): Values => ({ wording: planCheckSaids.wayOutThroughCommonParts(s.floorName) })
  },
  // MSG-5: with the notes held back because they rest on what could not be drawn.
  'floor/not-checked-rooms-not-drawn': {
    values: (s): Values => ({ wording: planCheckSaids.roomsNotDrawn(s.floorName, s.names), ...(s.heldSaid ? { held: s.heldSaid } : {}) }),
    variant: { found: (s) => (s.heldSaid ? 'held' : '') }
  },
  // LVL-5 (lab A-16, VE-9): each opening worded as what it is, never a window as a door.
  'floor/not-checked-doors-not-drawn': {
    values: (s): Values => {
      const kinds = openingKindsOf(s) ?? undefined
      return {
        wording: planCheckSaids.doorsNotDrawn(s.floorName, s.also, kinds),
        ...(s.heldSaid ? { held: s.heldSaid } : {}),
        ...(kinds === undefined ? {} : { plain: openingsSaid(kinds, s.also.length, 'plain'), those: openingsSaid(kinds, s.also.length, 'those') })
      }
    },
    variant: {
      found: (s) => [openingKindsOf(s) === null ? '' : 'kinds', s.heldSaid ? 'held' : ''].filter((part) => part !== '').join('.'),
      needed: (s) => (openingKindsOf(s) === null ? '' : 'kinds'),
      fix: (s) => {
        const kinds = openingKindsOf(s)
        return kinds === null ? '' : oneKnownOpening(kinds, s.also.length) ? 'kinds.one' : 'kinds.many'
      }
    }
  },
  // CNT-14: the doors whose swing the plan does not state, by name, on one floor.
  'floor/not-checked-door-swings': {
    values: (s): Values => ({ doors: joined(s.also.map(name), 'join.comma'), count: s.also.length }),
    variant: { says: (s) => (s.also.length === 1 ? 'one' : ''), found: (s) => (s.also.length === 1 ? 'one' : '') }
  },
  'floor/sketch-drawn-only': {
    values: (s): Values => ({ categories: s.names.join(', ') })
  },
  // BRF-3: the site's things are drawn only, never measured or checked.
  'plan/site-things-drawn-only': {},
  'plan/not-checked-boundary': {
    values: (s): Values => ({ wording: s.notice?.said ?? said('line.plan/not-checked-boundary.says.none') })
  },
  'plan/boundary-crosses': {},
  'plan/note-no-place': {},
  // CNT-3: the front, and which way the plan's y runs.
  'plan/front-not-said': {},
  'plan/y-down': {},
  'floor/not-checked-no-use': {
    values: (s): Values => ({ wording: figureSaids.noUse(s.floorName, s.names.length) })
  },
  'plan/not-checked-sizes-for-place': {
    values: (s): Values => ({ wording: figureSaids.noFiguresForPlace('Room sizes', s.country) })
  },
  'plan/not-checked-escapes-for-place': {
    values: (s): Values => ({ wording: figureSaids.noFiguresForPlace('Escape openings', s.country) })
  },
  // CNT-5 (lab EL-2): a figure check the plan's kind of building leaves out, for the whole plan
  // or one floor of it. The figures carried here were read for homes.
  'plan/not-checked-sizes-for-building': {
    values: (s): Values => ({ wording: figureSaids.notForBuilding('Room sizes', buildingKindsSaid(ruleReadFor(s)), buildingTypeSaid(s.notice?.building)), ...buildingValues(s) })
  },
  'plan/not-checked-escapes-for-building': {
    values: (s): Values => ({ wording: figureSaids.notForBuilding('Escape openings', buildingKindsSaid(ruleReadFor(s)), buildingTypeSaid(s.notice?.building)), ...buildingValues(s) })
  },
  'floor/not-checked-sizes-for-building': {
    values: (s): Values => ({ wording: figureSaids.floorNotForBuilding(s.floorName, 'Room sizes', buildingKindsSaid(ruleReadFor(s)), buildingTypeSaid(s.notice?.building)), ...buildingValues(s) })
  },
  'floor/not-checked-escapes-for-building': {
    values: (s): Values => ({ wording: figureSaids.floorNotForBuilding(s.floorName, 'Escape openings', buildingKindsSaid(ruleReadFor(s)), buildingTypeSaid(s.notice?.building)), ...buildingValues(s) })
  },
  // MSG-2: what a check skipped, said where it used to pass in silence.
  'floor/not-checked-above-escape-storeys': {
    values: (s): Values => ({ wording: figureSaids.aboveEscapeStoreys(s.floorName, s.names.length), rooms: joined(s.names.map(name), 'join.comma') })
  },
  // CNT-10: a plan with phases is checked as it will be after the work; its counts (and base) as data.
  'plan/read-after-work': {
    values: (s): Values => (isSaid(s.said) ? { ...(s.said.values ?? {}) } : {})
  },
  // WRT-6 (lab WR-15): what the plan marks assumed, listed for the person to confirm.
  'plan/value-assumed': {
    variant: { says: (s) => (s.word ? 'word' : ''), found: (s) => (s.said !== '' ? 'said' : '') }
  },
  'plan/mark-no-part': {
    variant: { found: (s) => (s.word ? 'word' : '') }
  },
  // HND-11 (lab WR-14): a length taped on site against the same length drawn.
  'room/taped-differs': {
    values: tapedValues,
    variant: { says: tapedNone, found: tapedNone, needed: tapedNone }
  },
  'plan/taped-not-measured': {
    values: tapedValues,
    variant: { found: tapedNone }
  },
  'plan/not-checked-access': {},
  'plan/not-checked-no-rooms': {
    values: (): Values => ({ wording: figureSaids.noRooms() })
  }
} as const satisfies Record<string, CodeEntry>

export type LineCode = keyof typeof CODES

export function isLineCode(code: string): code is LineCode {
  return Object.hasOwn(CODES, code)
}

/** What every line is told, by name: its wordings may use any of these. */
function commonValues(s: Subject): Values {
  const values: Record<string, Value> = { label: s.label, said: s.said }
  if (s.name !== '') values['name'] = name(s.name)
  if (s.floorName !== '') values['floorName'] = name(s.floorName)
  if (s.place !== undefined) values['place'] = s.place
  if (s.wants !== undefined) values['wants'] = s.wants
  if (s.word !== undefined) values['word'] = s.word
  if (s.known !== undefined) values['known'] = s.known
  if (s.read !== undefined) values['read'] = s.read
  if (s.used !== undefined && s.used !== null) values['used'] = s.used
  if (s.kept !== undefined) values['kept'] = s.kept
  if (s.rename !== undefined) values['rename'] = s.rename
  if (s.sides !== undefined) values['sides'] = s.sides
  if (s.country !== '') values['country'] = s.country
  return values
}

/** A line's words in a language, made from its code: the one place a line is worded. */
export interface LineWords {
  readonly message: string
  readonly found: string
  readonly needed: string
  readonly fix: string
  /** MSG-11: the figures, names and places its words were made with, as data. Empty when there are none. */
  readonly values: Record<string, string | number>
}

/**
 * The words of a line of this code, in a language. A code missing from the catalogue still gives
 * a line, the check's own words, and a test fails.
 */
export function wordLine(code: string, s: Subject, language: Language, options: SayOptions = {}): LineWords {
  const entry: CodeEntry | null = isLineCode(code) ? CODES[code] : null
  const own = entry?.values?.(s, language) ?? {}
  const values: Values = { ...commonValues(s), ...own }
  const said_ = sayValue(language, s.said, options)
  const field = (f: Field): string | null => {
    const variant = entry?.variant?.[f]?.(s) ?? ''
    const key = `line.${code}.${f}${variant ? `.${variant}` : ''}`
    return Object.hasOwn(en, key) ? say(language, key as MessageKey, values, options) : null
  }
  // The label and the check's own sentence are words, and the line's own text says them. A part
  // left empty (COD-8's name and place of a firm's line) is no value.
  const data = Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== 'label' && key !== 'said' && value !== ''))
  return {
    message: entry === null ? said_ : field('says') ?? said_,
    found: entry === null ? said_ : field('found') ?? said_,
    needed: entry === null ? '' : field('needed') ?? '',
    fix: entry === null ? '' : field('fix') ?? '',
    values: valuesData(data)
  }
}
