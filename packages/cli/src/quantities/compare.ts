/**
 * Comparing plans the way people compare them: options side by side in one table by use, and
 * what differs between two of them by room name, in metres and square metres.
 *
 * Two plans written separately share no ids, so nothing here pairs things by id first. Rooms
 * are paired by name, walls by where they stand, openings by where they are in a wall. Before
 * anything is listed, the second plan is tried as the first one moved, mirrored or turned a
 * quarter: a flipped flat is said to be flipped, not listed as twenty moved walls (Y-4, Y-5).
 */
import { curveFault, tolerance, wallAxis, wallLength, wallPath, wallPointAt, type FloorPlan, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { planAreas, type PlanAreas } from './areas'
import { sideNames, type Survey } from './survey'

/** Two sizes closer than this are one (MSG-15's `joint`; arithmetic, so it never changes). */
const joint = tolerance('joint')

export interface OptionRow {
  readonly label: string
  readonly rooms: number
  readonly bedrooms: number
  readonly net: number
  readonly grossInternal: number | null
  readonly grossExternal: number | null
  readonly circulation: number
  readonly circulationShare: number | null
  readonly netToGross: number | null
  readonly byUse: Readonly<Record<string, number>>
}

export function optionRow(label: string, survey: Survey): OptionRow {
  const areas: PlanAreas = planAreas(survey)
  const byUse: Record<string, number> = {}
  for (const floor of areas.floors) for (const [use, value] of Object.entries(floor.byUse)) byUse[use] = (byUse[use] ?? 0) + value
  // CNT-8: a zone is part of a room, not a room of its own.
  const rooms = survey.rooms.filter((room) => room.facts.zoneOf === undefined)
  return {
    label,
    rooms: rooms.length,
    bedrooms: rooms.filter((room) => room.facts.use === 'bedroom').length,
    net: areas.net,
    grossInternal: areas.grossInternal,
    grossExternal: areas.grossExternal,
    circulation: areas.circulation,
    circulationShare: areas.circulationShare,
    netToGross: areas.netToGross,
    byUse,
  }
}

/** How the second plan sits against the first, when it is the same building. */
export type Likeness = 'same' | 'moved' | 'mirrored left to right' | 'mirrored top to bottom' | 'turned half round' | 'turned a quarter' | null

export interface RoomDelta {
  readonly name: string
  readonly before: number | null
  readonly after: number | null
}

export interface WallDelta {
  readonly id: string
  readonly kind: Wall['kind']
  readonly length: number
  readonly height: number
  /** Both faces, length times height each. */
  readonly faceArea: number
  /** The rooms on its two sides, by name, in the plan it is in. */
  readonly between: readonly string[]
}

/** A wall that stands somewhere else, or is another length, under the same id. */
export interface WallChange {
  readonly id: string
  readonly kind: Wall['kind']
  readonly lengthBefore: number
  readonly lengthAfter: number
  /** How far its middle moved, in metres. */
  readonly moved: number
}

/**
 * A wall that stands where it stood but is another height or thickness (WRT-2, lab AB-2: a
 * read-back lowered every wall from 3.00 to 2.70 m and the verdict said nothing changed).
 */
export interface WallSizeChange {
  readonly id: string
  readonly heightBefore: number
  readonly heightAfter: number
  readonly thicknessBefore: number
  readonly thicknessAfter: number
}

export interface OpeningDelta {
  readonly id: string
  readonly type: string
  readonly width: number
  readonly height: number
  readonly between: readonly [string, string]
}

export interface OpeningChange {
  readonly id: string
  readonly type: string
  readonly changes: readonly string[]
}

export interface Comparison {
  readonly likeness: Likeness
  readonly shift: Vec2 | null
  readonly rooms: readonly RoomDelta[]
  readonly netBefore: number
  readonly netAfter: number
  readonly wallsOut: readonly WallDelta[]
  readonly wallsNew: readonly WallDelta[]
  readonly wallsChanged: readonly WallChange[]
  /** Walls in their place at another height or thickness: named in the verdict, whatever the likeness. */
  readonly wallsResized: readonly WallSizeChange[]
  readonly openingsOut: readonly OpeningDelta[]
  readonly openingsNew: readonly OpeningDelta[]
  readonly openingsChanged: readonly OpeningChange[]
  readonly verdict: string
}

type Transform = (p: Vec2) => Vec2

interface Box { minX: number; minY: number; maxX: number; maxY: number }

function boxOf(plan: FloorPlan): Box {
  // A curve bows out past its ends (CNT-18).
  const points = plan.walls.flatMap((w): Vec2[] => (w.arc !== undefined && curveFault(w) === null ? wallPath(w) : [pt(w.start), pt(w.end)]))
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

/** The ways the first plan's box can be laid on the second's, the plain one first. */
function transforms(a: Box, b: Box): Array<{ likeness: Exclude<Likeness, null>; map: Transform }> {
  const list: Array<{ likeness: Exclude<Likeness, null>; map: Transform }> = [
    { likeness: 'same', map: (p) => p },
    { likeness: 'moved', map: (p) => ({ x: p.x - a.minX + b.minX, y: p.y - a.minY + b.minY }) },
    { likeness: 'mirrored left to right', map: (p) => ({ x: a.maxX - p.x + b.minX, y: p.y - a.minY + b.minY }) },
    { likeness: 'mirrored top to bottom', map: (p) => ({ x: p.x - a.minX + b.minX, y: a.maxY - p.y + b.minY }) },
    { likeness: 'turned half round', map: (p) => ({ x: a.maxX - p.x + b.minX, y: a.maxY - p.y + b.minY }) },
    { likeness: 'turned a quarter', map: (p) => ({ x: a.maxY - p.y + b.minX, y: p.x - a.minX + b.minY }) },
    { likeness: 'turned a quarter', map: (p) => ({ x: p.y - a.minY + b.minX, y: a.maxX - p.x + b.minY }) },
  ]
  return list
}

const NEAR_M = 0.05

function close(p: Vec2, q: Vec2, tolerance = NEAR_M): boolean {
  return Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance
}

const pt = (pair: readonly [number, number]): Vec2 => ({ x: pair[0], y: pair[1] })

/** The same wall's place: its two ends, either way round, and solid or a dividing line in both. */
function samePlace(a: Wall, b: Wall, map: Transform): boolean {
  const s = map(pt(a.start))
  const e = map(pt(a.end))
  const ends = (close(s, pt(b.start)) && close(e, pt(b.end))) || (close(s, pt(b.end)) && close(e, pt(b.start)))
  return ends && (a.virtual === true) === (b.virtual === true) && sameCurve(a, b, map)
}

/** CNT-18: both straight, or both curved through the same middle round the same centre. */
function sameCurve(a: Wall, b: Wall, map: Transform): boolean {
  if (a.arc === undefined || b.arc === undefined) return a.arc === b.arc
  const middle = (w: Wall): Vec2 | null => (curveFault(w) === null ? wallPointAt(w, wallLength(w) / 2) : null)
  const [ma, mb] = [middle(a), middle(b)]
  if (ma === null || mb === null) return false
  return close(map(pt(a.arc.centre)), pt(b.arc.centre)) && close(map(ma), mb)
}

/** A wall's length along its axis, curved or not; 0 for one that cannot be built. */
function lengthOf(wall: Wall): number {
  if (wall.arc !== undefined) return curveFault(wall) === null ? wallLength(wall) : 0
  return wallAxis(wall).length
}

/**
 * The same wall: in its place. A wall another height or thickness in its place is the same wall
 * resized, listed in `wallsResized` and named in the verdict, never left unsaid.
 */
function sameWall(a: Wall, b: Wall, map: Transform): boolean {
  return samePlace(a, b, map)
}

/** Walls of `a` that stand in their place in `b` at another height or thickness. */
function wallsResized(a: FloorPlan, b: FloorPlan, map: Transform): WallSizeChange[] {
  const out: WallSizeChange[] = []
  for (const wall of a.walls) {
    if (wall.virtual === true) continue
    const other = b.walls.find((x) => (x.floor ?? 'ground') === (wall.floor ?? 'ground') && samePlace(wall, x, map))
    if (!other) continue
    if (Math.abs(wall.height - other.height) < joint && Math.abs(wall.thickness - other.thickness) < joint) continue
    out.push({ id: other.id, heightBefore: wall.height, heightAfter: other.height, thicknessBefore: wall.thickness, thicknessAfter: other.thickness })
  }
  return out
}

/** "15 walls another height (3.00 → 2.70 m)", or null when none is. */
function resizedWords(list: readonly WallSizeChange[]): string[] {
  const parts: string[] = []
  const say = (what: string, pick: (w: WallSizeChange) => [number, number]): void => {
    const changed = list.filter((w) => Math.abs(pick(w)[0] - pick(w)[1]) >= joint)
    if (changed.length === 0) return
    const pairs = [...new Set(changed.map((w) => `${pick(w)[0].toFixed(2)} → ${pick(w)[1].toFixed(2)} m`))]
    const shown = pairs.length > 3 ? `${pairs.slice(0, 3).join(', ')} and more` : pairs.join(', ')
    parts.push(`${changed.length} wall${changed.length === 1 ? '' : 's'} another ${what} (${shown})`)
  }
  say('height', (w) => [w.heightBefore, w.heightAfter])
  say('thickness', (w) => [w.thicknessBefore, w.thicknessAfter])
  return parts
}

/** Where an opening's middle is, on its wall's axis. */
function openingAt(plan: FloorPlan, id: string): Vec2 | null {
  const o = plan.openings.find((x) => x.id === id)
  const wall = o && plan.walls.find((w) => w.id === o.wall)
  if (!o || !wall) return null
  const along = o.offset + o.width / 2
  if (wall.arc !== undefined) return curveFault(wall) === null ? wallPointAt(wall, along) : null
  const axis = wallAxis(wall)
  return { x: axis.start.x + axis.dir.x * along, y: axis.start.y + axis.dir.y * along }
}

/** Walls of `a` with no wall of `b` in their place, under `map`. */
function wallsMissing(a: FloorPlan, b: FloorPlan, map: Transform): Wall[] {
  return a.walls.filter((wall) => !b.walls.some((other) => (other.floor ?? 'ground') === (wall.floor ?? 'ground') && sameWall(wall, other, map)))
}

interface OpeningPair { a: string; b: string }

/** The floor an opening is on: its wall's (C5). */
function openingFloor(plan: FloorPlan, wallId: string): string {
  return plan.walls.find((w) => w.id === wallId)?.floor ?? 'ground'
}

function pairOpenings(a: FloorPlan, b: FloorPlan, map: Transform): { pairs: OpeningPair[]; onlyA: string[]; onlyB: string[] } {
  const pairs: OpeningPair[] = []
  const usedB = new Set<string>()
  for (const o of a.openings) {
    const at = openingAt(a, o.id)
    const floor = openingFloor(a, o.wall)
    const match = b.openings.find((x) => {
      // The same place on another floor is another opening (WRT-3: a window moved on one floor of a block).
      if (usedB.has(x.id) || x.type !== o.type || openingFloor(b, x.wall) !== floor) return false
      const there = openingAt(b, x.id)
      return at !== null && there !== null && close(map(at), there, Math.max(NEAR_M, Math.abs(x.width - o.width) / 2 + NEAR_M))
    }) ?? b.openings.find((x) => !usedB.has(x.id) && x.id === o.id && x.type === o.type)
    if (match) {
      pairs.push({ a: o.id, b: match.id })
      usedB.add(match.id)
    }
  }
  const pairedA = new Set(pairs.map((p) => p.a))
  return { pairs, onlyA: a.openings.filter((o) => !pairedA.has(o.id)).map((o) => o.id), onlyB: b.openings.filter((o) => !usedB.has(o.id)).map((o) => o.id) }
}

function wallRooms(survey: Survey, wall: Wall): string[] {
  return survey.rooms.filter((room) => room.edges.some((edge) => edge.wall?.id === wall.id)).map((room) => room.facts.name)
}

function wallDelta(survey: Survey, wall: Wall): WallDelta {
  const length = lengthOf(wall)
  return {
    id: wall.id,
    kind: wall.kind,
    length,
    height: wall.height,
    faceArea: wall.virtual === true ? 0 : 2 * length * wall.height,
    between: wallRooms(survey, wall),
  }
}

function namesOf(survey: Survey, sides: readonly [string, string]): [string, string] {
  return sides.map((side) => survey.facts.rooms.get(side)?.name ?? side) as [string, string]
}

function openingDelta(survey: Survey, id: string): OpeningDelta {
  const facts = survey.facts.openings.get(id)
  const o = survey.plan.openings.find((x) => x.id === id)!
  return { id, type: o.type, width: o.width, height: o.height, between: facts ? namesOf(survey, sideNames(facts)) : ['?', '?'] }
}

/** The room a door opens into, by name, or null when the plan does not say. */
function opensInto(survey: Survey, id: string): string | null {
  const o = survey.plan.openings.find((x) => x.id === id)
  const facts = survey.facts.openings.get(id)
  if (!o || o.type !== 'door' || o.swing === undefined || !facts) return null
  const [left, right] = namesOf(survey, sideNames(facts))
  return o.swing === 'left' ? left : right
}

function sameDirection(a: FloorPlan, b: FloorPlan, wallA: string, wallB: string, map: Transform): boolean {
  const wa = a.walls.find((w) => w.id === wallA)
  const wb = b.walls.find((w) => w.id === wallB)
  if (!wa || !wb) return true
  const da = dirOf(wa, map)
  const db = dirOf(wb, (p) => p)
  return da.x * db.x + da.y * db.y > 0
}

function dirOf(wall: Wall, map: Transform): Vec2 {
  const s = map(pt(wall.start))
  const e = map(pt(wall.end))
  return { x: e.x - s.x, y: e.y - s.y }
}

function intoA(a: Survey, id: string): string {
  const before = opensInto(a, id)
  return before === null ? '' : ` (it opened into ${JSON.stringify(before)})`
}

/** WRT-11: each room's net area as grid_areas gives it (columns off), by floor and id; one measure for both plans. */
function netsOf(s: Survey): Map<string, number> {
  const out = new Map<string, number>()
  for (const floor of planAreas(s).floors) for (const room of floor.rooms) out.set(`${floor.floor}\u0000${room.id}`, room.net ?? 0)
  return out
}

function roomDeltas(a: Survey, b: Survey): RoomDelta[] {
  const byName = (s: Survey): Map<string, number> => {
    const nets = netsOf(s)
    const map = new Map<string, number>()
    for (const room of s.rooms) map.set(room.facts.name, (map.get(room.facts.name) ?? 0) + (nets.get(`${room.facts.floor}\u0000${room.facts.id}`) ?? 0))
    return map
  }
  const before = byName(a)
  const after = byName(b)
  const names = [...new Set([...before.keys(), ...after.keys()])]
  return names.map((name) => ({ name, before: before.get(name) ?? null, after: after.get(name) ?? null }))
}

/** WRT-11: how rooms changed between a plan and the same plan changed in place, paired by floor and id. */
type RoomKind = 'renamed' | 'used differently' | 'differ in size' | 'added' | 'taken out'
function roomChanges(a: Survey, b: Survey): Map<RoomKind, string[]> {
  const nets = { a: netsOf(a), b: netsOf(b) }
  const key = (room: Survey['rooms'][number]): string => `${room.facts.floor}\u0000${room.facts.id}`
  const was = new Map(a.rooms.map((room) => [key(room), room] as const))
  const now = new Map(b.rooms.map((room) => [key(room), room] as const))
  const out = new Map<RoomKind, string[]>()
  const add = (kind: RoomKind, room: Survey['rooms'][number]): void => void out.set(kind, [...(out.get(kind) ?? []), room.facts.floor])
  for (const [k, room] of now) {
    const old = was.get(k)
    if (old === undefined) {
      add('added', room)
      continue
    }
    if (old.facts.name !== room.facts.name) add('renamed', room)
    if (old.facts.use !== room.facts.use) add('used differently', room)
    if (Math.abs((nets.a.get(k) ?? 0) - (nets.b.get(k) ?? 0)) >= 0.01) add('differ in size', room)
  }
  for (const [k, room] of was) if (!now.has(k)) add('taken out', room)
  return out
}

/**
 * WRT-11: "2 rooms renamed", and on a building of several floors "92 rooms (2 on each of 46
 * floors) differ in size": the count of rooms, never of names.
 */
function roomCountWords(kind: RoomKind, floors: readonly string[]): string {
  const n = floors.length
  const perFloor = new Map<string, number>()
  for (const floor of floors) perFloor.set(floor, (perFloor.get(floor) ?? 0) + 1)
  const counts = [...new Set(perFloor.values())]
  const where = perFloor.size <= 1 ? '' : counts.length === 1 ? ` (${counts[0]} on each of ${perFloor.size} floors)` : ` (on ${perFloor.size} floors)`
  const verb = kind === 'differ in size' && n === 1 ? 'differs in size' : kind
  return `${n} room${n === 1 ? '' : 's'}${where} ${verb}`
}

const sum = (values: readonly number[]): number => values.reduce((x, y) => x + y, 0)

/** The uses a plan's rooms and zones state, each once, in plan order. */
const usesOf = (s: Survey): string[] => [...new Set(s.rooms.flatMap((r) => (r.facts.use === undefined ? [] : [r.facts.use])))]

function areaWord(value: number): string {
  return `${value.toFixed(2)} m²`
}

/** What differs between two plans, `a` before and `b` after. */
export function comparePlans(a: Survey, b: Survey, labels: readonly [string, string] = ['before', 'after'], options: { readonly inPlace?: boolean } = {}): Comparison {
  // WRT-11: `inPlace` is a plan and the same plan after a change: it stands where it stood, rooms pair
  // by floor and id, and it is never read as the plan mirrored or turned.
  const inPlace = options.inPlace === true
  const boxA = boxOf(a.plan)
  const boxB = boxOf(b.plan)
  // The first likeness under which every wall and opening has its place.
  let likeness: Likeness = null
  let map: Transform = (p) => p
  for (const t of inPlace ? transforms(boxA, boxB).slice(0, 1) : transforms(boxA, boxB)) {
    if (a.plan.walls.length !== b.plan.walls.length || a.plan.openings.length !== b.plan.openings.length) break
    if (wallsMissing(a.plan, b.plan, t.map).length > 0) continue
    const o = pairOpenings(a.plan, b.plan, t.map)
    if (o.onlyA.length > 0 || o.onlyB.length > 0) continue
    // The same building has every opening the same size, and every door hung the same way.
    const alike = o.pairs.every(({ a: ia, b: ib }) => {
      const oa = a.plan.openings.find((x) => x.id === ia)!
      const ob = b.plan.openings.find((x) => x.id === ib)!
      const sized = Math.abs(oa.width - ob.width) < joint && Math.abs(oa.height - ob.height) < joint && Math.abs(oa.sill - ob.sill) < joint
      const plain = t.likeness === 'same' || t.likeness === 'moved'
      return sized && (!plain || (oa.swing === ob.swing && oa.hinge === ob.hinge) || !sameDirection(a.plan, b.plan, oa.wall, ob.wall, t.map))
    })
    if (!alike) continue
    if (inPlace && roomChanges(a, b).size > 0) continue
    if (roomDeltas(a, b).some((r) => r.before === null || r.after === null || Math.abs(r.before - r.after) >= 0.01)) continue
    likeness = t.likeness
    map = t.map
    break
  }
  const shift = likeness === 'moved' ? { x: boxB.minX - boxA.minX, y: boxB.minY - boxA.minY } : null
  if (likeness === null) {
    // Not the same building: compare in place, allowing a shifted origin when the boxes agree in size.
    const sameBox = Math.abs(boxA.maxX - boxA.minX - (boxB.maxX - boxB.minX)) < NEAR_M && Math.abs(boxA.maxY - boxA.minY - (boxB.maxY - boxB.minY)) < NEAR_M
    map = sameBox && !inPlace ? transforms(boxA, boxB)[1]!.map : (p) => p
  }

  const rooms = roomDeltas(a, b)
  // A zone's floor is its room's (CNT-8): counted once.
  // WRT-11: grid_areas' net, the same rule on both plans.
  const netOf = (s: Survey): number => planAreas(s).net
  const netBefore = netOf(a)
  const netAfter = netOf(b)
  const inverse = (wall: Wall): boolean => !a.plan.walls.some((other) => sameWall(other, wall, map))
  const missing = likeness ? [] : wallsMissing(a.plan, b.plan, map)
  const added = likeness ? [] : b.plan.walls.filter(inverse)
  // Walls not in their place that keep their id were moved or stretched, not taken out (Y-4).
  const wallsChanged: WallChange[] = []
  for (const wall of missing) {
    const same = added.find((other) => other.id === wall.id)
    if (!same) continue
    const mid = (w: Wall): Vec2 => ({ x: (w.start[0] + w.end[0]) / 2, y: (w.start[1] + w.end[1]) / 2 })
    const from = map(mid(wall))
    const to = mid(same)
    wallsChanged.push({ id: wall.id, kind: same.kind, lengthBefore: lengthOf(wall), lengthAfter: lengthOf(same), moved: Math.hypot(to.x - from.x, to.y - from.y) })
  }
  const changedIds = new Set(wallsChanged.map((w) => w.id))
  const wallsOut = missing.filter((wall) => !changedIds.has(wall.id)).map((wall) => wallDelta(a, wall))
  const wallsNew = added.filter((wall) => !changedIds.has(wall.id)).map((wall) => wallDelta(b, wall))
  const paired = pairOpenings(a.plan, b.plan, map)
  const openingsOut = likeness ? [] : paired.onlyA.map((id) => openingDelta(a, id))
  const openingsNew = likeness ? [] : paired.onlyB.map((id) => openingDelta(b, id))
  const openingsChanged: OpeningChange[] = []
  if (likeness === null) {
    for (const pair of paired.pairs) {
      const oa = a.plan.openings.find((o) => o.id === pair.a)!
      const ob = b.plan.openings.find((o) => o.id === pair.b)!
      const changes: string[] = []
      if (Math.abs(oa.width - ob.width) > joint) changes.push(`width ${oa.width.toFixed(2)} → ${ob.width.toFixed(2)} m`)
      if (Math.abs(oa.height - ob.height) > joint) changes.push(`height ${oa.height.toFixed(2)} → ${ob.height.toFixed(2)} m`)
      if (Math.abs(oa.sill - ob.sill) > joint) changes.push(`sill ${oa.sill.toFixed(2)} → ${ob.sill.toFixed(2)} m`)
      // The walls may run the other way in the other plan: then left and right, start and end swap.
      const wa = a.plan.walls.find((w) => w.id === oa.wall)
      const wb = b.plan.walls.find((w) => w.id === ob.wall)
      const flipped = wa !== undefined && wb !== undefined && dirOf(wa, map).x * dirOf(wb, (p) => p).x + dirOf(wa, map).y * dirOf(wb, (p) => p).y < 0
      const swingA = oa.swing === undefined ? undefined : flipped ? (oa.swing === 'left' ? 'right' : 'left') : oa.swing
      const hingeA = oa.hinge === undefined ? undefined : flipped ? (oa.hinge === 'start' ? 'end' : 'start') : oa.hinge
      if (swingA !== ob.swing) {
        const intoB = opensInto(b, pair.b)
        changes.push(`now opens into ${intoB === null ? 'a side not said' : JSON.stringify(intoB)}${intoA(a, pair.a)}`)
      }
      if (hingeA !== ob.hinge && swingA === ob.swing) changes.push('hung from the other side')
      // CNT-14: a door or window of another kind.
      if ((oa.kind ?? null) !== (ob.kind ?? null)) changes.push(ob.kind === undefined ? `no kind stated now (was ${oa.kind})` : `now ${ob.kind}${oa.kind === undefined ? '' : ` (was ${oa.kind})`}`)
      if (changes.length > 0) openingsChanged.push({ id: pair.b, type: ob.type, changes })
    }
  }

  const resized = wallsResized(a.plan, b.plan, map)
  const resizedParts = resizedWords(resized)
  const but = resizedParts.length > 0 ? `, but ${resizedParts.join(' and ')}` : ''
  const [before, after] = labels
  let verdict: string
  if (likeness === 'same') verdict = resizedParts.length > 0 ? `${after} is the same building as ${before}, every wall, opening and room where it was${but}.` : `${after} is the same building as ${before}: every wall, opening and room is where it was.`
  else if (likeness === 'moved') verdict = `${after} is the same building as ${before}, moved ${Math.hypot(shift!.x, shift!.y).toFixed(2)} m on the drawing${but}.`
  else if (likeness !== null) verdict = `${after} is ${before} ${likeness}: every room keeps its size (${areaWord(netAfter)} net)${but}.`
  else {
    const changed = rooms.filter((r) => r.before === null || r.after === null || Math.abs(r.before - r.after) >= 0.01)
    const parts = [`net ${areaWord(netBefore)} → ${areaWord(netAfter)} (${netAfter - netBefore >= 0 ? '+' : ''}${(netAfter - netBefore).toFixed(2)})`]
    if (inPlace) for (const [kind, floors] of roomChanges(a, b)) parts.push(roomCountWords(kind, floors))
    else if (changed.length > 0) parts.push(`${changed.length} room${changed.length === 1 ? ' differs' : 's differ'} by name or size`)
    if (wallsOut.length + wallsNew.length > 0) parts.push(`walls: ${wallsOut.length} out (${sum(wallsOut.map((w) => w.length)).toFixed(2)} m), ${wallsNew.length} new (${sum(wallsNew.map((w) => w.length)).toFixed(2)} m)`)
    if (wallsChanged.length > 0) parts.push(`${wallsChanged.length} wall${wallsChanged.length === 1 ? '' : 's'} moved or changed length`)
    parts.push(...resizedParts)
    const openingWords = (n: number, what: string): string => `${n} ${n === 1 ? 'opening' : 'openings'} ${what}`
    if (inPlace) {
      if (openingsChanged.length > 0) parts.push(openingWords(openingsChanged.length, 'changed'))
      if (openingsOut.length > 0) parts.push(openingWords(openingsOut.length, 'taken out'))
      if (openingsNew.length > 0) parts.push(openingWords(openingsNew.length, 'new'))
    } else if (openingsOut.length + openingsNew.length + openingsChanged.length > 0) parts.push(`openings: ${openingsOut.length} out, ${openingsNew.length} new, ${openingsChanged.length} changed`)
    verdict = `${before} → ${after}: ${parts.join('; ')}.`
  }
  // CNT-8 (lab AB-9): a use no room or zone has any more is named, never lost in silence.
  const lost = usesOf(a).filter((use) => !usesOf(b).includes(use))
  if (lost.length > 0) verdict += ` ${after.charAt(0).toUpperCase()}${after.slice(1)} has no room or zone used as ${lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(', ')} or ${lost[lost.length - 1]}`}, which ${before} had.`
  verdict = verdict.charAt(0).toUpperCase() + verdict.slice(1)
  return { likeness, shift, rooms, netBefore, netAfter, wallsOut, wallsNew, wallsChanged, wallsResized: resized, openingsOut, openingsNew, openingsChanged, verdict }
}
