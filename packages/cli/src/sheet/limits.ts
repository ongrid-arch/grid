/**
 * SHT-13: the note under a drawing that says what the drawing leaves out. It lists only what the
 * floor really leaves out: furniture drawn, structure drawn or stairs drawn are not listed.
 * Services and landscape are never drawn, so they are always there.
 */
import { columnsOnFloor, gridsOn, itemKindDefinition } from '@ongrid/floorplan/geometry'
import { floorOf } from '@ongrid/floorplan/geometry/floors'
import { joined, say, type Language, type MessageKey } from '@ongrid/floorplan/messages'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'

/**
 * The note for one floor's drawing. `stairsDrawn` is plan-wide (a stair joins floors), as the
 * caller knows it from the plan's connections.
 */
export function notShownNote(plan: FloorPlan, floorId: string, stairsDrawn: boolean, language: Language): string {
  const furniture = (plan.items ?? []).some((item) => floorOf(item) === floorId && itemKindDefinition(item.kind)?.group === 'furniture')
  const structure = columnsOnFloor(plan, floorId).length > 0 || gridsOn(plan, floorId).length > 0
  const left: MessageKey[] = [
    ...(furniture ? [] : ['sheet.limits.furniture' as const]),
    ...(stairsDrawn ? [] : ['sheet.limits.stairs' as const]),
    ...(structure ? [] : ['sheet.limits.structure' as const]),
    'sheet.limits.services',
    'sheet.limits.landscape',
  ]
  return say(language, 'sheet.limits', { left: joined(left.map((key) => ({ key })), 'join.comma', 'join.and') })
}
