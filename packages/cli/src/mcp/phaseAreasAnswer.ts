/**
 * ARE-75: `grid_areas state=both`, the area table of the work: each room, use, floor and total
 * before the work (existing), after it (proposed) and the change, as text, data and CSV. The
 * figures are `quantities/phaseState.ts`'s; the words the message files'.
 */
import { PHASE_WORDS, planHasPhases, type FloorPlan } from '@ongrid/floorplan/geometry'
import { labelOfUse, name, said, type Speaker } from '@ongrid/floorplan/messages'
import type { Display } from '@ongrid/floorplan/types/units'
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'
import type { AreasRequest } from '../quantities/areas'
import { phaseAreas, type Change } from '../quantities/phaseState'
import { roomCalled } from '../quantities/survey'
import { areaText, csv, sqFt } from '../quantities/units'
import type { Answer } from './toolkit'

/** The table as grid_areas answers it. */
export function phaseAreasAnswer(stated: FloorPlan, request: AreasRequest, units: Display, asCsv: boolean, s: Speaker): Answer {
  const table = phaseAreas(stated, request)
  const rule = s.say('tool.areas.work.rule')
  const totals = { net: table.net, grossInternal: table.grossInternal, grossExternal: table.grossExternal }
  const data = { state: 'both', rooms: table.rooms, byUse: table.byUse, floors: table.floors, ...totals, phases: planHasPhases(stated), rule }
  if (asCsv) {
    const figures = (c: Change): (number | null)[] => [c.existing, c.proposed, c.change, c.change === null ? null : sqFt(c.change)]
    const rows: (string | number | null)[][] = [
      ...table.rooms.map((r) => ['room', r.floor, r.id, r.name, r.use ?? '', r.phase, ...figures(r)]),
      ...Object.entries(table.byUse).map(([use, c]) => ['use', 'all', '', use, use, '', ...figures(c)]),
      ...table.floors.map((f) => ['floor', f.floor, '', '', '', '', ...figures(f)]),
      ...(['net', 'grossInternal', 'grossExternal'] as const).map((m) => ['total', 'all', '', s.say(`tool.areas.work.${m}`), '', '', ...figures(totals[m])]),
    ]
    return { text: csv(['row', 'floor', 'id', 'name', 'use', 'phase', 'existing m2', 'proposed m2', 'change m2', 'change sq ft'], rows), data }
  }
  const area = (value: number | null): string => (value === null ? s.say('tool.areas.work.notKnown') : areaText(value, units))
  const change = (value: number | null): string =>
    value === null ? s.say('tool.areas.work.notKnown') : value === 0 ? s.say('tool.areas.work.same') : `${value > 0 ? '+' : '−'}${areaText(Math.abs(value), units)}`
  const row = (part: string, c: Change): string => `  ${s.say('tool.areas.work.row', { part, existing: area(c.existing), proposed: area(c.proposed), change: change(c.change) })}`
  const several = table.floors.length > 1
  const lines = [
    ...(planHasPhases(stated) ? [] : [s.say('tool.areas.work.noPhases')]),
    s.say('tool.areas.work.head'),
    ...table.rooms.map((r) => row(s.say('tool.areas.work.room', { room: name(several ? `${roomCalled(r)} (${r.floor})` : roomCalled(r)), phase: said(PHASE_WORDS[r.phase]) }), r)),
    s.say('tool.areas.work.byUse'),
    ...Object.entries(table.byUse).map(([use, c]) => row(s.language === 'en' ? use : labelOfUse(s.language, use as RoomUse), c)),
    ...(several ? [s.say('tool.areas.work.byFloor'), ...table.floors.map((f) => row(s.say('tool.areas.work.floor', { floor: name(f.floor) }), f))] : []),
    s.say('tool.areas.work.totals'),
    ...(['net', 'grossInternal', 'grossExternal'] as const).map((m) => row(s.say(`tool.areas.work.${m}`), totals[m])),
    rule,
  ]
  return { text: lines.join('\n'), data }
}
