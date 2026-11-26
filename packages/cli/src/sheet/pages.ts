/**
 * VEW-7: what is on each page of a sheet. Pure: no file, no canvas. `pdf.ts` lays it out.
 *
 * Every figure comes from code that already exists, never from here: areas from `planAreas`,
 * heights from `floorElevations`, stairs from `planFacts`, findings from `checkPlan`. The
 * pictures are named, not drawn: a floor and its frame, or the model.
 */
import { planFloors, type Bounds } from '@ongrid/floorplan/geometry'
import { areaText, metresText, sumText } from '@ongrid/floorplan/geometry/rounding'
import type { SheetWords } from '@ongrid/floorplan/types/sheet'
import { decimalFor, DEFAULT_LANGUAGE, joined, name, num, say, sayValue, labelOfUse, type Language, type MessageKey, type Said, type Values } from '@ongrid/floorplan/messages'
import { ROOM_USES, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { findingReadFor, readForSentence } from '@ongrid/rules'
import { FRAME_MARGIN, fitTo } from '@ongrid/viewer/src/canvas2d/viewport'
import { pictureView, undecidedDoorsOf, type PictureOptions } from '@ongrid/viewer/src/picture'
import { TEXT_PX } from '@ongrid/viewer/src/picture/look'
import { checkOnFloor, checkPlan, floorIssues, placeText } from '../command/check'
import type { AccessNote } from './accessNotes'
import { inLanguage } from '../command/words'
import type { LoadedPlan } from '../command/plan'
import { describeText } from '../describe/card'
import { planFacts } from '../describe/facts'
import { AREA_RULES, planAreas, type FloorAreas, type PlanAreas } from '../quantities/areas'
import { factsText, flatSchedule, openingSchedule, openingTypeSchedule, roomSchedule, scheduleMarkLabels, shownNumber } from '../quantities/schedule'
import type { ScheduleMarkLabels } from '@ongrid/floorplan/geometry/drawingMarks'
import { surveyPlan } from '../quantities/survey'
import { notShownNote } from './limits'
import { coverFigures, roundingNote } from './coverFigures'
import { groupRooms } from './roomGroups'
import { typicalFloors } from './typicalFloors'
import { sideDrawings, type PlacedDrawing } from './sideDrawings'
import { scaleText } from './drawingPapers'
import type { NamedSectionLine } from '@ongrid/floorplan/geometry/drawingMarks'
import { displayFor, sqFt } from '../quantities/units'
import { showLength, type Display } from '@ongrid/floorplan/types/units'

export type SheetLayout = 'client' | 'check'
export const SHEET_LAYOUTS: readonly SheetLayout[] = ['client', 'check']
/** The drawing box on a floor page, in PDF points: what the frames are fitted to. */
export const PLAN_BOX = { width: 700, height: 640 } as const

/** A sheet is drawn in the technical look (SHT-1): black on white, lines in millimetres on paper. */
export const SHEET_LOOK = 'technical' as const

/** Millimetres in a PDF point. */
const POINT_MM = 25.4 / 72

/** On a floor page whose plan has doors drawn as undecided: the key to their mark. */
export const UNDECIDED_NOTE = say('en', 'sheet.undecided')

/** The smallest a room name is printed, in points: below it a name on A3 can't be read. */
export const MIN_LABEL_PT = 5

/** `PLAN_BOX`'s shape in the fewest whole pixels. */
const SHAPE = (() => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(PLAN_BOX.width, PLAN_BOX.height)
  return { width: PLAN_BOX.width / g, height: PLAN_BOX.height / g }
})()

/**
 * How `pdf.ts` draws a floor page's picture: what it asks `drawPlan` for, and how many times
 * the box's size the picture is drawn at, centred on the box and cut to it.
 *
 * Labels are sized in pixels, so the picture has as many pixels as make one pixel measure what
 * it does in `grid draw`'s picture of the floor (`metresPerPixel`): each label is as large
 * against the rooms as there. The sheet's pens can move the labels within their rooms.
 * Where `grid draw`'s zoom would print a name under `MIN_LABEL_PT`, the zoom is the one that
 * prints it at that size. This also bounds the picture's width (at most 1,820 pixels and one
 * step). Pixels come whole and the
 * box keeps its shape, so the picture shows a little more than the frame (at most one step of
 * `SHAPE`) at the frame's scale; what is beyond the frame is cut, as it always was.
 *
 * The picture is drawn in `SHEET_LOOK` at the box's own scale on the paper (`paperScale`, N in
 * 1:N, for a box `PLAN_BOX.width` points wide), so its lines have their width in millimetres on
 * the printed sheet.
 */
export function planPictureOptions(picture: Extract<SheetPicture, { kind: 'plan' }>, language: Language = DEFAULT_LANGUAGE): { options: PictureOptions; grow: number } {
  const shown = fitTo(picture.frame, PLAN_BOX.width / PLAN_BOX.height)
  const steps = Math.max(1, Math.ceil(shown.width / picture.metresPerPixel / SHAPE.width))
  const width = steps * SHAPE.width
  const grow = (width * picture.metresPerPixel) / shown.width
  const { min, max } = picture.frame
  const cx = (min.x + max.x) / 2
  const cy = (min.y + max.y) / 2
  const w = picture.frame.width * grow
  const h = picture.frame.height * grow
  const frame: Bounds = { min: { x: cx - w / 2, y: cy - h / 2 }, max: { x: cx + w / 2, y: cy + h / 2 }, width: w, height: h }
  return {
    options: {
      floor: picture.floor,
      frame,
      width,
      height: steps * SHAPE.height,
      look: SHEET_LOOK,
      paperScale: (shown.width * 1000) / (PLAN_BOX.width * POINT_MM),
      ...(picture.ids ? { labels: { ids: true } } : {}),
      // ARE-15: the schedules' marks, tied to the rows on the schedule pages; SHT-23: the lines
      // of the sections on the sheet's sections page.
      ...(picture.marks === undefined && picture.sections === undefined ? {} : {
        marks: { ...(picture.marks === undefined ? {} : { schedule: picture.marks }), ...(picture.sections === undefined ? {} : { sections: picture.sections }) },
      }),
      // MSG-11: the drawing's words in the sheet's language; English leaves the plan's own.
      ...(language === DEFAULT_LANGUAGE ? {} : { language }),
    },
    grow,
  }
}

export interface SheetFigure { readonly value: string; readonly label: string }
export interface SheetRow { readonly name: string; readonly detail: string | null; readonly area: string }
/**
 * `pdf.ts` may split a long table across pages: a part has no `total` until the part that holds
 * it, and no `note` until the part that holds that.
 */
export interface SheetTable { readonly heading: string; readonly rows: readonly SheetRow[]; readonly total: SheetRow | null; readonly note: string | null }
export type SheetPicture =
  /**
   * `frame` is what the box shows, in plan metres. `metresPerPixel` is what one pixel measures
   * in `grid draw`'s picture of the floor, or more where that would print names under
   * `MIN_LABEL_PT`: the zoom its labels are placed at (`planPictureOptions`).
   */
  | {
      readonly kind: 'plan'; readonly floor: string; readonly frame: Bounds; readonly metresPerPixel: number; readonly ids: boolean
      /** ARE-15: on the check set, each room's and opening's mark in its schedules, by id. */
      readonly marks?: ScheduleMarkLabels
      /** SHT-23: the lines of the sections on the sheet's sections page, marked on the plan. */
      readonly sections?: readonly NamedSectionLine[]
    }
  | { readonly kind: 'model' }
  /**
   * SHT-23: an elevations or sections page's drawings, at one scale (N in 1:N) on A3, each placed
   * in `DRAWINGS_BOX` (`sideDrawings.ts`), and the words of the page's title block.
   */
  | { readonly kind: 'drawings'; readonly scale: number; readonly drawings: readonly PlacedDrawing[]; readonly block: TitleBlockWords }

/** SHT-23: the cells of a page's title block, as a drawing at a scale has them (SHT-6). */
export interface TitleBlockWords {
  readonly project: string
  readonly drawing: string
  readonly scale: string
  readonly date: string
  readonly status: string
  /** The field names, in the sheet's language. */
  readonly labels: { readonly project: string; readonly drawing: string; readonly scale: string; readonly date: string; readonly status: string }
}
export interface SheetPage {
  readonly kind: 'cover' | 'floor' | 'summary' | 'elevations' | 'sections'
  /** The floor a floor page, or its continuation, is about; null on the cover and the summary. */
  readonly floor: string | null
  /** SHT-21: on a typical floor's page, every floor it stands for, lowest first; `floor` is the first. */
  readonly stands?: readonly string[]
  readonly topLine: string
  readonly title: string | null
  readonly subtitle: string | null
  readonly paragraphs: readonly string[]
  readonly figures: readonly SheetFigure[]
  readonly table: SheetTable | null
  readonly picture: SheetPicture | null
  readonly notes: readonly string[]
  readonly footer: { readonly label: string; readonly page: number; readonly pages: number; readonly date: string }
}
/** MSG-11: `language` is the one the sheet's own words, and its drawings', are written in. */
export interface Sheet { readonly layout: SheetLayout; readonly name: string; readonly pages: readonly SheetPage[]; readonly language?: Language }
export interface SheetOptions {
  readonly name: string
  /** SHT-12: the measurements under the person's own access figures, printed on a client sheet's first page. */
  readonly accessNotes?: readonly AccessNote[]
  readonly date: Date
  /** MSG-11: the language of the sheet's own words, with its decimal mark. English when left out. */
  readonly language?: Language
}

/**
 * MSG-11: the sheet's words in one language. `say` a key; its figures are written by
 * `sheetUnits`, in the person's units with the language's decimal mark. Names from the plan go
 * in as they are: the sheet prints them unquoted, as the person wrote them.
 */
export interface Words {
  readonly language: Language
  readonly say: (key: MessageKey, values?: Values) => string
  /** A sentence Grid made elsewhere: its English as given, else said from its key and values. */
  readonly said: (message: string, said: Said | undefined) => string
  /** A room use's own word in the language; a word that is not a use, as written. */
  readonly use: (use: string) => string
}

function wordsIn(language: Language): Words {
  const english = language === DEFAULT_LANGUAGE
  return {
    language,
    say: (key, values) => say(language, key, values),
    said: (message, said) => (english || said === undefined ? message : sayValue(language, said)),
    use: (use) => (english || !(ROOM_USES as readonly string[]).includes(use) ? use : labelOfUse(language, use as RoomUse)),
  }
}

const ENGLISH = wordsIn(DEFAULT_LANGUAGE)

type Body = Omit<SheetPage, 'footer'>

/** When some floor with rooms is joined to no other by a stair (LVL-3). */
export const STAIR_LIMIT = say('en', 'sheet.stairLimit')
/** On a client floor page that leaves out a part Grid cannot draw (the check sheet lists it). */
export const LEFT_OUT_LIMIT = say('en', 'sheet.leftOutLimit')

function dateText(date: Date, w: Words): string {
  const months = w.say('sheet.months').split(' ')
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** SHT-6: a sheet's date as every sheet writes it, in the language's month names. */
export function sheetDate(date: Date, language: Language = DEFAULT_LANGUAGE): string {
  return dateText(date, wordsIn(language))
}

/**
 * Each floor's frame, in plan metres with Y up, as `planPicture` takes it in `frame` (before
 * its margin). Every frame is sized so that `fitTo` grows it to the largest default view of
 * any floor, centred on that floor's own: drawn into boxes of one size, every floor page has
 * the same scale and nothing is cut off.
 */
export function floorFrames(loaded: LoadedPlan): ReadonlyMap<string, Bounds> {
  const views = planFloors(loaded.plan).map((floor) => ({
    floor: floor.id,
    view: pictureView(loaded.plan, { floor: floor.id, width: PLAN_BOX.width, height: PLAN_BOX.height }).view,
  }))
  const grow = 1 + 2 * FRAME_MARGIN
  const width = Math.max(...views.map((v) => v.view.width)) / grow
  const height = Math.max(...views.map((v) => v.view.height)) / grow
  return new Map(views.map(({ floor, view }) => {
    const cx = view.x + view.width / 2
    const cy = -(view.y + view.height / 2)
    const frame: Bounds = { min: { x: cx - width / 2, y: cy - height / 2 }, max: { x: cx + width / 2, y: cy + height / 2 }, width, height }
    return [floor, frame]
  }))
}

/** A floor page's picture, with the zoom of `grid draw`'s picture of that floor. */
function floorPicture(loaded: LoadedPlan, frames: ReadonlyMap<string, Bounds>, floor: string, ids: boolean, marks?: ScheduleMarkLabels, sections: readonly NamedSectionLine[] = []): SheetPicture {
  const frame = frames.get(floor)!
  const drawn = pictureView(loaded.plan, { floor })
  // The zoom at which a room name is MIN_LABEL_PT on paper: pixels of a name, times metres per
  // pixel, times points per metre of the box. `grid draw`'s zoom stands unless it is smaller.
  const shown = fitTo(frame, PLAN_BOX.width / PLAN_BOX.height)
  const readable = (MIN_LABEL_PT * shown.width) / (TEXT_PX.roomName * PLAN_BOX.width)
  return { kind: 'plan', floor, frame, metresPerPixel: Math.max(drawn.view.width / drawn.width, readable), ids, ...(marks === undefined ? {} : { marks }), ...(sections.length === 0 ? {} : { sections }) }
}

function undecidedNote(loaded: LoadedPlan, floor: string, w: Words): string[] {
  return undecidedDoorsOf(loaded.plan, floor).length > 0 ? [w.say('sheet.undecided')] : []
}

/**
 * WRT-7: the sheet's figures in the person's units, the plan's `display`; metres and square
 * metres, as before, when it has none. A table's rows still add up to its total in either.
 *
 * MSG-11: and in the sheet's language. English writes them exactly as WRT-7 does; another
 * language writes its own decimal mark (a comma in Spanish) unless the display states one
 * (`mark`), on the figures only, never on a name. A unit's words are said in the language.
 */
export interface SheetUnits {
  readonly metric: boolean
  /** `m²` or `sq ft`, for a heading. */
  readonly areaUnit: string
  /** Whether the area unit is square feet. */
  readonly feet: boolean
  /** A figure Grid wrote with a point, with the sheet's decimal mark. */
  mark(text: string): string
  length(metres: number, kind?: 'length' | 'height'): string
  /** An area as a number, without its unit. */
  area(squareMetres: number): string
  /** Areas that add up to their total, without their unit. */
  sum(parts: readonly number[], total: number): { parts: string[]; total: string }
}

function sheetUnits(plan: LoadedPlan['plan'], w: Words): SheetUnits {
  const display: Display = displayFor(undefined, undefined, plan)
  const metric = display.length === 'm' && display.area === 'm2' && display.decimal === 'point' && display.precision === undefined
  const language = w.language === DEFAULT_LANGUAGE ? null : decimalFor(w.language, plan.display?.decimal)
  const fm = (text: string): string => (language === 'comma' ? sayValue(w.language, num(text), { decimal: 'comma' }) : text)
  if (metric) {
    return {
      metric, feet: false, areaUnit: 'm²', mark: fm,
      length: (m) => `${fm(metresText(m))} m`,
      area: (a) => fm(areaText(a, 1)),
      sum: (parts, total) => {
        const shown = sumText(parts, total, 1)
        return { parts: shown.parts.map(fm), total: fm(shown.total) }
      },
    }
  }
  const feet = display.area === 'ft2'
  const decimals = feet ? 0 : 1
  const mark = (text: string): string => fm(display.decimal === 'comma' ? text.replace('.', ',') : text)
  const inUnit = (a: number): number => (feet ? sqFt(a) : a)
  return {
    metric,
    feet,
    areaUnit: feet ? w.say('sheet.unit.sqft') : 'm²',
    mark: fm,
    length: (m, kind = 'length') => fm(showLength(m, display, { kind })),
    area: (a) => mark(areaText(inUnit(a), decimals)),
    sum: (parts, total) => {
      const shown = sumText(parts.map(inUnit), inUnit(total), decimals)
      return { parts: shown.parts.map(mark), total: mark(shown.total) }
    },
  }
}

function areaTable(floor: FloorAreas, withUse: boolean, units: SheetUnits, w: Words): SheetTable {
  // CNT-8: a zone's floor is its room's, so the table has one row per room, and the column adds
  // up to the net. The plan draws each zone with its name and area.
  const places = floor.rooms.filter((r) => r.zoneOf === undefined)
  // SHT-11: a stair room over the stair below is counted there, so it is in no part of the sum.
  // CNT-7: an outdoor space is listed with its area, apart from the sum.
  const isCounted = (r: FloorAreas['rooms'][number]): boolean => r.countedWith === undefined && r.outdoor === undefined && r.void !== true
  // SHT-21: on a client sheet, rooms alike are one row ("60 × Bedroom"); the check sheet keeps each.
  const groups = withUse ? places.map((room) => ({ rooms: [room], name: room.name })) : groupRooms(places, isCounted)
  const counted = groups.filter((g) => isCounted(g.rooms[0]!))
  const shown = units.sum(counted.map((g) => g.rooms.reduce((sum, r) => sum + (r.net ?? 0), 0)), floor.net)
  const parts = new Map(counted.map((group, i) => [group, shown.parts[i]!] as const))
  return {
    heading: w.say('sheet.rooms', { unit: units.areaUnit }),
    // MSG-2: a room that could not be measured has no area, never 0.
    rows: groups.map((group) => {
      const room = group.rooms[0]!
      const part = parts.get(group)
      if (group.rooms.length > 1) {
        return { name: w.say('sheet.group', { count: group.rooms.length, name: group.name }), detail: w.say('sheet.group.each', { area: `${units.area(room.net!)} ${units.areaUnit}` }), area: part! }
      }
      return {
        name: room.name,
        detail: withUse && room.use !== null ? w.use(room.use) : null,
        area: room.net === null ? w.say('sheet.notMeasured') : room.outdoor !== undefined ? w.say('sheet.outdoor', { area: units.area(room.net) }) : part === undefined ? w.say('sheet.countedBelow') : part,
      }
    }),
    total: { name: w.say('sheet.netArea'), detail: null, area: shown.total },
    note: AREA_RULES.net,
  }
}

/** An area figure, or "not known" when the plan gives none (the reason goes in the notes). */
function areaFigure(value: number | null, label: string, units: SheetUnits, w: Words): SheetFigure {
  return { value: value === null ? w.say('sheet.notKnown') : `${units.area(value)} ${units.areaUnit}`, label }
}

/** The most access notes the first page prints; the rest are one line pointing to the full answer. */
const ACCESS_NOTES_MAX = 6

function accessLines(notes: readonly AccessNote[], units: SheetUnits, w: Words): string[] {
  const room = (n: string | null): string => n ?? w.say('sheet.access.outside')
  const line = (n: AccessNote): string => {
    const values = { figure: units.length(n.figure), value: units.length(n.measured) }
    if (n.kind === 'door') return w.say('sheet.access.door', { ...values, a: room(n.rooms[0] ?? null), b: room(n.rooms[1] ?? null) })
    return w.say(n.kind === 'corridor' ? 'sheet.access.corridor' : 'sheet.access.turning', { ...values, room: room(n.rooms[0] ?? null) })
  }
  return [...notes.slice(0, ACCESS_NOTES_MAX).map(line), ...(notes.length > ACCESS_NOTES_MAX ? [w.say('sheet.access.more')] : [])]
}

function clientBodies(loaded: LoadedPlan, words: SheetWords | null, name: string, w: Words, date: Date, accessNotes: readonly AccessNote[] = []): Body[] {
  const survey = surveyPlan(loaded.plan)
  const sides = sidesOf(loaded, w)
  const areas = planAreas(survey)
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const facts = planFacts(loaded.plan)
  const title = words?.name ?? name
  const units = sheetUnits(loaded.plan, w)
  // ARE-60: a US home is headlined by its living area under air and its total under roof, never
  // by a gross figure with the garage in.
  const first = areas.underAir.first
  const headline: SheetFigure[] = first
    ? [areaFigure(areas.conditioned, w.say('sheet.figure.conditioned'), units, w), areaFigure(areas.underRoof, w.say('sheet.figure.underRoof'), units, w)]
    : [areaFigure(areas.grossInternal, w.say('sheet.figure.grossInternal'), units, w)]
  // SHT-21: then the figures the building's kind is judged by, its storeys, heights and ratio.
  const { figures, more } = coverFigures(survey, areas, headline, units, w)

  const stairsDrawn = facts.connections.stairs.length > 0
  const limits = facts.connections.unjoined.length > 0 ? [w.say('sheet.stairLimit')] : []
  const cover: Body = {
    kind: 'cover', floor: null, topLine: title, title, subtitle: words?.headline ?? null,
    paragraphs: words?.intro ?? [], figures, table: null, picture: { kind: 'model' },
    notes: [
      ...accessLines(accessNotes, units, w),
      ...(first
        ? (['conditioned', 'underRoof'] as const).flatMap((m) => (areas[m] === null && areas.underAirWhy[m] !== null ? [areas.underAirWhy[m]!] : []))
        : areas.grossInternal === null && areas.grossWhy !== null ? [areas.grossWhy] : []),
      ...(more === null ? [] : [more]),
      roundingNote(units, w),
    ],
  }
  // Never an id here: floors that share a name are told apart by their place in the plan.
  const named = (name: string) => floors.filter((f) => f.name === name).length
  const floorTitle = new Map(floors.map((floor, i) => [floor.id, named(floor.name) > 1 ? w.say('sheet.floorNumbered', { floor: floor.name, number: i + 1 }) : floor.name] as const))
  const leftOut = new Set(floors.filter((floor) => floorIssues(loaded, floor.id).some((issue) => loaded.broken.has(issue.id))).map((floor) => floor.id))
  // SHT-21: alike floors are printed once, as a typical floor; a floor with its own words, or with
  // a part left out, is never folded into another.
  const apart = new Set([...leftOut, ...floors.filter((floor) => (words?.floors?.[floor.id] ?? []).length > 0).map((floor) => floor.id)])
  const sets = typicalFloors(loaded.plan, areas, apart)
  const typical = sets.filter((set) => set.length > 1)
  const setTitle = (set: readonly string[]): string => {
    if (set.length === 1) return floorTitle.get(set[0]!)!
    return typical.length === 1 ? w.say('sheet.typicalFloor') : w.say('sheet.typicalFloor.numbered', { number: typical.indexOf(set as string[]) + 1 })
  }
  const pages = sets.map((set): Body => {
    const id = set[0]!
    const floorAreas = areas.floors.find((f) => f.floor === id)
    const pageTitle = setTitle(set)
    const nets = set.map((floor) => areas.floors.find((f) => f.floor === floor)?.net ?? 0)
    return {
      kind: 'floor', floor: id, topLine: `${title} / ${pageTitle}`, title: pageTitle,
      subtitle: set.length === 1 ? null : w.say('sheet.typicalFloor.stands', { count: set.length, floors: set.map((floor) => floorTitle.get(floor)!).join(w.say('join.comma')) }),
      ...(set.length === 1 ? {} : { stands: set }),
      paragraphs: words?.floors?.[id] ?? [], figures: [],
      table: floorAreas ? areaTable(floorAreas, false, units, w) : null,
      picture: floorPicture(loaded, frames, id, false, undefined, sides?.cuts),
      notes: [
        ...(set.length === 1 ? [] : [w.say('sheet.typicalFloor.each', { count: set.length, area: units.sum(nets, nets.reduce((a, b) => a + b, 0)).total, unit: units.areaUnit })]),
        notShownNote(loaded.plan, id, stairsDrawn, w.language), ...limits, ...(leftOut.has(id) ? [w.say('sheet.leftOutLimit')] : []), ...undecidedNote(loaded, id, w),
      ],
    }
  })
  // When floors were folded, the area by floor and by use, so nothing a page stands for is lost.
  return [cover, ...pages, ...sideBodies(sides, title, date, w, 'client'), ...(typical.length === 0 ? [] : areaScheduleBodies(sets, setTitle, areas, units, w, title))]
}

/**
 * SHT-21: the area schedule after a client sheet's floors, when some were printed once: one row
 * per floor page (a typical floor's counts all its floors), then the whole building by use. Both
 * add up to the net area, from `planAreas`' rooms as each floor's table counts them.
 */
function areaScheduleBodies(sets: readonly string[][], setTitle: (set: readonly string[]) => string, areas: PlanAreas, units: SheetUnits, w: Words, title: string): Body[] {
  const floorOf = (id: string) => areas.floors.find((f) => f.floor === id)
  const counted = (floor: FloorAreas | undefined) => (floor?.rooms ?? []).filter((r) => r.zoneOf === undefined && r.countedWith === undefined && r.outdoor === undefined && r.void !== true)
  const useName = (use: string): string => (use === '' ? w.say('sheet.useNotSaid') : w.use(use))
  const byUse = (rooms: readonly FloorAreas['rooms'][number][], times = 1): Map<string, number> => {
    const out = new Map<string, number>()
    for (const room of rooms) out.set(room.use ?? '', (out.get(room.use ?? '') ?? 0) + (room.net ?? 0) * times)
    return out
  }
  const nets = sets.map((set) => set.reduce((sum, id) => sum + (floorOf(id)?.net ?? 0), 0))
  const total = nets.reduce((a, b) => a + b, 0)
  const shownFloors = units.sum(nets, total)
  const floorRows: SheetRow[] = sets.map((set, i) => ({
    name: set.length === 1 ? setTitle(set) : w.say('sheet.typicalFloor.times', { title: setTitle(set), count: set.length }),
    detail: [...byUse(counted(floorOf(set[0]!)), set.length)].map(([use, area]) => w.say('sheet.areaSchedule.use', { use: useName(use), area: units.area(area) })).join(w.say('join.comma')) || null,
    area: shownFloors.parts[i]!,
  }))
  const uses = byUse(sets.flatMap((set) => set.flatMap((id) => counted(floorOf(id)))))
  const shownUses = units.sum([...uses.values()], total)
  const useRows: SheetRow[] = [...uses.keys()].map((use, i) => ({ name: useName(use), detail: null, area: shownUses.parts[i]! }))
  const body = (heading: string, rows: readonly SheetRow[], shownTotal: string): Body => ({
    kind: 'summary', floor: null, topLine: `${title} / ${w.say('sheet.areaSchedule')}`, title: w.say('sheet.areaSchedule'), subtitle: null,
    paragraphs: [], figures: [], picture: null, notes: [],
    table: { heading, rows, total: { name: w.say('sheet.netArea'), detail: null, area: shownTotal }, note: AREA_RULES.net },
  })
  return [
    body(w.say('sheet.areaSchedule.floors', { unit: units.areaUnit }), floorRows, shownFloors.total),
    body(w.say('sheet.areaSchedule.uses', { unit: units.areaUnit }), useRows, shownUses.total),
  ]
}

/**
 * SHT-23: the elevations page and the sections page, both at one scale, each with its title block;
 * none when the plan has nothing to draw, and a page only for what it has. The check sheet lists
 * what the sections took that the plan does not state; the client sheet says in one line that
 * they took some, and that the check sheet lists it.
 */
function sideBodies(sides: ReturnType<typeof sideDrawings>, title: string, date: Date, w: Words, layout: SheetLayout): Body[] {
  if (sides === null) return []
  const scale = scaleText(sides.scale)
  const block = (drawing: string): TitleBlockWords => ({
    project: title,
    drawing,
    scale: w.say('sheet.block.scaleOn', { scale, paper: 'A3' }),
    date: dateText(date, w),
    status: w.say('sheet.status.draft'),
    labels: {
      project: w.say('sheet.block.project'), drawing: w.say('sheet.block.drawing'), scale: w.say('sheet.block.scale'),
      date: w.say('sheet.block.date'), status: w.say('sheet.block.status'),
    },
  })
  const page = (kind: 'elevations' | 'sections', pageTitle: string, subtitle: string, drawings: readonly PlacedDrawing[], notes: readonly string[]): Body => ({
    kind, floor: null, topLine: `${title} / ${pageTitle}`, title: pageTitle, subtitle,
    paragraphs: [], figures: [], table: null,
    picture: { kind: 'drawings', scale: sides.scale, drawings, block: block(pageTitle) },
    notes: [w.say('sheet.sides.trueScale', { scale }), ...notes],
  })
  return [
    ...(sides.elevations.length === 0 ? [] : [page('elevations', w.say('sheet.elevations'), w.say('sheet.elevations.subtitle', { scale }), sides.elevations, [])]),
    ...(sides.sections.length === 0 ? [] : [page('sections', w.say('sheet.sections'), w.say('sheet.sections.subtitle', { scale, labels: sides.cuts.map((cut) => cut.label).join(w.say('join.and')) }), sides.sections, [
      w.say('sheet.sections.marked'),
      // What the sections took, said under the drawings as the band under a section picture says it.
      ...(sides.taken.some((t) => t.assumed.hatched) ? [w.say('drawing.section.hatched')] : []),
      ...(layout === 'client' ? (sides.taken.length === 0 ? [] : [w.say('sheet.sections.takenShort')]) : sides.taken.map((t) => w.say(t.labels.length === 1 ? 'sheet.sections.taken' : 'sheet.sections.takenMany', { sections: t.labels.join(w.say('join.and')), what: w.said(t.assumed.words, t.assumed.said) }))),
    ])]),
  ]
}

/** SHT-23: the sheet's elevations and sections, in its language. */
const sidesOf = (loaded: LoadedPlan, w: Words): ReturnType<typeof sideDrawings> =>
  sideDrawings(loaded.plan, { look: SHEET_LOOK, ...(w.language === DEFAULT_LANGUAGE ? {} : { language: w.language }) })

const ENTITY_KEYS: Readonly<Record<string, MessageKey>> = {
  wall: 'sheet.entity.wall', room: 'sheet.entity.room', opening: 'sheet.entity.opening', plan: 'sheet.entity.plan',
  floor: 'sheet.entity.floor', item: 'sheet.entity.item', stair: 'sheet.entity.stair',
}

function issueLine(issue: { severity: string; entity: string; id: string; message: string; said?: Said }, w: Words = ENGLISH): string {
  const entityKey = ENTITY_KEYS[issue.entity]
  return w.say(issue.severity === 'error' ? 'sheet.issue.error' : 'sheet.issue.warning', {
    entity: entityKey === undefined ? issue.entity : w.say(entityKey),
    id: name(issue.id),
    message: w.said(issue.message, issue.said),
  })
}

/** A finding, by the ids of the rooms and openings it names, as a drawing problem is by its own. */
export function findingLine(finding: Parameters<typeof findingReadFor>[0] & { rooms: readonly string[]; openings: readonly string[]; message: string; said?: Said }, w: Words = ENGLISH): string {
  const ids = (kind: 'room' | 'opening', list: readonly string[]): string[] =>
    list.length === 0 ? [] : [w.say(`sheet.finding.${kind}.${list.length === 1 ? 'one' : 'many'}`, { ids: joined(list.map(name), 'join.comma') })]
  const named = [...ids('room', finding.rooms), ...ids('opening', finding.openings)]
  // COD-2: a finding that used a figure says which kind of building the figure was read for.
  const kinds = findingReadFor(finding)
  const own = w.said(finding.message, finding.said)
  const message = kinds.length === 0 ? own : `${own}. ${readForSentence(kinds)}`
  return named.length === 0 ? w.say('sheet.finding', { message }) : w.say('sheet.finding.named', { named: named.join(w.say('join.comma')), message })
}

function noticeLine(notice: { message: string; said?: Said }, w: Words = ENGLISH): string {
  return w.say('sheet.notChecked', { message: w.said(notice.message, notice.said) })
}

function checkBodies(loaded: LoadedPlan, name: string, w: Words, date: Date): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const sides = sidesOf(loaded, w)
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const whole = checkPlan(loaded, {})
  const units = sheetUnits(loaded.plan, w)
  const figures: SheetFigure[] = [
    { value: String(whole.report.findings.length), label: w.say('sheet.figure.findings') },
    { value: String(whole.issues.length), label: w.say('sheet.figure.problems') },
    areaFigure(areas.net, w.say('sheet.figure.net'), units, w),
    areaFigure(areas.grossInternal, w.say('sheet.figure.grossInternal'), units, w),
    areaFigure(areas.grossExternal, w.say('sheet.figure.grossExternal'), units, w),
  ]
  const checkSet = w.say('sheet.checkSet')
  const why = w.say('sheet.nothingFound')
  const summary: Body = {
    kind: 'summary', floor: null, topLine: `${name} / ${checkSet}`, title: checkSet, subtitle: null,
    paragraphs: [describeText(planFacts(loaded.plan), 'line', 'person', { language: w.language, options: {} }).trim()],
    figures, table: null, picture: null,
    notes: [
      // COD-3: the place the figures were for, or that none was stated and no figure applied.
      inLanguage(w.language, undefined, () => placeText(whole.report, 'sheet')),
      ...(whole.report.findings.length === 0 ? [w.say('sheet.findings.none', { why })] : []),
      AREA_RULES.net, AREA_RULES.grossInternal, AREA_RULES.grossExternal,
      ...(areas.grossWhy === null ? [] : [areas.grossWhy]),
      // What belongs to no floor is said once, here; each floor page says the rest.
      ...whole.issues.filter((i) => i.entity === 'plan').map((i) => issueLine(i, w)),
      ...whole.report.notChecked.filter((n) => n.floor === '').map((n) => noticeLine(n, w)),
      ...whole.report.limits,
    ],
  }
  // ARE-15: each floor's drawing carries the marks of the schedule pages that follow it.
  const marks = scheduleMarkLabels(surveyPlan(loaded.plan))
  const pages = floors.map((floor): Body => {
    const result = checkOnFloor(loaded, whole, floor.id)
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const shown = [
      ...(result.report.findings.length === 0 ? [w.say('sheet.floorFindings.none', { why })] : []),
      ...result.report.findings.map((f) => findingLine(f, w)),
      ...result.issues.filter((i) => i.entity !== 'plan').map((i) => issueLine(i, w)),
      ...result.report.notChecked.filter((n) => n.floor !== '').map((n) => noticeLine(n, w)),
      ...undecidedNote(loaded, floor.id, w),
    ]
    // The floor's id, as each room's label carries the room's.
    const floorTitle = `${floor.name} [${floor.id}]`
    return {
      kind: 'floor', floor: floor.id, topLine: `${name} / ${floorTitle}`, title: floorTitle, subtitle: null,
      paragraphs: [], figures: [],
      table: floorAreas ? areaTable(floorAreas, true, units, w) : null,
      picture: floorPicture(loaded, frames, floor.id, true, marks, sides?.cuts),
      notes: shown,
    }
  })
  return [summary, ...pages, ...sideBodies(sides, name, date, w, 'check'), ...scheduleBodies(loaded, name, w)]
}

/**
 * ARE-12: the room schedule and the door and window schedule, as tables on the check set, from
 * the same rows as `grid_schedule` (of=rooms, of=openings). The totals cover all floors, and each
 * floor's total names its floor.
 */
function scheduleBodies(loaded: LoadedPlan, name: string, w: Words): Body[] {
  const survey = surveyPlan(loaded.plan)
  const rooms = roomSchedule(survey)
  const openings = openingSchedule(survey)
  const several = rooms.floors.length > 1
  const units = sheetUnits(loaded.plan, w)
  const roomRows: SheetRow[] = rooms.rows.map((r) => ({
    // CNT-9: a stated room number wins over Grid's, and the room's own facts close the detail.
    name: `${shownNumber(r)}. ${r.name}`,
    detail: [
      r.use === null ? w.say('sheet.useNotSaid') : w.use(r.use),
      r.height === null ? w.say('sheet.heightNotKnown') : w.say('sheet.high', { height: units.length(r.height) }),
      ...(several ? [r.floorName] : []),
      ...(Object.keys(r.properties).length > 0 ? [factsText(r.properties)] : []),
    ].join(w.say('join.comma')),
    area: r.area === null ? w.say('sheet.notMeasured') : units.area(r.area),
  }))
  for (const t of rooms.floors) if (several) roomRows.push({ name: w.say('sheet.total.floor', { floor: String(t.floorName) }), detail: w.say('sheet.roomCount', { count: t.rooms }), area: units.area(t.area) })
  const total = rooms.total
  const roomTable: SheetTable = {
    heading: w.say('sheet.roomSchedule.heading', { unit: units.areaUnit }),
    rows: roomRows,
    total: {
      name: w.say(several ? 'sheet.total.all' : 'sheet.total'),
      // WRT-7: the other unit beside the total: square metres beside square feet, and the other way round.
      detail: units.feet
        ? w.say('sheet.total.rooms.metric', { count: total.rooms, area: units.mark(areaText(total.area, 1)) })
        : w.say('sheet.total.rooms', { count: total.rooms, sqft: Math.round(sqFt(total.area)) }),
      area: units.area(total.area),
    },
    note: rooms.rules[0]!,
  }
  // WRT-7: a size in the plan's display, as one figure in metres or each length in its unit.
  const sizeText = (width: number, height: number): string => units.metric ? `${units.mark(metresText(width))} × ${units.mark(metresText(height))} m` : `${units.length(width)} × ${units.length(height)}`
  const openingRows: SheetRow[] = openings.rows.map((r) => ({
    // CNT-14: its kind, as the plan states it.
    // ARE-15: by its mark, as the floor's drawing shows it.
    name: `${r.mark} ${w.say((r.type === 'opening' || r.kind === null ? `sheet.type.${r.type}` : `sheet.kind.${r.type}.${r.kind}`) as MessageKey)} ${r.id}`,
    detail: `${sizeText(r.width, r.height)}${r.type === 'window' ? `, ${w.say('sheet.sill', { sill: units.length(r.sill, 'height') })}` : ''}${r.opens === null ? '' : `, ${w.say('sheet.opens', { size: sizeText(r.opens.width, r.opens.height) })}`}${r.handing === null ? '' : `, ${w.said(r.handing, r.handingSaid ?? undefined)}`}, ${r.between[0]} – ${r.between[1]}${several ? `, ${r.floorName}` : ''}${Object.keys(r.properties).length > 0 ? `, ${factsText(r.properties)}` : ''}`,
    area: '1',
  }))
  const c = openings.counts
  const openingTable: SheetTable = {
    heading: w.say('sheet.openingSchedule.heading'),
    rows: openingRows,
    total: { name: w.say('sheet.inAll'), detail: w.say('sheet.openingCounts', { doors: c.door, windows: c.window, openings: c.opening }), area: String(c.door + c.window + c.opening) },
    note: openings.rule,
  }
  const body = (title: string, table: SheetTable, notes: readonly string[] = []): Body => ({
    kind: 'summary', floor: null, topLine: `${name} / ${title}`, title, subtitle: null,
    paragraphs: [], figures: [], table, picture: null, notes: [...notes],
  })
  // ARE-15: the doors and windows by type, kind and size, each with its openings' marks.
  const types = [openingTypeSchedule(survey, 'door'), openingTypeSchedule(survey, 'window')]
  const typeRows: SheetRow[] = types.flatMap((t) => t.rows).map((r, i) => ({
    name: `${i + 1}. ${w.say((r.kind === null ? `sheet.type.${r.type}` : `sheet.kind.${r.type}.${r.kind}`) as MessageKey)} ${sizeText(r.width, r.height)}`,
    detail: [
      ...(r.opens === null ? [] : [w.say('sheet.opens', { size: sizeText(r.opens.width, r.opens.height) })]),
      ...(r.type === 'window' ? [w.say('sheet.sill', { sill: r.sills.map((sill) => units.length(sill, 'height')).join(' / ') })] : []),
      w.say('sheet.openingType.marks', { marks: r.marks.join(', ') }),
    ].join(w.say('join.comma')),
    area: String(r.count),
  }))
  const typeTable: SheetTable = {
    heading: w.say('sheet.openingTypes.heading'),
    rows: typeRows,
    total: { name: w.say('sheet.inAll'), detail: w.say('sheet.openingTypes.count', { types: typeRows.length, doors: types[0]!.count, windows: types[1]!.count }), area: String(types[0]!.count + types[1]!.count) },
    note: types[0]!.rule,
  }
  const bodies = [body(w.say('sheet.roomSchedule'), roomTable), body(w.say('sheet.openingSchedule'), openingTable), body(w.say('sheet.openingTypes'), typeTable)]
  // CNT-4: on a plan that lists flats, the flats and the mix by type, from grid_schedule of=flats's rows.
  // MSG-11: in the sheet's words; the areas are in square metres, as CNT-4 writes them, with the sheet's decimal mark.
  if ((loaded.plan.flats ?? []).length > 0) {
    const flats = flatSchedule(survey)
    const m2 = (area: number): string => units.mark(areaText(area, 1))
    const flatRows: SheetRow[] = flats.rows.map((r) => ({
      name: `${r.number}. ${r.name}`,
      detail: [
        r.typeName ?? w.say('sheet.flat.noType'),
        ...(r.mirrored ? [w.say('sheet.flat.mirrored')] : []),
        w.say('sheet.roomCount', { count: r.rooms }),
        w.say(r.bedrooms === 1 ? 'sheet.flat.bedrooms.one' : 'sheet.flat.bedrooms.many', { count: r.bedrooms }),
        ...(several ? [r.floors.join(w.say('join.and'))] : []),
      ].join(w.say('join.comma')),
      area: m2(r.area),
    }))
    flatRows.push({ name: w.say('sheet.flat.none'), detail: w.say('sheet.flat.none.detail'), area: m2(flats.notInFlats) })
    const flatTable: SheetTable = {
      heading: w.say('sheet.flatSchedule.heading'),
      rows: flatRows,
      total: { name: w.say('sheet.flat.all'), detail: w.say('sheet.flat.count', { count: flats.total.flats }), area: m2(flats.total.area) },
      note: flats.rules[1]!,
    }
    const mix = flats.mix.map((m) =>
      w.say(m.flats === 1 ? 'sheet.flat.mixType.one' : 'sheet.flat.mixType.many', {
        name: m.name,
        count: m.flats,
        mirrored: m.mirrored === 0 ? '' : w.say('sheet.flat.mixMirrored', { count: m.mirrored }),
        area: m2(m.area),
      })
    )
    bodies.push(body(w.say('sheet.flatSchedule'), flatTable, [w.say('sheet.flat.mix', { mix: mix.join(' ') }), flats.rules[0]!]))
  }
  return bodies
}

export function sheetPages(loaded: LoadedPlan, words: SheetWords | null, layout: SheetLayout, options: SheetOptions): Sheet {
  // A check sheet takes nothing from sheet.json, not even its name.
  const name = layout === 'client' ? words?.name ?? loaded.plan.name ?? options.name : loaded.plan.name ?? options.name
  const w = wordsIn(options.language ?? DEFAULT_LANGUAGE)
  const bodies = layout === 'client' ? clientBodies(loaded, words, loaded.plan.name ?? options.name, w, options.date, options.accessNotes) : checkBodies(loaded, loaded.plan.name ?? options.name, w, options.date)
  const date = dateText(options.date, w)
  const label = w.say('label')
  const pages = bodies.map((body, i): SheetPage => ({
    ...body,
    footer: { label, page: i + 1, pages: bodies.length, date },
  }))
  return { layout, name, pages, language: w.language }
}
