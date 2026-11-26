/**
 * CMD-44: an earlier version of the plan by the name an agent gives it, for `grid_diff`'s `since`
 * and `to` and for `grid_restore`. One reading of a name, so the tools agree on what it means:
 *
 * - a marker's name, when the plan has a marker of that name (`markers.ts`);
 * - `git`, `git~N` or a commit by 7 to 40 of its hex digits (`git.ts`);
 * - `last`: the plan before the last change in its log (`history.ts`);
 * - a revision, 12 hex digits as answers give it in `planRevision`: the plan now, a checkpoint,
 *   or a marker's text;
 * - a date, `2026-11-26`, or a date and time, `2026-11-26T10:00` (UTC unless a zone is given):
 *   the plan as it stood then, by its log; a date alone is its start.
 *
 * `phase` is no version of the file and is read by `diff.ts` itself.
 */
import { historySay } from './words'
import type { Project } from '../fs/projectFiles'
import { readRevision, REVISION_DIGITS, revisionOfText } from '../edit/revision'
import { COMMIT_DIGITS, committedVersion, GIT_BACK } from './git'
import { checkpointText, readHistory, type HistoryEntry } from './history'
import { GIT_VERSION, MarkerRefused, readMarkers } from './markers'

/** The name of the plan before the last change in its log. */
export const LAST_VERSION = 'last'

/** A version named that Grid can't find. One line, naming what there is. */
export class VersionRefused extends MarkerRefused {}

export type NamedVersion =
  | { readonly kind: 'marker'; readonly name: string; readonly at: string; readonly by: string | null; readonly note: string | null; readonly text: string }
  | { readonly kind: 'git'; readonly ref: string; readonly commit: string; readonly branch: string | null; readonly text: string }
  /** A checkpoint, or a marker's text, by its revision; `asked` is the name it was asked by. */
  | { readonly kind: 'revision'; readonly revision: string; readonly asked: string; readonly at: string | null; readonly text: string }
  | { readonly kind: 'now'; readonly revision: string; readonly text: string }

const REVISION = new RegExp(`^[0-9a-f]{${REVISION_DIGITS}}$`)
const DATE = /^(\d{4}-\d\d-\d\d)(?:[T ](\d\d:\d\d(?::\d\d(?:\.\d+)?)?)(Z|[+-]\d\d:?\d\d)?)?$/

/** A date and time as a moment: UTC unless the text gives a zone. NaN when it is not one. */
export function momentOf(text: string): number {
  const m = DATE.exec(text)
  if (m === null) return NaN
  return Date.parse(`${m[1]}T${m[2] ?? '00:00'}${m[3] ?? 'Z'}`)
}

/** Whether a name is read as a date. */
export function isDateName(text: string): boolean {
  return DATE.test(text)
}

/** When a revision stopped being the plan: the last change that replaced it. */
function replacedAt(entries: readonly HistoryEntry[], revision: string): string | null {
  for (const entry of [...entries].reverse()) if (entry.before === revision) return entry.at
  return null
}

/** The plan's text at a revision: now, a checkpoint or a marker's; null when none holds it. */
export function textAtRevision(project: Project, planFile: string, revision: string): string | null {
  const now = readRevision(project, planFile)
  if (now !== null && now.revision === revision) return now.text
  const kept = checkpointText(project, planFile, revision)
  if (kept !== null) return kept
  try {
    for (const marker of readMarkers(project, planFile)) if (revisionOfText(marker.text) === revision) return marker.text
  } catch {
    // A markers file Grid can't read holds no version here.
  }
  return null
}

function atRevision(project: Project, planFile: string, revision: string, asked: string, entries: readonly HistoryEntry[]): NamedVersion {
  const now = readRevision(project, planFile)
  if (now !== null && now.revision === revision) return { kind: 'now', revision, text: now.text }
  const text = textAtRevision(project, planFile, revision)
  if (text === null) {
    const logged = entries.some((e) => e.before === revision || e.after === revision)
    throw new VersionRefused(historySay(logged ? 'tool.history.rolledOff' : 'tool.history.noRevision', { revision }))
  }
  return { kind: 'revision', revision, asked, at: replacedAt(entries, revision), text }
}

/** The revision the plan had at a moment, by its log. */
function revisionAt(entries: readonly HistoryEntry[], moment: number, asked: string): string {
  if (entries.length === 0) throw new VersionRefused(historySay('tool.history.noLog'))
  let revision: string | null = null
  for (const entry of entries) {
    if (Date.parse(entry.at) <= moment) {
      revision = entry.after
      continue
    }
    if (revision === null) revision = entry.before
    break
  }
  if (revision === null) throw new VersionRefused(historySay('tool.history.noPlanThen', { date: asked, first: entries[0]!.at }))
  return revision
}

/** The version a name gives. Throws `VersionRefused` (or `GitUnread`) when there is none. */
export function namedVersion(project: Project, planFile: string, name: string): NamedVersion {
  const markers = readMarkers(project, planFile)
  const marker = markers.find((m) => m.name === name)
  if (marker !== undefined) return { kind: 'marker', name: marker.name, at: marker.at, by: marker.by ?? null, note: marker.note ?? null, text: marker.text }
  if (name === GIT_VERSION || GIT_BACK.test(name)) {
    const committed = committedVersion(project, planFile, name)
    return { kind: 'git', ref: name, commit: committed.commit, branch: committed.branch, text: committed.text }
  }
  const entries = readHistory(project, planFile)
  if (name === LAST_VERSION) {
    const last = entries[entries.length - 1]
    if (last === undefined) throw new VersionRefused(historySay('tool.history.noLog'))
    if (last.before === null) throw new VersionRefused(historySay('tool.history.lastWrote', { tool: last.tool }))
    return atRevision(project, planFile, last.before, name, entries)
  }
  if (REVISION.test(name) && (textAtRevision(project, planFile, name) !== null || entries.some((e) => e.before === name || e.after === name))) {
    return atRevision(project, planFile, name, name, entries)
  }
  if (COMMIT_DIGITS.test(name)) {
    const committed = committedVersion(project, planFile, name)
    return { kind: 'git', ref: name, commit: committed.commit, branch: committed.branch, text: committed.text }
  }
  if (isDateName(name)) {
    const moment = momentOf(name)
    if (Number.isNaN(moment)) throw new VersionRefused(historySay('tool.history.badDate', { date: name }))
    return atRevision(project, planFile, revisionAt(entries, moment, name), name, entries)
  }
  const there = markers.length === 0 ? historySay('tool.history.noMarkers') : historySay('tool.history.markers', { names: markers.map((m) => m.name).join(', ') })
  throw new VersionRefused(historySay('tool.history.unknown', { name: JSON.stringify(name), there }))
}
