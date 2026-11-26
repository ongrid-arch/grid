/**
 * CMD-44: a plan put back as it was, by `grid_undo` and `grid_restore`.
 *
 * Both write the earlier text of the plan file back as it was, byte for byte, and record the
 * change in the log like any other (`history.ts`), so the plan they replace is a checkpoint too
 * and an undo can itself be restored past.
 *
 * - Undo puts back the plan before the last change in the log that is not undone yet. Walking the
 *   log from its end, an undo's entry names the entry it undid, which is passed over, so a second
 *   undo goes a change further back. It is refused when the plan is not at the revision the log
 *   last wrote: then it changed by hand or by another program, and putting back an earlier
 *   version would lose that.
 * - Restore puts back any version a name gives (`named.ts`). It is refused the same way unless
 *   `force` is given; then the plan it replaces is still kept as a checkpoint first.
 *
 * They run with the plan's lock held (the server's, `mcp/revisions.ts`, or their own).
 */
import { historySay } from './words'
import path from 'path'
import type { Project } from '../fs/projectFiles'
import { readRevision, withPlanLock, type PlanAtRevision } from '../edit/revision'
import { checkpointText, readHistory, recordChange, type HistoryEntry } from './history'
import { namedVersion, VersionRefused, type NamedVersion } from './named'

export const UNDO_TOOL_NAME = 'grid_undo'
export const RESTORE_TOOL_NAME = 'grid_restore'

/** The changes that record their own entry in the log, so the server leaves them out. */
export const RECORDS_ITSELF: ReadonlySet<string> = new Set([UNDO_TOOL_NAME, RESTORE_TOOL_NAME])

export interface PutBack {
  /** The plan file, relative to the project folder. */
  readonly written: string
  /** The revision replaced (null when there was no plan) and the revision now. */
  readonly from: string | null
  readonly to: string
  /** The log's entry for this change. */
  readonly entry: HistoryEntry | null
}

export interface Undone extends PutBack {
  readonly undid: HistoryEntry
  /** The changes left in the log that a further undo would take back. */
  readonly left: number
}

export interface Restored extends PutBack {
  readonly version: NamedVersion
  /** Whether the plan had changed outside the log, and was restored all the same. */
  readonly forced: boolean
}

/** Who asks. */
export interface Asker {
  readonly via: string
  readonly by?: string | null | undefined
}

/** The refusal when the plan is not where the log left it; null when it is. */
function changedElsewhere(entries: readonly HistoryEntry[], now: PlanAtRevision | null, planFile: string, forced: boolean): string | null {
  const last = entries[entries.length - 1]
  if (last === undefined) return null
  if (now !== null && now.revision === last.after) return null
  return historySay(forced ? 'tool.history.elsewhereRestore' : 'tool.history.elsewhere', {
    file: { name: path.basename(planFile) },
    logged: last.after,
    now: now === null ? historySay('tool.history.notThere') : now.revision,
    tool: last.tool,
  })
}

/** The entries a further undo would take back, newest first. */
function undoable(entries: readonly HistoryEntry[]): HistoryEntry[] {
  const undone = new Set<number>()
  const out: HistoryEntry[] = []
  for (const entry of [...entries].reverse()) {
    if (entry.undoes !== undefined) {
      undone.add(entry.undoes)
      continue
    }
    if (!undone.has(entry.seq)) out.push(entry)
  }
  return out
}

function write(project: Project, planFile: string, text: string): string {
  return project.relative(project.writeFile(planFile, text))
}

/** Puts the plan back as it was before the last change not undone yet. */
export function undoLast(project: Project, planFile: string, asker: Asker): Undone {
  return withPlanLock(project, planFile, () => {
    const entries = readHistory(project, planFile)
    if (entries.length === 0) throw new VersionRefused(historySay('tool.history.nothingToUndo'))
    const now = readRevision(project, planFile)
    const elsewhere = changedElsewhere(entries, now, planFile, false)
    if (elsewhere !== null) throw new VersionRefused(elsewhere)
    const [target, ...rest] = undoable(entries)
    if (target === undefined) throw new VersionRefused(historySay('tool.history.allUndone', { count: entries.length }))
    if (target.after !== now!.revision) throw new VersionRefused(historySay('tool.history.notAfter', { seq: target.seq, tool: target.tool, revision: target.after, now: now!.revision }))
    if (target.before === null) throw new VersionRefused(historySay('tool.history.undoWrote', { tool: target.tool, file: { name: path.basename(planFile) } }))
    const text = checkpointText(project, planFile, target.before)
    if (text === null) throw new VersionRefused(historySay('tool.history.rolledOff', { revision: target.before }))
    const written = write(project, planFile, text)
    const entry = recordChange(project, planFile, now, { tool: UNDO_TOOL_NAME, via: asker.via, by: asker.by, undoes: target.seq })
    return { written, from: now!.revision, to: target.before, entry, undid: target, left: rest.length }
  })
}

/** Puts the plan back as the version `name` gives. */
export function restoreTo(project: Project, planFile: string, name: string, asker: Asker & { readonly force?: boolean }): Restored {
  return withPlanLock(project, planFile, () => {
    const entries = readHistory(project, planFile)
    const now = readRevision(project, planFile)
    const elsewhere = changedElsewhere(entries, now, planFile, true)
    if (elsewhere !== null && asker.force !== true) throw new VersionRefused(elsewhere)
    const version = namedVersion(project, planFile, name)
    if (version.kind === 'now' || (now !== null && now.text === version.text)) throw new VersionRefused(historySay('tool.history.already', { name: JSON.stringify(name) }))
    const written = write(project, planFile, version.text)
    const entry = recordChange(project, planFile, now, { tool: RESTORE_TOOL_NAME, via: asker.via, by: asker.by, restored: name })
    const to = readRevision(project, planFile)?.revision ?? ''
    return { written, from: now?.revision ?? null, to, entry, version, forced: elsewhere !== null }
  })
}
