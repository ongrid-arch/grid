/**
 * WRT-8: the plan compared with an earlier version of itself, by what stands where. Shared by
 * `grid diff` and the tool `grid_diff`, so both say the same.
 *
 * The earlier version is a start marker (`markers.ts`) or the last committed version in the
 * project's own git folder (`git.ts`). Named nothing, it is the marker `start` when the plan has
 * one, else the last commit. The comparison is the core's (`compareBuildings`), with the notes
 * of the drawing check on each version (`inspectPlan`), so the notes that came and went are
 * among the issues. Nothing here measures or pairs anything itself.
 */
import path from 'path'
import { compareBuildings, planHasPhases, planInState, type BuildingComparison } from '@ongrid/floorplan/geometry'
import { inspectPlan } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { loadPlan, loadPlanText, type LoadedPlan } from '../command/plan'
import { roomsAsTheyStood } from '../edit/phases'
import { GitUnread, lastCommitted } from './git'
import { DEFAULT_MARKER, findMarker, GIT_VERSION, MarkerRefused, PHASE_VERSION, readMarkers } from './markers'

export const DIFF_SHOWS = ['all', 'summary', 'changes', 'issues'] as const
export type DiffShow = (typeof DIFF_SHOWS)[number]

/** The most change lines the text lists; the data holds them all. */
export const DIFF_LINES_SHOWN = 40

/** What the plan was compared with. */
export type EarlierVersion =
  | { readonly kind: 'marker'; readonly name: string; readonly at: string }
  | { readonly kind: 'git'; readonly commit: string; readonly branch: string | null }
  /** CNT-10: the plan's own state before its work, compared with it after the work. */
  | { readonly kind: 'phase' }

export interface PlanDiffRun {
  readonly comparison: BuildingComparison
  readonly earlier: LoadedPlan
  readonly later: LoadedPlan
  readonly since: EarlierVersion
}

/** The plan file against the version `since` names: a marker, `git`, or the default. */
export function diffSince(project: Project, planFile: string, since: string | undefined, rooms?: readonly string[]): PlanDiffRun {
  const later = loadPlan(project, planFile)
  if (since === PHASE_VERSION) return diffByPhase(later, rooms)
  let text: string
  let version: EarlierVersion
  if (since === GIT_VERSION || (since === undefined && !readMarkers(project, planFile).some((m) => m.name === DEFAULT_MARKER))) {
    try {
      const committed = lastCommitted(project, planFile)
      text = committed.text
      version = { kind: 'git', commit: committed.commit, branch: committed.branch }
    } catch (error) {
      if (since === undefined && error instanceof GitUnread) {
        throw new MarkerRefused(`There is nothing to compare the plan with: it has no start marker, and the last committed version can't be read (${error.message.replace(/\.$/, '')}). Set a marker with grid mark start (the tool grid_mark_start) before the edit.`)
      }
      throw error
    }
  } else {
    const marker = findMarker(project, planFile, since ?? DEFAULT_MARKER)
    text = marker.text
    version = { kind: 'marker', name: marker.name, at: marker.at }
  }
  const named = version.kind === 'marker' ? `${path.basename(planFile)} at marker ${version.name}` : `${path.basename(planFile)} as last committed`
  const earlier = loadPlanText(project, named, text, named)
  // VEW-15: each version's file text, as `grid check` reads it, so the fields the reading adds are no notes.
  const notes = { before: inspectPlan(earlier.text ?? earlier.plan).lines, after: inspectPlan(later.text ?? later.plan).lines }
  const comparison = compareBuildings(earlier.plan, later.plan, { ...(rooms === undefined ? {} : { rooms }), notes })
  return { comparison, earlier, later, since: version }
}

/**
 * CNT-10: a plan with phases compared with itself, before its work against after it, by the same
 * comparison as two versions: what is to be demolished is what was removed, what is new is what
 * was added, and a widened door is a door that changed. The checks' notes are not compared: each
 * state is checked as the plan's own (`grid check`).
 */
function diffByPhase(loaded: LoadedPlan, rooms?: readonly string[]): PlanDiffRun {
  if (!planHasPhases(loaded.plan)) {
    throw new MarkerRefused('The plan states no phase, so it holds no work to compare: give its walls, openings and rooms a phase (existing, demolished or new), or compare with a marker or git.')
  }
  const after = planInState(loaded.plan, 'after')
  // WRT-15: a room an edit reshaped, kept as it stood, is read as the room it became.
  const before = roomsAsTheyStood(planInState(loaded.plan, 'before'), after)
  const comparison = compareBuildings(before, after, rooms === undefined ? {} : { rooms })
  return { comparison, earlier: { ...loaded, plan: before }, later: { ...loaded, plan: after }, since: { kind: 'phase' } }
}

export function sinceWords(since: EarlierVersion): string {
  if (since.kind === 'phase') return 'the plan as it stands before its work: what is removed is to be demolished, what is added is new'
  if (since.kind === 'marker') return `the plan at marker ${JSON.stringify(since.name)}, set ${since.at.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC')}`
  return `the plan as last committed${since.branch === null ? '' : ` on ${since.branch.replace(/^refs\/heads\//, '')}`} (${since.commit.slice(0, 7)})`
}

/** The answer in words: issues first, then the verdict and the rooms, then the changes. */
export function diffText(run: PlanDiffRun, show: DiffShow): string {
  const c = run.comparison
  const lines: string[] = [`Compared with ${sinceWords(run.since)}.`]
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
    if (c.changes.length === 0) lines.push('Changes: none.')
    else {
      lines.push(`Changes (${c.changes.length}):`)
      c.changes.slice(0, DIFF_LINES_SHOWN).forEach((line, i) => lines.push(`  ${i + 1}. ${line.text}`))
      if (c.changes.length > DIFF_LINES_SHOWN) lines.push(`  … ${c.changes.length - DIFF_LINES_SHOWN} more, in the data.`)
    }
    if (c.stayed.length > 0) {
      lines.push(`Openings that kept their place (${c.stayed.length}):`)
      for (const line of c.stayed.slice(0, DIFF_LINES_SHOWN)) lines.push(`  ${line.text}`)
    }
  }
  if (show === 'issues') issues()
  else {
    issues()
    summary()
    if (show !== 'summary') changes()
  }
  return lines.join('\n')
}

/** The answer as data: everything but the plans themselves. */
export function diffData(run: PlanDiffRun, show: DiffShow): Record<string, unknown> {
  const c = run.comparison
  const since = run.since.kind === 'marker'
    ? { kind: 'marker', name: run.since.name, at: run.since.at, commit: null }
    : run.since.kind === 'phase' ? { kind: 'phase', name: null, at: null, commit: null } : { kind: 'git', name: null, at: null, commit: run.since.commit }
  return {
    since,
    verdict: c.verdict,
    sameBuilding: c.sameBuilding,
    turn: c.turn === null ? null : { id: c.turn.id, mirrored: c.turn.mirrored, degrees: c.turn.degrees, text: c.turnLine },
    roomsFirst: c.roomsFirst,
    shift: [...c.shift],
    renamed: { count: c.renamed.count, walls: c.renamed.walls, openings: c.renamed.openings, rooms: c.renamed.rooms },
    issues: c.issues.map((i) => ({ code: i.code, message: i.message, entities: i.entities })),
    rooms: show === 'issues' ? [] : c.rooms.map((r) => ({ room: r.room, name: r.name, status: r.status, before: r.before, after: r.after, moved: r.moved, text: r.text })),
    changes: show === 'issues' || show === 'summary' ? [] : c.changes.map((l) => ({ text: l.text, entities: l.entities, rooms: l.rooms })),
    stayed: show === 'issues' || show === 'summary' ? [] : c.stayed.map((s) => ({ opening: s.opening, text: s.text })),
    scope: { checked: c.scope.checked, rooms: [...c.scope.rooms], outside: c.scope.outside.map((l) => l.text) },
  }
}
