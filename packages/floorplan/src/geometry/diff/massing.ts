/**
 * MSG-27: two versions compared by their massing and their site, which the walls, openings and
 * rooms say nothing of: each floor's outline (C17), the homes and parking spaces it states, the
 * plan's buildings (C23), the plot's boundary and the site's things (C13). Two options with other
 * blocks are never the same building, and a tree cut down is a change.
 *
 * The figures are given side by side, as the plans give them: the gross external area
 * (`planAreaFigures`), the plot coverage and each boundary edge's least distance to the building
 * (`siteMeasures`), the gross external area against the plot's area (the FAR), and the homes and
 * parking spaces stated.
 *
 * The earlier version is moved by the comparison's shift first, as its walls are, so a drawing
 * that only sits elsewhere is no change. Floors, buildings and things are paired by id.
 *
 * Pure: plans in, plain data out. The words are keys of the message files (`diff.massing.*`).
 */

import type { FloorPlan } from '../plan'
import type { SiteThing } from '../../types/floorplan'
import { planFloors } from '../floors'
import { planAreaFigures } from '../areas'
import { siteMeasures } from '../site'
import { areaText, metresText } from '../rounding'
import { tolerance } from '../tolerances'
import { area, centroid } from '../vec2'
import type { Vec2 } from '../vec2'
import { joined, name, num, said, type Said, type Value } from '../../messages/say'
import { compareText } from './order'
import type { EntityRef } from './types'

type Point = readonly [number, number]

/** A figure in each version; null where a version has none or it could not be measured. */
export interface MassingFigure {
  readonly before: number | null
  readonly after: number | null
}

/** Measured only when either version has an outline, homes, parking, buildings or a site; else every figure is null. */
export interface MassingFigures {
  /** Gross external area over every floor, m². */
  readonly grossExternal: MassingFigure
  /** The plot's area inside its boundary, m². */
  readonly plot: MassingFigure
  /** The building's footprint inside the boundary against the plot, from 0 to 1. */
  readonly coverage: MassingFigure
  /** The gross external area against the plot's area. */
  readonly far: MassingFigure
  /** The homes the floors state, added up; null when no floor of a version states any. */
  readonly homes: MassingFigure
  readonly parking: MassingFigure
  /** Each boundary edge's least distance to the building, by its number, when both versions have the edge. */
  readonly edges: readonly { readonly edge: number; readonly name: string; readonly before: number | null; readonly after: number | null }[]
}

export interface MassingLine {
  readonly said: Said
  /** The floors it is about, by later id; empty for the site. */
  readonly entities: readonly EntityRef[]
}

export interface MassingComparison {
  /** One line per change to the massing or the site, floors first, then buildings, the plot and its things. */
  readonly lines: readonly MassingLine[]
  readonly figures: MassingFigures
  /**
   * The figures that differ, side by side, as one sentence; null when either version has no
   * massing or site to measure, or no figure differs.
   */
  readonly sideBySide: Said | null
}

const moved = (p: Point, shift: Point): Vec2 => ({ x: p[0] + shift[0], y: p[1] + shift[1] })

/** "4.00 m west and 1.00 m north", by the sides of the drawing. */
function wayWords(dx: number, dy: number): Value {
  const least = tolerance('diffMovement')
  const parts: Value[] = []
  if (Math.abs(dx) >= least) parts.push(said(dx > 0 ? 'diff.massing.east' : 'diff.massing.west', { distance: num(metresText(Math.abs(dx))) }))
  if (Math.abs(dy) >= least) parts.push(said(dy > 0 ? 'diff.massing.north' : 'diff.massing.south', { distance: num(metresText(Math.abs(dy))) }))
  return joined(parts, 'join.comma', 'join.and')
}

/** The same corners, in the same order round either way, each within `diffPlace`. */
function sameShape(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  const near = tolerance('diffPlace')
  const close = (p: Vec2, q: Vec2): boolean => Math.hypot(p.x - q.x, p.y - q.y) <= near
  const n = a.length
  for (const step of [1, -1]) {
    for (let start = 0; start < n; start++) {
      let all = true
      for (let i = 0; i < n && all; i++) all = close(a[i]!, b[(((start + step * i) % n) + n) % n]!)
      if (all) return true
    }
  }
  return false
}

function stated(value: number | null): Value {
  return value === null ? said('diff.floor.notStated') : value
}

/** A figure that differs as it is written: one known and the other not, or the two written apart. */
function differs(f: MassingFigure, write: (v: number) => string): boolean {
  if (f.before === null || f.after === null) return f.before !== f.after
  return write(f.before) !== write(f.after)
}

function thingPlace(thing: SiteThing, shift: Point): Vec2 | null {
  if (thing.at !== undefined) return moved(thing.at, shift)
  const points = (thing.points ?? []).map((p) => moved(p, shift))
  if (points.length === 0) return null
  return { x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length }
}

function figuresOf(plan: FloorPlan): { grossExternal: number | null; plot: number | null; coverage: number | null; homes: number | null; parking: number | null; edges: Map<number, { name: string; distance: number }> } {
  const floors = safe(() => planFloors(plan), [])
  const sum = (key: 'homes' | 'parking'): number | null => (floors.some((f) => f[key] !== undefined) ? floors.reduce((n, f) => n + (f[key] ?? 0), 0) : null)
  const areas = safe(() => planAreaFigures(plan), null)
  const site = safe(() => siteMeasures(plan), null)
  const boundary = site?.boundary ?? null
  const plot = boundary === null || boundary.problem !== null ? null : boundary.area
  const edges = new Map<number, { name: string; distance: number }>()
  for (const at of site?.edges ?? []) edges.set(at.edge.edge, { name: at.edge.name, distance: at.distance })
  return { grossExternal: areas?.grossExternal.area ?? null, plot, coverage: site?.coverage ?? null, homes: sum('homes'), parking: sum('parking'), edges }
}

const NOTHING_MEASURED: ReturnType<typeof figuresOf> = { grossExternal: null, plot: null, coverage: null, homes: null, parking: null, edges: new Map() }

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

/** Whether a plan has any massing or site to measure: an outline, homes, parking, buildings or a site. */
function hasMassing(plan: FloorPlan): boolean {
  const floors = safe(() => planFloors(plan), [])
  return floors.some((f) => f.outline !== undefined || f.homes !== undefined || f.parking !== undefined) || (plan.buildings ?? []).length > 0 || plan.site?.boundary !== undefined || (plan.site?.things ?? []).length > 0
}

/** The massing and the site of `earlier`, moved by `shift`, against `later`'s. */
export function compareMassing(earlier: FloorPlan, later: FloorPlan, shift: Point = [0, 0]): MassingComparison {
  const lines: MassingLine[] = []
  const near = tolerance('diffPlace')
  const areaSlack = tolerance('areaReported')
  const least = tolerance('diffMovement')

  // Each floor in both versions: its outline, homes and parking.
  const floorsBefore = new Map(safe(() => planFloors(earlier), []).map((f) => [f.id, f] as const))
  for (const floor of safe(() => planFloors(later), [])) {
    const was = floorsBefore.get(floor.id)
    if (was === undefined) continue
    const entities: EntityRef[] = [{ type: 'floor', id: floor.id }]
    const label = name(floor.name || floor.id)
    const a = was.outline?.map((p) => moved(p, shift)) ?? null
    const b = floor.outline?.map((p) => ({ x: p[0], y: p[1] })) ?? null
    if (a === null && b !== null) lines.push({ said: said('diff.massing.outline.added', { floor: label, area: num(areaText(Math.abs(area(b)))) }), entities })
    else if (a !== null && b === null) lines.push({ said: said('diff.massing.outline.removed', { floor: label, area: num(areaText(Math.abs(area(a)))) }), entities })
    else if (a !== null && b !== null && !sameShape(a, b)) {
      const before = Math.abs(area(a))
      const after = Math.abs(area(b))
      const ca = centroid(a)
      const cb = centroid(b)
      const go = Math.hypot(cb.x - ca.x, cb.y - ca.y) >= Math.max(least, near)
      const values = { floor: label, before: num(areaText(before)), after: num(areaText(after)), by: wayWords(cb.x - ca.x, cb.y - ca.y) }
      const grew = Math.abs(after - before) > areaSlack
      lines.push({ said: said(grew ? (go ? 'diff.massing.outline.changedMoved' : 'diff.massing.outline.changed') : go ? 'diff.massing.outline.moved' : 'diff.massing.outline.reshaped', values), entities })
    }
    for (const key of ['homes', 'parking'] as const) {
      const before = was[key] ?? null
      const after = floor[key] ?? null
      if (before !== after) lines.push({ said: said(key === 'homes' ? 'diff.massing.homes' : 'diff.massing.parking', { floor: label, before: stated(before), after: stated(after) }), entities })
    }
  }

  // The buildings, by id.
  const floorList = (floors: readonly string[]): Value => joined(floors.map((f) => name(f)), 'join.comma', 'join.and')
  const buildingsBefore = new Map((earlier.buildings ?? []).map((b) => [b.id, b] as const))
  const buildingsAfter = new Map((later.buildings ?? []).map((b) => [b.id, b] as const))
  for (const building of later.buildings ?? []) {
    const was = buildingsBefore.get(building.id)
    const label = name(building.name || building.id)
    if (was === undefined) {
      lines.push({ said: said('diff.massing.building.added', { building: label, floors: floorList(building.floors) }), entities: [] })
      continue
    }
    if ((was.name ?? '') !== (building.name ?? '')) lines.push({ said: said('diff.massing.building.renamed', { building: name(was.name || was.id), name: label }), entities: [] })
    const sorted = (f: readonly string[]): string => [...f].sort(compareText).join('\u0000')
    if (sorted(was.floors) !== sorted(building.floors)) lines.push({ said: said('diff.massing.building.floors', { building: label, before: floorList(was.floors), after: floorList(building.floors) }), entities: [] })
  }
  for (const building of earlier.buildings ?? []) {
    if (!buildingsAfter.has(building.id)) lines.push({ said: said('diff.massing.building.removed', { building: name(building.name || building.id), floors: floorList(building.floors) }), entities: [] })
  }

  // The plot's boundary.
  const boundaryBefore = earlier.site?.boundary?.map((p) => moved(p, shift)) ?? null
  const boundaryAfter = later.site?.boundary?.map((p) => ({ x: p[0], y: p[1] })) ?? null
  if (boundaryBefore === null && boundaryAfter !== null) lines.push({ said: said('diff.massing.boundary.added', { area: num(areaText(Math.abs(area(boundaryAfter)))) }), entities: [] })
  else if (boundaryBefore !== null && boundaryAfter === null) lines.push({ said: said('diff.massing.boundary.removed', { area: num(areaText(Math.abs(area(boundaryBefore)))) }), entities: [] })
  else if (boundaryBefore !== null && boundaryAfter !== null && !sameShape(boundaryBefore, boundaryAfter)) {
    lines.push({ said: said('diff.massing.boundary.changed', { before: num(areaText(Math.abs(area(boundaryBefore)))), after: num(areaText(Math.abs(area(boundaryAfter)))) }), entities: [] })
  }

  // The site's things, by id.
  const thingsBefore = new Map((earlier.site?.things ?? []).map((t) => [t.id, t] as const))
  const thingsAfter = new Map((later.site?.things ?? []).map((t) => [t.id, t] as const))
  const kindOf = (thing: SiteThing): Said => said(`diff.massing.kind.${thing.kind}`)
  for (const thing of later.site?.things ?? []) {
    const was = thingsBefore.get(thing.id)
    const values = { kind: kindOf(thing), thing: name(thing.label || thing.id) }
    if (was === undefined) {
      lines.push({ said: said('diff.massing.thing.added', values), entities: [] })
      continue
    }
    const from = thingPlace(was, shift)
    const to = thingPlace(thing, [0, 0])
    const go = from !== null && to !== null && Math.hypot(to.x - from.x, to.y - from.y) >= Math.max(least, near)
    const pointsOf = (t: SiteThing, by: Point): Vec2[] => (t.points ?? []).map((p) => moved(p, by))
    const sized = was.kind !== thing.kind || (was.width ?? null) !== (thing.width ?? null) || (was.canopy ?? null) !== (thing.canopy ?? null) || (was.height ?? null) !== (thing.height ?? null)
    const reshaped = !go && !sameShape(pointsOf(was, shift), pointsOf(thing, [0, 0]))
    if (go) lines.push({ said: said('diff.massing.thing.moved', { ...values, by: wayWords(to!.x - from!.x, to!.y - from!.y) }), entities: [] })
    if (sized || reshaped) lines.push({ said: said('diff.massing.thing.changed', values), entities: [] })
  }
  for (const thing of earlier.site?.things ?? []) {
    if (!thingsAfter.has(thing.id)) lines.push({ said: said('diff.massing.thing.removed', { kind: kindOf(thing), thing: name(thing.label || thing.id) }), entities: [] })
  }

  // The figures, side by side: measured only when a version has massing or a site to measure.
  const measured = hasMassing(earlier) || hasMassing(later)
  const a = measured ? figuresOf(earlier) : NOTHING_MEASURED
  const b = measured ? figuresOf(later) : NOTHING_MEASURED
  const ratio = (gea: number | null, plot: number | null): number | null => (gea === null || plot === null || plot <= 0 ? null : gea / plot)
  const edges = [...b.edges].filter(([edge]) => a.edges.has(edge)).sort(([x], [y]) => x - y).map(([edge, at]) => ({ edge, name: at.name, before: a.edges.get(edge)!.distance, after: at.distance }))
  const figures: MassingFigures = {
    grossExternal: { before: a.grossExternal, after: b.grossExternal },
    plot: { before: a.plot, after: b.plot },
    coverage: { before: a.coverage, after: b.coverage },
    far: { before: ratio(a.grossExternal, a.plot), after: ratio(b.grossExternal, b.plot) },
    homes: { before: a.homes, after: b.homes },
    parking: { before: a.parking, after: b.parking },
    edges
  }

  let sideBySide: Said | null = null
  if (measured) {
    const figure = (value: number | null, write: (v: number) => string): Value => (value === null ? said('diff.massing.figure.unknown') : num(write(value)))
    const percent = (v: number): string => {
      const tenths = Math.round(v * 1000) / 10
      return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1)
    }
    const parts: Value[] = []
    const pair = (f: MassingFigure, write: (v: number) => string) => ({ before: figure(f.before, write), after: figure(f.after, write) })
    if (differs(figures.grossExternal, areaText)) parts.push(said('diff.massing.figure.gea', pair(figures.grossExternal, areaText)))
    if (differs(figures.coverage, percent)) parts.push(said('diff.massing.figure.coverage', pair(figures.coverage, percent)))
    if (differs(figures.far, (v) => v.toFixed(2))) parts.push(said('diff.massing.figure.far', pair(figures.far, (v) => v.toFixed(2))))
    if (differs(figures.homes, String)) parts.push(said('diff.massing.figure.homes', { before: stated(figures.homes.before), after: stated(figures.homes.after) }))
    if (differs(figures.parking, String)) parts.push(said('diff.massing.figure.parking', { before: stated(figures.parking.before), after: stated(figures.parking.after) }))
    for (const edge of edges) if (differs(edge, metresText)) parts.push(said('diff.massing.figure.edge', { edge: edge.edge, name: name(edge.name), ...pair(edge, metresText) }))
    if (parts.length > 0) sideBySide = said('diff.massing.figures', { figures: joined(parts, 'join.semicolon', 'join.semicolon') })
  }
  return { lines, figures, sideBySide }
}
