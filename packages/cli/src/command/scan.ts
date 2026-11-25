/**
 * `grid write --scan <scan.json>` and `grid_write_rooms` with `scan` (HND-12): a plan written from
 * a phone room scan, Apple's room model first. The core (`@ongrid/floorplan/scan`) pairs each
 * wall's two faces and draws the rooms; this file reads the scan, writes the plan, and keeps the
 * scan beside it as evidence, `<plan>.scan.json`, keyed by the scan's own ids.
 *
 * The scan is read as a plan file is (MSG-9): through the project's one reader, with the plan
 * file's size limit, its text decoded one way, and its ids held to the plan's character and
 * length rules. A refusal names the part and the limit, never the scan's text.
 *
 * A re-scan is matched to the scan kept before: a part whose scan id reappears keeps its plan id,
 * a part with a new scan id gets a new one, and a part whose scan id is gone is gone from the
 * plan, named in the answer. A plan changed since Grid wrote it from the scan, or one not written
 * from a scan, is refused unless `replace` is given, as rooms text is.
 */
import path from 'path'
import { validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { carryFacts, planRevision } from '@ongrid/floorplan/rooms'
import { planFromScan, readRoomScan, readScanEvidence, scanEvidence, ScanRefused, type RoomScan, type ScanConversion, type ScanIds } from '@ongrid/floorplan/scan'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { PathRefused, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { briefAnswer, briefReminder, type BriefData } from '../brief/answer'
import { comparePlans } from '../quantities/compare'
import { surveyPlan } from '../quantities/survey'
import { loadPlan } from './plan'
import { refuseGridFile } from './planFile'
import { PLAN_FILE_MAX_BYTES, planTextProblem } from './planText'
import { differenceLine, nothingToLose, oneLine, RoomsRefused } from './write'
import type { TapedRow } from '@ongrid/floorplan/geometry'
import { TAPED_ROWS_IN_AN_EDIT, tapedRows, tapedTable } from '../taped/table'

/** The evidence file of a plan: beside it, its name without `.json` and `.scan.json` after. */
export const SCAN_SUFFIX = '.scan.json'

export function scanFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${SCAN_SUFFIX}`)
}

export interface ScanWriteDone {
  readonly written: string
  /** The evidence file, in the project. */
  readonly evidence: string
  readonly conversion: ScanConversion
  readonly plan: FloorPlan
  readonly verdict: string | null
  readonly drawingProblems: { readonly before: number; readonly after: number }
  readonly brief: BriefData
  readonly reminder: string | null
  /** HND-11: each length taped on site the file keeps, against the plan written from the scan. */
  readonly taped: readonly TapedRow[]
  readonly lines: readonly string[]
}

/** The text of a JSON file in the project, parsed; refused with `code`, naming the file and never its text. */
function readJson(project: Project, file: string, what: string, code: string): unknown {
  const shown = path.basename(file)
  let text: string
  try {
    text = project.readText(file, PLAN_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof PathRefused) throw error
    if (error instanceof TextNotDecoded) throw new RoomsRefused(code, `${shown}: ${oneLine(error.message)}`)
    const errno = (error as NodeJS.ErrnoException).code
    if (errno === 'ENOENT') throw new RoomsRefused(code, `There is no file ${file}.`)
    if (errno === 'EISDIR') throw new RoomsRefused(code, `${file} is a folder, not ${what}.`)
    if (errno === 'EFBIG') throw new RoomsRefused(code, `${file} is larger than ${PLAN_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads.`)
    if (errno === 'EACCES' || errno === 'EPERM') throw new RoomsRefused(code, `${file} can't be read: permission denied.`)
    throw error
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    // The parser's message quotes the text around the fault, and a scan holds a home's layout.
    throw new RoomsRefused(code, `${shown} is not JSON, so it is not ${what}.`)
  }
}

/** The scan kept beside the plan, if any: the plan's revision as written from it, and its ids. */
function previousScan(project: Project, planFile: string): { readonly plan: string | null; readonly ids: ScanIds; readonly problem: string | null } | null {
  const file = scanFileOf(planFile)
  if (!project.exists(file)) return null
  try {
    return { ...readScanEvidence(readJson(project, file, 'the scan Grid keeps beside a plan', 'scan/evidence')), problem: null }
  } catch (error) {
    if (error instanceof RoomsRefused || error instanceof ScanRefused) return { plan: null, ids: {}, problem: `${path.basename(file)} can't be read (${oneLine(error.message)}), so no part keeps its id from it` }
    throw error
  }
}

const pct = (fraction: number): string => (Number.isFinite(fraction) ? `${(Math.abs(fraction) * 100).toFixed(4)}%` : 'not measured')
const m2 = (area: number): string => (Number.isFinite(area) ? `${area.toFixed(2)} m²` : 'not measured')

/**
 * Writes the scan `scanFile` into the plan file `planFile` and keeps the scan beside it. Refuses
 * with `RoomsRefused` (a scan that can't be read or drawn, or a plan that would lose a change),
 * `PlanRefused` (a plan file that is there but is not a plan) or the project's `PathRefused`;
 * nothing is written then.
 */
export function writeScanIntoProject(project: Project, scanFile: string, planFile: string, options: { readonly replace?: boolean } = {}): ScanWriteDone {
  if (!planFile.toLowerCase().endsWith('.json')) throw new RoomsRefused('rooms/plan-file', `The plan to write must be a .json file: got ${JSON.stringify(planFile)}.`)
  refuseGridFile(project.shown(project.resolve(planFile)), planFile)
  const evidenceFile = scanFileOf(planFile)
  const same = (a: string, b: string): boolean => project.resolve(a) === project.resolve(b)
  if (same(scanFile, planFile)) throw new RoomsRefused('scan/same-file', 'The scan and the plan are one file: name the plan to write with --plan (plan in a tool call), another file.')
  if (same(scanFile, evidenceFile)) throw new RoomsRefused('scan/same-file', `${path.basename(scanFile)} is the scan Grid keeps beside the plan: name the new scan, which Grid then keeps there in its place.`)

  let conversion: ScanConversion
  let read: RoomScan
  const previous = previousScan(project, planFile)
  try {
    read = readRoomScan(readJson(project, scanFile, 'a room scan', 'scan/not-read'))
    conversion = planFromScan(read, previous?.ids ?? null)
  } catch (error) {
    if (error instanceof ScanRefused) throw new RoomsRefused(error.code, `${error.message} The plan is as it was.`)
    throw error
  }

  const problem = planTextProblem(conversion.plan as unknown as Record<string, unknown>)
  if (problem !== null) throw new RoomsRefused('scan/text-limit', `The scan was not written: ${problem}.`)
  const parsed = FloorPlanSchema.safeParse(conversion.plan)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new RoomsRefused('scan/schema', `The scan was not written: the plan it makes does not fit the plan's format at ${first?.path.join('.') ?? 'its top'} (${first?.message ?? 'invalid'}).`)
  }
  let plan = parsed.data

  // The plan now, and whether writing over it would lose a change.
  let before: FloorPlan | null = null
  let raw: Record<string, unknown> = { version: '1', units: 'm' }
  const shownFile = project.shown(project.resolve(planFile))
  if (project.exists(planFile)) {
    before = loadPlan(project, planFile, { whole: true }).plan
    raw = JSON.parse(project.readText(planFile, PLAN_FILE_MAX_BYTES).text) as Record<string, unknown>
    if (options.replace !== true && !nothingToLose(before)) {
      const now = planRevision(before)
      if (previous === null || previous.plan === null) {
        const why = previous?.problem ?? `there is no scan kept beside it (${path.basename(evidenceFile)})`
        throw new RoomsRefused('scan/plan-changed', `${shownFile} was not written from a scan: ${why}, and writing this scan over it would lose what it holds. ${differenceLine(before, plan)} Add --replace to write over it.`)
      }
      if (previous.plan !== now) {
        throw new RoomsRefused('scan/plan-changed', `${shownFile} was changed since Grid wrote it from the scan kept beside it, and writing this scan over it would lose that. ${differenceLine(before, plan)} Add --replace to write over it: parts whose scan ids reappear still keep their ids.`)
      }
    }
  }

  // CNT-9: the facts of the person's own and the rooms' numbers stay with their parts, by id.
  const carried = before === null ? null : carryFacts(before, plan)
  if (carried !== null) plan = carried.plan
  // Everything the scan does not hold stays as the file has it: its id, its site, its views.
  const next: Record<string, unknown> = { ...raw, version: '1', units: 'm' }
  for (const key of ['floors', 'items', 'marks', 'written']) delete next[key]
  if (plan.floors !== undefined) next['floors'] = plan.floors
  next['walls'] = conversion.plan.walls.map((w) => ({ ...w, ...(carriedProperties(plan.walls, w.id)) }))
  next['rooms'] = plan.rooms
  next['openings'] = plan.openings
  if (conversion.plan.items !== undefined) next['items'] = conversion.plan.items
  next['marks'] = conversion.plan.marks
  const first = before === null || nothingToLose(before)
  const written = project.relative(project.writeFile(planFile, `${JSON.stringify(next, null, 2)}\n`))
  // The plan as read back, whose revision the evidence keeps: a re-scan compares it with the plan then.
  const now = loadPlan(project, planFile, { whole: true }).plan
  const evidence = project.relative(project.writeFile(evidenceFile, `${JSON.stringify(scanEvidence(read, conversion, planRevision(now)), null, 2)}\n`))
  const brief = briefAnswer(project, planFile, now)
  const reminder = first ? briefReminder(project, planFile, now) : null
  const verdict = before === null || nothingToLose(before) ? null : comparePlans(surveyPlan(before), surveyPlan(now), ['the plan before', 'the plan now']).verdict
  const drawingProblems = { before: before === null ? 0 : validatePlan(before).issues.length, after: validatePlan(now).issues.length }
  // HND-11: what was taped on site stays beside the plan, and is held against the scan's walls.
  const taped = tapedRows(now)

  const c = conversion
  const doors = c.plan.openings.length
  const lines = [
    `Wrote ${written} from the scan ${project.shown(project.resolve(scanFile))}: ${count(c.rooms.length, 'room')}, ${count(c.plan.walls.length, 'wall')} (${c.paired.length} between two scanned faces, ${c.oneSided.length} scanned from one side), ${count(doors, 'door or window', 'doors and windows')}${(c.plan.items?.length ?? 0) > 0 ? `, ${count(c.plan.items!.length, 'fixture')}` : ''}.`,
    `Each room's area against the scan's: ${c.rooms.map((r) => `${JSON.stringify(r.name)} ${m2(r.area)} (the scan's ${r.from} ${m2(r.scanArea)}, ${pct(r.difference)} apart)`).join('; ')}.`,
    `Kept the scan beside the plan as ${evidence}, keyed by its own ids: a re-scan keeps the plan's ids for the parts it finds again.`,
    ...(previous === null ? [] : [matchLine(c, previous.problem)]),
    `Assumed, to confirm with the person (${c.assumed.length}):`,
    ...c.assumed.map((a) => `  - ${a.text}`),
    ...(c.leftOut.length === 0 ? [] : [`Not drawn: ${c.leftOut.join(' ')}`]),
    ...c.warnings.map((w) => `Warning: ${w}`),
    ...(verdict === null ? [] : [verdict]),
    ...(carried === null || carried.kept === 0 ? [] : [`Facts of your own and room numbers kept by id on ${count(carried.kept, 'part')}.`]),
    ...(carried === null || carried.lost.length === 0 ? [] : [`Not in the scan, so their facts and numbers are gone with them: ${carried.lost.slice(0, 10).join(', ')}${carried.lost.length > 10 ? ` and ${carried.lost.length - 10} more` : ''}.`]),
    `Problems in the drawing: ${drawingProblems.before} → ${drawingProblems.after}. Run grid check for the notes; the assumed values are listed there to confirm. grid_square_scan squares the scanned walls, as its own step.`,
    ...tapedTable(taped, { max: TAPED_ROWS_IN_AN_EDIT }),
    ...brief.text,
    ...(reminder === null ? [] : [reminder]),
  ]
  return { written, evidence, conversion, plan: now, verdict, drawingProblems, brief: brief.data, reminder, taped, lines }
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/** The facts a wall carried over (CNT-9), for a wall written as the scan states it. */
function carriedProperties(walls: FloorPlan['walls'], id: string): Record<string, unknown> {
  const wall = walls.find((w) => w.id === id)
  return wall?.properties === undefined ? {} : { properties: wall.properties }
}

/** What a re-scan matched, in a sentence. */
function matchLine(c: ScanConversion, problem: string | null): string {
  const { kept, fresh, gone } = c.match
  const goneText = gone.length === 0 ? 'nothing the scan before had is missing' : `gone with the scan ids this scan does not have: ${gone.slice(0, 10).map((g) => `${g.part} ${JSON.stringify(g.id)}`).join(', ')}${gone.length > 10 ? ` and ${gone.length - 10} more` : ''}`
  return `${problem === null ? '' : `${problem[0]!.toUpperCase()}${problem.slice(1)}. `}Matched to the scan kept before by its ids: ${count(kept, 'part')} kept ${kept === 1 ? 'its id' : 'their ids'}, ${fresh} new; ${goneText}.`
}
