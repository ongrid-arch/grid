/**
 * VEW-7: the files of `grid sheet` and `grid_sheet`. The words are read from the plan's own
 * `<plan>.sheet.json` beside it (SHT-17; `plan.json` also reads an older `sheet.json`), or from
 * the file named; the PDF goes into `exports/` beside the plan, or to the file named. Every file goes through the project (`projectFiles.ts`).
 */
import path from 'path'
import { planFloors } from '@ongrid/floorplan/geometry'
import { SheetWordsRefused, type SheetWords } from '@ongrid/floorplan/types/sheet'
import { accessNotes } from './accessNotes'
import { parseSheetWordsChecked } from './claims'
import { exportBaseOf, exportTime, writeBesidePlan } from '../command/export'
import { loadPlan, PlanRefused, type LoadedPlan } from '../command/plan'
import { UsageError } from '../command/options'
import { askedLanguage, languageFor, spokenPlan } from '../command/language'
import type { Language } from '@ongrid/floorplan/messages'
import { quoted, type Project } from '../fs/projectFiles'
import { sheetPages, SHEET_LAYOUTS, type SheetLayout } from './pages'
import { sheetPdf } from './pdf'
import { floorOption } from '../command/plan'
// SHT-6: the drawing's layout and files load only when one is made: a chunk of their own.
import type { DrawingRequest, DrawingSet } from './drawingSheet'
import { PAPER_NAMES, SCALE_MAX, scaleText, type PaperName } from './drawingPapers'

export const SHEET_FILE = 'sheet.json'
export const SHEET_SUFFIX = '.sheet.json'
const SHEET_FILE_MAX_BYTES = 64 * 1024

/**
 * `lang`: MSG-11's `--lang`, as given; read with `sheetLanguage`. SHT-6: `scale`, `paper`,
 * `floor` and `roomSizes` are the drawing's (`--layout drawing`), as given.
 */
export interface SheetRequest {
  readonly layout?: string
  readonly sheet?: string
  readonly out?: string
  readonly lang?: string
  readonly scale?: string
  readonly paper?: string
  readonly floor?: string
  readonly roomSizes?: string
  /** SHT-20: `--split`, a drawing's floor too large for the paper cut over pages. */
  readonly split?: boolean
  /** SHT-16: the date to write on the sheet, as given (the form `grid export --date` takes). */
  readonly date?: string
}

/** SHT-6: what `grid sheet` makes: one of VEW-7's sheets, or one drawing at a true scale. */
export type SheetKind = SheetLayout | 'drawing'
export const SHEET_KINDS: readonly SheetKind[] = [...SHEET_LAYOUTS, 'drawing']

/** The options only a drawing takes, by the name the command gives them. */
const DRAWING_OPTIONS = [['scale', '--scale'], ['paper', '--paper'], ['floor', '--floor'], ['roomSizes', '--room-sizes'], ['split', '--split']] as const

/**
 * SHT-6: the sheet a request asks for. `--layout drawing`, or no layout with a drawing's own
 * option (`--scale`, `--paper`, `--floor`, `--room-sizes`), is the drawing; else VEW-7's layout.
 */
export function sheetKindOf(request: SheetRequest): SheetKind {
  const drawingAsked = DRAWING_OPTIONS.filter(([field]) => request[field] !== undefined && request[field] !== false).map(([, option]) => option)
  if (request.layout === 'drawing' || (request.layout === undefined && drawingAsked.length > 0)) {
    checkDrawingRequest(request)
    return 'drawing'
  }
  if (request.layout !== undefined && (SHEET_LAYOUTS as readonly string[]).includes(request.layout) && drawingAsked.length > 0) {
    throw new UsageError(`${drawingAsked.join(' and ')} ${drawingAsked.length === 1 ? 'is' : 'are'} for a drawing at a scale (--layout drawing), not a ${request.layout} sheet: leave ${drawingAsked.length === 1 ? 'it' : 'them'} out.`)
  }
  return checkSheetRequest(request)
}

/** SHT-6: `--scale`, as `1:100` or `100`: N, a whole number from 1 to `SCALE_MAX`. */
export function scaleOption(text: string): number {
  const match = /^(?:1:)?(\d{1,4})$/.exec(text.trim())
  const scale = match === null ? NaN : Number(match[1])
  if (!Number.isInteger(scale) || scale < 1 || scale > SCALE_MAX) {
    throw new UsageError(`--scale takes 1:N, N a whole number from 1 to ${SCALE_MAX}, such as 1:50, 1:100 or 1:200.`)
  }
  return scale
}

/** SHT-6: `--paper`: A4, A3, A2, A1 or A0, in either case. */
export function paperOption(text: string): PaperName {
  const paper = text.trim().toUpperCase()
  if (!(PAPER_NAMES as readonly string[]).includes(paper)) throw new UsageError(`--paper takes ${PAPER_NAMES.slice(0, -1).join(', ')} or ${PAPER_NAMES.at(-1)}.`)
  return paper as PaperName
}

/** SHT-6: the drawing's request, read and checked. The floor is checked against the plan when it is read. */
export function checkDrawingRequest(request: SheetRequest): DrawingRequest {
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== '.pdf') {
    throw new UsageError('--out must name a .pdf file: the SVG and the PNG are written beside it.')
  }
  if (request.roomSizes !== undefined && request.roomSizes !== 'on' && request.roomSizes !== 'off') {
    throw new UsageError('--room-sizes takes on or off.')
  }
  sheetLanguage(request)
  exportTime(request.date)
  return {
    ...(request.scale === undefined ? {} : { scale: scaleOption(request.scale) }),
    ...(request.paper === undefined ? {} : { paper: paperOption(request.paper) }),
    ...(request.floor === undefined ? {} : { floor: request.floor }),
    ...(request.roomSizes === undefined ? {} : { roomSizes: request.roomSizes === 'on' }),
    ...(request.split === true ? { split: true } : {}),
  }
}

/** The language a sheet request asks for (`--lang`), refused by name when Grid does not write it; undefined when none is asked. */
export function sheetLanguage(request: SheetRequest): Language | undefined {
  return askedLanguage(request.lang)
}

export function checkSheetRequest(request: SheetRequest): SheetLayout {
  const layouts = `${SHEET_LAYOUTS.join(', ')} or drawing`
  // CMD-35: no layout is the client sheet, the one most people want.
  const layout = request.layout ?? 'client'
  if (!(SHEET_LAYOUTS as readonly string[]).includes(layout)) throw new UsageError(`--layout takes ${layouts}.`)
  if (layout === 'check' && request.sheet !== undefined) {
    throw new UsageError('--sheet gives the words of a client sheet; a check sheet takes none: leave --sheet out.')
  }
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== '.pdf') {
    throw new UsageError('--out must name a .pdf file.')
  }
  sheetLanguage(request)
  exportTime(request.date)
  return layout as SheetLayout
}

/**
 * The file's text. A missing file is no words (null) when `mayBeMissing`, else a refusal. A
 * refusal names the file as `shown`.
 */
function readSheetFile(project: Project, file: string, shown: string, mayBeMissing: boolean): string | null {
  try {
    return project.readText(file, SHEET_FILE_MAX_BYTES).text
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' && mayBeMissing) return null
    if (code === 'ENOENT') throw new PlanRefused(`There is no file ${quoted(shown)}.`)
    if (code === 'EISDIR') throw new PlanRefused(`${quoted(shown)} is a folder, not a sheet file.`)
    if (code === 'EFBIG') throw new PlanRefused(`${quoted(shown)} is larger than ${SHEET_FILE_MAX_BYTES / 1024} KB, the most Grid reads in a sheet file.`)
    throw error
  }
}

/** SHT-17: the words file of a plan file, beside it: its name without `.json`, then `.sheet.json`. */
export function sheetFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${SHEET_SUFFIX}`)
}

/**
 * The words for a client sheet: the file named, else the plan's own `<plan>.sheet.json` beside
 * it, else none. Only the project's own plan, `plan.json`, also reads the older shared
 * `sheet.json`, so another plan in the folder never gets its words. A file named is called what
 * it was named; the one beside the plan, by its path in the project.
 */
export function readSheetWords(project: Project, planFile: string, loaded: LoadedPlan, given: string | undefined): SheetWords | null {
  const candidates = given !== undefined ? [given] : [sheetFileOf(planFile)]
  if (given === undefined && path.basename(planFile).toLowerCase() === 'plan.json') candidates.push(path.join(path.dirname(planFile), SHEET_FILE))
  let shown = given ?? ''
  let text: string | null = null
  for (const file of candidates) {
    shown = given ?? project.relative(project.resolve(file))
    text = readSheetFile(project, file, shown, given === undefined)
    if (text !== null) break
  }
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new PlanRefused(`${quoted(shown)} is not JSON.`)
  }
  try {
    return parseSheetWordsChecked(raw, planFloors(loaded.plan).map((floor) => floor.id))
  } catch (error) {
    if (error instanceof SheetWordsRefused) throw new PlanRefused(`${quoted(shown)} is not a sheet: ${error.message}.`)
    throw error
  }
}

/** A sheet made and not yet written: the plan as read, the PDF and its laid-out pages. */
export interface MadeSheet {
  readonly loaded: LoadedPlan
  readonly pdf: Uint8Array
  /** What is on each page; a floor page, or its continuation, also says which floor. */
  readonly pages: readonly { readonly kind: string; readonly title: string | null; readonly floor?: string }[]
  /** The name of the file in `exports/`, and why Grid changed the sheet's name, when it did. */
  readonly fileName: string
  readonly note?: string
  /** Each page as a small PNG, when asked for (VEW-62). */
  readonly previews?: readonly Uint8Array[]
}

/**
 * Reads the plan and makes the sheet. `grid sheet --out` writes it where it is told. MSG-11: its
 * words are in `language` when one is asked for, else the plan's own (`display.language`), else
 * English.
 */
export async function makeSheet(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, language?: Language, date?: string, previews = false): Promise<MadeSheet> {
  const read = loadPlan(project, planFile)
  const lang = await languageFor(language, read.plan)
  // MSG-22: the floor the plan names in no list, named in the sheet's language.
  const loaded = spokenPlan(read, lang)
  const { base, note } = exportBaseOf(planFile)
  const notes = layout === 'client' ? accessNotes(project, planFile, loaded) : []
  const sheet = sheetPages(loaded, words, layout, { name: base, date: exportTime(date), accessNotes: notes, language: lang })
  // The laid-out sheet is the one written: text that did not fit flows onto continuation pages.
  const { pdf, sheet: laidOut, previews: small } = await sheetPdf(loaded.plan, sheet, { previews })
  const pages = laidOut.pages.map((page) => (page.floor === null ? { kind: page.kind, title: page.title } : { kind: page.kind, title: page.title, floor: page.floor }))
  const fileName = `${base}-${layout}.pdf`
  const shown = previews ? { previews: small } : {}
  return note === undefined
    ? { loaded, pdf, pages, fileName, ...shown }
    // The name the sheet shows and its file in exports/ start with: true of --out as well.
    : { loaded, pdf, pages, fileName, note: `Named the sheet ${base}: ${note}.`, ...shown }
}

export interface SheetDone {
  readonly loaded: LoadedPlan
  /** The real path written. */
  readonly written: string
  readonly pages: MadeSheet['pages']
  readonly note?: string
  readonly previews?: readonly Uint8Array[]
}

/**
 * Makes the sheet and writes it into `exports/` beside the plan, replacing an earlier copy, as
 * `grid export` writes its files. The command and the tool server both call this.
 */
export async function sheetIntoProject(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, language?: Language, date?: string, previews = false): Promise<SheetDone> {
  const made = await makeSheet(project, planFile, layout, words, language, date, previews)
  const { loaded, pdf, pages, fileName, note } = made
  const written = writeBesidePlan(project, planFile, fileName, pdf)
  const shown = made.previews === undefined ? {} : { previews: made.previews }
  return note === undefined ? { loaded, written, pages, ...shown } : { loaded, written, pages, note, ...shown }
}

/** SHT-6: a drawing at a scale made and not yet written: its files and how they are named. */
export interface MadeDrawing {
  readonly loaded: LoadedPlan
  /** SHT-20: every page, at one scale on one paper. */
  readonly set: DrawingSet
  /** One PDF of every page; an SVG and a PNG of each page, in order. */
  readonly files: { readonly pdf: Uint8Array; readonly svgs: readonly string[]; readonly pngs: readonly Uint8Array[] }
  /** The name of the files in `exports/`, without the extension. */
  readonly stem: string
  readonly note?: string
}

/**
 * The drawing's file names: the plan's export name, its floor by its place when one floor of
 * several is drawn, `-drawing`, and its scale and paper (`-1-100-A3`) once the sheet is made.
 * SHT-20: every floor of a plan of several is drawn under no floor's place.
 */
function drawingStem(planFile: string, loaded: LoadedPlan, floors: readonly string[], made?: { scale: number; paper: string }): { stem: string; note?: string } {
  const { base, note } = exportBaseOf(planFile)
  const all = planFloors(loaded.plan)
  const place = all.length > 1 && floors.length === 1 ? `-floor-${all.findIndex((f) => f.id === floors[0]) + 1}` : ''
  const stem = `${base}${place}-drawing${made === undefined ? '' : `-1-${made.scale}-${made.paper}`}`
  return note === undefined ? { stem } : { stem, note: `Named the sheet ${base}: ${note}.` }
}

/** SHT-20: the name of a page's SVG or PNG: the drawing's own when it has one page, else `-page-<n>` after it. */
export function pageFile(stem: string, pages: number, index: number, extension: 'svg' | 'png'): string {
  return pages === 1 ? `${stem}.${extension}` : `${stem}-page-${index + 1}.${extension}`
}

/**
 * SHT-6: reads the plan and makes the drawing at a true scale. The project's name is the sheet
 * words' name (`sheet.json`), else the plan's title, else the export name of the plan's file.
 * SHT-20: every floor when none is asked for, all at one scale on one paper.
 */
export async function makeDrawing(project: Project, planFile: string, request: DrawingRequest, words: SheetWords | null, language?: Language, date?: string): Promise<MadeDrawing> {
  const read = loadPlan(project, planFile)
  const lang = await languageFor(language, read.plan)
  // MSG-22: the floor the plan names in no list, named in the drawing's language.
  const loaded = spokenPlan(read, lang)
  const floor = floorOption(loaded.plan, request.floor)
  const named = drawingStem(planFile, loaded, floor === undefined ? planFloors(loaded.plan).map((f) => f.id) : [floor])
  const projectName = words?.name ?? loaded.plan.title ?? exportBaseOf(planFile).base
  const { DrawingDoesNotFit, drawingSheets } = await import('./drawingSheet')
  const { drawingSheetFiles, sheetMeasure } = await import('./drawingFiles')
  let set: DrawingSet
  try {
    set = drawingSheets(loaded, { ...request, ...(floor === undefined ? {} : { floor }) }, { project: projectName, ...(words?.drawing === undefined ? {} : { drawing: words.drawing }), date: exportTime(date), language: lang, measure: await sheetMeasure() })
  } catch (error) {
    if (error instanceof DrawingDoesNotFit) throw new PlanRefused(error.message)
    throw error
  }
  const { stem } = drawingStem(planFile, loaded, set.floors, { scale: set.scale, paper: set.paper })
  const first = set.sheets[0]!
  const title = set.floors.length === 1 ? first.words.drawing : set.sheets.map((sheet) => sheet.words.drawing).filter((t, i, all) => all.indexOf(t) === i).join(', ')
  const files = await drawingSheetFiles(set.sheets, `${projectName}: ${title}`)
  return named.note === undefined ? { loaded, set, files, stem } : { loaded, set, files, stem, note: named.note }
}

/** SHT-6: one line on what the drawing is: its floor, scale and paper, and what Grid chose. SHT-20: its pages when it has several. */
export function drawingLine(set: DrawingSet): string {
  const chosen = set.chosen.scale && set.chosen.paper
    ? ` (the largest of 1:100, 1:200 and 1:500 ${set.floors.length > 1 ? 'every floor fits' : 'the floor fits'}, on the smallest paper)`
    : set.chosen.scale ? ` (the largest of 1:100, 1:200 and 1:500 ${set.floors.length > 1 ? 'every floor fits' : 'the floor fits'} on it)`
    : set.chosen.paper ? ` (the smallest paper ${set.floors.length > 1 ? 'every floor fits' : 'the floor fits'} at that scale)` : ''
  const first = set.sheets[0]!
  if (set.sheets.length === 1) return `${first.words.drawing} at ${scaleText(set.scale)} on ${first.paper.name} ${first.paper.orientation}${chosen}.`
  if (set.floors.length === 1) return `${first.words.drawing} at ${scaleText(set.scale)} on ${set.paper}, over ${set.sheets.length} pages${chosen}.`
  const split = set.sheets.filter((sheet) => sheet.part?.index === 1)
  const parts = split.length === 0 ? '' : `; ${split.map((sheet) => `${sheet.words.drawing} over ${sheet.part!.count} pages`).join(', ')}`
  return `${set.floors.length} floors at ${scaleText(set.scale)} on ${set.paper}, ${set.sheets.length} pages${parts}${chosen}.`
}

export interface DrawingDone {
  readonly loaded: LoadedPlan
  readonly set: DrawingSet
  /** The real paths written: the PDF, and the SVG and PNG of each page. */
  readonly written: { readonly pdf: string; readonly svgs: readonly string[]; readonly pngs: readonly string[] }
  /** Each page's PNG, for a tool's answer to show. */
  readonly pngs: readonly Uint8Array[]
  readonly note?: string
}

/** SHT-6: makes the drawing and writes its PDF, SVGs and PNGs into `exports/` beside the plan. */
export async function drawingIntoProject(project: Project, planFile: string, request: DrawingRequest, words: SheetWords | null, language?: Language, date?: string): Promise<DrawingDone> {
  const made = await makeDrawing(project, planFile, request, words, language, date)
  const pages = made.set.sheets.length
  const written = {
    pdf: writeBesidePlan(project, planFile, `${made.stem}.pdf`, made.files.pdf),
    svgs: made.files.svgs.map((svg, i) => writeBesidePlan(project, planFile, pageFile(made.stem, pages, i, 'svg'), svg)),
    pngs: made.files.pngs.map((png, i) => writeBesidePlan(project, planFile, pageFile(made.stem, pages, i, 'png'), png)),
  }
  const done = { loaded: made.loaded, set: made.set, written, pngs: made.files.pngs }
  return made.note === undefined ? done : { ...done, note: made.note }
}

/** SHT-6: `--out`'s PDF, and the SVG and PNG of each page beside it (SHT-20: `-page-<n>` when there are several). */
export function drawingOutFiles(out: string, pages = 1): { pdf: string; svgs: string[]; pngs: string[] } {
  const stem = out.slice(0, -path.extname(out).length)
  const each = Array.from({ length: pages }, (_, i) => i)
  return { pdf: out, svgs: each.map((i) => pageFile(stem, pages, i, 'svg')), pngs: each.map((i) => pageFile(stem, pages, i, 'png')) }
}

export type { PaperName }
