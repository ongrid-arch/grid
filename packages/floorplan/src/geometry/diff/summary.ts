/**
 * One plain-English line per change, from a fixed template.
 *
 * Every word comes from the computed properties and the plan's own names. The
 * assistant never writes one, so a summary cannot claim what did not happen.
 * Lengths are in metres to two decimals; there are no compass words, because
 * the model has no north.
 */

import type { FloorPlan } from '../plan'
import { planFloors } from '../floors'
import { fixedText, metresText } from '../rounding'
import { quoted } from '../../types/planText'
import type { PlanChange, PropChange, WallMotion } from './types'
import type { Phase } from '../../types/floorplan'
import { PHASE_WORDS } from '../phases'
import { english, said } from '../../messages/say'
import { curveChangeSaid, curveFigures } from './curves'
import { partTypeSaid } from './typesAndFinishes'

/** MSG-25: a part's phase change in words, "now to be demolished (was existing)". */
export function phaseWords(before: Phase, after: Phase): string {
  return english(said('diff.phase.changed', { phase: said(PHASE_WORDS[after]), before: said(PHASE_WORDS[before]) }))
}

function metres(value: number): string {
  // A distance, so without its sign; the rounding is the core's one way (ARE-7).
  return metresText(Math.abs(value))
}

function degrees(value: number): string {
  return fixedText(Math.abs(value), 1).replace(/\.0$/, '')
}

function text(value: unknown): string {
  return String(value)
}

function prop(change: PlanChange, key: string): PropChange | undefined {
  return change.props.find((p) => p.key === key)
}

function range(p: PropChange): string {
  return `${metres(Number(p.before))} → ${metres(Number(p.after))} m`
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function motionPart(motion: WallMotion): string {
  switch (motion.kind) {
    case 'translated':
      return `moved ${metres(Math.hypot(motion.normalDistance, motion.axialDistance))} m`
    case 'resized':
      return motion.lengthDelta >= 0
        ? `extended ${metres(motion.lengthDelta)} m`
        : `shortened ${metres(motion.lengthDelta)} m`
    case 'rotated':
      return `rotated ${degrees(motion.angleDeg)}° ${motion.angleDeg >= 0 ? 'counter-clockwise' : 'clockwise'}`
    case 'reshaped':
      return 'reshaped'
  }
}

export interface Summarizer {
  (change: PlanChange): string
}

/** Looks names up in the plans the change came from, once. */
export function makeSummarizer(base: FloorPlan, head: FloorPlan): Summarizer {
  const floorNames = new Map<string, string>()
  for (const floor of [...planFloors(base), ...planFloors(head)]) {
    floorNames.set(floor.id, floor.name)
  }
  const floorName = (id: string): string => floorNames.get(id) ?? id

  // The later type wins: a door turned into a window is a window now.
  const openingType = new Map<string, string>()
  for (const opening of [...base.openings, ...head.openings]) {
    openingType.set(opening.id, opening.type)
  }
  const headRooms = new Map(head.rooms.map((r) => [r.id, r.name || r.id] as const))
  const baseRooms = new Map(base.rooms.map((r) => [r.id, r.name || r.id] as const))
  const baseFloors = new Map(planFloors(base).map((f) => [f.id, f.name] as const))
  const headFloors = new Map(planFloors(head).map((f) => [f.id, f.name] as const))

  // MSG-26: a curved wall's radius, from its ends and its centre, in each version.
  const radiusOf = (plan: FloorPlan): Map<string, number> =>
    new Map(plan.walls.flatMap((w) => (w.arc === undefined ? [] : [[w.id, Math.hypot(w.start[0] - w.arc.centre[0], w.start[1] - w.arc.centre[1])] as const])))
  const radiusBefore = radiusOf(base)
  const radiusAfter = radiusOf(head)
  // WRT-86: each version's walls, for a curve's figures before and after.
  const baseWalls = new Map(base.walls.map((w) => [w.id, w] as const))
  const headWalls = new Map(head.walls.map((w) => [w.id, w] as const))

  const wallSummary = (change: PlanChange): string => {
    if (change.kind !== 'modified') return `Wall ${change.kind}`
    const parts: string[] = []
    const was = radiusBefore.get(change.entity.id)
    const is = radiusAfter.get(change.entity.id)
    const radius = was !== undefined && is !== undefined && metresText(was) !== metresText(is) ? { key: 'radius', before: was, after: is } : null
    // WRT-86: a curve that changed is said by its figures before and after, its radius among them.
    const arc = prop(change, 'arc')
    const before = baseWalls.get(change.entity.id)
    const after = headWalls.get(change.entity.id)
    const curve = arc && before !== undefined && after !== undefined ? curveChangeSaid(curveFigures(before), curveFigures(after)) : null
    // A curve whose radius changed is said by its radius, not as reshaped.
    if (change.motion && !((radius !== null || curve !== null) && change.motion.kind === 'reshaped')) parts.push(motionPart(change.motion))
    if (radius && curve === null) parts.push(`radius ${range(radius)}`)
    const thickness = prop(change, 'thickness')
    if (thickness) parts.push(`thickness ${range(thickness)}`)
    const height = prop(change, 'height')
    if (height) parts.push(`height ${range(height)}`)
    const kind = prop(change, 'kind')
    if (kind) parts.push(`kind ${text(kind.before)} → ${text(kind.after)}`)
    const virtual = prop(change, 'virtual')
    if (virtual) parts.push(virtual.after === true ? 'made virtual' : 'made solid')
    const floor = prop(change, 'floor')
    if (floor) parts.push(`moved to ${quoted(floorName(text(floor.after)))}`)
    // CNT-18: a wall made curved, made straight, or curved another way; WRT-86: with its figures.
    if (curve !== null) parts.push(english(curve))
    else if (arc) parts.push(arc.before === null ? 'made curved' : arc.after === null ? 'made straight' : 'curve changed')
    // WRT-86: the type it takes, by the types' names.
    const wallType = prop(change, 'wallType')
    const typeSaid = wallType ? partTypeSaid(base, head, 'walls', (wallType.before ?? undefined) as string | undefined, (wallType.after ?? undefined) as string | undefined) : null
    if (typeSaid !== null) parts.push(english(typeSaid))
    const phase = prop(change, 'phase')
    if (phase) parts.push(phaseWords(phase.before as Phase, phase.after as Phase))
    return `Wall ${parts.join('; ')}`
  }

  const openingSummary = (change: PlanChange): string => {
    const noun = capitalise(openingType.get(change.entity.id) ?? 'opening')
    if (change.kind !== 'modified') return `${noun} ${change.kind}`
    if (change.derived) return `${noun} moved with its wall`

    const parts: string[] = []
    const type = prop(change, 'type')
    if (type) parts.push(`changed from ${text(type.before)}`)
    const wall = prop(change, 'wall')
    if (wall) parts.push('moved to another wall')
    // MSG-28: a distance along two different walls means nothing.
    const offset = wall ? undefined : prop(change, 'offset')
    if (offset) {
      parts.push(`moved ${metres(Number(offset.after) - Number(offset.before))} m along its wall`)
    }
    const width = prop(change, 'width')
    if (width) {
      parts.push(`${Number(width.after) >= Number(width.before) ? 'widened' : 'narrowed'} ${range(width)}`)
    }
    const sill = prop(change, 'sill')
    if (sill) parts.push(`sill ${range(sill)}`)
    const height = prop(change, 'height')
    if (height) parts.push(`height ${range(height)}`)
    // WRT-86: the door or window type it takes, by the types' names.
    for (const [key, list] of [['doorType', 'doors'], ['windowType', 'windows']] as const) {
      const type = prop(change, key)
      const typeSaid = type ? partTypeSaid(base, head, list, (type.before ?? undefined) as string | undefined, (type.after ?? undefined) as string | undefined) : null
      if (typeSaid !== null) parts.push(english(typeSaid))
    }
    const phase = prop(change, 'phase')
    if (phase) parts.push(phaseWords(phase.before as Phase, phase.after as Phase))
    return `${noun} ${parts.join('; ')}`
  }

  const roomSummary = (change: PlanChange): string => {
    const id = change.entity.id
    if (change.kind === 'added') return `Room added: ${quoted(headRooms.get(id) ?? id)}`
    if (change.kind === 'removed') return `Room removed: ${quoted(baseRooms.get(id) ?? id)}`
    if (change.derived) return `${quoted(headRooms.get(id) ?? id)} changed with its walls`
    const name = prop(change, 'name')
    const subject = quoted(name ? text(name.before) : (headRooms.get(id) ?? id))
    const parts: string[] = []
    if (name) parts.push(`renamed to ${quoted(text(name.after))}`)
    if (prop(change, 'boundary')) parts.push('walls changed')
    // ARE-6: the walls round its holes.
    if (prop(change, 'holes')) parts.push('holes changed')
    const floor = prop(change, 'floor')
    if (floor) parts.push(`moved to ${quoted(floorName(text(floor.after)))}`)
    // ARE-10: a room's own height, which it may leave unstated.
    const height = prop(change, 'height')
    if (height) {
      const said = (value: unknown): string => (value === null ? 'not stated' : `${metres(Number(value))} m`)
      parts.push(`height ${said(height.before)} → ${said(height.after)}`)
    }
    // LVL-7: how far its floor stands off its storey's, 0 when unstated.
    const floorOffset = prop(change, 'floorOffset')
    if (floorOffset) parts.push(`floor offset ${metres(Number(floorOffset.before))} → ${metres(Number(floorOffset.after))} m`)
    const phase = prop(change, 'phase')
    if (phase) parts.push(phaseWords(phase.before as Phase, phase.after as Phase))
    return `${subject} ${parts.join('; ')}`
  }

  const floorSummary = (change: PlanChange): string => {
    const id = change.entity.id
    if (change.kind === 'added') return `Floor added: ${quoted(headFloors.get(id) ?? id)}`
    if (change.kind === 'removed') return `Floor removed: ${quoted(baseFloors.get(id) ?? id)}`

    const name = prop(change, 'name')
    const subject = quoted(name ? text(name.before) : (headFloors.get(id) ?? id))
    const parts: string[] = []
    if (name) parts.push(`renamed to ${quoted(text(name.after))}`)
    const level = prop(change, 'level')
    if (level) parts.push(`level ${text(level.before)} → ${text(level.after)}`)
    // LVL-1: what a floor states about where it stands and how high it is.
    const stated = (value: unknown): string => (value === null ? 'not stated' : `${text(value)} m`)
    for (const key of ['elevation', 'height', 'slab'] as const) {
      const found = prop(change, key)
      if (found) parts.push(`${key} ${stated(found.before)} → ${stated(found.after)}`)
    }
    return `${subject} ${parts.join('; ')}`
  }

  return (change) => {
    switch (change.entity.type) {
      case 'wall':
        return wallSummary(change)
      case 'opening':
        return openingSummary(change)
      case 'room':
        return roomSummary(change)
      case 'floor':
        return floorSummary(change)
    }
  }
}
