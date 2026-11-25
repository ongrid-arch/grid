/**
 * Kinds of door and window (CNT-14, C20): what each kind is drawn, checked and exported as.
 *
 * The plan states a kind on a door or a window (`kind`) and, when not all of it opens, the part
 * that does (`opens`). This module is the one place that says what that means:
 *
 * - a door that states no kind, or a kind only a window takes, is one swinging leaf, as every
 *   door was before CNT-14; a window that states none is drawn and measured as before;
 * - how each kind of door moves: it swings (`single`, `double`), folds (`folding`), slides
 *   (`sliding`, `pocket`) or lifts (`roller`, `garage`). Only a door that swings or folds sweeps
 *   the floor, so only those need their swing stated before the sweep can be checked;
 * - how wide the part that opens is, and the leaves of a pair.
 *
 * Pure: no React, no Three, no DOM.
 */

import { limit, tolerance } from './tolerances'
import { DOOR_KINDS, WINDOW_KINDS, type DoorKind, type Opening, type OpeningKind, type OpeningPart, type WindowKind } from '../types/floorplan'

const DOORS: ReadonlySet<string> = new Set(DOOR_KINDS)
const WINDOWS: ReadonlySet<string> = new Set(WINDOW_KINDS)

/** What a door or window states about its kind, as a caller holds it. */
export interface KindValues {
  readonly kind?: OpeningKind | null
  readonly opens?: OpeningPart | null
}

/** Whether a kind is one its type takes: a door's kind on a door, a window's on a window. A doorless opening takes none. */
export function kindFits(type: Opening['type'], kind: string): boolean {
  return type === 'door' ? DOORS.has(kind) : type === 'window' ? WINDOWS.has(kind) : false
}

/** The kind an opening states, when its type takes it; null otherwise. */
export function statedKind(type: Opening['type'], kind: OpeningKind | null | undefined): OpeningKind | null {
  return kind !== undefined && kind !== null && kindFits(type, kind) ? kind : null
}

/** The kind a door is drawn and checked as: the kind it states, else one swinging leaf. */
export function doorKindOf(kind: OpeningKind | null | undefined): DoorKind {
  return kind !== undefined && kind !== null && DOORS.has(kind) ? (kind as DoorKind) : 'single'
}

/**
 * VEW-22: the kind a door that states none is drawn as, Grid's guess, or null when it is drawn as
 * one swinging leaf: a door narrower than `wideSingleLeaf`, or one that states the part that
 * opens. A wider one is drawn as a pair when it states the face it opens to and is no wider than
 * two such leaves, else as a sliding door, which needs nothing more stated. It is still checked
 * as one leaf, and asked about (`opening/wide-single-leaf`).
 */
export function guessedDoorKind(width: number, values: KindValues & { readonly swing?: string | null }): 'double' | 'sliding' | null {
  if ((values.kind !== undefined && values.kind !== null) || (values.opens !== undefined && values.opens !== null)) return null
  const wide = limit('wideSingleLeaf')
  if (!(width >= wide)) return null
  return values.swing !== undefined && values.swing !== null && width <= 2 * wide ? 'double' : 'sliding'
}

/** The kind a window is drawn as: the kind it states, else one casement, drawn as before. */
export function windowKindOf(kind: OpeningKind | null | undefined): WindowKind {
  return kind !== undefined && kind !== null && WINDOWS.has(kind) ? (kind as WindowKind) : 'single'
}

/** How a door's leaves move. */
export type DoorMotion = 'swing' | 'fold' | 'slide' | 'lift'

export const DOOR_MOTION: Readonly<Record<DoorKind, DoorMotion>> = {
  single: 'swing',
  double: 'swing',
  folding: 'fold',
  sliding: 'slide',
  pocket: 'slide',
  roller: 'lift',
  garage: 'lift'
}

/** Whether a door of this kind sweeps the floor as it opens: one that swings or folds. A sliding, roller or garage door sweeps nothing. */
export function sweepsFloor(kind: DoorKind): boolean {
  const motion = DOOR_MOTION[kind]
  return motion === 'swing' || motion === 'fold'
}

/**
 * What a door of this kind needs stated for its sweep to be drawn and checked. A single leaf and
 * a folding door need both the end they hang from and the face they open to; a pair hangs from
 * both ends, so it needs only the face. A door that sweeps nothing needs neither.
 */
export function swingNeeds(kind: DoorKind): { readonly hinge: boolean; readonly swing: boolean } {
  if (kind === 'single' || kind === 'folding') return { hinge: true, swing: true }
  if (kind === 'double') return { hinge: false, swing: true }
  return { hinge: false, swing: false }
}

/** The width of the part that opens, along the wall: the stated part, no wider than the opening, else the whole. */
export function partWidth(width: number, opens: OpeningPart | null | undefined): number {
  return opens === undefined || opens === null ? width : Math.min(opens.width, width)
}

/** The height of the part that opens: the stated part's, no higher than the opening, else the opening's. */
export function partHeight(height: number, opens: OpeningPart | null | undefined): number {
  return opens?.height === undefined ? height : Math.min(opens.height, height)
}

/**
 * The widths of a pair's two leaves, along the wall from the end it hangs its main leaf from:
 * the main leaf is the part that opens, when stated, and the pair is split in half when not.
 */
export function pairLeaves(width: number, opens: OpeningPart | null | undefined): readonly [number, number] {
  const main = opens === undefined || opens === null ? width / 2 : Math.min(opens.width, width)
  return [main, width - main]
}

/** How many panels a folding door of this width folds in: as few as keep each within `panel`, two at least. */
export function foldingPanels(width: number, panel: number): number {
  return Math.max(2, Math.ceil(width / panel - tolerance('relativeNoise')))
}

/** A kind in words, for a line, a schedule or a type's name: `sliding door`, `high-level window`. */
export function kindWords(type: 'door' | 'window', kind: OpeningKind | null): string {
  if (kind === null) return type
  const word = kind === 'single' && type === 'door' ? 'single-leaf' : kind === 'double' && type === 'door' ? 'double' : kind
  return `${word} ${type}`
}
