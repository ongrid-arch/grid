/**
 * COD-8: a firm's own standards, set against the plan and reported apart from the code figures.
 *
 * A firm keeps its own figures ("corridors at least 1.5 m") in a plain file beside the plan
 * (`firm-standards.json`, read by the command and the tool server, `packages/cli/src/firm/`).
 * Each is the firm's, never a code's: it cites no document, has no status, and is not tied to a
 * place, so it is set against the plan wherever the file is, whatever place the plan states.
 *
 * The drawing is measured by the same measures as CNT-17's accessibility numbers (a corridor's
 * narrowest point from end to end, a doorway's clear width, the turning space), CNT-13's floor in
 * front of a fixture and ARE-9's net area. The caller measures and hands the figures in (`FirmInput`); the front door words
 * each part that is short of the firm's figure as a `firm/` line, a finding, listed under its own
 * heading in every report, and the record says what each standard looked at (`firm`).
 *
 * Pure: data in, data out.
 */

import { tolerance } from '@ongrid/floorplan/geometry'
import { say, type Said } from '@ongrid/floorplan/messages'
import type { Thing } from './types'

/** The heading the firm's lines sit under, in every report: its English (MSG-11: `report.firm.title`). */
export const FIRM_HEADING = say('en', 'report.firm.title')

/** Said under the heading: whose figures they are, and that no place limits them. Its English (`report.firm.note`). */
export const FIRM_NOTE = say('en', 'report.firm.note')

/**
 * What a firm's standard can measure, each a least size: the code its lines carry, the unit, what
 * it is called in a line, which part it is about, and how the drawing is measured for it.
 */
export const FIRM_MEASURES = {
  corridor_width: {
    code: 'firm/corridor-width',
    unit: 'm',
    what: say('en', 'line.part.firm.what.corridor_width'),
    about: 'room',
    measures: say('en', 'line.part.firm.measures.corridor_width')
  },
  door_clear_width: {
    code: 'firm/door-clear-width',
    unit: 'm',
    what: say('en', 'line.part.firm.what.door_clear_width'),
    about: 'opening',
    measures: say('en', 'line.part.firm.measures.door_clear_width')
  },
  turning_circle: {
    code: 'firm/turning-circle',
    unit: 'm',
    what: say('en', 'line.part.firm.what.turning_circle'),
    about: 'room',
    measures: say('en', 'line.part.firm.measures.turning_circle')
  },
  fixture_clearance: {
    code: 'firm/fixture-clearance',
    unit: 'm',
    what: say('en', 'line.part.firm.what.fixture_clearance'),
    about: 'item',
    measures: say('en', 'line.part.firm.measures.fixture_clearance')
  },
  room_area: {
    code: 'firm/room-area',
    unit: 'm²',
    what: say('en', 'line.part.firm.what.room_area'),
    about: 'room',
    measures: say('en', 'line.part.firm.measures.room_area')
  },
  room_width: {
    code: 'firm/room-width',
    unit: 'm',
    what: say('en', 'line.part.firm.what.room_width'),
    about: 'room',
    measures: say('en', 'line.part.firm.measures.room_width')
  }
} as const

export type FirmMeasure = keyof typeof FIRM_MEASURES
export const FIRM_MEASURE_NAMES = Object.keys(FIRM_MEASURES) as FirmMeasure[]
/** The measures about rooms, which a standard may limit to some room uses. */
export const FIRM_ROOM_MEASURES: readonly FirmMeasure[] = FIRM_MEASURE_NAMES.filter((m) => FIRM_MEASURES[m].about === 'room')

/** One of the firm's standards, as read from its file. */
export interface FirmStandard {
  readonly measure: FirmMeasure
  /** The least size, in the measure's unit (metres or square metres): a length written in millimetres is in metres here. */
  readonly value: number
  /** The unit the file wrote it in. */
  readonly written: 'm' | 'mm' | 'm²'
  /** The firm's own name for it, as the file gives it. */
  readonly name: string | null
  /** The firm's own note on it: where it comes from, in the firm's words. */
  readonly note: string | null
  /** For a measure about rooms: the room uses it is for. Empty for its default (every room; for a corridor width, the rooms used as corridor). */
  readonly uses: readonly string[]
  /** For the floor in front of a fixture: the fixture kinds it is for. Empty for every fixture. */
  readonly kinds: readonly string[]
  /** ARE-73: for the floor in front of a fixture, the width of the zone on its centre line, in metres; unstated, the floor straight out from its front as before. */
  readonly width?: number
}

/** One part measured for one standard, by the caller. */
export interface FirmMeasured {
  /** The standard's place in the file's list, from 0. */
  readonly standard: number
  readonly thing: Thing
  readonly floor: string | null
  /** What was measured, in the measure's unit; null when nothing could be (no way through at all). */
  readonly measured: number | null
  /** How far the measure is from exact, in its unit: the grid's step for a way through, else 0. Read in the plan's favour. */
  readonly precision: number
  /** Where or between what it was measured, in words, with the plan's names quoted; empty when there is nothing to add. */
  readonly said: string
  /** MSG-11: the same by key and values, to say in another language; `said` is its English. */
  readonly sentence?: Said
  /** The other parts the line names. */
  readonly also: readonly string[]
}

/** What the caller hands the front door: the file, why it was not read, its standards and the parts measured for them. */
export interface FirmInput {
  /** The firm's file, as the report names it (relative to the project folder). */
  readonly file: string
  /** Why the file could not be read; then there are no standards, and one `firm/not-read` line says so. */
  readonly problem: string | null
  readonly standards: readonly FirmStandard[]
  readonly measured: readonly FirmMeasured[]
}

/** On a `firm/` line: the firm's figure it was set against. */
export interface FirmFigure {
  readonly standard: number
  readonly measure: FirmMeasure
  readonly value: number
  readonly unit: 'm' | 'm²'
  readonly name: string | null
  /** ARE-27: the firm's own note on where the figure comes from, as its file gives it; null for none. */
  readonly note: string | null
  readonly file: string
}

/** The record's account of the firm's file: what each standard looked at and how many notes it gave. */
export interface FirmUsed {
  /** The heading, in English (`FIRM_HEADING`). */
  readonly heading: string
  readonly file: string
  readonly read: boolean
  readonly standards: readonly {
    readonly measure: FirmMeasure
    readonly value: number
    readonly unit: 'm' | 'm²'
    readonly name: string | null
    readonly note: string | null
    readonly uses: readonly string[]
    readonly kinds: readonly string[]
    /** ARE-73: the zone's width, for a fixture's clear floor that states one. */
    readonly width?: number
    /** How many parts it was set against. */
    readonly lookedAt: number
    /** How many of them are short of it: its lines. */
    readonly notes: number
  }[]
}

/** True when what was measured is short of the firm's figure, the measure's precision read in the plan's favour. */
export function firmShort(measured: FirmMeasured, standard: FirmStandard): boolean {
  if (measured.measured === null) return true
  const unit = FIRM_MEASURES[standard.measure].unit
  const equal = unit === 'm²' ? tolerance('areaEqual') : tolerance('lengthEqual')
  return measured.measured + measured.precision + equal < standard.value
}

/** The record's `firm`, from what the caller measured. */
export function firmUsed(input: FirmInput): FirmUsed {
  return {
    heading: FIRM_HEADING,
    file: input.file,
    read: input.problem === null,
    standards: input.standards.map((standard, i) => {
      const parts = input.measured.filter((m) => m.standard === i)
      return {
        measure: standard.measure,
        value: standard.value,
        unit: FIRM_MEASURES[standard.measure].unit,
        name: standard.name,
        note: standard.note,
        uses: standard.uses,
        kinds: standard.kinds,
        ...(standard.width === undefined ? {} : { width: standard.width }),
        lookedAt: parts.length,
        notes: parts.filter((m) => firmShort(m, standard)).length
      }
    })
  }
}

/** True for a line of the firm's own standards. */
export function isFirmLine(line: { readonly code: string }): boolean {
  return line.code.startsWith('firm/')
}
