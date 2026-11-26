/**
 * CMD-44: the plan's change log and its checkpoints, beside the plan.
 *
 * Every change Grid makes to a plan file keeps the plan it replaced and says what it did, so a
 * change can be taken back (`restore.ts`) and anyone can read who changed what, without a marker
 * set beforehand:
 *
 * - The log, `<plan>.history.jsonl` (`plan.history.jsonl` beside `plan.json`): one JSON object a
 *   line, only ever added to (`Project.appendText`), never rewritten:
 *
 *     {"seq":3,"at":"2026-11-26T10:00:00.000Z","by":"agent-2","via":"grid serve","tool":"grid_set_facts",
 *      "before":"3f9a0c12be47","after":"8d1e…","verdict":"…","lines":["…"],"more":0,"fields":["…"],"fieldsMore":0}
 *
 *   `before` and `after` are the plan's revisions (`edit/revision.ts`); `before` is null for a
 *   change that wrote a plan where there was none. `lines` are the building's change lines as
 *   `grid_diff` says them, `fields` every field that changed (`fields.ts`), facts and numbers
 *   included, each list bounded with the count left out. An undo names the entry it undid
 *   (`undoes`), a restore what it put back (`restored`).
 * - The checkpoints, `<plan>.checkpoints/<revision>.json`: the plan file's text as it was on disk
 *   before each change, whole, so a person can put one back by copying a file. At most
 *   `CHECKPOINTS_MAX` are kept; the oldest by the log is removed. The log keeps its entries.
 *
 * Both are read and written only through `fs/projectFiles.ts`. The plan knows nothing of them,
 * and no export, sheet or drawing reads them.
 */
import path from 'path'
import { compareBuildings } from '@ongrid/floorplan/geometry'
import { PathRefused, type Project } from '../fs/projectFiles'
import { loadPlanText } from '../command/plan'
import { readRevision, REVISION_DIGITS, revisionOfText, type PlanAtRevision } from '../edit/revision'
import { fieldChangesOfTexts } from './fields'

/** What the file names add to the plan's name. */
export const HISTORY_SUFFIX = '.history.jsonl'
export const CHECKPOINTS_SUFFIX = '.checkpoints'

/** The most checkpoints a plan keeps. */
export const CHECKPOINTS_MAX = 50

/** The most building change lines and field lines an entry keeps; the rest are counted. */
export const ENTRY_LINES_MAX = 40
export const ENTRY_FIELDS_MAX = 60

/** The largest log Grid reads. */
export const HISTORY_FILE_MAX_BYTES = 64 * 1024 * 1024

/** A plan text larger than this is logged by its fields only: the building comparison would take too long. */
const COMPARED_BYTES_MAX = 4 * 1024 * 1024

/** The longest name of who made a change. */
export const BY_MAX = 60

const REVISION = new RegExp(`^[0-9a-f]{${REVISION_DIGITS}}$`)

export interface HistoryEntry {
  /** Its place in the log, from 1. */
  readonly seq: number
  /** When it was made, as an ISO date and time. */
  readonly at: string
  /** Who made it, as they named themselves; null when they did not. */
  readonly by: string | null
  /** What made it: `grid serve`, `grid edit`, `grid write`. */
  readonly via: string
  /** The tool or command. */
  readonly tool: string
  /** The plan's revision before, null when there was no plan; after. */
  readonly before: string | null
  readonly after: string
  readonly verdict: string | null
  readonly lines: readonly string[]
  readonly more: number
  readonly fields: readonly string[]
  readonly fieldsMore: number
  /** The entry an undo undid. */
  readonly undoes?: number
  /** What a restore put back, as it was named. */
  readonly restored?: string
}

/** Who made a change and with what. */
export interface ChangeMade {
  readonly tool: string
  readonly via: string
  readonly by?: string | null | undefined
  readonly undoes?: number
  readonly restored?: string
}

function stem(planFile: string): string {
  const name = path.basename(planFile)
  return name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
}

/** The log of a plan file: `plan.json` has `plan.history.jsonl` beside it. */
export function historyFileOf(planFile: string): string {
  return path.join(path.dirname(planFile), `${stem(planFile)}${HISTORY_SUFFIX}`)
}

/** The checkpoints folder of a plan file: `plan.json` has `plan.checkpoints/` beside it. */
export function checkpointsFolderOf(planFile: string): string {
  return path.join(path.dirname(planFile), `${stem(planFile)}${CHECKPOINTS_SUFFIX}`)
}

/** The checkpoint of one revision. */
export function checkpointFileOf(planFile: string, revision: string): string {
  return path.join(checkpointsFolderOf(planFile), `${revision}.json`)
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

function entryOf(raw: unknown): HistoryEntry | null {
  if (!isRecord(raw)) return null
  const { seq, at, by, via, tool, before, after } = raw
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null
  if (typeof tool !== 'string' || typeof after !== 'string' || !REVISION.test(after)) return null
  if (before !== null && (typeof before !== 'string' || !REVISION.test(before))) return null
  return {
    seq,
    at,
    by: typeof by === 'string' ? by : null,
    via: typeof via === 'string' ? via : '',
    tool,
    before: before as string | null,
    after,
    verdict: typeof raw['verdict'] === 'string' ? raw['verdict'] : null,
    lines: strings(raw['lines']),
    more: typeof raw['more'] === 'number' ? raw['more'] : 0,
    fields: strings(raw['fields']),
    fieldsMore: typeof raw['fieldsMore'] === 'number' ? raw['fieldsMore'] : 0,
    ...(typeof raw['undoes'] === 'number' ? { undoes: raw['undoes'] } : {}),
    ...(typeof raw['restored'] === 'string' ? { restored: raw['restored'] } : {}),
  }
}

/** The plan's log, oldest first; none when there is no log. A line Grid can't read is skipped. */
export function readHistory(project: Project, planFile: string): HistoryEntry[] {
  let text: string | null
  try {
    text = project.readText(historyFileOf(planFile), HISTORY_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof PathRefused) throw error
    text = null
  }
  if (text === null) return []
  const out: HistoryEntry[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const entry = entryOf(JSON.parse(line))
      if (entry !== null) out.push(entry)
    } catch {
      // A line cut short by a stop in the middle of writing it: the others still read.
    }
  }
  return out
}

/** The plan's text at a revision, from its checkpoint; null when none is kept. */
export function checkpointText(project: Project, planFile: string, revision: string): string | null {
  if (!REVISION.test(revision)) return null
  try {
    const text = project.readTextIfThere(checkpointFileOf(planFile, revision))
    return text !== null && revisionOfText(text) === revision ? text : null
  } catch {
    return null
  }
}

function bounded(all: readonly string[], max: number): { kept: string[]; more: number } {
  return { kept: all.slice(0, max), more: Math.max(0, all.length - max) }
}

/** What changed between two texts of the plan, as the log keeps it. */
function changeLines(project: Project, planFile: string, before: string | null, after: PlanAtRevision): Pick<HistoryEntry, 'verdict' | 'lines' | 'more' | 'fields' | 'fieldsMore'> {
  if (before === null) return { verdict: null, lines: [], more: 0, fields: [], fieldsMore: 0 }
  const fields = fieldChangesOfTexts(before, after.text)
  const keptFields = bounded(fields.changes.map((c) => c.text), ENTRY_FIELDS_MAX)
  let verdict: string | null = null
  let lines: { kept: string[]; more: number } = { kept: [], more: 0 }
  if (before.length <= COMPARED_BYTES_MAX && after.text.length <= COMPARED_BYTES_MAX) {
    try {
      const earlier = loadPlanText(project, planFile, before, after.real, { whole: true })
      const later = loadPlanText(project, planFile, after.text, after.real, { whole: true })
      const comparison = compareBuildings(earlier.plan, later.plan)
      verdict = comparison.verdict
      lines = bounded(comparison.changes.map((c) => c.text), ENTRY_LINES_MAX)
    } catch {
      // A plan Grid can't read on one side is logged by its fields only.
    }
  }
  return { verdict, lines: lines.kept, more: lines.more, fields: keptFields.kept, fieldsMore: keptFields.more + (fields.total - fields.changes.length) }
}

/** Removes the checkpoints past `CHECKPOINTS_MAX`, the oldest by the log first. */
function rollCheckpoints(project: Project, planFile: string, entries: readonly HistoryEntry[]): void {
  const kept = new Set<string>()
  for (const entry of [...entries].reverse()) {
    if (entry.before === null) continue
    if (kept.has(entry.before)) continue
    if (kept.size < CHECKPOINTS_MAX) {
      kept.add(entry.before)
      continue
    }
    try {
      if (project.exists(checkpointFileOf(planFile, entry.before))) project.removeFile(checkpointFileOf(planFile, entry.before))
    } catch {
      // Left for the next change to remove.
    }
  }
}

/**
 * Records a change to the plan file: when its text now differs from `before`, the text it had is
 * kept as a checkpoint and one entry is added to the log. Nothing is written when the file did not
 * change (a change written to another file). Never throws for the log: a change already written is
 * not refused afterwards; the entry is returned, or null.
 */
export function recordChange(project: Project, planFile: string, before: PlanAtRevision | null, made: ChangeMade, at: string = new Date().toISOString()): HistoryEntry | null {
  try {
    const after = readRevision(project, planFile)
    if (after === null || (before !== null && after.revision === before.revision)) return null
    const entries = readHistory(project, planFile)
    if (before !== null && checkpointText(project, planFile, before.revision) === null) project.writeFile(checkpointFileOf(planFile, before.revision), before.text)
    const by = typeof made.by === 'string' && made.by.trim() !== '' ? made.by.trim().slice(0, BY_MAX) : null
    const entry: HistoryEntry = {
      seq: (entries[entries.length - 1]?.seq ?? 0) + 1,
      at,
      by,
      via: made.via,
      tool: made.tool,
      before: before?.revision ?? null,
      after: after.revision,
      ...changeLines(project, planFile, before?.text ?? null, after),
      ...(made.undoes === undefined ? {} : { undoes: made.undoes }),
      ...(made.restored === undefined ? {} : { restored: made.restored }),
    }
    project.appendText(historyFileOf(planFile), `${JSON.stringify(entry)}\n`)
    rollCheckpoints(project, planFile, [...entries, entry])
    return entry
  } catch {
    return null
  }
}

/** Runs a change and records it: for `grid edit` and `grid write`, which run without the server. */
export async function recorded<T>(project: Project, planFile: string, made: ChangeMade, run: () => T | Promise<T>): Promise<T> {
  let before: PlanAtRevision | null = null
  try {
    before = readRevision(project, planFile)
  } catch {
    before = null
  }
  const answer = await run()
  recordChange(project, planFile, before, made)
  return answer
}
