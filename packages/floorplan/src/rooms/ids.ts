/**
 * MSG-22: the ids rooms text writes are ids every tool and edit takes (`PLAIN_ID`). A word outside
 * quotes is read in plain letters (`quotedWordsOf`), so an id written `baño` is written `bano`;
 * the answer names each id written so (`rooms/id-folded`). An id that still holds a letter with
 * no plain form (`客厅`) is refused where it is written (`rooms/bad-id`), never written and then
 * refused by every tool.
 *
 * CMD-24: the refusal offers a plain id for the part (`plainIdsFor`), and `withPlainIds` gives a
 * plan whose file holds such ids (written before ids were plain, or by hand) with plain ones in
 * their place, so it reads back as rooms text every tool takes.
 */
import { english, joined, said } from '../messages/say'
import { PLAIN_ID, plainId, readPlainId } from '../types/planText'
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

type Part = Readonly<Record<string, unknown>>

/** The plan's lists of parts with ids, floors and rooms first: a wall's id is made from its rooms'. */
function partLists(plan: object): [string, Part[]][] {
  const lists = Object.entries(plan).filter((entry): entry is [string, Part[]] => Array.isArray(entry[1]) && entry[1].some((part) => typeof part === 'object' && part !== null && typeof (part as Part)['id'] === 'string'))
  const rank = (list: string): number => (list === 'floors' ? 0 : list === 'rooms' ? 1 : 2)
  return lists.sort(([a], [b]) => rank(a) - rank(b))
}

/** The word a plain id for a part is made from: a room's use, an opening's type, else what the part is. */
function wordFor(list: string, part: Part): string {
  const named = list === 'rooms' ? part['use'] : list === 'openings' ? part['type'] : undefined
  if (typeof named === 'string' && readPlainId(named) === named) return named
  const word = list.endsWith('s') ? list.slice(0, -1) : list
  return readPlainId(word) === word ? word : 'part'
}

/**
 * CMD-24: a plain id for every id of the plan that has no plain form (`客厅`), each one no other
 * part has: a room's from its use (`living`, `living-2`), a floor's `floor`, an opening's from its
 * type (`door`), and an id made of others (`w-客厅-卧室`) from theirs (`w-living-bedroom`).
 */
export function plainIdsFor(plan: object): ReadonlyMap<string, string> {
  const taken = new Set(planIds(plan))
  const plain = new Map<string, string>()
  for (const [list, parts] of partLists(plan)) {
    for (const part of parts) {
      const id = part['id']
      if (typeof id !== 'string' || readPlainId(id) !== null || plain.has(id)) continue
      const pieces = id.split('-').map((piece) => plain.get(piece) ?? readPlainId(piece))
      const word = pieces.length > 1 && pieces.every((piece) => piece !== null) ? pieces.join('-') : wordFor(list, part)
      let chosen = word
      for (let n = 2; taken.has(chosen); n++) chosen = `${word}-${n}`
      taken.add(chosen)
      plain.set(id, chosen)
    }
  }
  return plain
}

/** The fields that hold the person's words, never an id: left as written. */
const WORDS = new Set(['name', 'label', 'text', 'use', 'number', 'properties', 'identity', 'written'])

function renamed(value: unknown, plain: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return plain.get(value) ?? value
  if (Array.isArray(value)) return value.map((item) => renamed(item, plain))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => (WORDS.has(key) ? [key, item] : [plain.get(key) ?? key, renamed(item, plain)])))
}

/**
 * CMD-24: the plan with a plain id in place of every id that has no plain form, in every place
 * that names it, and what each was. Names, labels, texts, uses and facts are left as written.
 */
export function withPlainIds<T extends object>(plan: T): { readonly plan: T; readonly renamed: readonly (readonly [string, string])[] } {
  const plain = plainIdsFor(plan)
  if (plain.size === 0) return { plan, renamed: [] }
  return { plan: renamed(plan, plain) as T, renamed: [...plain] }
}

/** How the refusal shows the line to write: the plain id, and the name as written in quotes. */
function exampleOf(plan: object, written: string, plain: string): string {
  for (const [list, keyword] of [['rooms', 'room'], ['floors', 'floor']] as const) {
    const parts = (plan as Record<string, unknown>)[list]
    const part = Array.isArray(parts) ? (parts as Part[]).find((p) => p['id'] === written) : undefined
    if (part !== undefined) return `${keyword} ${plain} ${JSON.stringify(typeof part['name'] === 'string' ? part['name'] : written)}`
  }
  return ''
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
  const offered = plainIdsFor(plan)
  for (const id of ids.filter((id) => !PLAIN_ID.test(id))) {
    const written = [id, ...id.split('-')].find((word) => !PLAIN_ID.test(word) && lineOf(lines, word) !== null) ?? id
    if (refused.has(written)) continue
    refused.add(written)
    const line = lineOf(lines, written)
    // CMD-24: the plain id offered for the part, and the line that keeps its name.
    const plain = offered.get(written) ?? offered.get(id) ?? 'part'
    const example = exampleOf(plan, written, plain)
    const name = example === '' ? '' : said('rooms.badId.name', { example })
    problems.push({ code: 'rooms/bad-id', line, message: english(said(line === null ? 'rooms.badId.raw' : 'rooms.badId', { line: line ?? 0, id: written, plain, name })) })
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
