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
import type { DrawingRequest, DrawingSheet } from './drawingSheet'
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
  /** SHT-16: the date to write on the sheet, as given (the form `grid export --date` takes). */
  readonly date?: string
}

/** SHT-6: what `grid sheet` makes: one of VEW-7's sheets, or one drawing at a true scale. */
export type SheetKind = SheetLayout | 'drawing'
export const SHEET_KINDS: readonly SheetKind[] = [...SHEET_LAYOUTS, 'drawing']

/** The options only a drawing takes, by the name the command gives them. */
const DRAWING_OPTIONS = [['scale', '--scale'], ['paper', '--paper'], ['floor', '--floor'], ['roomSizes', '--room-sizes']] as const

/**
 * SHT-6: the sheet a request asks for. `--layout drawing`, or no layout with a drawing's own
 * option (`--scale`, `--paper`, `--floor`, `--room-sizes`), is the drawing; else VEW-7's layout.
 */
export function sheetKindOf(request: SheetRequest): SheetKind {
  const drawingAsked = DRAWING_OPTIONS.filter(([field]) => request[field] !== undefined).map(([, option]) => option)
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
  }
}

/** The language a sheet request asks for (`--lang`), refused by name when Grid does not write it; undefined when none is asked. */
export function sheetLanguage(request: SheetRequest): Language | undefined {
  return askedLanguage(request.lang)
}

export function checkSheetRequest(request: SheetRequest): SheetLayout {
  const layouts = `${SHEET_LAYOUTS.join(', ')} or drawing`
  if (request.layout === undefined) throw new UsageError(`sheet needs --layout: ${layouts} (or --scale and --paper, for a drawing).`)
  if (!(SHEET_LAYOUTS as readonly string[]).includes(request.layout)) throw new UsageError(`--layout takes ${layouts}.`)
  if (request.layout === 'check' && request.sheet !== undefined) {
    throw new UsageError('--sheet gives the words of a client sheet; a check sheet takes none: leave --sheet out.')
  }
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== '.pdf') {
    throw new UsageError('--out must name a .pdf file.')
  }
  sheetLanguage(request)
  exportTime(request.date)
  return request.layout as SheetLayout
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
}

/**
 * Reads the plan and makes the sheet. `grid sheet --out` writes it where it is told. MSG-11: its
 * words are in `language` when one is asked for, else the plan's own (`display.language`), else
 * English.
 */
export async function makeSheet(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, language?: Language, date?: string): Promise<MadeSheet> {
  const read = loadPlan(project, planFile)
  const lang = await languageFor(language, read.plan)
  // MSG-22: the floor the plan names in no list, named in the sheet's language.
  const loaded = spokenPlan(read, lang)
  const { base, note } = exportBaseOf(planFile)
  const notes = layout === 'client' ? accessNotes(project, planFile, loaded) : []
  const sheet = sheetPages(loaded, words, layout, { name: base, date: exportTime(date), accessNotes: notes, language: lang })
  // The laid-out sheet is the one written: text that did not fit flows onto continuation pages.
  const { pdf, sheet: laidOut } = await sheetPdf(loaded.plan, sheet)
  const pages = laidOut.pages.map((page) => (page.floor === null ? { kind: page.kind, title: page.title } : { kind: page.kind, title: page.title, floor: page.floor }))
  const fileName = `${base}-${layout}.pdf`
  return note === undefined
    ? { loaded, pdf, pages, fileName }
    // The name the sheet shows and its file in exports/ start with: true of --out as well.
    : { loaded, pdf, pages, fileName, note: `Named the sheet ${base}: ${note}.` }
}

export interface SheetDone {
  readonly loaded: LoadedPlan
  /** The real path written. */
  readonly written: string
  readonly pages: MadeSheet['pages']
  readonly note?: string
}

/**
 * Makes the sheet and writes it into `exports/` beside the plan, replacing an earlier copy, as
 * `grid export` writes its files. The command and the tool server both call this.
 */
export async function sheetIntoProject(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, language?: Language, date?: string): Promise<SheetDone> {
  const { loaded, pdf, pages, fileName, note } = await makeSheet(project, planFile, layout, words, language, date)
  const written = writeBesidePlan(project, planFile, fileName, pdf)
  return note === undefined ? { loaded, written, pages } : { loaded, written, pages, note }
}

/** SHT-6: a drawing at a scale made and not yet written: its three files and how they are named. */
export interface MadeDrawing {
  readonly loaded: LoadedPlan
  readonly sheet: DrawingSheet
  readonly files: { readonly pdf: Uint8Array; readonly svg: string; readonly png: Uint8Array }
  /** The name of the files in `exports/`, without the extension. */
  readonly stem: string
  readonly note?: string
}

/**
 * The drawing's file names: the plan's export name, its floor by its place when the plan has
 * several, `-drawing`, and its scale and paper (`-1-100-A3`) once the sheet is made.
 */
function drawingStem(planFile: string, loaded: LoadedPlan, floor: string, made?: { scale: number; paper: string }): { stem: string; note?: string } {
  const { base, note } = exportBaseOf(planFile)
  const floors = planFloors(loaded.plan)
  const place = floors.length > 1 ? `-floor-${floors.findIndex((f) => f.id === floor) + 1}` : ''
  const stem = `${base}${place}-drawing${made === undefined ? '' : `-1-${made.scale}-${made.paper}`}`
  return note === undefined ? { stem } : { stem, note: `Named the sheet ${base}: ${note}.` }
}

/**
 * SHT-6: reads the plan and makes the drawing at a true scale. The project's name is the sheet
 * words' name (`sheet.json`), else the plan's title, else the export name of the plan's file.
 */
export async function makeDrawing(project: Project, planFile: string, request: DrawingRequest, words: SheetWords | null, language?: Language, date?: string): Promise<MadeDrawing> {
  const read = loadPlan(project, planFile)
  const lang = await languageFor(language, read.plan)
  // MSG-22: the floor the plan names in no list, named in the drawing's language.
  const loaded = spokenPlan(read, lang)
  const floor = floorOption(loaded.plan, request.floor)
  const named = drawingStem(planFile, loaded, floor ?? planFloors(loaded.plan)[0]?.id ?? '')
  const projectName = words?.name ?? loaded.plan.title ?? exportBaseOf(planFile).base
  const { DrawingDoesNotFit, drawingSheet } = await import('./drawingSheet')
  const { drawingSheetFiles, sheetMeasure } = await import('./drawingFiles')
  let sheet: DrawingSheet
  try {
    sheet = drawingSheet(loaded, { ...request, ...(floor === undefined ? {} : { floor }) }, { project: projectName, date: exportTime(date), language: lang, measure: await sheetMeasure() })
  } catch (error) {
    if (error instanceof DrawingDoesNotFit) throw new PlanRefused(error.message)
    throw error
  }
  const { stem } = drawingStem(planFile, loaded, sheet.floor, { scale: sheet.scale, paper: sheet.paper.name })
  const files = await drawingSheetFiles(sheet, `${projectName}: ${sheet.words.drawing}`)
  return named.note === undefined ? { loaded, sheet, files, stem } : { loaded, sheet, files, stem, note: named.note }
}

/** SHT-6: one line on what the drawing is: its floor, scale and paper, and what Grid chose. */
export function drawingLine(sheet: DrawingSheet): string {
  const chosen = sheet.chosen.scale && sheet.chosen.paper
    ? ' (the largest of 1:100, 1:200 and 1:500 the floor fits, on the smallest paper)'
    : sheet.chosen.scale ? ' (the largest of 1:100, 1:200 and 1:500 the floor fits on it)'
    : sheet.chosen.paper ? ' (the smallest paper the floor fits at that scale)' : ''
  return `${sheet.words.drawing} at ${scaleText(sheet.scale)} on ${sheet.paper.name} ${sheet.paper.orientation}${chosen}.`
}

export interface DrawingDone {
  readonly loaded: LoadedPlan
  readonly sheet: DrawingSheet
  /** The real paths written: the PDF, the SVG and the PNG. */
  readonly written: { readonly pdf: string; readonly svg: string; readonly png: string }
  /** The PNG's bytes, for a tool's answer to show. */
  readonly png: Uint8Array
  readonly note?: string
}

/** SHT-6: makes the drawing and writes its PDF, SVG and PNG into `exports/` beside the plan. */
export async function drawingIntoProject(project: Project, planFile: string, request: DrawingRequest, words: SheetWords | null, language?: Language, date?: string): Promise<DrawingDone> {
  const made = await makeDrawing(project, planFile, request, words, language, date)
  const written = {
    pdf: writeBesidePlan(project, planFile, `${made.stem}.pdf`, made.files.pdf),
    svg: writeBesidePlan(project, planFile, `${made.stem}.svg`, made.files.svg),
    png: writeBesidePlan(project, planFile, `${made.stem}.png`, made.files.png),
  }
  const done = { loaded: made.loaded, sheet: made.sheet, written, png: made.files.png }
  return made.note === undefined ? done : { ...done, note: made.note }
}

/** SHT-6: `--out`'s PDF, and the SVG and PNG beside it, with its name. */
export function drawingOutFiles(out: string): { pdf: string; svg: string; png: string } {
  const stem = out.slice(0, -path.extname(out).length)
  return { pdf: out, svg: `${stem}.svg`, png: `${stem}.png` }
}

export type { PaperName }
