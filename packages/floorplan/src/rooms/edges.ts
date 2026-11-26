/**
 * The edges of a room that no other room faces, in rooms text (WRT-76).
 *
 *   room <id> ... edge open|railing <h>|wall [<h>]   the room's outside edges: open, a railing of
 *                                                    that height, or a wall (of its own height)
 *   room <id> ... open <north|south|east|west>       that side open onto whatever is there
 *   wall <room> <side> [<t>] [kind|virtual|railing] [height <h>]   one outside side, as before
 *
 * Outdoor space (CNT-7, C26) is open where no room faces it, unless its line or a wall line
 * says otherwise; every other room is walled there, as before. A railing is as thick as the
 * room's own `walls <t>`, else the floor's inside walls, and a wall as the room's own `walls
 * <t>`, else the floor's outside walls: no figure of its own.
 *
 * Also here: the outdoor words agents write in a room line's use slot (`patio`, `deck`,
 * `veranda`) and the kind of outdoor space each means, so the refusal writes the line.
 *
 * Pure: words in, a decision out. The compiler calls it; nothing here reads the plan.
 */
import { OUTDOOR_KINDS, type OutdoorKind, type RoomUse, type WallKind } from '../types/floorplan'
import { english, said } from '../messages/say'
import { isNumberWord, numberOf, RoomsStop, type PlainNumbers } from './words'

/** What a room line's `edge` says about the room's outside edges. */
export type EdgeWord = { readonly kind: 'open' } | { readonly kind: 'railing'; readonly height: number } | { readonly kind: 'wall'; readonly height: number | null }

/** The compass sides `open <side>` takes. */
export const OPEN_SIDES: readonly string[] = ['north', 'south', 'east', 'west']

/** The side a unit's mirroring turns a side into. */
export function mirroredSide(side: string, mx: boolean, my: boolean): string {
  if (mx && side === 'east') return 'west'
  if (mx && side === 'west') return 'east'
  if (my && side === 'north') return 'south'
  if (my && side === 'south') return 'north'
  return side
}

/**
 * The words after `edge` on a room line, from `t[i]` (the word `edge`): the edge, and the index
 * of the word after them. A kind it does not know, or a railing with no height, is refused.
 */
export function edgeWords(t: readonly string[], i: number, at: number, plain: PlainNumbers): { edge: EdgeWord; next: number } {
  const kind = t[i + 1]
  const refuse = (): never => {
    throw new RoomsStop('rooms/syntax', english(said('rooms.edge.form', { line: at, word: kind ?? '' })), at)
  }
  if (kind === 'open') return { edge: { kind: 'open' }, next: i + 2 }
  if (kind === 'railing') {
    const h = t[i + 2]
    if (h === undefined || !isNumberWord(h)) refuse()
    const height = numberOf(h!, at, plain)
    if (height <= 0) refuse()
    return { edge: { kind: 'railing', height }, next: i + 3 }
  }
  if (kind === 'wall') {
    const h = t[i + 2]
    if (h !== undefined && isNumberWord(h)) {
      const height = numberOf(h, at, plain)
      if (height <= 0) refuse()
      return { edge: { kind: 'wall', height }, next: i + 3 }
    }
    return { edge: { kind: 'wall', height: null }, next: i + 2 }
  }
  return refuse()
}

/**
 * Outdoor words agents write where a room line's use goes, each with the kind of outdoor space
 * it means and, for a way along the outside, the use that carries it.
 */
const OUTDOOR_WORDS: Readonly<Record<string, { readonly kind: OutdoorKind; readonly use?: RoomUse }>> = {
  patio: { kind: 'terrace' },
  deck: { kind: 'terrace' },
  decking: { kind: 'terrace' },
  'roof-terrace': { kind: 'terrace' },
  roofterrace: { kind: 'terrace' },
  'sun-deck': { kind: 'terrace' },
  sundeck: { kind: 'terrace' },
  'pavement-terrace': { kind: 'terrace' },
  veranda: { kind: 'porch' },
  verandah: { kind: 'porch' },
  lanai: { kind: 'porch' },
  stoop: { kind: 'porch' },
  canopy: { kind: 'porch' },
  loggia: { kind: 'balcony' },
  yard: { kind: 'garden' },
  backyard: { kind: 'garden' },
  lawn: { kind: 'garden' },
  playground: { kind: 'other' },
  'access-gallery': { kind: 'other', use: 'corridor' },
  'deck-access': { kind: 'other', use: 'corridor' },
  walkway: { kind: 'other', use: 'corridor' },
  breezeway: { kind: 'other', use: 'corridor' },
  'outside-stair': { kind: 'other', use: 'stair' },
  'outdoor-stair': { kind: 'other', use: 'stair' },
}

/**
 * The outdoor space a word in a room line's use slot means: one of Grid's outdoor kinds (which
 * is itself), `outdoor`, or one of the words above; null for any other word.
 */
export function outdoorWordKind(word: string): { readonly kind: OutdoorKind | null; readonly use?: RoomUse } | null {
  const w = word.toLowerCase()
  if ((OUTDOOR_KINDS as readonly string[]).includes(w)) return { kind: w as OutdoorKind }
  if (w === 'outdoor' || w === 'outside') return { kind: null }
  return OUTDOOR_WORDS[w] ?? null
}

/** What a `wall <room> <side>` line says, as far as the edge reads it. */
export interface SideSay {
  readonly t: number | null
  readonly kind: WallKind | 'virtual' | null
  readonly height: number | null
  readonly railing: boolean
}

/** One outside stretch of a room as it is drawn. */
export interface OutsideEdge {
  readonly virtual: boolean
  readonly railing: boolean
  readonly t: number
  readonly kind: WallKind
  /** Null: the storey's height, as an outside wall that states none. */
  readonly height: number | null
}

/**
 * One stretch of a room's side that no room faces: open (a virtual wall on its face), a railing
 * or a wall. A `wall <room> <side>` line decides first, then `open <side>`, then the room line's
 * `edge`, then whether the room is outdoor space: open if it is, the floor's outside wall if not.
 */
export function outsideEdge(input: {
  readonly outdoor: boolean
  readonly edge: EdgeWord | null
  readonly wallsT: number | null
  readonly say: SideSay | null
  readonly openSide: boolean
  readonly rule: { readonly outside: number; readonly inside: number }
  readonly height: number | null
}): OutsideEdge {
  const { outdoor, edge, wallsT, say, rule, height } = input
  const open: OutsideEdge = { virtual: true, railing: false, t: 0, kind: 'exterior', height: 0 }
  const railingT = wallsT ?? rule.inside
  if (say !== null) {
    if (say.kind === 'virtual') return { ...open, t: say.t ?? 0, height: say.height ?? 0 }
    const kind = say.kind ?? 'exterior'
    if (say.railing) return { virtual: false, railing: true, t: say.t ?? railingT, kind, height: say.height ?? (edge?.kind === 'railing' ? edge.height : height) }
    // A wall line on outdoor space with no thickness takes the room's own, as its `edge wall` would.
    const t = say.t ?? (outdoor || edge?.kind === 'wall' ? (wallsT ?? rule.outside) : rule.outside)
    return { virtual: false, railing: false, t, kind, height: say.height ?? (edge?.kind === 'wall' ? edge.height ?? height : height) }
  }
  if (input.openSide) return open
  if (edge?.kind === 'open') return open
  if (edge?.kind === 'railing') return { virtual: false, railing: true, t: railingT, kind: 'exterior', height: edge.height }
  if (edge?.kind === 'wall') return { virtual: false, railing: false, t: wallsT ?? rule.outside, kind: 'exterior', height: edge.height ?? height }
  return outdoor ? open : { virtual: false, railing: false, t: rule.outside, kind: 'exterior', height }
}
