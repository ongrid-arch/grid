/**
 * Fixtures on the plan (CNT-12, C6): where each stands, what it covers, how it is drawn and what
 * is worth a look about it.
 *
 * CNT-11 decided the shape of a placed item and that this version holds fixed fixtures only: a
 * toilet, a basin, a shower, a bath and a kitchen run. A fixture is never a wall and never a
 * room. It adds no floor area and closes no outline; the room it stands in is found from the
 * outlines, never named, and it takes from that room only the floor it stands on (`free floor`).
 *
 * Every size is the author's. A symbol is drawn inside the footprint the plan states, in
 * proportions of it, so whatever the size the drawing is to scale. The proportions are Grid's own
 * way of drawing and say nothing about how big a fixture should be.
 *
 * Pure: a plan in, shapes and issues out.
 */

import type { Item, ItemKind } from '../types/floorplan'
import type { Said, Value } from '../messages/say'
import { english, joined, name, num, said } from '../messages/say'
import { pointSaid, withSaid } from './issueWords'
import type { FloorPlan, PlanIndex, Room, Wall } from './plan'
import { openingsOf } from './plan'
import { floorOf, planFloors } from './floors'
import type { Vec2 } from './vec2'
import { area } from './vec2'
import { tryRoomShape, type RoomShape } from './room'
import { roomZones } from './zones'
import { pointInPolygon } from './innerPoint'
import { intersectionArea, ringOf, union } from './polygons'
import { tolerance } from './tolerances'
import { wallPlanSlices } from './wall'
import { nearestFloorId } from './levels'
import { metresText } from './rounding'
import type { Issue } from './validate'
import { ITEM_KIND_DEFINITIONS, isItemKind, isOwnItemKind, itemKindDefinition, itemKinds, takesFloor, type ItemSymbol, type SymbolPen } from './itemKinds'
import { BUILT_IN_ITEMS, builtInItem } from '../library/builtIn'
import { likelyId } from '../types/nearest'

export { ITEM_KINDS, type Item, type ItemKind } from '../types/floorplan'
export { isItemKind, type ItemSymbol } from './itemKinds'

/** What a person calls each of Grid's own kinds, in a sentence (`itemKindWord` for any kind). */
export const ITEM_KIND_WORDS: Readonly<Record<ItemKind, string>> = Object.fromEntries(ITEM_KIND_DEFINITIONS.map((d) => [d.kind, d.word])) as Record<ItemKind, string>

/** An item's name starting a line: its kind, then its id (`itemNounSaid`, in English). */
export function itemNoun(item: Pick<Item, 'id' | 'kind' | 'label'>): string {
  return english(itemNounSaid(item))
}

/**
 * CNT-13: an item named inside a sentence: its kind and id, `kitchen run "k1"`, with the label
 * first when the plan states one, `"Table 2" (kitchen run "t2")`. Both are the plan's own words,
 * so both are quoted. In English; `itemNameSaid` by its key and values.
 */
export function itemName(item: Pick<Item, 'id' | 'kind' | 'label'>): string {
  return english(itemNameSaid(item))
}

/** `itemNoun` by its key and values (MSG-11). */
export function itemNounSaid(item: Pick<Item, 'id' | 'kind'>): Said {
  return said(`issue.part.Item.${isOwnItemKind(item.kind) ? item.kind : 'item'}`, { id: name(item.id) })
}

/** `itemName` by its key and values (MSG-11). */
export function itemNameSaid(item: Pick<Item, 'id' | 'kind' | 'label'>): Said {
  const kind = said(`issue.part.item.${isOwnItemKind(item.kind) ? item.kind : 'item'}`, { id: name(item.id) })
  return item.label === undefined || item.label.trim() === '' ? kind : said('issue.part.labelled', { label: name(item.label), kind })
}

/** A length in metres, as a figure: the sentence writes the unit. */
const m = (value: number): Value => num(metresText(value))

// ── Where it stands ──────────────────────────────────────────────────────────────────────────

/** The item's own axes: `across` along its width, left to right seen from its front, `front` from its back to its front. */
interface Frame {
  readonly at: Vec2
  readonly across: Vec2
  readonly front: Vec2
  readonly width: number
  readonly depth: number
}

function frameOf(item: Item): Frame {
  const turn = ((item.turn ?? 0) * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  return {
    at: { x: item.at[0], y: item.at[1] },
    across: { x: cos, y: sin },
    front: { x: -sin, y: cos },
    width: item.size[0],
    depth: item.size[1]
  }
}

/** A point given in shares of the item: `u` from -0.5 (its left) to 0.5, `v` from -0.5 (its back) to 0.5 (its front). */
function point(f: Frame, u: number, v: number): Vec2 {
  const a = u * f.width
  const b = v * f.depth
  return { x: f.at.x + f.across.x * a + f.front.x * b, y: f.at.y + f.across.y * a + f.front.y * b }
}

/** The floor an item covers: its four corners, counter-clockwise, back left first. */
export function itemFootprint(item: Item): Vec2[] {
  const f = frameOf(item)
  return [point(f, -0.5, -0.5), point(f, 0.5, -0.5), point(f, 0.5, 0.5), point(f, -0.5, 0.5)]
}

/** The room an item stands in: the smallest room on its floor whose floor holds the item's middle, or null. */
export function itemRoom(item: Item, rooms: readonly { readonly room: Room; readonly shape: RoomShape }[]): Room | null {
  const at = { x: item.at[0], y: item.at[1] }
  const floor = floorOf(item)
  let best: { room: Room; area: number } | null = null
  for (const { room, shape } of rooms) {
    if (floorOf(room) !== floor) continue
    if (!pointInPolygon(at, shape.polygon, shape.holes)) continue
    const size = area(shape.polygon)
    if (best === null || size < best.area) best = { room, area: size }
  }
  return best?.room ?? null
}

/**
 * Every room of the plan whose outline closes, with its shape. Broken rooms are left out, and so
 * are zones (CNT-8): a fixture stands in the room, whichever of its zones it is in.
 */
export function roomShapes(index: PlanIndex, broken: ReadonlySet<string> = new Set()): { room: Room; shape: RoomShape }[] {
  const zones = roomZones(index)
  return index.plan.rooms.flatMap((room) => {
    if (broken.has(room.id) || zones.zoneOf.has(room.id)) return []
    const shape = tryRoomShape(room, index)
    return shape === null ? [] : [{ room, shape }]
  })
}

// ── How it is drawn ──────────────────────────────────────────────────────────────────────────

/** The pen a kind's symbol is drawn with, in shares of the item's footprint (`SymbolPen`). */
function penOf(f: Frame): SymbolPen {
  const ellipse = (u: number, v: number, ru: number, rv: number, steps = 24): Vec2[] => {
    const out: Vec2[] = []
    for (let i = 0; i < steps; i++) {
      const t = (2 * Math.PI * i) / steps
      out.push(point(f, u + ru * Math.cos(t), v + rv * Math.sin(t)))
    }
    return out
  }
  return {
    width: f.width,
    depth: f.depth,
    point: (u, v) => point(f, u, v),
    box: (u0, v0, u1, v1) => [point(f, u0, v0), point(f, u1, v0), point(f, u1, v1), point(f, u0, v1)],
    ellipse,
    circle: (u, v, r, steps = 16) => ellipse(u, v, r / f.width, r / f.depth, steps),
    roundedBox: (u0, v0, u1, v1, r, steps = 4) => {
      const ru = r / f.width
      const rv = r / f.depth
      const corners: [number, number, number][] = [
        [u1 - ru, v0 + rv, -Math.PI / 2],
        [u1 - ru, v1 - rv, 0],
        [u0 + ru, v1 - rv, Math.PI / 2],
        [u0 + ru, v0 + rv, Math.PI]
      ]
      const out: Vec2[] = []
      for (const [cu, cv, from] of corners) {
        for (let i = 0; i <= steps; i++) {
          const t = from + (Math.PI / 2) * (i / steps)
          out.push(point(f, cu + ru * Math.cos(t), cv + rv * Math.sin(t)))
        }
      }
      return out
    }
  }
}

/**
 * The symbol of an item, drawn inside its footprint by its kind's entry in the registry
 * (`itemKinds.ts`). Null for a kind Grid does not hold.
 */
export function itemSymbol(item: Item): ItemSymbol | null {
  const definition = itemKindDefinition(item.kind)
  return definition === undefined ? null : definition.symbol(penOf(frameOf(item)))
}

/**
 * DXF (CNT-20): the symbol of an item in its own frame, as a block holds it: unturned, its middle
 * at (0, 0), its back towards -Y. Null for a kind Grid does not hold.
 */
export function itemBlockSymbol(item: Item): ItemSymbol | null {
  return itemSymbol({ ...item, at: [0, 0], turn: 0 })
}

// ── The floor it takes ───────────────────────────────────────────────────────────────────────

/**
 * The floor the fixtures take in each room, by room id, in square metres: the footprints of the
 * fixtures that stand in it, joined (two that overlap take their shared floor once) and cut to
 * the room's floor, less its holes. A room with no fixture is not in the map.
 */
export function itemFloorTaken(items: readonly Item[], rooms: readonly { readonly room: Room; readonly shape: RoomShape }[]): Map<string, number> {
  const byRoom = new Map<string, Item[]>()
  for (const item of items) {
    // CNT-20: furniture can be moved, so it takes no floor.
    if (!takesFloor(item.kind)) continue
    const room = itemRoom(item, rooms)
    if (room === null) continue
    const list = byRoom.get(room.id)
    if (list) list.push(item)
    else byRoom.set(room.id, [item])
  }
  const taken = new Map<string, number>()
  for (const { room, shape } of rooms) {
    const list = byRoom.get(room.id)
    if (list === undefined || taken.has(room.id)) continue
    const ring = (points: readonly Vec2[]): [number, number][] => points.map((p) => [p.x, p.y])
    const floor = [ring(shape.polygon), ...shape.holes.map(ring)]
    try {
      const covered = union(list.map((item) => [ring(itemFootprint(item))]))
      taken.set(room.id, intersectionArea(floor, covered))
    } catch {
      // The library failed on this room: its fixtures' own areas, which cannot be less.
      taken.set(room.id, list.reduce((sum, item) => sum + item.size[0] * item.size[1], 0))
    }
  }
  return taken
}

// ── Running into a wall ──────────────────────────────────────────────────────────────────────

/**
 * How far two convex shapes reach into each other, in metres, or 0 when they do not overlap: the
 * least overlap along the edge normals of both (separating axes).
 */
export function convexPenetration(a: readonly Vec2[], b: readonly Vec2[]): number {
  let least = Infinity
  for (const shape of [a, b]) {
    for (let i = 0; i < shape.length; i++) {
      const p = shape[i]!
      const q = shape[(i + 1) % shape.length]!
      const ex = q.x - p.x
      const ey = q.y - p.y
      const len = Math.hypot(ex, ey)
      if (len === 0) continue
      const nx = -ey / len
      const ny = ex / len
      let a0 = Infinity
      let a1 = -Infinity
      for (const v of a) {
        const d = v.x * nx + v.y * ny
        if (d < a0) a0 = d
        if (d > a1) a1 = d
      }
      let b0 = Infinity
      let b1 = -Infinity
      for (const v of b) {
        const d = v.x * nx + v.y * ny
        if (d < b0) b0 = d
        if (d > b1) b1 = d
      }
      const overlap = Math.min(a1, b1) - Math.max(a0, b0)
      if (overlap <= 0) return 0
      if (overlap < least) least = overlap
    }
  }
  return least === Infinity ? 0 : least
}

interface Bounds {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

function boundsOf(points: readonly Vec2[]): Bounds {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

const meet = (a: Bounds, b: Bounds): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/** The solid walls a footprint reaches into past `itemIntoWall`, each with how far, deepest first. */
export function wallsRunInto(footprint: readonly Vec2[], walls: readonly { readonly wall: Wall; readonly slices: readonly (readonly Vec2[])[]; readonly box: Bounds }[]): { wall: string; depth: number }[] {
  const box = boundsOf(footprint)
  const found: { wall: string; depth: number }[] = []
  for (const { wall, slices, box: wallBox } of walls) {
    if (!meet(box, wallBox)) continue
    let depth = 0
    for (const slice of slices) depth = Math.max(depth, convexPenetration(footprint, slice))
    if (depth > tolerance('itemIntoWall')) found.push({ wall: wall.id, depth })
  }
  return found.sort((a, b) => b.depth - a.depth)
}

/**
 * CNT-21: the floor, in square metres, of a footprint that is neither in the room's floor nor in a
 * solid wall's body: what hangs out through a doorway, a window's opening or an open side. A
 * footprint in a wall is `wallsRunInto`'s to name, not this.
 */
export function footprintOutside(footprint: readonly Vec2[], shape: RoomShape, walls: readonly { readonly slices: readonly (readonly Vec2[])[] }[]): number {
  const own = footprint.reduce((sum, p, i) => {
    const q = footprint[(i + 1) % footprint.length]!
    return sum + (p.x * q.y - q.x * p.y)
  }, 0)
  const size = Math.abs(own) / 2
  try {
    const covered = union([[ringOf(shape.polygon), ...shape.holes.map(ringOf)], ...walls.flatMap((w) => w.slices.map((slice) => [ringOf(slice)]))])
    return Math.max(0, size - intersectionArea([ringOf(footprint)], covered))
  } catch {
    // The library failed on this one: say nothing rather than a wrong figure.
    return 0
  }
}

// ── What is worth a look ─────────────────────────────────────────────────────────────────────

const issue = (id: string, code: string, sentence: Said, severity: Issue['severity']): Issue =>
  withSaid({ entity: 'item', id, code, message: english(sentence), severity }, sentence)

const held = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= tolerance('largest')

/** The room's height, floor to ceiling: as it states, else its floor's, else its lowest solid wall's. Null when none is known. */
function roomHeightOf(room: Room | null, index: PlanIndex, floorHeight: number | undefined): number | null {
  if (room?.height !== undefined) return room.height
  if (floorHeight !== undefined) return floorHeight
  if (room === null) return null
  let lowest = Infinity
  for (const id of room.boundary) {
    const wall = index.wallsById.get(id)
    if (wall === undefined || wall.virtual === true || !(wall.height > 0)) continue
    if (wall.height < lowest) lowest = wall.height
  }
  return lowest === Infinity ? null : lowest
}

/**
 * The drawing's checks on the plan's fixtures. Errors (the item is left out of every view, measure
 * and export, and its id goes into `broken`): a number Grid does not accept, a kind this version
 * does not hold, an id another part has, a floor the plan does not have. Warnings: a fixture in
 * no room, one that runs into a wall, one taller than its room.
 */
export function itemIssues(plan: FloorPlan, index: PlanIndex, broken: Set<string>): Issue[] {
  const items = plan.items ?? []
  if (items.length === 0) return []
  const issues: Issue[] = []

  const otherIds = new Set<string>([...plan.walls.map((w) => w.id), ...plan.rooms.map((r) => r.id), ...plan.openings.map((o) => o.id)])
  const itemIds = new Map<string, number>()
  for (const item of items) itemIds.set(item.id, (itemIds.get(item.id) ?? 0) + 1)
  const floors = planFloors(plan)
  const floorIds = floors.map((f) => f.id)
  const floorHeights = new Map(floors.map((f) => [f.id, f.height] as const))
  const kinds = joined(itemKinds().map(name), 'join.comma')
  const ownLibrary = new Set((plan.library ?? []).map((entry) => entry.name))

  const sound: Item[] = []
  for (const item of items) {
    const noun = itemNounSaid(item)
    const numbers = [item.at[0], item.at[1], item.size[0], item.size[1], item.height, item.turn ?? 0]
    if (!numbers.every(held)) {
      issues.push(issue(item.id, 'item/too-large', said('issue.item/too-large', { item: noun, largest: m(tolerance('largest')) }), 'error'))
      broken.add(item.id)
      continue
    }
    if (!(item.size[0] > 0 && item.size[1] > 0 && item.height > 0)) {
      issues.push(issue(item.id, 'item/no-size', said('issue.item/no-size', { item: noun }), 'error'))
      broken.add(item.id)
      continue
    }
    if (!isItemKind(item.kind)) {
      issues.push(
        issue(
          item.id,
          'item/unknown-kind',
          said('issue.item/unknown-kind', { item: name(item.id), kind: name(item.kind), kinds }),
          'error'
        )
      )
      broken.add(item.id)
      continue
    }
    if ((itemIds.get(item.id) ?? 0) > 1 || otherIds.has(item.id)) {
      issues.push(issue(item.id, 'item/duplicate-id', said('issue.item/duplicate-id', { item: noun }), 'error'))
      broken.add(item.id)
      continue
    }
    const floor = floorOf(item)
    if (!floorIds.includes(floor)) {
      const nearest = nearestFloorId(floor, floorIds)
      issues.push(
        issue(
          item.id,
          'item/unknown-floor',
          nearest === null
            ? said('issue.item/unknown-floor', { item: noun, floor: name(floor) })
            : said('issue.item/unknown-floor.nearest', { item: noun, floor: name(floor), nearest: name(nearest) }),
          'error'
        )
      )
      broken.add(item.id)
      continue
    }
    sound.push(item)
  }
  if (sound.length === 0) return issues

  const rooms = roomShapes(index, broken)
  const wallsByFloor = new Map<string, { wall: Wall; slices: Vec2[][]; box: Bounds }[]>()
  for (const wall of plan.walls) {
    if (wall.virtual === true || broken.has(wall.id)) continue
    try {
      const slices = wallPlanSlices(wall, openingsOf(index, wall.id).filter((o) => !broken.has(o.id)))
      if (slices.length === 0) continue
      const list = wallsByFloor.get(floorOf(wall)) ?? []
      list.push({ wall, slices, box: boundsOf(slices.flat()) })
      wallsByFloor.set(floorOf(wall), list)
    } catch {
      // A wall that cannot be built is reported by its own checks.
    }
  }

  for (const item of sound) {
    const noun = itemNounSaid(item)
    const room = itemRoom(item, rooms)
    if (room === null && rooms.some(({ room: r }) => floorOf(r) === floorOf(item))) {
      const at = pointSaid(metresText(item.at[0]), metresText(item.at[1]))
      issues.push(issue(item.id, 'item/outside-rooms', said('issue.item/outside-rooms', { item: noun, at }), 'warning'))
    }
    const into = wallsRunInto(itemFootprint(item), wallsByFloor.get(floorOf(item)) ?? [])
    if (into.length > 0) {
      const named = joined(
        into.slice(0, 3).map((w) => said('issue.item/into-wall.by', { wall: name(w.wall), depth: m(w.depth) })),
        'join.comma'
      )
      const more = into.length > 3 ? said('issue.item/into-wall.more', { n: into.length - 3 }) : ''
      const key = into.length === 1 ? 'issue.item/into-wall.one' : 'issue.item/into-wall.many'
      issues.push(issue(item.id, 'item/into-wall', said(key, { item: noun, walls: named, more }), 'warning'))
    }
    // CNT-21: the part of its footprint past the room's floor where no wall stands.
    if (room !== null) {
      const shape = rooms.find((r) => r.room === room)!.shape
      const outside = footprintOutside(itemFootprint(item), shape, wallsByFloor.get(floorOf(item)) ?? [])
      if (outside > tolerance('itemLeavesRoom')) {
        issues.push(issue(item.id, 'item/leaves-room', said('issue.item/leaves-room', { item: noun, room: name(room.name || room.id), outside: num(outside.toFixed(2)) }), 'warning'))
      }
    }
    const height = roomHeightOf(room, index, floorHeights.get(floorOf(item)))
    if (height !== null && item.height > height + tolerance('itemAboveRoom')) {
      const where =
        room === null
          ? said('issue.item/too-tall.floor', { floor: name(floorOf(item)) })
          : said('issue.item/too-tall.room', { room: name(room.name || room.id) })
      issues.push(
        issue(item.id, 'item/too-tall', said('issue.item/too-tall', { item: noun, height: m(item.height), over: m(item.height - height), where, room: m(height) }), 'warning')
      )
    }
  }

  // CNT-20: a library name that no entry has; the item is read from what it states itself.
  const known = [...ownLibrary, ...BUILT_IN_NAMES]
  for (const item of sound) {
    if (item.library === undefined || ownLibrary.has(item.library) || builtInItem(item.library) !== undefined) continue
    const meant = likelyId(item.library, known)
    issues.push(
      issue(
        item.id,
        'item/unknown-library',
        meant === null
          ? said('issue.item/unknown-library', { item: itemNounSaid(item), library: name(item.library) })
          : said('issue.item/unknown-library.meant', { item: itemNounSaid(item), library: name(item.library), meant: name(meant) }),
        'warning'
      )
    )
  }

  // CNT-20: items standing in each other, and the clear floor an item keeps in front of it.
  const footprints = sound.map((item) => ({ item, footprint: itemFootprint(item), box: boundsOf(itemFootprint(item)) }))
  for (let i = 0; i < footprints.length; i++) {
    const a = footprints[i]!
    for (let j = 0; j < i; j++) {
      const b = footprints[j]!
      if (floorOf(a.item) !== floorOf(b.item) || !meet(a.box, b.box)) continue
      const depth = convexPenetration(a.footprint, b.footprint)
      if (depth <= tolerance('itemOverlap')) continue
      issues.push(hitIssue(a.item.id, 'item/overlap', said('issue.item/overlap', { item: itemNounSaid(a.item), other: itemNameSaid(b.item), depth: m(depth) }), [b.item.id]))
    }
  }
  for (const { item } of footprints) {
    if (!(item.clearance !== undefined && item.clearance > 0)) continue
    const zone = itemClearanceZone(item)
    const zoneBox = boundsOf(zone)
    const walls = wallsRunInto(zone, wallsByFloor.get(floorOf(item)) ?? [])
    const others = footprints.filter((o) => o.item.id !== item.id && floorOf(o.item) === floorOf(item) && meet(zoneBox, o.box) && convexPenetration(zone, o.footprint) > tolerance('itemOverlap'))
    if (walls.length === 0 && others.length === 0) continue
    const what = joined(
      [...others.map((o) => itemNameSaid(o.item)), ...walls.map((w) => said('issue.item/clearance-blocked.wall', { wall: name(w.wall) }))],
      'join.comma'
    )
    const hits = [...others.map((o) => o.item.id), ...walls.map((w) => w.wall)]
    issues.push(hitIssue(item.id, 'item/clearance-blocked', said('issue.item/clearance-blocked', { item: itemNounSaid(item), clearance: m(item.clearance), what }), hits))
  }

  // CNT-20: each kind's own checks (the registry), on the items Grid can draw.
  for (const item of sound) {
    const definition = itemKindDefinition(item.kind)
    if (definition?.check === undefined) continue
    const room = itemRoom(item, rooms)
    for (const found of definition.check(item, { plan, room })) {
      const sentence = found.said ?? said('issue.item/kind-check', { words: found.message })
      issues.push(withSaid({ entity: 'item', id: item.id, code: found.code, message: found.message, severity: found.severity }, sentence))
    }
  }
  return issues
}

const BUILT_IN_NAMES: readonly string[] = BUILT_IN_ITEMS.map((entry) => entry.name)

const hitIssue = (id: string, code: string, sentence: Said, hits: readonly string[]): Issue =>
  withSaid({ entity: 'item', id, code, message: english(sentence), severity: 'warning', hits }, sentence)

/**
 * CNT-20: the clear floor an item keeps in front of it (`clearance`): as wide as the item, from
 * its front out by its clearance, counter-clockwise. Empty for an item that keeps none.
 */
export function itemClearanceZone(item: Item): Vec2[] {
  if (!(item.clearance !== undefined && item.clearance > 0)) return []
  const f = frameOf(item)
  const out = 0.5 + item.clearance / f.depth
  return [point(f, -0.5, 0.5), point(f, 0.5, 0.5), point(f, 0.5, out), point(f, -0.5, out)]
}
