/**
 * LVL-25: the floor a person or an agent names, the way they name it: its id (`l2`), its id in
 * plain letters (MSG-22), its name in any capitals and spacing (`Second floor`), its level (`2`,
 * `level 2`, `L2`, `3rd`), a word of its name (`second`, `mezzanine`) or an ordinal for its
 * level (`third`, `ground`). Each reading is tried in that order, and the first that finds any
 * floor decides: one floor is the answer, several are said apart so the caller can name them.
 *
 * Pure: the plan's floors in, a floor's id out.
 */
import { plainId } from '../types/planText'
import { planFloors } from './floors'
import type { FloorPlan } from './plan'
import type { Floor } from '../types/floorplan'

/** What a word names: one floor, several (none of them chosen), or none. */
export type FloorAsked = { readonly id: string } | { readonly among: readonly string[] } | null

/** The English ordinals, by level: `ground` is 0, `first` 1, as Grid's floors are numbered. */
const ORDINALS = ['ground', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']

/** Words that say "floor" and add nothing to which one. */
const FLOOR_WORDS = new Set(['floor', 'storey', 'story', 'level', 'the'])

const fold = (text: string): string => plainId(text).trim().replace(/\s+/g, ' ').toLowerCase()

/** The level a number gives: `2`, `level 2`, `L2`, `-1`, `0.5`, `3rd`, `3rd floor`; null when none. */
function numberedLevel(word: string): number | null {
  const plain = /^(?:level |storey |story |floor |l)?(-?\d+(?:\.5)?)(?:st|nd|rd|th)?(?: floor| storey| story| level)?$/.exec(word)
  return plain === null ? null : Number(plain[1])
}

/** The level an ordinal gives: `third`, `third floor`, `ground`; null when none. */
function ordinalLevel(word: string): number | null {
  const words = word.split(' ').filter((w) => !FLOOR_WORDS.has(w))
  if (words.length !== 1) return null
  const k = ORDINALS.indexOf(words[0]!)
  return k < 0 ? null : k
}

function decided(found: readonly Floor[]): FloorAsked {
  if (found.length === 0) return null
  return found.length === 1 ? { id: found[0]!.id } : { among: found.map((f) => f.id) }
}

/** The floor of the plan a word names. */
export function floorAsked(plan: FloorPlan, sent: string): FloorAsked {
  const floors = planFloors(plan)
  if (floors.some((f) => f.id === sent)) return { id: sent }
  const word = fold(sent)
  if (word === '') return null
  const readings: ReadonlyArray<(f: Floor) => boolean> = [
    (f) => fold(f.id) === word,
    (f) => f.name !== undefined && fold(f.name) === word,
    (f) => numberedLevel(word) === f.level,
    (f) => {
      if (f.name === undefined) return false
      const own = new Set(fold(f.name).split(' '))
      const asked = word.split(' ').filter((w) => !FLOOR_WORDS.has(w))
      return asked.length > 0 && asked.every((w) => own.has(w))
    },
    (f) => ordinalLevel(word) === f.level,
  ]
  for (const reads of readings) {
    const found = decided(floors.filter(reads))
    if (found !== null) return found
  }
  return null
}
