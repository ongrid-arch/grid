/**
 * MSG-29: the seen notes a change made new again. A note the person set aside as seen
 * (`seen/marks.ts`) is new again once one of its parts changes; a change and a diff name each one,
 * so the person who marked it is told.
 *
 * Each version of the plan is read as `grid_check` reads it: `loadPlan`, the firm's standards
 * beside the plan, and `checkPlan` counted with the country the mark was made with, so a note's
 * number is its number in that report. Reading never fails a change: a marks file that can't be
 * read, or a mark whose country is not one Grid lists, gives no comparison, as `grid check` then
 * lists the note as new.
 */
import type { ResultLine } from '@ongrid/rules'
import { countryInText, countryName } from '@ongrid/floorplan/types/places'
import { DEFAULT_LANGUAGE } from '@ongrid/floorplan/messages'
import { checkPlan, kindWord, seenByText, thingText } from '../command/check'
import { UsageError } from '../command/options'
import { loadPlan, PlanRefused, type LoadedPlan } from '../command/plan'
import { reportLanguage, t } from '../command/words'
import { firmForCheck } from '../firm/measure'
import { PathRefused, type Project } from '../fs/projectFiles'
import { listSchema, NULLABLE_STRING, NUMBER, objectSchema, STRING } from '../mcp/toolkit'
import { madeNewAgain, partText, readSeen, type MadeNew, type SeenMark, type SeenVersion } from '../seen/marks'

/** The most notes an answer names in words; the data holds them all. */
export const SEEN_NEW_SHOWN = 10

/** The marks beside a plan and the plan as it was, read before a change is written. */
export interface SeenBefore {
  readonly marks: readonly SeenMark[]
  readonly version: SeenVersion
}

/** A version of the plan as `grid_check` reads it, its report counted once per country asked. */
export function checkedVersion(project: Project, planFile: string, loaded: LoadedPlan): SeenVersion {
  const firm = firmForCheck(project, planFile, loaded.plan)
  const counted = new Map<string, readonly ResultLine[]>()
  return {
    source: loaded,
    lines: (country) => {
      const key = country ?? ''
      let lines = counted.get(key)
      if (lines === undefined) {
        try {
          lines = checkPlan(loaded, { ...(country === undefined ? {} : { country }), ...(firm ? { firm } : {}) }).result.lines
        } catch (error) {
          // A country Grid does not list, written into the marks file by hand: no report to count with.
          if (!(error instanceof UsageError)) throw error
          lines = []
        }
        counted.set(key, lines)
      }
      return lines
    },
  }
}

/** The plan's seen marks and the plan as it is, or null when it has none that can be read. */
export function seenBefore(project: Project, planFile: string, loaded?: LoadedPlan): SeenBefore | null {
  try {
    const read = readSeen(project, planFile)
    if (read.problem !== null || read.marks.length === 0) return null
    return { marks: read.marks, version: checkedVersion(project, planFile, loaded ?? loadPlan(project, planFile)) }
  } catch (error) {
    if (error instanceof PathRefused || error instanceof PlanRefused) return null
    throw error
  }
}

/** The notes seen before that are new again on the plan as it is now, read from its file. */
export function seenMadeNew(before: SeenBefore | null, project: Project, planFile: string, loaded?: LoadedPlan): MadeNew[] {
  if (before === null) return []
  try {
    return madeNewAgain(before.marks, before.version, checkedVersion(project, planFile, loaded ?? loadPlan(project, planFile)))
  } catch (error) {
    if (error instanceof PathRefused || error instanceof PlanRefused) return []
    throw error
  }
}

/** A country as a sentence names it, in the report's language. */
function countryText(code: string): string {
  return reportLanguage() === DEFAULT_LANGUAGE ? countryInText(code) : countryName(code)
}

/** One note new again, in a line: its number, the note, who marked it and what changed. */
export function seenNewText(made: MadeNew): string {
  const { line, mark } = made
  const note = t('report.note', { kind: kindWord(line.kind), thing: thingText(line), message: line.message, code: line.code })
  const counted = mark.country === undefined ? '' : t('edit.seenNew.counted', { country: countryText(mark.country) })
  const parts = made.changed.slice(0, 4).map(partText).join(', ')
  return t('edit.seenNew', { number: made.number, counted, note, by: seenByText(mark), parts: made.changed.length > 4 ? t('line.part.andMore', { shown: parts, more: made.changed.length - 4 }) : parts })
}

/** The lines an answer gives: each note, at most `SEEN_NEW_SHOWN`, and how many more the data holds. */
export function seenNewLines(made: readonly MadeNew[], max = SEEN_NEW_SHOWN): string[] {
  const more = made.length - max
  return [...made.slice(0, max).map(seenNewText), ...(more <= 0 ? [] : [more === 1 ? t('edit.seenNew.more.one') : t('edit.seenNew.more.many', { count: more })])]
}

/** `seenNew` in a tool's output schema. */
export const SEEN_NEW_OUTPUT = listSchema(
  objectSchema({
    number: NUMBER,
    code: STRING,
    thing: objectSchema({ kind: STRING, id: STRING }),
    country: NULLABLE_STRING,
    by: STRING,
    at: STRING,
    reason: STRING,
    changed: listSchema(objectSchema({ kind: STRING, id: STRING })),
    text: STRING,
  }),
)

/** The notes as data, for `seenNew` in an answer. */
export function seenNewData(made: readonly MadeNew[]): Record<string, unknown>[] {
  return made.map((m) => ({
    number: m.number,
    code: m.line.code,
    thing: { kind: m.line.thing.kind, id: m.line.thing.id },
    country: m.mark.country ?? null,
    by: m.mark.by,
    at: m.mark.at,
    reason: m.mark.reason,
    changed: m.changed.map((p) => ({ kind: p.kind, id: p.id })),
    text: seenNewText(m),
  }))
}
