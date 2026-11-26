/**
 * The tools of `grid serve` that read the plan and change nothing in it, in the order of the
 * requests they answer most often (lab entry Y-2): comparing options, areas, the builder's
 * take-off and schedule, measuring, the named views, reading the plan in room terms, and the
 * check.
 *
 * Every answer is short text in Grid's own words, with the same facts as data under the tool's
 * output schema. Names and ids that come from the plan file are quoted.
 */
import { FACADE_SIDES, MEASURES, floorsWithNoStair, planFloors, planHasFinishes, planHasTypes, cameraInsideWall, compassPoint, drawingBearing, findView, floorOf, idsInPhase, phaseCounts, planHasPhases, itemFootprint, itemKindWord, kindWords, limit, oneInText, planOrientation, pointInPolygon, planStoreys, buildingHeights, levelText, metresText, slopeText, tolerance, viewSetting, wallPointAt, wrapDegrees, type Bounds, type CameraRecord, type FacadeSide, type FloorPlan, type HeadroomBand, type PlanFix } from '@ongrid/floorplan/geometry'
import { CAMERA_FITS, CameraRefused, eyeCamera, framedCamera, lensProblem, settingOfCamera, type CameraAsk, type CameraFit } from '../draw/cameraAsk'
import { PATH_MAX, PathRefused, quoted } from '../fs/projectFiles'
import { PictureOutRefused, pictureExtension, pngSize, pngToPdf, writePicture } from '../draw/pictureFiles'
import type { WorldBounds } from '../draw/views'
import { version } from '../../package.json'
import { GENERAL_GUIDANCE_LABEL, confirmedFigure, figureUsedSaid, inspectPlan, isFirmLine, type ResultLine } from '@ongrid/rules'
import { causeText, checkPlan, checkTitle, countsText, coverageSummary, firmHeadingText, firmNoNoteText, firmSectionTitle, firmStandardsText, kindWord, limitsText, nothingCheckedText, partsText, placeText, type PlaceWords, problemsText, readForText, restText, ruleText, seenBeforeText, seenByText, seenCount, thingText, usedFigures, withSeen, type CheckResult } from '../command/check'
import { askedLanguage, languageFor, spokenPlan } from '../command/language'
import { inLanguage, t, tv } from '../command/words'
import { LANGUAGES, english, joined, name, num, said, say, type Language, type MessageKey } from '@ongrid/floorplan/messages'
import { readSeen, type SeenState } from '../seen/marks'
import { firmForCheck } from '../firm/measure'
import { briefMissedText } from '../brief/answer'
import { describePlan, describeRooms, describeWalk, walkOf } from '../command/describe'
import { walkPictures } from '../describe/walkPictures'
import { WALK_EYE_HEIGHT, WALK_PICTURES_MAX } from '../describe/walk'
import { drawShowOf } from '../command/drawShow'
import { UsageError } from '../command/options'
import { faultText, type LoadedPlan } from '../command/plan'
import { nothingToDraw } from '../command/planFile'
import { cropFrame, partBounds, type PartBounds } from '../draw/partBoxes'
import { DESCRIBE_AUDIENCES, DESCRIBE_LENGTHS } from '../describe/card'
import { LOOKS, SIDES, pictureLook, type LookName, type Side } from '../draw/viewNames'
import { MARK_WORDS, marksAsked, readMarks, sectionLineOf, towardOf } from '../command/section'
import type { DrawingMarksAsked } from '@ongrid/floorplan/geometry/drawingMarks'
import { AREA_RULES, notCounted, planAreas, type AreaSureness, type NotCounted, type RoomArea, type RoomNotCounted } from '../quantities/areas'
import { OUTDOOR_RULES_ARG, type OutdoorRules } from './outdoorRulesArg'
import { stateText } from '../quantities/state'
import { comparePlans, optionRow, type Comparison, type OptionRow } from '../quantities/compare'
import {
  distanceBetween,
  wallsCrossed,
  EMPTY_ROOM_RULE,
  FACES_RULE,
  fitInRoom,
  HEIGHT_RULE,
  itemThing,
  measureRoom,
  openingThing,
  pointThing,
  roomHeight,
  roomThing,
  routeBetween,
  wallLengths,
  wallThing,
  wayGraph,
  type RoomHeight,
  type Thing,
} from '../quantities/measure'
import { WALKED_RULE, type WalkGap } from '../quantities/walked'
import { factsText, flatSchedule, flatScheduleCsv, openingSchedule, openingScheduleCsv, openingTypeSchedule, openingTypeScheduleCsv, planSchedule, roomSchedule, roomScheduleCsv, scheduleMarkLabels, shownNumber } from '../quantities/schedule'
import { fixtureCountText, fixturesLeftOut, fixturesLeftOutLine, FIXTURE_RULES, planFixtures } from '../quantities/fixtures'
import { FACING_RULE, facingAnswer, northWords } from '../quantities/facing'
import { SUN_RULE, sunAnswer } from '../quantities/sun'
import { SITE_RULE, siteAnswer } from '../quantities/site'
import { LIMITS_RULE, massingLines, siteLimits, storeysText } from '../quantities/limits'
import { figureOf, roomIndicators, USE_RULE, wideRoute, wideRouteLines } from '../quantities/use'
import { ACCESS_RULE, accessAnswer } from '../quantities/access'
import { FIGURES_HEADING, readBrief } from '../brief/brief'
import { roomCalled, roomCalledById, surveyPlan, sideNames, type Survey, type SurveyRoom } from '../quantities/survey'
import { planEstimate, WHOLE_BUILDING_KEY, type Estimate, type EstimateLine, type QuantityUnit } from '../quantities/estimate'
import { estimateCsv, priceEstimate, rateCard, RATE_UNITS, RATES_FILE, RatesRefused, readRates, type PricedLine, type Pricing, type Rates } from '../quantities/rates'
import { columnRule, parkingRule, planTakeoff, TAKEOFF_RULES, type BayCount, type ColumnRun, type RampFigures } from '../quantities/takeoff'
import { FINISH_RULE, FINISH_SURFACES, FINISH_UNITS, WALL_TYPE_RULE, planFinishes, wallTypeRuns, type FinishSurface } from '../quantities/finishes'
import {
  askPlan,
  checkSums,
  factInfos,
  fieldName,
  fieldOf,
  GRID_FIELDS,
  groupParts,
  FACT_PART_KINDS,
  PART_KINDS,
  QUERY_RULE,
  QueryRefused,
  select,
  shown,
  unitOf,
  valueWords,
  type Asked,
  type Field,
  type Part,
  type PartKind,
  type Value,
} from '../quantities/query'
import { areaText, csv, DISPLAY_UNITS, displayFor, lengthText, ownLengthText, sqFt } from '../quantities/units'
import type { Display } from '@ongrid/floorplan/types/units'
import { PLACE_TEXT_MAX } from '@ongrid/floorplan/types/places'
import { GROUP_COLOURS, HIGHLIGHT_COLOUR } from '@ongrid/viewer/src/picture/look'
import { TILE_PX_PER_METRE, pictureFrame, pictureTiles } from '@ongrid/viewer/src/picture/planSvg'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { TAPED_OUTPUT, tapedTable } from '../taped/table'
// CNT-20: the library grid_measure lists and fits by name.
import { libraryAnswer, libraryBox, LIBRARY_RULE } from '../library/answer'
import { libraryFor } from '../library/office'
// HND-10: the plan's trace image, read for grid_draw's plan.
import { readTrace } from '../trace/traceImage'
import {
  asRefusal,
  BOOLEAN,
  FLOOR_ARG,
  floorArg,
  listSchema,
  m,
  NULLABLE_NUMBER,
  NULLABLE_STRING,
  NUMBER,
  objectSchema,
  openingArg,
  PLAN_ARG,
  projectOf,
  readPlan,
  roomArg,
  STRING,
  thingArg,
  ToolRefusal,
  wallArg,
  type Answer,
  type ArgSpec,
  type GridTool,
  type AnswerImage,
  type ToolContext,
  nearestList,
} from './toolkit'

const q = (text: string): string => JSON.stringify(text)

/** CMD-23: the roofs the plan states over the given floors, in words ('' when it states none). */
function statedRoofWords(plan: FloorPlan, floorIds: readonly string[]): string {
  return (plan.floors ?? [])
    .filter((f) => f.roof !== undefined && floorIds.includes(f.id))
    .map((f) => {
      const r = f.roof!
      const slope = r.pitch !== undefined ? `, pitched ${r.pitch}°` : r.ridge !== undefined ? `, its ridge ${r.ridge} m up` : ''
      const run = r.ridgeRuns !== undefined ? `, ridge running ${r.ridgeRuns}` : ''
      const high = r.highSide !== undefined ? `, rising to the ${r.highSide}` : ''
      return `a ${r.shape} roof over ${q(f.name || f.id)}${slope}${run}${high}`
    })
    .join('; ')
}

/** CNT-12: what `fit` keeps clear of in a room with fixtures. */
const FIT_CLEAR_RULE = 'What is fitted keeps clear of the room\'s fixtures: each takes the floor its footprint covers.'

const UNITS_ARG: ArgSpec = {
  type: 'string',
  enum: DISPLAY_UNITS,
  description: 'How figures are written: m (metres), cm, mm, or ft-in (feet and inches, square feet beside square metres; ft is the same). The plan\'s own display, or m, when left out. Grid measures in metres either way.',
  examples: ['m', 'ft-in', 'mm'],
}

const DECIMAL_ARG: ArgSpec = {
  type: 'string',
  enum: ['point', 'comma'],
  description: 'The decimal mark figures are written with: point (2.40) or comma (2,40). The plan\'s own display, or point, when left out.',
  examples: ['comma'],
}

/** CMD-22: the structured data whole, or compact: totals first, what is empty left out. */
const DATA_ARG: ArgSpec = {
  type: 'string',
  enum: ['full', 'compact'],
  description: 'compact for the structured data with the label, single figures and totals first and empty values left out, shorter to read; full when left out. The words of the answer do not change.',
  examples: ['compact'],
}

const FORMAT_ARG: ArgSpec = {
  type: 'string',
  enum: ['text', 'csv'],
  description: 'text for the answer in words, csv for the table as comma-separated values to paste into a spreadsheet. text when left out.',
  examples: ['text', 'csv'],
}

function load(context: ToolContext, plan: unknown, floor?: unknown): { survey: Survey; floor: string | undefined; file: string } {
  const { loaded, file } = readPlan(context, plan)
  return { survey: surveyPlan(loaded.plan), floor: floorArg(loaded.plan, floor), file }
}

/** WRT-6 (lab AE-4, AE-13): where an area's walls came from and how sure it is, after the figure. */
const SOURCE_WORDS = { scanned: 'from a scan', measured: 'measured', given: 'as given', assumed: 'assumed' } as const
function surenessText(sure: AreaSureness | undefined, units: Display): string {
  if (sure === undefined) return ''
  const word = SOURCE_WORDS[sure.source]
  if (sure.plusMinus === null || sure.percent === null) return `, ${word}: how sure is not stated (a wall states no tolerance)`
  return `, ${word}, about ± ${sure.percent.toFixed(1)}% (± ${areaText(sure.plusMinus, units)})`
}

function percent(share: number | null): string {
  return share === null ? 'not known' : `${(share * 100).toFixed(1)}%`
}

// ---------------------------------------------------------------------------------------------
// grid_compare

function optionLine(row: OptionRow, units: Display): string {
  const uses = Object.entries(row.byUse).sort((a, b) => b[1] - a[1]).map(([use, value]) => `${use} ${value.toFixed(2)}`).join(', ')
  const gross = row.grossInternal === null ? 'gross not known' : `gross internal ${areaText(row.grossInternal, units)}, gross external ${areaText(row.grossExternal!, units)}`
  // ARE-60: a US option leads with its living area under air and its total under roof.
  const unknown = english(said('sheet.notKnown'))
  const air = row.underAirFirst ? `${english(said('areas.compare.underAir', { conditioned: row.conditioned === null ? unknown : areaText(row.conditioned, units), underRoof: row.underRoof === null ? unknown : areaText(row.underRoof, units) }))}; ` : ''
  return `${row.label}: ${air}net ${areaText(row.net, units)}, ${gross}; circulation ${row.circulation.toFixed(2)} m² (${percent(row.circulationShare)} of gross internal); net to gross ${percent(row.netToGross)}; ${row.rooms} rooms, ${row.bedrooms} bedrooms. By use, m²: ${uses || 'no uses said'}.${groupLine('room type', row.byRoomType)}${groupLine('tenure', row.byTenure)}`
}

/** ARE-61: an option's net floor by the firm's room type or by tenure, largest first; nothing when the plan states none. */
function groupLine(title: string, groups: Readonly<Record<string, number>> | undefined): string {
  if (groups === undefined) return ''
  return ` By ${title}, m²: ${Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([group, value]) => `${group} ${value.toFixed(2)}`).join(', ')}.`
}

/** At most `max` items, then how many more there are in the data. */
function some<T>(items: readonly T[], show: (item: T) => string, max = 6): string {
  const shown = items.slice(0, max).map(show).join('; ')
  return items.length > max ? `${shown}; and ${items.length - max} more in the data` : shown
}

function comparisonLines(c: Comparison): string[] {
  const lines = [c.verdict]
  if (c.likeness !== null) return lines
  const rooms = c.rooms.filter((r) => r.before === null || r.after === null || Math.abs(r.before - r.after) >= 0.01)
  if (rooms.length > 0) {
    lines.push(`  Rooms by name, net m²: ${some(rooms, (r) => `${q(r.name)} ${r.before === null ? 'none' : r.before.toFixed(2)} → ${r.after === null ? 'none' : r.after.toFixed(2)}`, 10)}.`)
  }
  // WRT-32: a room that moved as it was is said so, never counted as keeping its name and size in silence.
  if (c.roomsMoved.length > 0) lines.push(`  ${some(c.roomsMoved, (r) => r.text)}.`)
  const unchanged = c.rooms.length - rooms.length - c.rooms.filter((r) => r.moved !== null).length
  if (unchanged > 0) lines.push(`  ${unchanged} room${unchanged === 1 ? '' : 's'} keep their name and size.`)
  for (const [label, walls] of [['Walls out', c.wallsOut], ['Walls new', c.wallsNew]] as const) {
    if (walls.length === 0) continue
    lines.push(`  ${label}: ${some(walls, (w) => `${q(w.id)} ${w.kind} ${m(w.length)} m long, ${m(w.height)} m high (${m(w.faceArea / 2)} m² a side)${w.between.length > 1 ? ` between ${w.between.map(q).join(' and ')}` : w.between.length === 1 ? ` beside ${q(w.between[0]!)}` : ''}`)}.`)
  }
  if (c.wallsChanged.length > 0) {
    lines.push(`  Walls moved or another length: ${some(c.wallsChanged, (w) => `${q(w.id)} ${m(w.lengthBefore)} → ${m(w.lengthAfter)} m long${w.moved >= 0.005 ? `, moved ${m(w.moved)} m` : ''}`)}.`)
  }
  for (const [label, openings] of [['Openings out', c.openingsOut], ['Openings new', c.openingsNew]] as const) {
    if (openings.length === 0) continue
    lines.push(`  ${label}: ${some(openings, (o) => `${o.type} ${q(o.id)} ${m(o.width)} × ${m(o.height)} m, ${q(o.between[0])} ↔ ${q(o.between[1])}`)}.`)
  }
  if (c.openingsChanged.length > 0) lines.push(`  Openings changed: ${some(c.openingsChanged, (o) => `${o.type} ${q(o.id)}: ${o.changes.join(', ')}`)}.`)
  return lines
}

/** MSG-11: the language Grid writes its words in; the codes and values are the same in every language. */
export const LANGUAGE_ARG: ArgSpec = {
  type: 'string',
  maxLength: 35,
  description: `The language Grid writes its own words in, as a language tag: ${LANGUAGES.join(' or ')}, which Grid ships, or any other (de, fr, pt-BR, zh), written in the words the plan keeps for it (grid_words), else in English; a region is its language (es-MX is es). The label, each line's message, found, needed and fix, and the report. The plan's own display.language when left out, else en. Codes and values are the same in every language; room names stay as written.`,
  examples: ['es', 'es-MX', 'de']
}

const compareTool: GridTool = {
  name: 'grid_compare',
  title: 'Compare plans or options',
  hint: 'read',
  description:
    'Use this when the person asks how two or more plans differ, which option is bigger, to see options side by side, or what a change did: "compare A, B and C", "what differs between A and B", "how much bigger than now", "what comes out and what is new". '
    + 'It gives one table of the options (net, gross internal and gross external areas, the living area under air and the total under roof, which lead a US plan\'s row, circulation, net to gross, area by use) and, for each later plan against the first, what differs by room name, walls out and new with their lengths and face areas, and openings out, new or changed. '
    + 'A plan that is the first one moved, mirrored or turned is said to be so, not listed as moved walls. With picture true it also returns one sheet of the plans side by side at the same scale. '
    + 'Do not use for the areas of one plan (grid_areas) or a picture of one plan (grid_view). Units are metres.',
  args: {
    plans: {
      type: 'array',
      required: true,
      description: 'The plan files to compare, 2 to 6 paths inside the project folder; the first is what the others are compared with.',
      examples: [['option-a.json', 'option-b.json', 'option-c.json'], ['now.json', 'plan.json']],
      items: { maxLength: 4096 },
      minItems: 2,
      maxItems: 6,
    },
    labels: {
      type: 'array',
      description: 'A short name for each plan, in the same order, as the person calls them. A, B, C… when left out.',
      examples: [['Option A', 'Option B', 'Option C'], ['Now', 'Extended']],
      items: { maxLength: 40 },
      minItems: 2,
      maxItems: 6,
    },
    floor: { ...FLOOR_ARG, description: 'For the picture only: the floor to draw from each plan. Each plan\'s ground floor when left out.' },
    picture: { type: 'boolean', description: 'true to return one sheet with the plans side by side at one scale. false when left out.', examples: [true, false] },
  },
  outputSchema: objectSchema({
    options: listSchema(objectSchema({ label: STRING, net: NUMBER, grossInternal: NULLABLE_NUMBER, grossExternal: NULLABLE_NUMBER, conditioned: NULLABLE_NUMBER, underRoof: NULLABLE_NUMBER, underAirFirst: { type: 'boolean' }, circulation: NUMBER, circulationShare: NULLABLE_NUMBER, netToGross: NULLABLE_NUMBER, rooms: NUMBER, bedrooms: NUMBER, byUse: { type: 'object' }, byRoomType: { type: 'object' }, byTenure: { type: 'object' } }, ['label', 'net', 'grossInternal', 'grossExternal', 'conditioned', 'underRoof', 'underAirFirst', 'circulation', 'circulationShare', 'netToGross', 'rooms', 'bedrooms', 'byUse'])),
    comparisons: listSchema(objectSchema({ before: STRING, after: STRING, likeness: { type: ['string', 'null'] }, verdict: STRING, rooms: { type: 'array' }, wallsOut: { type: 'array' }, wallsNew: { type: 'array' }, wallsChanged: { type: 'array' }, openingsOut: { type: 'array' }, openingsNew: { type: 'array' }, openingsChanged: { type: 'array' }, massing: { type: 'object' } })),
    rules: listSchema(STRING),
  }),
  async run(args, context) {
    const files = args['plans'] as string[]
    const labels = (args['labels'] as string[] | undefined) ?? files.map((_, i) => String.fromCharCode(65 + i))
    if (labels.length !== files.length) throw new ToolRefusal(`labels needs one name for each of the ${files.length} plans.`)
    const surveys = files.map((file) => load(context, file).survey)
    const options = surveys.map((survey, i) => optionRow(labels[i]!, survey))
    const comparisons = surveys.slice(1).map((survey, i) => ({ before: labels[0]!, after: labels[i + 1]!, ...comparePlans(surveys[0]!, survey, [labels[0]!, labels[i + 1]!]) }))
    // ARE-60: the area under air's rules, where an option leads with it.
    const rules = [...Object.values(AREA_RULES), ...(options.some((row) => row.underAirFirst) ? [MEASURES.conditioned.measures, MEASURES.underRoof.measures] : [])]
    const lines = ['Options:', ...options.map((row) => `  ${optionLine(row, displayFor(undefined, undefined, surveys[0]!.plan))}`), '', ...comparisons.flatMap(comparisonLines), '', ...rules]
    let image
    if (args['picture'] === true) {
      const floor = args['floor']
      surveys.forEach((survey) => floorArg(survey.plan, floor))
      const { sheetView } = await import('../draw/views')
      const sheet = await sheetView(surveys.map((survey, i) => ({ plan: survey.plan, title: labels[i]!, ...(floor ? { floor: floor as string } : {}) })), 'working')
      image = { data: sheet.png, mimeType: 'image/png' as const }
      lines.push(`The sheet: ${labels.join(', ')} side by side, all at 1 m = ${sheet.pxPerMetre.toFixed(1)} px. Look at it before you describe it.`)
    }
    return {
      text: lines.join('\n'),
      data: { options, comparisons, rules },
      ...(image ? { image } : {}),
    }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_areas

/** CNT-4: an output schema with keys that only some plans' answers hold. */
const withOptional = (schema: Record<string, unknown>, only: readonly string[]): Record<string, unknown> => ({
  ...schema,
  required: (schema['required'] as string[]).filter((key) => !only.includes(key)),
})

const areasTool: GridTool = {
  name: 'grid_areas',
  title: 'Floor areas',
  hint: 'read',
  description:
    'Use this when the person asks how big the plan or a room is, for the total floor area, a gross internal or gross external area, square feet, circulation or net to gross, or an area table for a spreadsheet. '
    + 'It lists every room with its inside size and net area, the totals by floor and by use, the area of each flat the plan lists (and of the rooms in no flat), and the gross areas, each with a sentence saying what it measures, what it does not take off and what the plan cannot say. '
    + 'The plan\'s own site.country is read as grid_check reads it; pass country to override it for the gross measure the reader there usually means (the inside face of the outer walls in the UK and most of Europe, the outside face for US homes), or gross to ask for one or both. '
    + 'It gives the living area under air (conditioned: the rooms heated or cooled, to the outside face of their walls, a garage out) and the total under roof (underRoof: the gross external area, garage in, plus roofed outdoor space) on every floor and in all; for a US plan they lead the answer. Mark a room heated or not with grid_rename_room conditioned. '
    + 'On a plan that lists flats it gives each flat\'s area to the middle of its party walls too, and where fixtures stand the free floor beside the floor area, per room, zone, flat, floor and in all. Outdoor space is left out of every total unless outdoor_rules states a rule that counts part of it, and the answer says which. '
    + 'Rooms named in outside_rooms (a balcony, a terrace, a garage) are the outside, as outdoor space is: the walls round them face outside, they are listed apart and are in no net, gross internal or gross external figure; a room Grid could not draw is named and left out of every figure. Do not use for wall lengths, plaster or skirting (grid_takeoff), or to compare plans (grid_compare). Figures are in the units argument, else the plan\'s display (how its person reads lengths), else metres.',
  args: {
    plan: PLAN_ARG,
    floor: FLOOR_ARG,
    outside_rooms: {
      type: 'array',
      description: 'Room ids to list apart and leave out of the net and gross internal areas, such as a balcony.',
      examples: [['balcony'], ['terrace', 'porch']],
      items: { id: true },
      minItems: 1,
      maxItems: 50,
    },
    country: { type: 'string', maxLength: 2, description: 'Where it will be built, as a two-letter country code, in place of the plan\'s site.country: the gross measure usual there is given first. Both when neither is given or when Grid has none for that place.', examples: ['GB', 'US'] },
    gross: { type: 'string', enum: ['internal', 'external', 'both'], description: 'The gross measure to give: internal (to the inside face of the outer walls), external (to the outside face) or both. The usual one for country when left out.', examples: ['both', 'external'] },
    outdoor_rules: OUTDOOR_RULES_ARG,
    // ARE-20: one building measured apart from another built against it on the same floors.
    apart_rooms: {
      type: 'array',
      description: 'Room ids to measure apart, such as the rooms of one building built against another: their net area, and their area to the middle of each wall they share with the rest of the plan.',
      examples: [['nave', 'aisle', 'crossing']],
      items: { id: true },
      minItems: 1,
      maxItems: 500,
    },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    format: FORMAT_ARG,
    data: DATA_ARG,
  },
  outputSchema: withOptional(objectSchema({
    floors: listSchema(objectSchema({ floor: STRING, net: NUMBER, grossInternal: NULLABLE_NUMBER, grossExternal: NULLABLE_NUMBER, conditioned: NULLABLE_NUMBER, underRoof: NULLABLE_NUMBER, circulation: NUMBER, rooms: { type: 'array' }, leftOut: { type: 'array' }, byUse: { type: 'object' }, byRoomType: { type: 'object' }, byTenure: { type: 'object' } }, ['floor', 'net', 'rooms', 'leftOut'])),
    net: NUMBER,
    grossInternal: NULLABLE_NUMBER,
    grossExternal: NULLABLE_NUMBER,
    // ARE-60: the living area under air and the total under roof, and the rooms not under air.
    conditioned: NULLABLE_NUMBER,
    underRoof: NULLABLE_NUMBER,
    notUnderAir: objectSchema({ rooms: listSchema(objectSchema({ floor: STRING, id: STRING, name: STRING, why: STRING, area: NUMBER })), area: NUMBER }),
    // ARE-42: a gross total the whole building lacks, from the floors that have it, with the floors left out named; only then.
    partial: { type: 'object' },
    byUse: { type: 'object' },
    // ARE-61: the net floor by the firm's room type and by tenure; only on a plan where a room states one.
    byRoomType: { type: 'object' },
    byTenure: { type: 'object' },
    circulationShare: NULLABLE_NUMBER,
    netToGross: NULLABLE_NUMBER,
    leftOut: { type: 'array' },
    gross: objectSchema({ measures: listSchema(STRING), chosen: STRING, why: STRING }, ['measures', 'chosen', 'why']),
    // LVL-6: the floor by headroom band over the floors that state their roof, else null.
    headroom: { type: ['array', 'null'] },
    measures: listSchema(objectSchema({ measure: STRING, name: STRING, measures: STRING, notTakenOff: STRING, cannotSay: STRING })),
    rules: listSchema(STRING),
    notes: listSchema(STRING),
    // MSG-2: each total's state (proven, not-proven, not-looked-at) and the rooms it left out.
    states: { type: 'object' },
    // WRT-6: where the marked walls came from and the net total's give or take; null with no wall marks.
    sureness: { type: ['object', 'null'], properties: { source: STRING, plusMinus: NULLABLE_NUMBER, percent: NULLABLE_NUMBER } },
    // BRF-4: the storeys at or above the ground floor and below it.
    storeys: objectSchema({ above: NUMBER, below: NUMBER, storeys: { type: 'array' }, empty: { type: 'array' } }, ['above', 'below']),
    // CNT-4, only on a plan that lists flats: each flat's net area from the list, and the rooms in no flat.
    // ARE-14: toPartyWalls is each flat's area to the middle of its party walls, to each face of the outer walls.
    flats: listSchema(objectSchema({ id: STRING, name: STRING, type: { type: ['string', 'null'] }, net: NUMBER, floors: listSchema(STRING), rooms: listSchema(STRING), toPartyWalls: { type: ['object', 'null'], properties: { grossInternal: NUMBER, grossExternal: NUMBER } }, free: NUMBER, fixtures: NUMBER, outdoor: { type: 'object' } }, ['id', 'name', 'net', 'toPartyWalls'])),
    notInFlats: NULLABLE_NUMBER,
    notInFlatsToPartyWalls: { type: ['object', 'null'], properties: { grossInternal: NUMBER, grossExternal: NUMBER } },
    // ARE-14 (lab S-6), only on a plan with fixtures: the floor they take from the rooms the net counts, and the net less it.
    fixtures: NUMBER,
    free: NUMBER,
    // CNT-7, only on a plan with outdoor space: listed apart; weighted by the rules outdoor_rules states.
    outdoor: { type: 'object' },
    // CNT-6, only on a plan that names buildings: each building's own floors' figures and its height.
    buildings: listSchema(objectSchema({ id: STRING, name: STRING, floors: listSchema(STRING), net: NUMBER, grossInternal: NULLABLE_NUMBER, grossExternal: NULLABLE_NUMBER, height: NULLABLE_NUMBER }, ['id', 'name', 'floors', 'net'])),
    // ARE-20, only when apart_rooms is given: those rooms' net and their area to the middle of the walls they share.
    apart: objectSchema({ rooms: listSchema(STRING), net: NUMBER, byFloor: { type: 'object' }, toPartyWalls: { type: ['object', 'null'], properties: { grossInternal: NUMBER, grossExternal: NUMBER } }, notCounted: listSchema(STRING), state: { type: 'object' } }, ['rooms', 'net', 'toPartyWalls']),
  }), ['flats', 'notInFlats', 'notInFlatsToPartyWalls', 'buildings', 'fixtures', 'free', 'outdoor', 'apart', 'partial', 'byRoomType', 'byTenure']),
  run(args, context) {
    const { survey, floor } = load(context, args['plan'], args['floor'])
    const outside = (args['outside_rooms'] as string[] | undefined) ?? []
    for (const id of outside) roomArg(survey.plan, id, 'outside_rooms item')
    const apart = (args['apart_rooms'] as string[] | undefined) ?? []
    for (const id of apart) roomArg(survey.plan, id, 'apart_rooms item')
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const country = args['country'] as string | undefined
    if (country !== undefined && !/^[A-Za-z]{2}$/.test(country)) throw new ToolRefusal(`country takes a two-letter country code, such as GB or US: got ${q(country)}.`)
    const asked = args['gross'] as 'internal' | 'external' | 'both' | undefined
    const gross = asked === undefined ? undefined : asked === 'both' ? 'both' : asked === 'internal' ? 'grossInternal' : 'grossExternal'
    const storeys = planStoreys(survey.plan)
    const heights = new Map(buildingHeights(survey.plan, storeys).map((b) => [b.id, b.height?.height ?? null] as const))
    const outdoorRules = args['outdoor_rules'] as OutdoorRules | undefined
    const areas = planAreas(survey, {
      outside: new Set(outside),
      ...(floor === undefined ? {} : { floors: [floor] }),
      ...(country === undefined ? {} : { country }),
      ...(gross === undefined ? {} : { gross }),
      ...(outdoorRules === undefined ? {} : { outdoorWeights: outdoorRules }),
      ...(apart.length === 0 ? {} : { apart: new Set(apart) }),
    })
    const buildings = areas.buildings.map((b) => ({ ...b, height: heights.get(b.id) ?? null }))
    const data = {
      floors: areas.floors,
      net: areas.net,
      grossInternal: areas.grossInternal,
      grossExternal: areas.grossExternal,
      conditioned: areas.conditioned,
      underRoof: areas.underRoof,
      notUnderAir: areas.notUnderAir,
      ...(areas.partial === undefined ? {} : { partial: areas.partial }),
      byUse: areas.byUse,
      ...(areas.byRoomType === undefined ? {} : { byRoomType: areas.byRoomType }),
      ...(areas.byTenure === undefined ? {} : { byTenure: areas.byTenure }),
      circulationShare: areas.circulationShare,
      netToGross: areas.netToGross,
      leftOut: areas.leftOut,
      gross: { measures: areas.reader.gross, chosen: areas.reader.chosen, why: areas.reader.why },
      headroom: areas.headroom,
      measures: areas.measures,
      rules: areas.rules,
      notes: areas.notes,
      states: areas.states,
      sureness: areas.sureness ?? null,
      // BRF-4 (lab FD-1): the storeys, counted by level from the floors that hold an outline or
      // walls that close one: massing counts before any wall.
      storeys: { above: storeys.above, below: storeys.below, storeys: storeys.storeys, empty: storeys.empty },
      // CNT-4: only on a plan that lists flats, so every other answer is as it was.
      ...(areas.notInFlats === null ? {} : { flats: areas.flats, notInFlats: areas.notInFlats, notInFlatsToPartyWalls: areas.notInFlatsToPartyWalls }),
      // ARE-14 and CNT-7: only on a plan with fixtures, or with outdoor space.
      ...(areas.free === undefined ? {} : { fixtures: areas.fixtures, free: areas.free }),
      ...(areas.outdoor === undefined ? {} : { outdoor: areas.outdoor }),
      // CNT-6: only on a plan that names buildings, so every other answer is as it was.
      ...(buildings.length === 0 ? {} : { buildings }),
      ...(areas.apart === undefined ? {} : { apart: areas.apart }),
    }
    if (args['format'] === 'csv') {
      const rows = areas.floors.flatMap((f) => f.rooms.map((r) => [f.floor, r.id, r.name, r.use, r.size?.[0] ?? null, r.size?.[1] ?? null, r.net, r.net === null ? null : sqFt(r.net), countedWord(r), r.state]))
      // CNT-4: each flat, then the rooms in no flat, after the rooms and before the totals.
      for (const flat of areas.flats) rows.push([flat.floors.join(' '), flat.id, flat.name, flat.typeName ?? flat.type ?? '', null, null, flat.net, sqFt(flat.net), 'flat', flat.state.state])
      if (areas.notInFlats !== null) rows.push(['all', '', 'In no flat', '', null, null, areas.notInFlats, sqFt(areas.notInFlats), 'not in a flat', areas.states.net.state])
      rows.push(['all', '', 'Net total', '', null, null, areas.net, sqFt(areas.net), '', areas.states.net.state])
      if (areas.grossInternal !== null) rows.push(['all', '', 'Gross internal', '', null, null, areas.grossInternal, sqFt(areas.grossInternal), '', areas.states.grossInternal.state])
      if (areas.grossExternal !== null) rows.push(['all', '', 'Gross external', '', null, null, areas.grossExternal, sqFt(areas.grossExternal), '', areas.states.grossExternal.state])
      // ARE-60: where they are said, first for a US plan.
      if (areas.underAir.shown) {
        const air = ([['conditioned', areas.conditioned], ['underRoof', areas.underRoof]] as const).flatMap(([m, value]) => (value === null ? [] : [['all', '', MEASURES[m].name, '', null, null, value, sqFt(value), '', areas.states[m].state]]))
        if (areas.underAir.first) rows.splice(rows.length - [areas.grossInternal, areas.grossExternal].filter((v) => v !== null).length - 1, 0, ...air)
        else rows.push(...air)
      }
      return { text: csv(['floor', 'room id', 'name', 'use', 'across m', 'up m', 'net m2', 'net sq ft', 'counted', 'state'], rows), data }
    }
    const lines: string[] = []
    const several = survey.facts.floors.length > 1
    for (const f of areas.floors) {
      if (several) lines.push(`Floor ${q(f.floor)}:`)
      for (const r of f.rooms) {
        const size = r.size ? `${lengthText(r.size[0], units)} × ${lengthText(r.size[1], units)}, ` : ''
        // MSG-2: a room that could not be measured has no area, and one in doubt says so.
        const free = r.free === undefined ? '' : `, free floor ${areaText(r.free, units)} (fixtures stand on ${areaText(r.fixtures!, units)})`
        const measured = r.net === null ? 'not measured: it could not be drawn' : `${size}${areaText(r.net, units)}${free}${r.state === 'not-proven' ? `, not proven: the drawing questions its outline (${r.doubts.join(', ')})` : ''}`
        // CNT-8: a zone's floor is in its room's, so it is not counted again.
        const zone = r.zoneOf === undefined ? '' : `, a zone of ${q(f.rooms.find((room) => room.id === r.zoneOf)?.name ?? r.zoneOf)}: in its area, not counted again`
        // SHT-11: a stair room over the stair below is counted once, with it.
        const below = r.countedWith ? `, counted once with ${q(r.countedWith.room)} on floor ${q(r.countedWith.floor)}, the ${r.use === 'lift' ? 'lift' : 'stair'} it rises from` : ''
        // CNT-27: a void has no floor, so it is in no figure.
        const open = r.void === true ? ', a void, open to the floor below: in no figure' : ''
        // ARE-60: a room not heated or cooled, where the area under air is said.
        const air = r.unconditioned === true && areas.underAir.shown && notCounted(r) === null ? english(said('areas.room.unconditioned')) : ''
        // LVL-6: under a roof the floor states, the room's floor by headroom band.
        const headroom = r.headroom === undefined ? '' : `; ${bandsText(r.headroom.bands, units)}, headroom ${lengthText(r.headroom.lowest, units)} to ${lengthText(r.headroom.highest, units)}`
        // CNT-7: an outdoor space is listed apart, with its kind and whether a roof covers it.
        const outdoor = r.outdoor === undefined ? '' : english(said('areas.room.outdoor', { kind: said(`outdoor.kind.${r.outdoor.kind}`), roofed: said(r.outdoor.roofed ? 'outdoor.roofed' : 'outdoor.open') }))
        lines.push(`  ${q(r.name)}${r.use ? ` (${r.use})` : ''}: ${measured}${r.net === null ? '' : surenessText(r.sureness, units)}${r.outside ? ', outside: not counted' : ''}${outdoor}${zone}${below}${open}${air}${headroom}`)
      }
    }
    if (several) {
      for (const f of areas.floors) {
        const gross = areas.reader.gross.map((m) => `${m === 'grossInternal' ? 'gross internal' : 'gross external'} ${f[m] === null ? 'not known' : areaText(f[m]!, units)}`)
        const free = f.free === undefined ? '' : english(said('areas.free.floor', { area: areaText(f.free, units) }))
        // ARE-60: the area under air and the total under roof, first where they lead.
        const air = !areas.underAir.shown ? [] : ([['conditioned', f.conditioned], ['underRoof', f.underRoof]] as const).map(([m, value]) => `${MEASURES[m].name.toLowerCase()} ${value === null ? 'not known' : areaText(value, units)}`)
        const figures = areas.underAir.first ? [...air, ...gross] : [...gross, ...air]
        lines.push(`Floor ${q(f.floor)}: net ${areaText(f.net, units)}${surenessText(f.sureness, units)}${free}, ${figures.join(', ')}.`)
      }
    }
    // CNT-4: each flat the plan lists, from the list and never from the rooms' names (lab EL-1).
    if (areas.notInFlats !== null) {
      lines.push('Flats, as the plan lists them:')
      for (const flat of areas.flats) {
        const type = flat.type === null ? '' : `${flat.typeName ?? flat.type}${flat.mirrored ? ', mirrored' : ''}; `
        const floors = flat.floors.length > 1 ? `, on ${flat.floors.length} floors (${flat.floors.map((id) => `${q(id)} ${areaText(flat.byFloor[id] ?? 0, units)}`).join(', ')})` : ''
        const doubt = flat.state.state === 'proven' ? '' : `, ${flat.state.state === 'not-proven' ? 'not proven' : 'not measured'}`
        lines.push(`  ${q(flat.name)} (${type}${flat.rooms.length} room${flat.rooms.length === 1 ? '' : 's'}): ${areaText(flat.net, units)}${floors}${doubt}${flatExtras(flat, areas.reader.gross, units)}`)
      }
      lines.push(`  In no flat: ${areaText(areas.notInFlats, units)}${toPartyWallsText(areas.notInFlatsToPartyWalls, areas.reader.gross, units)}.`)
      lines.push(`${MEASURES.partyWall.name}: ${MEASURES.partyWall.measures}`)
    }
    // CNT-6: each building the plan names, from its own floors.
    if (buildings.length > 0) {
      lines.push(english(said('areas.buildings.heading')))
      for (const b of buildings) {
        const gross = areas.reader.gross.map((m) => `${m === 'grossInternal' ? 'gross internal' : 'gross external'} ${b[m] === null ? 'not known' : areaText(b[m]!, units)}`)
        lines.push(`  ${q(b.name)} (${b.floors.length} floor${b.floors.length === 1 ? '' : 's'}): net ${areaText(b.net, units)}, ${gross.join(', ')}${b.height === null ? '' : `, ${lengthText(b.height, units)} high`}.`)
      }
    }
    // ARE-20: the rooms measured apart, as one building from the one built against it.
    if (areas.apart !== undefined) {
      const parts = areas.apart.toPartyWalls === null ? [] : areas.reader.gross.map((m) => said(m === 'grossInternal' ? 'areas.toPartyWalls.grossInternal' : 'areas.toPartyWalls.grossExternal', { area: areaText(areas.apart!.toPartyWalls![m], units) }))
      lines.push(english(said(areas.apart.rooms.length === 1 ? 'areas.apart.one' : 'areas.apart', { count: areas.apart.rooms.length, net: `${areaText(areas.apart.net, units)}${stateText(areas.apart.state, several)}`, toPartyWalls: parts.length === 0 ? '' : said('areas.apart.toPartyWalls', { areas: joined(parts, 'join.comma') }) })))
      if (areas.apart.notCounted.length > 0) lines.push(english(said('areas.apart.notCounted', { ids: joined(areas.apart.notCounted.map((id) => name(id)), 'join.comma') })))
    }
    const uses = Object.entries(areas.byUse)
    if (uses.length > 1) lines.push(`Net by use: ${uses.map(([use, area]) => `${use} ${areaText(area, units)}`).join(', ')}.`)
    // ARE-61: by the firm's room type and by tenure, on a plan where a room states one.
    for (const [title, groups] of [['room type', areas.byRoomType], ['tenure', areas.byTenure]] as const) {
      if (groups !== undefined) lines.push(`Net by ${title}: ${Object.entries(groups).map(([group, area]) => `${group} ${areaText(area, units)}`).join(', ')}.`)
    }
    // ARE-60: the living area under air and the total under roof, each with its rule; first for a US plan.
    const airLines = !areas.underAir.shown ? [] : (['conditioned', 'underRoof'] as const).map((m) => {
      const value = areas[m]
      return `${MEASURES[m].name}: ${value === null ? `not known: ${areas.underAirWhy[m] ?? ''}` : `${areaText(value, units)}${stateText(areas.states[m], several)}.`} ${MEASURES[m].measures}`
    })
    if (areas.underAir.first) lines.push(...airLines)
    // Each figure with the rule it follows, in Grid's words: never a bare number (AR-16).
    lines.push(`Net: ${areaText(areas.net, units)}${surenessText(areas.sureness, units)}${stateText(areas.states.net, several)}. ${AREA_RULES.net}`)
    for (const m of areas.reader.gross) {
      const value = m === 'grossInternal' ? areas.grossInternal : areas.grossExternal
      const state = value === null ? '' : stateText(areas.states[m], several)
      const part = areas.partial?.[m]
      const unknown = part === undefined ? 'not known' : english(said(part.floors.length === 1 ? 'areas.partial.line.one' : 'areas.partial.line.many', { count: part.floors.length, area: areaText(part.area, units), left: joined(part.unmeasured.map((u) => `floor ${q(u.floor)} (${u.why})`), 'join.comma') }))
      lines.push(`${m === 'grossInternal' ? 'Gross internal' : 'Gross external'}: ${value === null ? unknown : areaText(value, units)}${state}. ${AREA_RULES[m]}`)
    }
    if (!areas.underAir.first) lines.push(...airLines)
    if (areas.headroom !== null) lines.push(`Area by headroom: ${bandsText(areas.headroom, units)}. ${MEASURES.headroom.measures}`)
    // ARE-14 (lab S-6): the free floor beside the floor area, each with its label.
    if (areas.free !== undefined) lines.push(english(said('areas.free.total', { free: areaText(areas.free, units), taken: areaText(areas.fixtures!, units), rule: MEASURES.freeFloor.measures })))
    if (areas.floors.some((f) => f.massing)) lines.push(storeysText(storeys))
    lines.push(`Assumed: ${areas.reader.why} Grid's own rule, not checked against any local standard.`)
    if (areas.grossInternal !== null && areas.reader.gross.includes('grossInternal')) {
      lines.push(`Circulation: ${areas.circulation.toFixed(2)} m², ${percent(areas.circulationShare)} of gross internal. Net to gross: ${percent(areas.netToGross)}.`)
    }
    const outsideArea = areas.floors.reduce((sum, f) => sum + f.outsideRooms, 0)
    if (outsideArea > 0) lines.push(`Outside, listed apart: ${areaText(outsideArea, units)}.`)
    // CNT-7 (C26): the outdoor spaces, listed apart from every total, by kind.
    if (areas.outdoor !== undefined) {
      const kinds = Object.entries(areas.outdoor.byKind).map(([kind, area]) => said('areas.outdoor.kind', { kind: said(`outdoor.kind.${kind}` as MessageKey), area: areaText(area ?? 0, units) }))
      lines.push(english(said('areas.outdoor', { area: areaText(areas.outdoor.area, units), kinds: joined(kinds, 'join.comma'), roofed: areaText(areas.outdoor.roofed, units), open: areaText(areas.outdoor.open, units), rule: areas.outdoor.rule.measures })))
      // ARE-14: left out of every total, or counted by the rule the person stated: the answer says which.
      lines.push(...outdoorCountedLines(areas.outdoor, units))
    }
    for (const rule of areas.measures) {
      const gross = rule.measure === 'grossInternal' || rule.measure === 'grossExternal'
      if (!gross || areas.reader.gross.includes(rule.measure)) lines.push(`${rule.name}: ${rule.notTakenOff} ${rule.cannotSay}`)
    }
    // Any rule beyond the measures' (ARE-14: free floor is one of them now, said with its figure).
    const measureRules: readonly string[] = [...Object.values(AREA_RULES), MEASURES.headroom.measures, MEASURES.freeFloor.measures, MEASURES.conditioned.measures, MEASURES.underRoof.measures]
    lines.push(...areas.rules.filter((rule) => !measureRules.includes(rule)), ...areas.notes)
    return { text: lines.join('\n'), data }
  },
}

/** ARE-14: an area to the party walls, in the gross measures the reader asked for, after a flat's net. */
function toPartyWallsText(area: { readonly grossInternal: number; readonly grossExternal: number } | null, gross: readonly ('grossInternal' | 'grossExternal')[], units: Display): string {
  if (area === null) return ''
  const parts = gross.map((m) => said(m === 'grossInternal' ? 'areas.toPartyWalls.grossInternal' : 'areas.toPartyWalls.grossExternal', { area: areaText(area[m], units) }))
  return english(said('areas.flat.toPartyWalls', { areas: joined(parts, 'join.comma') }))
}

/** CNT-27: the CSV's `counted` cell for a room of grid_areas: `inside`, or why it is in no total. */
function countedWord(room: RoomArea): string {
  const why = notCounted(room)
  if (why === null) return 'inside'
  return why === 'shaft' ? `with the ${room.use === 'lift' ? 'lift' : 'stair'} below` : why
}

/** CNT-27: why a room is in no count or total, in a few words, for grid_count and grid_schedule. */
const NOT_COUNTED_WORDS: Readonly<Record<NotCounted, readonly [string, string]>> = {
  zone: ['zone of a room, counted with the room', 'zones of a room, counted with the room'],
  outside: ['room named outside', 'rooms named outside'],
  outdoor: ['outdoor space', 'outdoor spaces'],
  void: ['void, with no floor', 'voids, with no floor'],
  shaft: ['stair or lift room counted once, with the lowest room of its shaft', 'stair or lift rooms counted once, with the lowest room of their shaft'],
}

/** ARE-14: a flat's area to the party walls, its free floor and its outdoor space, after its net. */
function flatExtras(flat: ReturnType<typeof planAreas>['flats'][number], gross: readonly ('grossInternal' | 'grossExternal')[], units: Display): string {
  const free = flat.free === undefined ? '' : english(said('areas.flat.free', { area: areaText(flat.free, units) }))
  const outdoor = flat.outdoor === undefined
    ? ''
    : flat.outdoor.weighted === null
      ? english(said('areas.flat.outdoor', { area: areaText(flat.outdoor.area, units) }))
      : english(said('areas.flat.outdoorCounted', { area: areaText(flat.outdoor.area, units), counted: areaText(flat.outdoor.weighted, units), withIt: areaText(flat.net + flat.outdoor.weighted, units) }))
  return `${toPartyWallsText(flat.toPartyWalls, gross, units)}${free}${outdoor}`
}

/** ARE-14: whether the outdoor space is left out of every total or counted by the rules stated, kind by kind. */
function outdoorCountedLines(outdoor: NonNullable<ReturnType<typeof planAreas>['outdoor']>, units: Display): string[] {
  const kindSaid = (kind: string) => said(`outdoor.kind.${kind}` as MessageKey)
  if (outdoor.weighted === null) return [english(said('areas.outdoor.leftOut'))]
  const counted = outdoor.weighted.kinds.map((k) => english(said('areas.outdoor.counted', { kind: kindSaid(k.kind), share: num(String(Number((k.share * 100).toFixed(2)))), rule: k.rule, area: areaText(k.counted, units) })))
  const left = Object.keys(outdoor.byKind).filter((kind) => !outdoor.weighted!.kinds.some((k) => k.kind === kind))
  return [
    ...counted,
    ...(left.length === 0 ? [] : [english(said('areas.outdoor.notCounted', { kinds: joined(left.map(kindSaid), 'join.comma') }))]),
    english(said('areas.outdoor.withNet', { area: areaText(outdoor.weighted.withNet, units) })),
  ]
}

/** LVL-6: a stated roof's shape, pitch, area on its slope and rooflights, after its area on plan. */
function sloped(roof: { readonly shape: string | null; readonly pitch: number; readonly slopeArea: number; readonly rooflights: number }, units: Display): string {
  if (roof.shape === null) return ''
  const slope = roof.pitch > 0 ? `, pitched ${roof.pitch.toFixed(1)}°, ${areaText(roof.slopeArea, units)} on its slope` : ''
  const lights = roof.rooflights === 0 ? '' : `, ${roof.rooflights === 1 ? 'one rooflight' : `${roof.rooflights} rooflights`}`
  return `, on plan; a ${roof.shape} roof${slope}${lights}`
}

/** LVL-6: floor by headroom band, as `at least 1.50 m 18.42 m², at least 2.20 m 12.28 m²`. */
function bandsText(bands: readonly HeadroomBand[], units: Display): string {
  return bands.map((b) => `at least ${lengthText(b.height, units)} ${areaText(b.area, units)}`).join(', ')
}

// ---------------------------------------------------------------------------------------------
// grid_takeoff

/** ARE-13: a quantity as the bill writes it. */
function quantityText(quantity: number, unit: QuantityUnit, units: Display): string {
  if (unit === 'nr') return `${Math.round(quantity)} nr`
  return unit === 'm2' ? areaText(quantity, units) : lengthText(quantity, units)
}

const money = (amount: number, currency: string): string =>
  `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

const UNIT_SHOWN: Readonly<Record<QuantityUnit, string>> = { m2: 'm²', m: 'm', nr: 'nr' }

/** ARE-13: the bill of quantities, priced from the person's rates or as a rate card. */
function estimateAnswer(estimate: Estimate, pricing: Pricing | null, units: Display, asCsv: boolean, change = false): Answer {
  const rules = [...new Set(estimate.lines.map((line) => line.rule))]
  const data: Record<string, unknown> = {
    label: GENERAL_GUIDANCE_LABEL,
    lines: pricing?.lines ?? estimate.lines,
    notes: estimate.notes,
    rules,
    ...(pricing === null
      ? { rateCard: rateCard(estimate) }
      : {
          cost: {
            file: pricing.file,
            label: pricing.label,
            currency: pricing.currency,
            total: pricing.total,
            complete: pricing.complete,
            missing: pricing.missing,
            wrongUnit: pricing.wrongUnit,
            unused: pricing.unused,
            wholeBuilding: pricing.wholeBuilding,
          },
          orders: pricing.orders,
          orderProblems: pricing.orderProblems,
        }),
  }
  if (asCsv) return { text: estimateCsv(estimate, pricing), data }
  const lines: string[] = [
    change
      ? `The plan's work as three lists, demolish, make good and new, from the drawing only. ${GENERAL_GUIDANCE_LABEL}.`
      : `Quantities for a first estimate, from the drawing only. ${GENERAL_GUIDANCE_LABEL}.`,
    pricing === null
      ? 'Rate card: no rates given, so no cost. Each line with its key and unit, ready to fill:'
      : `Priced from ${q(pricing.file)}${pricing.label ? ` (${q(pricing.label)})` : ''}, in ${q(pricing.currency)}: the person's rates, not a price list.`,
  ]
  const shown: readonly (EstimateLine & Partial<PricedLine>)[] = pricing?.lines ?? estimate.lines
  shown.forEach((line, i) => {
    // CNT-10: a change's lines under their list's name.
    const list = (line as { list?: string }).list
    if (list !== undefined && (shown[i - 1] as { list?: string } | undefined)?.list !== list) lines.push(`${list.charAt(0).toUpperCase()}${list.slice(1)}:`)
    let cost = ''
    if (pricing !== null) {
      if (line.state === 'priced' || line.state === 'alternative') {
        const waste = line.given!.waste === 0 ? '' : ` + ${+(line.given!.waste * 100).toFixed(2)}% waste`
        cost = `${waste} × ${money(line.rate!, pricing.currency)}/${UNIT_SHOWN[line.unit]} = ${money(line.amount!, pricing.currency)}${line.state === 'alternative' ? ', an alternative to the total' : ''}`
      } else if (line.state === 'wrong unit') {
        cost = `, not priced: the rate ${q(line.rateKey!)} is per ${line.given!.unit}`
      } else {
        cost = line.key === WHOLE_BUILDING_KEY ? '' : line.rateKey === null || line.rateKey === undefined ? ', no rate' : `, no rate: ${q(line.rateKey)} is not filled in`
      }
    }
    const assumed = line.assumed ? ', assumed' : ''
    lines.push(`  ${line.key}: ${line.what}, ${quantityText(line.quantity, line.unit, units)}${pricing === null ? `${assumed}; rate per ${line.unit}` : `${cost}${assumed}`}`)
    // Each line's rule follows it, once for a run of lines that share one (AC-14).
    if (shown[i + 1]?.rule !== line.rule) lines.push(`    Rule: ${line.rule}`)
  })
  if (pricing === null) {
    lines.push(
      `To price it, save the rate card as ${RATES_FILE} beside the plan, or pass the file as rates: {"currency": "EUR", "label": "where the rates come from", "rates": {"<key>": {"rate": 40, "unit": "m2"}}}. `
        + 'A shorter key covers longer ones: "wall:exterior" prices every outside wall, "door" every door, "floor" every floor finish. '
        + `Units: ${RATE_UNITS.join(', ')}; a rate per ft2 or ft is turned into one per m² or m. The data's rateCard is the file, ready to fill.`,
    )
  } else {
    const gaps: string[] = []
    if (pricing.missing.length > 0) gaps.push(`${pricing.missing.length} ${pricing.missing.length === 1 ? 'line has' : 'lines have'} no rate (${pricing.missing.join(', ')})`)
    if (pricing.wrongUnit.length > 0) {
      gaps.push(`${pricing.wrongUnit.length} ${pricing.wrongUnit.length === 1 ? 'line has its rate' : 'lines have their rate'} in the wrong unit (${pricing.wrongUnit.map((w) => `${w.key}: ${q(w.rateKey)} is per ${w.rateUnit}, the line is in ${w.unit}`).join('; ')})`)
    }
    lines.push(`Total of the priced lines: ${money(pricing.total, pricing.currency)}.${gaps.length === 0 ? ' Every line is priced.' : ` Not the whole cost: ${gaps.join(', and ')}.`}`)
    if (pricing.wholeBuilding !== null) lines.push(`The whole building at the ${WHOLE_BUILDING_KEY} rate: ${money(pricing.wholeBuilding, pricing.currency)}, an alternative to the total, never added to it.`)
    if (pricing.unused.length > 0) lines.push(`Rates that price no line of this plan: ${pricing.unused.map(q).join(', ')}.`)
    if (pricing.orders.length > 0) {
      lines.push('Orders, from the rates file:')
      for (const order of pricing.orders) {
        lines.push(`  ${q(order.name)}: ${order.packs} ${order.pack} (${order.needed.toFixed(2)} ${UNIT_SHOWN[order.unit]} needed)${order.assumed ? ', assumed: it rests on an assumed line' : ''}`)
        lines.push(`    Rule: ${order.rule}`)
      }
    }
    lines.push(...pricing.orderProblems)
  }
  lines.push(...estimate.notes)
  return { text: lines.join('\n'), data }
}

/** CNT-16: the take-off's columns, in a line, by shape and size. */
function columnsLine(runs: readonly ColumnRun[], units: Display): string {
  const parts = runs.map((run) =>
    said(run.depth === null ? 'takeoff.columns.round' : 'takeoff.columns.square', {
      count: run.count,
      width: num(lengthText(run.width, units)),
      depth: num(run.depth === null ? '' : lengthText(run.depth, units)),
      length: num(lengthText(run.length, units)),
      volume: num(run.volume.toFixed(2)),
    })
  )
  return english(said('takeoff.columns', { runs: joined(parts, 'join.semicolon') }))
}

/** CNT-19: the take-off's parking bays per floor, in a line, and one line per ramp with its levels and slope. */
function parkingLines(bays: readonly BayCount[], ramps: readonly RampFigures[], units: Display, names: ReadonlyMap<string, string>): string[] {
  return [
    ...(bays.length === 0 ? [] : [english(said('takeoff.bays', { floors: joined(bays.map((b) => said('takeoff.bays.floor', { count: b.count, floor: name(b.floorName) })), 'join.semicolon') }))]),
    ...ramps.map((r) => {
      const values = {
        ramp: name(r.name),
        lower: name(names.get(r.lower.floor) ?? r.lower.floor),
        lowerLevel: num(lengthText(r.lower.level, units)),
        upper: name(names.get(r.upper.floor) ?? r.upper.floor),
        upperLevel: num(lengthText(r.upper.level, units)),
        rise: num(lengthText(r.rise, units)),
        length: num(lengthText(r.length, units)),
        slope: num(slopeText(r.slope)),
        oneIn: num(oneInText(r.oneIn)),
      }
      return english(r.statedSlope === null ? said('takeoff.ramp', values) : said('takeoff.ramp.stated', { ...values, stated: num(slopeText(r.statedSlope)) }))
    }),
  ]
}

/** CNT-15: one line per surface with each finish's quantity, a finish not stated last. */
function finishLines(totals: readonly { readonly surface: FinishSurface; readonly finish: string | null; readonly quantity: number; readonly rooms: readonly string[] }[], units: Display): string[] {
  const words: Record<FinishSurface, string> = { floor: 'Floor', walls: 'Wall faces', ceiling: 'Ceilings', skirting: 'Skirting' }
  const amount = (surface: FinishSurface, quantity: number): string => (FINISH_UNITS[surface] === 'm' ? lengthText(quantity, units) : areaText(quantity, units))
  return [
    'Finishes:',
    ...FINISH_SURFACES.flatMap((surface) => {
      const of = totals.filter((total) => total.surface === surface)
      return of.length === 0 ? [] : [`  ${words[surface]}: ${of.map((total) => `${total.finish === null ? 'not stated' : q(total.finish)} ${amount(surface, total.quantity)} (${total.rooms.length} room${total.rooms.length === 1 ? '' : 's'})`).join('; ')}.`]
    }),
  ]
}

const takeoffTool: GridTool = {
  name: 'grid_takeoff',
  title: 'Quantities for pricing',
  hint: 'read',
  description:
    'Use this when a builder or the person asks for quantities to price work: metres of wall (outside walls, inner walls, partitions), plaster or paint area per room less openings, ceiling areas, skirting lengths, slab and roof areas, or these as a spreadsheet. '
    + 'With for=estimate, or when the person asks what the plan will cost, how much flooring, paint or plasterboard it takes, or for a bill of quantities, it gives the figures a first estimate needs instead: floor finishes and wall faces by room use, ceilings, skirting, reveals, walls by kind and thickness, the outside face, doors and windows by size, the slab, upper floors and the roof (assumed: the plan holds none), and the gross internal area, each line with a key, its rule and an assumed mark. '
    + 'With for=change, for a refurbishment whose plan marks parts existing, demolished or new, it gives the work as three lists instead: demolish (walls by kind and thickness, doors and windows), make good (floor where walls stood, wall faces where they met, openings filled in, reveals of new openings in old walls) and new (walls, doors and windows, the new rooms\' floors), so taking a wall out is work to price, never a saving. '
    + `A cost comes only from the person's own rates file (rates, or ${RATES_FILE} beside the plan), which must name its currency; with none, the answer is a rate card to fill in and holds no money. Lines with no rate and rates in the wrong unit are listed apart. Grid has no prices. `
    + 'Every figure is worked out from the plan\'s walls and openings by a rule stated in the answer. '
    + 'It also gives each floor\'s slab and the roof over every part with nothing above, worked out from the outlines and marked assumed. '
    + 'On a plan that names wall types or room finishes (types and finishes in the plan), it also gives the walls of each named type (length and face, with its material) and each finish\'s quantity (floor, walls and ceiling by area, skirting by length), a zone\'s finish taking its part of its room; the estimate then prices them by type and by finish. '
    + 'On a plan with parking bays or ramps (bays and ramps in the plan), it also counts the bays on each floor, with their numbers, and gives each ramp\'s two levels in metres, its rise, its length and its slope in percent, as numbers. '
    + 'Do not use for floor areas alone (grid_areas) or a list of doors and windows (grid_schedule). Figures are in the units argument, else the plan\'s display (how its person reads lengths), else metres.',
  args: {
    plan: PLAN_ARG,
    floor: FLOOR_ARG,
    rooms: { type: 'array', description: 'Only these rooms, by id. Every room when left out. Not with for=estimate.', examples: [['kitchen', 'bath']], items: { id: true }, minItems: 1, maxItems: 200 },
    for: { type: 'string', enum: ['estimate', 'change'], description: 'estimate for the bill of quantities of a first estimate; change for a plan with existing, demolished and new parts, its work as three lists (demolish, make good, new). Each priced from the person\'s rates or as a rate card. The take-off by room when left out.', examples: ['estimate', 'change'] },
    rates: {
      type: 'string',
      maxLength: PATH_MAX,
      description: `The person's rates file, as a path inside the project folder: JSON with a currency and a rate per line key. ${RATES_FILE} beside the plan when left out, if there is one. Only with for=estimate or for=change.`,
      examples: [RATES_FILE, 'costs/rates-2027.json'],
    },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    format: FORMAT_ARG,
    data: DATA_ARG,
  },
  outputSchema: objectSchema({
    walls: listSchema(objectSchema({ kind: STRING, count: NUMBER, gross: NUMBER, net: NUMBER })),
    // CNT-16: the columns by shape and size, on a plan that states any.
    columns: listSchema(objectSchema({ shape: STRING, width: NUMBER, depth: NULLABLE_NUMBER, count: NUMBER, length: NUMBER, volume: NUMBER })),
    // CNT-19: the parking bays per floor and the ramps, on a plan that states any.
    bays: listSchema(objectSchema({ floor: STRING, floorName: STRING, count: NUMBER, numbers: listSchema(STRING), unnumbered: NUMBER })),
    ramps: listSchema(objectSchema({ id: STRING, name: STRING, from: STRING, to: STRING, lower: objectSchema({ floor: STRING, level: NUMBER }), upper: objectSchema({ floor: STRING, level: NUMBER }), width: NUMBER, rise: NUMBER, length: NUMBER, slope: NUMBER, oneIn: NUMBER, statedSlope: NULLABLE_NUMBER })),
    // CNT-15, on a plan that names wall types or finishes: the walls of each named type, and each finish's total.
    wallTypes: listSchema(objectSchema({ type: STRING, name: STRING, kind: NULLABLE_STRING, material: NULLABLE_STRING, glazed: BOOLEAN, count: NUMBER, gross: NUMBER, net: NUMBER, face: NUMBER, gable: NUMBER })),
    finishes: listSchema(objectSchema({ surface: STRING, finish: NULLABLE_STRING, unit: STRING, quantity: NUMBER, rooms: listSchema(STRING) })),
    rooms: listSchema(objectSchema({ id: STRING, name: STRING, floor: STRING, floorArea: NUMBER, ceiling: NUMBER, perimeter: NUMBER, skirting: NUMBER, wallFace: NUMBER, openingsOff: NUMBER, height: NULLABLE_NUMBER, ceilingHeight: NULLABLE_NUMBER, lowered: listSchema(objectSchema({ name: STRING, height: NUMBER, area: NUMBER })) })),
    totals: objectSchema({ floorArea: NUMBER, ceiling: NUMBER, skirting: NUMBER, wallFace: NUMBER }),
    envelope: objectSchema({
      floors: listSchema(objectSchema({
        floor: STRING,
        floorName: STRING,
        outline: NULLABLE_NUMBER,
        slab: { type: ['object', 'null'] },
        roof: { type: ['object', 'null'] },
        state: STRING,
        assumed: listSchema(STRING),
        why: NULLABLE_STRING,
      })),
      slabs: NULLABLE_NUMBER,
      roof: NULLABLE_NUMBER,
      state: STRING,
    }),
    rules: listSchema(STRING),
    // ARE-13, with for=estimate: the lines, and the cost from the person's rates or the rate card.
    label: STRING,
    lines: listSchema(objectSchema({ key: STRING, what: STRING, quantity: NUMBER, unit: STRING, rule: STRING, assumed: BOOLEAN, list: STRING }, ['key', 'what', 'quantity', 'unit', 'rule', 'assumed'])),
    notes: listSchema(STRING),
    rateCard: objectSchema({ label: STRING, currency: STRING, rates: { type: 'object' } }),
    cost: objectSchema({ file: STRING, label: NULLABLE_STRING, currency: STRING, total: NUMBER, complete: BOOLEAN, missing: listSchema(STRING), wrongUnit: { type: 'array' }, unused: listSchema(STRING), wholeBuilding: NULLABLE_NUMBER }),
    orders: { type: 'array' },
    orderProblems: listSchema(STRING),
  }, ['rules']),
  run(args, context) {
    if (args['for'] === 'estimate' || args['for'] === 'change') {
      const change = args['for'] === 'change'
      if (args['rooms'] !== undefined) throw new ToolRefusal(`for=${change ? 'change' : 'estimate'} takes no rooms: its walls, outside face, slab and roof belong to no one room. Pass floor for one floor.`)
      const { project, file, loaded } = readPlan(context, args['plan'])
      const survey = surveyPlan(loaded.plan)
      const floor = floorArg(loaded.plan, args['floor'])
      let rates: Rates | null
      try {
        rates = readRates(project, file, args['rates'] as string | undefined)
      } catch (error) {
        if (error instanceof RatesRefused) throw new ToolRefusal(error.message)
        throw asRefusal(error)
      }
      const floors = floor === undefined ? {} : { floors: [floor] }
      const units = displayFor(args['units'], args['decimal'], loaded.plan)
      const answer = (estimate: Estimate): Answer => estimateAnswer(estimate, rates === null ? null : priceEstimate(estimate, rates), units, args['format'] === 'csv', change)
      // CNT-10: the work of a plan with phases, as three lists, on the same rates. Read only when
      // asked for, so the command's file stays small.
      if (change) return import('../quantities/change').then(({ planChange }) => answer(planChange(loaded.plan, floors)))
      return answer(planEstimate(survey, floors))
    }
    if (args['rates'] !== undefined) throw new ToolRefusal('rates goes with for=estimate or for=change: the take-off by room holds no cost.')
    const { survey, floor } = load(context, args['plan'], args['floor'])
    const rooms = args['rooms'] as string[] | undefined
    for (const id of rooms ?? []) roomArg(survey.plan, id, 'rooms item')
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const t = planTakeoff(survey, floor === undefined ? undefined : [floor], rooms)
    // CNT-15 (C24): the named wall types' walls and the finishes, on a plan that names any.
    const wallTypes = planHasTypes(survey.plan) ? wallTypeRuns(survey, floor === undefined ? undefined : [floor]) : []
    const finishes = rooms === undefined && planHasFinishes(survey.plan) ? planFinishes(survey, floor === undefined ? undefined : [floor]).totals : null
    const data = {
      walls: t.walls,
      ...(t.columns === undefined ? {} : { columns: t.columns }),
      ...(t.bays === undefined ? {} : { bays: t.bays }),
      ...(t.ramps === undefined ? {} : { ramps: t.ramps }),
      ...(wallTypes.length === 0 ? {} : { wallTypes }),
      ...(finishes === null ? {} : { finishes }),
      rooms: t.rooms,
      totals: t.totals,
      envelope: t.envelope,
      rules: [...t.rules, ...(wallTypes.length === 0 ? [] : [WALL_TYPE_RULE]), ...(finishes === null ? [] : [FINISH_RULE])],
    }
    const several = survey.facts.floors.length > 1
    if (args['format'] === 'csv') {
      const rows = [
        ...t.walls.map((w) => ['wall', `${w.kind} walls (${w.count})`, null, null, null, null, w.gross, w.net, null]),
        // CNT-16: the columns, their metres as the length.
        ...(t.columns ?? []).map((c) => ['column', `${c.shape} ${c.depth === null ? c.width : `${c.width} x ${c.depth}`} (${c.count})`, null, null, null, null, c.length, null, null]),
        // CNT-19: the bays per floor, their count in the what; each ramp, its length and its slope in the what.
        ...(t.bays ?? []).map((b) => ['bays', `parking bays, ${b.floorName} (${b.count})`, null, null, null, null, null, null, null]),
        ...(t.ramps ?? []).map((r) => ['ramp', `${r.name}: ${r.lower.floor} to ${r.upper.floor}, ${slopeText(r.slope)} %`, null, null, null, null, r.length, null, null]),
        ...t.rooms.map((r) => ['room', r.name, r.floorArea, r.ceiling, r.skirting, r.wallFace, r.perimeter, null, null]),
        ['total', 'all rooms', t.totals.floorArea, t.totals.ceiling, t.totals.skirting, t.totals.wallFace, null, null, null],
        // LVL-4: worked out from the outlines, never stated by the plan (AC-6).
        ...t.envelope.floors.flatMap((f) => [
          ...(f.slab ? [['slab', `${f.slab.kind === 'base' ? 'lowest floor slab' : 'floor slab'}, ${f.floorName}`, f.slab.area, null, null, null, null, null, 'assumed']] : []),
          ...(f.roof ? [['roof', `roof over ${f.floorName}, where nothing is above`, f.roof.area, null, null, null, null, null, 'assumed']] : []),
        ]),
        ...(t.envelope.roof === null ? [] : [['total', 'roof, all floors', t.envelope.roof, null, null, null, null, null, 'assumed']]),
        // CNT-15: the named wall types (gross and net length, face in the wall face column) and the finishes.
        ...wallTypes.map((w) => ['wall type', `${w.name} (${w.count})`, null, null, null, w.face, w.gross, w.net, null]),
        ...(finishes ?? []).map((f) => ['finish', `${f.surface}: ${f.finish ?? 'not stated'}`, f.surface === 'floor' ? f.quantity : null, f.surface === 'ceiling' ? f.quantity : null, f.surface === 'skirting' ? f.quantity : null, f.surface === 'walls' ? f.quantity : null, null, null, null]),
      ]
      return { text: csv(['row', 'what', 'floor m2', 'ceiling m2', 'skirting m', 'wall face m2', 'length or perimeter m', 'net length m', 'state'], rows), data }
    }
    const envelopeLines = t.envelope.floors.flatMap((f) => {
      const on = several ? ` (${q(f.floorName)})` : ''
      if (f.slab === null && f.roof === null) return [`  ${q(f.floorName)}: no slab or roof: ${f.why ?? 'none'}.`]
      const openings = f.slab === null || f.slab.openings.length === 0 ? '' : `, open over ${f.slab.openings.map((o) => `${o.kind === 'void' ? 'a void' : o.kind === 'lift' ? 'a lift shaft' : o.kind === 'ramp' ? 'a ramp' : 'a stair'} (${areaText(o.area, units)})`).join(', ')}`
      return [
        ...(f.slab ? [`  ${f.slab.kind === 'base' ? 'Lowest floor slab' : 'Floor slab'}${on}: ${areaText(f.slab.area, units)}${openings}; assumed.`] : []),
        ...(f.roof ? [`  Roof over${on || ' the floor'}, where nothing is above: ${areaText(f.roof.area, units)}${f.roof.parapet === null ? '' : `, parapet ${lengthText(f.roof.parapet, units)} high`}${sloped(f.roof, units)}; assumed.`] : []),
      ]
    })
    const assumed = [...new Set(t.envelope.floors.flatMap((f) => f.assumed))]
    const lines = [
      `Walls: ${t.walls.map((w) => `${w.kind} ${lengthText(w.gross, units)} (${w.count} wall${w.count === 1 ? '' : 's'}; ${lengthText(w.net, units)} less openings)`).join('; ')}.`,
      ...(t.columns === undefined ? [] : [columnsLine(t.columns, units)]),
      ...(t.bays === undefined && t.ramps === undefined ? [] : parkingLines(t.bays ?? [], t.ramps ?? [], units, new Map(planFloors(survey.plan).map((f) => [f.id, f.name ?? f.id])))),
      'By room: floor and ceiling, skirting, wall face to plaster.',
      ...t.rooms.map((r) => `  ${q(r.name)}: floor ${areaText(r.floorArea, units)}, ceiling ${areaText(r.ceiling, units)}, skirting ${lengthText(r.skirting, units)}, wall face ${areaText(r.wallFace, units)} (${r.openingsOff.toFixed(2)} m² of openings off, walls ${r.height === null ? 'none' : `${r.height.toFixed(2)} m`} high)${r.void === true ? `; a void: no floor, ceiling or skirting, guard ${lengthText(r.guard ?? 0, units)} along its open edge` : ''}`),
      `Totals: floor ${areaText(t.totals.floorArea, units)}, ceiling ${areaText(t.totals.ceiling, units)}, skirting ${lengthText(t.totals.skirting, units)}, wall face ${areaText(t.totals.wallFace, units)}${t.totals.guard === undefined ? '' : `, guard ${lengthText(t.totals.guard, units)} round voids`}.`,
      'Slabs and roof, worked out from the outlines (assumed: the plan states no slab or roof):',
      ...envelopeLines,
      ...(t.envelope.roof === null ? [] : [`Roof in all: ${areaText(t.envelope.roof, units)}, assumed.`]),
      ...(assumed.length === 0 ? [] : [`Assumed: ${assumed.join('; ')}.`]),
      ...(wallTypes.length === 0
        ? []
        : [`Walls by type: ${wallTypes.map((w) => `${q(w.name)} ${lengthText(w.gross, units)} (${w.count} wall${w.count === 1 ? '' : 's'}; face ${areaText(w.face, units)}${w.gable > 0 ? `, of it ${areaText(w.gable, units)} gable` : ''}${w.material === null ? ', material not stated' : `, ${w.material}`}${w.glazed ? ', glazed' : ''})`).join('; ')}.`]),
      ...(finishes === null ? [] : finishLines(finishes, units)),
      ...Object.values(TAKEOFF_RULES),
      ...(wallTypes.length === 0 ? [] : [WALL_TYPE_RULE]),
      ...(finishes === null ? [] : [FINISH_RULE]),
      ...(t.columns === undefined ? [] : [columnRule()]),
      ...(t.bays === undefined && t.ramps === undefined ? [] : [parkingRule()]),
      'For a first estimate (finishes, reveals, walls by thickness, doors and windows by size, slab, roof) and a cost from the person\'s rates, ask with for=estimate.',
    ]
    return { text: lines.join('\n'), data }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_schedule

/** What grid_schedule's `of` names. */
type ScheduleOf = 'rooms' | 'openings' | 'flats' | 'doors' | 'windows' | 'finishes'

/** ARE-12: the room schedule or the opening schedule, from one set of rows, as text or CSV. */
function listSchedule(survey: Survey, of: ScheduleOf, floor: string | undefined, units: Display, asCsv: boolean): Answer {
  const floors = floor === undefined ? undefined : [floor]
  const several = survey.facts.floors.length > 1
  if (of === 'finishes') {
    // CNT-15 (C24): the finishes room by room, a zone with its own after its room, and each finish's total.
    const s = planFinishes(survey, floors)
    const data = { rows: s.rows, totals: s.totals, rule: s.rule }
    const amount = (surface: FinishSurface, quantity: number): string => (FINISH_UNITS[surface] === 'm' ? lengthText(quantity, units) : areaText(quantity, units))
    if (asCsv) {
      const cells = s.rows.map((r) => [r.id, r.name, r.floor, r.zoneOf, ...FINISH_SURFACES.flatMap((surface) => [r.surfaces[surface].finish, r.surfaces[surface].quantity])])
      return { text: csv(['id', 'name', 'floor', 'zone of', 'floor finish', 'floor m2', 'wall finish', 'wall face m2', 'ceiling finish', 'ceiling m2', 'skirting finish', 'skirting m'], cells), data }
    }
    const floorName = new Map(survey.facts.floors.map((f) => [f.id, f.name] as const))
    const lines = [planHasFinishes(survey.plan) ? 'Finishes by room:' : 'The plan names no finishes: every surface is not stated. Name a room\'s or a zone\'s in its finishes (floor, walls, ceiling, skirting).']
    for (const r of s.rows) {
      const shown = FINISH_SURFACES.filter((surface) => r.zoneOf === null || r.surfaces[surface].finish !== null)
      const parts = shown.map((surface) => `${surface} ${r.surfaces[surface].finish === null ? 'not stated' : q(r.surfaces[surface].finish!)} ${amount(surface, r.surfaces[surface].quantity)}`)
      lines.push(`${r.zoneOf === null ? '' : '  '}${q(r.name)}${r.zoneOf === null ? '' : ` (a zone of ${q(r.zoneOf)})`}${several ? `, ${q(floorName.get(r.floor) ?? r.floor)}` : ''}: ${parts.join(', ')}`)
    }
    lines.push(...finishLines(s.totals, units), s.rule)
    return { text: lines.join('\n'), data }
  }
  if (of === 'doors' || of === 'windows') {
    // ARE-15: the door or window schedule by type (kind and size), each type with its openings' marks.
    const type = of === 'doors' ? 'door' : 'window'
    const s = openingTypeSchedule(survey, type, floors === undefined ? {} : { floors })
    const data = { rows: s.rows, count: s.count, rule: s.rule }
    if (asCsv) return { text: openingTypeScheduleCsv(s), data }
    const size = (w: number, h: number): string => `${lengthText(w, units)} wide × ${lengthText(h, units)} high`
    const lines = [`${type === 'door' ? 'Door' : 'Window'} schedule by type, ${s.count} ${type}${s.count === 1 ? '' : 's'} of ${s.rows.length} type${s.rows.length === 1 ? '' : 's'}:`]
    for (const r of s.rows) {
      const sills = type === 'window' ? `, sill ${r.sills.map((sill) => lengthText(sill, units, 'height')).join(' or ')}` : ''
      const part = r.opens === null ? '' : `, opens ${lengthText(r.opens.width, units)} × ${lengthText(r.opens.height, units)}`
      // CNT-15: a type the plan names is said by its name, with its material.
      const named = r.basis === 'named' ? `${q(r.name!)}, ` : ''
      const material = r.basis === 'named' ? `, ${r.material === null ? 'material not stated' : r.material}${r.glazed === true ? ', glazed' : ''}` : ''
      lines.push(`${r.number}. ${r.count} × ${named}${kindWords(type, r.kind)} ${size(r.width, r.height)}${part}${sills}${material} (type ${r.key}): ${r.marks.join(', ')}`)
    }
    if (s.rows.length === 0) lines.push(`The plan has no ${of}${floor === undefined ? '' : ' on that floor'}.`)
    lines.push(s.rule)
    return { text: lines.join('\n'), data }
  }
  if (of === 'flats') {
    // CNT-4: the plan's flats list, each flat once, then the mix by type (lab EL-1, AR-7).
    const s = flatSchedule(survey, floors === undefined ? {} : { floors })
    const data = { rows: s.rows, mix: s.mix, total: s.total, notInFlats: s.notInFlats, rules: s.rules }
    if (asCsv) return { text: flatScheduleCsv(s), data }
    if ((survey.plan.flats ?? []).length === 0) {
      return { text: ['The plan lists no flats, so there is no flat schedule or mix. List them in the plan\'s "flats", each with its rooms by id, or place a flat type in rooms text (unit <name> flat "<type name>").', ...s.rules].join('\n'), data }
    }
    const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`
    const lines = s.rows.map((r) => `${r.number}. ${q(r.name)}${r.typeName === null ? '' : ` (${r.typeName}${r.mirrored ? ', mirrored' : ''})`}, ${r.floors.map(q).join(' and ') || 'no floor given'}: ${count(r.rooms, 'room')}, ${count(r.bedrooms, 'bedroom')}, ${areaText(r.area, units)}${r.state === 'proven' ? '' : ', not proven'}`)
    if (s.rows.length === 0) lines.push('No flat has a room on the floors given.')
    lines.push(`All flats: ${count(s.total.flats, 'flat')}, ${areaText(s.total.area, units)}${stateText(s.total.state, several)}. In no flat: ${areaText(s.notInFlats, units)}.`)
    lines.push('Mix by type:')
    for (const m of s.mix) lines.push(`  ${q(m.name)}: ${count(m.flats, 'flat')}${m.mirrored === 0 ? '' : ` (${m.mirrored} mirrored)`}${m.bedrooms === null ? '' : `, ${count(m.bedrooms, 'bedroom')} each`}, ${percent(m.share)} of the flats, ${areaText(m.area, units)}${m.each === null ? '' : `, ${areaText(m.each, units)} each on average`}`)
    lines.push(...s.rules)
    return { text: lines.join('\n'), data }
  }
  if (of === 'rooms') {
    const s = roomSchedule(survey, floors === undefined ? {} : { floors })
    const data = { rows: s.rows, floors: s.floors, total: s.total, rules: s.rules }
    if (asCsv) return { text: roomScheduleCsv(s), data }
    // CNT-9: a stated room number wins over Grid's, and the room's own facts follow its figures.
    const own = (properties: Readonly<Record<string, string | number | boolean>>): string => (Object.keys(properties).length === 0 ? '' : `; ${factsText(properties)}`)
    // CNT-4: on a plan that lists flats, the flat each room is in.
    const flatNames = new Map((survey.plan.flats ?? []).map((f) => [f.id, f.name ?? f.id] as const))
    const inFlat = (flat: string | null | undefined): string => (flat === undefined ? '' : flat === null ? ', in no flat' : `, flat ${q(flatNames.get(flat) ?? flat)}`)
    // CNT-27: a row in no total says why, so the rows that count add up to the totals.
    const floorNames = new Map(survey.facts.floors.map((f) => [f.id, f.name ?? f.id] as const))
    const rowNames = new Map(s.rows.map((r) => [`${r.floor}\u0000${r.id}`, r.name] as const))
    const left = (r: (typeof s.rows)[number]): string => {
      const c = r.notCounted
      if (c === undefined) return ''
      if (c.with !== undefined) return `; in no total: counted once with ${q(rowNames.get(`${c.with.floor}\u0000${c.with.room}`) ?? c.with.room)} on ${q(floorNames.get(c.with.floor) ?? c.with.floor)}`
      return `; in no total: ${NOT_COUNTED_WORDS[c.why][0]}`
    }
    const roomsWord = (n: number): string => `${n} room${n === 1 ? '' : 's'}`
    const lines = s.rows.map((r) => `${r.roomNumber === null ? r.number : q(shownNumber(r))}. ${q(roomCalled(r))}${r.use ? ` (${r.use})` : ''}, ${q(r.floorName)}: ${r.area === null ? 'not measured: it could not be drawn' : areaText(r.area, units)}, ${r.height === null ? 'height not known' : `${lengthText(r.height, units)} high`}${r.state === 'not-proven' ? ', not proven' : ''}${inFlat(r.flat)}${own(r.properties)}${left(r)}`)
    for (const t of s.floors) lines.push(`${q(t.floorName!)}: ${roomsWord(t.rooms)}, ${areaText(t.area, units)}${stateText(t.state, several)}.`)
    lines.push(`All floors: ${roomsWord(s.total.rooms)}, ${areaText(s.total.area, units)}${stateText(s.total.state, several)}.`, ...s.rules)
    return { text: lines.join('\n'), data }
  }
  const s = openingSchedule(survey, floors === undefined ? {} : { floors })
  const data = { rows: s.rows, counts: s.counts, rule: s.rule }
  if (asCsv) return { text: openingScheduleCsv(s), data }
  // CNT-14: its kind, the part that opens and its handing, where the plan states them.
  const kindOf = (r: (typeof s.rows)[number]): string => (r.type === 'opening' ? r.type : kindWords(r.type, r.kind))
  const partOf = (r: (typeof s.rows)[number]): string =>
    `${r.opens === null ? '' : `, opens ${lengthText(r.opens.width, units)} × ${lengthText(r.opens.height, units)}`}${r.handing === null ? '' : `, ${r.handing}`}`
  // ARE-15: each opening's mark, as the drawing shows it (grid_view marks schedule).
  const lines = s.rows.map((r) => `${r.number}. ${r.mark} ${kindOf(r)} ${q(r.id)}, ${q(r.floorName)}: ${lengthText(r.width, units)} wide × ${lengthText(r.height, units)} high${r.type === 'window' ? `, sill ${lengthText(r.sill, units, 'height')}` : ''}${partOf(r)}, ${r.between[0]} ↔ ${r.between[1]}${Object.keys(r.properties).length === 0 ? '' : `; ${factsText(r.properties)}`}`)
  if (lines.length === 0) lines.push('The plan has no openings.')
  lines.push(`In all, each counted once: ${s.counts.door} doors, ${s.counts.window} windows, ${s.counts.opening} doorless openings.`, s.rule)
  return { text: lines.join('\n'), data }
}

/**
 * CMD-17: what grid_schedule answers, one schema for each `of` and one for the grouped default,
 * because the rows of each are a different thing (a room, an opening, a flat, a type, a room's
 * finishes). A host that checks the answer against one schema for all of them refuses most.
 */
const FACTS_OUTPUT = { type: 'object' } as const
const STATE_OUTPUT = { type: ['string', 'object'] } as const
const roomTotal = objectSchema({ floor: NULLABLE_STRING, floorName: NULLABLE_STRING, rooms: NUMBER, area: NUMBER, state: STATE_OUTPUT }, ['floor', 'floorName', 'rooms', 'area'])
const typeItem = objectSchema({ mark: STRING, id: STRING, floor: STRING, floorName: STRING, sill: NUMBER, handing: NULLABLE_STRING, between: listSchema(STRING) })
const SCHEDULE_OUTPUT: Record<string, unknown> = {
  type: 'object',
  // The one key every variant has, for a host that reads the root's properties.
  properties: { rows: { type: 'array' } },
  required: ['rows'],
  anyOf: [
    // No `of`: the openings grouped by kind and size, and the fixtures.
    objectSchema({
      rows: listSchema(objectSchema({ type: STRING, kind: NULLABLE_STRING, width: NUMBER, height: NUMBER, sill: NUMBER, count: NUMBER, items: { type: 'array' } }, ['type', 'width', 'height', 'sill', 'count', 'items'])),
      counts: objectSchema({ door: NUMBER, window: NUMBER, opening: NUMBER }),
      rule: STRING,
      // CNT-12: the fixtures by kind, with the room each stands in.
      fixtures: listSchema(objectSchema({ id: STRING, kind: STRING, label: STRING, floor: STRING, room: NULLABLE_STRING, size: { type: 'array' }, height: NUMBER })),
      fixtureCounts: { type: 'object' },
    }, ['rows', 'counts', 'rule']),
    // of=rooms (ARE-12): the room schedule and its totals.
    objectSchema({
      rows: listSchema(objectSchema({ number: NUMBER, roomNumber: NULLABLE_STRING, mark: STRING, id: STRING, name: STRING, use: NULLABLE_STRING, floor: STRING, floorName: STRING, area: NULLABLE_NUMBER, state: STATE_OUTPUT, height: NULLABLE_NUMBER, properties: FACTS_OUTPUT, flat: NULLABLE_STRING, zones: { type: 'array' }, notCounted: { type: 'object' } }, ['number', 'roomNumber', 'mark', 'id', 'name', 'use', 'floor', 'floorName', 'area', 'height', 'properties'])),
      floors: listSchema(roomTotal),
      total: roomTotal,
      rules: listSchema(STRING),
    }, ['rows', 'floors', 'total', 'rules']),
    // of=openings (ARE-12): one row for each door, window and doorless opening.
    objectSchema({
      rows: listSchema(objectSchema({ number: NUMBER, mark: STRING, typeKey: NULLABLE_STRING, id: STRING, type: STRING, floor: STRING, floorName: STRING, width: NUMBER, height: NUMBER, sill: NUMBER, kind: NULLABLE_STRING, opens: { type: ['object', 'null'] }, handing: NULLABLE_STRING, handingSaid: { type: ['object', 'null'] }, between: listSchema(STRING), properties: FACTS_OUTPUT }, ['number', 'mark', 'id', 'type', 'floor', 'floorName', 'width', 'height', 'sill', 'between', 'properties'])),
      counts: objectSchema({ door: NUMBER, window: NUMBER, opening: NUMBER }),
      rule: STRING,
    }, ['rows', 'counts', 'rule']),
    // of=doors and of=windows (ARE-15): the types, each with the marks of its openings.
    objectSchema({
      rows: listSchema(objectSchema({ number: NUMBER, basis: STRING, key: STRING, typeId: NULLABLE_STRING, name: NULLABLE_STRING, material: NULLABLE_STRING, glazed: { type: ['boolean', 'null'] }, type: STRING, kind: NULLABLE_STRING, width: NUMBER, height: NUMBER, opens: { type: ['object', 'null'] }, sills: listSchema(NUMBER), count: NUMBER, marks: listSchema(STRING), items: listSchema(typeItem) }, ['number', 'basis', 'key', 'type', 'width', 'height', 'sills', 'count', 'marks', 'items'])),
      count: NUMBER,
      rule: STRING,
    }, ['rows', 'count', 'rule']),
    // of=flats (CNT-4): the flats and the mix by type.
    objectSchema({
      rows: listSchema(objectSchema({ number: NUMBER, id: STRING, name: STRING, type: NULLABLE_STRING, typeName: NULLABLE_STRING, mirrored: BOOLEAN, floors: listSchema(STRING), rooms: NUMBER, bedrooms: NUMBER, area: NUMBER, state: STATE_OUTPUT }, ['number', 'id', 'name', 'type', 'typeName', 'mirrored', 'floors', 'rooms', 'bedrooms', 'area'])),
      mix: listSchema(objectSchema({ type: NULLABLE_STRING, name: STRING, flats: NUMBER, mirrored: NUMBER, bedrooms: NULLABLE_NUMBER, share: NUMBER, area: NUMBER, each: NULLABLE_NUMBER })),
      total: objectSchema({ flats: NUMBER, area: NUMBER, state: STATE_OUTPUT }, ['flats', 'area']),
      notInFlats: NUMBER,
      rules: listSchema(STRING),
    }, ['rows', 'mix', 'total', 'notInFlats', 'rules']),
    // of=finishes (CNT-15): each room's and zone's finishes by surface, and each finish's total.
    objectSchema({
      rows: listSchema(objectSchema({ id: STRING, name: STRING, floor: STRING, zoneOf: NULLABLE_STRING, surfaces: { type: 'object' } }, ['id', 'name', 'floor', 'zoneOf', 'surfaces'])),
      totals: listSchema(objectSchema({ surface: STRING, finish: NULLABLE_STRING, unit: STRING, quantity: NUMBER, rooms: listSchema(STRING) })),
      rule: STRING,
    }, ['rows', 'totals', 'rule']),
  ],
}

const scheduleTool: GridTool = {
  name: 'grid_schedule',
  title: 'Door and window schedule',
  hint: 'read',
  description:
    'Use this when the person asks for the doors and windows by size, how many of each, a door schedule or window schedule, which doors are narrower than a width, how many toilets, basins, showers, baths or kitchen runs there are and where, or for the flats, the area of each flat or the unit mix. '
    + 'It groups every door, window and doorless opening by type, kind (sliding, double, fixed… when the plan states one) and size, each listed once with the two rooms it joins. Sizes are the hole in the wall: the plan holds no frame, so a clear width is not known. '
    + 'With of=rooms it gives the room schedule instead: every room numbered in one order whatever the file\'s order, with its name, use, net area, height, floor and, on a plan that lists flats, its flat, and the totals for each floor and for all floors, a room in no total (a stair or lift over the lowest room of its shaft, a void, outdoor space) marked with why; with of=openings, every door, window and doorless opening once, numbered, with its size, its kind, the part that opens and its handing where the plan states them, and the rooms on its two sides; with of=flats, every flat the plan lists with its type, rooms, bedrooms and net area, and the unit mix by type (how many of each, how many mirrored, their bedrooms and area); with of=doors or of=windows, the door or window schedule a supplier needs: the doors, or the windows, grouped into types (the plan\'s own named types first, with their names and materials, then by kind and size and the part that opens), each type with its count and the marks of its openings; with of=finishes, the finishes plan: each room\'s floor, wall, ceiling and skirting finish with its quantity, a zone with its own finish as its part of its room, and each finish\'s total. Every room and opening has a mark (the room\'s number; D1, W1, O1 for openings) that grid_view kind=plan with marks schedule draws on the plan, one mark for each row. All as text or CSV. '
    + 'Do not use for wall or plaster quantities (grid_takeoff). Figures are in the units argument, else the plan\'s display (how its person reads lengths), else metres.',
  args: {
    plan: PLAN_ARG,
    floor: FLOOR_ARG,
    of: { type: 'string', enum: ['rooms', 'openings', 'flats', 'doors', 'windows', 'finishes', 'fixtures'], description: 'fixtures for every fixture and piece of furniture with its kind, room and size (as types=fixture), rooms for the room schedule, openings for one row per door, window and opening, flats for the flats and the unit mix by type, doors or windows for the door or window schedule by type with each type\'s marks, finishes for each room\'s floor, wall, ceiling and skirting finishes with their quantities and each finish\'s total. Grouped by type and size when left out.', examples: ['rooms', 'openings', 'flats', 'doors', 'finishes'] },
    types: { type: 'array', description: 'Only these kinds: door, window, opening, or fixture for the toilets, basins, showers, baths and kitchen runs. All of them when left out.', examples: [['door'], ['door', 'opening'], ['fixture']], items: { enum: ['door', 'window', 'opening', 'fixture'] }, minItems: 1, maxItems: 4 },
    narrower_than: { type: 'number', length: true, description: 'Only openings narrower than this many metres, for example 0.8.', examples: [0.8, 0.9], minimum: 0.1, maximum: 10 },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    format: FORMAT_ARG,
    data: DATA_ARG,
  },
  outputSchema: SCHEDULE_OUTPUT,
  run(args, context) {
    const { survey, floor } = load(context, args['plan'], args['floor'])
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const of = args['of'] as ScheduleOf | 'fixtures' | undefined
    if (of !== undefined) {
      const stray = ['types', 'narrower_than'].filter((name) => args[name] !== undefined)
      if (stray.length > 0) throw new ToolRefusal(`of=${of} takes no ${stray.join(' or ')}.`)
      if (of !== 'fixtures') return listSchedule(survey, of, floor, units, args['format'] === 'csv')
    }
    // CNT-45: of=fixtures is the fixtures and furniture alone.
    const types = of === 'fixtures' ? ['fixture' as const] : (args['types'] as ('door' | 'window' | 'opening' | 'fixture')[] | undefined)
    const openingTypes = types?.filter((t): t is 'door' | 'window' | 'opening' => t !== 'fixture')
    const s = planSchedule(survey, {
      ...(floor === undefined ? {} : { floors: [floor] }),
      ...(openingTypes === undefined ? {} : { types: openingTypes }),
      ...(args['narrower_than'] === undefined ? {} : { narrowerThan: args['narrower_than'] as number }),
    })
    // CNT-12: the fixtures by kind, with the room each stands in. A width says nothing of them.
    const withFixtures = (types === undefined || types.includes('fixture')) && args['narrower_than'] === undefined
    const f = withFixtures ? planFixtures(survey.plan, floor === undefined ? undefined : [floor]) : null
    const name = (id: string): string => (survey.facts.rooms.has(id) ? q(roomCalled(survey.facts.rooms.get(id)!)) : id)
    const fixtureData = f === null || f.rows.length === 0 ? {} : { fixtures: f.rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, floor: r.floor, room: r.room, size: r.size, height: r.height })), fixtureCounts: f.counts }
    const data = { rows: s.rows, counts: s.counts, rule: s.rule, ...fixtureData }
    if (args['format'] === 'csv') {
      // CNT-14: a kind column only when some opening states its kind, so a plan with none is as before.
      const kinds = s.rows.some((row) => row.kind !== null)
      const rows = s.rows.flatMap((row) => row.items.map((item) => [row.type, ...(kinds ? [row.kind ?? ''] : []), item.id, row.width, row.height, row.sill, item.floor, name(item.between[0]).replace(/"/g, ''), name(item.between[1]).replace(/"/g, '')]))
      for (const r of f?.rows ?? []) rows.push([r.kind, ...(kinds ? [''] : []), r.id, r.size[0], r.height, '', r.floor, r.room === null ? 'no room' : name(r.room).replace(/"/g, ''), ''])
      return { text: csv(['type', ...(kinds ? ['kind'] : []), 'id', 'width m', 'height m', 'sill m', 'floor', 'side 1', 'side 2'], rows), data }
    }
    const lines = types?.length === 1 && types[0] === 'fixture' ? [] : s.rows.map((row) => `${row.count} × ${row.type === 'opening' ? row.type : kindWords(row.type, row.kind)} ${lengthText(row.width, units)} wide × ${lengthText(row.height, units)} high${row.type === 'window' ? `, sill ${lengthText(row.sill, units, 'height')}` : ''}: ${row.items.map((item) => `${q(item.id)} (${name(item.between[0])} ↔ ${name(item.between[1])})`).join(', ')}`)
    const onlyFixtures = types !== undefined && types.every((t) => t === 'fixture')
    if (lines.length === 0 && !onlyFixtures) lines.push(args['narrower_than'] !== undefined ? `Nothing of that kind is narrower than ${m(args['narrower_than'] as number)} m.` : 'The plan has no openings of that kind.')
    if (!onlyFixtures) lines.push(`In all: ${s.counts.door} doors, ${s.counts.window} windows, ${s.counts.opening} doorless openings.`, s.rule)
    if (f !== null && (f.rows.length > 0 || onlyFixtures)) {
      lines.push(`Fixtures: ${fixtureCountText(f.counts)}.`)
      for (const r of f.rows) {
        lines.push(`  ${r.label} ${q(r.id)} (${r.kind}), ${r.room === null ? 'in no room' : `in ${name(r.room)}`}: ${lengthText(r.size[0], units)} wide × ${lengthText(r.size[1], units)} deep × ${lengthText(r.height, units)} high`)
      }
      if (f.leftOut.length > 0) lines.push(`Left out, as grid_check says: ${f.leftOut.map(q).join(', ')}.`)
      lines.push(FIXTURE_RULES.count)
    }
    return { text: lines.join('\n'), data }
  },
}

// ---------------------------------------------------------------------------------------------
// CNT-9: grid_fields, grid_find and grid_count, asking across the parts by any field

/** A question's own refusal, as a tool's. */
function asked<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof QueryRefused) throw new ToolRefusal(error.message)
    throw error
  }
}

/** WRT-74: grid_set_facts picks parts by the same arguments, of the kinds that carry facts. */
export const KIND_ARG: ArgSpec = {
  type: 'array',
  description: 'Only these kinds of part: wall, door, window, opening (doorless), room, floor. Every kind when left out.',
  examples: [['door'], ['room'], ['door', 'window']],
  items: { enum: FACT_PART_KINDS },
  minItems: 1,
  maxItems: FACT_PART_KINDS.length,
}

/** CNT-45: grid_fields, grid_find and grid_count ask of the fixtures and furniture too. */
const QUERY_KIND_ARG: ArgSpec = {
  ...KIND_ARG,
  description: 'Only these kinds of part: wall, door, window, opening (doorless), room, floor, fixture (a toilet, a bath, a kitchen run) or furniture (a bed, a sofa, a table). Every kind when left out.',
  examples: [['door'], ['room'], ['fixture', 'furniture']],
  items: { enum: PART_KINDS },
  maxItems: PART_KINDS.length,
}

export const WHERE_ARG: ArgSpec = {
  type: 'array',
  description: 'Conditions every part must meet, one each: a field or fact, then a test. Tests: "is missing", "is set", = and != (text in any capitals, yes or no), <, <=, > and >= (numbers; a length may give its unit, as 900 mm), and "contains". A part with no value meets only "is missing". Every part when left out.',
  examples: [['fire rating is missing'], ['department = Sales', 'area >= 20'], ['width < 900 mm']],
  items: { maxLength: 200 },
  minItems: 1,
  maxItems: 20,
}

export const ROOM_IN_ARG: ArgSpec = {
  type: 'string',
  id: true,
  description: 'Only what belongs to this room, by id: the room itself, the walls beside it and the doors, windows and openings into it.',
  examples: ['kitchen', 'office-2'],
}

/** The kinds a call asked for, or every kind. */
const kindsOf = (args: Record<string, unknown>): readonly PartKind[] | undefined => args['kind'] as PartKind[] | undefined

function partsWord(kinds: readonly PartKind[] | undefined, n: number): string {
  const plural: Record<PartKind, string> = { wall: 'walls', door: 'doors', window: 'windows', opening: 'doorless openings', room: 'rooms', floor: 'floors', fixture: 'fixtures', furniture: 'pieces of furniture' }
  const one: Record<PartKind, string> = { wall: 'wall', door: 'door', window: 'window', opening: 'doorless opening', room: 'room', floor: 'floor', fixture: 'fixture', furniture: 'piece of furniture' }
  if (kinds !== undefined && kinds.length === 1) return `${n} ${n === 1 ? one[kinds[0]!] : plural[kinds[0]!]}`
  return `${n} part${n === 1 ? '' : 's'}`
}

/** A value in an answer's words: text quoted, a measure with its unit. */
function valueText(field: Field, value: Value): string {
  if (value === null || (Array.isArray(value) && value.length === 0)) return 'not stated'
  if (typeof value === 'string') return q(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value !== 'number') return (value as readonly string[]).map(q).join(', ')
  const unit = unitOf(field)
  return unit === 'm' ? `${value.toFixed(3)} m` : unit === 'm²' ? `${value.toFixed(2)} m²` : String(shown(value))
}

/** What grid_view takes to show these parts, picked out, on the floor that holds most of them. */
function viewOf(asked: Asked, ids: readonly string[], extra: Record<string, unknown> = {}): { view: Record<string, unknown>; floors: string[] } {
  const floorOf = new Map(asked.parts.map((p) => [p.id, p.floor] as const))
  const count = new Map<string, number>()
  for (const id of ids) count.set(floorOf.get(id) ?? 'ground', (count.get(floorOf.get(id) ?? 'ground') ?? 0) + 1)
  const floors = [...count.keys()]
  const most = floors.sort((a, b) => count.get(b)! - count.get(a)!)[0]
  return { view: { kind: 'plan', ...(most === undefined ? {} : { floor: most }), ...extra }, floors: [...count.keys()] }
}

/** WRT-74: how a fact is set, so the agent finds the tool from the question it asks first. */
const SET_FACTS_LINE = 'Set facts and a room\'s number with grid_set_facts (set, unset, number), on parts by id or picked as grid_find picks them; or on a room\'s line in rooms text: number "2.03", dept "ED", facts department=Sales capacity=4.'

const fieldsTool: GridTool = {
  name: 'grid_fields',
  title: 'What can be asked of the plan',
  hint: 'read',
  description:
    'Use this when you are about to find, count or sum parts of the plan and need the names to ask by: which fields Grid works out for each kind of part (area, width, height, the rooms beside a wall), with their units, and which facts of the person\'s own the parts carry (a fire rating, a department, a head count), with how many parts carry each and their values. '
    + 'Call it once before grid_find or grid_count on a plan you have not asked of yet. To record a fact or a room number the person gives, use grid_set_facts. Do not use for the answer itself (grid_find, grid_count), for areas (grid_areas) or for a door schedule (grid_schedule). Units are metres and square metres.',
  args: {
    plan: PLAN_ARG,
    kind: QUERY_KIND_ARG,
  },
  outputSchema: objectSchema({
    kinds: listSchema(objectSchema({ kind: STRING, count: NUMBER })),
    fields: listSchema(objectSchema({ name: STRING, type: STRING, unit: { type: ['string', 'null'] }, kinds: listSchema(STRING), from: STRING, about: STRING })),
    facts: listSchema(objectSchema({ name: STRING, type: STRING, unit: { type: ['string', 'null'] }, kinds: listSchema(STRING), from: STRING, count: NUMBER, values: listSchema(STRING), shadowed: { type: 'boolean' } }, ['name', 'type', 'kinds', 'count', 'values'])),
    rule: STRING,
    setBy: STRING,
  }),
  run(args, context) {
    const { survey } = load(context, args['plan'])
    const ask = askPlan(survey, { items: true })
    const kinds = kindsOf(args)
    const counts = PART_KINDS.filter((k) => kinds === undefined || kinds.includes(k)).map((kind) => ({ kind, count: ask.parts.filter((p) => p.kind === kind).length }))
    const fields = GRID_FIELDS.filter((f) => kinds === undefined || f.kinds.some((k) => kinds.includes(k)))
    const facts = factInfos(ask, kinds)
    const lines = [
      `Parts: ${counts.map((c) => `${c.count} ${c.kind}${c.count === 1 ? '' : 's'}`).join(', ')}.`,
      `Fields Grid states or works out: ${fields.map((f) => `${f.name}${f.unit === null ? '' : ` (${f.unit})`} for ${f.kinds.length === PART_KINDS.length ? 'every part' : f.kinds.join(', ')}`).join('; ')}.`,
      facts.length === 0
        ? 'No part carries a fact of the person\'s own.'
        : `Facts of the person's own: ${facts.map((f) => `${q(f.name)} (${f.type}, on ${f.count} ${f.kinds.join(' and ')} part${f.count === 1 ? '' : 's'}${f.values.length > 0 ? `; ${f.values.map(q).join(', ')}` : ''}${f.shadowed ? `; ask it as ${q(`properties.${f.name}`)}` : ''})`).join('; ')}.`,
      'Ask with grid_find (which parts, with only the fields you name) or grid_count (how many, and sums, by a field), naming fields and facts as listed here.',
      SET_FACTS_LINE,
      QUERY_RULE,
    ]
    return { text: lines.join('\n'), data: { kinds: counts, fields, facts, rule: QUERY_RULE, setBy: SET_FACTS_LINE } }
  },
}

const findTool: GridTool = {
  name: 'grid_find',
  title: 'Find parts by their fields and facts',
  hint: 'read',
  description:
    'Use this when the person asks which parts of the plan have, lack or match something: "which doors have no fire rating", "rooms of the Sales department", "windows lower than 900 mm", "walls rated EI 60 on the first floor". '
    + 'It returns the ids of the walls, doors, windows, openings, rooms, floors, fixtures or furniture (kind=fixture, kind=furniture: "the beds in the plan", "every WC on the first floor") that meet every condition, with only the fields you name, and a view argument to pass to grid_view so they are shown picked out. Facts of the person\'s own are as the plan gives them: Grid checks nothing against them. '
    + 'Call grid_fields first for the names. Do not use for how many or how much by group (grid_count), for areas (grid_areas) or for a door schedule (grid_schedule). Lengths are metres, areas square metres.',
  args: {
    plan: PLAN_ARG,
    kind: QUERY_KIND_ARG,
    floor: FLOOR_ARG,
    room: ROOM_IN_ARG,
    where: WHERE_ARG,
    fields: { type: 'array', description: 'The fields and facts to give for each part found, by name, as grid_fields lists them. Only the ids when left out.', examples: [['fire rating'], ['name', 'area', 'department']], items: { maxLength: 120 }, minItems: 1, maxItems: 30 },
    limit: { type: 'number', description: 'The most parts to list; count still counts them all. 500 when left out.', examples: [100, 500], minimum: 1, maximum: 5000 },
  },
  outputSchema: objectSchema({
    count: NUMBER,
    ids: listSchema(STRING),
    rows: listSchema({ type: 'object' }),
    fields: listSchema(STRING),
    more: NUMBER,
    floors: listSchema(STRING),
    view: { type: 'object' },
    rule: STRING,
  }),
  run(args, context) {
    const { survey } = load(context, args['plan'], args['floor'])
    if (args['room'] !== undefined) roomArg(survey.plan, args['room'])
    return asked(() => {
      const ask = askPlan(survey, { items: true })
      const kinds = kindsOf(args)
      const fields = ((args['fields'] as string[] | undefined) ?? []).map((name, i) => fieldOf(ask, name, `fields item ${i + 1}`))
      const found = select(ask, {
        ...(kinds === undefined ? {} : { kinds }),
        ...(args['floor'] === undefined ? {} : { floor: args['floor'] as string }),
        ...(args['room'] === undefined ? {} : { room: args['room'] as string }),
        ...(args['where'] === undefined ? {} : { where: args['where'] as string[] }),
      })
      const limit = Math.floor((args['limit'] as number | undefined) ?? 500)
      const listed = found.slice(0, limit)
      const rows = listed.map((part) => ({ id: part.id, ...Object.fromEntries(fields.map((field) => [fieldName(field), shown(ask.value(part, field))])) }))
      const ids = listed.map((p) => p.id)
      const { view, floors } = viewOf(ask, ids, { highlight: ids.slice(0, 2000) })
      const shownLines = listed.slice(0, 30).map((part) => `  ${part.kind} ${q(part.id)}${fields.length === 0 ? '' : `: ${fields.map((field) => `${q(fieldName(field))} ${valueText(field, ask.value(part, field))}`).join(', ')}`}`)
      const lines = [
        found.length === 0 ? `No part meets ${args['where'] === undefined ? 'the question' : 'every condition'}.` : `Found ${partsWord(kinds, found.length)}${found.length > limit ? `, the first ${limit} listed` : ''}:`,
        ...shownLines,
        ...(listed.length > 30 ? [`  … and ${listed.length - 30} more in the data.`] : []),
        ...(found.length === 0 ? [] : [`To see them picked out, pass view to grid_view${floors.length > 1 ? `: they are on ${floors.length} floors, so draw each floor in turn` : ''}.`]),
        QUERY_RULE,
      ]
      return { text: lines.join('\n'), data: { count: found.length, ids, rows, fields: fields.map(fieldName), more: Math.max(0, found.length - limit), floors, view, rule: QUERY_RULE } }
    })
  },
}

const countTool: GridTool = {
  name: 'grid_count',
  title: 'Count and sum parts by group',
  hint: 'read',
  description:
    'Use this when the person asks how many or how much, grouped by a field or a fact of their own: "area per department", "how many doors of each fire rating", "head count by floor", "total window width on each floor", "how many beds in each room" (kind=furniture, by item kind or room). '
    + 'It groups the parts that meet every condition by the field named in by, and gives each group its count, the sum of each field named in sum, and its ids, with a view argument to pass to grid_view so each group is shown in its own colour. Facts of the person\'s own are as the plan gives them: Grid checks nothing against them. '
    + 'Rooms are counted as grid_areas counts them, so an area sum is its net: a zone with its room, a stair or lift drawn on floor after floor once, on the floor it rises from (stairs=per floor counts it on each floor), and no void or outdoor space; the answer lists each room left out, with why. '
    + 'Call grid_fields first for the names. Do not use for the list of parts itself (grid_find), for the plan\'s areas by use (grid_areas) or for a door schedule (grid_schedule). Areas are square metres, lengths metres.',
  args: {
    plan: PLAN_ARG,
    kind: QUERY_KIND_ARG,
    floor: FLOOR_ARG,
    room: ROOM_IN_ARG,
    where: WHERE_ARG,
    by: { type: 'string', maxLength: 120, description: 'The field or fact to group by, by name, as grid_fields lists it: one group per value, and one for the parts that state none. One group of all of them when left out.', examples: ['department', 'fire rating', 'floor'] },
    sum: { type: 'array', description: 'Fields or facts of numbers to add up in each group, by name: area, width, head count.', examples: [['area'], ['area', 'head count']], items: { maxLength: 120 }, minItems: 1, maxItems: 10 },
    stairs: { type: 'string', enum: ['once', 'per floor'], description: 'once counts a stair or lift drawn as a room on floor after floor once, on the floor it rises from, as grid_areas does; per floor counts its room on every floor, with its area. once when left out.', examples: ['once', 'per floor'] },
  },
  outputSchema: objectSchema({
    by: { type: ['string', 'null'] },
    groups: listSchema(objectSchema({ value: {}, count: NUMBER, sums: { type: 'object' }, missing: { type: 'object' }, ids: listSchema(STRING) })),
    total: objectSchema({ count: NUMBER, sums: { type: 'object' }, missing: { type: 'object' } }),
    notCounted: listSchema(objectSchema({ id: STRING, floor: STRING, why: STRING, with: objectSchema({ floor: STRING, room: STRING }) }, ['id', 'floor', 'why'])),
    stairs: STRING,
    units: { type: 'object' },
    view: { type: 'object' },
    rule: STRING,
  }),
  run(args, context) {
    const { survey } = load(context, args['plan'], args['floor'])
    if (args['room'] !== undefined) roomArg(survey.plan, args['room'])
    return asked(() => {
      const ask = askPlan(survey, { items: true })
      const kinds = kindsOf(args)
      const by = args['by'] === undefined ? null : fieldOf(ask, args['by'] as string, 'by')
      const sums = ((args['sum'] as string[] | undefined) ?? []).map((name, i) => fieldOf(ask, name, `sum item ${i + 1}`))
      checkSums(ask, sums)
      const picked = select(ask, {
        ...(kinds === undefined ? {} : { kinds }),
        ...(args['floor'] === undefined ? {} : { floor: args['floor'] as string }),
        ...(args['room'] === undefined ? {} : { room: args['room'] as string }),
        ...(args['where'] === undefined ? {} : { where: args['where'] as string[] }),
      })
      // CNT-8: a zone's floor and facts are its room's to count, so a zone is counted in no group.
      // CNT-27: nor is any room grid_areas' net counts in no figure: a stair or lift room over the
      // lowest of its shaft (unless stairs=per floor), a void, outdoor space.
      const perFloor = args['stairs'] === 'per floor'
      const leftOut = (part: Part): RoomNotCounted | null => {
        if (part.zoneOf !== undefined) return { why: 'zone' }
        const c = ask.counting(part)
        return c === null || (perFloor && c.why === 'shaft') ? null : c
      }
      const found = picked.filter((part) => leftOut(part) === null)
      const zones = picked.filter((part) => part.zoneOf !== undefined)
      const notCountedParts = picked.flatMap((part) => {
        const c = leftOut(part)
        return c === null ? [] : [{ id: part.id, floor: part.floor, ...c }]
      })
      const others = notCountedParts.filter((p) => p.why !== 'zone')
      const shafts = perFloor ? found.filter((part) => ask.counting(part)?.why === 'shaft') : []
      const groups = groupParts(ask, found, by, sums)
      const [total] = groupParts(ask, found, null, sums)
      const units = Object.fromEntries(sums.map((field) => [fieldName(field), unitOf(field)]))
      const sumText = (group: { sums: Readonly<Record<string, number>>; missing: Readonly<Record<string, number>> }): string =>
        sums.map((field) => {
          const name = fieldName(field)
          const missing = group.missing[name] ?? 0
          return `${q(name)} ${valueText(field, group.sums[name] ?? 0)}${missing > 0 ? ` (${missing} with none)` : ''}`
        }).join(', ')
      const lines = by === null
        ? []
        : [`By ${q(fieldName(by))}:`, ...groups.slice(0, 40).map((g) => `  ${g.value === null ? 'not stated' : valueText(by, g.value)}: ${partsWord(kinds, g.count)}${sums.length === 0 ? '' : `, ${sumText(g)}`}`), ...(groups.length > 40 ? [`  … and ${groups.length - 40} more groups in the data.`] : [])]
      lines.push(`In all: ${partsWord(kinds, found.length)}${sums.length === 0 || total === undefined ? '' : `, ${sumText(total)}`}.`)
      if (zones.length > 0) lines.push(`Not counted: ${zones.length === 1 ? 'a zone' : `${zones.length} zones`} of a room, counted with the room: ${zones.slice(0, 20).map((p) => q(p.id)).join(', ')}${zones.length > 20 ? ', …' : ''}. grid_find lists ${zones.length === 1 ? 'it' : 'them'}.`)
      if (others.length > 0) {
        const kinds = (['shaft', 'void', 'outdoor', 'outside'] as const).flatMap((why) => {
          const these = others.filter((p) => p.why === why)
          if (these.length === 0) return []
          const [one, many] = NOT_COUNTED_WORDS[why]
          return [`${these.length} ${these.length === 1 ? one : many} (${these.slice(0, 20).map((p) => q(p.id)).join(', ')}${these.length > 20 ? ', …' : ''})`]
        })
        lines.push(`Not counted, as grid_areas counts them: ${kinds.join('; ')}.${others.some((p) => p.why === 'shaft') ? ' stairs=per floor counts each floor\'s stair and lift rooms.' : ''}`)
      }
      if (shafts.length > 0) lines.push(`Stairs and lifts are counted on every floor they are drawn on (stairs=per floor): an area sum holds ${shafts.length} stair or lift room${shafts.length === 1 ? '' : 's'} that grid_areas' net counts once, with the lowest room of ${shafts.length === 1 ? 'its' : 'their'} shaft.`)
      const { view, floors } = viewOf(ask, found.map((p) => p.id), by === null ? { highlight: found.slice(0, 2000).map((p) => p.id) } : { colour: fieldName(by) })
      if (found.length > 0) lines.push(`To see ${by === null ? 'them picked out' : 'each group in its own colour'}, pass view to grid_view${floors.length > 1 ? `: they are on ${floors.length} floors, so draw each floor in turn` : ''}.`)
      lines.push(QUERY_RULE)
      return {
        text: lines.join('\n'),
        data: {
          by: by === null ? null : fieldName(by),
          groups,
          total: total === undefined ? { count: 0, sums: Object.fromEntries(sums.map((f) => [fieldName(f), 0])), missing: {} } : { count: total.count, sums: total.sums, missing: total.missing },
          units,
          notCounted: notCountedParts,
          stairs: perFloor ? 'per floor' : 'once',
          view,
          rule: QUERY_RULE,
        },
      }
    })
  },
}

// ---------------------------------------------------------------------------------------------
// grid_measure

/** A room's height in words (ARE-10), with where it comes from. */
function heightText(height: RoomHeight, L: (v: number) => string): string {
  const { value, walls } = height
  if (height.from === 'roof' && height.roof !== undefined) return `Height ${L(height.roof.lowest)} to ${L(height.roof.highest)}, under the roof its floor states; the plan states none for the room.`
  if (value === null || walls === null) {
    return value === null ? 'Height not known: the plan states none for the room and no solid wall bounds it.' : `Height ${L(value)}, as the plan states for the room. No solid wall bounds it.`
  }
  const span = walls.high - walls.low < tolerance('joint') ? L(walls.low) : `${L(walls.low)} to ${L(walls.high)}`
  if (height.from === 'room') return `Height ${L(value)}, as the plan states for the room. Its walls stand ${span}.`
  if (height.from === 'walls') return `Height ${L(value)}, the height of its walls; the plan states none for the room.`
  return `Height ${L(value)}, the lowest of its walls: ${walls.lowest.map(q).join(', ')}, the others up to ${L(walls.high)}. The plan states none for the room.`
}

/** A thing named in a measure between two, made ready to measure, with how to name it in the answer. */
function thingOf(survey: Survey, named: ReturnType<typeof thingArg>): { thing: Thing; label: string } {
  const { plan } = survey
  if (named.kind === 'room') {
    const room = survey.byId.get(named.id)
    if (!room || room.polygon.length < 3) throw new ToolRefusal(`Room ${q(named.id)} has no outline Grid can measure; grid_check says why.`)
    return { thing: roomThing(room), label: `room ${q(roomCalled(room.facts))}` }
  }
  if (named.kind === 'wall') return { thing: wallThing(plan.walls.find((w) => w.id === named.id)!), label: `wall ${q(named.id)}` }
  if (named.kind === 'item') {
    const item = (plan.items ?? []).find((i) => i.id === named.id)!
    const fixture = planFixtures(plan).rows.find((row) => row.id === item.id)
    if (!fixture) throw new ToolRefusal(`Item ${q(item.id)} is left out of the drawing, so Grid cannot measure it; grid_check says why.`)
    return { thing: itemThing(item), label: `${fixture.label} ${q(item.id)}` }
  }
  const opening = plan.openings.find((o) => o.id === named.id)!
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (!wall) throw new ToolRefusal(`The wall of ${opening.type} ${q(opening.id)} is not in the plan; grid_check says so.`)
  return { thing: openingThing(opening, wall), label: `${opening.type} ${q(opening.id)}` }
}

const measureTool: GridTool = {
  name: 'grid_measure',
  title: 'Measure rooms, walls, distances and ways through',
  hint: 'read',
  description:
    'Use this when the person asks will something fit, how wide, long or high a room is, how long a wall is, how far a door is from a corner or one wall from another, can a wheelchair turn, is the way wide enough, which doors or rooms are narrower than their own figure, or how to get from one room to another. '
    + 'what=room gives a room\'s inside sizes, side by side, its height and the widest circle it holds; what=between gives the clear distance from one wall, door, window, opening, fixture or room (from) to another (to) or to a point (x, y), between their faces as a tape measures it, so a door\'s distance from the inside corner is between the door and the wall at the corner, and the gap between two fixtures is between their edges; what=wall gives a wall\'s length on its centre line and the length of its face in each room; what=fit says whether a box (width × depth) or a circle (diameter) fits and where; what=route gives the way from room to room (or to "outside") with every door on it and the narrowest one, how far it is walked and each room\'s share, and always whether a body or a trolley gets through (width, such as 0.7 for a wheelchair; Grid\'s own 0.9 m indicator, said so, when left out), measuring each doorway\'s clear width and the way through each room clear of its fixtures, and another way when the shortest is too narrow; what=use gives a room\'s use indicators: the turning circle its free floor holds, each doorway\'s clear width, the way through between its doorways, the floor in front of and beside each fixture, and any window a fixture stands in front of, each set against the person\'s figure (width, diameter, clearance) or Grid\'s own indicator, and said to be one; what=narrow lists the doors and openings narrower than under, and the rooms whose widest circle is less than under; what=facing says which way each room, outside wall and window faces by the north the plan states, so "which rooms face east" or "is the kitchen south-facing" (a plan that states no north is answered with north as the top of the drawing, and says so); what=sun gives "which rooms get the sun" as a table per room, of geometry and not a daylight result: each window wall\'s way and bearing, the window area against the floor area, and the room\'s depth from each window wall, square to it; what=site gives the plot: how far the building\'s outside face stands from each edge of the site\'s boundary against the set-back the person asked for ("1.00 m from the east boundary; you asked for 3.00 m"), how far each face is from the edge in front of it, and the plot coverage, the share of the plot the building covers; what=access gives the accessibility measurements, as numbers: for the rooms and routes the plan marks as needing to be accessible (accessible), or every room, each door\'s hole and clear width, each corridor at its narrowest, each room\'s turning space, and the way in from the entrance with every step on it and its height, set only against the person\'s own figures from the brief (grid_write_brief), each said as theirs, and what it did not look at; what=library lists the library grid_place_item places from (CNT-20): each fixture\'s, piece of furniture\'s and typical room\'s name, size, height and the clear floor it keeps, from Grid\'s own sizes, the office\'s files in the library folder beside the plan and the plan\'s own, and with name one entry; what=fit with name instead of width and depth fits that entry, an item with the clear floor it keeps in front or a typical room, the same size every time. '
    + 'It measures the room between wall faces: what=fit, what=use and what=route with width keep clear of the room\'s fixtures, the other measures take none off, the plan holds no furniture or door leaves, and the answer says so. It checks no rule: a figure the person gives is their own. Do not use for floor areas (grid_areas), for what a building code asks (grid_check), or to say a plan is accessible: what=access measures, it never says so. Figures are in the units argument, else the plan\'s display (how its person reads lengths), else metres.',
  args: {
    plan: PLAN_ARG,
    what: { type: 'string', required: true, enum: ['room', 'between', 'wall', 'fit', 'route', 'narrow', 'facing', 'sun', 'site', 'use', 'access', 'library'], description: 'What to measure: room, between, wall, fit, route, narrow, facing, sun, site, use, access or library.', examples: ['between', 'fit', 'route', 'use', 'access', 'library'] },
    // CNT-20: a library entry, for fit and library.
    name: { type: 'string', id: true, description: 'For fit, instead of width and depth: a library item or typical room by name (double-bed, bathroom). For library: one entry only.', examples: ['double-bed', 'double-bedroom'] },
    room: { type: 'string', id: true, description: 'For room, fit, use and route: the room id, where the route starts. For facing and sun: one room only, every room when left out.', examples: ['kitchen', 'hall'] },
    from: { type: 'string', id: true, description: 'For between: the id of a wall, door, window, opening, fixture or room to measure from. For route: the room it starts in, as room.', examples: ['front-door', 'w-west'] },
    to: { type: 'string', id: true, description: 'For between: the id of the wall, door, window, opening, fixture or room to measure to. For route: the room id where it ends, or "outside" for the nearest way out.', examples: ['w-west', 'bed1', 'outside'] },
    x: { type: 'number', length: true, description: 'For between, instead of to: a point\'s x on the drawing in metres, such as an inside corner. The plan names no points.', examples: [0.15], minimum: -limit('largest'), maximum: limit('largest') },
    y: { type: 'number', length: true, description: 'For between, with x: the point\'s y on the drawing in metres.', examples: [0.15], minimum: -limit('largest'), maximum: limit('largest') },
    wall: { type: 'string', id: true, description: 'For wall: the wall id.', examples: ['w-south'] },
    width: { type: 'number', length: true, description: 'For fit: the box\'s width in metres; a table of 1.8 × 0.9 m with 0.75 m round it for chairs is 3.3. For route and use: the width of the body or trolley that must get through, such as 0.7 for a wheelchair; for use, Grid\'s own indicator when left out.', examples: [3.3, 0.7], minimum: 0.05, maximum: 100 },
    depth: { type: 'number', length: true, description: 'For fit: the box\'s depth in metres. It is tried both ways round.', examples: [2.4, 0.6], minimum: 0.05, maximum: 100 },
    diameter: { type: 'number', length: true, description: 'For fit: a circle instead of a box, such as 1.5 for a wheelchair turning circle. For use: the turning circle to set the room against; Grid\'s own indicator when left out.', examples: [1.5], minimum: 0.05, maximum: 100 },
    clearance: { type: 'number', length: true, description: 'For use: the clear floor wanted in front of and beside each fixture, in metres, such as 0.7 beside a bath; Grid\'s own indicator when left out.', examples: [0.7], minimum: 0.05, maximum: 100 },
    under: { type: 'number', length: true, description: 'For narrow: the person\'s figure in metres, such as 0.8 for a door or 1.5 for a turning circle; width does the same.', examples: [0.8, 1.5], minimum: 0.05, maximum: 100 },
    start: { type: 'string', enum: ['middle', 'door', 'farthest corner'], description: 'For route: where it starts in its room: the middle of the widest circle (the default), the door it leaves by, or the room\'s corner farthest from that door. A point of your own: x and y instead.', examples: ['door', 'farthest corner'] },
    end: { type: 'string', enum: ['middle', 'door'], description: 'For route: where it ends in its last room: the middle, or the doorway into it. Left out, a stair or lift room is ended at its door and any other room at its middle; to outside it always ends at the outside face of the door out.', examples: ['door', 'middle'] },
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
  },
  outputSchema: objectSchema({ what: STRING, answer: { type: 'object' }, rule: STRING }),
  run(args, context) {
    const { survey, file } = load(context, args['plan'])
    const what = args['what'] as 'room' | 'between' | 'wall' | 'fit' | 'route' | 'narrow' | 'facing' | 'sun' | 'site' | 'use' | 'access' | 'library'
    // CMD-29: the same thing goes by the same name in every mode: a route goes from a room, and
    // a narrow measure takes the width the way route and use do.
    if (what === 'route' && args['from'] !== undefined) {
      if (args['room'] !== undefined && args['room'] !== args['from']) throw new ToolRefusal('what=route takes from or room, the room it starts in, not two different ones.')
      args = { ...args, room: args['from'], from: undefined }
    }
    if (what === 'narrow' && args['width'] !== undefined) {
      if (args['under'] !== undefined && args['under'] !== args['width']) throw new ToolRefusal('what=narrow takes under or width, the figure to be narrower than, not two different ones.')
      args = { ...args, under: args['width'], width: undefined }
    }
    const units = displayFor(args['units'], args['decimal'], survey.plan)
    const L = (v: number, own?: boolean): string => (own === true ? ownLengthText(v, units) : lengthText(v, units))
    const allowed: Record<string, readonly string[]> = {
      room: ['room'],
      between: ['from', 'to', 'x', 'y'],
      wall: ['wall'],
      fit: ['room', 'width', 'depth', 'diameter', 'name'],
      route: ['room', 'from', 'to', 'width', 'x', 'y', 'start', 'end'],
      narrow: ['under', 'width'],
      facing: ['room'],
      sun: ['room'],
      site: [],
      use: ['room', 'width', 'diameter', 'clearance'],
      access: [],
      library: ['name'],
    }
    const stray = ['room', 'from', 'to', 'x', 'y', 'wall', 'width', 'depth', 'diameter', 'under', 'clearance', 'name', 'start', 'end'].filter((key) => args[key] !== undefined && !allowed[what]!.includes(key))
    if (stray.length > 0) throw new ToolRefusal(`what=${what} takes ${allowed[what]!.length === 0 ? 'no other argument' : allowed[what]!.join(', ')}, not ${stray.join(', ')}.`)
    if (what === 'access') {
      // CNT-17: the accessibility measurements, set only against the person's own figures (the
      // brief beside the plan) and a code's once a named person has confirmed it.
      let read: ReturnType<typeof readBrief>
      try {
        read = readBrief(projectOf(context), file)
      } catch (error) {
        throw asRefusal(error)
      }
      const where = { ...(survey.plan.site?.country === undefined ? {} : { country: survey.plan.site.country }), ...(survey.plan.building === undefined ? {} : { building: survey.plan.building }) }
      const found = accessAnswer(survey, { yours: read.brief?.figures ?? [], code: (key) => confirmedFigure(key, where) }, L, read.brief === null ? null : read.file)
      const said = read.problem === null ? [] : [`The brief beside the plan was not read, so none of your own figures is used: ${read.problem}.`]
      return { text: [...found.lines.slice(0, 1), ...said, ...found.lines.slice(1), ACCESS_RULE].join('\n'), data: { what, answer: { ...found.data, brief: read.brief === null ? null : read.file }, rule: ACCESS_RULE } }
    }
    const roomOf = (): ReturnType<Survey['byId']['get']> & object => {
      if (args['room'] === undefined) throw new ToolRefusal(`what=${what} needs room: a room id.`)
      const id = roomArg(survey.plan, args['room'])
      const room = survey.byId.get(id)
      if (!room || room.polygon.length < 3) throw new ToolRefusal('That room has no outline Grid can measure; grid_check says why.')
      return room
    }
    // CNT-8: a zone is part of its room, and the room is the place: the use indicators and the
    // ways through the plan measure the room as a whole, and say so.
    const wholeOf = (room: SurveyRoom): { room: SurveyRoom; said: string | null } => {
      const of = room.facts.zoneOf === undefined ? undefined : survey.byId.get(room.facts.zoneOf)
      if (of === undefined || of.polygon.length < 3) return { room, said: null }
      return { room: of, said: `${q(roomCalled(room.facts))} is a zone of ${q(roomCalled(of.facts))}: measured as part of it, the room as a whole.` }
    }
    if (what === 'room') {
      const room = roomOf()
      const r = measureRoom(room)
      const size = r.rectangle ? `${L(r.across)} × ${L(r.up)}` : `${L(r.across)} across by ${L(r.up)} up the drawing at most`
      const sides = r.sides.map((s) => `${s.facing} ${L(s.length)}`).join(', ')
      const height = roomHeight(survey.plan, r.id)
      return {
        text: `${q(r.name)}: ${size}, ${areaText(r.area, units)}, perimeter ${L(r.perimeter)}. Sides, going round: ${sides}. The widest circle it holds is ${L(r.widestCircle)} across.\n${heightText(height, L)}\n${EMPTY_ROOM_RULE}\n${HEIGHT_RULE}`,
        data: { what, answer: { ...r, height }, rule: `${EMPTY_ROOM_RULE} ${HEIGHT_RULE}` },
      }
    }
    if (what === 'use') {
      // CNT-13: the room's use indicators, each set against the person's figure or Grid's own.
      const asked = roomOf()
      const { room, said } = wholeOf(asked)
      const found = roomIndicators(survey, room, { width: args['width'], diameter: args['diameter'], clearance: args['clearance'] }, L, fixturesLeftOut(survey.plan, readPlan(context, args['plan']).loaded.faults ?? []).length)
      return {
        text: [...(said === null ? [] : [said]), ...found.lines, USE_RULE].join('\n'),
        data: { what, answer: { room: room.facts.id, ...(said === null ? {} : { zone: asked.facts.id }), indicators: found.indicators }, rule: USE_RULE },
      }
    }
    if (what === 'facing') {
      // CNT-3: which way the rooms, their outside walls and their windows face.
      const id = args['room'] === undefined ? undefined : roomArg(survey.plan, args['room'])
      const facing = facingAnswer(survey.plan, id)
      return { text: [...facing.lines, FACING_RULE].join('\n'), data: { what, answer: facing.data, rule: FACING_RULE } }
    }
    if (what === 'sun') {
      // BRF-5: which rooms get the sun, as a table of geometry: window walls, window area, depth.
      const id = args['room'] === undefined ? undefined : roomArg(survey.plan, args['room'])
      const sun = sunAnswer(survey.plan, units, id)
      if (sun.missing) throw new ToolRefusal('That room has no outline Grid can measure; grid_check says why.')
      return { text: [...sun.lines, SUN_RULE].join('\n'), data: { what, answer: sun.data, rule: SUN_RULE } }
    }
    if (what === 'site') {
      // BRF-3 (lab EL-16): the building against its plot, and the plot coverage. BRF-4 (lab FD-1):
      // the storeys and the gross area per floor, massing or walls, and the person's own site
      // limits from the brief beside the plan, each used, allowed, and met or not.
      let read: ReturnType<typeof readBrief>
      try {
        read = readBrief(projectOf(context), file)
      } catch (error) {
        throw asRefusal(error)
      }
      const site = siteAnswer(survey.plan, units)
      const storeys = planStoreys(survey.plan)
      const limits = siteLimits(survey.plan, read.brief?.figures ?? [], units)
      const said = read.problem === null ? [] : [`The brief beside the plan was not read, so none of your own site limits is used: ${read.problem}.`]
      const limitLines = limits.length === 0 ? ['Site limits: none given. The person\'s own coverage, floor area ratio, height and parking per home go in the brief\'s figures (grid_write_brief), the set-backs in site.setbacks.'] : ['Site limits, ' + FIGURES_HEADING.charAt(0).toLowerCase() + FIGURES_HEADING.slice(1), ...limits.map((l) => `  ${l.text}`)]
      const text = [...site.lines, ...massingLines(survey.plan, units), ...said, ...limitLines, SITE_RULE, LIMITS_RULE]
      return {
        text: text.join('\n'),
        data: {
          what,
          answer: {
            ...site.data,
            storeys: { above: storeys.above, below: storeys.below, storeys: storeys.storeys, empty: storeys.empty },
            limits: limits.map((limit) => Object.fromEntries(Object.entries(limit).filter(([key]) => key !== 'text'))),
            brief: read.brief === null ? null : read.file,
          },
          rule: `${SITE_RULE} ${LIMITS_RULE}`,
        },
      }
    }
    if (what === 'between') {
      if (args['from'] === undefined) throw new ToolRefusal('what=between needs from: the id of a wall, door, window, opening, fixture or room.')
      const hasPoint = args['x'] !== undefined || args['y'] !== undefined
      if (hasPoint === (args['to'] !== undefined)) throw new ToolRefusal('what=between takes to, or x and y for a point, after from.')
      if (hasPoint && (args['x'] === undefined || args['y'] === undefined)) throw new ToolRefusal('A point needs both x and y.')
      const first = thingOf(survey, thingArg(survey.plan, args['from'], 'from'))
      const second = hasPoint
        ? { thing: pointThing({ x: args['x'] as number, y: args['y'] as number }), label: `the point (${m(args['x'] as number)}, ${m(args['y'] as number)})` }
        : thingOf(survey, thingArg(survey.plan, args['to'], 'to'))
      if (second.thing.floor !== null && first.thing.floor !== second.thing.floor) {
        throw new ToolRefusal('Both things of a measure must be on the same floor: the plan says nothing of the height between floors.')
      }
      const found = distanceBetween(first.thing, second.thing)
      // ARE-53: the walls the line passes through, other than the things' own.
      const leave = new Set<string>()
      for (const named of [thingArg(survey.plan, args['from'], 'from'), ...(hasPoint ? [] : [thingArg(survey.plan, args['to'], 'to')])]) {
        if (named.kind === 'wall') leave.add(named.id)
        if (named.kind === 'opening') leave.add(survey.plan.openings.find((o) => o.id === named.id)?.wall ?? '')
      }
      const through = found.distance === 0 ? [] : wallsCrossed(survey.plan, first.thing.floor ?? second.thing.floor, found.at[0], found.at[1], leave)
      const where = `from (${m(found.at[0].x)}, ${m(found.at[0].y)}) to (${m(found.at[1].x)}, ${m(found.at[1].y)})`
      const said = found.distance === 0
        ? `${first.label} and ${second.label} touch or overlap: 0 m between them.`
        : through.length > 0
          ? `From ${first.label} to ${second.label}: ${L(found.distance)} overall, ${found.toward} on the drawing, ${where}, through ${through.length === 1 ? 'wall' : 'walls'} ${through.map(q).join(', ')}: it is not a clear stretch.`
          : `From ${first.label} to ${second.label}: ${L(found.distance)} clear, ${found.toward} on the drawing, ${where}.`
      return {
        text: `${said.charAt(0).toUpperCase()}${said.slice(1)}\n${FACES_RULE}\n${EMPTY_ROOM_RULE}`,
        data: {
          what,
          answer: {
            from: { kind: first.thing.kind, id: first.thing.id },
            to: { kind: second.thing.kind, id: second.thing.id },
            floor: first.thing.floor,
            distance: found.distance,
            at: found.at,
            toward: found.toward,
            clear: through.length === 0,
            through,
          },
          rule: `${FACES_RULE} ${EMPTY_ROOM_RULE}`,
        },
      }
    }
    if (what === 'wall') {
      if (args['wall'] === undefined) throw new ToolRefusal('what=wall needs wall: a wall id.')
      const wall = survey.plan.walls.find((w) => w.id === wallArg(survey.plan, args['wall']))!
      const w = wallLengths(survey, wall)
      const kind = w.virtual ? 'dividing line' : `${L(w.thickness)} thick, ${L(w.height)} high`
      const faces = w.faces.length === 0 ? 'No room\'s outline runs along it.' : `Along its face in each room: ${w.faces.map((f) => `${q(f.name)} ${L(f.length)}`).join(', ')}.`
      // LVL-20: under a roof its floor states, the wall's height along its length.
      const points = joined((w.top ?? []).map((p) => said('measure.wall.top.point', { height: num(metresText(p.height)), at: num(metresText(p.at)) })), 'join.comma')
      const values = { height: num(metresText(w.height)), low: num(metresText(w.low)), high: num(metresText(w.high)), points }
      const top = w.cut === null ? '' : ` ${english(said(w.cut === 'raised' ? 'measure.wall.top.raised' : 'measure.wall.top.cut', values))}`
      return {
        text: `Wall ${q(w.id)}: ${L(w.length)} on its centre line, ${kind}.${top} ${faces}\n${FACES_RULE}`,
        data: { what, answer: w, rule: FACES_RULE },
      }
    }
    if (what === 'library') {
      // CNT-20: the library grid_place_item places from.
      const { library, problems } = libraryFor(projectOf(context), file, survey.plan)
      const found = libraryAnswer(library, problems, args['name'] as string | undefined)
      return { text: [...found.lines, LIBRARY_RULE].join('\n'), data: { what, answer: found.data, rule: LIBRARY_RULE } }
    }
    if (what === 'fit') {
      const room = roomOf()
      // CNT-20: a library entry by name is a box of its own size, the same every time.
      const named = args['name'] === undefined ? null : libraryBox(libraryFor(projectOf(context), file, survey.plan).library, args['name'] as string)
      if (named !== null && (args['width'] !== undefined || args['depth'] !== undefined || args['diameter'] !== undefined)) throw new ToolRefusal('what=fit takes name, or width and depth, or diameter: one of them.')
      if (named !== null) args = { ...args, width: named.width, depth: named.depth }
      const hasBox = args['width'] !== undefined || args['depth'] !== undefined
      if (hasBox === (args['diameter'] !== undefined)) throw new ToolRefusal('what=fit takes width and depth for a box, or diameter for a circle.')
      if (hasBox && (args['width'] === undefined || args['depth'] === undefined)) throw new ToolRefusal('A box needs both width and depth.')
      // CNT-12: the room's fixtures take their floor, so what is fitted keeps clear of them.
      const fixtures = planFixtures(survey.plan).rows.filter((row) => row.room === room.facts.id)
      const footprints = fixtures.map((row) => itemFootprint({ id: row.id, kind: row.kind, at: [row.at[0], row.at[1]], size: [row.size[0], row.size[1]], height: row.height, turn: row.turn }))
      const fit = fitInRoom(room, hasBox ? { width: args['width'] as number, depth: args['depth'] as number } : { diameter: args['diameter'] as number }, footprints)
      const where = fit.at ? `, for example centred at (${m(fit.at.x)}, ${m(fit.at.y)})${fit.turned ? ', turned a quarter' : ''}` : ''
      const clear = fixtures.length === 0 ? '' : `, clear of its ${fixtures.length === 1 ? 'fixture' : `${fixtures.length} fixtures`} (${fixtures.map((f) => `${f.label} ${q(f.id)}`).join(', ')})`
      const rule = fixtures.length === 0 ? EMPTY_ROOM_RULE : `${FIT_CLEAR_RULE} ${EMPTY_ROOM_RULE}`
      const entry = named === null ? '' : `${named.said} `
      return {
        text: `${entry}${fit.what} ${fit.fits ? 'fits' : 'does not fit'} in ${q(roomCalled(room.facts))}${clear}${where}. The widest circle ${fixtures.length === 0 ? 'the room holds' : 'its free floor holds'} is ${L(fit.widestCircle)} across.\n${rule}`,
        data: { what, answer: { room: room.facts.id, ...fit, ...(fixtures.length === 0 ? {} : { clearOf: fixtures.map((f) => f.id) }), ...(named === null ? {} : { library: named.name }) }, rule },
      }
    }
    if (what === 'route') {
      const asked = roomOf()
      if (args['to'] === undefined) throw new ToolRefusal('what=route needs to: a room id, or "outside".')
      const askedTo = args['to'] === 'outside' ? 'outside' : roomArg(survey.plan, args['to'], 'to')
      if (askedTo !== 'outside' && survey.byId.get(askedTo)?.facts.floor !== asked.facts.floor) throw new ToolRefusal('Both rooms of a route must be on the same floor: the plan says nothing of what joins floors.')
      // CNT-8: a zone is no place of its own: the way starts or ends in its room.
      const start = wholeOf(asked)
      const goal = askedTo === 'outside' ? undefined : survey.byId.get(askedTo)
      const end = goal === undefined ? null : wholeOf(goal)
      const room = start.room
      const to = askedTo === 'outside' ? 'outside' : (end?.room.facts.id ?? askedTo)
      const said = [start.said, end === null ? null : end.said].filter((line): line is string => line !== null)
      const zones = { ...(start.said === null ? {} : { fromZone: asked.facts.id }), ...(end === null || end.said === null ? {} : { toZone: askedTo }) }
      if ((args['x'] === undefined) !== (args['y'] === undefined)) throw new ToolRefusal('what=route takes x and y together: the point the route starts from.')
      if (args['x'] !== undefined && args['start'] !== undefined) throw new ToolRefusal('what=route starts at start or at the point x, y, not both.')
      const given = args['x'] === undefined ? null : { x: args['x'] as number, y: args['y'] as number }
      if (given !== null && !pointInPolygon(given, room.polygon, room.holes)) throw new ToolRefusal(`The point ${L(given.x)}, ${L(given.y)} is not on the floor of ${q(roomCalled(room.facts))}: a route starts from a point on its first room's floor.`)
      const route = routeBetween(survey, room.facts.id, to, true, { ...(given !== null ? { start: given } : args['start'] === undefined ? {} : { start: args['start'] as 'middle' | 'door' | 'farthest corner' }), ...(args['end'] === undefined ? {} : { end: args['end'] as 'middle' | 'door' }) })
      if (route === null) {
        // ARE-28: from a floor above the ground that nothing joins to the ground floor, the answer says why.
        const noStair = to === 'outside' ? floorsWithNoStair(survey.plan).find((f) => f.floor === room.facts.floor) : undefined
        const floorName = planFloors(survey.plan).find((f) => f.id === noStair?.floor)?.name ?? noStair?.floor ?? ''
        const why = noStair === undefined ? [] : [english({ key: 'check.noStair.route', values: { floor: { name: floorName }, room: { name: roomCalled(room.facts) } } })]
        // ARE-46: a doorway an item leaves no clear width in is closed; the answer names it and the item.
        const shut = wayGraph(survey, room.facts.floor).blocked.map((b) => ({ via: b.opening, between: b.rooms, by: b.by }))
        const shutLines = shut.map((b) => say('en', 'route.blockedDoorway', { kind: survey.plan.openings.find((o) => o.id === b.via)?.type === 'door' ? 'door' : 'opening', via: { name: b.via }, rooms: joined(b.between.map((id) => ({ name: roomCalledById(survey, id) })), 'join.and'), items: joined(b.by.map((id) => ({ name: id })), 'join.comma') }))
        return { text: [...said, `There is no way from ${q(roomCalled(room.facts))} to ${to === 'outside' ? 'the outside' : q(roomCalledById(survey, to))} through the plan's doors and openings.`, ...shutLines, ...why, EMPTY_ROOM_RULE].join('\n'), data: { what, answer: { found: false, ...(noStair === undefined ? {} : { noStair }), ...(shut.length === 0 ? {} : { blocked: shut }), ...zones }, rule: EMPTY_ROOM_RULE } }
      }
      const name = (id: string): string => (id === 'outside' ? 'outside' : q(roomCalledById(survey, id)))
      const steps = route.steps.map((s) => `${s.type} ${q(s.via)}${s.width === null ? '' : ` ${L(s.width)}`} into ${name(s.into)}`).join(', then ')
      const widths = route.rooms.map((id) => {
        const r = survey.byId.get(id)!
        return `${name(id)} ${L(measureRoom(r).widestCircle)}`
      }).join(', ')
      const lines = [
        ...said,
        `From ${name(route.from)} to ${name(route.to)}: ${steps}.`,
        // ARE-21: to outside, the nearest way out by walked length, and the ones passed over.
        ...(route.exit === undefined
          ? []
          : [`Nearest way out: ${route.steps.at(-1)!.type} ${q(route.exit)}, the shortest walked of ${(route.otherExits?.length ?? 0) + 1}.${route.otherExits && route.otherExits.length > 0 ? ` Others: ${route.otherExits.map((e) => `${e.type} ${q(e.via)} ${e.length === null ? 'not measured' : L(e.length)}`).join(', ')}.` : ''}`]),
        ...(route.startPoint === null || route.endPoint === null ? [] : [`Walked from ${L(route.startPoint.point.x)}, ${L(route.startPoint.point.y)} (${route.startPoint.at}) to ${L(route.endPoint.point.x)}, ${L(route.endPoint.point.y)} (${route.endPoint.at}).`]),
        route.narrowestPassage ? `Narrowest door or opening on the way: ${q(route.narrowestPassage.via)}, ${L(route.narrowestPassage.width)}.` : 'No door or opening on the way, only open sides.',
        `Widest circle in each room on the way: ${widths}.`,
        // VEW-9: the length, and each room's share of it.
        ...(route.length === null
          ? [walkGapLine(route.gap, name)]
          : [`Walked, ${L(route.length)}: ${route.legs.map((leg) => `${name(leg.room)} ${L(leg.length)}`).join(', ')}, ${route.onStairs === null || route.onStairs === 0 ? 'and ' : ''}${L(route.length - route.legs.reduce((sum, leg) => sum + leg.length, 0) - (route.onStairs ?? 0))} through the walls${route.onStairs === null || route.onStairs === 0 ? '' : ` and ${L(route.onStairs)} along the stairs`}.`, WALKED_RULE]),
        EMPTY_ROOM_RULE,
      ]
      // ARE-45: the same fields with or without a width: a body or trolley of the width given, or
      // Grid's own indicator, is set against the way (CNT-13), clear of the fixtures. A way up or
      // down stairs is not measured for a body: its widths are not worked out here.
      const figure = figureOf(args['width'], 'usePassageWidth')
      const onStairs = new Set(route.floors).size > 1
      const wide = onStairs ? null : wideRoute(survey, room.facts.id, to, figure.value)
      const body = wide === null
        ? { code: 'use/passage-width', figure, width: figure.value, through: null, way: null, shortest: null, narrower: [] }
        : { code: 'use/passage-width', figure, ...wide }
      const bodyLines = wide === null ? [`A body or trolley ${L(figure.value)} wide (${figure.from === 'person' ? 'the width you gave' : 'Grid\'s own indicator'}) is not set against this way: it goes up or down stairs, and their widths are not measured here.`] : [...wideRouteLines(survey, wide, figure, L), USE_RULE]
      return { text: [...lines, ...bodyLines].join('\n'), data: { what, answer: { found: true, ...route, ...body, ...zones }, rule: EMPTY_ROOM_RULE } }
    }
    if (args['under'] === undefined) throw new ToolRefusal('what=narrow needs under: the person\'s figure in metres.')
    const under = args['under'] as number
    const schedule = planSchedule(survey, { types: ['door', 'opening'], narrowerThan: under })
    const name = (id: string): string => (survey.facts.rooms.has(id) ? q(roomCalled(survey.facts.rooms.get(id)!)) : id)
    const doors = schedule.rows.flatMap((row) => row.items.map((item) => ({ id: item.id, type: row.type, width: row.width, between: item.between })))
    const rooms = survey.rooms.filter((r) => r.polygon.length >= 3).map((r) => measureRoom(r)).filter((r) => r.widestCircle < under - tolerance('noLength'))
    const lines = [
      doors.length === 0 ? `No door or opening is narrower than ${L(under)}.` : `Narrower than ${L(under)}: ${doors.map((d) => `${d.type} ${q(d.id)} ${L(d.width)} (${name(d.between[0])} ↔ ${name(d.between[1])})`).join('; ')}.`,
      rooms.length === 0 ? `Every room holds a circle ${L(under)} across.` : `Rooms whose widest circle is under ${L(under)}: ${rooms.map((r) => `${q(r.name)} ${L(r.widestCircle)}`).join(', ')}.`,
      'These are the person\'s own figures, not a rule from any code or standard. Door sizes are the hole in the wall; the clear width past a door leaf is less.',
      EMPTY_ROOM_RULE,
    ]
    return { text: lines.join('\n'), data: { what, answer: { under, openings: doors, rooms: rooms.map((r) => ({ id: r.id, name: r.name, widestCircle: r.widestCircle })) }, rule: EMPTY_ROOM_RULE } }
  },
}

/**
 * ARE-18: why a route's walked length is not given, with the room it stops at: no outline Grid
 * can draw (which grid_check names), a doorway not found on its side, or no line across its floor.
 */
function walkGapLine(gap: WalkGap | null, name: (id: string) => string): string {
  if (gap === null || gap.reason === 'no outline') return `The walked length is not given: ${gap === null ? 'a room on the way' : name(gap.room)} has no outline Grid can draw, so its floor is not measured either; grid_check names what stops it.`
  if (gap.reason === 'doorway') return `The walked length is not given: the doorway ${q(gap.via ?? '')} is not found on the side of ${name(gap.room)}, so the way cannot be walked through it.`
  return `The walked length is not given: no line from doorway to doorway keeps to the floor of ${name(gap.room)}.`
}

// ---------------------------------------------------------------------------------------------
// grid_view

const COMPASS_HEADING: Record<string, number> = { north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315 }

/** VEW-3: the camera record's shape, as `grid_view` and `grid_save_view` give it. */
const POINT3 = { type: 'array', items: NUMBER, minItems: 3, maxItems: 3 }
export const CAMERA_SCHEMA = {
  type: 'object',
  properties: {
    target: objectSchema({ room: NULLABLE_STRING, point: POINT3 }),
    bearing: NUMBER,
    bearingFrom: { type: 'string', enum: ['north', 'plan up'] },
    north: NULLABLE_NUMBER,
    tilt: NUMBER,
    distance: NUMBER,
    eyeHeight: NUMBER,
    floor: STRING,
    lens: objectSchema({ focalLength: NUMBER, sensor: objectSchema({ width: NUMBER, height: NUMBER }) }),
    cut: NULLABLE_STRING,
    floors: listSchema(STRING),
    standingIn: objectSchema({ room: NULLABLE_STRING, name: NULLABLE_STRING, floor: NULLABLE_STRING, words: STRING }),
    position: POINT3,
    direction: POINT3,
    up: POINT3,
    fieldOfView: NUMBER,
    aspectRatio: NUMBER,
  },
  required: ['target', 'bearing', 'bearingFrom', 'north', 'tilt', 'distance', 'eyeHeight', 'floor', 'lens', 'cut', 'floors', 'standingIn', 'position', 'direction', 'up', 'fieldOfView', 'aspectRatio'],
} as const

/** VEW-3: the camera argument: a record grid_view returned, read field by field. */
export const CAMERA_ARG: ArgSpec = {
  type: 'object',
  description: 'A camera record exactly as grid_view returned it in camera, to start from: the view is taken again from its target, bearing, tilt, distance, lens and cut, with any of them changed here or by the other arguments. Its other fields are worked out again.',
  examples: [{ target: { room: 'living', point: [3.2, 2.5, 1.35] }, bearing: 135, north: null, tilt: 30, distance: 24, lens: { focalLength: 28.970563 }, cut: null }],
  schema: {
    type: 'object',
    properties: {
      target: { type: 'object', properties: { room: NULLABLE_STRING, point: POINT3 } },
      bearing: NUMBER,
      north: NULLABLE_NUMBER,
      tilt: NUMBER,
      distance: NUMBER,
      lens: { type: 'object', properties: { focalLength: NUMBER } },
      cut: NULLABLE_STRING,
    },
    required: ['target', 'bearing', 'tilt', 'distance', 'lens'],
  },
  read(value) {
    try {
      return settingOfCamera(value as Record<string, unknown>)
    } catch (error) {
      if (error instanceof CameraRefused) throw new ToolRefusal(error.message)
      throw error
    }
  },
}

const deg1 = (value: number): string => `${Number(value.toFixed(1))}°`

/** What bearing 0 is, in the record's words. */
function bearingFromText(camera: CameraRecord): string {
  return camera.bearingFrom === 'north' ? `clockwise from the north the plan states (${northWords(camera.north!)})` : 'clockwise from the top of the drawing, as the plan states no north'
}

/** VEW-59: the line that says a camera stands inside a wall, which draws as one flat field, and where it would clear it. */
function insideWallLines(plan: FloorPlan, camera: CameraRecord): string[] {
  const inside = cameraInsideWall(plan, camera)
  if (inside === null) return []
  const way = inside.clearDistance === null
    ? 'Point it from outside the wall, or from a room.'
    : `A distance of ${m(inside.clearDistance)} m from what it is pointed at (${m(inside.clearDistance - camera.distance)} m further out along its bearing) stands it clear of the walls.`
  return [`The camera stands inside wall ${q(inside.wall)}, so the picture is the wall's inside, a flat field with nothing in it. ${way}`]
}

/**
 * VEW-3: the camera in a few lines: what it is pointed at, from where, how high, its lens, where
 * it stands (S-16), and how to move it in one call.
 */
export function cameraLines(plan: FloorPlan, camera: CameraRecord): string[] {
  const room = camera.target.room === null ? null : plan.rooms.find((r) => r.id === camera.target.room) ?? null
  const side = compassPoint(drawingBearing(camera.bearing, planOrientation(plan)))
  const [x, y, z] = camera.target.point
  const at = `(${m(x)}, ${m(y)}, ${m(z)})${room === null ? '' : ` for ${q(room.name)} (${q(room.id)})`}`
  const looking = camera.tilt === 0 ? 'looking level' : camera.tilt > 0 ? `looking ${deg1(camera.tilt)} down` : `looking ${deg1(-camera.tilt)} up`
  return [
    `Camera: pointed at ${at}, from bearing ${deg1(camera.bearing)} (${bearingFromText(camera)}), on the ${side} side of the drawing; ${looking}, ${m(camera.distance)} m away; the eye ${m(camera.eyeHeight)} m above floor ${q(camera.floor)}; lens ${Number(camera.lens.focalLength.toFixed(2))} mm on a ${camera.lens.sensor.width} × ${camera.lens.sensor.height} mm sensor (${deg1(camera.fieldOfView)} tall). ${camera.cut === null ? 'The whole building is shown.' : `Floor ${q(camera.cut)} is cut away: nothing above it is drawn.`}`,
    `It stands ${camera.standingIn.words}.`,
    ...insideWallLines(plan, camera),
    'The record is in camera. For another view, send it back to grid_view kind=3d as camera with the numbers changed, or with turn (degrees round the target, above 0 to the camera\'s left) and tilt_by (degrees, below 0 lower); grid_save_view saves it by name.',
  ]
}

/**
 * VEW-26: the pieces a long floor is drawn in (`pictureTiles`), the frame of the one asked for,
 * and the lines that say so. Refused, with why, for a piece the floor does not have.
 */
function tilesOf(plan: FloorPlan, floor: string, dimensions: boolean, cropped: boolean, asked: number | undefined): { tiles: Bounds[]; frame: Bounds | undefined; piece: number | null; lines: string[] } {
  if (asked !== undefined && cropped) throw new ToolRefusal('Pass crop or tile, not both: each frames part of the floor.')
  if (asked !== undefined && !Number.isInteger(asked)) throw new ToolRefusal('tile takes a whole number: the piece to draw, from 1.')
  const tiles = cropped ? [] : pictureTiles(plan, { floor, showDimensions: dimensions })
  if (asked !== undefined && tiles.length === 0) throw new ToolRefusal(`Floor ${q(floor)} is drawn whole large enough to read, not in pieces: leave tile out.`)
  if (asked !== undefined && asked > tiles.length) throw new ToolRefusal(`Floor ${q(floor)} is drawn in ${tiles.length} pieces: tile takes 1 to ${tiles.length}.`)
  if (tiles.length === 0) return { tiles, frame: undefined, piece: null, lines: [] }
  if (asked !== undefined) {
    const next = asked < tiles.length ? ` tile=${asked + 1} draws the next.` : ' It is the last.'
    return { tiles, frame: tiles[asked - 1], piece: asked, lines: [`Piece ${asked} of ${tiles.length} of floor ${q(floor)}, which is far longer than it is wide; each piece overlaps the next a little.${next}`] }
  }
  const whole = pictureFrame(plan, { floor, showDimensions: dimensions })
  const [long, short] = [Math.max(whole.width, whole.height), Math.min(whole.width, whole.height)]
  return {
    tiles,
    frame: undefined,
    piece: null,
    lines: [`Floor ${q(floor)} is about ${Math.round(long)} m long and ${Math.round(short)} m across: drawn whole its labels are too small to read and crowd. tile=1 to tile=${tiles.length} draw it in ${tiles.length} pieces along its length, each overlapping the next, at ${TILE_PX_PER_METRE} px a metre or more.`],
  }
}

/** VEW-26: what a 3D picture was framed to, and how, when Grid framed it. */
function fitLines(framed: { camera: CameraRecord; fit: CameraFit | null; level: boolean }): string[] {
  if (framed.fit === null) return []
  const frame = framed.camera.aspectRatio < 1 ? 'a portrait frame' : 'a landscape frame'
  const what = framed.fit === 'room' ? 'the room' : 'the building'
  const level = framed.level ? ' It looks level from the eye height asked for, so upright lines stay upright.' : ''
  return [`Framed to ${what} (fit=${framed.fit}), in ${frame}: the camera stands as far as it needs to see all of it.${level}`]
}

/** The views the plan has saved, for the answer: so an agent knows it can call them up. */
function savedViewsLine(plan: FloorPlan): string[] {
  const views = plan.views ?? []
  if (views.length === 0) return []
  const names = views.slice(0, 10).map((v) => q(v.name))
  return [`Views saved with the plan, by name (view): ${names.join(', ')}${views.length > 10 ? ` and ${views.length - 10} more` : ''}.`]
}

/**
 * WRT-43: why a room is in no view, from the plan as read: the reader left it out (MSG-6), or it
 * cannot be drawn (its check line). Null when it is drawn, or the file holds no room by that id.
 */
function roomLeftOutWhy(loaded: LoadedPlan, id: string): string | null {
  const read = loaded.faults?.find((f) => (f.kind === 'part-left-out' || f.kind === 'id-clash') && f.part.list === 'rooms' && f.part.id === id)
  if (read !== undefined) return `room ${q(id)}, which was left out when the plan was read: ${faultText(read)}`
  if (!loaded.broken.has(id) || !loaded.plan.rooms.some((r) => r.id === id)) return null
  const issue = loaded.issues.find((i) => i.entity === 'room' && i.id === id && i.severity === 'error') ?? loaded.issues.find((i) => i.entity === 'room' && i.id === id)
  return `room ${q(id)}, which cannot be drawn${issue === undefined ? '' : `: ${issue.message.replace(/\.$/, '')} (${issue.code})`}`
}

/** WRT-43: refuses a view of a room that is in no view, saying why it is left out. */
function refuseLeftOutRoom(loaded: LoadedPlan, room: unknown, argument: string): void {
  if (typeof room !== 'string') return
  const why = roomLeftOutWhy(loaded, room)
  if (why !== null) throw new ToolRefusal(`${argument} names ${why}. It is in no view or measure until that is corrected; grid_check says how.`)
}

/** The part a crop names on the floor: an id first, else a room's name (any case), else refused naming the rooms. */
function cropPart(plan: FloorPlan, floor: string, crop: string, loaded: LoadedPlan): PartBounds {
  const parts = partBounds(plan, floor)
  const byId = parts.find((p) => p.id === crop)
  if (byId) return byId
  const wanted = crop.trim().toLowerCase()
  const named = plan.rooms.filter((r) => floorOf(r) === floor && r.name.trim().toLowerCase() === wanted)
  if (named.length > 1) throw new ToolRefusal(`${named.length} rooms on that floor are named so: crop by id, one of ${named.map((r) => q(r.id)).join(', ')}.`)
  const room = named[0] && parts.find((p) => p.id === named[0]!.id)
  if (room) return room
  refuseLeftOutRoom(loaded, named[0]?.id ?? crop, 'crop')
  const onFloor = plan.rooms.filter((r) => floorOf(r) === floor)
  const rooms = nearestList(crop, onFloor.map((r) => ({ id: r.id, note: r.name.trim() === '' ? ' (no name)' : ` (${q(r.name)})` })))
  throw new ToolRefusal(`crop names no room, door, window or wall drawn on floor ${q(floor)}, nor a room's name. Its nearest rooms: ${onFloor.length === 0 ? 'none' : rooms}.`)
}

/** The rooms, doors and windows of one floor, by id, as the check view draws them. */
function idsOnFloor(plan: FloorPlan, floor: string): string[] {
  const walls = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  return [
    ...plan.rooms.filter((r) => floorOf(r) === floor).map((r) => r.id),
    ...plan.openings.filter((o) => walls.get(o.wall) === floor).map((o) => o.id),
  ]
}

/**
 * What comes with the check view (VEW-2): the rooms with their areas and what each opening
 * joins, by id (the agent's description), then the counts on the floor and the drawing's
 * problems. Ids are those drawn on the picture.
 */
function checkViewText(loaded: LoadedPlan, floor: string): string[] {
  const { plan } = loaded
  const walls = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  const openings = plan.openings.filter((o) => walls.get(o.wall) === floor)
  const rooms = plan.rooms.filter((r) => floorOf(r) === floor).length
  const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`
  const doors = openings.filter((o) => o.type === 'door').length
  const windows = openings.filter((o) => o.type === 'window').length
  const lines = [
    'On the picture every room carries its id in brackets after its name, and every door, window and opening its id beside it.',
    `On floor ${q(floor)}: ${count(rooms, 'room')}, ${count(doors, 'door')}, ${count(windows, 'window')} and ${count(openings.length - doors - windows, 'doorless opening')}.`,
    describePlan(loaded, 'rooms', 'agent').trimEnd(),
  ]
  const issues = loaded.issues
  lines.push(`Problems in the drawing, on every floor: ${issues.length === 0 ? 'none found' : issues.length}.`)
  for (const issue of issues.slice(0, 8)) lines.push(`  ${issue.severity === 'error' ? 'left out' : 'worth a look'}, ${issue.entity} ${q(issue.id)}: ${issue.message}`)
  if (issues.length > 8) lines.push(`  … ${issues.length - 8} more: grid_check lists them all.`)
  return lines
}

/**
 * CNT-9: what a plan picture picks out: the parts `highlight` names, in one colour, and the parts
 * of the floor coloured by a field or a fact (`colour`), one colour per value. Ids not on the floor
 * drawn are counted, never drawn; an id the plan does not have is refused with the nearest one.
 */
function paintOf(survey: Survey, floor: string, by: string | undefined, highlight: readonly string[] | undefined, stated: FloorPlan = survey.plan): {
  paint: Map<string, string>
  key: { colour: string; words: string }[]
  groups: { colour: string; value: Value; words: string; ids: string[] }[]
  lines: string[]
} | null {
  if (by === undefined && highlight === undefined) return null
  return asked(() => {
    const ask = askPlan(survey)
    const onFloor = ask.parts.filter((p) => p.floor === floor && p.kind !== 'floor')
    const paint = new Map<string, string>()
    const key: { colour: string; words: string }[] = []
    const groups: { colour: string; value: Value; words: string; ids: string[] }[] = []
    const lines: string[] = []
    if (by !== undefined) {
      const field = fieldOf(ask, by, 'colour')
      const carrying = onFloor.filter((p) => {
        const value = ask.value(p, field)
        return value !== null && !(Array.isArray(value) && value.length === 0)
      })
      const found = groupParts(ask, carrying, field, [])
      // One colour per value; past the palette, the last colour stands for all the others.
      const own = found.length <= GROUP_COLOURS.length ? found.length : GROUP_COLOURS.length - 1
      found.forEach((group, i) => {
        const colour = GROUP_COLOURS[Math.min(i, own)]!
        for (const id of group.ids) paint.set(id, colour)
        groups.push({ colour, value: group.value, words: valueWords(group.value), ids: [...group.ids] })
        if (i < own) key.push({ colour, words: `${fieldName(field)}: ${valueWords(group.value)}` })
      })
      if (found.length > own) key.push({ colour: GROUP_COLOURS[own]!, words: `${fieldName(field)}: ${found.length - own} other values` })
      lines.push(found.length === 0
        ? `No part on this floor carries ${q(fieldName(field))}: nothing is coloured.`
        : `Coloured by ${q(fieldName(field))}: ${groups.map((g) => `${q(g.words)} ${g.ids.length} (${g.colour})`).join(', ')}. Parts with no value keep their usual look.`)
    }
    if (highlight !== undefined) {
      const known = new Map(ask.parts.filter((p) => p.kind !== 'floor').map((p) => [p.id, p] as const))
      // VEW-14: a part to be demolished is drawn, so it can be picked out; the survey reads the plan after the work.
      const wallFloor = new Map(stated.walls.map((w) => [w.id, floorOf(w)] as const))
      for (const room of stated.rooms) if (!known.has(room.id)) known.set(room.id, { kind: 'room', id: room.id, floor: floorOf(room), facts: {} })
      for (const wall of stated.walls) if (!known.has(wall.id)) known.set(wall.id, { kind: 'wall', id: wall.id, floor: floorOf(wall), facts: {} })
      for (const opening of stated.openings) if (!known.has(opening.id)) known.set(opening.id, { kind: opening.type, id: opening.id, floor: wallFloor.get(opening.wall) ?? 'ground', facts: {} })
      const missing = highlight.filter((id) => !known.has(id))
      if (missing.length > 0) {
        const near = likelyId(missing[0]!, [...known.keys()])
        throw new ToolRefusal(`highlight names ${missing.length === 1 ? 'an id' : `${missing.length} ids`} the plan has no room, wall, door, window or opening for.${near === null ? '' : ` The nearest known id is ${q(near)}.`}`)
      }
      const here = highlight.filter((id) => known.get(id)!.floor === floor)
      for (const id of here) paint.set(id, HIGHLIGHT_COLOUR)
      key.push({ colour: HIGHLIGHT_COLOUR, words: 'Picked out' })
      groups.push({ colour: HIGHLIGHT_COLOUR, value: null, words: 'picked out', ids: here })
      const elsewhere = new Map<string, number>()
      for (const id of highlight) if (known.get(id)!.floor !== floor) elsewhere.set(known.get(id)!.floor, (elsewhere.get(known.get(id)!.floor) ?? 0) + 1)
      lines.push(`Picked out ${here.length} of the ${highlight.length} asked for on this floor${elsewhere.size === 0 ? '' : `; the others are on ${[...elsewhere].map(([f, n]) => `floor ${q(f)} (${n})`).join(', ')}`}.`)
    }
    return { paint, key, groups, lines }
  })
}

/**
 * VEW-70: on a plan of several floors, which of the parts to be demolished are on the floor drawn,
 * by id, and how many are on each other floor: a wall and a room by their own floor, an opening by
 * its wall's. `grid_check`'s count is for the whole plan.
 */
function demolishedHere(plan: FloorPlan, floor: string): string {
  const gone = idsInPhase(plan, 'demolished')
  const wallFloor = new Map(plan.walls.map((w) => [w.id, floorOf(w)] as const))
  const floors = new Map<string, string[]>()
  const put = (id: string, on: string): void => {
    if (!gone.has(id)) return
    gone.delete(id)
    floors.set(on, [...(floors.get(on) ?? []), id])
  }
  for (const wall of plan.walls) put(wall.id, floorOf(wall))
  for (const opening of plan.openings) put(opening.id, wallFloor.get(opening.wall) ?? 'ground')
  for (const room of plan.rooms) put(room.id, floorOf(room))
  const ids = floors.get(floor) ?? []
  const total = [...floors.values()].reduce((sum, list) => sum + list.length, 0)
  const shown = ids.slice(0, 12).map((id) => name(id))
  const parts = joined(ids.length > 12 ? [...shown, said('issue.part.more', { n: num(String(ids.length - 12)) })] : shown, 'join.comma')
  const elsewhere = joined([...floors].filter(([on]) => on !== floor).map(([on, list]) => said('view.phases.elsewhere', { floor: name(on), count: num(String(list.length)) })), 'join.comma')
  const counts = { total: num(String(total)), here: num(String(ids.length)), parts, elsewhere }
  return english(said(ids.length === total ? 'view.phases.here.all' : ids.length === 0 ? 'view.phases.here.none' : 'view.phases.here.some', counts))
}

/** LVL-9: a cut line as grid_view takes it: two points of the plan. */
interface CutArg {
  readonly from: [number, number]
  readonly to: [number, number]
}

/** LVL-9: reads cut, refusing a shape it does not take by name. */
function cutArg(value: unknown): CutArg {
  const given = value as Record<string, unknown>
  const extra = Object.keys(given).filter((key) => key !== 'from' && key !== 'to')
  if (extra.length > 0) throw new ToolRefusal(`cut takes from and to, not ${extra.length > 3 ? 'others' : extra.map((key) => (key.length <= 64 && /^[A-Za-z0-9._-]+$/.test(key) ? q(key) : 'others')).join(', ')}.`)
  const point = (name: 'from' | 'to'): [number, number] => {
    const p = given[name]
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new ToolRefusal(`cut.${name} takes a point as [x, y] in metres, for example [4.9, -2].`)
    return [p[0] as number, p[1] as number]
  }
  return { from: point('from'), to: point('to') }
}

/** VEW-30: the point kind=eye stands on, as [x, y]. */
function standAtArg(value: unknown): [number, number] {
  const given = value as Record<string, unknown>
  const extra = Object.keys(given).filter((key) => key !== 'x' && key !== 'y')
  if (extra.length > 0) throw new ToolRefusal(`stand_at takes x and y, not ${extra.length > 3 ? 'others' : extra.map((key) => (key.length <= 64 && /^[A-Za-z0-9._-]+$/.test(key) ? q(key) : 'others')).join(', ')}.`)
  const { x, y } = given
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) throw new ToolRefusal('stand_at takes x and y as numbers in metres, for example { x: 3.2, y: 4.1 }.')
  return [x, y]
}

/** A refusal a command option gives, as the tool's own, its option names as the tool's arguments. */
function asToolArg<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    if (error instanceof UsageError) throw new ToolRefusal(error.message.replace(/--(marks|toward|section)\b/g, '$1'))
    throw error
  }
}

/** LVL-9: what the marks on a plan say, in a line. */
function marksText(marks: DrawingMarksAsked): string {
  const said: string[] = []
  if (marks.section != null) said.push(`the section's cut line from (${m(marks.section.from.x)}, ${m(marks.section.from.y)}) to (${m(marks.section.to.x)}, ${m(marks.section.to.y)}) as a chain line named A, its arrows looking to the ${marks.section.toward}`)
  if (marks.elevations === true) said.push('an elevation mark outside each main side of the building, its arrow at the side it shows, named by the way that side faces; kind=facade draws each, with side the side of the drawing it is seen from (north at the top)')
  if (marks.levels === true) said.push('each room\'s floor level under its name, in metres from the ground floor\'s floor level')
  if (marks.schedule != null) said.push('each room\'s and opening\'s mark in the schedules, in a box: a room\'s number over its name, as grid_schedule of=rooms numbers it, and each door\'s, window\'s and doorless opening\'s D1, W1 or O1 beside it, as of=openings, of=doors and of=windows list it')
  return `Marked on the plan: ${said.join('; ')}.`
}

/**
 * LVL-8: grid_view's facade: one side of the drawing in elevation, with what it shows in words and
 * as data (the side, the walls and openings seen, each floor's level, the ground).
 */
function facadeRoofLine(plan: FloorPlan): string {
  const stated = statedRoofWords(plan, (plan.floors ?? []).map((f) => f.id))
  return stated === '' ? 'The plan states no roof: the top of each part with nothing above is drawn flat.' : `The roof the plan states is drawn as it is: ${stated}.`
}

async function facadeAnswer(plan: FloorPlan, args: Record<string, unknown>, language: Language = 'en', display?: Display): Promise<ViewAnswer> {
  if (args['side'] === undefined) throw new ToolRefusal(`kind=facade needs side: the side of the drawing to draw, one of ${FACADE_SIDES.join(', ')} (north is the top of the drawing).`)
  const side = args['side'] as FacadeSide
  const asked = (args['look'] as LookName | undefined) ?? 'working'
  const look = asked === pictureLook(asked) ? asked : `${pictureLook(asked)} (asked as ${asked})`
  const { facadeView } = await import('../draw/views')
  const view = await facadeView(plan, { side, look: asked, language, ...(display ? { display } : {}) })
  const { facade } = view
  const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`
  const units = display ?? displayFor(undefined, undefined, plan, language)
  const levels = facade.levels.map((l) => `${q(l.name)} at ${levelText(l.level, units)}`).join(', ')
  const facing = facade.compass === null ? 'The plan states no north, so this is the side of the drawing only.' : `By the north the plan states, this side faces ${facade.compass.faces} (bearing ${Math.round(facade.compass.bearing)}°).`
  const ground = facade.ground.stated ? `The ground line is at ${levelText(facade.ground.level, units)}, the level the site states.` : "The site states no ground level: the ground line is drawn at the ground floor's floor level. " + english(said('site.ground.how'))
  const lines = facade.extent === null
    ? [`Nothing of the plan faces ${side}: no outside face of any floor turns that way. ${facing}`]
    : [
        `Facade of the ${side} side of the drawing (north is its top), ${look}: ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px. ${facing}`,
        `It shows ${count(facade.walls.length, 'wall')} and ${count(facade.openings.length, 'opening')} (doors and windows), and ${count(facade.levels.length, 'floor')}: ${levels}. ${ground}`,
        facadeRoofLine(plan),
        'The ground is the heaviest line, the outline against the sky the next; faces set back from the front are drawn lighter. Look at the picture before you describe it.',
      ]
  const data = {
    kind: 'facade',
    floor: null,
    camera: null,
    view: null,
    pxPerMetre: view.pxPerMetre,
    sills: [],
    ids: [...facade.openings],
    boxes: [],
    facade: {
      side,
      compass: facade.compass,
      ground: facade.ground,
      levels: facade.levels,
      walls: facade.walls,
      openings: facade.openings,
      extent: facade.extent,
    },
  }
  return { text: lines.join('\n'), data, image: { data: view.png, mimeType: 'image/png' }, picture: { svg: view.svg, bounds: null } }
}

/** VEW-62: what a view hands back besides the answer: its SVG, made when asked for, and the plan's metres the picture covers. */
interface ViewAnswer extends Answer {
  readonly image: AnswerImage
  readonly picture?: { readonly svg?: () => string; readonly bounds: WorldBounds | null }
}

const viewTool: GridTool = {
  name: 'grid_view',
  title: 'Draw a view of the plan',
  hint: 'write-file',
  description:
    'Use this when the person asks to see the plan: "can I see it", a floor plan, a 3D view from the garden side or from above, the front of the house as an elevation, a section through the stair, "the living room from the south-west, from higher up", "a bit lower and more from the left", a view saved by name, "stand me in the kitchen looking at the garden", "can I see out sitting down", or a black and white drawing. '
    + 'kind=plan draws one floor from above with its sizes; kind=facade draws one side of the drawing (side: north, east, south or west; north is the top of the drawing) in elevation, every floor at its level, its doors and windows, the ground line heaviest and faces set back lighter; kind=3d draws the model through a camera: from a side or corner of the drawing (from), or a compass bearing from the plan\'s stated north (bearing), with tilt, distance, eye_height, lens, a room to point at and a floor cut away; kind=eye stands in a room, on its middle line or at stand_at, with the eye eye_height above that room\'s own floor, and looks level toward an opening or a direction, and lists the window sills against that eye height; kind=section cuts every floor along a line (cut) and looks to one side of it (toward), with the levels, the room heights, and what Grid takes that the plan does not state dashed and listed. '
    + 'Every 3d and eye picture comes back with its camera record (camera: target, bearing, tilt, distance, eye height, lens in mm on a 36 × 24 mm sensor, cut, floors, where it stands, and position, direction, up and field of view as the BCF format writes them). To change the view, send camera back with turn, tilt_by or changed numbers; view calls up one saved with grid_save_view. '
    + 'It returns the picture with the numbers that made it; look at the picture before you describe it. It changes nothing in the plan. It writes no file unless you pass out: a .png, .svg or .pdf name, written inside the project (a bare name goes into the exports folder beside the plan), with the path in the answer and, beside it, a .view.json with the picture\'s size, its pixels per metre and, for a plan, the plan\'s metres it covers; svg is not made for 3d or eye. Do not use for a file to hand on to another program (grid_export), to move the person\'s live preview (grid_preview) or to save a view (grid_save_view). The 3d model and the facade draw the roof each floor of the plan states (flat, mono-pitch, gable or hip, with its pitch), so a pitched roof the plan holds is drawn pitched; only where the plan states no roof is a flat one taken over the part with nothing above. The 3d model shows its roof from outside, or when a floor states one; a floor cut away is drawn open, and roof shows or hides it. It has no furniture, glass or door leaves. The drawing\'s figures are in the units argument, else the plan\'s display (how its person reads lengths), else metres.',
  args: {
    units: UNITS_ARG,
    decimal: DECIMAL_ARG,
    plan: PLAN_ARG,
    out: { type: 'string', maxLength: PATH_MAX, description: 'A .png, .svg or .pdf file to write the picture to, inside the project folder: a bare name goes into the exports folder beside the plan. A .view.json is written beside it with its size, pixels per metre and, for a plan, the plan\'s metres it covers. svg is not made for 3d or eye. Nothing is written when left out.', examples: ['plan-ground.png', 'exports/south.svg'] },
    kind: { type: 'string', required: true, enum: ['plan', 'facade', '3d', 'eye', 'section'], description: 'plan, facade, 3d, eye or section.', examples: ['plan', 'facade', 'section'] },
    side: { type: 'string', enum: FACADE_SIDES, description: 'For facade: the side of the drawing whose facade to draw: north (its top), east, south or west. Required for facade.', examples: ['south', 'east'] },
    floor: { ...FLOOR_ARG, description: 'For plan: the floor to draw, the lowest when left out. For 3d: that floor cut away, the whole building when left out (with room, on a plan of several floors, that room\'s floor).' },
    from: { type: 'string', enum: SIDES, description: 'For 3d: the side or corner of the drawing the camera stands on, or above (north is the top of the drawing here). south-east when left out. Not with bearing.', examples: ['south', 'above'] },
    bearing: { type: 'number', description: 'For 3d: the compass bearing from what the camera is pointed at to the camera, in degrees clockwise from the north the plan states, or from the top of the drawing when it states none (the record says which). Not with from.', examples: [135, 200], minimum: 0, maximum: 360 },
    tilt: { type: 'number', description: 'For 3d: degrees the camera looks down at what it is pointed at; below 0 it looks up. 30 when left out (80 from above).', examples: [30, 10], minimum: -limit('cameraTilt'), maximum: limit('cameraTilt') },
    distance: { type: 'number', length: true, description: 'For 3d: metres from the camera to what it is pointed at. Left out (and with no camera sent back), the camera stands as far as fit needs. Not with fit.', examples: [12, 30], minimum: limit('cameraClosest'), maximum: 100000 },
    lens: { type: 'number', description: `For 3d: the focal length in millimetres on a 36 × 24 mm sensor: 18 is wide, 50 normal, 85 long. 28.97 when left out (45° tall, as the app opens).`, examples: [24, 50], minimum: limit('lensShortest'), maximum: limit('lensLongest') },
    fit: { type: 'string', enum: CAMERA_FITS, description: 'For 3d: what fills the frame: building (every floor drawn, up to the floor cut away) or room (the room pointed at). The camera is pointed at its middle and stands as far as its bearing, tilt and lens need; a tall building is taken in a portrait frame. room when room is named, else building, when no camera is sent back and no distance is named. With camera or view it frames that camera again. Not with distance.', examples: ['building', 'room'] },
    camera: CAMERA_ARG,
    view: { type: 'string', maxLength: 120, description: 'For 3d: a view saved with the plan (grid_save_view), by name, to call up. Its camera comes back the same, digit for digit, while the plan keeps what it was taken of.', examples: ['Garden corner'] },
    turn: { type: 'number', description: 'For 3d: degrees to walk the camera round what it is pointed at, from camera, view or the default: above 0 to the camera\'s left, below 0 to its right.', examples: [20, -15], minimum: -360, maximum: 360 },
    roof: { type: 'string', enum: ['show', 'hide'], description: 'For 3d: show or hide the roof. Left out, it is shown from outside or when a floor states its roof, and hidden with a floor cut away.', examples: ['hide', 'show'] },
    tilt_by: { type: 'number', description: 'For 3d: degrees to add to the tilt: below 0 the camera comes lower and looks less steeply down, above 0 higher.', examples: [-10, 15], minimum: -178, maximum: 178 },
    room: { type: 'string', id: true, description: 'For eye: the room to stand in. For 3d: the room to point the camera at, the middle of its floor half way up its storey.', examples: ['kitchen', 'living'] },
    toward: { type: 'string', maxLength: 64, description: 'For eye: an opening id to look at, or a direction (north, north-east, east, south-east, south, south-west, west, north-west). The room\'s first window when left out. For section, and for plan with marks section: left or right, the side of the cut the section looks toward, walking from its from point to its to point; left when left out.', examples: ['back-door', 'north', 'left'] },
    eye_height: { type: 'number', length: true, description: 'For eye: metres above the room\'s own floor (its storey and its floor offset), 0.3 to 3; 1.6 standing when left out; about 1.2 seated. For 3d: metres from the floor of the room pointed at (or the floor cut away, or the ground floor) up to the camera: with a tilt the camera stands back until it is that high; level, or with a distance, the point it looks at moves to meet it.', examples: [1.6, 1.2], minimum: 0, maximum: 10000 },
    look: { type: 'string', enum: LOOKS, description: 'For plan, facade and section: working (the default for a plan and a facade: clear labels and strong contrast), technical for black on white as on a sheet, with lines in millimetres at the scale and doors with no stated swing marked "?" (the default for a section, as for a drawing file). A picture is always on light paper, so dark, the app\'s screen theme, draws working. light and mono are older names for working and technical.', examples: ['working', 'technical'] },
    dimensions: { type: 'boolean', description: 'For plan: false to leave the sizes off, for a clean drawing. true when left out.', examples: [true, false] },
    tile: { type: 'number', description: 'For plan: on a floor far longer than it is wide, which the answer says is drawn in pieces, the piece to draw, from 1 at its left (or top) end; each overlaps the next and is drawn large enough to read. The whole floor when left out. Not with crop.', examples: [1, 2], minimum: 1, maximum: 1000 },
    crop: { type: 'string', maxLength: 120, description: 'For plan: frame just this part: a room, door, window or wall id, or a room\'s name. The whole floor when left out.', examples: ['kitchen', 'front-door'] },
    ids: { type: 'boolean', description: 'For plan: true to draw the id of every room, door and window on the picture, as the plan file holds them, and to list them in the text with the areas, what each door joins, the counts and the drawing\'s problems. false when left out.', examples: [true] },
    hide: { type: 'string', maxLength: 120, description: 'For plan: parts to leave off, joined by commas: title, key, notes, sketch, dimensions, areas, swings, warnings, above (the dashed outline of the floor above). Everything is drawn when left out.', examples: ['areas,swings', 'sketch'] },
    colour: { type: 'string', maxLength: 120, description: 'For plan: use fills each room by its use and lists the uses in the key; any other field or fact, by name as grid_fields lists it (department, fire rating), colours each room, wall, door and window by its value, with a key: grid_count\'s view passes it. One fill for every room when left out.', examples: ['use', 'department', 'fire rating'] },
    highlight: { type: 'array', description: 'For plan: rooms, walls, doors, windows or openings to pick out, by id, in one colour with a key: grid_find\'s view passes its ids here. Nothing picked out when left out.', examples: [['d1', 'd4'], ['office-2']], items: { id: true }, minItems: 1, maxItems: 2000 },
    key: { type: 'boolean', description: 'For plan: true to add a key under the drawing, even where the plan asks for none.', examples: [true] },
    language: LANGUAGE_ARG,
    stand_at: {
      type: 'object',
      description: 'For eye: the point to stand on, x and y in metres on the plan; it must be on the room\'s floor. On the room\'s middle line, back from the middle away from what is looked at, when left out.',
      examples: [{ x: 3.2, y: 4.1 }],
      schema: objectSchema({ x: { type: 'number' }, y: { type: 'number' } }),
      read: (value) => standAtArg(value),
    },
    cut: {
      type: 'object',
      description: 'For section, and for plan with marks section: the line to cut along, from one point of the plan to another, in metres. Every floor is cut along it.',
      examples: [{ from: [4.9, -2], to: [4.9, 13] }, { from: [0, 2.5], to: [9, 2.5] }],
      schema: objectSchema({ from: { type: 'array', items: NUMBER, minItems: 2, maxItems: 2 }, to: { type: 'array', items: NUMBER, minItems: 2, maxItems: 2 } }),
      read: (value) => cutArg(value),
    },
    marks: { type: 'array', description: 'For plan: marks for the plan\'s other drawings: levels (each room\'s floor level), elevations (where each side of the building is seen from), section (the line of cut and the way toward looks), schedule (each room\'s and opening\'s mark in the schedules, tied to its row in grid_schedule). None when left out.', examples: [['levels', 'elevations'], ['section'], ['schedule']], items: { enum: MARK_WORDS }, minItems: 1, maxItems: 4 },
  },
  outputSchema: objectSchema({ kind: STRING, floor: { type: ['string', 'null'] }, camera: { ...CAMERA_SCHEMA, type: ['object', 'null'] }, view: NULLABLE_STRING, pxPerMetre: NULLABLE_NUMBER, sills: { type: 'array' }, ids: listSchema(STRING), boxes: { type: 'array' }, painted: { type: 'array' }, facade: { type: 'object' }, section: { type: 'object' }, written: NULLABLE_STRING, record: NULLABLE_STRING }, ['kind', 'floor', 'camera', 'view', 'pxPerMetre', 'sills', 'ids', 'boxes']),
  async run(args, context) {
    const out = args['out'] as string | undefined
    // VEW-62: the name is checked before anything is drawn.
    const ext = out === undefined ? null : asToolArg(() => pictureExtension(out))
    if (ext === '.svg' && (args['kind'] === '3d' || args['kind'] === 'eye')) throw new ToolRefusal(`kind=${args['kind'] as string} is a picture of pixels, so it is not made as an svg: name a .png or .pdf file.`)
    const { picture, ...answer } = await drawView(args, context)
    if (out === undefined || ext === null) return answer
    const { project, file } = readPlan(context, args['plan'])
    const size = pngSize(answer.image.data)
    const data = answer.data
    const px = (data['pxPerMetre'] as number | null) ?? null
    const bounds = picture?.bounds ?? null
    const body = ext === '.png' ? answer.image.data : ext === '.pdf' ? await pngToPdf(answer.image.data, out) : picture?.svg?.()
    if (body === undefined) throw new ToolRefusal('That picture is not made as an svg: name a .png or .pdf file.')
    let done
    try {
      done = writePicture(project, file, out, body, { kind: data['kind'] as string, floor: (data['floor'] as string | null) ?? null, pxPerMetre: px, bounds, ...size }, version)
    } catch (error) {
      if (error instanceof PictureOutRefused || error instanceof PathRefused) throw new ToolRefusal(error.message)
      throw asRefusal(error)
    }
    const where = bounds === null ? '' : ` It covers x ${bounds.minX.toFixed(2)} to ${bounds.maxX.toFixed(2)} and y ${bounds.minY.toFixed(2)} to ${bounds.maxY.toFixed(2)} m of the plan.`
    return { ...answer, text: `${answer.text}\nWrote ${quoted(done.picture)} (${size.width} × ${size.height} px) and ${quoted(done.record)} in the project folder.${where}`, data: { ...data, written: done.picture, record: done.record } }
  },
}

async function drawView(args: Record<string, unknown>, context: ToolContext): Promise<ViewAnswer> {
  {
    const { project, loaded: read } = readPlan(context, args['plan'])
    // MSG-11: the drawing's own words in the language asked for, else the plan's own. MSG-22: the
    // floor the plan names in no list, named in it.
    const language = await languageFor(askedLanguage(args['language'], 'language'), read.plan)
    const loaded = spokenPlan(read, language)
    const survey = surveyPlan(loaded.plan)
    const floor = floorArg(loaded.plan, args['floor'])
    const kind = args['kind'] as 'plan' | 'facade' | '3d' | 'eye' | 'section'
    const allowed: Record<string, readonly string[]> = {
      plan: ['floor', 'look', 'dimensions', 'ids', 'crop', 'tile', 'hide', 'colour', 'key', 'highlight', 'marks', 'cut', 'toward'],
      facade: ['side', 'look'],
      '3d': ['floor', 'from', 'bearing', 'tilt', 'distance', 'eye_height', 'lens', 'room', 'camera', 'view', 'turn', 'tilt_by', 'roof', 'fit'],
      eye: ['room', 'toward', 'eye_height', 'stand_at'],
      section: ['cut', 'toward', 'look'],
    }
    const stray = ['floor', 'from', 'side', 'bearing', 'tilt', 'distance', 'lens', 'camera', 'view', 'turn', 'tilt_by', 'roof', 'room', 'toward', 'eye_height', 'stand_at', 'look', 'dimensions', 'ids', 'crop', 'hide', 'colour', 'key', 'highlight', 'marks', 'cut', 'fit', 'tile'].filter((key) => args[key] !== undefined && !allowed[kind]!.includes(key))
    if (stray.length > 0) throw new ToolRefusal(`kind=${kind} takes ${allowed[kind]!.join(', ')}, not ${stray.join(', ')}.`)
    const plan = survey.plan
    const inTongue = language === 'en' ? {} : { language }
    // VEW-20: a section or a facade writes its levels in the units asked for, else the plan's display.
    const levelDisplay = args['units'] === undefined && args['decimal'] === undefined ? undefined : displayFor(args['units'], args['decimal'], plan, language)
    if (kind === 'facade') return facadeAnswer(plan, args, language, levelDisplay)
    if (kind === 'section') {
      const cut = args['cut'] as CutArg | undefined
      if (cut === undefined) throw new ToolRefusal('kind=section needs cut: the line to cut along, as {"from": [x, y], "to": [x, y]} in metres.')
      const line = asToolArg(() => sectionLineOf(cut.from, cut.to, towardOf(args['toward'] as string | undefined, 'toward'), 'cut'))
      // Loaded only for a section: the drawing and the words that go with it.
      const { sectionAnswer } = await import('./sectionAnswer')
      return sectionAnswer(plan, line, (args['look'] as LookName | undefined) ?? 'technical', language, levelDisplay)
    }
    // LVL-9: the marks for the plan's other drawings; cut and toward only for a section's line on it.
    const markWords = args['marks'] === undefined ? null : asToolArg(() => readMarks(args['marks'] as string[], 'marks'))
    if (kind === 'plan') {
      if (!markWords?.has('section') && (args['cut'] !== undefined || args['toward'] !== undefined)) throw new ToolRefusal('kind=plan takes cut and toward only with marks section, to draw a section\'s line on the plan; kind=section draws the section itself.')
      if (markWords?.has('section') && args['cut'] === undefined) throw new ToolRefusal('marks section draws the line of a section on the plan: pass cut with the line.')
    }
    const marksAsk = markWords === null
      ? undefined
      : marksAsked(markWords, args['cut'] === undefined ? null : asToolArg(() => sectionLineOf((args['cut'] as CutArg).from, (args['cut'] as CutArg).to, towardOf(args['toward'] as string | undefined, 'toward'), 'cut')))
    // ARE-15: the schedules' marks, by id, from the same rows as grid_schedule.
    const marksOnPlan = marksAsk !== undefined && markWords?.has('schedule') === true ? { ...marksAsk, schedule: scheduleMarkLabels(survey) } : marksAsk
    if (kind === 'plan') {
      const asked = (args['look'] as LookName | undefined) ?? 'working'
      const look = asked === pictureLook(asked) ? asked : `${pictureLook(asked)} (asked as ${asked})`
      const { planView } = await import('../draw/views')
      const withIds = args['ids'] === true
      const shown = floor ?? survey.facts.floors[0]?.id ?? 'ground'
      // VEW-14: drawn as stated, as grid draw draws it: parts to be demolished are in the picture.
      const stated = loaded.plan
      const crop = args['crop'] === undefined ? null : cropPart(stated, shown, args['crop'] as string, loaded)
      // What went wrong, numbered as grid_check numbers it, marked on the drawing (MSG-8).
      // VEW-15: from the file's text and its base, as grid_check reads them, so the fields the reading adds are no notes.
      const faults = inspectPlan(loaded.text ?? plan, { ...inTongue, ...(plan.display?.decimal ? { decimal: plan.display.decimal } : {}), ...(loaded.base === undefined ? {} : { base: loaded.base.plan }) }).lines
      // CMD-45: a plan with nothing in it is refused, not drawn as a blank page.
      if (nothingToDraw(stated, faults)) throw new ToolRefusal(say('en', 'plan.notAPlan.nothingToDraw', { file: project.relative(read.file) }))
      const display = args['units'] === undefined && args['decimal'] === undefined ? undefined : displayFor(args['units'], args['decimal'], plan, language)
      // SHT-7: what the picture shows, read as grid draw reads --hide, --colour and --key.
      let shownParts
      const colour = args['colour'] as string | undefined
      try {
        shownParts = drawShowOf({ hide: args['hide'] as string | undefined, colour: colour === 'use' ? 'use' : undefined, key: args['key'] === true })
      } catch (error) {
        if (error instanceof UsageError) throw new ToolRefusal(error.message.replace(/--(hide|colour|key)\b/g, '$1'))
        throw error
      }
      // CNT-9: parts picked out by id, or coloured by a field or fact, from grid_find's and grid_count's view.
      const painted = paintOf(survey, shown, colour === 'use' ? undefined : colour, args['highlight'] as string[] | undefined, stated)
      if (painted !== null) shownParts = { ...shownParts, show: { ...shownParts.show, paint: painted.paint, paintKey: painted.key } }
      const dimensions = args['dimensions'] !== false && shownParts.showDimensions
      // HND-10: the plan's trace image under the floor drawn, read from the project folder.
      const trace = readTrace(project, stated, shown, language)
      // VEW-26: a floor far longer than it is wide is drawn in pieces, one at a time.
      const tiling = tilesOf(stated, shown, dimensions, crop !== null, args['tile'] as number | undefined)
      const frame = crop ? cropFrame(crop) : tiling.frame
      const view = await planView(stated, { floor: shown, look: asked, dimensions, ids: withIds, faults, show: shownParts.show, ...inTongue, ...(display ? { display } : {}), ...(frame ? { frame } : {}), ...(marksOnPlan ? { marks: marksOnPlan } : {}), ...(trace.picture ? { trace: trace.picture } : {}) })
      const work = planHasPhases(stated) ? phaseCounts(stated) : null
      const lines = [`Plan of floor ${q(shown)}${crop ? `, cropped to ${crop.kind} ${q(crop.id)}` : ''}${tiling.piece === null ? '' : `, piece ${tiling.piece} of ${tiling.tiles.length} along its length`}, ${look}${args['dimensions'] === false ? ', without sizes' : ', with inside sizes'}: ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px. ${plan.north === undefined ? 'North is the top of the drawing; the plan holds no real north.' : `The north arrow in its top-right corner points to the north the plan states, ${northWords(wrapDegrees(plan.north))}; the sides named in other answers are the drawing's, north at the top.`} Look at the picture before you describe it.`]
      lines.push(...tiling.lines)
      const ids = withIds ? idsOnFloor(stated, shown) : []
      const undecided = view.undecidedDoors ?? []
      if (undecided.length > 0) {
        lines.push(`Drawn with a dashed line and "?" as undecided, ${undecided.length === 1 ? 'a door' : `${undecided.length} doors`} with no stated swing: ${undecided.map(q).join(', ')}. Ask the person which side each is hinged on and which way it opens, then set its hinge and swing.`)
      }
      lines.push('Each part\'s box on the picture, in pixels from its top-left corner, is in boxes: id, kind and x, y, width, height.')
      // CNT-45: the fixtures and furniture drawn on the floor, named, so none is taken for gone.
      const onFloor = (stated.items ?? []).filter((item) => floorOf(item) === shown)
      if (onFloor.length > 0) lines.push(`Fixtures and furniture drawn: ${onFloor.length} (${onFloor.slice(0, 12).map((item) => `${itemKindWord(item.kind)} ${q(item.id)}`).join(', ')}${onFloor.length > 12 ? ` and ${onFloor.length - 12} more` : ''}); their boxes are in boxes, kind fixture or furniture. grid_find kind=fixture or kind=furniture lists them with their rooms.`)
      if (trace.line !== null) lines.push(trace.line)
      if (work !== null) {
        const gone = work.demolished
        const total = gone.walls + gone.openings + gone.rooms
        lines.push(english(said('view.phases.work', { total: num(String(total)), walls: num(String(gone.walls)), openings: num(String(gone.openings)), rooms: num(String(gone.rooms)), new: num(String(work.new.walls + work.new.openings + work.new.rooms)) })))
        const here = total > 0 && planFloors(stated).length > 1 ? demolishedHere(stated, shown) : null
        if (here !== null) lines.push(here)
      }
      const marked = faults.filter((line) => line.floor === null || line.floor === shown).length
      if (marked > 0) lines.push(`${marked} of grid_check's lines are about this floor: each has its grid_check number on the part it is about, and all are listed under the drawing. A room that cannot be drawn is the dashed box round its walls.`)
      if (withIds) lines.push(...checkViewText(loaded, shown))
      if (painted !== null) lines.push(...painted.lines)
      if (marksOnPlan !== undefined) lines.push(marksText(marksOnPlan))
      return {
        text: lines.join('\n'),
        data: { kind, floor: shown, camera: null, view: null, pxPerMetre: view.pxPerMetre, sills: [], ids, boxes: view.boxes ?? [], ...(painted === null ? {} : { painted: painted.groups }) },
        image: { data: view.png, mimeType: 'image/png' },
        picture: { ...(view.svg === undefined ? {} : { svg: view.svg }), bounds: view.bounds ?? null },
      }
    }
    if (kind === '3d') {
      refuseLeftOutRoom(loaded, args['room'], 'room')
      if (args['camera'] !== undefined && args['view'] !== undefined) throw new ToolRefusal('Pass camera or view, not both: each is a camera to start from.')
      const lens = args['lens'] as number | undefined
      if (lens !== undefined && lensProblem(lens) !== null) throw new ToolRefusal(`lens ${lensProblem(lens)}.`)
      let viewName: string | null = null
      let start = args['camera'] as CameraAsk['start'] | undefined
      if (args['view'] !== undefined) {
        const saved = findView(plan.views, args['view'] as string)
        if (saved === null) {
          const names = (plan.views ?? []).slice(0, 20).map((v) => q(v.name))
          throw new ToolRefusal(`The plan has no view saved under that name. ${names.length === 0 ? 'It has no saved views: grid_save_view saves one.' : `Its views: ${names.join(', ')}.`}`)
        }
        viewName = saved.name
        start = viewSetting(saved)
      }
      if (start !== undefined && start.target.room !== null && !plan.rooms.some((r) => r.id === start!.target.room)) start = { ...start, target: { ...start.target, room: null } }
      const ask: CameraAsk = {
        ...(start !== undefined ? { start } : {}),
        ...(args['room'] !== undefined ? { room: roomArg(plan, args['room']) } : {}),
        ...(args['from'] !== undefined ? { from: args['from'] as Side } : {}),
        ...(args['bearing'] !== undefined ? { bearing: args['bearing'] as number } : {}),
        ...(args['tilt'] !== undefined ? { tilt: args['tilt'] as number } : {}),
        ...(args['distance'] !== undefined ? { distance: args['distance'] as number } : {}),
        ...(args['eye_height'] !== undefined ? { eyeHeight: args['eye_height'] as number } : {}),
        ...(lens !== undefined ? { lens } : {}),
        ...(floor !== undefined ? { cut: floor } : {}),
        ...(args['turn'] !== undefined ? { turn: args['turn'] as number } : {}),
        ...(args['tilt_by'] !== undefined ? { tiltBy: args['tilt_by'] as number } : {}),
        ...(args['fit'] !== undefined ? { fit: args['fit'] as CameraFit } : {}),
      }
      let camera: CameraRecord
      let framed: ReturnType<typeof framedCamera>
      try {
        framed = framedCamera(plan, survey, ask)
        camera = framed.camera
      } catch (error) {
        if (error instanceof CameraRefused) throw new ToolRefusal(error.message)
        throw error
      }
      const { cameraView } = await import('../draw/views')
      // VEW-19: the roof is drawn from outside or when a floor states one, and not with a floor cut
      // away, unless roof says otherwise; the GLB and the section have it whatever the camera.
      const asked = args['roof'] as 'show' | 'hide' | undefined
      const view = await cameraView(plan, camera, language, asked === undefined ? undefined : asked === 'show')
      const stated = statedRoofWords(plan, camera.floors)
      const roof = !view.roof
        ? stated === ''
          ? `The model is drawn open, without its roof (roof=show draws it), and has no furniture, glass or door leaves.`
          : `The model is drawn open, without its roof (roof=show draws the roof the plan states, ${stated}), and has no furniture, glass or door leaves.`
        : stated !== ''
          ? `It is drawn with the roof the plan states, ${stated}, and a flat roof over every other part with nothing above; it has no furniture, glass or door leaves.`
          : 'Grid takes a flat roof over every part with nothing above it, as the plan states none; the model has no furniture, glass or door leaves.'
      const what = viewName !== null ? `The view ${q(viewName)} saved with the plan` : 'The model'
      return {
        text: [
          `${what}${camera.cut ? `, floor ${q(camera.cut)} cut away` : ''}. ${roof} Look at the picture before you describe it.`,
          ...cameraLines(plan, camera),
          ...fitLines(framed),
          ...savedViewsLine(plan),
        ].join('\n'),
        data: { kind, floor: camera.cut, camera, view: viewName, pxPerMetre: null, sills: [], ids: [], boxes: [] },
        image: { data: view.png, mimeType: 'image/png' },
      }
    }
    if (args['room'] === undefined) throw new ToolRefusal('kind=eye needs room: the room to stand in.')
    refuseLeftOutRoom(loaded, args['room'], 'room')
    const id = roomArg(plan, args['room'])
    const room = survey.byId.get(id)
    if (!room || room.polygon.length < 3) throw new ToolRefusal('That room has no outline Grid can draw; grid_check says why.')
    const height = (args['eye_height'] as number | undefined) ?? 1.6
    if (height < 0.3 || height > 3) throw new ToolRefusal('For kind=eye, eye_height takes 0.3 to 3 m above the floor; for a camera higher up, use kind=3d with room and eye_height.')
    const windows = room.openings.filter((o) => o.type === 'window')
    let toward: number | { x: number; y: number }
    let looking: string
    const given = args['toward'] as string | undefined
    if (given !== undefined && Object.hasOwn(COMPASS_HEADING, given)) {
      toward = COMPASS_HEADING[given]!
      looking = given
    } else {
      const target = given !== undefined ? openingArg(plan, given) : (windows[0]?.id ?? room.openings[0]?.id)
      if (target === undefined) throw new ToolRefusal('That room has no opening to look at: pass toward as a direction, such as north.')
      const facts = survey.facts.openings.get(target)
      if (!facts) throw new ToolRefusal('That opening can\'t be drawn; grid_check says why.')
      const wall = plan.walls.find((w) => w.id === facts.wall)!
      // The opening's middle, along a curved wall's curve too (CNT-18).
      toward = wallPointAt(wall, facts.offset + facts.width / 2)
      looking = `${facts.type} ${q(target)}`
    }
    const { cameraView, eyeStand } = await import('../draw/views')
    // VEW-30: stands where the person says, inside the room's floor, else on its middle line.
    const standAt = args['stand_at'] as [number, number] | undefined
    if (standAt !== undefined && !pointInPolygon({ x: standAt[0], y: standAt[1] }, room.polygon, room.holes)) throw new ToolRefusal(`stand_at (${m(standAt[0])}, ${m(standAt[1])}) is not on the floor of ${q(roomCalled(room.facts))}: pass a point inside the room.`)
    const stand = standAt !== undefined ? { x: standAt[0], y: standAt[1] } : eyeStand(room.polygon, toward, room.holes)
    const camera = eyeCamera(plan, { room: id, polygon: room.polygon, stand, height, toward })
    const view = await cameraView(plan, camera, language)
    const heading = wrapDegrees(drawingBearing(camera.bearing, planOrientation(plan)) + 180)
    const sills = windows.map((w) => ({ id: w.id, sill: w.sill, top: w.sill + w.height, seenOver: w.sill < height }))
    const sillText = sills.length === 0
      ? 'The room has no windows.'
      : `Windows in the room, sill and top against the eye at ${m(height)} m: ${sills.map((s) => `${q(s.id)} sill ${m(s.sill)}, top ${m(s.top)} (${s.sill < height ? 'the eye is above the sill' : 'the sill is at or above the eye'})`).join('; ')}.`
    return {
      text: [
        `Standing in ${q(roomCalled(room.facts))} at (${m(camera.position[0])}, ${m(camera.position[1])}), eye ${m(height)} m above the room's own floor, looking level toward ${looking} (heading ${heading.toFixed(0)}° from the top of the drawing), 90° across. ${sillText} The model has no ceiling, glass, furniture or anything outside. Look at the picture before you describe it.`,
        ...cameraLines(plan, camera),
      ].join('\n'),
      data: { kind, floor: room.facts.floor, camera, view: null, pxPerMetre: null, sills, ids: [], boxes: [] },
      image: { data: view.png, mimeType: 'image/png' },
    }
  }
}

// ---------------------------------------------------------------------------------------------
// grid_describe

const describeTool: GridTool = {
  name: 'grid_describe',
  title: 'Read the plan in room terms',
  hint: 'read',
  description:
    'Use this when the person asks what is in the plan, what the rooms are and how they connect, which side a door or window is on, or when you need to read the plan before changing it. '
    + 'It gives the plan in rooms: each room with its inside size and area, the rooms next to it, and each door and window with the side it is on, its distance from the corners and the two rooms it joins. '
    + 'length=line is one line, rooms (the default) each room, walls also every wall. for=person never shows an id; for=agent is terse and gives the ids to edit with. '
    + 'length=walk is the long form, for "walk me through it" or "what do I see when I come in": the plan walked room by room from its way in, standing in the doorway of each room, with what is ahead, on the left, on the right and in the wall you stand in, and how far; floor walks one floor, and pictures=true adds a picture at eye height from each doorway, looking ahead (at most ' + String(WALK_PICTURES_MAX) + '). '
    + 'as=rooms reads the plan back as rooms text instead, the way plans are written: change it and pass it to grid_write_rooms, which writes it back losing nothing. Do not use for an area table (grid_areas) or a picture (grid_view). Units are metres.',
  args: {
    plan: PLAN_ARG,
    length: { type: 'string', enum: DESCRIBE_LENGTHS, description: 'line, rooms, walls or walk. rooms when left out.', examples: ['rooms', 'line', 'walk'] },
    for: { type: 'string', enum: DESCRIBE_AUDIENCES, description: 'person (names only, no ids) or agent (terse, with ids). agent when left out.', examples: ['agent', 'person'] },
    as: { type: 'string', enum: ['rooms'], description: 'rooms: the plan as rooms text, to change and write again with grid_write_rooms. Takes no length or for.', examples: ['rooms'] },
    floor: { ...FLOOR_ARG, description: 'For length=walk: the floor to walk. Every floor when left out, a floor laid out like an earlier one said once.' },
    pictures: { type: 'boolean', description: 'For length=walk: true to add a picture at eye height from each doorway, looking ahead, in the order of the walk. false when left out.', examples: [true, false] },
    language: LANGUAGE_ARG,
  },
  outputSchema: objectSchema({ length: { type: ['string', 'null'] }, for: { type: ['string', 'null'] }, as: { type: ['string', 'null'] }, text: STRING, pictures: { type: 'array' } }, ['length', 'for', 'as', 'text']),
  async run(args, context) {
    if (args['as'] !== undefined && (args['length'] !== undefined || args['for'] !== undefined || args['floor'] !== undefined || args['pictures'] !== undefined)) {
      throw new ToolRefusal('as=rooms reads the plan back as rooms text, which has no length or for: leave them out.')
    }
    const { loaded: read } = readPlan(context, args['plan'])
    // MSG-11: the description in the language asked for, else the plan's own.
    const language = await languageFor(askedLanguage(args['language'], 'language'), read.plan)
    // MSG-22: the floor the plan names in no list, named in that language.
    const loaded = spokenPlan(read, language)
    if (args['as'] === 'rooms') {
      const text = describeRooms(loaded, { language })
      return { text, data: { length: null, for: null, as: 'rooms', text } }
    }
    const length = (args['length'] as (typeof DESCRIBE_LENGTHS)[number] | undefined) ?? 'rooms'
    const audience = (args['for'] as (typeof DESCRIBE_AUDIENCES)[number] | undefined) ?? 'agent'
    // A floor that is not there is refused first, naming the plan's floors (MS-19).
    const floor = floorArg(loaded.plan, args['floor'])
    if (length !== 'walk' && (args['floor'] !== undefined || args['pictures'] !== undefined)) {
      throw new ToolRefusal(`${args['floor'] !== undefined ? 'floor' : 'pictures'} goes with length=walk only: length=${length} describes every floor and draws nothing.`)
    }
    if (length === 'walk') {
      // VEW-9: the walk, and a picture from each doorway when asked, at most WALK_PICTURES_MAX.
      // MSG-11: in the language asked for; a picture is named in it too.
      const { survey, walk } = walkOf(loaded, floor)
      const shots = args['pictures'] === true ? await walkPictures(survey, walk, WALK_PICTURES_MAX) : []
      const names = new Map(shots.map((shot, i) => [shot.stop, say(language, 'describe.walk.pictureName', { n: i + 1 })]))
      const stops = walk.floors.reduce((sum, floor) => sum + floor.stops.length, 0)
      const more = args['pictures'] === true && stops > shots.length ? `\nPictures of the first ${shots.length} doorways of ${stops}: pass floor to walk one floor at a time.` : ''
      const text = `${describeWalk(survey, walk, audience, names, { language }).trimEnd()}${more}`
      const pictures = shots.map((shot, i) => ({ picture: i + 1, room: shot.stop.room, floor: shot.stop.floor, eyeHeight: WALK_EYE_HEIGHT, heading: shot.stop.heading }))
      return {
        text,
        data: { length, for: audience, as: null, text, pictures },
        ...(shots.length === 0 ? {} : { images: shots.map((shot) => ({ data: shot.png, mimeType: 'image/png' as const })) }),
      }
    }
    const text = describePlan(loaded, length, audience, { language })
    return { text, data: { length, for: audience, as: null, text } }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_check

/** The country argument of grid_check and grid_mark_seen: the numbers follow the record it makes. */
export const COUNTRY_ARG: ArgSpec = {
  type: 'string',
  maxLength: PLACE_TEXT_MAX,
  description: 'Where it will be built, for this check, in place of the plan\'s site.country: a country\'s name or its two- or three-letter code (US, USA, United States, Spain). Figures are applied only where they hold; with no place stated, none is.',
  examples: ['US', 'United States', 'ES'],
}

/** COD-3: how grid_check's first line names the place it was given. */
const TOOL_PLACE: PlaceWords = 'tool'


/** MSG-10: a line's seen state as data: the mark, and with `back` the parts that changed since. */
function seenData(state: SeenState | undefined): Record<string, unknown> | undefined {
  if (state === undefined || state.state === 'new') return undefined
  const { reason, by, at } = state.mark
  return state.state === 'seen'
    ? { state: 'seen', reason, by, at }
    : { state: 'back', reason, by, at, changed: state.changed.map((p) => ({ kind: p.kind, id: p.id })) }
}

/** One line of grid_check's list. COD-2: a line that used a figure says what it needed, which names the kind of building the figure was read for. */
function toolLine(result: CheckResult, index: number): string {
  const line = result.result.lines[index]!
  const needed = usedFigures(line) ? t('tool.check.needed', { needed: line.needed }) : ''
  // MSG-5: a line that follows from another is set under it, and says so.
  const words = { kind: kindWord(line.kind), thing: thingText(line), message: line.message, needed, code: line.code }
  return `  ${line.causedBy ? '  ' : ''}${result.numbers[index]}. ${line.causedBy ? t('tool.check.line.follows', { ...words, cause: causeText(line.causedBy) }) : t('tool.check.line', { ...words, fix: line.fix })}`
}

const checkTool: GridTool = {
  name: 'grid_check',
  title: 'Check the plan',
  hint: 'read',
  description:
    'Use this when you have changed the plan, or when the person asks whether the plan is drawn right or what Grid\'s checks find: problems in the drawing itself, and notes from the general checks it runs (room sizes, ways out, door swings). '
    + 'Every answer carries the label "General guidance, not your local rules". It never says a plan complies or is allowed: "is it allowed" is for the person\'s local authority, and the answer says what was not checked. '
    + 'The answer is short and about this plan: the notes, the figures they used, what each check looked at, and the notes the person set aside as seen (grid_mark_seen), each still listed under Seen; full=true adds the checks run, every figure and what these checks never look at. '
    + 'With a firm\'s standards file beside the plan (firm-standards.json), the firm\'s own figures are set against the plan too, and their notes (firm/…) come under their own heading, apart from the code figures. '
    + 'With a brief beside the plan (plan.brief.json), the person\'s own figures the drawing misses are listed after the notes, measured as grid_write_brief measures them, theirs and not a code\'s. '
    + 'Do not use to measure (grid_measure) or for areas (grid_areas).',
  args: {
    plan: PLAN_ARG,
    floor: { ...FLOOR_ARG, description: 'Only what was found on this floor. Every floor when left out.' },
    country: COUNTRY_ARG,
    full: { type: 'boolean', description: 'true for the whole report: the checks run, every figure with its basis and status, each check\'s coverage and what these checks never look at. Short when left out.', examples: [true] },
    language: LANGUAGE_ARG,
  },
  outputSchema: objectSchema({
    label: STRING,
    // MSG-11: the language the words are in; MSG-24: any language.
    language: STRING,
    // MSG-1: the one list and the one count, as docs/result-contract.md sets them out.
    count: { type: 'number' },
    // MSG-5: the lines that follow from no other: the problems to act on.
    problems: { type: 'number' },
    lines: listSchema(objectSchema({
      code: STRING,
      kind: STRING,
      thing: objectSchema({ kind: STRING, id: STRING }),
      floor: { type: ['string', 'null'] },
      also: listSchema(STRING),
      message: STRING,
      found: STRING,
      needed: STRING,
      fix: STRING,
      // On a finding that applied a figure: each figure with its source and status.
      figures: { type: 'array' },
      // MSG-7: the change that would clear the line, as data, and the same as a call to retry.
      fixes: { type: 'array' },
      // MSG-11: the figures, names and places the line's words were made with, as data.
      values: { type: 'object' },
      calls: listSchema(objectSchema({ tool: STRING, arguments: { type: 'object' } }, ['tool', 'arguments'])),
      // MSG-5: the line this one follows from; the parts a line for several stands for; the notes held back.
      causedBy: objectSchema({ code: STRING, id: STRING }),
      each: listSchema(objectSchema({ kind: STRING, id: STRING })),
      held: listSchema(objectSchema({
        code: STRING,
        thing: objectSchema({ kind: STRING, id: STRING }),
        floor: STRING,
        also: listSchema(STRING),
        waitsFor: listSchema(STRING),
      })),
      // MSG-10: the person's seen mark, when the line has one: seen, or back (new again, its parts changed since).
      seen: objectSchema({ state: STRING, reason: STRING, by: STRING, at: STRING, changed: listSchema(objectSchema({ kind: STRING, id: STRING })) }, ['state', 'reason', 'by', 'at']),
      // COD-8: on a firm/ line, the firm's own figure it was set against, from the file beside the plan.
      firm: objectSchema({ standard: { type: 'number' }, measure: STRING, value: { type: 'number' }, unit: STRING, name: { type: ['string', 'null'] }, note: { type: ['string', 'null'] }, file: STRING }, ['standard', 'measure', 'value', 'unit', 'name', 'note', 'file']),
    }, ['code', 'kind', 'thing', 'floor', 'also', 'message', 'found', 'needed', 'fix'])),
    // MSG-10: how many lines are seen, the marks file beside the plan, and why it could not be read.
    seenCount: { type: 'number' },
    marksFile: STRING,
    marksProblem: { type: ['string', 'null'] },
    // The rooms a finding is about, by id and name, apart from the message: text from the plan file.
    findings: listSchema(objectSchema({ floor: STRING, message: STRING, rooms: listSchema(objectSchema({ id: STRING, name: STRING })) })),
    notChecked: listSchema(objectSchema({ floor: STRING, message: STRING })),
    drawing: listSchema(objectSchema({ severity: STRING, entity: STRING, id: STRING, message: STRING })),
    // MSG-2: what each check looked at and skipped, with the reason and a count (docs/result-contract.md).
    coverage: listSchema(objectSchema({
      ruleId: STRING,
      title: STRING,
      looksAt: STRING,
      lookedAt: listSchema(objectSchema({ floor: STRING, ids: listSchema(STRING) })),
      lookedAtCount: { type: 'number' },
      skipped: listSchema(objectSchema({ floor: STRING, ids: listSchema(STRING), reason: STRING, why: STRING })),
      skippedCount: { type: 'number' },
      findings: { type: 'number' },
    }, ['ruleId', 'title', 'looksAt', 'lookedAt', 'lookedAtCount', 'skipped', 'skippedCount', 'findings'])),
    // COD-4: what these checks never look at, whatever the plan (ceiling height, which walls carry load).
    limits: listSchema(STRING),
    // COD-3: the place the figure checks were for, from Grid's list, or null when none is stated (then no figure was applied).
    place: { type: ['object', 'null'], properties: { country: STRING, name: STRING, from: STRING } },
    // COD-3: with no place, how many lines the US figures would have given; left out when a place is stated (CMD-17).
    withoutPlace: objectSchema({ usLines: { type: 'number' } }, ['usLines']),
    // HND-11: each length taped on site against the drawing; empty for a plan that keeps none.
    taped: TAPED_OUTPUT,
    // COD-8: only with a firm's standards file beside the plan: each standard, what it looked at and its notes.
    firm: objectSchema({
      heading: STRING,
      file: STRING,
      read: { type: 'boolean' },
      standards: listSchema(objectSchema({
        measure: STRING,
        value: { type: 'number' },
        unit: STRING,
        name: { type: ['string', 'null'] },
        note: { type: ['string', 'null'] },
        uses: listSchema(STRING),
        kinds: listSchema(STRING),
        lookedAt: { type: 'number' },
        notes: { type: 'number' },
      }, ['measure', 'value', 'unit', 'name', 'note', 'uses', 'kinds', 'lookedAt', 'notes'])),
    }, ['heading', 'file', 'read', 'standards']),
  }, ['label', 'language', 'count', 'problems', 'lines', 'seenCount', 'marksFile', 'marksProblem', 'findings', 'notChecked', 'drawing', 'coverage', 'limits', 'place', 'taped']),
  async run(args, context) {
    const { loaded, project, file } = readPlan(context, args['plan'])
    const floor = floorArg(loaded.plan, args['floor'])
    const full = args['full'] === true
    let result
    try {
      // COD-8: the firm's own standards beside the plan, when it has a file of them.
      const firm = firmForCheck(project, file, loaded.plan)
      // MSG-11: the language asked for, else the plan's own, with its messages loaded.
      const language = await languageFor(askedLanguage(args['language'], 'language'), loaded.plan)
      result = checkPlan(loaded, { ...(floor ? { floor } : {}), ...(args['country'] ? { country: args['country'] as string } : {}), ...(firm ? { firm } : {}), ...(language === 'en' ? {} : { language }) }, 'country')
      result = withSeen(result, loaded, readSeen(project, file))
    } catch (error) {
      throw asRefusal(error)
    }
    const briefMissed = briefMissedText(project, file, loaded.plan)
    const roomName = new Map(loaded.plan.rooms.map((r) => [r.id, r.name]))
    const findings = result.report.findings.map((f) => ({
      floor: f.floor,
      message: f.message,
      rooms: f.rooms.map((id) => ({ id, name: roomName.get(id) ?? '' })),
    }))
    const notChecked = result.report.notChecked.map((n) => ({ floor: n.floor, message: n.message }))
    const drawing = result.issues.map((i) => ({ severity: i.severity, entity: i.entity, id: i.id, message: i.message }))
    return inLanguage(result.language, result.decimal, () => {
      const record = result.result
      const states = result.seen?.states ?? []
      const seen = seenCount(result)
      // COD-3: right after the label, the place and the figures applied, or that none was.
      const lines: string[] = [result.label, placeText(result.report, TOOL_PLACE)]
      if (result.seen?.problem) lines.push(t('report.seenUnread', { problem: result.seen.problem }))
      const seenWords = seen > 0 ? t('tool.check.ofThemSeen', { count: seen }) : ''
      const checksRun = result.report.rules.length === 0 ? t('report.checksRun.none') : t('report.checksRun', { count: result.report.rules.length })
      // NOTHING_FOUND: an empty list only means these checks found nothing.
      lines.push(`${record.count === 0 ? t('report.toLook.none') : t('tool.check.toLook', { count: record.count, counts: countsText(record), seen: seenWords })}${record.count === 0 ? '' : problemsText(record)} ${checksRun}`)
      if (full) for (const rule of result.report.rules) lines.push(`  - ${ruleText(rule)}`)
      // A seen line is listed under Seen, never left out (MSG-10).
      const open = record.lines.map((_, index) => index).filter((index) => states[index]?.state !== 'seen')
      // COD-8: the firm's own standards under their own heading, apart from the code figures.
      const firmOpen = open.filter((index) => isFirmLine(record.lines[index]!)).length
      let firmHeading = false
      for (const index of open.slice(0, 12)) {
        if (isFirmLine(record.lines[index]!) && !firmHeading && record.firm !== undefined) {
          firmHeading = true
          lines.push(firmHeadingText(record.firm, firmOpen))
        }
        lines.push(toolLine(result, index))
        const state = states[index]
        if (state?.state === 'back') lines.push(`${record.lines[index]!.causedBy ? '  ' : ''}      ${seenBeforeText(state)}.`)
      }
      if (open.length > 12) lines.push(`  ${t('tool.check.more', { count: open.length - 12 })}`)
      // COD-8: firm lines past the first 12 still have their heading, so none is read as a code's.
      if (!firmHeading && firmOpen > 0 && record.firm !== undefined) lines.push(t('tool.check.firm.more', { heading: firmHeadingText(record.firm, firmOpen) }))
      // WRT-6 (lab WR-15): what was assumed, for the person to confirm, named even past the first 12.
      // A seen one is under Seen with the others (MSG-10).
      const toConfirm = open.map((index) => record.lines[index]!).filter((line) => line.kind === 'to-confirm')
      if (toConfirm.length > 0) {
        const more = toConfirm.length > 8 ? t('tool.check.confirmMore', { count: toConfirm.length - 8 }) : ''
        lines.push(t('tool.check.toConfirm', { count: toConfirm.length, list: toConfirm.slice(0, 8).map((line) => line.message).join('; '), more }))
      }
      if (seen > 0) {
        lines.push(t('report.seenHeading', { count: seen }))
        record.lines.forEach((line, index) => {
          const state = states[index]
          if (state?.state === 'seen') lines.push(`  ${result.numbers[index]}. ${t('tool.check.seenLine', { kind: kindWord(line.kind), thing: thingText(line), message: line.message, by: seenByText(state.mark), code: line.code })}`)
        })
      }
      // MSG-7: each line one call would clear carries that call, ready to send.
      const withCalls = record.lines.map((line, index) => {
        const withFix = withFixCalls(line, args['plan'])
        const mark = seenData(states[index])
        return mark === undefined ? withFix : { ...withFix, seen: mark }
      })
      const callable = withCalls.filter((line) => line.calls !== undefined).length
      if (callable > 0) lines.push(callable === 1 ? t('tool.check.calls.one') : t('tool.check.calls.many', { count: callable }))
      if (record.counts.finding === 0 && record.count > 0) lines.push(t('tool.check.noFindings'))
      else if (record.count > 0 && record.lines.every((line) => line.kind !== 'finding' || isFirmLine(line))) lines.push(t('tool.check.firm.noCodeFindings'))
      // COD-8: a firm's file whose standards gave no note still says it was read.
      const firmNone = firmNoNoteText(record)
      if (firmNone !== null) lines.push(firmNone)
      // HND-11 (lab WR-14): each length taped on site against the drawing, after every run.
      lines.push(...tapedTable(record.taped ?? []))
      // ARE-27: the person's own figures from the brief beside the plan that the drawing misses.
      lines.push(...briefMissed)
      if (full) {
        // MSG-2: what each check looked at, beside the count, so an empty list cannot read as a pass.
        const rooms = result.rooms
        lines.push(t('report.lookedAtByOne', { summary: rooms.rooms === 0 ? t('tool.check.rooms.none') : t('tool.check.rooms', { lookedAt: rooms.lookedAt, rooms: partsText(rooms.rooms, 'room') }) }))
        for (const check of record.coverage) {
          const skipped = check.skippedCount === 0 ? '' : t('report.gap', { count: check.skippedCount, whys: [...new Set(check.skipped.map((s) => (s.said === undefined ? s.why : tv(s.said))))].join('; ') })
          const readFor = readForText(check)
          lines.push(check.lookedAtCount === 0 ? `  ${nothingCheckedText(checkTitle(check), check.looksAt)}${skipped}${readFor}.` : `  ${t('tool.check.coverage', { title: checkTitle(check), parts: partsText(check.lookedAtCount, check.looksAt), skipped, readFor })}`)
        }
        // MSG-3: each figure as the figure used here, with its basis and status.
        if (record.figures.length > 0) lines.push(t('report.section', { title: t('report.figuresUsed'), count: record.figures.length }), ...record.figures.map((figure) => `  ${tv(figureUsedSaid(figure))}`))
        // COD-8: the firm's own standards, apart from the code figures.
        if (record.firm !== undefined && record.firm.read) lines.push(t('report.section', { title: firmSectionTitle(record.firm), count: record.firm.standards.length }), ...firmStandardsText(record.firm).map((text) => `  ${text}.`))
        // COD-4: the same lines `grid check` prints, so nothing on this list can read as checked.
        lines.push(t('tool.check.never', { count: record.limits.length }), ...limitsText(record.limits).map((limit) => `  ${limit}.`))
      } else {
        // MSG-10: the counts, the gaps with their reasons, and where the rest is.
        lines.push(...coverageSummary(result).filter((line) => line !== '').map((line) => line.replace(/^ {2}- /, '  ')), restText(result.report, 'full=true'))
      }
      return {
        text: lines.join('\n'),
        data: {
          label: result.label,
          language: result.language ?? 'en',
          count: record.count,
          problems: record.problems,
          lines: withCalls,
          seenCount: seen,
          marksFile: result.seen?.file ?? '',
          marksProblem: result.seen?.problem ?? null,
          findings,
          notChecked,
          drawing,
          coverage: record.coverage,
          limits: record.limits,
          place: record.place,
          ...(record.withoutPlace ? { withoutPlace: record.withoutPlace } : {}),
          taped: record.taped ?? [],
          ...(record.firm ? { firm: record.firm } : {}),
        },
      }
    })
  },
}

/** A call to a tool of this server, ready to send. */
export interface FixCall {
  readonly tool: string
  readonly arguments: Readonly<Record<string, unknown>>
}

/**
 * MSG-7: the calls that make a line's fixes, each the edit tool with the corrected argument: a
 * width keeping the opening's start, an offset as its distance from the wall's start, a height
 * or a sill. A change the tool would refuse (a width under its 0.3 m, a height under 0.2 m) is
 * not offered. The plan argument is the one this call was given.
 */
export function fixCalls(fixes: readonly PlanFix[], plan: unknown): FixCall[] {
  const base = (id: string): Record<string, unknown> => ({ ...(typeof plan === 'string' ? { plan } : {}), opening: id })
  return fixes.flatMap((fix): FixCall[] => {
    const tool = 'grid_change_opening'
    if (fix.width !== undefined) return fix.width >= 0.3 ? [{ tool, arguments: { ...base(fix.id), width: fix.width, keep: 'start' } }] : []
    if (fix.offset !== undefined) return [{ tool, arguments: { ...base(fix.id), from: 'start', distance: fix.offset } }]
    if (fix.height !== undefined) return fix.height >= 0.2 ? [{ tool, arguments: { ...base(fix.id), height: fix.height } }] : []
    if (fix.sill !== undefined) return [{ tool, arguments: { ...base(fix.id), sill: fix.sill } }]
    // A wall id meant (`fix.wall`) has no tool that sets it: it stays data beside the message.
    return []
  })
}

function withFixCalls(line: ResultLine, plan: unknown): ResultLine & { readonly calls?: readonly FixCall[] } {
  const calls = line.fixes ? fixCalls(line.fixes, plan) : []
  return calls.length > 0 ? { ...line, calls } : line
}

/**
 * ARE-26: a measure that depends on fixtures names the ones it left out and why, in its text and
 * in its data (`fixturesLeftOut`), so a room is never read as holding none because its toilet
 * was set aside. Only the answers that take fixtures into account are noted.
 */
function noting(tool: GridTool, applies: (args: Record<string, unknown>) => boolean): GridTool {
  const run = tool.run
  return {
    ...tool,
    run(args, context) {
      const note = (answer: Answer): Answer => {
        const { loaded } = readPlan(context, args['plan'])
        const left = fixturesLeftOut(loaded.plan, loaded.faults ?? [])
        const line = fixturesLeftOutLine(left)
        if (line === null) return answer
        const data = { ...answer.data, fixturesLeftOut: left.map((one) => ({ id: one.id, field: one.field, found: one.found })) }
        const where = typeof answer.data['rule'] === 'string' && answer.text.endsWith(answer.data['rule']) ? answer.text.length - answer.data['rule'].length : answer.text.length
        const text = where === answer.text.length ? `${answer.text}\n${line}` : `${answer.text.slice(0, where)}${line}\n${answer.text.slice(where)}`
        return { ...answer, text, data }
      }
      if (!applies(args)) return run.call(tool, args, context)
      const answer = run.call(tool, args, context)
      return answer instanceof Promise ? answer.then(note) : note(answer)
    },
  }
}

export const READ_TOOLS: readonly GridTool[] = [compareTool, noting(areasTool, (args) => args['format'] !== 'csv'), takeoffTool, scheduleTool, fieldsTool, findTool, countTool, noting(measureTool, (args) => ['use', 'fit', 'access', 'route'].includes(args['what'] as string)), viewTool, describeTool, checkTool]

/** What the sides of an opening are called in an answer. Exported for the edit tools. */
export function openingBetween(survey: Survey, id: string): string {
  const facts = survey.facts.openings.get(id)
  if (!facts) return ''
  const [a, b] = sideNames(facts)
  const name = (side: string): string => (survey.facts.rooms.has(side) ? q(roomCalled(survey.facts.rooms.get(side)!)) : side)
  return `${name(a)} ↔ ${name(b)}`
}

