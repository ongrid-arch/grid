/**
 * CNT-61: rooms furnished in one call: "furnish the house". Each room named, or every room whose
 * use has a usual set and that holds no item yet, takes a typical room's set from the library:
 * a bedroom `double-bedroom` (then `single-bedroom`), a bathroom `bathroom` (then `shower-room`),
 * a toilet `cloakroom`, a kitchen `kitchen`, a living room `living-room`, a dining room
 * `dining-room`, or the set the call names for it.
 *
 * A set is placed first as it is drawn, so a bed keeps its side tables either side: its back on
 * the inside face of a side of the room (the longest first), centred on it and then at each end,
 * turned to face into the room. The first place where Grid's fit checks (`FIT_CODES` and an item
 * leaving its room) name none of its items is kept, and the next room is tried with it in the
 * plan. A set of fixtures that fits nowhere as drawn is set out item by item against the room's
 * sides (`addFixtureSet`, CNT-48); a set of furniture that fits nowhere is left out and the
 * answer says why. Kinds the room already holds are left out of its set. It is a first set-out
 * from Grid's own checks, for the person to move from, never a layout rule.
 *
 * Pure: a survey and a library in, a patch out.
 */
import { tolerance, indexPlan, itemRoom, roomShapes, validatePlan, type FloorPlan, type Issue } from '@ongrid/floorplan/geometry'
import { takesFloor } from '@ongrid/floorplan/geometry/itemKinds'
import { LibraryRefused, placeFromLibrary, type FoundRoom, type Library, type Pair } from '@ongrid/floorplan/library'
import type { LibraryItem, RoomUse } from '@ongrid/floorplan/types/floorplan'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { roomCalled } from '../quantities/survey'
import { emptyPatch, listed, readingAfter, type Patch } from './edits'
import { addFixtureSet, type RawRecord } from './fixtureSets'
import { FIT_CODES } from './place'
import { EditRefused } from './refused'

/** The usual sets of a room's use, tried in order. Grid's own choice, said in the answer. */
export const USUAL_SETS: Readonly<Partial<Record<RoomUse, readonly string[]>>> = {
  bedroom: ['double-bedroom', 'single-bedroom'],
  bathroom: ['bathroom', 'shower-room'],
  toilet: ['cloakroom'],
  kitchen: ['kitchen'],
  living: ['living-room'],
  dining: ['dining-room'],
}

export interface FurnishRequest {
  /** The rooms to furnish, by id. Every room with a usual set and no item yet when left out. */
  readonly rooms?: readonly string[]
  /** A set of the library's typical rooms for a room, in place of its use's. */
  readonly sets?: Readonly<Record<string, string>>
}

/** What became of one room. */
export interface Furnished {
  readonly room: string
  readonly set: string | null
  readonly how: 'as-drawn' | 'item-by-item' | 'not-furnished'
  readonly placed: readonly string[]
}

type Side = 'south' | 'east' | 'north' | 'west'

/** The checks that say an item does not fit where it stands. */
const DOES_NOT_FIT = new Set([...FIT_CODES, 'item/leaves-room'])

/** The turn that puts a set's back on a side: an unturned set has its back to -y, the south. */
const TURN_OF: Readonly<Record<Side, number>> = { south: 0, east: 90, north: 180, west: 270 }

const turnedBy = (p: Pair, turn: number): Pair => {
  const r = (turn * Math.PI) / 180
  return [p[0] * Math.cos(r) - p[1] * Math.sin(r), p[0] * Math.sin(r) + p[1] * Math.cos(r)]
}

/** The notes of Grid's fit checks about any of `ids` in `plan`. */
function fitNotes(plan: FloorPlan, ids: ReadonlySet<string>): Issue[] {
  return validatePlan(plan).issues.filter((issue) => DOES_NOT_FIT.has(issue.code) && (ids.has(issue.id) || ((issue as { readonly hits?: readonly string[] }).hits ?? []).some((hit) => ids.has(hit))))
}

/** One place tried for a set. */
interface Trial {
  readonly records: RawRecord[]
  readonly copy: LibraryItem[]
  readonly notes: Issue[]
  readonly where: string
}

/**
 * The set's items placed as drawn with its back on `side` of the box `[x0, y0, x1, y1]`, `along`
 * metres from that side's start (its left, looking out of the set's front), or null when it is
 * larger than the box.
 */
function asDrawn(library: Library, parts: FoundRoom['room']['items'], box: readonly [number, number, number, number], side: Side, along: number, floor: string | undefined, taken: Set<string>): { records: RawRecord[]; copy: LibraryItem[] } {
  const [x0, y0, x1, y1] = box
  const turn = TURN_OF[side]
  // The set's inside back-left corner, its x along the side and its y into the room.
  const corner: Pair = side === 'south' ? [x0 + along, y0] : side === 'east' ? [x1, y0 + along] : side === 'north' ? [x1 - along, y1] : [x0, y1 - along]
  const records: RawRecord[] = []
  const copy: LibraryItem[] = []
  for (const part of parts) {
    const off = turnedBy(part.at, turn)
    const placed = placeFromLibrary(
      library,
      { name: part.library, at: [corner[0] + off[0], corner[1] + off[1]], turn: turn + (part.turn ?? 0), ...(floor === undefined ? {} : { floor }), ...(part.label === undefined ? {} : { own: { label: part.label } }) },
      taken
    )
    for (const record of placed.items) {
      taken.add(record['id'] as string)
      records.push({ ...record })
    }
    copy.push(...placed.copy)
  }
  return { records, copy }
}

/** Furnishes the rooms the request names, or every room with a usual set and no item yet. */
export function furnishRooms(survey: Survey, library: Library, request: FurnishRequest, problems: readonly string[] = []): Patch {
  const stated = survey.plan
  const sets = request.sets ?? {}
  for (const [room, set] of Object.entries(sets)) {
    if (!library.rooms.has(set)) {
      const meant = likelyId(set, [...library.rooms.keys()])
      throw new EditRefused(`No library holds a typical room named ${quoted(set)} for room ${quoted(room)}.${meant === null ? '' : ` Did you mean ${quoted(meant)}?`} grid_measure what=library lists them.`)
    }
  }
  const shapesBefore = roomShapes(indexPlan(stated))
  const holding = new Set((stated.items ?? []).map((item) => itemRoom(item, shapesBefore)?.id).filter((id): id is string => id !== undefined))
  const named = request.rooms !== undefined
  const targets = named
    ? [...new Set([...request.rooms!, ...Object.keys(sets)])]
    : stated.rooms.filter((room) => sets[room.id] !== undefined || (room.use !== undefined && USUAL_SETS[room.use] !== undefined && !holding.has(room.id))).map((room) => room.id)
  const passedOver = named ? [] : stated.rooms.filter((room) => sets[room.id] === undefined && room.use !== undefined && USUAL_SETS[room.use] !== undefined && holding.has(room.id))

  const added: RawRecord[] = []
  const copies = new Map<string, LibraryItem>()
  const taken = new Set([...stated.walls, ...stated.rooms, ...stated.openings, ...(stated.items ?? []), ...(stated.columns ?? [])].map((part) => part.id))
  const rooms: Furnished[] = []
  const said: string[] = problems.map((problem) => `Left out of the library: ${problem}.`)
  const near = tolerance('noLength')
  // Rooms set out item by item with something that fits nowhere.
  const short: string[] = []

  for (const id of targets) {
    const room = stated.rooms.find((r) => r.id === id)
    if (room === undefined) throw new EditRefused(`The plan has no room ${quoted(id)}.`)
    const called = quoted(roomCalled(room))
    const choices = sets[id] !== undefined ? [sets[id]!] : room.use === undefined ? [] : [...(USUAL_SETS[room.use] ?? [])]
    if (choices.length === 0) {
      said.push(`Room ${called} not furnished: Grid has no usual set for ${room.use === undefined ? 'a room with no use' : `its use, ${room.use}`}. Name one in sets, such as {"${id}": "double-bedroom"}.`)
      rooms.push({ room: id, set: null, how: 'not-furnished', placed: [] })
      continue
    }
    const polygon = survey.byId.get(id)?.polygon ?? []
    if (polygon.length < 3) {
      said.push(`Room ${called} not furnished: Grid cannot draw it, so it has no sides to set a set against (grid_check says why).`)
      rooms.push({ room: id, set: null, how: 'not-furnished', placed: [] })
      continue
    }
    const box = [Math.min(...polygon.map((p) => p.x)), Math.min(...polygon.map((p) => p.y)), Math.max(...polygon.map((p) => p.x)), Math.max(...polygon.map((p) => p.y))] as const
    const across = box[2] - box[0]
    const deep = box[3] - box[1]
    const sides: Side[] = across >= deep ? ['north', 'south', 'east', 'west'] : ['east', 'west', 'north', 'south']

    // The kinds the room holds already, with what this call has added, are left out of its set.
    const now = readingAfter(stated, { ...emptyPatch([]), addItems: [...added] })
    const shapes = roomShapes(indexPlan(now))
    const held = new Set((now.items ?? []).filter((item) => itemRoom(item, shapes)?.id === id).map((item) => item.kind))

    let kept: { trial: Trial; set: string } | null = null
    let best: { trial: Trial; set: string } | null = null
    let allHeld = true
    search: for (const set of choices) {
      const found = library.rooms.get(set)!
      const parts = found.room.items.filter((part) => {
        const kind = library.items.get(part.library)?.entry.kind
        return kind === undefined || !held.has(kind)
      })
      if (parts.length === 0) continue
      allHeld = false
      const [w, d] = found.room.size
      for (const side of sides) {
        const length = side === 'south' || side === 'north' ? across : deep
        const depth = side === 'south' || side === 'north' ? deep : across
        if (w > length + near || d > depth + near) continue
        const ends = side === 'south' || side === 'north' ? (['west', 'east'] as const) : (['south', 'north'] as const)
        // Its start is its left looking into the room: west on the south side, east on the north.
        const startEnd = side === 'south' ? 'west' : side === 'north' ? 'east' : side === 'east' ? 'south' : 'north'
        const places: { along: number; where: string }[] = [{ along: (length - w) / 2, where: 'centred on it' }]
        if (length - w > near) for (const end of ends) places.push({ along: end === startEnd ? 0 : length - w, where: `at its ${end} end` })
        for (const place of places) {
          const trying = new Set(taken)
          let made: { records: RawRecord[]; copy: LibraryItem[] }
          try {
            made = asDrawn(library, parts, box, side, place.along, room.floor, trying)
          } catch (error) {
            if (error instanceof LibraryRefused) throw new EditRefused(`Can't furnish room ${called} with ${quoted(set)}: ${error.message}.`)
            throw error
          }
          const after = readingAfter(stated, { ...emptyPatch([]), addItems: [...added, ...made.records] })
          const notes = fitNotes(after, new Set(made.records.map((record) => record['id'] as string)))
          const trial: Trial = { records: made.records, copy: made.copy, notes, where: `its back against the ${side} side, ${place.where}` }
          if (notes.length === 0) {
            kept = { trial, set }
            break search
          }
          if (best === null || notes.length < best.trial.notes.length) best = { trial, set }
        }
      }
    }

    if (allHeld) {
      said.push(`Room ${called} not furnished: it already holds every kind of ${listed(choices.map((set) => quoted(set)), 4)}.`)
      rooms.push({ room: id, set: null, how: 'not-furnished', placed: [] })
      continue
    }
    if (kept !== null) {
      const ids = kept.trial.records.map((record) => record['id'] as string)
      for (const record of kept.trial.records) added.push(record)
      for (const id of ids) taken.add(id)
      for (const entry of kept.trial.copy) copies.set(entry.name, entry)
      const leftOut = library.rooms.get(kept.set)!.room.items.length - kept.trial.records.length
      said.push(`Furnished room ${called} with typical room ${quoted(kept.set)} as it is drawn, ${kept.trial.where}: ${listed(ids.map((one) => quoted(one)), 8)}${leftOut > 0 ? `, leaving out ${leftOut} item${leftOut === 1 ? '' : 's'} of kinds the room already holds` : ''}${kept.set === choices[0] ? '' : `; ${quoted(choices[0]!)} fits nowhere in it`}.`)
      rooms.push({ room: id, set: kept.set, how: 'as-drawn', placed: ids })
      continue
    }

    // As drawn it fits nowhere: a set of fixtures goes item by item against the sides; furniture is left out.
    const first = library.rooms.get(choices[0]!)!
    const fixtures = first.room.items.every((part) => {
      const kind = library.items.get(part.library)?.entry.kind
      return kind !== undefined && takesFloor(kind)
    })
    const why = best === null ? `${quoted(choices[choices.length - 1]!)} is ${library.rooms.get(choices[choices.length - 1]!)!.room.size.map((size) => size.toFixed(2)).join(' × ')} m, larger than the room` : `at best, ${best.trial.notes[0]!.message.replace(/\.$/, '')}`
    if (!fixtures) {
      said.push(`Room ${called} not furnished: ${listed(choices.map((set) => quoted(set)), 4)} ${choices.length === 1 ? 'fits' : 'fit'} nowhere in it as drawn (${why}). Place its pieces with grid_place_item items, or grid_add_item against a side.`)
      rooms.push({ room: id, set: null, how: 'not-furnished', placed: [] })
      continue
    }
    try {
      const patch = addFixtureSet(survey, library, { name: choices[0]!, room: id }, added)
      const records = (patch.addItems ?? []) as RawRecord[]
      const ids = records.map((record) => record['id'] as string)
      for (const record of records) added.push(record)
      for (const one of ids) taken.add(one)
      for (const entry of (patch.addLibrary ?? []) as unknown as LibraryItem[]) copies.set(entry.name, entry)
      said.push(`Room ${called}: ${quoted(choices[0]!)} fits nowhere in it as drawn (${why}), so its items were set out one by one against its sides.`, ...patch.said)
      rooms.push({ room: id, set: choices[0]!, how: 'item-by-item', placed: ids })
      if (((patch.extra?.['notPlaced'] as readonly string[] | undefined) ?? []).length > 0) short.push(id)
    } catch (error) {
      if (!(error instanceof EditRefused)) throw error
      said.push(`Room ${called} not furnished: ${error.message}`)
      rooms.push({ room: id, set: null, how: 'not-furnished', placed: [] })
    }
  }

  if (passedOver.length > 0) said.push(`Not furnished, as they hold items already: ${listed(passedOver.map((room) => quoted(roomCalled(room))), 8)}. Name them in rooms to add the kinds they lack.`)
  if (added.length === 0) {
    if (targets.length === 0) throw new EditRefused(`No room to furnish: no room's use has a usual set, or each such room holds items already. ${said.join(' ')} Name rooms, and sets for rooms of other uses.`.replace(/\s+$/, ''))
    throw new EditRefused(`Nothing was furnished. ${said.join(' ')}`)
  }
  const placed = rooms.flatMap((room) => room.placed)
  const notFurnished = rooms.filter((room) => room.how === 'not-furnished').map((room) => room.room)
  said.unshift(`Furnished ${rooms.length - notFurnished.length} of ${rooms.length} room${rooms.length === 1 ? '' : 's'} with ${placed.length} item${placed.length === 1 ? '' : 's'}, each set where Grid's checks find it clear of the walls, the doors and the other items: a first set-out to move from.`)
  const patch: Patch = { ...emptyPatch(said), addItems: added, ...(copies.size === 0 ? {} : { addLibrary: [...copies.values()].map((entry) => ({ ...entry })) }) }
  return { ...patch, extra: { placed, rooms, notFurnished, fits: notFurnished.length === 0 && short.length === 0 } }
}
