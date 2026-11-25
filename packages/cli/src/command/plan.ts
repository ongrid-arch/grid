/**
 * Reads a plan file for a command, or refuses it with one line that says why.
 *
 * A plan is refused when it can't be read, isn't JSON, holds an unfinished git merge, or isn't
 * a Grid plan at its top level. A part with a value Grid cannot read is not (MSG-6): the plan is
 * read part by part, that part is left out or its value read as meant, and the rest is drawn
 * and checked. A plan that passes the schema but has parts that can't be drawn is not refused
 * either: those parts are left out, as the app leaves them out, and `grid check` says which and
 * why. A command that writes the plan back reads it whole (`{ whole: true }`), so nothing the
 * reader left out is lost, and its opening patterns (LVL-8) stay patterns: every other command
 * reads them as the plain openings they expand into.
 */
import { planInMetres } from '@ongrid/floorplan/types/units'
import { mergeBase, planFloors, validatePlan, withPatterns, type Issue } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, quoted, type FloorPlan, type PlanSchemaIssue } from '@ongrid/floorplan/types/floorplan'
import { readPlanText, type UnfinishedMerge } from '@ongrid/floorplan/types/jsonText'
import { readPlanParts, type LeftOutPart, type ReadFault } from '@ongrid/floorplan/types/readParts'
import type { TraceLeftOut } from '@ongrid/rules'
import { PathRefused, type Project } from '../fs/projectFiles'
import { hasPictureEnding } from '../trace/traceImage'
import { say } from '@ongrid/floorplan/messages'
import { TextNotDecoded } from '../fs/textEncoding'
import { PLAN_FILE_MAX_BYTES, planTextProblem } from './planText'
import { UsageError } from './options'
import { holdsAPlan, refuseForeignFile } from './planFile'

/** Why a plan was refused. The message is one line. */
export class PlanRefused extends Error {
  override readonly name = 'PlanRefused'
}

export interface LoadedPlan {
  /** The real path of the plan file, inside the project. */
  readonly file: string
  /**
   * The plan as Grid draws, measures, checks and exports it. LVL-8: with its opening patterns
   * expanded into plain openings, except when read whole for a command that writes it back.
   */
  readonly plan: FloorPlan
  /** LVL-8: the plan as its file states it, patterns and all, when it has patterns and `plan` expands them. */
  readonly stated?: FloorPlan
  readonly issues: readonly Issue[]
  /** Ids the views and exports leave out because they can't be drawn. */
  readonly broken: ReadonlySet<string>
  /** What the reader did with each part or value it could not read as written (MSG-6). */
  readonly faults?: readonly ReadFault[]
  /** MSG-5: the walls, rooms and openings the reader left out, for the checks to hold back what rests on them. */
  readonly leftOut?: readonly LeftOutPart[]
  /**
   * The file's text, which `grid check` reads again for the record, so the record names what
   * the reader did (MSG-6). Absent for a plan made in memory.
   */
  readonly text?: string
  /**
   * CNT-10: the base plan a fit-out names, read in: its file, the plan as read, and the ids of
   * the walls and openings it gave the plan, which are read-only: no change writes them back.
   * Absent for a plan that names no base.
   */
  readonly base?: LoadedBase
  /** MSG-20: why the plan's trace image is not followed or drawn; absent when it is, or there is none. */
  readonly trace?: TraceLeftOut
}

/** CNT-10: a fit-out's base plan, as `loadPlan` read it in. */
export interface LoadedBase {
  /** The base's path as the plan names it. */
  readonly file: string
  /** The base plan as read, its opening patterns expanded. */
  readonly plan: FloorPlan
  readonly walls: ReadonlySet<string>
  readonly openings: ReadonlySet<string>
}

export interface LoadOptions {
  /**
   * Refuse a plan with any part or value the reader could not read as written, as before MSG-6.
   * For a command that writes the plan back: reading it part by part would drop what it left out.
   */
  readonly whole?: boolean
  /** CNT-10: the plan is read as a fit-out's base: its own base, if it names one, is not read. */
  readonly asBase?: boolean
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function readText(project: Project, file: string): { text: string; real: string } {
  try {
    // CMD-20: a CAD file, a PDF or a picture is named for what it is, before it is read as text.
    refuseForeignFile(file, project.readBytes(file, PLAN_FILE_MAX_BYTES))
    return project.readText(file, PLAN_FILE_MAX_BYTES)
  } catch (error) {
    if (error instanceof TextNotDecoded) throw new PlanRefused(oneLine(error.message))
    // A path the project refuses is refused as it is: its message names the project folder.
    if (!(error as NodeJS.ErrnoException).code) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new PlanRefused(`There is no file ${file}.`)
    if (code === 'EISDIR') throw new PlanRefused(`${file} is a folder, not a plan file.`)
    if (code === 'EFBIG') throw new PlanRefused(`${file} is larger than ${PLAN_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a plan file.`)
    if (code === 'EACCES' || code === 'EPERM') throw new PlanRefused(`${file} can't be read: permission denied.`)
    throw new PlanRefused(`${file} can't be read: ${oneLine((error as Error).message)}`)
  }
}

/** Where a schema problem is, as `walls[2].thickness`. */
function pathText(path: readonly (string | number)[]): string {
  return path.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${key}` : key), '')
}

/**
 * Where the text stops being JSON, in Grid's words. The parser's own message quotes the text
 * around the spot, and the text may be anything: a stranger's sentence to the agent, or the
 * start of a file that was never a plan.
 */
function notJson(text: string, error: unknown): string {
  const message = (error as Error).message
  if (/unexpected end of json input/i.test(message)) return 'it ends before the JSON does'
  const at = /position (\d+)/.exec(message)
  if (!at) return 'it can\'t be read as JSON'
  const before = text.slice(0, Number(at[1])).split('\n')
  return `it stops being JSON at line ${before.length}, column ${before[before.length - 1]!.length + 1}`
}

/**
 * A schema problem in Grid's words: where it is and what the schema wants, never the value
 * found there, which is text from the plan. Paths are keys of the schema and positions.
 */
function schemaProblem(issue: PlanSchemaIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? `needs a ${issue.expected}` : `must be a ${issue.expected}, not a ${issue.received}`
    case 'invalid_enum_value':
      return `must be one of ${issue.options.map((option) => JSON.stringify(option)).join(', ')}`
    case 'invalid_literal':
      return `must be ${JSON.stringify(issue.expected)}`
    case 'too_small':
    case 'too_big':
    case 'invalid_string':
    case 'not_finite':
    case 'not_multiple_of':
      // Made from the schema's own limits: "Number must be greater than 0".
      return issue.message
    default:
      return `does not fit the plan's format (${issue.code})`
  }
}

/** An unfinished merge in one line: where, and what each side adds or changes, by id. */
function mergeText(merge: UnfinishedMerge): string {
  const side = (label: string | null, other: string): string => (label === null ? other : quoted(label))
  const ids = (list: readonly string[]): string => (list.length > 6 ? `${list.slice(0, 6).map(quoted).join(', ')} and ${list.length - 6} more` : list.map(quoted).join(', '))
  const ours = side(merge.ours.label, 'one side')
  const theirs = side(merge.theirs.label, 'the other')
  const said = [
    merge.ours.adds.length > 0 ? `${ours} adds ${ids(merge.ours.adds)}` : null,
    merge.theirs.adds.length > 0 ? `${theirs} adds ${ids(merge.theirs.adds)}` : null,
    merge.changed.length > 0 ? `both change ${ids(merge.changed)}` : null,
  ].filter((part) => part !== null)
  const conflicts = merge.conflicts === 1 ? 'a conflict' : `${merge.conflicts} conflicts`
  return `${conflicts} between ${ours} and ${theirs}, the first at line ${merge.line}${said.length > 0 ? `: ${said.join('; ')}` : ''}. Finish the merge and take out git's markers`
}

/** A reading fault in one line, for a command that refuses it. */
function faultText(fault: ReadFault): string {
  if (fault.kind === 'id-clash') return `${fault.part.list}[${fault.part.index}].id is the id of ${fault.kept.list}[${fault.kept.index}] too`
  return `${pathText(fault.path)} is ${fault.found}, and the format takes ${fault.wants}`
}

/**
 * CMD-15 (T-5): the trace image a plan names is a path written by whoever wrote the plan, and
 * the plan may come from a stranger. It must lead to a file inside the project folder, by the
 * same resolver as every other path: no web address, no network or device path, no `..` or
 * absolute path out of the folder, no symbolic link out of it. Relative to the project folder,
 * as the schema says, for the command and the tool server alike. HND-10: and it is a picture by
 * its ending, so no script, page or other file is named as one. MSG-20: one that is not is never
 * followed, and the plan is read without it, with one line; so is a picture not there yet.
 */
function traceImageCheck(project: Project, plan: FloorPlan): TraceLeftOut | null {
  const image = plan.referenceImage
  if (image === undefined) return null
  let real: string
  try {
    real = project.resolve(image.path, 'project')
  } catch (error) {
    if (!(error instanceof PathRefused)) throw error
    return { path: image.path, why: 'refused', detail: oneLine(error.message) }
  }
  if (!hasPictureEnding(image.path)) return { path: image.path, why: 'ending' }
  return project.exists(real) ? null : { path: image.path, why: 'missing' }
}

/**
 * CNT-10 (lab CP4-4): the base plan a fit-out names. Its path, written in the plan, is resolved
 * like the trace image's, from the project folder and inside it (CMD-15); the file is read as any
 * plan is, and must name no base of its own. Its walls and openings are read into the plan as
 * existing (`mergeBase`); one whose id the plan uses for a part of its own refuses the plan.
 */
function readBase(project: Project, file: string, plan: FloorPlan): { plan: FloorPlan; base: LoadedBase } {
  const named = plan.base!
  let real: string
  try {
    real = project.resolve(named, 'project')
  } catch (error) {
    if (!(error instanceof PathRefused)) throw error
    throw new PlanRefused(`${file} can't be used: its base plan, base, is refused. ${error.message} Name a plan inside the project folder, or take base out of the plan.`)
  }
  let loaded: LoadedPlan
  try {
    const { text } = readText(project, real)
    loaded = loadPlanText(project, named, text, real, { asBase: true })
  } catch (error) {
    if (!(error instanceof PlanRefused)) throw error
    throw new PlanRefused(`${file} can't be used: its base plan ${quoted(named)} can't be read. ${error.message}`)
  }
  if (loaded.plan.base !== undefined) {
    throw new PlanRefused(`${file} can't be used: its base plan ${quoted(named)} names a base of its own, and a base must be a plan that stands on its own.`)
  }
  const merged = mergeBase(plan, loaded.plan)
  if (merged.clashes.length > 0) {
    const ids = merged.clashes.slice(0, 5).map(quoted).join(', ')
    throw new PlanRefused(`${file} can't be used: it gives ${merged.clashes.length === 1 ? 'a part' : 'parts'} of its own the ${merged.clashes.length === 1 ? 'id' : 'ids'} ${ids}${merged.clashes.length > 5 ? ` and ${merged.clashes.length - 5} more` : ''} of the base plan ${quoted(named)}'s walls and openings. Rename ${merged.clashes.length === 1 ? 'it' : 'them'} in this plan.`)
  }
  return { plan: merged.plan, base: { file: named, plan: loaded.plan, walls: merged.walls, openings: merged.openings } }
}

/** Reads a plan file inside the project. Refused with `PlanRefused`, or `PathRefused` for the path. */
export function loadPlan(project: Project, file: string, options: LoadOptions = {}): LoadedPlan {
  const { text, real } = readText(project, file)
  return loadPlanText(project, file, text, real, options)
}

/**
 * Reads a plan from its text, as `loadPlan` reads a file's: an earlier version of `file` kept in
 * a start marker or in git (WRT-8). `real` is the path it is named by in what is said of it.
 */
export function loadPlanText(project: Project, file: string, text: string, real: string, options: LoadOptions = {}): LoadedPlan {
  // MSG-6: the text first, for a merge left unfinished, NaN and a decimal comma.
  const read = readPlanText(text)
  if (!read.ok && read.fault.kind === 'unfinished-merge') {
    throw new PlanRefused(`${file} holds an unfinished git merge: ${mergeText(read.fault)}.`)
  }
  if (!read.ok) {
    let error: unknown = null
    try {
      // The reader has dropped a byte-order mark already; a second one is not JSON.
      JSON.parse(text)
    } catch (thrown) {
      error = thrown
    }
    throw new PlanRefused(`${file} is not JSON: ${notJson(text, error)}.`)
  }
  const raw = read.value
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PlanRefused(`${file} is not a Grid plan: it must be a JSON object with walls, rooms and openings.`)
  }
  // WRT-13: the schema defaults every list, so an object that is no plan would read as an empty one.
  if (!holdsAPlan(raw as Record<string, unknown>)) throw new PlanRefused(say('en', 'plan.notAPlan.noParts', { file }))
  // MSG-9: names and ids are limited and cleaned before the schema reads them.
  // MSG-20: a note, a sketch item, a fact or the trace image's path is left to the reader, which
  // leaves it out alone with a line.
  const textProblem = planTextProblem(raw as Record<string, unknown>, { leaveOut: true })
  if (textProblem !== null) throw new PlanRefused(`${file} is not a Grid plan: ${textProblem}.`)
  const parts = readPlanParts(raw, read.marks)
  const strict = (): void => {
    // The schema's own words, as before MSG-6.
    const parsed = FloorPlanSchema.safeParse(planInMetres(raw).raw)
    if (parsed.success) return
    const [first, ...rest] = parsed.error.issues
    const where = first && first.path.length > 0 ? `${pathText(first.path)}: ` : ''
    const more = rest.length > 0 ? ` (and ${rest.length} more problem${rest.length === 1 ? '' : 's'})` : ''
    throw new PlanRefused(`${file} is not a Grid plan: ${where}${first ? oneLine(schemaProblem(first)) : 'invalid'}${more}`)
  }
  if (parts.plan === null) {
    strict()
    throw new PlanRefused(`${file} is not a Grid plan.`)
  }
  // WRT-7: lengths stated in another unit are read in it, and the change is written in metres.
  const faults = parts.faults.filter((f) => !(f.kind === 'read-as-meant' && f.path.length === 1 && f.path[0] === 'units' && planInMetres(raw).from !== null))
  if (options.whole === true && faults.length > 0) {
    // A value the text could not hold is named for what it is; the rest in the schema's words.
    if (read.marks.length === 0) strict()
    const [first, ...rest] = faults
    const more = rest.length > 0 ? ` (and ${rest.length} more)` : ''
    throw new PlanRefused(`${file} has a part Grid would leave out or read otherwise: ${faultText(first!)}${more}. grid check names each; correct them first.`)
  }
  const trace = traceImageCheck(project, parts.plan)
  // CNT-10: a fit-out is read with its base's walls and openings in it, as existing.
  const based = parts.plan.base === undefined || options.asBase === true ? null : readBase(project, file, parts.plan)
  const plan = based?.plan ?? parts.plan
  // LVL-8: what kept a pattern's openings from being placed is checked on the plan as stated. A
  // command that writes the plan back keeps it as stated, so its patterns stay patterns.
  const { issues, broken } = validatePlan(plan, undefined, { leftOutWalls: parts.leftOutWalls, leftOutParts: parts.leftOut })
  const expanded = options.whole === true || plan.patterns === undefined ? null : withPatterns(plan)
  return {
    file: real,
    plan: expanded ?? plan,
    ...(expanded === null ? {} : { stated: plan }),
    issues,
    broken,
    faults: parts.faults,
    leftOut: parts.leftOut,
    text,
    ...(based === null ? {} : { base: based.base }),
    ...(trace === null ? {} : { trace }),
  }
}

/**
 * The floor a command was asked for, checked against the plan. Unlike the views, a command
 * never falls back to another floor: a floor that isn't there is refused.
 */
export function floorOption(plan: FloorPlan, floor: string | undefined): string | undefined {
  if (floor === undefined) return undefined
  const floors = planFloors(plan)
  if (floors.some((f) => f.id === floor)) return floor
  // Quoted: a floor id is text from the plan file, and may hold anything.
  const known = floors.map((f) => JSON.stringify(f.id)).join(', ')
  throw new UsageError(`--floor ${JSON.stringify(floor)} is not a floor of this plan. Its floors: ${known || 'none'}.`)
}
