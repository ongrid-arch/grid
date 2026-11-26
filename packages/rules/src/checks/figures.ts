/**
 * The figures the checks compare a plan against, as data.
 *
 * Every figure carries where it was read (document, edition, clause), where it applies,
 * when it was read and whether a person has checked it. A figure is a number, a unit and
 * a pointer to its source: no text of any document is stored here.
 *
 * The baselines are from two US model codes. A model code is not law until a state or
 * a city adopts it, and other countries have their own rules, so a check that uses a
 * baseline says so, and does not run when the plan is for another country.
 *
 * The ranges catch a unit slip (813 for 0.813) and a nonsense value in a looked-up
 * figure; they are not a judgement on any code.
 */

import type { RuleCitation } from '@ongrid/floorplan/geometry'
import { english, joined, said, sayValue, type Said, type Value } from '@ongrid/floorplan/messages'
import type { BuildingType } from '@ongrid/floorplan/types/floorplan'
import { countryOf } from '@ongrid/floorplan/types/places'
import type { AppliedFigure, RuleFigures } from './types'

export const FIGURE_KEYS = [
  'habitableRoomMinArea',
  'escapeOpeningMinArea',
  'escapeOpeningMinAreaGrade',
  'escapeOpeningMinWidth',
  'escapeOpeningMinHeight',
  'escapeOpeningMaxSill',
  'routeMinWidth',
  'exitDoorClearWidth'
] as const

export type FigureKey = (typeof FIGURE_KEYS)[number]

export type FigureUnit = 'm' | 'm²'

/**
 * How far a figure has been checked.
 *
 * - `ai-found`: an AI read it; no person has opened the source.
 * - `human-entered`: a person typed it from a secondary source.
 * - `checked-once`: a named person opened the document at the clause and confirmed it.
 * - `checked-twice`: a second, different person did the same.
 * - `disputed`: a check failed or the source changed. A disputed figure is not applied.
 */
export const VERIFICATION_STATUSES = ['ai-found', 'human-entered', 'checked-once', 'checked-twice', 'disputed'] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

/** The same citation a rule carries, with who publishes the document and where it was read. */
export interface SourceCitation extends RuleCitation {
  readonly publisher: string
  readonly url: string
}

/** One check of a figure against its source, by a person. Never an AI. */
export interface Verification {
  readonly by: string
  readonly on: string
}

/**
 * The kind of building a figure was read for (COD-2). Every figure here was read for homes.
 * CNT-5: a figure check runs only where the plan says the building (or that floor of it) is one
 * of the kinds its figures were read for (`READ_FOR_BUILDINGS`), or where the plan does not say.
 */
export const BUILDING_KINDS = ['homes'] as const
export type BuildingKind = (typeof BUILDING_KINDS)[number]


/**
 * CNT-5: the kinds of building a plan may state (`BuildingType` in the plan format) that each
 * kind a figure was read for covers. A hotel is not a home here: its rooms are for guests, and
 * the figures were read for homes.
 */
export const READ_FOR_BUILDINGS: Readonly<Record<BuildingKind, readonly BuildingType[]>> = {
  homes: ['home', 'flats']
}

/** Whether figures read for these kinds apply to a building of this kind: always when it is not stated. */
export function readForCovers(kinds: readonly BuildingKind[], building: BuildingType | undefined): boolean {
  return building === undefined || kinds.some((kind) => READ_FOR_BUILDINGS[kind].includes(building))
}

/** MSG-11: "homes (houses and flats people live in)", or several kinds joined, by key (`check.kind.*`). */
export function buildingKindsSaid(kinds: readonly BuildingKind[]): Value {
  return joined([...new Set(kinds)].map((kind) => said(`check.kind.${kind}`)), 'join.and')
}

/** "homes (houses and flats people live in)", or several kinds joined, in English. */
export function buildingKindsText(kinds: readonly BuildingKind[]): string {
  return sayValue('en', buildingKindsSaid(kinds))
}

/** MSG-11: a kind of building as a sentence names it, with its article: "an office". */
export function buildingTypeSaid(type: BuildingType | undefined): Said {
  return said(type === undefined ? 'check.building.unknown' : `check.building.${type}`)
}

/**
 * The sentence every note that used a figure carries (COD-2): which kind of building its figures
 * were read for, and that Grid cannot tell whether the plan is one, when the plan does not say
 * (`stated` undefined). CNT-5: where the plan says what the building is, the figures ran because
 * it is that kind, and the sentence says so. No full stop at the end.
 */
export function readForSaid(kinds: readonly BuildingKind[], stated?: BuildingType): Said {
  return stated === undefined
    ? said('check.readFor.unstated', { kinds: buildingKindsSaid(kinds) })
    : said('check.readFor.stated', { kinds: buildingKindsSaid(kinds), building: buildingTypeSaid(stated) })
}

export function readForSentence(kinds: readonly BuildingKind[], stated?: BuildingType): string {
  return english(readForSaid(kinds, stated))
}

export interface Provenance {
  /** Where the figure applies. */
  readonly jurisdiction: string
  /** The kind of building the figure was read for (COD-2). */
  readonly readFor: BuildingKind
  /** Every document the figure was read in. */
  readonly citations: readonly SourceCitation[]
  /** The figure as the documents print it, before any conversion. */
  readonly original: { readonly value: number; readonly unit: 'in' | 'sq ft' | 'storeys' }
  /** Whether the metric value is printed in the documents or converted here. */
  readonly metric: 'as-printed' | 'converted'
  /** Who and what the figure is about, in our own words. */
  readonly appliesTo: string
  /** The day the sources were read, as YYYY-MM-DD. */
  readonly readOn: string
  readonly foundBy: string
  readonly verifiedBy: readonly Verification[]
  readonly status: VerificationStatus
  /** The day after which the figure should be read again, as YYYY-MM-DD. */
  readonly reviewBy: string
}

export interface FigureSpec {
  readonly key: FigureKey
  readonly unit: FigureUnit
  /** The plausible range of a looked-up value, both ends included. */
  readonly min: number
  readonly max: number
  /** The figure used when none was looked up. */
  readonly baseline: number
  readonly provenance: Provenance
}

export const US_MODEL_CODES = 'US model codes' as const

const PUBLISHER = 'International Code Council'
const IBC_EGRESS = 'https://codes.iccsafe.org/content/IBC2024V2.0/chapter-10-means-of-egress'
const IBC_INTERIOR = 'https://codes.iccsafe.org/content/IBC2024V2.0/chapter-12-interior-environment'
const IRC_PLANNING = 'https://codes.iccsafe.org/content/IRC2024P1/chapter-3-building-planning'

const ibc = (clause: string, url: string): SourceCitation => ({ document: 'IBC', edition: '2024', clause, publisher: PUBLISHER, url })
const irc = (clause: string): SourceCitation => ({ document: 'IRC', edition: '2024', clause, publisher: PUBLISHER, url: IRC_PLANNING })

/** What every baseline here shares: read by an AI on one day, and not yet checked by a person. */
const read = (
  citations: readonly SourceCitation[],
  original: Provenance['original'],
  appliesTo: string,
  metric: Provenance['metric'] = 'as-printed'
): Provenance => ({
  jurisdiction: US_MODEL_CODES,
  readFor: 'homes',
  citations,
  original,
  metric,
  appliesTo,
  readOn: '2026-11-14',
  foundBy: 'AI research',
  verifiedBy: [],
  status: 'ai-found',
  reviewBy: '2027-11-14'
})

const BEDROOM_OPENING = 'The escape opening of a bedroom, measured as the clear opening when it is open'

export const FIGURES: Readonly<Record<FigureKey, FigureSpec>> = {
  habitableRoomMinArea: {
    key: 'habitableRoomMinArea',
    unit: 'm²',
    min: 4,
    max: 30,
    baseline: 6.5,
    provenance: read(
      [ibc('1208.4', IBC_INTERIOR), irc('R312.1')],
      { value: 70, unit: 'sq ft' },
      'Rooms of a home that people live, sleep or eat in. Kitchens are left out'
    )
  },
  escapeOpeningMinArea: {
    key: 'escapeOpeningMinArea',
    unit: 'm²',
    min: 0.2,
    max: 2,
    baseline: 0.53,
    provenance: read([ibc('1031.3.1', IBC_EGRESS), irc('R319.2.1')], { value: 5.7, unit: 'sq ft' }, BEDROOM_OPENING)
  },
  escapeOpeningMinAreaGrade: {
    key: 'escapeOpeningMinAreaGrade',
    unit: 'm²',
    min: 0.2,
    max: 2,
    baseline: 0.46,
    provenance: read(
      [ibc('1031.3.1', IBC_EGRESS), irc('R319.2.1')],
      { value: 5, unit: 'sq ft' },
      `${BEDROOM_OPENING}, where its sill is close to the ground outside. The check reads that as the ground floor, which is an approximation`
    )
  },
  escapeOpeningMinWidth: {
    key: 'escapeOpeningMinWidth',
    unit: 'm',
    min: 0.3,
    max: 1.5,
    baseline: 0.508,
    provenance: read([ibc('1031.3.2', IBC_EGRESS), irc('R319.2.2')], { value: 20, unit: 'in' }, BEDROOM_OPENING)
  },
  escapeOpeningMinHeight: {
    key: 'escapeOpeningMinHeight',
    unit: 'm',
    min: 0.3,
    max: 2,
    baseline: 0.61,
    provenance: read([ibc('1031.3.2', IBC_EGRESS), irc('R319.2.2')], { value: 24, unit: 'in' }, BEDROOM_OPENING)
  },
  escapeOpeningMaxSill: {
    key: 'escapeOpeningMaxSill',
    unit: 'm',
    min: 0.5,
    max: 2,
    baseline: 1.118,
    provenance: read(
      [ibc('1031.3.3', IBC_EGRESS), irc('R319.2.3')],
      { value: 44, unit: 'in' },
      'The bottom of a bedroom escape opening, measured from the floor of the room'
    )
  },
  // Stored and shown. No check measures a hallway yet.
  routeMinWidth: {
    key: 'routeMinWidth',
    unit: 'm',
    min: 0.7,
    max: 2.5,
    baseline: 0.914,
    provenance: read(
      [ibc('Table 1020.3', IBC_EGRESS), irc('R318.6')],
      { value: 36, unit: 'in' },
      'A hallway inside a home',
      'converted'
    )
  },
  // Stored and shown. No check measures a door's clear width yet.
  exitDoorClearWidth: {
    key: 'exitDoorClearWidth',
    unit: 'm',
    min: 0.6,
    max: 1.5,
    baseline: 0.813,
    provenance: read(
      [ibc('1010.1.1', IBC_EGRESS), irc('R318.2')],
      { value: 32, unit: 'in' },
      'The main exit door of a home, measured clear with the door open. Other doors inside an ordinary home have no minimum in these codes'
    )
  }
}

/**
 * The highest floor whose bedrooms need an escape opening: below the fourth storey, so
 * up to `Floor.level` 2. Basements are below it and are included. Not a figure a lookup
 * can replace: it says where the rule applies, not what it measures.
 */
export const ESCAPE_TOP_LEVEL = {
  level: 2,
  provenance: read(
    [ibc('1031.2', IBC_EGRESS), irc('R319.1')],
    { value: 3, unit: 'storeys' },
    'Bedrooms up to the third storey above the ground, and in basements'
  )
} as const

export function isFigureKey(key: unknown): key is FigureKey {
  return typeof key === 'string' && (FIGURE_KEYS as readonly string[]).includes(key)
}

/** A finite number inside the key's range. */
export function isPlausible(key: FigureKey, value: number): boolean {
  const spec = FIGURES[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max
}

/**
 * Whether the baselines apply for a country: the US, however Grid's list lets it be written (`US`,
 * `usa`, `United States`; COD-3, lab CH-3). No country here means yes: whether a plan that states
 * no place gets a figure at all is the full check's decision (`placeFor`, `WITHOUT_PLACE`).
 */
export function baselineApplies(country: string | undefined): boolean {
  return country === undefined || country.trim() === '' || countryOf(country)?.code === 'US'
}

/**
 * The figure a check applies for `key`: the looked-up one when it is plausible; otherwise
 * the baseline, where the baselines apply; otherwise `null`, and the check that needs it
 * does not run on that figure.
 */
export function resolveFigure(key: FigureKey, figures?: RuleFigures, country?: string): AppliedFigure | null {
  const spec = FIGURES[key]
  const given = figures?.[key]
  if (given !== undefined && isPlausible(key, given.value)) {
    return {
      key,
      value: given.value,
      unit: spec.unit,
      origin: 'lookup',
      status: 'ai-found',
      // A lookup asks for the same figure for the same kind of building (`lookup/prompt.ts`).
      readFor: spec.provenance.readFor,
      ...(given.source === undefined ? {} : { source: given.source })
    }
  }
  if (!baselineApplies(country) || spec.provenance.status === 'disputed') return null
  const { jurisdiction, citations, status, readOn } = spec.provenance
  return {
    key,
    value: spec.baseline,
    unit: spec.unit,
    origin: 'baseline',
    status,
    readFor: spec.provenance.readFor,
    jurisdiction,
    citations: citations.map(({ document, edition, clause }) => ({ document, edition, clause })),
    readOn
  }
}

/**
 * The kinds of building a finding's figures were read for (COD-2): those of the figures it applied,
 * or, for a bedroom with no escape opening at all, those of the escape rule it was held to. Empty
 * for a finding that used no figure.
 */
export function findingReadFor(finding: {
  readonly code?: string
  readonly figures?: readonly { readonly readFor: BuildingKind }[]
}): BuildingKind[] {
  const kinds = (finding.figures ?? []).map((figure) => figure.readFor)
  if (kinds.length === 0 && finding.code === 'no_escape_opening') kinds.push(ESCAPE_TOP_LEVEL.provenance.readFor)
  return [...new Set(kinds)]
}

/**
 * CNT-17: the statuses that say a named person has checked a figure against its source. Only a
 * figure with one of them, and each check in `verifiedBy` by a person, is confirmed. `ai-found`,
 * `human-entered` and `disputed` never are.
 */
export const CONFIRMED_STATUSES: readonly VerificationStatus[] = ['checked-once', 'checked-twice']

/** Whether a named person has confirmed the figure against its source (CNT-17). An AI is never the one who verified it. */
export function isConfirmed(provenance: Pick<Provenance, 'status' | 'verifiedBy'>): boolean {
  return (
    CONFIRMED_STATUSES.includes(provenance.status) &&
    provenance.verifiedBy.length > 0 &&
    provenance.verifiedBy.every((check) => check.by.trim() !== '' && !/\bAI\b/.test(check.by))
  )
}

/** A figure a named person has confirmed, as a comparison names it: its value, its source and who checked it. */
export interface ConfirmedFigure {
  readonly key: FigureKey
  readonly value: number
  readonly unit: FigureUnit
  readonly status: VerificationStatus
  readonly jurisdiction: string
  readonly readFor: BuildingKind
  readonly citations: readonly RuleCitation[]
  readonly verifiedBy: readonly Verification[]
}

/**
 * CNT-17: the figure for `key`, only when a named person has confirmed it (`isConfirmed`), the
 * place is stated and is one its figures are for (`baselineApplies`: a plan that states no place
 * gets no figure, COD-3), and the building is a kind it was read for (`readForCovers`). Null
 * otherwise, and then nothing is compared with it. `specs` is the table read, `FIGURES` but in a test.
 */
export function confirmedFigure(
  key: FigureKey,
  where: { readonly country?: string; readonly building?: BuildingType },
  specs: Readonly<Record<FigureKey, FigureSpec>> = FIGURES
): ConfirmedFigure | null {
  const spec = specs[key]
  const country = where.country?.trim() ?? ''
  if (!isConfirmed(spec.provenance) || country === '' || !baselineApplies(country)) return null
  if (!readForCovers([spec.provenance.readFor], where.building)) return null
  const { jurisdiction, readFor, citations, verifiedBy, status } = spec.provenance
  return {
    key,
    value: spec.baseline,
    unit: spec.unit,
    status,
    jurisdiction,
    readFor,
    citations: citations.map(({ document, edition, clause }) => ({ document, edition, clause })),
    verifiedBy
  }
}
