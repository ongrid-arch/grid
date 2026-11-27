/**
 * MSG-36: a note said once for every part or floor it holds for. A ward of fourteen rooms with the
 * same door gives fourteen lines that differ only in the room's number, and a tower copies one
 * floor's mistake onto every floor above it; said once, with the ids listed as runs, the line is
 * read once and every id is still there.
 *
 * Two lines are alike when their words are the same once every number inside a quoted name or id
 * is set aside (`alikeKey`): `"l03-door-2"` and `"l17-door-2"` read alike, `2.95 m` and `5.90 m`
 * do not, so no figure is ever lost to a group. A group is kept only when it holds at least
 * `alikeLines` lines; fewer stay one line each. Pure: words in, words out.
 */
import { english, joined, name, said, type Value } from '../messages/say'
import { limit } from './tolerances'

/** A name or id as a line quotes it: in double quotes, or in single quotes with no space inside. */
const QUOTED = /"[^"\n]*"|'[^'\s]+'/g
const DIGITS = /\d+/g

/** The words of a line with every number inside a quoted name or id set aside. */
export function alikeKey(text: string): string {
  return text.replace(QUOTED, (word) => word.replace(DIGITS, '#'))
}

/** The quoted names and ids of a line, in order, quotes and all. */
export function quotedWords(text: string): string[] {
  return [...text.matchAll(QUOTED)].map((m) => m[0])
}

/**
 * Items gathered by their key, in the order the first of each came: a group of fewer than
 * `alikeLines` items is given back one item at a time, each where it stood, and so is an item
 * whose key is null.
 */
export function groupAlike<T>(items: readonly T[], key: (item: T) => string | null): T[][] {
  const fewest = limit('alikeLines')
  const keys = items.map(key)
  const members = new Map<string, number[]>()
  keys.forEach((k, i) => {
    if (k !== null) members.set(k, [...(members.get(k) ?? []), i])
  })
  const out: T[][] = []
  keys.forEach((k, i) => {
    const group = k === null ? undefined : members.get(k)
    if (group === undefined || group.length < fewest) out.push([items[i]!])
    else if (group[0] === i) out.push(group.map((at) => items[at]!))
  })
  return out
}

interface Numbered {
  readonly head: string
  readonly digits: string
  readonly tail: string
}

const numbered = (id: string): Numbered | null => {
  const m = /^(.*?)(\d+)(\D*)$/.exec(id)
  return m === null ? null : { head: m[1]!, digits: m[2]!, tail: m[3]! }
}

/** Whether `b` is the id after `a`: the same words round a number one more, written as wide or with no leading zero. */
function follows(a: string, b: string): boolean {
  const x = numbered(a)
  const y = numbered(b)
  if (x === null || y === null || x.head !== y.head || x.tail !== y.tail) return false
  if (Number(y.digits) !== Number(x.digits) + 1) return false
  const padded = (n: Numbered): boolean => n.digits.length > 1 && n.digits.startsWith('0')
  return x.digits.length === y.digits.length || (!padded(x) && !padded(y))
}

/**
 * A list of ids said as runs, in the order given and each once: `"door-101" to "door-114"`, then
 * `"l00", "l04" to "l17"`. A run is three ids or more one after another; at most `alikeRunsShown`
 * runs are said, and how many ids are left after them. `say` gives each id as a line writes it
 * (`name` by default, in double quotes).
 */
export function idRuns(ids: readonly string[], say: (id: string) => Value = name): Value {
  const list = [...new Set(ids)]
  const runs: string[][] = []
  for (const id of list) {
    const last = runs[runs.length - 1]
    if (last !== undefined && follows(last[last.length - 1]!, id)) last.push(id)
    else runs.push([id])
  }
  const parts = runs.flatMap((run): { value: Value; ids: number }[] =>
    run.length >= 3 ? [{ value: said('alike.run', { first: say(run[0]!), last: say(run[run.length - 1]!) }), ids: run.length }] : run.map((id) => ({ value: say(id), ids: 1 }))
  )
  const most = limit('alikeRunsShown')
  if (parts.length <= most) return joined(parts.map((p) => p.value), 'join.comma')
  const shown = parts.slice(0, most)
  const more = list.length - shown.reduce((n, p) => n + p.ids, 0)
  return said('alike.more', { shown: joined(shown.map((p) => p.value), 'join.comma'), more })
}

/** For each of several alike lines, the first quoted word that is not the same in all of them; none when they are the same throughout. */
export function wordsThatDiffer(texts: readonly string[]): string[] {
  const words = texts.map(quotedWords)
  const first = words[0] ?? []
  for (let at = 0; at < first.length; at++) {
    if (words.some((w) => w[at] !== first[at])) return words.map((w) => w[at] ?? '')
  }
  return []
}

/**
 * Lines of text alike said once (a refusal's problems, a write's warnings, a diff's changes): the
 * first line of each group, with the word that differs in each of the others as runs, in English.
 */
export function alikeTexts(lines: readonly string[]): string[] {
  return groupAlike(lines, alikeKey).map((group) => {
    if (group.length === 1) return group[0]!
    const differ = wordsThatDiffer(group).slice(1)
    if (differ.length === 0) return english(said('alike.repeated', { line: group[0]!, count: group.length }))
    // The words are quoted as the line quotes them: a run is said by its two ends.
    return english(said('alike.lines', { line: group[0]!, count: group.length - 1, ids: idRuns(differ.map(unquote), requote(differ[0]!)) }))
  })
}

const unquote = (word: string): string => word.slice(1, -1)
const requote = (sample: string) => (id: string): Value => `${sample[0]}${id}${sample[0]}`

/** A change most of a set of renamed ids share: the word taken out (`from`) and the word put in (`to`). */
export interface RenamePattern {
  readonly from: string
  readonly to: string
  /** How many of the ids it holds for. */
  readonly count: number
}

const WORDY = /[A-Za-z0-9]/

/** What one id's rename changed: the stretch between the start and the end both ids share, widened to whole words. */
function renameOf(before: string, after: string): { from: string; to: string } {
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++
  let tail = 0
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++
  if (before.length - head - tail > 0 && after.length - head - tail > 0) {
    while (head > 0 && WORDY.test(before[head - 1]!)) head--
    while (tail > 0 && WORDY.test(before[before.length - tail]!)) tail--
  }
  return { from: before.slice(head, before.length - tail), to: after.slice(head, after.length - tail) }
}

/**
 * The one change most renamed ids share (`"l01"` now `"l02"` in `l01-w3` to `l02-w3`), when at
 * least `alikeLines` of them share it; null otherwise.
 */
export function renamePattern(pairs: readonly { readonly before: string; readonly after: string }[]): RenamePattern | null {
  const counts = new Map<string, RenamePattern>()
  for (const { before, after } of pairs) {
    if (before === after) continue
    const { from, to } = renameOf(before, after)
    const key = JSON.stringify([from, to])
    const was = counts.get(key)
    counts.set(key, { from, to, count: (was?.count ?? 0) + 1 })
  }
  let best: RenamePattern | null = null
  for (const pattern of counts.values()) if (best === null || pattern.count > best.count) best = pattern
  return best === null || best.count < limit('alikeLines') ? null : best
}

/** A rename pattern in words: `40 of them by one pattern, "l01" now "l02"`. */
export function renamePatternSaid(pattern: RenamePattern): Value {
  if (pattern.from === '') return said('alike.rename.added', { count: pattern.count, to: name(pattern.to) })
  if (pattern.to === '') return said('alike.rename.dropped', { count: pattern.count, from: name(pattern.from) })
  return said('alike.rename', { count: pattern.count, from: name(pattern.from), to: name(pattern.to) })
}
