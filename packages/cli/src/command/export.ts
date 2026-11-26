/**
 * `grid export <plan> --format dxf|ifc|glb|obj`: the plan as a file for another program,
 * through the core's exporters.
 *
 * Written into the `exports/` folder beside the plan, as the app's "Open in" does, or to
 * `--out`. DXF holds one floor; IFC holds the whole building; OBJ and GLB hold the whole building,
 * each floor at its elevation, unless a floor is named (VEW-64). The tool server's `grid_export`
 * runs the same code, without `--out`.
 */
import path from 'path'
import { GLB_BUILDING_NODE, metresText, planFloors, resolveFloor } from '@ongrid/floorplan/geometry'
import { english, joined, name, num, said, type Said } from '@ongrid/floorplan/messages'
import {
  EXPORT_FORMATS,
  exportFileName,
  exportPlan,
  isExportFormat,
  kindsText,
  partNames,
  type ApproximatedPart,
  type ExportFormat,
  type LeftOutPart,
  type PlanExport
} from '@ongrid/floorplan/export'
import { writeProjectExport } from '../export/projectExports'
import { projectDxfProfile } from '../export/dxfProfile'
import { PathRefused, type Project } from '../fs/projectFiles'
import { floorOption, loadPlan, PlanRefused, type LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

export const EXPORT_OPTIONS: OptionSpecs = {
  '--format': { takesValue: true, help: `The file format: ${EXPORT_FORMATS.join(', ')}.` },
  '--floor': { takesValue: true, help: 'DXF, OBJ and GLB: the floor to export (a floor id from the plan). Left out, OBJ and GLB hold every floor at its elevation, and DXF the ground floor.' },
  '--date': { takesValue: true, help: 'IFC: the time stamp to write, a date (2026-01-31) or a time (2026-01-31T09:00:00Z). SOURCE_DATE_EPOCH when left out, else now. The same date gives the same file.' },
  '--out': { takesValue: true, help: 'The file to write, inside the project, ending in the format\'s extension. exports/ beside the plan when left out.' },
  ...PROJECT_OPTION,
}

export interface ExportRequest {
  readonly format?: string
  readonly floor?: string
  readonly out?: string
  /** CMD-26: the time stamp to write, as given. */
  readonly date?: string
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
  const formats = EXPORT_FORMATS.join(', ')
  if (request.format === undefined) throw new UsageError(`export needs --format: one of ${formats}.`)
  if (!isExportFormat(request.format)) {
    throw new UsageError(`--format ${JSON.stringify(request.format)} is not one Grid writes: use one of ${formats}.`)
  }
  const format = request.format
  exportTime(request.date)
  if (format === 'ifc' && request.floor !== undefined) {
    throw new UsageError('--floor does not apply to IFC, which holds every floor: leave --floor out.')
  }
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== `.${format}`) {
    throw new UsageError(`--out ${JSON.stringify(request.out)} does not end in .${format}: name a .${format} file.`)
  }
  return format
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
 * - One floor of a plan with several is named by its place in the plan, `-floor-2`, not by the
 *   floor's own name or id, which are text from inside the plan.
 *
 * Grid sanitises rather than refuses: the export is still written, and `note` says what changed.
 */
export function exportNameOf(planFile: string, format: ExportFormat, floorNumber: number | null): ExportName {
  const made = exportBaseOf(planFile)
  let base = made.base
  let note = made.note
  if (floorNumber !== null) base = `${base}-floor-${floorNumber}`
  if (WINDOWS_DEVICE.test(base)) {
    note = `${base} is a name Windows keeps for a device`
    base = `plan-${base}`
  }
  const fileName = `${base}.${format}`
  return note === undefined ? { fileName } : { fileName, note: `Named the export ${fileName}: ${note}.` }
}

/** The floor's place in the plan, from 1, when an export holds one floor of several. */
function floorNumberOf(loaded: LoadedPlan, format: ExportFormat, floorId: string | undefined): number | null {
  if (format === 'ifc') return null
  // VEW-64: an OBJ or GLB with no floor named holds the whole building.
  if (floorId === undefined && format !== 'dxf') return null
  const floors = planFloors(loaded.plan)
  if (floors.length <= 1) return null
  const id = resolveFloor(loaded.plan, floorId)
  return floors.findIndex((floor) => floor.id === id) + 1
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
  if (made.floorsLeftOut.length === 0) {
    return english(format === 'glb'
      ? said('drawing.export.floors.building.glb', { n: all, root: name(GLB_BUILDING_NODE) })
      : said(`drawing.export.floors.building.${format === 'obj' ? 'obj' : 'ifc'}`, { n: all }))
  }
  const held = made.floors[0]!
  const left = made.floorsLeftOut.length
  const others = left === 1 ? said('drawing.export.floors.others.one') : said('drawing.export.floors.others.many', { n: left })
  const one = format === 'glb' ? 'glb' : format === 'obj' ? 'obj' : 'dxf'
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
  const floorId = floorOption(loaded.plan, request.floor)
  const name = projectNameOf(planFile)
  const dxf = format === 'dxf' ? projectDxfProfile(project) : null
  const options = { projectId: name, projectName: name, floorId, now: exportTime(request.date), ...(dxf === null ? {} : { dxfProfile: dxf.profile }) }
  const made = exportPlan(loaded.plan, format, loaded.faults === undefined ? options : { ...options, faults: loaded.faults })
  if (made.empty) throw new PlanRefused(nothingToExport(loaded, planFile, format, made, floorId))
  return { ...made, name: exportNameOf(planFile, format, floorNumberOf(loaded, format, floorId)), dxfProfile: dxf?.file ?? null }
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
  const made = exportFile(project, loaded, planFile, format, request)
  const written = writeBesidePlan(project, planFile, made.name.fileName, made.data)
  const done = { loaded, written, leftOut: made.leftOut, approximated: made.approximated, dxfProfile: made.dxfProfile, floors: made.floors, floorsLeftOut: made.floorsLeftOut }
  return made.name.note === undefined ? done : { ...done, note: made.name.note }
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
