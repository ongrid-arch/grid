/**
 * `grid export <plan> --format dxf|ifc|glb|obj`: the plan as a file for another program,
 * through the core's exporters. VEW-73: a GLB or OBJ may leave its roofs out (`--no-roofs`) and
 * write curved walls lighter (`--arc-segments`); an OBJ comes with `grid.mtl` beside it.
 *
 * Written into the `exports/` folder beside the plan, as the app's "Open in" does, or to
 * `--out`. IFC holds the whole building; DXF (VEW-72), OBJ and GLB (VEW-64) hold the whole building
 * unless a floor is named, by its id or its name, and `--floor all` writes one file per floor. The
 * tool server's `grid_export` runs the same code.
 */
import path from 'path'
import { ARC_SEGMENTS_RANGE, DXF_SCALE_RANGE, DXF_SHEET_SCALES, floorElevations, GLB_BUILDING_NODE, inIdOrder, metresText, OBJ_MATERIALS_FILE, planFloors, planSunAt, resolveFloor, type DxfSheet, type FloorPlan, type PlanState, type PlanSun } from '@ongrid/floorplan/geometry'
import { english, joined, name, num, said, type Said } from '@ongrid/floorplan/messages'
import {
  EXPORT_FORMATS,
  exportContents,
  exportFileName,
  exportPlan,
  isExportFormat,
  kindsText,
  partNames,
  type ApproximatedPart,
  type ExportFormat as FileFormat,
  type LeftOutPart,
  type PlanExport
} from '@ongrid/floorplan/export'
import { DATA_FORMATS, isDataFormat, planData, planDataText, type DataFormat } from '../export/planData'
import { writeProjectExport } from '../export/projectExports'
import { projectDxfProfile } from '../export/dxfProfile'
import { PathRefused, type Project } from '../fs/projectFiles'
import { floorOption, loadPlan, PlanRefused, type LoadedPlan } from './plan'
import { floorAsked } from '@ongrid/floorplan/geometry/floorAsked'
import { openingSchedule } from '../quantities/schedule'
import { surveyPlan } from '../quantities/survey'
import { placeOf, readMoment, SunAskRefused } from '../quantities/sunPath'
import { loadedInState } from '../quantities/phaseState'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

/** VEW-80: the formats Grid exports: the core's files, then the plan's geometry as data. */
export type ExportFormat = FileFormat | DataFormat
export const GRID_EXPORT_FORMATS: readonly ExportFormat[] = [...EXPORT_FORMATS, ...DATA_FORMATS]

export function isGridExportFormat(value: unknown): value is ExportFormat {
  return isExportFormat(value) || isDataFormat(value)
}

export const EXPORT_OPTIONS: OptionSpecs = {
  '--format': { takesValue: true, help: `The file format: ${GRID_EXPORT_FORMATS.join(', ')}.` },
  '--floor': { takesValue: true, help: 'DXF, OBJ, GLB, GeoJSON and JSON: the floor to export, by its id or its name, or all for one file per floor. Left out, the file holds every floor: OBJ and GLB each at its elevation, DXF each on a layout of its own.' },
  '--scale': { takesValue: true, help: 'DXF: the scale its sheets show the plan at, 200 or 1:200. Left out, the scale dxf-layers.json states, else the largest standard scale every floor fits on A3 at.' },
  '--no-roofs': { takesValue: false, help: 'GLB and OBJ: leave out every roof and the parapets on them, to look into the model or walk through it.' },
  '--arc-segments': { takesValue: true, help: `GLB and OBJ: the straight pieces a whole circle of curved wall is written with, a whole number from ${ARC_SEGMENTS_RANGE.min} to ${ARC_SEGMENTS_RANGE.max}, such as 32 for a light model. Left out, as finely as the plan is measured.` },
  '--date': { takesValue: true, help: 'IFC: the time stamp to write, a date (2026-01-31) or a time (2026-01-31T09:00:00Z). SOURCE_DATE_EPOCH when left out, else now. The same date gives the same file.' },
  '--out': { takesValue: true, help: 'The file to write, inside the project, ending in the format\'s extension. exports/ beside the plan when left out.' },
  ...PROJECT_OPTION,
}

export interface ExportRequest {
  readonly format?: string
  readonly floor?: string
  readonly out?: string
  /** VEW-72: the DXF's scale as given, `200` or `1:200`. */
  readonly scale?: string
  /** CMD-26: the time stamp to write, as given. */
  readonly date?: string
  /** VEW-73: false leaves the roofs out of a GLB or OBJ (`--no-roofs`). */
  readonly roofs?: boolean
  /** VEW-73: the pieces a whole circle of curved wall is written with, as given. */
  readonly arcSegments?: string
  /** CNT-58: a GLB's sun, a moment as `grid_view` takes it ("2026-06-21 18:30"), written as a light named sun. */
  readonly sun?: string
}

/** CNT-58: the sun a GLB is lit by, read from the request; nothing for no sun. */
function exportSun(plan: FloorPlan, request: ExportRequest, format: ExportFormat): { sun?: { sun: PlanSun; utcOffset: number | null } } {
  if (request.sun === undefined) return {}
  if (format !== 'glb') throw new UsageError('sun lights a glb only: leave it out for this format.')
  try {
    const asked = readMoment(request.sun, 'sun')
    return { sun: { sun: planSunAt(plan, placeOf(plan), asked.moment, asked.utcOffset), utcOffset: asked.utcOffset } }
  } catch (error) {
    if (error instanceof SunAskRefused) throw new UsageError(error.message)
    throw error
  }
}

/**
 * CMD-26: the time an export is stamped with: `--date`, else `SOURCE_DATE_EPOCH` (seconds), else
 * the clock. A value that is neither a date nor a time is refused by name.
 */
export function exportTime(date: string | undefined, env: NodeJS.ProcessEnv = process.env): Date {
  if (date !== undefined) {
    const when = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : /^\d{4}-\d{2}-\d{2}T/.test(date) ? new Date(date) : new Date(Number.NaN)
    if (!Number.isFinite(when.getTime())) throw new UsageError(`--date ${JSON.stringify(date)} is not a date or a time: write 2026-01-31 or 2026-01-31T09:00:00Z.`)
    return when
  }
  const epoch = env['SOURCE_DATE_EPOCH']
  if (epoch !== undefined && epoch !== '') {
    if (!/^\d{1,15}$/.test(epoch)) throw new UsageError(`SOURCE_DATE_EPOCH ${JSON.stringify(epoch)} is not a whole number of seconds: unset it or give seconds since 1970.`)
    return new Date(Number(epoch) * 1000)
  }
  return new Date()
}

/** Checks the options against each other, before the plan is read. */
export function checkExportRequest(request: ExportRequest): ExportFormat {
  const formats = GRID_EXPORT_FORMATS.join(', ')
  if (request.format === undefined) throw new UsageError(`export needs --format: one of ${formats}.`)
  if (!isGridExportFormat(request.format)) {
    throw new UsageError(`--format ${JSON.stringify(request.format)} is not one Grid writes: use one of ${formats}.`)
  }
  const format = request.format
  exportTime(request.date)
  if (format === 'ifc' && request.floor !== undefined) {
    throw new UsageError('--floor does not apply to IFC, which holds every floor: leave --floor out.')
  }
  exportScale(request, format)
  exportShape(request, format)
  if (request.floor === ALL_FLOORS && request.out !== undefined) {
    throw new UsageError('--floor all writes one file per floor into exports/ beside the plan: leave --out out, or name one floor.')
  }
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== `.${format}`) {
    throw new UsageError(`--out ${JSON.stringify(request.out)} does not end in .${format}: name a .${format} file.`)
  }
  return format
}

/** VEW-72: `--floor all`, one file per floor, unless the plan has a floor with that id. */
export const ALL_FLOORS = 'all'

/** VEW-72: the scale a DXF is asked for, as a number (200 for 1:200), or undefined when none is. */
export function exportScale(request: Pick<ExportRequest, 'scale'>, format: ExportFormat): number | undefined {
  if (request.scale === undefined) return undefined
  if (format !== 'dxf') throw new UsageError('--scale applies to DXF only: leave it out for this format.')
  const given = /^(?:1:)?([0-9]{1,4})$/.exec(request.scale.trim())
  const scale = given === null ? Number.NaN : Number(given[1])
  if (!(scale >= DXF_SCALE_RANGE.min && scale <= DXF_SCALE_RANGE.max)) {
    throw new UsageError(`--scale ${JSON.stringify(request.scale)} is not a scale Grid draws: give a whole number from ${DXF_SCALE_RANGE.min} to ${DXF_SCALE_RANGE.max}, such as 200 or 1:200.`)
  }
  return scale
}

/**
 * VEW-73: what a GLB or OBJ is asked to leave out or write lighter: the roofs, and the pieces to a
 * whole circle of curved wall. Either is refused for DXF and IFC, and a count that is not a whole
 * number in `ARC_SEGMENTS_RANGE` is refused by name.
 */
export function exportShape(request: Pick<ExportRequest, 'roofs' | 'arcSegments'>, format: ExportFormat): { roofs?: false; arcSegments?: number } {
  const threeD = format === 'glb' || format === 'obj'
  if (request.roofs === false && !threeD) throw new UsageError('--no-roofs applies to GLB and OBJ only: leave it out for this format.')
  if (request.arcSegments === undefined) return request.roofs === false ? { roofs: false } : {}
  if (!threeD) throw new UsageError('--arc-segments applies to GLB and OBJ only: leave it out for this format.')
  const count = /^[0-9]{1,4}$/.test(request.arcSegments.trim()) ? Number(request.arcSegments.trim()) : Number.NaN
  if (!(count >= ARC_SEGMENTS_RANGE.min && count <= ARC_SEGMENTS_RANGE.max)) {
    throw new UsageError(`--arc-segments ${JSON.stringify(request.arcSegments)} is not a number of pieces Grid writes: give a whole number from ${ARC_SEGMENTS_RANGE.min} to ${ARC_SEGMENTS_RANGE.max}, such as 32.`)
  }
  return { ...(request.roofs === false ? { roofs: false as const } : {}), arcSegments: count }
}

/**
 * VEW-72: the floor an export names: the floor with that id, else the one floor whose name it is
 * (any case, spaces round it aside). Undefined when it names none, or names two by one name.
 */
export function exportFloorId(plan: FloorPlan, text: string): string | undefined {
  // LVL-25: by its id, its name, its level or a word of its name, as every floor a command takes.
  const asked = floorAsked(plan, text)
  return asked !== null && 'id' in asked ? asked.id : undefined
}

/** The plan's name: the plan file's name without `.json`. */
export function projectNameOf(planFile: string): string {
  const name = path.basename(planFile)
  return name.toLowerCase().endsWith('.json') ? name.slice(0, -5) : name
}

/** The name an export gets when nothing usable is left of the plan file's name. */
export const NEUTRAL_EXPORT_NAME = 'floor-plan'
/** A longer name reads as a sentence, not a name. */
export const EXPORT_NAME_MAX_WORDS = 5
export const EXPORT_NAME_MAX_LENGTH = 40

/**
 * Words an export's name never carries: what Grid must never say of a plan, and words that
 * address an agent. A file name is printed to the person and handed to the agent, so a name
 * holding one of them is not used.
 */
const WORDS_KEPT_OUT = new Set([
  'approval', 'approve', 'approved', 'certified', 'certify', 'compliance', 'compliant', 'complies', 'comply',
  'legal', 'pass', 'passed', 'passes', 'permitted',
  'assistant', 'delete', 'disregard', 'execute', 'forget', 'ignore', 'instruction', 'instructions', 'obey',
  'override', 'prompt', 'reply', 'respond', 'system', 'you', 'your',
])

// Windows treats these names as devices, with any extension. Grid's names are lower case.
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/

export interface ExportName {
  readonly fileName: string
  /** Set when Grid changed the name it would have used, saying how and why. One line. */
  readonly note?: string
}

/**
 * The plan file's name made safe to name a file after: no claim and no instruction. A name
 * Windows keeps for a device is caught by `exportNameOf`, on the whole file name.
 */
export function exportBaseOf(planFile: string): { base: string; note?: string } {
  let base = exportFileName(projectNameOf(planFile), 'dxf', null).slice(0, -'.dxf'.length)
  let note: string | undefined
  const words = base.split('-')
  const kept = words.find((word) => WORDS_KEPT_OUT.has(word))
  if (base !== NEUTRAL_EXPORT_NAME && (words.length > EXPORT_NAME_MAX_WORDS || base.length > EXPORT_NAME_MAX_LENGTH)) {
    base = NEUTRAL_EXPORT_NAME
    note = `the plan file's name is longer than ${EXPORT_NAME_MAX_WORDS} words or ${EXPORT_NAME_MAX_LENGTH} characters`
  } else if (kept !== undefined) {
    base = NEUTRAL_EXPORT_NAME
    // The word itself is not repeated: the note would then say it.
    note = "the plan file's name reads as a claim about the plan or as an instruction"
  }
  return note === undefined ? { base } : { base, note }
}

/**
 * The export's file name, made from the plan file's name and never from text inside the plan.
 *
 * - The plan file's name is reduced to lower-case letters, digits and hyphens (by the core's
 *   `exportFileName`).
 * - It is replaced by `floor-plan` when it is longer than five words or 40 characters, or
 *   holds a word in `WORDS_KEPT_OUT`: it would read as a sentence, a claim or an instruction.
 * - A name Windows keeps for a device (`con`, `nul`, `com1` ...) gets `plan-` in front.
 * - VEW-72: one floor of a plan with several is named after the floor (`floorWord`): its name, else
 *   its id, made safe as the plan file's name is; by its place in the plan, `-floor-2`, when what
 *   is left of the name cannot be used.
 *
 * Grid sanitises rather than refuses: the export is still written, and `note` says what changed.
 */
export function exportNameOf(planFile: string, format: ExportFormat, floor: string | number | null): ExportName {
  const made = exportBaseOf(planFile)
  let base = made.base
  let note = made.note
  if (floor !== null) base = typeof floor === 'number' ? `${base}-floor-${floor}` : `${base}-${floor}`
  if (WINDOWS_DEVICE.test(base)) {
    note = `${base} is a name Windows keeps for a device`
    base = `plan-${base}`
  }
  // VEW-80: the data is named apart, so it is never taken for a plan file.
  const fileName = format === 'json' ? `${base}-data.json` : `${base}.${format}`
  return note === undefined ? { fileName } : { fileName, note: `Named the export ${fileName}: ${note}.` }
}

/**
 * VEW-72: a floor's part of an export's name: its name, else its id, in lower-case letters, digits
 * and hyphens; null when nothing is left, or when it is longer than a name or reads as a claim or
 * an instruction (the plan file's own rules, `exportBaseOf`).
 */
export function floorWord(floor: { readonly id: string; readonly name?: string | undefined }): string | null {
  const word = (floor.name || floor.id)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const words = word.split('-')
  if (word === '' || words.length > EXPORT_NAME_MAX_WORDS || word.length > EXPORT_NAME_MAX_LENGTH || words.some((one) => WORDS_KEPT_OUT.has(one))) return null
  return word
}

/** The floor's part of the name when an export holds one floor of several: its word, else its place in the plan, from 1. */
function floorPartOf(loaded: LoadedPlan, format: ExportFormat, floorId: string | undefined): string | number | null {
  // VEW-64, VEW-72: a file with no floor named holds the whole building.
  if (format === 'ifc' || floorId === undefined) return null
  const floors = planFloors(loaded.plan)
  if (floors.length <= 1) return null
  const id = resolveFloor(loaded.plan, floorId)
  const at = floors.findIndex((floor) => floor.id === id)
  return floorWord(floors[at]!) ?? at + 1
}

export interface MadeExport extends PlanExport {
  readonly name: ExportName
  /** HND-1: the project's DXF profile file the export used, or null for Grid's own layers. */
  readonly dxfProfile: string | null
}

/** The most names a line on the left-out parts gives; the rest are counted. */
export const LEFT_OUT_NAMES_SHOWN = 5

/** `"a", "b" and 3 more`: a kind's names, each once, the first few. */
function someNames(parts: readonly LeftOutPart[]): string {
  const names = partNames(parts)
  const shown = names.slice(0, LEFT_OUT_NAMES_SHOWN).join(', ')
  return names.length > LEFT_OUT_NAMES_SHOWN ? `${shown} and ${names.length - LEFT_OUT_NAMES_SHOWN} more` : shown
}

/**
 * HND-6: the line that says what an export leaves out, or null when it leaves out nothing. The
 * same line goes to standard error from `grid export` and into `grid_export`'s answer.
 */
export function leftOutText(leftOut: readonly LeftOutPart[]): string | null {
  if (leftOut.length === 0) return null
  const read = leftOut.filter((part) => part.place !== null)
  const drawn = leftOut.filter((part) => part.place === null)
  const said = [
    drawn.length > 0 ? `${kindsText(drawn)} that can't be drawn (${someNames(drawn)})` : null,
    read.length > 0 ? `${kindsText(read)} left out when the plan was read (${someNames(read)})` : null
  ].filter((text) => text !== null)
  return `Left out ${leftOut.length} part${leftOut.length === 1 ? '' : 's'} of the plan, and the file says so: ${said.join('; ')}. grid check says why.`
}

/**
 * CNT-18: the line that says which curves an export writes as straight pieces, or null when it
 * writes none so. The file names them too, beside what it leaves out.
 */
export function approximatedText(approximated: readonly ApproximatedPart[]): string | null {
  if (approximated.length === 0) return null
  // MSG-11: the words are keys of the message files (`drawing.export.approximated*`), said in English.
  const named = (kind: ApproximatedPart['kind']): Said | null => {
    const parts = approximated.filter((part) => part.kind === kind)
    if (parts.length === 0) return null
    const names = someNames(parts.map((part) => ({ kind, id: part.id, place: null, floor: part.floor, code: null })))
    return said(`drawing.export.approximated.${kind}.${parts.length === 1 ? 'one' : 'many'}`, { n: parts.length, names })
  }
  const parts = [named('wall'), named('room')].filter((part) => part !== null)
  return english(said('drawing.export.approximated', { parts: joined(parts, 'join.and') }))
}

/**
 * VEW-64: the line that says which floors an export holds, at what height, and which floors of
 * the plan it does not hold; null for a plan of one floor. The same line goes to standard error
 * from `grid export` and into `grid_export`'s answer.
 */
export function floorsText(made: Pick<PlanExport, 'floors' | 'floorsLeftOut'>, format: ExportFormat): string | null {
  const all = made.floors.length + made.floorsLeftOut.length
  if (all <= 1) return null
  // MSG-11: the words are keys of the message files (`drawing.export.floors.*`), said in English.
  // VEW-80: the data holds every floor in one frame.
  if (isDataFormat(format)) {
    if (made.floorsLeftOut.length === 0) return english(said('drawing.export.floors.building.data', { n: all }))
  }
  if (made.floorsLeftOut.length === 0) {
    return english(format === 'glb'
      ? said('drawing.export.floors.building.glb', { n: all, root: name(GLB_BUILDING_NODE) })
      : said(`drawing.export.floors.building.${format === 'obj' ? 'obj' : format === 'dxf' ? 'dxf' : 'ifc'}`, { n: all }))
  }
  const held = made.floors[0]!
  const left = made.floorsLeftOut.length
  const others = left === 1 ? said('drawing.export.floors.others.one') : said('drawing.export.floors.others.many', { n: left })
  const one = format === 'glb' ? 'glb' : format === 'obj' ? 'obj' : isDataFormat(format) ? 'data' : 'dxf'
  return english(said(`drawing.export.floors.one.${one}`, { floor: name(held.id), elevation: num(metresText(held.elevation)), others }))
}

/**
 * HND-6: an export that would hold nothing of the plan is refused, so an empty file that looks
 * whole is never written. Says which floor, when the plan has several, and what is left out.
 */
function nothingToExport(loaded: LoadedPlan, planFile: string, format: ExportFormat, made: PlanExport, floorId: string | undefined): string {
  // VEW-64: a file of the whole building names no floor.
  const several = format !== 'ifc' && made.floors.length === 1 && planFloors(loaded.plan).length > 1
  // Quoted: a floor id is text from the plan file.
  const where = several ? ` on floor ${JSON.stringify(resolveFloor(loaded.plan, floorId))}` : ''
  const left = made.leftOut.length > 0
    ? ` Left out: ${kindsText(made.leftOut)} (${someNames(made.leftOut)}); grid check says why.`
    : ''
  return `Nothing to export: ${planFile} has no wall, room or fixture that can be drawn${where}.${left} No file was written.`
}

/**
 * `planFile` is the path as given: a plan reached through a link is named after the link. An
 * export that would hold nothing of the plan is refused (`PlanRefused`, HND-6). A DXF takes its
 * layers and pens from the project's profile when it has one (HND-1, `DxfProfileRefused` when
 * that file is wrong).
 */
export function exportFile(project: Project, loaded: LoadedPlan, planFile: string, format: ExportFormat, request: ExportRequest): MadeExport {
  // VEW-72: a floor by its id or its name.
  const floorId = request.floor === undefined ? undefined : (exportFloorId(loaded.plan, request.floor) ?? floorOption(loaded.plan, request.floor))
  if (isDataFormat(format)) return dataExport(loaded, planFile, format, floorId)
  const name = projectNameOf(planFile)
  const dxf = format === 'dxf' ? projectDxfProfile(project) : null
  // VEW-72: the scale asked for, else the one the profile states; the largest that fits when neither.
  const scale = exportScale(request, format) ?? (dxf?.scaleStated === true ? dxf.profile.scale : undefined)
  // VEW-72: the schedules' marks and types, for the DXF's attributes and the IFC's tags.
  const marks = format === 'dxf' || format === 'ifc' ? { openingMarks: new Map(openingSchedule(surveyPlan(loaded.plan)).rows.map((row) => [row.id, { mark: row.mark, type: row.typeKey }] as const)) } : {}
  const options = { projectId: name, projectName: name, floorId, now: exportTime(request.date), ...marks, ...exportShape(request, format), ...exportSun(loaded.plan, request, format), ...(scale === undefined ? {} : { dxfScale: scale }), ...(dxf === null ? {} : { dxfProfile: dxf.profile }) }
  const made = exportPlan(loaded.plan, format, loaded.faults === undefined ? options : { ...options, faults: loaded.faults })
  if (made.empty) throw new PlanRefused(nothingToExport(loaded, planFile, format, made, floorId))
  return { ...made, name: exportNameOf(planFile, format, floorPartOf(loaded, format, floorId)), dxfProfile: dxf?.file ?? null }
}

/**
 * VEW-80: the plan's geometry as data (`export/planData.ts`): every floor in one frame, or the
 * floor named. What it leaves out and whether it holds nothing are read as for every other file.
 */
function dataExport(loaded: LoadedPlan, planFile: string, format: DataFormat, floorId: string | undefined): MadeExport {
  const ordered = inIdOrder(loaded.plan)
  const levels = floorElevations(ordered).floors
  const all = planFloors(ordered).map((floor, order) => ({ floor, order })).sort((a, b) => a.floor.level - b.floor.level || a.order - b.order).map(({ floor }) => floor.id)
  const held = floorId === undefined ? all : [resolveFloor(ordered, floorId)]
  const contents = exportContents(ordered, held, loaded.faults)
  const made: PlanExport = {
    data: planDataText(planData(surveyPlan(loaded.plan), loaded.plan, held), format),
    fileName: '', filter: { name: format === 'geojson' ? 'GeoJSON' : 'JSON', extensions: [format] },
    leftOut: contents.leftOut, empty: contents.empty, approximated: [],
    floors: held.map((id) => ({ id, elevation: levels.get(id)?.floorLevel ?? 0 })), floorsLeftOut: all.filter((id) => !held.includes(id)),
    sheets: [], materials: null,
  }
  if (made.empty) throw new PlanRefused(nothingToExport(loaded, planFile, format, made, floorId))
  return { ...made, name: exportNameOf(planFile, format, floorPartOf(loaded, format, floorId)), dxfProfile: null }
}

/** VEW-72: the files of one export: one, or with `--floor all` one per floor, and the floors that held nothing. */
export interface MadeExports {
  readonly made: readonly MadeExport[]
  /** The ids of the floors `--floor all` wrote no file for: they hold nothing that can be drawn. */
  readonly empty: readonly string[]
}

/**
 * VEW-72: `--floor all` (when no floor has that id) makes one file per floor, lowest first, each
 * named after its floor; a floor that holds nothing is skipped and named. Any other request
 * makes one file.
 */
export function exportFiles(project: Project, loaded: LoadedPlan, planFile: string, format: ExportFormat, request: ExportRequest): MadeExports {
  if (request.floor !== ALL_FLOORS || exportFloorId(loaded.plan, ALL_FLOORS) !== undefined) return { made: [exportFile(project, loaded, planFile, format, request)], empty: [] }
  const floors = planFloors(loaded.plan).map((floor, order) => ({ floor, order })).sort((a, b) => a.floor.level - b.floor.level || a.order - b.order)
  if (floors.length <= 1) return { made: [exportFile(project, loaded, planFile, format, { ...request, floor: undefined })], empty: [] }
  const made: MadeExport[] = []
  const empty: string[] = []
  const taken = new Set<string>()
  for (const { floor, order } of floors) {
    let one: MadeExport
    try {
      one = exportFile(project, loaded, planFile, format, { ...request, floor: floor.id })
    } catch (error) {
      if (error instanceof PlanRefused) {
        empty.push(floor.id)
        continue
      }
      throw error
    }
    // Two floors of one name: the later is named by its place in the plan.
    if (taken.has(one.name.fileName)) one = { ...one, name: exportNameOf(planFile, format, order + 1) }
    taken.add(one.name.fileName)
    made.push(one)
  }
  if (made.length === 0) throw new PlanRefused(`Nothing to export: ${planFile} has no wall, room or fixture that can be drawn on any floor. No file was written.`)
  return { made, empty }
}

/** VEW-72: the line that names the floors `--floor all` wrote no file for, or null. */
export function emptyFloorsText(empty: readonly string[]): string | null {
  if (empty.length === 0) return null
  return english(said(empty.length === 1 ? 'drawing.export.floors.empty.one' : 'drawing.export.floors.empty.many', { floors: joined(empty.map((id) => name(id)), 'join.and') }))
}

/**
 * VEW-72: the line that says a DXF's scale, stated or the largest standard one it fits at, and
 * each floor that does not fit at it, with the scale it fits at; null for the other formats, and
 * for a DXF at Grid's first scale, 1:100, unstated, that every floor fits.
 */
export function sheetsText(sheets: readonly DxfSheet[]): string | null {
  const first = sheets[0]
  if (first === undefined || (!first.stated && first.scale === DXF_SHEET_SCALES[0] && sheets.every((sheet) => sheet.fits))) return null
  const lines = [english(said(first.stated ? 'drawing.export.dxf.scale.stated' : 'drawing.export.dxf.scale.fit', { scale: first.scale }))]
  const smallest = DXF_SHEET_SCALES[DXF_SHEET_SCALES.length - 1]!
  for (const sheet of sheets) {
    if (sheet.fits) continue
    const head = sheets.length > 1 && sheet.floor !== null ? said('drawing.export.dxf.notFit.floor', { floor: name(sheet.floor), scale: sheet.scale }) : said('drawing.export.dxf.notFit.plan', { scale: sheet.scale })
    const fit = sheet.fitsAt !== null ? said('drawing.export.dxf.fitsAt', { scale: sheet.fitsAt }) : sheet.scale < smallest ? said('drawing.export.dxf.fitsNone', { scale: smallest }) : null
    lines.push(fit === null ? english(head) : `${english(head)} ${english(fit)}`)
  }
  return lines.join(' ')
}

/** HND-1: the line that says which profile a DXF's layers and pens came from. */
export function dxfProfileLine(file: string): string {
  return `Layers and pens from ${file}.`
}

/** Why an export could not be written. The message is one line. */
export class ExportWriteFailed extends Error {
  override readonly name = 'ExportWriteFailed'
}

export interface ExportDone {
  readonly loaded: LoadedPlan
  /** The real path written. */
  readonly written: string
  /** HND-6: what the file leaves out of the plan, which the file names too. */
  readonly leftOut: readonly LeftOutPart[]
  /** CNT-18: the curves the file writes as straight pieces, which it names too. */
  readonly approximated: readonly ApproximatedPart[]
  /** HND-1: the project's DXF profile file the export used, or null for Grid's own layers. */
  readonly dxfProfile: string | null
  /** VEW-64: the floors the file holds, with their elevations, and the plan's floors it does not hold. */
  readonly floors: PlanExport['floors']
  readonly floorsLeftOut: PlanExport['floorsLeftOut']
  /** VEW-72: a DXF's sheets, one per floor it holds; empty for the other formats. */
  readonly sheets: PlanExport['sheets']
  /** VEW-73: the real path of the OBJ's `grid.mtl`, written beside it; null for the other formats. */
  readonly materials: string | null
  readonly note?: string
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Reads the plan, makes the export and writes it into `exports/` beside the plan, all inside
 * the project. The command and the tool server both call this; `--out` is the command's own.
 */
export function exportIntoProject(project: Project, planFile: string, format: ExportFormat, request: Omit<ExportRequest, 'out'>): ExportDone {
  const loaded = loadPlan(project, planFile)
  return writtenBesidePlan(project, loaded, planFile, exportFile(project, loaded, planFile, format, request))
}

function writtenBesidePlan(project: Project, loaded: LoadedPlan, planFile: string, made: MadeExport): ExportDone {
  const written = writeBesidePlan(project, planFile, made.name.fileName, made.data)
  // VEW-73: the OBJ's materials, beside it in exports/.
  const materials = made.materials === null ? null : writeBesidePlan(project, planFile, OBJ_MATERIALS_FILE, made.materials)
  const done = { loaded, written, leftOut: made.leftOut, approximated: made.approximated, dxfProfile: made.dxfProfile, floors: made.floors, floorsLeftOut: made.floorsLeftOut, sheets: made.sheets, materials }
  return made.name.note === undefined ? done : { ...done, note: made.name.note }
}

/**
 * VEW-72: as `exportIntoProject`, every file of the request: one per floor for `--floor all`.
 * ARE-75: with a state, of the building as it stands before or after the work, each file named
 * for it (`plan-before.dxf`), so it is written beside the export of the whole plan, not over it.
 */
export function exportsIntoProject(project: Project, planFile: string, format: ExportFormat, request: Omit<ExportRequest, 'out'>, state?: PlanState): { readonly done: readonly ExportDone[]; readonly empty: readonly string[] } {
  const read = loadPlan(project, planFile)
  const loaded = state === undefined ? read : loadedInState(read, state)
  const { made, empty } = exportFiles(project, loaded, planFile, format, request)
  const named = state === undefined || loaded === read ? made : made.map((one) => ({ ...one, name: { ...one.name, fileName: exportNameInState(one.name.fileName, state) } }))
  return { done: named.map((one) => writtenBesidePlan(project, loaded, planFile, one)), empty }
}

/** ARE-75: an export's file name for the building in one state: `plan.dxf` as `plan-before.dxf`. */
export function exportNameInState(fileName: string, state: PlanState): string {
  const dot = fileName.lastIndexOf('.')
  return dot <= 0 ? `${fileName}-${state}` : `${fileName.slice(0, dot)}-${state}${fileName.slice(dot)}`
}

/**
 * VEW-73: an OBJ's `grid.mtl` written into the folder of the file written at `written` (a real
 * path, inside the project), for `--out`; null when the export has none.
 */
export function writeMaterialsBeside(project: Project, written: string, made: Pick<PlanExport, 'materials'>): string | null {
  if (made.materials === null) return null
  return project.writeFile(path.join(path.dirname(written), OBJ_MATERIALS_FILE), made.materials)
}

/**
 * Writes `fileName` into `exports/` beside the plan as it was named: the folder that holds the
 * name given. Returns the real path written. A failure is one line (`ExportWriteFailed`); a
 * path outside the project stays a `PathRefused`. `grid export` and `grid sheet` both use it.
 */
export function writeBesidePlan(project: Project, planFile: string, fileName: string, data: string | Uint8Array): string {
  try {
    return writeProjectExport(project, path.dirname(planFile), fileName, data)
  } catch (error) {
    if (error instanceof PathRefused) throw error
    throw new ExportWriteFailed(`Can't write the export beside ${planFile}: ${oneLine((error as Error).message)}`)
  }
}
