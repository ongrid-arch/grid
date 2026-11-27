/**
 * WRT-8: the plan compared with an earlier version of itself, by what stands where. Shared by
 * `grid diff` and the tool `grid_diff`, so both say the same.
 *
 * The earlier version is a start marker (`markers.ts`) or the last committed version in the
 * project's own git folder (`git.ts`). Named nothing, it is the marker `start` when the plan has
 * one, else the last commit. The comparison is the core's (`compareBuildings`), with the notes
 * of the drawing check on each version (`inspectPlan`), so the notes that came and went are
 * among the issues. MSG-25: between two versions, a part whose phase changed is a change. Nothing
 * here measures or pairs anything itself.
 */
import { historySay } from './words'
import path from 'path'
import { compareBuildings, floorOf, planHasPhases, planInState, wallFloorIds, type BuildingComparison, type FloorPlan } from '@ongrid/floorplan/geometry'
import { english } from '@ongrid/floorplan/messages'
import { inspectPlan } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { loadPlan, loadPlanText, type LoadedPlan } from '../command/plan'
import { roomsAsTheyStood } from '../edit/phases'
import { seenBefore, seenMadeNew, seenNewData, seenNewLines } from '../edit/seen'
import type { MadeNew } from '../seen/marks'
import { GitUnread, lastCommitted } from './git'
import { DEFAULT_MARKER, findMarker, GIT_VERSION, MarkerRefused, PHASE_VERSION, readMarkers } from './markers'
import { fieldChanges, fieldChangesOfTexts, type FieldChange } from './fields'
import { readHistory, type HistoryEntry } from './history'
import { isDateName, LAST_VERSION, momentOf, namedVersion, type NamedVersion } from './named'

export const DIFF_SHOWS = ['all', 'summary', 'changes', 'issues', 'facts', 'history'] as const
export type DiffShow = (typeof DIFF_SHOWS)[number]

/** The most change lines the text lists; the data holds them all. */
export const DIFF_LINES_SHOWN = 40

/** CMD-44: the most field lines `show: all` lists of facts and numbers, and `show: facts` of every field. */
export const FACT_LINES_SHOWN = 20
export const FIELD_LINES_SHOWN = 80

/** What the plan was compared with. */
export type EarlierVersion =
  | { readonly kind: 'marker'; readonly name: string; readonly at: string; readonly by?: string | null; readonly note?: string | null }
  | { readonly kind: 'git'; readonly commit: string; readonly branch: string | null; readonly ref?: string }
  /** CNT-10: the plan's own state before its work, compared with it after the work. */
  | { readonly kind: 'phase' }
  /** CMD-44: a checkpoint or a marker's text by its revision, asked by revision, date or `last`. */
  | { readonly kind: 'revision'; readonly revision: string; readonly asked: string; readonly at: string | null }
  /** CMD-44: the plan file as it is now. */
  | { readonly kind: 'now'; readonly revision: string }

export interface PlanDiffRun {
  readonly comparison: BuildingComparison
  readonly earlier: LoadedPlan
  readonly later: LoadedPlan
  readonly since: EarlierVersion
  /** CMD-44: the later version, when it is not the plan now. */
  readonly to: EarlierVersion | null
  /** MSG-29: the notes seen on the earlier version that are new again now; none for the phases. */
  readonly seenNew: readonly MadeNew[]
  /** CMD-44: every field that changed, facts and numbers included, and how many there were. */
  readonly fields: readonly FieldChange[]
  readonly fieldsTotal: number
  /** CMD-44: the change log's entries between the two versions, oldest first. */
  readonly history: readonly HistoryEntry[]
}

function versionOf(named: NamedVersion): EarlierVersion {
  switch (named.kind) {
    case 'marker': return { kind: 'marker', name: named.name, at: named.at, by: named.by, note: named.note }
    case 'git': return { kind: 'git', commit: named.commit, branch: named.branch, ref: named.ref }
    case 'revision': return { kind: 'revision', revision: named.revision, asked: named.asked, at: named.at }
    case 'now': return { kind: 'now', revision: named.revision }
  }
}

/** The text and the version of `since` when no name is given: the marker start, else the last commit. */
function defaultVersion(project: Project, planFile: string): { text: string; version: EarlierVersion } {
  if (readMarkers(project, planFile).some((m) => m.name === DEFAULT_MARKER)) {
    const marker = findMarker(project, planFile, DEFAULT_MARKER)
    return { text: marker.text, version: { kind: 'marker', name: marker.name, at: marker.at, by: marker.by ?? null, note: marker.note ?? null } }
  }
  try {
    const committed = lastCommitted(project, planFile)
    return { text: committed.text, version: { kind: 'git', commit: committed.commit, branch: committed.branch } }
  } catch (error) {
    if (error instanceof GitUnread) {
      // CMD-44: the change log keeps the plan before every change, so it is there to compare with.
      if (readHistory(project, planFile).some((e) => e.before !== null)) throw new MarkerRefused(historySay('tool.history.noStart', { why: error.message.replace(/\.$/, '') }))
      throw new MarkerRefused(`There is nothing to compare the plan with: it has no start marker, and the last committed version can't be read (${error.message.replace(/\.$/, '')}). Set a marker with grid mark start (the tool grid_mark_start) before the edit.`)
    }
    throw error
  }
}

function versionName(version: EarlierVersion, planFile: string): string {
  const base = path.basename(planFile)
  switch (version.kind) {
    case 'marker': return historySay('tool.history.named.marker', { file: base, name: version.name })
    case 'git': return historySay('tool.history.named.git', { file: base, commit: version.commit.slice(0, 7) })
    case 'revision': return historySay('tool.history.named.revision', { file: base, revision: version.revision })
    case 'now': return base
    case 'phase': return base
  }
}

/** When a version was the plan, for the log's entries since it: null for one the log can't place. */
function versionTime(version: EarlierVersion, entries: readonly HistoryEntry[]): number | null {
  if (version.kind === 'marker') return Date.parse(version.at)
  if (version.kind === 'revision') {
    const moment = isDateName(version.asked) ? momentOf(version.asked) : NaN
    if (!Number.isNaN(moment)) return moment
    if (version.at !== null) return Date.parse(version.at)
    return null
  }
  if (version.kind === 'now') return entries.length === 0 ? null : Date.parse(entries[entries.length - 1]!.at) + 1
  return null
}

/** The plan file against the version `since` names: a marker, `git`, or the default; CMD-44: up to `to`. */
export function diffSince(project: Project, planFile: string, since: string | undefined, rooms?: readonly string[], to?: string): PlanDiffRun {
  let later: LoadedPlan
  let toVersion: EarlierVersion | null = null
  if (to === undefined) later = loadPlan(project, planFile)
  else {
    if (to === PHASE_VERSION) throw new MarkerRefused(historySay('tool.history.toPhase'))
    const named = namedVersion(project, planFile, to)
    toVersion = versionOf(named)
    const shown = versionName(toVersion, planFile)
    later = named.kind === 'now' ? loadPlan(project, planFile) : loadPlanText(project, shown, named.text, shown)
  }
  if (since === PHASE_VERSION) {
    if (toVersion !== null) throw new MarkerRefused(historySay('tool.history.toPhase'))
    return diffByPhase(later, rooms)
  }
  let text: string
  let version: EarlierVersion
  if (since === undefined) ({ text, version } = defaultVersion(project, planFile))
  else {
    const named = namedVersion(project, planFile, since)
    text = named.text
    version = versionOf(named)
  }
  const named = versionName(version, planFile)
  const earlier = loadPlanText(project, named, text, named)
  // VEW-15: each version's file text, as `grid check` reads it, so the fields the reading adds are no notes.
  const notes = { before: inspectPlan(earlier.text ?? earlier.plan).lines, after: inspectPlan(later.text ?? later.plan).lines }
  const comparison = compareBuildings(earlier.plan, later.plan, { ...(rooms === undefined ? {} : { rooms }), notes })
  // MSG-29: the marks beside the plan, held on the earlier version and not on the plan now.
  const seenNew = seenMadeNew(seenBefore(project, planFile, earlier), project, planFile, later)
  const fields = earlier.text !== undefined && later.text !== undefined ? fieldChangesOfTexts(earlier.text, later.text) : fieldChanges(earlier.plan, later.plan)
  const entries = readHistory(project, planFile)
  const from = versionTime(version, entries)
  const until = toVersion === null ? null : versionTime(toVersion, entries)
  const history = from === null && version.kind !== 'git' ? [] : entries.filter((e) => (from === null || Date.parse(e.at) >= from) && (until === null || Date.parse(e.at) < until))
  return { comparison, earlier, later, since: version, to: toVersion, seenNew, fields: fields.changes, fieldsTotal: fields.total, history }
}

/**
 * CNT-10: a plan with phases compared with itself, before its work against after it, by the same
 * comparison as two versions: what is to be demolished is what was removed, what is new is what
 * was added, and a widened door is a door that changed. The checks' notes are not compared: each
 * state is checked as the plan's own (`grid check`).
 */
function diffByPhase(loaded: LoadedPlan, rooms?: readonly string[]): PlanDiffRun {
  if (!planHasPhases(loaded.plan)) {
    throw new MarkerRefused('The plan states no phase, so it holds no work to compare: mark it with grid_start_works before the work\'s edits, or its parts with grid_set_phase (existing, demolished or new), or compare with a marker or git.')
  }
  const after = planInState(loaded.plan, 'after')
  // WRT-15: a room an edit reshaped, kept as it stood, is read as the room it became.
  const before = roomsAsTheyStood(planInState(loaded.plan, 'before'), after)
  // MSG-25: a pair here is one part before and after its work (a widened door, a room kept as it
  // stood), so its phase is the work, not a change of phase. CMD-31: its issues are judged by what
  // the work does: a door whose room it replaced is no issue, a window it leaves between rooms is.
  const comparison = compareBuildings(before, after, { ...(rooms === undefined ? {} : { rooms }), phases: false, work: true })
  const fields = fieldChanges(before, after)
  return { comparison, earlier: { ...loaded, plan: before }, later: { ...loaded, plan: after }, since: { kind: 'phase' }, to: null, seenNew: [], fields: fields.changes, fieldsTotal: fields.total, history: [] }
}

/** A time as the answers write it: `2026-11-26 10:00 UTC`. */
export function timeWords(at: string): string {
  return at.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC')
}

export function sinceWords(since: EarlierVersion): string {
  if (since.kind === 'phase') return 'the plan as it stands before its work: what is removed is to be demolished, what is added is new'
  if (since.kind === 'marker') {
    const by = since.by === undefined || since.by === null ? '' : historySay('tool.history.words.by', { by: { name: since.by } })
    const note = since.note === undefined || since.note === null ? '' : historySay('tool.history.words.note', { note: { name: since.note } })
    return `the plan at marker ${JSON.stringify(since.name)}, set ${timeWords(since.at)}${by}${note}`
  }
  if (since.kind === 'revision') {
    const asked = isDateName(since.asked) ? historySay('tool.history.words.date', { date: since.asked }) : since.asked === LAST_VERSION ? historySay('tool.history.words.last') : ''
    return historySay(since.at === null ? 'tool.history.words.revision' : 'tool.history.words.replaced', { revision: since.revision, at: since.at === null ? '' : timeWords(since.at), asked })
  }
  if (since.kind === 'now') return historySay('tool.history.words.now', { revision: since.revision })
  if (since.ref !== undefined && since.ref !== GIT_VERSION) return historySay('tool.history.words.commit', { commit: since.commit.slice(0, 7), ref: since.ref })
  return `the plan as last committed${since.branch === null ? '' : ` on ${since.branch.replace(/^refs\/heads\//, '')}`} (${since.commit.slice(0, 7)})`
}

/**
 * CMD-32: the comparison's lines narrowed to one floor: the change lines, the rooms and the
 * openings that moved with their wall or stayed. A line is on the floor when any part it is about
 * stands on it, in the later plan or in the earlier one laid on it (where the removed parts are),
 * so a room moved between floors is on both; a line about no floor (the site) is left out. The
 * issues, the verdict and the scope check stay whole: an issue elsewhere is still one.
 */
export interface FloorLines {
  /** The floor asked for; null for the whole building. */
  readonly floor: string | null
  readonly changes: BuildingComparison['changes']
  readonly rooms: BuildingComparison['rooms']
  readonly stayed: BuildingComparison['stayed']
  readonly movedWith: BuildingComparison['movedWith']
  /** The change lines left out. */
  readonly otherFloors: number
}

export function diffOnFloor(run: PlanDiffRun, floor: string | undefined): FloorLines {
  const c = run.comparison
  if (floor === undefined) return { floor: null, changes: c.changes, rooms: c.rooms, stayed: c.stayed, movedWith: c.movedWith, otherFloors: 0 }
  const on = new Set<string>()
  const add = (plan: FloorPlan): void => {
    on.add(`floor:${floor}`)
    const walls = new Map(plan.walls.map((wall) => [wall.id, wallFloorIds(plan, wall)]))
    for (const [id, floors] of walls) if (floors.includes(floor)) on.add(`wall:${id}`)
    for (const opening of plan.openings) if (walls.get(opening.wall)?.includes(floor)) on.add(`opening:${opening.id}`)
    for (const room of plan.rooms) if (floorOf(room) === floor) on.add(`room:${room.id}`)
  }
  add(run.later.plan)
  add(c.aligned)
  const changes = c.changes.filter((line) => line.entities.some((e) => on.has(`${e.type}:${e.id}`)))
  return {
    floor,
    changes,
    rooms: c.rooms.filter((r) => on.has(`room:${r.room}`)),
    stayed: c.stayed.filter((s) => on.has(`opening:${s.opening}`)),
    movedWith: c.movedWith.filter((m) => on.has(`opening:${m.opening}`)),
    otherFloors: c.changes.length - changes.length,
  }
}

/** The answer in words: issues first, then the verdict and the rooms, then the changes. */
export function diffText(run: PlanDiffRun, show: DiffShow, floor?: string): string {
  const c = { ...run.comparison, ...diffOnFloor(run, floor) }
  const lines: string[] = [`Compared with ${sinceWords(run.since)}.`]
  // CMD-44: the later version, when it is not the plan now.
  if (run.to !== null) lines.push(historySay('tool.history.toLine', { to: sinceWords(run.to) }))
  const facts = run.fields.filter((f) => isFactPath(f.path))
  // Other fields are counted only where nothing that stands changed and the plan is not mirrored or turned (whose every point moves).
  const others = c.changes.length === 0 && c.otherFloors === 0 && c.turn === null ? run.fields.filter((f) => !isFactPath(f.path)) : []
  const fieldList = (heading: string, list: readonly FieldChange[], total: number, max: number): void => {
    if (list.length === 0) return
    lines.push(heading)
    for (const field of list.slice(0, max)) lines.push(`  ${field.text}`)
    if (total > max) lines.push(`  ${historySay('tool.history.fieldsMore', { count: total - Math.min(max, list.length) })}`)
  }
  // WRT-4: a plan mirrored or turned is said so first (lab Y-5).
  if (c.turnLine !== null) lines.push(c.turnLine)
  const issues = (): void => {
    if (c.issues.length === 0) {
      lines.push('Issues: none.')
      return
    }
    lines.push(`Issues (${c.issues.length}):`)
    c.issues.forEach((issue, i) => lines.push(`  ${i + 1}. ${issue.message}`))
  }
  // MSG-29: after the issues, the seen notes that came back.
  const seen = (): void => {
    lines.push(...seenNewLines(run.seenNew))
  }
  const summary = (): void => {
    lines.push(`Verdict: ${c.verdict}`)
    const shown = c.rooms.filter((r) => r.status !== 'unchanged')
    if (shown.length > 0) {
      lines.push('Rooms:')
      for (const room of shown) lines.push(`  ${room.text}`)
    }
    if (c.scope.checked) {
      lines.push(c.scope.outside.length === 0 ? 'Scope: nothing changed outside the rooms named.' : `Scope: ${c.scope.outside.length} outside the rooms named:`)
      for (const line of c.scope.outside) lines.push(`  ${line.text}`)
    }
  }
  const changes = (): void => {
    const where = c.floor === null ? '' : ` on floor ${JSON.stringify(c.floor)}`
    const leftOut = `${c.otherFloors} on other floors or about none, left out`
    if (c.changes.length === 0 && facts.length + others.length > 0 && c.otherFloors === 0) lines.push(historySay('tool.history.noneStands', { where, count: facts.length + others.length, facts: facts.length }))
    else if (c.changes.length === 0) lines.push(`Changes${where}: none${c.otherFloors === 0 ? '' : `; ${leftOut}`}.`)
    else {
      lines.push(`Changes${where} (${c.floor === null ? c.changes.length : `${c.changes.length} of ${c.changes.length + c.otherFloors}; ${leftOut}`}):`)
      c.changes.slice(0, DIFF_LINES_SHOWN).forEach((line, i) => lines.push(`  ${i + 1}. ${line.text}`))
      if (c.changes.length > DIFF_LINES_SHOWN) lines.push(`  … ${c.changes.length - DIFF_LINES_SHOWN} more, in the data.`)
    }
    // WRT-12: what moved with its wall or room before what stayed, so neither is taken for the other.
    if (c.movedWith.length > 0) {
      lines.push(`Openings that moved with their wall or room (${c.movedWith.length}):`)
      for (const line of c.movedWith.slice(0, DIFF_LINES_SHOWN)) lines.push(`  ${line.text}`)
    }
    if (c.stayed.length > 0) {
      lines.push(`Openings that stayed where they were (${c.stayed.length}):`)
      for (const line of c.stayed.slice(0, DIFF_LINES_SHOWN)) lines.push(`  ${line.text}`)
    }
    // CMD-44: facts and numbers change nothing that stands, so they are listed on their own.
    fieldList(historySay('tool.history.factsHeading', { count: facts.length }), facts, facts.length, FACT_LINES_SHOWN)
    if (others.length > 0) lines.push(historySay('tool.history.othersHeading', { count: others.length }))
  }
  const history = (): void => {
    if (run.history.length === 0) {
      lines.push(historySay('tool.history.noEntries'))
      return
    }
    lines.push(historySay('tool.history.entriesHeading', { count: run.history.length }))
    for (const entry of run.history.slice(-DIFF_LINES_SHOWN)) lines.push(`  ${entryWords(entry)}`)
  }
  if (show === 'facts') {
    if (run.fields.length === 0) lines.push(historySay('tool.history.noFields'))
    else fieldList(historySay('tool.history.fieldsHeading', { count: run.fieldsTotal }), run.fields, run.fieldsTotal, FIELD_LINES_SHOWN)
  } else if (show === 'history') {
    history()
  } else if (show === 'issues') {
    issues()
    seen()
  } else {
    issues()
    seen()
    summary()
    if (show !== 'summary') changes()
  }
  return lines.join('\n')
}

/** CMD-44: a field that is a fact of the person's own or a stated number. */
export function isFactPath(path: string): boolean {
  return /\.properties(\.|\[|$)|\.number$/.test(path)
}

/** One entry of the change log in words: its number, when, who, with what and what it did. */
export function entryWords(entry: HistoryEntry): string {
  const by = entry.by === null ? '' : historySay('tool.history.words.by', { by: { name: entry.by } })
  const what = entry.undoes !== undefined
    ? historySay('tool.history.entry.undid', { seq: entry.undoes })
    : entry.restored !== undefined
      ? historySay('tool.history.entry.restored', { name: { name: entry.restored } })
      : entry.lines.length + entry.fields.length === 0 ? (entry.verdict ?? '') : [...entry.lines.slice(0, 3), ...entry.fields.filter(isFactPath).slice(0, 3)].join('; ')
  const more = entry.more + Math.max(0, entry.lines.length - 3)
  return historySay('tool.history.entry', { seq: entry.seq, at: timeWords(entry.at), tool: entry.tool, by, before: entry.before ?? '—', after: entry.after, what: more > 0 ? `${what} ${historySay('tool.history.entry.more', { count: more })}` : what })
}

/** CMD-44: a version as data. */
function versionData(version: EarlierVersion): Record<string, unknown> {
  switch (version.kind) {
    case 'marker': return { kind: 'marker', name: version.name, at: version.at, commit: null, revision: null, by: version.by ?? null, note: version.note ?? null }
    case 'phase': return { kind: 'phase', name: null, at: null, commit: null, revision: null, by: null, note: null }
    case 'git': return { kind: 'git', name: version.ref ?? null, at: null, commit: version.commit, revision: null, by: null, note: null }
    case 'revision': return { kind: 'revision', name: version.asked, at: version.at, commit: null, revision: version.revision, by: null, note: null }
    case 'now': return { kind: 'now', name: null, at: null, commit: null, revision: version.revision, by: null, note: null }
  }
}

/** The answer as data: everything but the plans themselves. */
export function diffData(run: PlanDiffRun, show: DiffShow, floor?: string): Record<string, unknown> {
  const c = { ...run.comparison, ...diffOnFloor(run, floor) }
  const fieldsShown = show === 'facts' ? run.fields : show === 'all' || show === 'changes' ? run.fields.filter((f) => isFactPath(f.path)) : []
  return {
    since: versionData(run.since),
    to: run.to === null ? null : versionData(run.to),
    // CMD-44: the fields that changed (every one for show facts, facts and numbers otherwise) and the log's entries between.
    fields: fieldsShown.map((f) => ({ path: f.path, kind: f.kind, before: f.before, after: f.after, text: f.text })),
    fieldsTotal: run.fieldsTotal,
    history: show === 'history' ? run.history.map((e) => ({ ...e, text: entryWords(e) })) : [],
    verdict: c.verdict,
    sameBuilding: c.sameBuilding,
    turn: c.turn === null ? null : { id: c.turn.id, mirrored: c.turn.mirrored, degrees: c.turn.degrees, text: c.turnLine },
    roomsFirst: c.roomsFirst,
    shift: [...c.shift],
    renamed: { count: c.renamed.count, walls: c.renamed.walls, openings: c.renamed.openings, rooms: c.renamed.rooms },
    // WRT-25: the floors that moved up or down or changed their figures, old and new.
    floors: c.floors.map((f) => ({ floor: f.floor, name: f.name, renamedFrom: f.renamedFrom, level: f.level, elevation: f.elevation, height: f.height, slab: f.slab, stands: f.stands })),
    // MSG-27: the massing and the site, line by line, and the figures side by side.
    massing: { lines: c.massing.lines.map((l) => english(l.said)), figures: c.massing.figures, sideBySide: c.massing.sideBySide === null ? null : english(c.massing.sideBySide) },
    issues: c.issues.map((i) => ({ code: i.code, message: i.message, entities: i.entities })),
    rooms: show === 'issues' ? [] : c.rooms.map((r) => ({ room: r.room, name: r.name, status: r.status, before: r.before, after: r.after, moved: r.moved, by: r.by === null ? null : [...r.by], idBefore: r.idBefore, mergedWith: [...r.mergedWith], wallsTakenOut: [...r.wallsTakenOut], mergedInto: r.mergedInto, walls: [...r.walls], text: r.text })),
    changes: show === 'issues' || show === 'summary' ? [] : c.changes.map((l) => ({ text: l.text, entities: l.entities, rooms: l.rooms })),
    stayed: show === 'issues' || show === 'summary' ? [] : c.stayed.map((s) => ({ opening: s.opening, text: s.text })),
    movedWith: show === 'issues' || show === 'summary' ? [] : c.movedWith.map((m) => ({ opening: m.opening, with: m.with, by: [...m.by], text: m.text })),
    // WRT-86: the types added, removed or changed with the parts that take them, the rooms' finishes and the curves, before and after.
    types: show === 'issues' || show === 'summary' ? [] : c.types.map((t) => ({ list: t.list, type: t.type, name: t.name, status: t.status, fields: t.fields, parts: t.parts, text: english(t.said) })),
    finishes: show === 'issues' ? [] : c.finishes.map((f) => ({ room: f.room, name: f.name, changes: f.changes.map((ch) => ({ surface: ch.surface, wall: ch.wall, before: ch.before, after: ch.after, text: english(ch.said) })) })),
    curves: show === 'issues' || show === 'summary' ? [] : c.curves.map((curve) => ({ wall: curve.wall, before: curve.before, after: curve.after, text: curve.text })),
    scope: { checked: c.scope.checked, rooms: [...c.scope.rooms], outside: c.scope.outside.map((l) => l.text) },
    // CMD-32: the floor the lists are narrowed to, and how many change lines that left out.
    floor: c.floor,
    otherFloors: c.otherFloors,
    seenNew: seenNewData(run.seenNew),
  }
}
