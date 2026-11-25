/**
 * WRT-59: what an edit caused. The plan's own checks are run on the file before and after, and
 * the notes that are new after come first in the answer, the plot boundary's before the rest, so
 * a change that pushed the building over the boundary says so before anything else.
 *
 * Pure: two records in, the new lines out.
 */
import type { GridResult, ResultLine } from '@ongrid/rules'

/** The kinds of line that say something is wrong or worth a look; a held-back check or a value to confirm does not. */
const CAUSED_KINDS: ReadonlySet<ResultLine['kind']> = new Set(['left-out', 'worth-a-look', 'finding'])

const keyOf = (line: ResultLine): string => `${line.code}|${line.thing.kind}|${line.thing.id}|${[...line.also].sort().join(',')}`

/** A note about the plot's boundary: the plan over it, or a set-back or edge it breaks. */
const aboutBoundary = (line: ResultLine): boolean => /boundary|set-?back/i.test(line.code)

/** The lines of `after` that `before` does not have, the boundary's first. Each line of `before` is used once. */
export function newLines(before: GridResult, after: GridResult): ResultLine[] {
  const had = new Map<string, number>()
  for (const line of before.lines) had.set(keyOf(line), (had.get(keyOf(line)) ?? 0) + 1)
  const fresh: ResultLine[] = []
  for (const line of after.lines) {
    if (!CAUSED_KINDS.has(line.kind)) continue
    const left = had.get(keyOf(line)) ?? 0
    if (left > 0) had.set(keyOf(line), left - 1)
    else fresh.push(line)
  }
  return [...fresh.filter(aboutBoundary), ...fresh.filter((line) => !aboutBoundary(line))]
}

/** How many new lines an answer gives in full. */
export const CAUSED_IN_AN_EDIT = 5

/** The answer's opening sentence for the new lines, or null when there are none. */
export function causedText(fresh: readonly ResultLine[]): string | null {
  if (fresh.length === 0) return null
  const shown = fresh.slice(0, CAUSED_IN_AN_EDIT).map((line) => line.message)
  const more = fresh.length > shown.length ? ` And ${fresh.length - shown.length} more: grid_check lists them.` : ''
  return `This change caused ${fresh.length === 1 ? 'a new note' : `${fresh.length} new notes`}: ${shown.join(' ')}${more}`
}
