/**
 * ARE-73: activity zones in front of fixtures, per kind. A zone is a box on a fixture's centre
 * line, from its front out: as deep as its front figure and as wide as its width figure, the
 * width shared either side of the centre line. Each figure is the person's (for every kind, or
 * per kind), else the item's own clearance, else the first library entry of its kind, else Grid's
 * own indicator (`useClearSpace`), and the answer says whose. The kinds are the registry's, so a
 * kind added later needs nothing here.
 *
 * Each zone is measured by rays: sideways from points on the centre line within its depth (the
 * clear width either side), then straight out from points along the front across the part of
 * the width that is clear (the clear depth), to the room's outline, its holes and the other
 * fixtures. What stands in a zone, the doors whose swing reaches into it and the zones it
 * overlaps are named. Units standing side by side with one front, of kinds that keep no floor at
 * their sides (`sides: false`, such as a kitchen run), are one run with one zone.
 *
 * Pure: a survey in, zones out. The sentences are the message files' (`activity.*`).
 */
import {
  add,
  bearingOf,
  compassPoint,
  cross,
  doorSweeps,
  dot,
  floorOf,
  isPointKind,
  itemFootprint,
  itemKindDefinition,
  itemNameSaid,
  length,
  liesUnderfoot,
  limit,
  openingChord,
  planOrientation,
  pointInPolygon,
  scale,
  signedArea,
  sub,
  tolerance,
  vec,
  type CompassPoint,
  type FloorPlan,
  type Item,
  type PlanOpening,
  type Vec2,
} from '@ongrid/floorplan/geometry'
import { planLibrary } from '@ongrid/floorplan/library'
import { english, joined, name, said, type Said, type Value } from '@ongrid/floorplan/messages'
import { fixturesOf } from './use'
import { roomCalled, type Survey, type SurveyRoom } from './survey'

/** A zone's figures for one kind, as the person gives them; either may be left out. */
export interface KindFigure {
  readonly front?: number
  readonly width?: number
}

export interface ActivityAsk {
  /** One room only (its whole room, for a zone of one), else every room. */
  readonly room?: string
  /** The front figure for every kind the person names none for. */
  readonly clearance?: number
  /** The width figure for every kind the person names none for. */
  readonly width?: number
  /** Figures by kind; a kind named here gets a zone whatever its group. */
  readonly perKind?: Readonly<Record<string, KindFigure>>
  /** List every zone, not only those short, with something in them or overlapping. */
  readonly all?: boolean
}

/** Whose a zone's figure is. */
export type ZoneFrom = 'person' | 'item' | 'library' | 'grid'

export interface ZoneFigure {
  readonly front: number
  readonly width: number
  readonly from: ZoneFrom
  /** The library entry it came from, for `library`. */
  readonly entry?: string
  /** True when the width is the person's; else it is the fixture's (or the run's) own width. */
  readonly widthGiven: boolean
}

export interface ActivityZone {
  /** The fixture, or the units of the run, by id, in plan order. */
  readonly items: readonly string[]
  readonly room: string
  readonly floor: string
  /** Where the centre line meets the front. */
  readonly at: Vec2
  readonly figure: ZoneFigure
  /** The clear floor straight out over the clear part of its width, and to each side of its centre line within its depth; null when nothing bounds it there. */
  readonly measured: { readonly front: number | null; readonly left: number | null; readonly right: number | null }
  /** The clear floor straight out over its whole width, a point of it not on free floor read as 0: what a firm's figure with a width is set against. */
  readonly band: number | null
  /** The way each faces, by the plan's north (the top of the drawing when it states none). */
  readonly ways: { readonly front: CompassPoint; readonly left: CompassPoint; readonly right: CompassPoint }
  /** Which of front, left and right are short of the figure. */
  readonly short: readonly ('front' | 'left' | 'right')[]
  /** Other fixtures standing in it. */
  readonly standing: readonly string[]
  /** Doors whose swing reaches into it. */
  readonly doors: readonly string[]
  /** The first unit of each other zone it overlaps. */
  readonly overlaps: readonly string[]
  /** The zone's corners. */
  readonly outline: readonly Vec2[]
}

export interface Activity {
  readonly zones: readonly ActivityZone[]
  /** Fixtures that would have a zone but stand in no room. */
  readonly noRoom: number
  /** Doors whose swing could not be measured: their kind swings and the plan states none. */
  readonly noSwing: number
  /** Fixtures and door swings measured clear of, on the floors measured. */
  readonly fixtures: number
  readonly doors: number
  readonly northStated: boolean
}

type Length = (metres: number) => string

const unit = (v: Vec2): Vec2 => scale(v, 1 / length(v))

/** The distance along a ray from `origin` in `dir` (unit) to the segment, or null when it misses. */
function rayHits(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number | null {
  const edge = sub(b, a)
  const denom = cross(dir, edge)
  if (Math.abs(denom) < tolerance('parallel')) return null
  const w = sub(a, origin)
  const t = cross(w, edge) / denom
  const s = cross(w, dir) / denom
  if (t < 0 || s < 0 || s > 1) return null
  return t
}

const edgesOf = (ring: readonly Vec2[]): [Vec2, Vec2][] => ring.map((p, i) => [p, ring[(i + 1) % ring.length]!])

interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

function boxOf(points: readonly Vec2[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

const boxesMeet = (a: Box, b: Box): boolean => a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY

/** One Sutherland–Hodgman pass: the part of a convex polygon where `side(p) ≥ 0`. */
function clipBy(polygon: readonly Vec2[], side: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) out.push(add(a, scale(sub(b, a), sa / (sa - sb))))
  }
  return out
}

/** Where two convex polygons overlap, or []. */
function overlapOf(a: readonly Vec2[], b: readonly Vec2[]): Vec2[] {
  const inward = Math.sign(signedArea(b))
  let out = [...a]
  for (let i = 0; i < b.length && out.length > 0; i++) {
    const p = b[i]!
    const edge = sub(b[(i + 1) % b.length]!, p)
    if (dot(edge, edge) === 0) continue
    out = clipBy(out, (x) => inward * cross(edge, sub(x, p)))
  }
  return out
}

/** How wide a convex polygon is across its narrowest direction; 0 for a line or a point. */
function narrowestWidth(polygon: readonly Vec2[]): number {
  if (polygon.length < 3 || Math.abs(signedArea(polygon)) < tolerance('noArea')) return 0
  let narrowest = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const edge = sub(polygon[(i + 1) % polygon.length]!, polygon[i]!)
    const len = length(edge)
    if (len < tolerance('noLength')) continue
    const across = vec(-edge.y / len, edge.x / len)
    let lo = Infinity
    let hi = -Infinity
    for (const p of polygon) {
      const d = dot(p, across)
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    narrowest = Math.min(narrowest, hi - lo)
  }
  return narrowest === Infinity ? 0 : narrowest
}

const overlapsBy = (a: readonly Vec2[], b: readonly Vec2[], by: number): boolean => narrowestWidth(overlapOf(a, b)) > by

/** A fixture's frame: its front's two corners, the way out of its front and the way across it, back left to back right. */
interface Frame {
  readonly item: Item
  readonly frontLeft: Vec2
  readonly frontRight: Vec2
  readonly out: Vec2
  readonly across: Vec2
  readonly outline: readonly Vec2[]
}

function frameOf(item: Item): Frame {
  const outline = itemFootprint(item)
  const [backLeft, backRight, frontRight, frontLeft] = outline as [Vec2, Vec2, Vec2, Vec2]
  return { item, frontLeft, frontRight, out: unit(sub(frontLeft, backLeft)), across: unit(sub(backRight, backLeft)), outline }
}

/** The first library entry of a kind that keeps clear floor, the plan's own before Grid's. */
function libraryClearance(plan: FloorPlan): (kind: string) => { entry: string; clearance: number } | null {
  let byKind: Map<string, { entry: string; clearance: number }> | null = null
  return (kind) => {
    if (byKind === null) {
      byKind = new Map()
      for (const found of planLibrary(plan).items.values()) {
        const c = found.entry.clearance
        if (c !== undefined && c > 0 && !byKind.has(found.entry.kind)) byKind.set(found.entry.kind, { entry: found.entry.name, clearance: c })
      }
    }
    return byKind.get(kind) ?? null
  }
}

/** Whether a kind gets a zone: a fixture's, or any the person names (never a point or a rug). */
function zoned(kind: string, ask: ActivityAsk): boolean {
  if (liesUnderfoot(kind) || isPointKind(kind)) return false
  return itemKindDefinition(kind)?.group === 'fixture' || ask.perKind?.[kind] !== undefined
}

/** The whole room a room is part of (CNT-8: a zone is part of its room). */
function wholeRoom(survey: Survey, id: string | null): SurveyRoom | undefined {
  if (id === null) return undefined
  const room = survey.byId.get(id)
  if (room?.facts.zoneOf !== undefined) {
    const of = survey.byId.get(room.facts.zoneOf)
    if (of !== undefined && of.polygon.length >= 3) return of
  }
  return room
}

/** The floor each door on `floor` sweeps, as convex polygons, and how many doors state no swing. */
function doorSwings(plan: FloorPlan): { byFloor: Map<string, { id: string; polygon: Vec2[] }[]>; noSwing: Map<string, number> } {
  const byFloor = new Map<string, { id: string; polygon: Vec2[] }[]>()
  const noSwing = new Map<string, number>()
  const walls = new Map(plan.walls.map((w) => [w.id, w] as const))
  for (const opening of plan.openings) {
    if (opening.type !== 'door') continue
    const wall = walls.get(opening.wall)
    if (wall === undefined) continue
    const floor = floorOf(wall)
    const hole = openingChord(wall, opening.offset, opening.offset + opening.width)
    const drawn: PlanOpening = { id: opening.id, wallId: wall.id, type: opening.type, from: hole.start, to: hole.end, normal: hole.normal, thickness: wall.virtual === true ? 0 : wall.thickness, width: opening.width }
    const sweeps = doorSweeps(drawn, { hinge: opening.hinge ?? null, swing: opening.swing ?? null, kind: opening.kind ?? null, opens: opening.opens ?? null })
    if (sweeps === null) {
      noSwing.set(floor, (noSwing.get(floor) ?? 0) + 1)
      continue
    }
    const list = byFloor.get(floor) ?? []
    for (const sweep of sweeps) {
      if (sweep.shape === 'strip') {
        list.push({ id: opening.id, polygon: [...sweep.polygon] })
        continue
      }
      // The quarter disc, its arc flattened in steps of `arcStep`: the chords lie inside it.
      const { center, radius, from, to } = sweep.swing.arc
      const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from))
      const steps = Math.max(1, Math.ceil(Math.abs(turn) / tolerance('arcStep')))
      const polygon: Vec2[] = [center]
      for (let i = 0; i <= steps; i++) {
        const angle = from + (turn * i) / steps
        polygon.push(add(center, scale(vec(Math.cos(angle), Math.sin(angle)), radius)))
      }
      list.push({ id: opening.id, polygon })
    }
    byFloor.set(floor, list)
  }
  return { byFloor, noSwing }
}

/** Groups of frames that stand side by side with one front: a run. Each frame is in one group. */
function runsOf(frames: readonly Frame[]): Frame[][] {
  const contact = tolerance('wallContact')
  const parent = frames.map((_, i) => i)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)))
  const sideless = frames.map((f) => itemKindDefinition(f.item.kind)?.sides === false)
  for (let i = 0; i < frames.length; i++) {
    if (!sideless[i]) continue
    const a = frames[i]!
    for (let j = i + 1; j < frames.length; j++) {
      if (!sideless[j]) continue
      const b = frames[j]!
      if (dot(a.out, b.out) <= 0 || Math.abs(cross(a.out, b.out)) >= tolerance('parallel')) continue
      // Their fronts on one line.
      if (Math.abs(dot(sub(b.frontLeft, a.frontLeft), a.out)) > contact) continue
      const span = (f: Frame): [number, number] => {
        const u = dot(sub(f.frontLeft, a.frontLeft), a.across)
        const v = dot(sub(f.frontRight, a.frontLeft), a.across)
        return [Math.min(u, v), Math.max(u, v)]
      }
      const [aLo, aHi] = span(a)
      const [bLo, bHi] = span(b)
      if (Math.max(bLo - aHi, aLo - bHi) > contact) continue
      parent[root(j)] = root(i)
    }
  }
  const groups = new Map<number, Frame[]>()
  frames.forEach((f, i) => {
    const r = root(i)
    groups.set(r, [...(groups.get(r) ?? []), f])
  })
  return [...groups.values()]
}

/**
 * Every activity zone of the plan, or of one room. Never throws on a plan the survey reads.
 * `figureFor` overrides the figures (a firm's standard); otherwise they come from `ask`.
 */
export function activityZones(survey: Survey, ask: ActivityAsk, figureFor?: (item: Item) => ZoneFigure | null): Activity {
  const { rows, itemById, obstacles } = fixturesOf(survey)
  const plan = survey.plan
  const library = libraryClearance(plan)
  const orientation = planOrientation(plan)
  const north = orientation.north ?? 0
  const way = (dir: Vec2): CompassPoint => compassPoint(bearingOf(dir, orientation, north) ?? 0)
  const swings = doorSwings(plan)
  const contact = tolerance('wallContact')
  const step = tolerance('useRaster')

  const figureOf = (item: Item, frame: Frame): ZoneFigure => {
    const own = ask.perKind?.[item.kind]
    const widthGiven = own?.width ?? ask.width
    const width = widthGiven ?? length(sub(frame.frontRight, frame.frontLeft))
    const base = { width, widthGiven: widthGiven !== undefined }
    const front = own?.front ?? ask.clearance
    if (front !== undefined) return { ...base, front, from: 'person' }
    if (item.clearance !== undefined && item.clearance > 0) return { ...base, front: item.clearance, from: 'item' }
    const entry = library(item.kind)
    if (entry !== null) return { ...base, front: entry.clearance, from: 'library', entry: entry.entry }
    return { ...base, front: limit('useClearSpace'), from: 'grid' }
  }

  // The fixtures that get a zone, by room.
  let noRoom = 0
  const byRoom = new Map<string, { room: SurveyRoom; frames: Frame[]; figures: Map<string, ZoneFigure> }>()
  for (const row of rows) {
    if (!zoned(row.kind, ask) && figureFor === undefined) continue
    if (liesUnderfoot(row.kind) || isPointKind(row.kind)) continue
    const item = itemById.get(row.id)
    if (item === undefined) continue
    const frame = frameOf(item)
    const figure = figureFor === undefined ? figureOf(item, frame) : figureFor(item)
    if (figure === null) continue
    const room = wholeRoom(survey, row.room)
    if (room === undefined || room.polygon.length < 3) {
      noRoom++
      continue
    }
    if (ask.room !== undefined && room.facts.id !== ask.room) continue
    const entry = byRoom.get(room.facts.id) ?? { room, frames: [] as Frame[], figures: new Map<string, ZoneFigure>() }
    entry.frames.push(frame)
    entry.figures.set(item.id, figure)
    byRoom.set(room.facts.id, entry)
  }

  const zones: (ActivityZone & { readonly box: Box })[] = []
  const floorsMeasured = new Set<string>()
  for (const { room, frames, figures } of byRoom.values()) {
    const floor = room.facts.floor
    floorsMeasured.add(floor)
    const roomBox = boxOf(room.polygon)
    const walls = [...edgesOf(room.polygon), ...room.holes.flatMap(edgesOf)]
    // Only a fixture within the room's box can stop a ray that ends on its outline.
    const near = obstacles(floor).filter((o) => boxesMeet(boxOf(o.outline), roomBox)).map((o) => ({ ...o, box: boxOf(o.outline), edges: edgesOf(o.outline) }))
    const doors = (swings.byFloor.get(floor) ?? []).map((d) => ({ ...d, box: boxOf(d.polygon) }))
    for (const run of runsOf(frames)) {
      const first = run[0]!
      const members = new Set(run.map((f) => f.item.id))
      const out = first.out
      const across = first.across
      // The run's front, along `across` from the first unit's front left corner.
      const along = run.flatMap((f) => [dot(sub(f.frontLeft, first.frontLeft), across), dot(sub(f.frontRight, first.frontLeft), across)])
      const lo = Math.min(...along)
      const hi = Math.max(...along)
      const centre = add(first.frontLeft, scale(across, (lo + hi) / 2))
      const runFigures = run.map((f) => figures.get(f.item.id)!)
      const deepest = runFigures.reduce((a, b) => (b.front > a.front ? b : a))
      const widthGiven = runFigures.some((f) => f.widthGiven)
      const width = run.length === 1 ? deepest.width : Math.max(hi - lo, ...runFigures.filter((f) => f.widthGiven).map((f) => f.width))
      const figure: ZoneFigure = { ...deepest, width, widthGiven }
      const half = figure.width / 2
      const d = figure.front
      const outline = [add(centre, scale(across, -half)), add(centre, scale(across, half)), add(add(centre, scale(across, half)), scale(out, d)), add(add(centre, scale(across, -half)), scale(out, d))]
      const zoneBox = boxOf(outline)
      const others = near.filter((o) => !members.has(o.id))

      const insideOther = (p: Vec2): boolean => others.some((o) => p.x >= o.box.minX && p.x <= o.box.maxX && p.y >= o.box.minY && p.y <= o.box.maxY && pointInPolygon(p, o.outline))
      const free = (p: Vec2): boolean => pointInPolygon(p, room.polygon, room.holes) && !insideOther(p)
      const ray = (origin: Vec2, dir: Vec2): number => {
        let least = Infinity
        for (const [a, b] of walls) {
          const t = rayHits(origin, dir, a, b)
          if (t !== null && t < least) least = t
        }
        const end = add(origin, scale(dir, least))
        const reach = boxOf([origin, end])
        for (const o of others) {
          if (!boxesMeet(o.box, reach)) continue
          for (const [a, b] of o.edges) {
            const t = rayHits(origin, dir, a, b)
            if (t !== null && t < least) least = t
          }
        }
        return least
      }
      const pieces = (span: number): number => Math.max(1, Math.ceil(span / step))

      // The centre line's own depth, then each side within it, then the depth across what is clear.
      const nudge = scale(out, contact)
      // A ray from just in front of the face, so the face itself is not met; the nudge is added back.
      const centreDepth = free(add(centre, nudge)) ? ray(add(centre, nudge), out) + contact : 0
      const sideTo = (dir: Vec2): number => {
        const reach = Math.min(d, centreDepth)
        if (!(reach > contact)) return 0
        const n = pieces(reach)
        let least = Infinity
        for (let k = 0; k < n; k++) {
          const p = add(centre, scale(out, (reach * (k + 0.5)) / n))
          least = Math.min(least, free(p) ? ray(p, dir) : 0)
        }
        return least
      }
      const left = sideTo(scale(across, -1))
      const right = sideTo(across)
      const depthOver = (from: number, to: number): number => {
        if (!(to - from > 0)) return centreDepth
        const n = pieces(to - from)
        let least = Infinity
        for (let k = 0; k <= n; k++) {
          const t = from + ((to - from) * k) / n
          const p = add(add(centre, scale(across, t)), nudge)
          least = Math.min(least, free(p) ? ray(p, out) + contact : 0)
        }
        return least
      }
      const clearLeft = Math.max(0, Math.min(half, left) - contact)
      const clearRight = Math.max(0, Math.min(half, right) - contact)
      const front = depthOver(-clearLeft, clearRight)
      const band = depthOver(-(half - contact), half - contact)

      const joint = tolerance('joint')
      const short: ('front' | 'left' | 'right')[] = []
      if (front + joint < d) short.push('front')
      if (left + joint < half) short.push('left')
      if (right + joint < half) short.push('right')
      const standing = others.filter((o) => boxesMeet(o.box, zoneBox) && overlapsBy(outline, o.outline, tolerance('itemOverlap'))).map((o) => o.id)
      const swung = [...new Set(doors.filter((s) => boxesMeet(s.box, zoneBox) && overlapsBy(outline, s.polygon, tolerance('swingContact'))).map((s) => s.id))]
      const finite = (v: number): number | null => (Number.isFinite(v) ? v : null)
      zones.push({
        items: run.map((f) => f.item.id),
        room: room.facts.id,
        floor,
        at: centre,
        figure,
        measured: { front: finite(front), left: finite(left), right: finite(right) },
        band: finite(band),
        ways: { front: way(out), left: way(scale(across, -1)), right: way(across) },
        short,
        standing,
        doors: swung,
        overlaps: [],
        outline,
        box: zoneBox,
      })
    }
  }

  // Zones that overlap, on one floor, found by box first.
  const order = zones.map((_, i) => i).sort((a, b) => zones[a]!.box.minX - zones[b]!.box.minX)
  const overlaps = zones.map(() => [] as string[])
  for (let x = 0; x < order.length; x++) {
    const i = order[x]!
    const a = zones[i]!
    for (let y = x + 1; y < order.length; y++) {
      const j = order[y]!
      const b = zones[j]!
      if (b.box.minX > a.box.maxX) break
      if (a.floor !== b.floor || !boxesMeet(a.box, b.box)) continue
      if (!overlapsBy(a.outline, b.outline, tolerance('itemOverlap'))) continue
      overlaps[i]!.push(b.items[0]!)
      overlaps[j]!.push(a.items[0]!)
    }
  }
  const out = zones.map((zone, i): ActivityZone => {
    const { box, ...rest } = zone
    void box
    return { ...rest, overlaps: overlaps[i]! }
  })

  let fixtures = 0
  let doors = 0
  let noSwing = 0
  for (const floor of floorsMeasured) {
    fixtures += obstacles(floor).length
    doors += new Set((swings.byFloor.get(floor) ?? []).map((s) => s.id)).size
    noSwing += swings.noSwing.get(floor) ?? 0
  }
  return { zones: out, noRoom, noSwing, fixtures, doors, northStated: orientation.north !== null }
}

/** True when a zone is short of its figure, has something in it or overlaps another. */
export function zoneFindings(zone: ActivityZone): boolean {
  return zone.short.length > 0 || zone.standing.length > 0 || zone.doors.length > 0 || zone.overlaps.length > 0
}

const way = (point: CompassPoint): Said => said(`describe.way.${point}`)

/** What a zone is of: its fixture, or the run of its units. */
function zoneWhat(zone: ActivityZone, items: ReadonlyMap<string, Item>): Value {
  const named = zone.items.map((id) => itemNameSaid(items.get(id) ?? { id, kind: 'item' }))
  return named.length === 1 ? named[0]! : said('activity.run', { names: joined(named, 'join.comma', 'join.and') })
}

/** The fixtures and runs named by their first unit's id. */
function namesOf(ids: readonly string[], items: ReadonlyMap<string, Item>): Value {
  return joined(ids.map((id) => itemNameSaid(items.get(id) ?? { id, kind: 'item' })), 'join.comma', 'join.and')
}

function whoseOf(figure: ZoneFigure): Said {
  const whose = figure.from === 'library' ? said('activity.whose.library', { entry: name(figure.entry ?? '') }) : said(`activity.whose.${figure.from}`)
  return figure.widthGiven && figure.from !== 'person' ? said('activity.whose.widthPerson', { whose }) : whose
}

/** The zone's line, in English. */
export function zoneLine(survey: Survey, zone: ActivityZone, L: Length): string {
  const { itemById } = fixturesOf(survey)
  const room = survey.byId.get(zone.room)
  const open = (v: number | null): Value => (v === null ? said('activity.open') : L(v))
  const half = zone.figure.width / 2
  const shortList: Value[] = zone.short.map((part) =>
    part === 'front'
      ? said('activity.short.front', { measured: open(zone.measured.front), figure: L(zone.figure.front) })
      : said('activity.short.side', { measured: open(zone.measured[part]), way: way(zone.ways[part]), figure: L(half) })
  )
  const found: Value[] = [
    ...(shortList.length > 0 ? [said('activity.found.short', { list: joined(shortList, 'join.comma', 'join.and') })] : []),
    ...(zone.standing.length > 0 ? [said(zone.standing.length === 1 ? 'activity.found.standing.one' : 'activity.found.standing.many', { names: namesOf(zone.standing, itemById) })] : []),
    ...(zone.doors.length > 0 ? [said('activity.found.doors', { doors: joined(zone.doors.map((d) => name(d)), 'join.comma', 'join.and') })] : []),
    ...(zone.overlaps.length > 0 ? [said('activity.found.overlaps', { names: namesOf(zone.overlaps, itemById) })] : []),
  ]
  return english(
    said('activity.zone', {
      what: zoneWhat(zone, itemById),
      room: name(room === undefined ? zone.room : roomCalled(room.facts)),
      front: L(zone.figure.front),
      width: L(zone.figure.width),
      whose: whoseOf(zone.figure),
      depth: open(zone.measured.front),
      frontWay: way(zone.ways.front),
      left: open(zone.measured.left),
      leftWay: way(zone.ways.left),
      right: open(zone.measured.right),
      rightWay: way(zone.ways.right),
      found: found.length === 0 ? said('activity.found.clear') : joined(found, 'join.space'),
    })
  )
}

/** The answer's lines, the shortfalls only unless `all`, closing with what it took off. */
export function activityLines(survey: Survey, found: Activity, all: boolean, L: Length): string[] {
  const lines: string[] = [english(said('activity.head', { count: found.zones.length }))]
  if (!found.northStated) lines.push(english(said('activity.north.assumed')))
  if (found.zones.length === 0) lines.push(english(said('activity.none')))
  const listed = all ? found.zones : found.zones.filter(zoneFindings)
  for (const zone of listed) lines.push(zoneLine(survey, zone, L))
  const rest = found.zones.length - listed.length
  if (rest > 0) lines.push(english(rest === 1 ? said('activity.rest.one') : said('activity.rest.many', { count: rest })))
  lines.push(tookOff(found))
  return lines
}

/** ARE-73: the one closing sentence: what the zones were measured clear of, and what was left out. */
export function tookOff(found: Activity): string {
  const left: Value[] = [
    ...(found.noRoom > 0 ? [found.noRoom === 1 ? said('activity.left.noRoom.one') : said('activity.left.noRoom.many', { count: found.noRoom })] : []),
    ...(found.noSwing > 0 ? [found.noSwing === 1 ? said('activity.left.noSwing.one') : said('activity.left.noSwing.many', { count: found.noSwing })] : []),
    said('activity.left.noZone'),
  ]
  return english(said('activity.tookOff', { fixtures: found.fixtures, doors: found.doors, left: joined(left, 'join.comma', 'join.and') }))
}

/** The zone as data, compact. */
export function zoneData(zone: ActivityZone): Record<string, unknown> {
  const r = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 1000)
  return {
    items: zone.items,
    room: zone.room,
    at: [r(zone.at.x), r(zone.at.y)],
    figure: { front: zone.figure.front, width: r(zone.figure.width), from: zone.figure.from, ...(zone.figure.entry === undefined ? {} : { entry: zone.figure.entry }), widthGiven: zone.figure.widthGiven },
    measured: { front: r(zone.measured.front), left: r(zone.measured.left), right: r(zone.measured.right) },
    ways: zone.ways,
    short: zone.short,
    standing: zone.standing,
    doors: zone.doors,
    overlaps: zone.overlaps,
  }
}
