/**
 * The one place Grid works out which word or id was most likely meant (MSG-7): MSG-4's unknown
 * fields and room uses, the drawing check's walls and floors that are not in the plan, and the
 * tool server's arguments. Pure, and it imports nothing.
 *
 * Two questions, two answers:
 *
 * - `likelyMeant`: the word most likely meant, or none. A wrong guess sends the agent the wrong
 *   way, and no guess still names the word, so only a near spelling counts.
 * - `closestId`: the closest of a short list (a plan's floors), always one, because the list is
 *   short enough that the closest is worth naming even when it is not close.
 */

/** A word with its capitals, spaces, dashes and underscores taken out: `Clear_Width` is `clearwidth`. */
export function fold(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Whether `a` becomes `b` by one slip: a letter added, one taken out, two side by side swapped,
 * and, when `replaced` is true, one letter replaced.
 */
function oneSlip(a: string, b: string, replaced: boolean): boolean {
  if (a === b) return false
  if (a.length === b.length) {
    const at = [...a].findIndex((c, i) => c !== b[i])
    if (a.slice(at + 1) === b.slice(at + 1)) return replaced
    return a[at] === b[at + 1] && a[at + 1] === b[at] && a.slice(at + 2) === b.slice(at + 2)
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  if (long.length - short.length !== 1) return false
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true
  return false
}

export interface MeantOptions {
  /**
   * Count one letter replaced as a slip. True for ids, which are typed (`entrence` for
   * `entrance`); false for field names and uses, which agents choose: `roofs` is not a slip for
   * `rooms`. They shorten a word (`thick`) or change its capitals or joins (`Thickness`), and
   * those are found either way.
   */
  readonly replaced?: boolean
}

/**
 * The word in `known` most likely meant by `word`, or null. In order: the same word in other
 * capitals or joins (`Ext_North` for `ext-north`); a known word that starts with it (`thick` for
 * `thickness`, `ext-nort` for `ext-north`), the shortest first; a known word one slip away
 * (`heigth`, `floors`, `g-sw` for `g-s`), the first in `known` on a tie. Never `word` itself.
 */
export function likelyMeant<T extends string>(word: string, known: readonly T[], options: MeantOptions = {}): T | null {
  const f = fold(word)
  if (f === '') return null
  const folded = known.filter((k) => k !== word).map((k) => [k, fold(k)] as const)
  const same = folded.find(([, k]) => k === f)
  if (same) return same[0]
  if (f.length >= 3) {
    const longer = folded.filter(([, k]) => k.startsWith(f)).sort((a, b) => a[1].length - b[1].length)[0]
    if (longer) return longer[0]
  }
  // A replaced letter is a slip in an id of three letters or more; anything else needs four.
  if (f.length >= (options.replaced ? 3 : 4)) {
    const slip = folded.find(([, k]) => oneSlip(f, k, options.replaced === true))
    if (slip) return slip[0]
  }
  return null
}

/** The id most likely meant: `likelyMeant` with a replaced letter counted. */
export function likelyId<T extends string>(id: string, known: readonly T[]): T | null {
  return likelyMeant(id, known, { replaced: true })
}

/**
 * Edits (a letter added, dropped, changed or two swapped) between two ids, ignoring
 * capitalisation: the optimal string alignment distance. Stops counting past `most`.
 */
export function idEdits(a: string, b: string, most = Infinity): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (Math.abs(x.length - y.length) > most) return most + 1
  const rows: number[][] = [Array.from({ length: y.length + 1 }, (_, j) => j)]
  for (let i = 1; i <= x.length; i++) {
    const row = [i]
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      let best = Math.min(rows[i - 1]![j]! + 1, row[j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) best = Math.min(best, rows[i - 2]![j - 2]! + 1)
      row.push(best)
    }
    rows.push(row)
  }
  return rows[x.length]![y.length]!
}

/**
 * The known id with the fewest edits from `id`, the first of them in `known`'s order on a tie;
 * null when `known` holds nothing else. For a short list: one id is always named.
 */
export function closestId(id: string, known: readonly string[]): string | null {
  let best: string | null = null
  let fewest = Infinity
  for (const candidate of known) {
    if (candidate === id) continue
    const edits = idEdits(id, candidate)
    if (edits < fewest) {
      fewest = edits
      best = candidate
    }
  }
  return best
}

/**
 * The known ids nearest to `id`, best first, at most `count` (CMD-21): for a plan with many
 * rooms, where the first few in the plan's order say nothing about the one meant. An id that
 * holds the other once both are folded (`f3-room-310` holds `room-310`, as a floor prefix or a
 * suffix is added or left off) comes before any other, the nearer in length first; the rest come
 * by edits between their folded forms. A tie keeps the plan's order. Never `id` itself.
 */
export function nearestIds(id: string, known: readonly string[], count = 5): string[] {
  const f = fold(id)
  const ranked = known
    .map((candidate, order) => {
      const k = fold(candidate)
      const holds = f.length >= 3 && k.length >= 3 && (f.includes(k) || k.includes(f))
      return { candidate, order, holds, score: holds ? Math.abs(f.length - k.length) : idEdits(f, k) }
    })
    .filter((entry) => entry.candidate !== id)
    .sort((a, b) => Number(b.holds) - Number(a.holds) || a.score - b.score || a.order - b.order)
  return ranked.slice(0, count).map((entry) => entry.candidate)
}
