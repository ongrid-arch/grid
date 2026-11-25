/**
 * MSG-22: the ids rooms text writes are ids every tool and edit takes (`PLAIN_ID`). A word outside
 * quotes is read in plain letters (`quotedWordsOf`), so an id written `baño` is written `bano`;
 * the answer names each id written so (`rooms/id-folded`). An id that still holds a letter with
 * no plain form (`客厅`) is refused where it is written (`rooms/bad-id`), never written and then
 * refused by every tool.
 */
import { english, joined, said } from '../messages/say'
import { PLAIN_ID, plainId } from '../types/planText'
import { quotedWordsOf } from './words'

interface IdProblem {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

/** Every id the plan holds, in its lists of parts. */
function planIds(plan: object): string[] {
  const ids: string[] = []
  for (const value of Object.values(plan)) {
    if (!Array.isArray(value)) continue
    for (const part of value) if (typeof part === 'object' && part !== null && typeof (part as { id?: unknown }).id === 'string') ids.push((part as { id: string }).id)
  }
  return ids
}

/** The line of the text that first writes a word outside quotes, as written. */
function lineOf(lines: readonly string[], word: string): number | null {
  for (let i = 0; i < lines.length; i++) {
    try {
      if (quotedWordsOf(lines[i]!, i + 1, true).some((w) => !w.quoted && w.text === word)) return i + 1
    } catch {
      // A line the compiler reads otherwise (an unclosed quote stops it before this).
    }
  }
  return null
}

/** The ids written in plain letters with what was written, and the ids that are still not plain. */
export function idsOfText(text: string, plan: object): { readonly warnings: IdProblem[]; readonly problems: IdProblem[] } {
  const ids = planIds(plan)
  const lines = text.split(/\r\n|\r|\n/)
  // An id made from a written one (a wall's, from its rooms') is refused by the word written.
  const problems: IdProblem[] = []
  const refused = new Set<string>()
  for (const id of ids.filter((id) => !PLAIN_ID.test(id))) {
    const written = [id, ...id.split('-')].find((word) => !PLAIN_ID.test(word) && lineOf(lines, word) !== null) ?? id
    if (refused.has(written)) continue
    refused.add(written)
    const line = lineOf(lines, written)
    problems.push({ code: 'rooms/bad-id', line, message: english(said(line === null ? 'rooms.badId.raw' : 'rooms.badId', { line: line ?? 0, id: written })) })
  }
  // What each word outside quotes was written as, when its plain form differs.
  const written = new Map<string, string>()
  lines.forEach((line, i) => {
    let words
    try {
      words = quotedWordsOf(line, i + 1, true)
    } catch {
      return
    }
    for (const word of words) {
      if (word.quoted) continue
      const plain = plainId(word.text)
      if (plain !== word.text && !written.has(plain)) written.set(plain, word.text)
    }
  })
  const pieces = new Set(ids.flatMap((id) => [id, ...id.split('-')]))
  const folded = [...written].filter(([plain]) => pieces.has(plain))
  const warnings: IdProblem[] =
    folded.length === 0
      ? []
      : [
          {
            code: 'rooms/id-folded',
            line: null,
            message: english(said(folded.length === 1 ? 'rooms.idFolded.one' : 'rooms.idFolded.many', { list: joined(folded.map(([id, was]) => said('rooms.idFolded.id', { written: was, id })), 'join.comma', 'join.and') }))
          }
        ]
  return { warnings, problems }
}
