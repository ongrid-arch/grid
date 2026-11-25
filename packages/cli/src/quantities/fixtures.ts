/**
 * The plan's fixtures (CNT-12) and furniture (CNT-20), counted and measured: how many of each
 * kind, where each stands, and the floor the fixtures take from each room, so a room's free floor
 * is its net area less the floor its fixtures stand on; furniture can be moved and takes none.
 * Every size is the plan's own, or its library entry's (CNT-20).
 */
import {
  floorOf,
  indexPlan,
  isItemKind,
  itemKindDefinition,
  itemKinds,
  itemKindWord,
  itemFloorTaken,
  itemRoom,
  MEASURES,
  roomShapes,
  roomZones,
  tryRoomShape,
  validatePlan,
  type FloorPlan,
  type Item,
  type ItemGroup,
} from '@ongrid/floorplan/geometry'
import { english, joined, name, said, type Value } from '@ongrid/floorplan/messages'
import type { ReadFault } from '@ongrid/floorplan/types/readParts'

export const FIXTURE_RULES = {
  count: 'Fixtures and furniture are the plan\'s items, counted by kind; the room each is in is the one that holds the middle of its footprint. Furniture takes no free floor: it can be moved. Points and seats come later.',
  // ARE-14: one of the area measures, said in its words.
  free: MEASURES.freeFloor.measures,
} as const

export interface FixtureRow {
  readonly id: string
  readonly kind: string
  /** CNT-20: a fixture, or furniture. */
  readonly group: ItemGroup
  /** CNT-20: the library entry it was placed from, or null. */
  readonly library: string | null
  /** Its label, else its kind in words. */
  readonly label: string
  readonly floor: string
  /** The room it stands in, or null. */
  readonly room: string | null
  readonly at: readonly [number, number]
  /** Width along its back × depth to its front, in metres. */
  readonly size: readonly [number, number]
  readonly height: number
  /** Degrees, counter-clockwise. */
  readonly turn: number
}

export interface Fixtures {
  /** The fixtures that can be drawn, in plan order. */
  readonly rows: readonly FixtureRow[]
  /** How many of each kind, every kind the registry holds listed. */
  readonly counts: Readonly<Record<string, number>>
  /** The floor fixtures take in each room, by room id, in square metres. */
  readonly taken: ReadonlyMap<string, number>
  /** ARE-14: the floor fixtures take in each zone (CNT-8), by zone id: those whose middle is in the zone, within it. Its room's `taken` holds them too. */
  readonly zoneTaken: ReadonlyMap<string, number>
  /** Items left out (a kind not held yet, a number not accepted): grid_check says why. */
  readonly leftOut: readonly string[]
}

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(itemKinds().map((kind) => [kind, 0]))
}

/** The plan's fixtures, on the floors given (every floor when left out). */
export function planFixtures(plan: FloorPlan, floors?: readonly string[]): Fixtures {
  const items = (plan.items ?? []).filter((item) => floors === undefined || floors.includes(floorOf(item)))
  if (items.length === 0) return { rows: [], counts: emptyCounts(), taken: new Map(), zoneTaken: new Map(), leftOut: [] }
  const index = indexPlan(plan)
  const { broken } = validatePlan(plan, index)
  const shapes = roomShapes(index, broken)
  const sound: Item[] = []
  const leftOut: string[] = []
  for (const item of items) {
    if (broken.has(item.id) || !isItemKind(item.kind)) leftOut.push(item.id)
    else sound.push(item)
  }
  const counts = emptyCounts()
  const rows = sound.map((item): FixtureRow => {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1
    return {
      id: item.id,
      kind: item.kind,
      group: itemKindDefinition(item.kind)?.group ?? 'fixture',
      library: item.library ?? null,
      label: item.label ?? itemKindWord(item.kind),
      floor: floorOf(item),
      room: itemRoom(item, shapes)?.id ?? null,
      at: item.at,
      size: item.size,
      height: item.height,
      turn: item.turn ?? 0,
    }
  })
  const zones = roomZones(index)
  const zoneShapes = plan.rooms.flatMap((room) => {
    if (broken.has(room.id) || !zones.zoneOf.has(room.id)) return []
    const shape = tryRoomShape(room, index)
    return shape === null ? [] : [{ room, shape }]
  })
  return { rows, counts, taken: itemFloorTaken(sound, shapes), zoneTaken: zoneShapes.length === 0 ? new Map() : itemFloorTaken(sound, zoneShapes), leftOut }
}

/** "2 toilets, 1 basin", kinds with none left out; "no fixtures" when there are none. */
export function fixtureCountText(counts: Readonly<Record<string, number>>): string {
  const parts = itemKinds().filter((kind) => (counts[kind] ?? 0) > 0).map((kind) => {
    const word = itemKindWord(kind)
    return `${counts[kind]} ${word}${counts[kind] === 1 ? '' : 's'}`
  })
  return parts.length === 0 ? 'no fixtures' : parts.join(', ')
}

/** ARE-26: a fixture a measure left out, and why. */
export interface FixtureLeftOut {
  /** Its id, null when the file gives it none that can be read. */
  readonly id: string | null
  /** Where it is in the plan's items, from 0, when the reader set it aside; else null. */
  readonly index: number | null
  /** The field that kept it out and what was found there ("height", "missing"), else null: grid_check says why. */
  readonly field: string | null
  readonly found: string | null
}

/**
 * ARE-26: every fixture a measure leaves out: the items the reader set aside for a value they
 * cannot do without (a toilet with no height), which are not in the plan at all, and the items
 * the checks hold back (`planFixtures`). A measure that depends on fixtures names them, so a
 * room does not read as holding none.
 */
export function fixturesLeftOut(plan: FloorPlan, faults: readonly ReadFault[] = []): FixtureLeftOut[] {
  const byIndex = new Map<number, { id: string | null; field: string | null; found: string | null }>()
  for (const fault of faults) {
    if (fault.kind !== 'part-left-out' || fault.part.list !== 'items') continue
    // The first fault of an item says why; the field is the last step of its path, when the path goes into the item.
    if (byIndex.has(fault.part.index)) continue
    const field = fault.path.length > 2 ? String(fault.path[fault.path.length - 1]) : null
    byIndex.set(fault.part.index, { id: fault.part.id, field, found: field === null ? null : fault.found })
  }
  const out: FixtureLeftOut[] = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([index, why]) => ({ ...why, index }))
  for (const id of planFixtures(plan).leftOut) out.push({ id, index: null, field: null, found: null })
  return out
}

/** ARE-26: the one sentence that names the fixtures a measure left out, or null when none was. */
export function fixturesLeftOutLine(left: readonly FixtureLeftOut[]): string | null {
  if (left.length === 0) return null
  const items: Value[] = left.map((one) => {
    const item: Value = one.id !== null ? name(one.id) : said('measure.fixtureLeftOut.unnamed', { index: one.index === null ? 0 : one.index })
    return one.field === null || one.found === null ? said('measure.fixtureLeftOut.plain', { item }) : said('measure.fixtureLeftOut.field', { item, field: one.field, found: one.found })
  })
  return english(said('measure.fixturesLeftOut', { items: joined(items, 'join.semicolon') }))
}
