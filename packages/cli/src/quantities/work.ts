/**
 * ARE-79: `grid_measure what=work`, the measures of the work worded: how far the new parts reach
 * past the building's old outline, how high they stand, the floor and volume they add, the plot
 * left and how far they are from the boundary. The geometry is `workMeasures` in the core; the
 * floor added is `phaseAreas`, as `grid_areas state=both` gives it. Nothing here applies a rule
 * or says whether the work needs permission: every figure is a measure, said as one.
 */
import { planFacing, workMeasures, type FloorPlan, type WorkMeasures } from '@ongrid/floorplan/geometry'
import { english, joined, name, said, type Said } from '@ongrid/floorplan/messages'
import type { Display } from '@ongrid/floorplan/types/units'
import { northData, northLine } from './facing'
import { phaseAreas } from './phaseState'
import { percentText } from './site'
import { areaText, FT_PER_M, lengthText } from './units'

export const WORK_RULE = english(said('work.rule'))

export interface WorkAnswer {
  readonly lines: readonly string[]
  readonly data: Record<string, unknown>
}

const settle = (value: number): number => Number(value.toPrecision(12))
const round = (value: number | null): number | null => (value === null ? null : Math.round(settle(value * 1000)) / 1000 + 0)

/** A volume in cubic metres, or cubic feet on a plan shown in feet. */
export function volumeText(m3: number, display: Display): string {
  if (display.length === 'ft-in' || display.area === 'ft2') return `${Math.round(m3 * FT_PER_M ** 3)} ft³`
  return `${settle(Math.round(settle(m3 * 10)) / 10).toFixed(1)} m³`
}

/** The measures of the work on a plan as stated, its phases in it. */
export function workAnswer(stated: FloorPlan, display: Display): WorkAnswer {
  const work = workMeasures(stated)
  const facing = planFacing(stated)
  const L = (v: number): string => lengthText(v, display)
  const A = (v: number): string => areaText(v, display)
  const say = (value: Said): string => english(value)
  if (!work.phased) return { lines: [say(said('work.none'))], data: { measures: 'geometry', ruleApplied: false, phased: false } }
  const lines = [say(said('work.heading')), northLine(facing)]
  if (work.newRooms.length === 0 && work.newWalls.length === 0) lines.push(say(said('work.nothingNew')))
  else {
    if (work.depths.length === 0) lines.push(say(said('work.depth.none')))
    for (const d of work.depths) lines.push(say(said('work.depth', { depth: L(d.depth), faces: d.faces, across: L(d.across) })))
    const { before, after, added } = work.footprint
    if (before !== null && after !== null) lines.push(say(said('work.footprint', { added: A(added), before: A(before), after: A(after) })))
  }
  const table = phaseAreas(stated)
  const gross = table.grossExternal
  if (gross.existing !== null && gross.proposed !== null && gross.change !== null && table.net.change !== null) {
    lines.push(say(said('work.area', { gross: A(gross.change), before: A(gross.existing), after: A(gross.proposed), net: A(table.net.change) })))
  }
  lines.push(...heightLines(work, L))
  if (work.rooms.length > 0) {
    const rooms = work.rooms.map((r) => said('work.volume.room', { room: name(r.name), volume: volumeText(r.volume, display) }))
    lines.push(say(said('work.volume', { volume: volumeText(work.volume, display), rooms: joined(rooms, 'join.comma') })))
  }
  if (work.plot === null) lines.push(say(said('work.plot.none')))
  else {
    const p = work.plot
    lines.push(say(said('work.plot', { before: A(p.before), after: A(p.after), share: percentText(p.area === 0 ? 0 : p.after / p.area), plot: A(p.area) })))
    lines.push(say(said('work.edges.heading')))
    const known = (v: number | null): string => (v === null ? say(said('work.notKnown')) : L(v))
    for (const e of work.edges) {
      const values = { edge: e.name, before: known(e.before), after: known(e.after) }
      lines.push(`  ${say(e.added === null ? said('work.edge.noAdded', values) : said('work.edge', { ...values, added: L(e.added) }))}`)
    }
  }
  return { lines, data: workData(work, table, facing) }
}

function heightLines(work: WorkMeasures, L: (v: number) => string): string[] {
  const h = work.heights
  const lines: string[] = []
  if (h.wallsLowest !== null && h.wallsHighest !== null) {
    const one = h.walls.length === 1
    const same = L(h.wallsHighest) === L(h.wallsLowest)
    lines.push(english(same
      ? said(one ? 'work.walls.oneSame' : 'work.walls.same', { height: L(h.wallsHighest), count: h.walls.length })
      : said(one ? 'work.walls.one' : 'work.walls', { lowest: L(h.wallsLowest), highest: L(h.wallsHighest), count: h.walls.length })))
  }
  if (h.highest !== null) lines.push(english(said(h.underRoof ? 'work.highest.roof' : 'work.highest', { height: L(h.highest) })))
  return lines
}

function workData(work: WorkMeasures, table: ReturnType<typeof phaseAreas>, facing: ReturnType<typeof planFacing>): Record<string, unknown> {
  const change = (c: { existing: number | null; proposed: number | null; change: number | null }) => ({ existing: round(c.existing), proposed: round(c.proposed), change: round(c.change) })
  return {
    measures: 'geometry', ruleApplied: false,
    phased: true,
    ...northData(facing),
    newRooms: work.newRooms,
    newWalls: work.newWalls,
    footprint: { before: round(work.footprint.before), after: round(work.footprint.after), added: round(work.footprint.added) },
    depths: work.depths.map((d) => ({ faces: d.faces, direction: { x: round(d.direction.x), y: round(d.direction.y) }, depth: round(d.depth), across: round(d.across) })),
    area: { grossExternal: change(table.grossExternal), grossInternal: change(table.grossInternal), net: change(table.net) },
    heights: { wallsLowest: round(work.heights.wallsLowest), wallsHighest: round(work.heights.wallsHighest), walls: work.heights.walls, highest: round(work.heights.highest), underRoof: work.heights.underRoof },
    volume: round(work.volume),
    rooms: work.rooms.map((r) => ({ room: r.room, name: r.name, floor: r.floor, area: round(r.area), volume: round(r.volume), underRoof: r.underRoof })),
    plot: work.plot === null ? null : { area: round(work.plot.area), before: round(work.plot.before), after: round(work.plot.after) },
    edges: work.edges.map((e) => ({ edge: e.edge, name: e.name, faces: e.faces, added: round(e.added), before: round(e.before), after: round(e.after) })),
  }
}

