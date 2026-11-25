/**
 * ARE-27: the one door width a person's figure is set against. The brief's `door_width`
 * (`brief/lines.ts`) and the access measure (`access.ts`) both read a door here, so the same door
 * never gets two verdicts. The width is the core's (`doorwayClearance`): each leaf with its own
 * clear width, a pair judged by its active leaf or by both leaves opened together, and the
 * allowance for an open leaf by the door's kind.
 *
 * A figure is for one of three widths, as the brief says (`measure`): `clear`, the default, what
 * the open door leaves clear; `leaf`, the width of the leaf or leaves it opens by; `hole`, the
 * hole in the wall. Every answer names the one it measured.
 *
 * Pure: a survey in, widths out.
 */
import { doorwayClearance, tolerance, type DoorwayClearance } from '@ongrid/floorplan/geometry'
import { say } from '@ongrid/floorplan/messages'
import type { Survey } from './survey'
import { fixturesOf } from './use'

/** The widths a door figure may be for, the default first. */
export const DOOR_MEASURES = ['clear', 'leaf', 'hole'] as const
export type DoorMeasure = (typeof DOOR_MEASURES)[number]

const byMeasure = (key: 'name' | 'rule'): Readonly<Record<DoorMeasure, string>> =>
  Object.fromEntries(DOOR_MEASURES.map((m) => [m, say('en', `door.measure.${key}.${m}`)])) as Record<DoorMeasure, string>

/** Each width's name in a line (MSG-11: `door.measure.name.*`). */
export const DOOR_MEASURE_NAMES = byMeasure('name')

/** How each width is measured, in a line (`door.measure.rule.*`). */
export const DOOR_MEASURE_RULES = byMeasure('rule')

const cache = new WeakMap<Survey, Map<string, DoorwayClearance | null>>()

/** A door's or doorless opening's clearance on the survey's plan, by id; null for a window or a part the plan does not hold. */
export function doorClearanceOf(survey: Survey, id: string): DoorwayClearance | null {
  let known = cache.get(survey)
  if (known === undefined) {
    known = new Map()
    cache.set(survey, known)
  }
  if (known.has(id)) return known.get(id)!
  const opening = survey.plan.openings.find((o) => o.id === id)
  const facts = survey.facts.openings.get(id)
  const wall = opening && survey.plan.walls.find((w) => w.id === opening.wall)
  const found = !opening || !wall || !facts || opening.type === 'window' ? null : doorwayClearance(wall, opening, fixturesOf(survey).obstacles(facts.floor))
  known.set(id, found)
  return found
}

/** The width a figure for `measure` is set against. */
export function doorWidthFor(d: DoorwayClearance, measure: DoorMeasure): number {
  if (measure === 'hole' || d.leaves.length === 0) return measure === 'clear' ? d.clear : d.hole
  if (measure === 'clear') return d.clear
  return d.leaves.filter((l) => l.active).reduce((sum, l) => sum + l.width, 0)
}

/** A door's leaves in a few words, when it has more than one or opens by a part, each with its clear width and how the door is judged. Empty for a door of one whole leaf. */
export function doorLeavesSaid(d: Pick<DoorwayClearance, 'hole' | 'leaves' | 'judgedBy'>, L: (metres: number) => string): string {
  if (d.leaves.length === 0) return ''
  if (d.leaves.length === 1 && Math.abs(d.leaves[0]!.width - d.hole) < tolerance('lengthEqual')) return ''
  const each = d.leaves.map((l) => say('en', 'door.leaf', { width: L(l.width), state: say('en', l.active ? 'door.leaf.opens' : 'door.leaf.shut'), clear: L(l.clear) })).join('; ')
  const how = say('en', d.judgedBy === 'pair' ? 'door.leaves.pair' : d.leaves.length === 1 ? 'door.leaves.part' : 'door.leaves.active')
  return say('en', d.leaves.length === 1 ? 'door.leaves.one' : 'door.leaves.many', { each, how })
}
