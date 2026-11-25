/**
 * BRF-1: the brief's lines in the answer of every change to the plan (the edit tools, `grid
 * edit`, `grid_write_rooms` and `grid write`), and the one reminder when a plan is first written
 * with no brief beside it. Neither ever refuses a change: a brief that can't be read is said in
 * one line, and the change is written as asked.
 */
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { say } from '@ongrid/floorplan/messages'
import type { Project } from '../fs/projectFiles'
import { FIGURES, readBrief } from './brief'
import { briefLines, briefText, type BriefLine } from './lines'

/** How many lines a change's answer lists, so it stays short; the brief tool lists them all. */
export const BRIEF_LINES_IN_AN_EDIT = 12

/** The brief's part of a change's data. */
export interface BriefData {
  /** The brief file in the project, or null when there is none. */
  readonly file: string | null
  /** Why the brief there can't be read; null when it can, or there is none. */
  readonly problem: string | null
  readonly lines: readonly BriefLine[]
}

/** The brief beside `planFile`, against `plan` as it now is: the lines for the text, and the data. */
export function briefAnswer(project: Project, planFile: string, plan: FloorPlan): { readonly text: readonly string[]; readonly data: BriefData } {
  const read = readBrief(project, planFile)
  if (read.problem !== null) {
    return { text: [`The brief beside the plan was not read, so no line is checked: ${read.problem}.`], data: { file: read.file, problem: read.problem, lines: [] } }
  }
  const lines = briefLines(plan, read.brief)
  const file = read.brief === null ? null : read.file
  return { text: briefText(lines, file, { max: BRIEF_LINES_IN_AN_EDIT }), data: { file, problem: null, lines } }
}

/**
 * ARE-49: whether the plan records what stands rather than what a person asked for: it keeps taped
 * lengths, every part is existing, or every mark says measured or scanned. A survey has no wishes.
 */
export function isSurvey(plan: FloorPlan): boolean {
  if ((plan.taped?.length ?? 0) > 0) return true
  const parts = [...plan.walls, ...plan.openings, ...plan.rooms]
  if (parts.length > 0 && parts.every((p) => p.phase === 'existing')) return true
  const marks = plan.marks ?? []
  return marks.length > 0 && marks.every((m) => m.source === 'measured' || m.source === 'scanned')
}

/**
 * The reminder, one line, when a plan is first written and no brief is kept beside it. Never a
 * refusal: the plan is written either way. Null when there is a brief, or one that can't be read,
 * and (ARE-49) when the plan is a survey.
 */
export function briefReminder(project: Project, planFile: string, plan: FloorPlan): string | null {
  if (isSurvey(plan)) return null
  const read = readBrief(project, planFile)
  if (read.brief !== null || read.problem !== null) return null
  return `No brief is kept beside this plan (${JSON.stringify(read.file)}): write what the person asked for with grid_write_brief, from their own words, and every change then says what is met and what missed.`
}

/**
 * ARE-27: for `grid check` and `grid_check`, the person's own figures in the brief beside the
 * plan that the drawing misses, under a heading that says whose they are. They are the person's,
 * never a code's, and the check's record keeps no code for them. Empty when there is no brief,
 * or nothing missed; one line when the brief can't be read.
 */
export function briefMissedText(project: Project, planFile: string, plan: FloorPlan, max = BRIEF_LINES_IN_AN_EDIT): string[] {
  const read = readBrief(project, planFile)
  if (read.problem !== null) return [say('en', 'report.brief.notRead', { problem: read.problem })]
  if (read.brief === null) return []
  const missed = briefLines(plan, read.brief).filter((l) => l.state === 'missed' && l.wish in FIGURES)
  if (missed.length === 0) return []
  const out = [say('en', 'report.brief.missed', { count: missed.length, file: JSON.stringify(read.file) })]
  out.push(...missed.slice(0, max).map((l) => `  ${l.text}`))
  if (missed.length > max) out.push(`  ${say('en', 'report.brief.missedMore', { count: missed.length - max })}`)
  return out
}
