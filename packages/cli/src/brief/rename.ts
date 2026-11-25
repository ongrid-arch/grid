/**
 * WRT-59: a room renamed is renamed in the brief's wishes that name it, as a wish names a room by
 * its name: a wish about one room, a pair that must touch, a turning circle for some rooms. Without
 * it every such wish would read as missed after the rename, a room it no longer finds.
 *
 * A wish is changed only when it names the old name whole (case and spaces aside) and no room of
 * the plan now still has that name. A wish for a stem (`Bathroom` for `Bathroom 1`) is left as it is.
 */
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { quoted, type Project } from '../fs/projectFiles'
import { BriefRefused, readBrief, writeBrief, type Brief } from './brief'

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The brief with `renames` ([old, new]) applied, and how many wishes changed. */
export function renamedBrief(brief: Brief, renames: readonly (readonly [string, string])[], plan: FloorPlan): { readonly brief: Brief; readonly changed: number } {
  const live = renames.filter(([from]) => !plan.rooms.some((room) => same(room.name, from)))
  let changed = 0
  const swap = (name: string): string => {
    const found = live.find(([from]) => same(from, name))
    if (found === undefined) return name
    changed += 1
    return found[1]
  }
  return {
    brief: {
      ...brief,
      rooms: brief.rooms.map((wish) => (wish.name === null ? wish : { ...wish, name: swap(wish.name) })),
      touch: brief.touch.map((wish) => ({ ...wish, rooms: [swap(wish.rooms[0]), swap(wish.rooms[1])] as const })),
      figures: brief.figures.map((wish) => ({ ...wish, rooms: wish.rooms.map(swap) })),
    },
    changed,
  }
}

/**
 * Writes the brief beside the plan with the renames applied. Null when there is no brief, it
 * cannot be read or written, or no wish names a renamed room: a rename never fails on its brief.
 */
export function renameInBrief(project: Project, planFile: string, renames: readonly (readonly [string, string])[], plan: FloorPlan): { readonly line: string | null } | null {
  try {
    const read = readBrief(project, planFile)
    if (read.brief === null) return null
    const { brief, changed } = renamedBrief(read.brief, renames, plan)
    if (changed === 0) return null
    writeBrief(project, planFile, brief)
    const names = renames.map(([from, to]) => `${quoted(from)} → ${quoted(to)}`).join(', ')
    return { line: `The brief's ${changed === 1 ? 'wish' : `${changed} wishes`} about ${renames.length === 1 ? 'the renamed room follow' + (changed === 1 ? 's' : '') + ' it' : 'the renamed rooms follow them'}: ${names}.` }
  } catch (error) {
    if (error instanceof BriefRefused || (error as { name?: string }).name === 'PathRefused') return null
    throw error
  }
}
