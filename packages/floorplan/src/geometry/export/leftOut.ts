/**
 * HND-6: what an export file leaves out of the plan, and the note that says so inside the file.
 *
 * An exporter writes the parts the views draw and skips what validation calls broken. Without a
 * word in the file, a broken plan gives a file that looks whole: lab EX-8 found an IFC with 20 of
 * a plan's 230 doors and windows that passed every checker. So each format carries a note, in its
 * own way, whenever something was left out: a property set in the IFC, a layer of text in the DXF,
 * comment lines in the OBJ and `asset.extras` in the GLB. A file that leaves nothing out carries no
 * note, so it is byte for byte what it was before.
 *
 * Which parts are left out is worked out once, in `exportLeftOut` (`src/export/leftOut.ts`), from
 * the same validation the exporters skip by. This module only words the list. Ids are text from
 * the plan: each is written as a JSON string, and each format escapes that string its own way.
 */
import type { EntityKind } from '../validate'
import { english, num, said } from '../../messages/say'

/**
 * The kinds of part an export can leave out: everything but the plan itself, and a flat (CNT-4),
 * whose lines leave out nothing but the ids they name. CMD-56: and a thing on the site (C13), which
 * nothing breaks, left out by a format that holds no site things.
 */
export type LeftOutKind = Exclude<EntityKind, 'plan' | 'flat'> | 'site'

/** In the order a note lists them. */
export const LEFT_OUT_KINDS: readonly LeftOutKind[] = ['wall', 'room', 'opening', 'item', 'stair', 'floor', 'pattern', 'site']

/** One part of the plan an export left out. */
export interface LeftOutPart {
  readonly kind: LeftOutKind
  /** Its id; null when the reader left out a part whose id it could not read. */
  readonly id: string | null
  /** Where it is in the plan file (`openings[4]`), for a part left out when the plan was read; else null. */
  readonly place: string | null
  /** The floor it is on, when it is known; null for a part left out when the plan was read. */
  readonly floor: string | null
  /** The code of the line that leaves it out, as `grid check` gives it; null when no check names it. */
  readonly code: string | null
}

const PLURAL: Readonly<Record<LeftOutKind, readonly [string, string]>> = {
  wall: ['wall', 'walls'],
  room: ['room', 'rooms'],
  opening: ['opening', 'openings'],
  item: ['fixture', 'fixtures'],
  // LVL-3: a stair that cannot be laid out.
  stair: ['stair', 'stairs'],
  floor: ['floor', 'floors'],
  // LVL-8: an opening pattern the reader could not read.
  pattern: ['opening pattern', 'opening patterns'],
  // CMD-56: a fence, gate, path, paving, tree or pool a format does not write.
  site: ['site thing', 'site things']
}

/** `1 wall`, `3 openings`. */
export function countText(kind: LeftOutKind, count: number): string {
  return `${count} ${PLURAL[kind][count === 1 ? 0 : 1]}`
}

/** The parts of each kind, in `LEFT_OUT_KINDS` order, leaving out kinds with none. */
export function leftOutByKind(parts: readonly LeftOutPart[]): { kind: LeftOutKind; parts: LeftOutPart[] }[] {
  return LEFT_OUT_KINDS.map((kind) => ({ kind, parts: parts.filter((part) => part.kind === kind) })).filter((group) => group.parts.length > 0)
}

/** A part as a note names it: its id as a JSON string, or its place when it has no id. */
export function partName(part: LeftOutPart): string {
  return part.id !== null ? JSON.stringify(part.id) : (part.place ?? 'a part')
}

/**
 * The names of a kind's parts, each once, in the order given. An id that several parts share
 * (an id written on every floor) is named once, with how many: `"bath" 4 times`.
 */
export function partNames(parts: readonly LeftOutPart[]): string[] {
  const counts = new Map<string, number>()
  for (const part of parts) {
    const name = partName(part)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, count]) => (count === 1 ? name : `${name} ${count} times`))
}

/** `3 openings and 1 room`. */
export function kindsText(parts: readonly LeftOutPart[]): string {
  const counts = leftOutByKind(parts).map((group) => countText(group.kind, group.parts.length))
  return counts.length <= 1 ? (counts[0] ?? '') : `${counts.slice(0, -1).join(', ')} and ${counts.at(-1)}`
}

/**
 * The first line of every note: what the file leaves out, and where to read why. CMD-56: the site's
 * things a format does not write are said apart, after the parts that cannot be drawn: nothing is
 * wrong with them, and `grid check` names none.
 */
export function leftOutSummary(parts: readonly LeftOutPart[]): string {
  const broken = parts.filter((part) => part.kind !== 'site')
  const site = parts.length - broken.length
  const total = broken.length
  const lines = total === 0 ? [] : [`Grid left ${total} part${total === 1 ? '' : 's'} of the plan out of this file (${kindsText(broken)}): `
    + 'they cannot be drawn, or could not be read. grid check names each and says why.']
  if (site > 0) lines.push(english(said(site === 1 ? 'drawing.leftOut.site.one' : 'drawing.leftOut.site.many', { n: site })))
  return lines.join(' ')
}

/** The start of a kind's line: `Openings left out (42): `. */
export function kindLabel(kind: LeftOutKind, count: number): string {
  const plural = PLURAL[kind][1]
  return `${plural[0]!.toUpperCase()}${plural.slice(1)} left out (${count}): `
}

/** One line per kind: `Openings left out (42): "d1", "d2" 4 times`. */
export function leftOutLines(parts: readonly LeftOutPart[]): string[] {
  return leftOutByKind(parts).map(({ kind, parts: group }) => `${kindLabel(kind, group.length)}${partNames(group).join(', ')}`)
}

/**
 * CNT-18: a part of the plan a file writes with its curve as straight pieces: a curved wall, or
 * a room whose outline runs along one. It is in the file, so it is not left out; the note names
 * it beside what is.
 */
export interface ApproximatedPart {
  readonly kind: 'wall' | 'room'
  readonly id: string
  /** The floor it is on. */
  readonly floor: string | null
}

/** What a file writes as straight pieces, and how far off its curve they are at most. */
export interface Approximations {
  readonly parts: readonly ApproximatedPart[]
  /** Metres: the most any piece stands off its curve. */
  readonly off: number
}

export const NO_APPROXIMATIONS: Approximations = { parts: [], off: 0 }

/**
 * The note's lines for the curves a file writes as straight pieces; none when it writes none.
 * MSG-11: a file's own words are the English of their keys (`drawing.approximated.*`).
 */
export function approximationLines(approximations: Approximations): string[] {
  const { parts, off } = approximations
  if (parts.length === 0) return []
  const lines = [english(said(parts.length === 1 ? 'drawing.approximated.one' : 'drawing.approximated.many', { n: parts.length, off: num(off.toFixed(4)) }))]
  for (const kind of ['wall', 'room'] as const) {
    const group = parts.filter((part) => part.kind === kind)
    if (group.length === 0) continue
    const names = partNames(group.map((part) => ({ kind, id: part.id, place: null, floor: part.floor, code: null })))
    lines.push(english(said('drawing.approximated.group', { what: said(`drawing.approximated.${kind}`), n: group.length, names: names.join(', ') })))
  }
  return lines
}
