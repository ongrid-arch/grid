/**
 * The changes the tool server can make to a plan: change, move or remove one opening, move one
 * side of a room, and mirror the whole plan. The room edits (merge, split, add, stretch, rename;
 * WRT-3) are in their own files beside this one and use the same patch.
 *
 * Each works out a patch from the plan as Grid reads it, and the patch is applied twice: to that
 * plan, to say what the change did, and to the file's own JSON, so that everything the change
 * does not touch is written back exactly as it was, keys Grid does not know included.
 *
 * Pure: no file is read or written here. A change that can't be made is refused with
 * `EditRefused`, saying why and what would fit; nothing is half done.
 */
import { planHasTypes, cameraRecord, compassBearing, doorKindOf, dot, drawingBearing, handingFromRooms, kindFits, kindWords, planOrientation, statedKind, storedView, sub, swingNeeds, tolerance, viewSetting, wallAxis, wallLength, wrapDegrees, type FloorPlan, type HandSide, type Opening, type OpeningAnchor, type Room, type StoredView, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { english, name, said as sentence } from '@ongrid/floorplan/messages'
import { DOOR_KINDS, FloorPlanSchema, WINDOW_KINDS, centreFromFace, faceFromCentre, statedItem, statedOpening, statedWall, wallWithEnds, type OpeningKind } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import { surveyPlan, type Survey } from '../quantities/survey'
import { EditRefused } from './refused'
import { COMPASS, pt, r3, roomFaceAlong, seatOpenings } from './seat'

export { EditRefused }

type Pair = [number, number]
type RawRecord = Record<string, unknown>

/** A change to one opening. `null` takes a key out. */
export type OpeningChange = Partial<{ [K in 'offset' | 'type' | 'hinge' | 'swing' | 'wall' | 'phase']: Opening[K] }> & {
  /** CNT-15: null takes the opening's own size out, so its door or window type's is read. */
  width?: number | null
  height?: number | null
  sill?: number | null
  anchor?: OpeningAnchor | null
  kind?: OpeningKind | null
  opens?: Opening['opens'] | null
  /** CNT-15: the door or window type it takes; null takes it out. */
  doorType?: string | null
  windowType?: string | null
}

/** A change to one room. `null` takes a key out. `partOf` makes it a zone of that room (CNT-8). */
export type RoomChange = {
  boundary?: string[]
  name?: string
  use?: string | null
  partOf?: string | null
  properties?: Readonly<Record<string, string | number | boolean>>
  /** CNT-10: a room taken out of a plan with phases stays, to be demolished. */
  phase?: Room['phase']
  /** CNT-15: its finishes, by surface; null takes them all out. */
  finishes?: Readonly<Record<string, string>> | null
  /** ARE-60: heated or cooled, or not; null leaves it to the room's use. */
  conditioned?: boolean | null
}

/** What a change does, by id. */
export interface Patch {
  /**
   * Walls changed, by id: their centre line's new ends, as Grid reads the plan, and their kind.
   * HND-11: `mirrored` turns a wall placed by its face over to its other face, as a mirror does.
   * CNT-18: `arc`, a curved wall's new centre and sweep.
   */
  readonly walls: ReadonlyMap<string, { start?: Pair; end?: Pair; kind?: Wall['kind'] | null; mirrored?: boolean; arc?: { centre: Pair; sweep: number }; phase?: Wall['phase']; wallType?: string | null; thickness?: number | null; height?: null }>
  readonly openings: ReadonlyMap<string, OpeningChange>
  readonly removeOpenings: ReadonlySet<string>
  readonly rooms: ReadonlyMap<string, RoomChange>
  /** CNT-3: the plan's own fields set (`north`, `site`). `null` takes a key out. Left out by a change that sets none. */
  readonly plan?: Readonly<Record<string, unknown>>
  /** CNT-12: fixtures moved or turned, by id. Left out by a change that moves none. */
  readonly items?: ReadonlyMap<string, { at: Pair; turn: number }>
  /** CNT-20: items added at the end of the list, as their file will hold them (placed from the library by name). */
  readonly addItems?: readonly RawRecord[]
  /** CNT-20 (C30): library entries the plan takes in, at the end of its `library`. */
  readonly addLibrary?: readonly RawRecord[]
  /**
   * WRT-4 with LVL-8: the opening patterns, by id, whose door swings the other way (a mirror), as
   * each plain door's does. A pattern is otherwise kept as the file has it: its wall keeps its id,
   * start and end, so its places along the wall and its floors hold through a mirror or a turn.
   */
  readonly swingPatterns?: ReadonlySet<string>
  /**
   * WRT-24: other parts changed, by the list they are in and their id: each field given is set in
   * the file's own record (`null` takes it out), so the rest of the record stays as written.
   */
  readonly parts?: ReadonlyMap<PartList, ReadonlyMap<string, Readonly<Record<string, unknown>>>>
  /** One line per thing changed, in Grid's words. */
  readonly said: readonly string[]
  /** Walls taken out; walls added go where the first one taken out was, or at the end. */
  readonly removeWalls?: ReadonlySet<string>
  readonly addWalls?: readonly RawRecord[]
  readonly removeRooms?: ReadonlySet<string>
  readonly addRooms?: readonly RawRecord[]
  readonly addOpenings?: readonly RawRecord[]
  /** What the request left open and Grid chose. */
  readonly guessed?: readonly string[]
  /** What the change could not keep as it was. */
  readonly notKept?: readonly string[]
  /** Rooms that are now part of another, by id: a door that joined the old one joins the new. */
  readonly roomsBecome?: ReadonlyMap<string, string>
  /**
   * WRT-11: the change turns the whole plan over or round (a mirror, a turn), so its answer may
   * call the result the same building mirrored or turned. Every other change is made in place.
   */
  readonly whole?: true
  /** Anything else the answer carries as data. */
  readonly extra?: Readonly<Record<string, unknown>>
}

/**
 * Names in a sentence, at most `max` of them and then how many more, so an answer stays the
 * same size on a flat and on a block (lab AU6-3).
 */
export function listed(names: readonly string[], max = 3): string {
  const shown = names.length > max ? [...names.slice(0, max - 1), `${names.length - max + 1} more`] : [...names]
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

/** CNT-18: the edits that change straight walls only, by the key of the words that name them (`edit.curved.doing.*`). */
export type CurvedEdit = 'placeOpening' | 'moveSide' | 'addRoom' | 'mergeRooms' | 'splitRoom' | 'squareScan' | 'stretch' | 'thickness'

/**
 * CNT-18: Grid's edits change straight walls only. An edit that would move, cut or measure a curved
 * wall along a side of a room is refused, naming the wall, before anything is changed. MSG-11:
 * the words are keys of the message files, said in English as the edits' answers are.
 */
export function refuseCurved(walls: Iterable<{ readonly id: string; readonly arc?: unknown } | null | undefined>, doing: CurvedEdit): void {
  for (const wall of walls) {
    if (wall === null || wall === undefined || wall.arc === undefined) continue
    throw new EditRefused(english(sentence('edit.curved.refused', { wall: name(wall.id), doing: sentence(`edit.curved.doing.${doing}`) })))
  }
}

/** WRT-24: the lists of parts a patch's `parts` may change; `site.things` is the site's things. */
export type PartList = 'columns' | 'grids' | 'bays' | 'stairs' | 'ramps' | 'patterns' | 'site.things'

export function emptyPatch(said: string[]): Patch {
  return { walls: new Map(), openings: new Map(), removeOpenings: new Set(), rooms: new Map(), said }
}

function merged(record: RawRecord, change: Readonly<Record<string, unknown>>): RawRecord {
  const next: RawRecord = { ...record }
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) continue
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next
}

/**
 * The plan as Grid reads it after the patch (WRT-6). A wall the patch adds is written as its file
 * will hold it, which may leave out its height; here it is read as the file will be, its floor's
 * height or the default filled in, so the checks and the answer measure what the plan will be.
 */
export function readingAfter(plan: FloorPlan, patch: Patch): FloorPlan {
  const read = (wall: RawRecord, types?: unknown): RawRecord => {
    const parsed = FloorPlanSchema.safeParse({ version: '1', walls: [wall], ...(plan.floors !== undefined ? { floors: plan.floors } : {}), ...(types !== undefined ? { types } : {}) })
    return parsed.success ? (parsed.data.walls[0] as unknown as RawRecord) : wall
  }
  const reading = patch.addWalls === undefined ? patch : { ...patch, addWalls: patch.addWalls.map((wall) => read(wall)) }
  // WRT-38: a straight wall placed by its face, or one whose change states a value the reading
  // filled in, is changed as its file states it and read again as the written file will be, so
  // a face stays where its file puts it whatever the thickness becomes.
  const restated = new Set(plan.walls.filter((wall) => asWritten(wall, patch.walls.get(wall.id))).map((wall) => wall.id))
  const before = restated.size === 0 ? plan : { ...plan, walls: plan.walls.map((wall) => (restated.has(wall.id) ? statedWall(wall) : wall)) }
  const patched = applyPatch(before as unknown as RawRecord, reading) as unknown as FloorPlan
  const types = isRecordLike(patch.plan) && patch.plan['types'] !== undefined ? patch.plan['types'] : plan.types
  const applied = restated.size === 0 ? patched : { ...patched, walls: patched.walls.map((wall) => (restated.has(wall.id) ? (read(wall as unknown as RawRecord, types) as unknown as Wall) : wall)) }
  // CNT-15 (C24): with named types, a part takes what its type gives as the file will be read, so
  // the plan is read again from what each part states: a changed type reaches every part of it.
  // CNT-20 (C30): an item placed by name takes its size from its library entry, as the file will be read.
  const placed = (patch.addItems ?? []).length > 0
  if (!placed && !planHasTypes(plan) && !(isRecordLike(patch.plan) && patch.plan['types'] !== undefined)) return applied
  const again = FloorPlanSchema.safeParse({
    ...applied,
    walls: applied.walls.map(statedWall),
    openings: applied.openings.map(statedOpening),
    ...(applied.items === undefined ? {} : { items: applied.items.map(statedItem) }),
  })
  return again.success ? again.data : applied
}

const isRecordLike = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * WRT-38: whether a change to a wall is made to the wall as its file states it: a straight wall
 * placed by its face (HND-11), or one the change gives a value the reading filled in (`unstated`,
 * `typed`). A curved wall is left to its own reading (CNT-18).
 */
function asWritten(wall: Wall, change: Readonly<Record<string, unknown>> | undefined): boolean {
  if (change === undefined || wall.arc !== undefined) return false
  if (wall.placedBy !== undefined) return true
  const filled: readonly string[] = [...(wall.unstated ?? []), ...(wall.typed ?? [])]
  return Object.entries(change).some(([key, value]) => value !== undefined && value !== null && filled.includes(key))
}

/** Applies a patch to a plan's JSON, the file's own or Grid's reading of it, without changing anything else. */
export function applyPatch<T extends RawRecord>(raw: T, patch: Patch): T {
  const list = (key: string): RawRecord[] => (Array.isArray(raw[key]) ? (raw[key] as RawRecord[]) : [])
  const removeWalls = patch.removeWalls ?? new Set<string>()
  const walls: RawRecord[] = []
  let placed = false
  for (const wall of list('walls')) {
    if (removeWalls.has(wall['id'] as string)) {
      if (!placed) walls.push(...(patch.addWalls ?? []))
      placed = true
      continue
    }
    const change = patch.walls.get(wall['id'] as string)
    if (!change) {
      walls.push(wall)
      continue
    }
    // HND-11: the ends are centre points; a wall its file places by its face keeps that face.
    const { start, end, mirrored, ...rest } = change
    // CNT-18: a curved wall's face is written round its new arc.
    const moved = start !== undefined || end !== undefined || mirrored === true ? wallWithEnds(wall, { start, end, arc: rest.arc }, mirrored === true) : wall
    walls.push(merged(moved, rest))
  }
  if (!placed) walls.push(...(patch.addWalls ?? []))
  const openings = list('openings')
    .filter((o) => !patch.removeOpenings.has(o['id'] as string))
    .map((o) => {
      const change = patch.openings.get(o['id'] as string)
      if (!change) return o
      const next = merged(o, change)
      // A door's hinge and swing say nothing on anything else.
      if (next['type'] !== 'door') {
        delete next['hinge']
        delete next['swing']
      }
      // CNT-14: nor does a kind its new type does not take, or a part that opens on a doorless opening.
      if (typeof next['kind'] === 'string' && !kindFits(next['type'] as Opening['type'], next['kind'])) delete next['kind']
      if (next['type'] === 'opening') delete next['opens']
      return next
    })
  openings.push(...(patch.addOpenings ?? []))
  const removeRooms = patch.removeRooms ?? new Set<string>()
  const rooms = list('rooms')
    .filter((room) => !removeRooms.has(room['id'] as string))
    .map((room) => {
      const change = patch.rooms.get(room['id'] as string)
      return change ? merged(room, change) : room
    })
  rooms.push(...(patch.addRooms ?? []))
  // A plan with no items keeps no key.
  const moved = patch.items === undefined || !Array.isArray(raw['items'])
    ? {}
    : {
        items: list('items').map((item) => {
          const change = patch.items!.get(item['id'] as string)
          return change ? { ...item, ...change } : item
        }),
      }
  // CNT-20: items placed by name go at the end, and the library entries they need with them.
  const added = patch.addItems ?? []
  const items = added.length === 0 ? moved : { items: [...((moved as { items?: RawRecord[] }).items ?? list('items')), ...added] }
  const library = (patch.addLibrary ?? []).length === 0 ? {} : { library: [...list('library'), ...patch.addLibrary!] }
  // LVL-8: a pattern's door swings the other way with every plain door's; a plan with no patterns keeps no key.
  const swing = patch.swingPatterns
  const patterns = swing === undefined || swing.size === 0 || !Array.isArray(raw['patterns'])
    ? {}
    : {
        patterns: list('patterns').map((pattern) => {
          const opening = pattern['opening'] as RawRecord | undefined
          const side = opening?.['swing']
          if (!swing.has(pattern['id'] as string) || (side !== 'left' && side !== 'right')) return pattern
          return { ...pattern, opening: { ...opening, swing: side === 'left' ? 'right' : 'left' } }
        }),
      }
  const top = (patch.plan === undefined ? raw : merged(raw, patch.plan)) as T
  // WRT-24: other parts' fields, merged into their records by id; a list the plan lacks stays out.
  const parts: RawRecord = {}
  for (const [key, changes] of patch.parts ?? []) {
    const records = (from: unknown): RawRecord[] | null => (Array.isArray(from) ? (from as RawRecord[]).map((part) => {
      const change = changes.get(part['id'] as string)
      return change === undefined ? part : merged(part, change)
    }) : null)
    if (key === 'site.things') {
      const site = (parts['site'] ?? top['site']) as RawRecord | undefined
      const things = records(site?.['things'])
      if (site !== undefined && things !== null) parts['site'] = { ...site, things }
      continue
    }
    const list = records(key === 'patterns' ? ((patterns as RawRecord)['patterns'] ?? top[key]) : top[key])
    if (list !== null) parts[key] = list
  }
  return { ...top, walls, openings, rooms, ...items, ...library, ...patterns, ...parts }
}

/** The free stretches of a wall, measured from its start, between the other openings in it. */
function freeStretches(plan: FloorPlan, wall: Wall, skip: string): Array<[number, number]> {
  const length = wallLength(wall)
  const taken = plan.openings
    .filter((o) => o.wall === wall.id && o.id !== skip)
    .map((o): [number, number] => [o.offset, o.offset + o.width])
    .sort((a, b) => a[0] - b[0])
  const free: Array<[number, number]> = []
  let at = 0
  for (const [lo, hi] of taken) {
    if (lo > at + tolerance('noLength')) free.push([at, lo])
    at = Math.max(at, hi)
  }
  if (length > at + tolerance('noLength')) free.push([at, length])
  return free
}

export const KEEPS = ['start', 'centre', 'end'] as const
export type Keep = (typeof KEEPS)[number]

export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** What an opening may be placed and kept from: an end of its wall, or a side. */
export const FROMS = ['start', 'end', ...DIRECTIONS] as const
export type From = (typeof FROMS)[number]

export interface OpeningChangeRequest {
  readonly width?: number
  readonly height?: number
  readonly sill?: number
  readonly type?: Opening['type']
  /** A room id, or "outside": the side a door opens toward. */
  readonly opensInto?: string
  readonly hinge?: Opening['hinge']
  readonly keep?: Keep
  readonly remove?: boolean
  /** WRT-3: the room it is placed from, and with `side`, the side of that room it goes in. */
  readonly room?: string
  readonly side?: Direction
  /** WRT-3: what its place is measured and kept from. */
  readonly from?: From
  /** WRT-3: metres from that end or face to its nearer edge. */
  readonly distance?: number
  /** CNT-14: its kind (`DOOR_KINDS`, `WINDOW_KINDS`), or null to take it out. */
  readonly kind?: OpeningKind | null
  /** CNT-14: the side a door is hinged on, as seen from `seenFrom`, else from the room it opens into. */
  readonly hinged?: HandSide
  /** CNT-14: the room, or "outside", `hinged` is seen from. */
  readonly seenFrom?: string
}

const sideName = (side: unknown): string | null => (typeof side === 'object' && side !== null && 'room' in side ? (side as { room: string }).room : side === 'outside' ? 'outside' : null)

/** The wall on one side of a room, or a refusal that says why there is not one. */
function wallOnSide(survey: Survey, roomId: string, side: Direction): { wall: Wall; lo: number; hi: number } {
  const room = survey.byId.get(roomId)!
  const name = quoted(room.facts.name)
  const out = COMPASS[side]
  const edges = room.edges.filter((edge) => {
    const d = sub(edge.to, edge.from)
    const n = { x: d.y / edge.length, y: -d.x / edge.length }
    return edge.wall !== null && Math.abs(dot(n, out) - 1) < 1e-3
  })
  if (edges.length === 0) throw new EditRefused(`${name} has no wall on its ${side} side.`)
  const walls = [...new Set(edges.map((edge) => edge.wall!))]
  if (walls.length > 1) throw new EditRefused(`The ${side} side of ${name} is ${walls.length} walls (${walls.map((w) => quoted(w.id)).join(', ')}); name the opening's place on one with from and distance after moving it there by hand.`)
  const wall = walls[0]!
  if (wall.virtual === true) throw new EditRefused(`The ${side} side of ${name} is a dividing line, not a wall: it takes no door or window.`)
  refuseCurved([wall], 'placeOpening')
  const axis = wallAxis(wall)
  const along = edges.flatMap((edge) => [dot(sub(edge.from, axis.start), axis.dir), dot(sub(edge.to, axis.start), axis.dir)])
  return { wall, lo: Math.min(...along), hi: Math.max(...along) }
}

export function changeOpening(survey: Survey, id: string, request: OpeningChangeRequest): Patch {
  const plan = survey.plan
  const opening = plan.openings.find((o) => o.id === id)!
  const wall = plan.walls.find((w) => w.id === opening.wall)
  if (!wall) throw new EditRefused('That opening names a wall the plan does not have; grid_check says more.')
  const label = `${opening.type} ${quoted(opening.id)}`
  if (request.remove) {
    const extra = Object.keys(request).filter((key) => key !== 'remove' && (request as Record<string, unknown>)[key] !== undefined)
    if (extra.length > 0) throw new EditRefused(`remove takes nothing else: leave out ${extra.join(', ')}.`)
    const patch = emptyPatch([`Removed ${label} (${opening.width.toFixed(2)} m wide); the wall is solid there now.`])
    ;(patch.removeOpenings as Set<string>).add(id)
    return patch
  }
  if (request.side !== undefined && request.room === undefined) throw new EditRefused('side names a side of a room: pass room with it.')
  if (request.room !== undefined && request.side === undefined && request.from === undefined) throw new EditRefused('room goes with side (the side of the room it moves to) or from (the side of the room it is measured from).')
  if (request.distance !== undefined && request.from === undefined) throw new EditRefused('distance is measured from something: pass from as well.')
  if (request.room !== undefined && (request.from === 'start' || request.from === 'end')) throw new EditRefused('With room, from is a side of that room: north, east, south or west.')

  const type = request.type ?? opening.type
  const width = request.width ?? opening.width
  const height = request.height ?? (request.type === 'door' && opening.type !== 'door' ? 2.1 : opening.height)
  const sill = request.sill ?? (request.type === 'door' && opening.type !== 'door' ? 0 : opening.sill)
  if (type !== 'door' && (request.opensInto !== undefined || request.hinge !== undefined || request.hinged !== undefined)) {
    throw new EditRefused(`Only a door opens into a room or hangs from a side; this would be ${type === 'opening' ? 'an' : 'a'} ${type}.`)
  }
  if (request.hinge !== undefined && request.hinged !== undefined) throw new EditRefused('Give hinge (an end of its wall) or hinged (left or right, as seen from a room), not both.')
  if (request.seenFrom !== undefined && request.hinged === undefined) throw new EditRefused('seen_from says where hinged is seen from: pass hinged as well.')
  // CNT-14: the kind it will be, which its type must take.
  if (request.kind != null && !kindFits(type, request.kind)) {
    throw new EditRefused(`A ${type === 'opening' ? 'doorless opening has no kind' : `${type} cannot be ${request.kind}: a ${type} is ${(type === 'door' ? DOOR_KINDS : WINDOW_KINDS).join(', ')}`}.`)
  }
  const kindAfter = request.kind === undefined ? statedKind(type, opening.kind) : request.kind

  // Which wall it is on after the change, and where along it.
  const guessed: string[] = []
  const target = request.side !== undefined ? wallOnSide(survey, request.room!, request.side) : null
  const onto = target?.wall ?? wall
  const moving = onto.id !== wall.id
  if (sill + height > onto.height + tolerance('noLength')) {
    throw new EditRefused(`A sill of ${sill.toFixed(2)} m and a height of ${height.toFixed(2)} m reach above the ${onto.height.toFixed(2)} m wall.`)
  }
  // CNT-18: on a curved wall an opening is placed along the curve, from its start or its end;
  // a side of the drawing or of a room is no way to measure along a curve.
  if (onto.arc !== undefined && request.from !== undefined && request.from !== 'start' && request.from !== 'end') {
    throw new EditRefused(english(sentence('edit.curved.along', { wall: name(onto.id), from: request.from })))
  }
  const axis = onto.arc === undefined ? wallAxis(onto) : null
  const length = wallLength(onto)
  const keep = request.keep ?? 'centre'
  let offset: number
  let anchor: OpeningAnchor | undefined
  let placedText = ''
  if (request.from !== undefined) {
    const from = request.from
    if (request.room !== undefined) {
      const compass = from as Direction
      const along = axis!
      if (Math.abs(dot(along.dir, COMPASS[compass])) < 0.3) {
        const runs = Math.abs(along.dir.x) > Math.abs(along.dir.y) ? 'east-west' : 'north-south'
        throw new EditRefused(`Wall ${quoted(onto.id)} runs ${runs}, so a place along it is measured from ${runs === 'east-west' ? 'east or west' : 'north or south'}, not from ${compass}.`)
      }
      const near = moving ? (target!.lo + target!.hi) / 2 : opening.offset + opening.width / 2
      const face = roomFaceAlong(survey, request.room, onto, compass, near)
      if (face === null) throw new EditRefused(`Room ${quoted(survey.byId.get(request.room)!.facts.name)} has no side along wall ${quoted(onto.id)} to measure from.`)
      const high = dot(along.dir, COMPASS[compass]) > 0
      const distance = request.distance ?? (moving ? null : high ? face - (opening.offset + opening.width) : opening.offset - face)
      if (distance === null) throw new EditRefused('Moving it to another wall needs distance: metres from that side of the room to its nearer edge.')
      offset = high ? face - distance - width : face + distance
      anchor = { from: compass, room: request.room }
      placedText = `${distance.toFixed(2)} m from the ${compass} side of ${quoted(survey.byId.get(request.room)!.facts.name)}`
    } else {
      const compassEnd = from === 'start' || from === 'end' ? from : Math.abs(dot(axis!.dir, COMPASS[from])) < 0.3 ? null : dot(axis!.dir, COMPASS[from]) > 0 ? 'end' : 'start'
      if (compassEnd === null) {
        const runs = Math.abs(axis!.dir.x) > Math.abs(axis!.dir.y) ? 'east-west' : 'north-south'
        throw new EditRefused(`Wall ${quoted(onto.id)} runs ${runs}: its ends are to the ${runs === 'east-west' ? 'east and west' : 'north and south'}, not the ${from}.`)
      }
      const distance = request.distance ?? (compassEnd === 'start' ? opening.offset : length - opening.offset - opening.width)
      offset = compassEnd === 'start' ? distance : length - distance - width
      anchor = { from }
      placedText = `${distance.toFixed(2)} m from the ${from === 'start' || from === 'end' ? `${from} of its wall` : `${from} end of its wall`}`
    }
  } else if (moving) {
    offset = (target!.lo + target!.hi) / 2 - width / 2
    guessed.push(`${label} is centred on the ${request.side} side of ${quoted(survey.byId.get(request.room!)!.facts.name)}: pass from and distance to place it.`)
  } else {
    offset = keep === 'start' ? opening.offset : keep === 'end' ? opening.offset + opening.width - width : opening.offset + (opening.width - width) / 2
  }

  const free = freeStretches(plan, onto, id)
  const fits = free.some(([lo, hi]) => offset >= lo - tolerance('joint') && offset + width <= hi + tolerance('joint'))
  if (!fits) {
    const room = free.filter(([lo, hi]) => hi - lo >= width - tolerance('joint'))
    const where = free.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m (${(hi - lo).toFixed(2)} m)`).join(', ')
    const hint = room.length > 0
      ? `A stretch that takes ${width.toFixed(2)} m: ${room.map(([lo, hi]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m`).join(', ')}; try keep start or end, or remove what is in the way first.`
      : `No stretch of this wall takes ${width.toFixed(2)} m; remove an opening in the way first.`
    const how = request.from !== undefined || moving ? `placed ${placedText || 'there'}` : `keeping its ${keep}`
    throw new EditRefused(`${label} can't be ${width.toFixed(2)} m wide ${how}: it would run from ${offset.toFixed(2)} to ${(offset + width).toFixed(2)} m along its ${length.toFixed(2)} m wall ${quoted(onto.id)}. Free stretches, from the wall's start: ${where || 'none'}. ${hint}`)
  }

  const change: OpeningChange = {}
  const said: string[] = []
  if (type !== opening.type) {
    change.type = type
    said.push(`${label} is now a ${type}.`)
  }
  if (moving) {
    change.wall = onto.id
    change.offset = r3(offset)
    said.push(`Moved ${label} to wall ${quoted(onto.id)}, the ${request.side} side of ${quoted(survey.byId.get(request.room!)!.facts.name)}${placedText ? `, ${placedText}` : ''}.`)
  } else if (Math.abs(offset - opening.offset) > tolerance('noLength')) {
    change.offset = r3(offset)
    if (request.from !== undefined) said.push(`${label} is now ${placedText}.`)
  }
  if (Math.abs(width - opening.width) > tolerance('noLength')) {
    change.width = r3(width)
    change.offset = r3(offset)
    said.push(`${label} width ${opening.width.toFixed(2)} → ${width.toFixed(2)} m${request.from !== undefined || moving ? '' : `, keeping its ${keep}`}.`)
  }
  if (Math.abs(height - opening.height) > tolerance('noLength')) {
    change.height = r3(height)
    said.push(`${label} height ${opening.height.toFixed(2)} → ${height.toFixed(2)} m.`)
  }
  if (Math.abs(sill - opening.sill) > tolerance('noLength')) {
    change.sill = r3(sill)
    said.push(`${label} sill ${opening.sill.toFixed(2)} → ${sill.toFixed(2)} m.`)
  }
  if (anchor !== undefined && JSON.stringify(anchor) !== JSON.stringify(opening.anchor ?? null)) {
    change.anchor = anchor
    said.push(`${label} keeps its place from the ${anchor.room !== undefined ? `${anchor.from} side of ${quoted(survey.byId.get(anchor.room)!.facts.name)}` : anchor.from === 'start' || anchor.from === 'end' ? `${anchor.from} of its wall` : `${anchor.from} end of its wall`} when walls move.`)
  }
  if (moving && type === 'door' && opening.swing !== undefined && request.opensInto === undefined) {
    // A moved door keeps opening into the room it opened into, where that room is beside its new wall.
    const before = survey.facts.openings.get(id)?.sides.map(sideName) ?? []
    const into = before[opening.swing === 'left' ? 0 : 1] ?? null
    const trial = surveyPlan({ ...plan, openings: plan.openings.map((o) => (o.id === id ? { ...o, wall: onto.id, offset: r3(offset), width } : o)) })
    const now = trial.facts.openings.get(id)?.sides.map(sideName) ?? []
    const at = into === null ? -1 : now.indexOf(into)
    if (at >= 0) change.swing = at === 0 ? 'left' : 'right'
    else guessed.push(`${label} keeps its swing; the room it opened into is not beside its new wall, so check which way it opens.`)
  }
  if (request.opensInto !== undefined) {
    const facts = moving
      ? surveyPlan({ ...plan, openings: plan.openings.map((o) => (o.id === id ? { ...o, wall: onto.id, offset: r3(offset), width } : o)) }).facts.openings.get(id)
      : survey.facts.openings.get(id)
    const sides = facts?.sides.map(sideName) ?? []
    const at = sides.indexOf(request.opensInto)
    if (at < 0) {
      const names = sides.map((side) => (side === null ? 'nothing drawn' : side === 'outside' ? '"outside"' : quoted(side)))
      throw new EditRefused(`That door is between ${names.join(' and ')}: it can open into one of those only.`)
    }
    const swing = at === 0 ? 'left' : 'right'
    change.swing = swing
    // One leaf or a folding door needs the end it hangs from; a pair, or a door that slides, rolls or lifts, does not.
    if (opening.hinge === undefined && request.hinge === undefined && request.hinged === undefined && swingNeeds(doorKindOf(kindAfter)).hinge) change.hinge = 'start'
    if (swing !== opening.swing) said.push(`${label} now opens into ${request.opensInto === 'outside' ? 'the outside' : quoted(survey.facts.rooms.get(request.opensInto)?.name ?? request.opensInto)}.`)
  }
  if (request.hinge !== undefined && request.hinge !== opening.hinge) {
    change.hinge = request.hinge
    said.push(`${label} now hangs from the end nearer the wall's ${request.hinge}.`)
  }
  if (request.hinged !== undefined) {
    // CNT-14: left or right as seen from a room, turned into the wall's terms where the door will be.
    const placed: Opening = { ...opening, type, ...(moving ? { wall: onto.id } : {}), offset: change.offset ?? opening.offset, width, ...(change.swing !== undefined ? { swing: change.swing } : {}) }
    const after: FloorPlan = { ...plan, openings: plan.openings.map((o) => (o.id === id ? placed : o)) }
    const handing = handingFromRooms(after, placed, { hinged: request.hinged, ...(request.seenFrom !== undefined ? { seenFrom: request.seenFrom } : request.opensInto !== undefined ? { seenFrom: request.opensInto } : {}) })
    if ('refused' in handing) throw new EditRefused(handing.refused)
    if (handing.hinge !== undefined && handing.hinge !== opening.hinge) change.hinge = handing.hinge
    const from = request.seenFrom ?? request.opensInto
    const where = from === undefined ? 'the room it opens into' : from === 'outside' ? 'the outside' : quoted(survey.facts.rooms.get(from)?.name ?? from)
    said.push(`${label} is hinged on the ${request.hinged} as seen from ${where}.`)
  }
  if (request.kind !== undefined && request.kind !== (opening.kind ?? null)) {
    change.kind = request.kind
    said.push(request.kind === null ? `${label} states no kind now: ${type === 'door' ? 'one swinging leaf' : 'drawn as before'}.` : `${label} is now a ${kindWords(type === 'door' ? 'door' : 'window', request.kind)}.`)
  }
  if (said.length === 0) throw new EditRefused(`That is how ${label} is already: nothing to change.`)
  const patch: Patch = { ...emptyPatch(said), guessed }
  ;(patch.openings as Map<string, OpeningChange>).set(id, change)
  return patch
}

/** The size of a room's inside outline across one side: east-west for east or west, north-south for north or south. */
export function insideAcross(survey: Survey, roomId: string, side: Direction): number {
  const polygon = survey.byId.get(roomId)!.polygon
  const values = polygon.map((p) => (side === 'east' || side === 'west' ? p.x : p.y))
  return Math.max(...values) - Math.min(...values)
}

/**
 * Moves the wall on one side of a room straight out (or in, with a negative distance). Walls
 * that end on it follow, so the rooms beside it grow or shrink with it, and its openings move
 * with it. Openings on the walls that follow keep their anchor or their place in the building,
 * and a door that would join other rooms follows the move where it can (WRT-3). Only a side
 * square to the drawing can move: north, east, south or west.
 */
export function moveRoomSide(survey: Survey, roomId: string, side: Direction, by: number): Patch {
  const room = survey.byId.get(roomId)!
  const out = COMPASS[side]
  const edges = room.edges.filter((edge) => {
    const d = sub(edge.to, edge.from)
    const n = { x: d.y / edge.length, y: -d.x / edge.length }
    return edge.wall !== null && Math.abs(dot(n, out) - 1) < 1e-3
  })
  const name = quoted(room.facts.name)
  if (edges.length === 0) throw new EditRefused(`${name} has no side facing ${side}: its sides face ${[...new Set(room.edges.map((e) => compass(e)))].join(', ')}.`)
  // WRT-59: the room's outline runs a side split into walls in one line as one edge, which names one
  // of them: the others are the room's walls in line with it that lie along the edge.
  const named = [...new Set(edges.map((edge) => edge.wall!))]
  const edgeAlong = (edge: (typeof edges)[number], dir: Vec2): [number, number] => [dot(edge.from, dir), dot(edge.to, dir)]
  const first = named[0]!
  const firstAxis = first.arc === undefined ? wallAxis(first) : null
  const inLineWith = (w: Wall): boolean =>
    firstAxis !== null && w.arc === undefined && w.virtual !== true && (w.floor ?? 'ground') === (first.floor ?? 'ground') && Math.abs(dot(sub(pt(w.start), pt(first.start)), firstAxis.normal)) < first.thickness / 2 + 0.02 && Math.abs(dot(sub(pt(w.end), pt(first.start)), firstAxis.normal)) < first.thickness / 2 + 0.02
  const along = firstAxis === null ? [] : edges.flatMap((edge) => edgeAlong(edge, firstAxis.dir))
  // The outline runs along the room's inside faces, so a wall's centre-line ends lie up to its own thickness beyond it.
  const reach0 = first.thickness + 0.02
  const within = (w: Wall): boolean => firstAxis !== null && [w.start, w.end].every((p) => dot(pt(p), firstAxis.dir) > Math.min(...along) - reach0 && dot(pt(p), firstAxis.dir) < Math.max(...along) + reach0)
  const roomWalls = survey.plan.rooms.find((r) => r.id === roomId)?.boundary ?? []
  const together = survey.plan.walls.filter((w) => roomWalls.includes(w.id) && inLineWith(w) && within(w))
  const walls = [...new Set([...named, ...together])]
  const wall = walls[0]!
  if (walls.some((w) => w.virtual === true)) throw new EditRefused(`The ${side} side of ${name} is a dividing line, not a wall.`)
  refuseCurved(walls, 'moveSide')
  const v = { x: out.x * by, y: out.y * by }
  const plan: FloorPlan = survey.plan
  const floor = wall.floor ?? 'ground'
  // WRT-59: a side split for heights or kinds is several walls in one line, and moves as one: its
  // ends are the ends of the whole run. Walls that are not in one line are not offered.
  const baseStart = pt(wall.start)
  const baseAxis = wallAxis(wall)
  const reach = Math.max(...walls.map((w) => w.thickness)) / 2 + 0.02
  const alongBase = (p: Vec2): number => dot(sub(p, baseStart), baseAxis.dir)
  const offBase = (p: Vec2): number => Math.abs(dot(sub(p, baseStart), baseAxis.normal))
  if (walls.length > 1 && !walls.every((w) => (w.floor ?? 'ground') === floor && offBase(pt(w.start)) < reach && offBase(pt(w.end)) < reach)) {
    throw new EditRefused(`The ${side} side of ${name} is made of ${walls.length} walls that are not in one line; move one wall at a time is not offered yet.`)
  }
  const spans = walls.flatMap((w) => [alongBase(pt(w.start)), alongBase(pt(w.end))])
  const lo = Math.min(...spans)
  const hi = Math.max(...spans)
  const oldStart = { x: baseStart.x + baseAxis.dir.x * lo, y: baseStart.y + baseAxis.dir.y * lo }
  const oldEnd = { x: baseStart.x + baseAxis.dir.x * hi, y: baseStart.y + baseAxis.dir.y * hi }
  const axis = { ...baseAxis, length: hi - lo }
  const sideIds = new Set(walls.map((w) => w.id))
  // WRT-18: a wall ends on it when its end is on its centre line or within its body, as a wall
  // drawn to its face is, so that wall follows too. WRT-38: along it, within the other wall's own
  // half thickness of its ends: a wall placed by its inside face (HND-11) has its centre line end
  // that far past the corner.
  const onAxis = (p: Vec2, other: Wall): boolean => {
    const t = dot(sub(p, oldStart), axis.dir)
    const off = Math.abs(dot(sub(p, oldStart), axis.normal))
    const along = other.thickness / 2 + 0.02
    return off < reach && t > -along && t < axis.length + along
  }
  const moved = (p: Vec2): Pair => [r3(p.x + v.x), r3(p.y + v.y)]
  const patchWalls = new Map<string, { start?: Pair; end?: Pair }>()
  for (const w of walls) patchWalls.set(w.id, { start: moved(pt(w.start)), end: moved(pt(w.end)) })
  const followers: string[] = []
  const inLine: Wall[] = []
  for (const other of plan.walls) {
    if (sideIds.has(other.id) || (other.floor ?? 'ground') !== floor) continue
    const s = pt(other.start)
    const e = pt(other.end)
    const change: { start?: Pair; end?: Pair } = {}
    // A wall in line with the side that runs on past the room is not one that ends on it: it keeps
    // its place, and the walls that meet the side square carry its end (checked below).
    const straight = other.arc === undefined
    if (straight && Math.abs(dot(sub(s, oldStart), axis.normal)) < reach && Math.abs(dot(sub(e, oldStart), axis.normal)) < reach) {
      inLine.push(other)
      continue
    }
    if (onAxis(s, other) && !onAxis(e, other)) change.start = moved(s)
    if (onAxis(e, other) && !onAxis(s, other)) change.end = moved(e)
    if (!change.start && !change.end) continue
    refuseCurved([other], 'moveSide')
    const ns = change.start ? pt(change.start) : s
    const ne = change.end ? pt(change.end) : e
    const oldAxis = wallAxis(other)
    const nd = sub(ne, ns)
    const nl = Math.hypot(nd.x, nd.y)
    if (nl < 0.05) throw new EditRefused(`Moving it ${by.toFixed(2)} m would leave wall ${quoted(other.id)} with no length.`)
    if (Math.abs(dot({ x: nd.x / nl, y: nd.y / nl }, oldAxis.dir) - 1) > 1e-6) {
      throw new EditRefused(`Wall ${quoted(other.id)} ends on it at an angle, and would turn; Grid moves only walls that meet it square.`)
    }
    patchWalls.set(other.id, change)
    followers.push(other.id)
  }
  // An in-line wall that touches an end of the side stays put, so a wall that meets the side square
  // must carry that end; with none, moving would leave a step nothing closes.
  for (const other of inLine) {
    for (const end of [oldStart, oldEnd]) {
      const touches = [pt(other.start), pt(other.end)].some((p) => Math.hypot(p.x - end.x, p.y - end.y) < reach)
      if (!touches) continue
      const carried = followers.some((id) => {
        const f = plan.walls.find((w) => w.id === id)!
        return [pt(f.start), pt(f.end)].some((p) => Math.hypot(p.x - end.x, p.y - end.y) < reach)
      })
      if (!carried) throw new EditRefused(`Wall ${quoted(other.id)} runs on in line with the ${side} side of ${name} and meets it with no wall across, so moving the side ${by.toFixed(2)} m would leave a step in the line. Move wall ${quoted(other.id)} with it (grid_move_room_side on the room it bounds), or add a wall across first.`)
    }
  }
  // A point on the moved wall moves with it; everything else stays where it is.
  const seated = seatOpenings(survey, patchWalls, (p, onWall) => (sideIds.has(onWall) ? { x: p.x + v.x, y: p.y + v.y } : p), { shift: v, what: `moving it ${by.toFixed(2)} m` })
  const patchOpenings = new Map<string, OpeningChange>()
  for (const [id, offset] of seated.offsets) {
    const o = plan.openings.find((x) => x.id === id)!
    if (Math.abs(offset - o.offset) > tolerance('noLength')) patchOpenings.set(id, { offset })
  }
  const said = [
    `Moved ${walls.length === 1 ? `wall ${quoted(wall.id)}` : `walls ${listed(walls.map((w) => quoted(w.id)))}, in one line`}, the ${side} side of ${name}, ${Math.abs(by).toFixed(2)} m ${by >= 0 ? side : `back from the ${side}`}${followers.length > 0 ? `; walls that end on it followed: ${listed(followers.map((id) => quoted(id)))}` : ''}.`,
  ]
  const others = survey.rooms.filter((r) => r.facts.id !== roomId && r.edges.some((edge) => edge.wall !== null && sideIds.has(edge.wall.id))).map((r) => quoted(r.facts.name))
  const guessed = [...seated.guessed]
  if (others.length > 0) guessed.unshift(`${others.length > 2 ? `${others[0]} and ${others.length - 1} other rooms` : others.join(' and ')} ${by >= 0 ? (others.length === 1 ? 'gives' : 'give') : others.length === 1 ? 'takes' : 'take'} the ${Math.abs(by).toFixed(2)} m: the wall is ${others.length === 1 ? 'its' : 'their'} side too.`)
  return { walls: patchWalls, openings: patchOpenings, removeOpenings: new Set(), rooms: new Map(), said, guessed, notKept: seated.notKept }
}

/**
 * WRT-38: one wall's thickness. A wall placed by its face (HND-11) keeps that face, as its file
 * states it, and grows or shrinks away from it; any other wall keeps its centre line (C1). A wall
 * that ended within the old body and would end short of the new one is carried along its own line
 * to the new centre line, so it stays joined. A dividing line has no thickness; a curved wall is
 * left to the file.
 */
export function changeWallThickness(survey: Survey, wallId: string, thickness: number): Patch {
  const plan = survey.plan
  const wall = plan.walls.find((w) => w.id === wallId)
  if (wall === undefined) throw new EditRefused(`The plan has no wall ${quoted(wallId)}.`)
  if (wall.virtual === true) throw new EditRefused(`Wall ${quoted(wallId)} is a dividing line, which has no thickness.`)
  refuseCurved([wall], 'thickness')
  const own = !(wall.unstated ?? []).includes('thickness') && !(wall.typed ?? []).includes('thickness')
  if (own && Math.abs(wall.thickness - thickness) < tolerance('noLength')) throw new EditRefused(`Wall ${quoted(wallId)} is already ${thickness.toFixed(2)} m thick.`)
  // The centre line after: the same, or half the change away from the face the file places it by.
  const face = wall.placedBy
  const oldStart = pt(wall.start)
  const newAt = face === undefined ? oldStart : pt(centreFromFace(...faceFromCentre(wall.start, wall.end, face, wall.thickness), face, thickness)[0])
  const axis = wallAxis(wall)
  const within = (p: Vec2, at: Vec2, half: number, other: Wall): boolean => {
    const along = dot(sub(p, at), axis.dir)
    const reachAlong = other.thickness / 2 + 0.02
    return Math.abs(dot(sub(p, at), axis.normal)) < half + 0.02 && along > -reachAlong && along < axis.length + reachAlong
  }
  const walls = new Map<string, { start?: Pair; end?: Pair; thickness?: number }>([[wall.id, { thickness }]])
  const carried: string[] = []
  const floor = wall.floor ?? 'ground'
  for (const other of plan.walls) {
    if (other.id === wall.id || other.arc !== undefined || (other.floor ?? 'ground') !== floor) continue
    const change: { start?: Pair; end?: Pair } = {}
    for (const key of ['start', 'end'] as const) {
      const p = pt(other[key])
      if (!within(p, oldStart, wall.thickness / 2, other) || within(p, newAt, thickness / 2, other)) continue
      // Along the other wall's own line to the new centre line; a wall in line with it has none.
      const dir = wallAxis(other).dir
      const across = dot(dir, axis.normal)
      if (Math.abs(across) < tolerance('parallel')) continue
      const by = dot(sub(newAt, p), axis.normal) / across
      change[key] = [r3(p.x + dir.x * by), r3(p.y + dir.y * by)]
    }
    if (change.start === undefined && change.end === undefined) continue
    walls.set(other.id, change)
    carried.push(quoted(other.id))
  }
  const was = own ? `was ${wall.thickness.toFixed(2)} m` : (wall.typed ?? []).includes('thickness') ? `where it read ${wall.thickness.toFixed(2)} m from its type, which no longer reaches its thickness` : `where it stated none (Grid read ${wall.thickness.toFixed(2)} m)`
  const kept = face === undefined
    ? `Its centre line stays where it is, so each face moves ${Math.abs(thickness - wall.thickness) / 2 >= 0.0005 ? `${(Math.abs(thickness - wall.thickness) / 2).toFixed(3)} m` : 'less than a millimetre'} ${thickness > wall.thickness ? 'out' : 'in'}.`
    : `The face its file places it by stays where it is; the wall ${thickness > wall.thickness ? 'grows' : 'shrinks'} on its other side.`
  const said = [`Wall ${quoted(wall.id)}: ${thickness.toFixed(2)} m thick, ${was}. ${kept}${carried.length > 0 ? ` Walls that ended in it were carried to its new centre line, so they stay joined: ${listed(carried)}.` : ''}`]
  return { ...emptyPatch(said), walls }
}

function compass(edge: { from: Vec2; to: Vec2; length: number }): string {
  const d = sub(edge.to, edge.from)
  const n = { x: d.y / edge.length, y: -d.x / edge.length }
  if (n.y > 0.99) return 'north'
  if (n.y < -0.99) return 'south'
  if (n.x > 0.99) return 'east'
  if (n.x < -0.99) return 'west'
  return 'at an angle'
}

export const MIRRORS = ['left-right', 'top-bottom'] as const
export type Mirror = (typeof MIRRORS)[number]

const MIRRORED: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' }

/**
 * The whole plan mirrored about the middle of its walls' box: left to right swaps east and
 * west. A curved wall's centre is mirrored too, and its sweep turns the other way (CNT-18). Every door keeps opening into the same room, every room keeps its size, and each
 * room's walls are listed the other way round, so they still run counter-clockwise (C3). An
 * anchor kept from a side of the drawing turns with it.
 *
 * CNT-3: the north the plan states is mirrored too, to minus itself, so the swap is the real
 * one: left to right, what faced east faces west, and top to bottom, what faced north faces
 * south, whichever way the drawing is turned. The site's origin, its boundary and its things
 * (BRF-3) are mirrored with the walls. The
 * y direction is kept: the result is a new design, still drawn as the plan says its y runs, and
 * the front stays the part it names, which is mirrored with the rest.
 */
export function mirrorPlan(survey: Survey, how: Mirror): Patch {
  const plan = survey.plan
  const { xs, ys } = extentPoints(plan, 'mirror')
  // VEW-22: cleaned of floating noise only, never rounded to millimetres, so every length holds.
  const flip = (p: readonly [number, number]): Pair =>
    how === 'left-right'
      ? [exact(Math.min(...xs) + Math.max(...xs) - p[0]), p[1]]
      : [p[0], exact(Math.min(...ys) + Math.max(...ys) - p[1])]
  // CNT-18: a curved wall's centre is mirrored with it, and it turns the other way round it.
  const walls = new Map(
    plan.walls.map((w) => [w.id, { start: flip(w.start), end: flip(w.end), mirrored: true, ...(w.arc === undefined ? {} : { arc: { centre: flip(w.arc.centre), sweep: -w.arc.sweep } }) }])
  )
  const turns = (side: string): boolean => (how === 'left-right' ? side === 'east' || side === 'west' : side === 'north' || side === 'south')
  const openings = new Map<string, OpeningChange>()
  for (const o of plan.openings) {
    const change: OpeningChange = {}
    if (o.swing !== undefined) change.swing = o.swing === 'left' ? 'right' : 'left'
    if (o.anchor !== undefined && turns(o.anchor.from)) change.anchor = { ...o.anchor, from: MIRRORED[o.anchor.from] as From }
    if (Object.keys(change).length > 0) openings.set(o.id, change)
  }
  // LVL-8: a pattern's door swings the other way too; its places along its wall stay, as a plain opening's offset does.
  const swingPatterns = new Set((plan.patterns ?? []).filter((p) => p.opening.swing !== undefined).map((p) => p.id))
  const rooms = new Map(plan.rooms.map((room) => [room.id, { boundary: [...room.boundary].reverse() }]))
  // CNT-12: a fixture's middle is mirrored, and its front faces the mirrored way: left to right
  // turns it to minus its turn, top to bottom to a half turn less it.
  const items = new Map((plan.items ?? []).map((item) => {
    const turn = item.turn ?? 0
    const mirrored = how === 'left-right' ? -turn : 180 - turn
    return [item.id, { at: flip(item.at), turn: r3(((mirrored % 360) + 360) % 360) }]
  }))
  const top: Record<string, unknown> = {}
  if (plan.north !== undefined) top['north'] = wrapDegrees(r3(-plan.north))
  // BRF-3: the plot's boundary and the site's things are mirrored with the walls. Each edge keeps
  // its number, so the streets and set-backs still name the same edges.
  const site = plan.site
  if (site !== undefined && (site.origin !== undefined || site.boundary !== undefined || site.things !== undefined)) {
    top['site'] = {
      ...site,
      ...(site.origin === undefined ? {} : { origin: flip(site.origin) }),
      ...(site.boundary === undefined ? {} : { boundary: site.boundary.map(flip) }),
      ...(site.things === undefined ? {} : { things: site.things.map((thing) => ({ ...thing, ...(thing.points === undefined ? {} : { points: thing.points.map(flip) }), ...(thing.at === undefined ? {} : { at: flip(thing.at) }) })) }),
    }
  }
  // BRF-4 (C17): a floor's outline is mirrored with the walls it holds.
  const floors = movedOutlines(plan, flip)
  if (floors !== null) top['floors'] = floors
  // VEW-3: each saved view is mirrored with the building, so it still frames what it framed.
  const views = mirroredViews(plan, how, flip, top['north'] as number | undefined)
  if (views !== null) top['views'] = views
  const north = plan.north === undefined ? '' : ` The plan's north is mirrored with it: ${wrapDegrees(r3(plan.north))}° → ${top['north'] as number}° counter-clockwise from the top of the drawing.`
  return {
    walls,
    openings,
    removeOpenings: new Set(),
    rooms,
    ...(items.size === 0 ? {} : { items }),
    ...(swingPatterns.size === 0 ? {} : { swingPatterns }),
    ...(Object.keys(top).length === 0 ? {} : { plan: top }),
    whole: true,
    said: [`Mirrored the plan ${how === 'left-right' ? 'left to right (east and west swap)' : 'top to bottom (north and south swap)'}: ${plan.walls.length === 0 ? `${(plan.floors ?? []).filter((f) => f.outline !== undefined).length} floor outlines` : `${plan.walls.length} walls`}, ${plan.openings.length} openings and ${plan.rooms.length} rooms${items.size === 0 ? '' : `, and ${items.size} fixture${items.size === 1 ? '' : 's'}`}.${north}${views === null ? '' : ` The ${views.length === 1 ? 'saved view is' : `${views.length} saved views are`} mirrored with it.`}${patternsFollow(plan)}`],
  }
}

/** LVL-8: one sentence when the plan has opening patterns: they stay patterns and their openings follow their walls. */
function patternsFollow(plan: FloorPlan): string {
  const n = plan.patterns?.length ?? 0
  return n === 0 ? '' : ` ${n === 1 ? 'Its opening pattern stays a pattern' : `Its ${n} opening patterns stay patterns`}, and the openings ${n === 1 ? 'it places follow its wall' : 'they place follow their walls'}.`
}

/** VEW-22: a coordinate a mirror or a turn worked out, cleaned of floating noise: to the micrometre. */
const exact = (value: number): number => Math.round(value * 1e6) / 1e6

/** WRT-4: the turns `grid_mirror` makes, in degrees counter-clockwise on the drawing as Grid draws it (y up). */
export const TURNS = [90, 180, 270] as const
export type Turn = (typeof TURNS)[number]

const TURN_WORDS: Record<Turn, string> = { 90: 'a quarter counter-clockwise (90°)', 180: 'half round (180°)', 270: 'a quarter clockwise (270°, or -90°)' }

/**
 * WRT-4: the whole plan turned a quarter or half round about the middle of its walls' box,
 * counter-clockwise as Grid draws it, y up, as a stated north is measured. Every room keeps its
 * size and its walls in the same order, every door its swing and the room it opens into; an
 * anchor kept from a side of the drawing turns with it, a fixture turns with the plan, and the
 * site's origin turns with the walls. The stated north is kept: the building turns on its site,
 * so what faced south faces another way, as `grid_mirror`'s mirror is a new design too. The y
 * direction is kept, so on a page whose y runs down the plan turns the other way.
 */
export function turnPlanBy(survey: Survey, turn: Turn): Patch {
  const plan = survey.plan
  const { xs, ys } = extentPoints(plan, 'turn')
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const [cos, sin] = turn === 90 ? [0, 1] : turn === 180 ? [-1, 0] : [0, -1]
  // VEW-22: a quarter turn moves every point exactly: the result is cleaned of floating noise
  // only, never rounded to millimetres, which moved a point stated finer by up to half of one
  // and changed a room's size.
  const map = (p: readonly [number, number]): Pair => {
    const x = p[0] - cx
    const y = p[1] - cy
    return [exact(cx + cos * x - sin * y), exact(cy + sin * x + cos * y)]
  }
  const sides = ['north', 'west', 'south', 'east'] as const
  const turned = (side: string): string => {
    const k = sides.indexOf(side as (typeof sides)[number])
    return k < 0 ? side : sides[(k + turn / 90) % 4]!
  }
  // CNT-18: a curved wall's centre turns with its ends; a turn keeps its sweep.
  const walls = new Map(plan.walls.map((w) => [w.id, { start: map(w.start), end: map(w.end), ...(w.arc === undefined ? {} : { arc: { centre: map(w.arc.centre), sweep: w.arc.sweep } }) }]))
  const openings = new Map<string, OpeningChange>()
  for (const o of plan.openings) if (o.anchor !== undefined && turned(o.anchor.from) !== o.anchor.from) openings.set(o.id, { anchor: { ...o.anchor, from: turned(o.anchor.from) as From } })
  const items = new Map((plan.items ?? []).map((item) => [item.id, { at: map(item.at), turn: r3((((item.turn ?? 0) + turn) % 360 + 360) % 360) }]))
  const top: Record<string, unknown> = {}
  if (plan.site?.origin !== undefined) top['site'] = { ...plan.site, origin: map(plan.site.origin) }
  // BRF-4 (C17): a floor's outline turns with the walls it holds.
  const floors = movedOutlines(plan, map)
  if (floors !== null) top['floors'] = floors
  const north = plan.north === undefined ? '' : ` The plan's north is kept at ${wrapDegrees(r3(plan.north))}°, so the building faces new ways: what faced south now faces ${turn === 90 ? 'east' : turn === 180 ? 'north' : 'west'}.`
  const down = plan.yAxis === 'down' ? ' The plan says its y runs down the page, so on that page it turned the other way.' : ''
  return {
    walls,
    openings,
    removeOpenings: new Set(),
    rooms: new Map(),
    ...(items.size === 0 ? {} : { items }),
    ...(Object.keys(top).length === 0 ? {} : { plan: top }),
    whole: true,
    said: [`Turned the plan ${TURN_WORDS[turn]} about the middle of its walls: ${plan.walls.length === 0 ? `${(plan.floors ?? []).filter((f) => f.outline !== undefined).length} floor outlines` : `${plan.walls.length} walls`}, ${plan.openings.length} openings and ${plan.rooms.length} rooms${items.size === 0 ? '' : `, and ${items.size} fixture${items.size === 1 ? '' : 's'}`}.${north}${down}${patternsFollow(plan)}`],
  }
}

/**
 * WRT-59: the points a mirror or a turn is taken about: the walls' ends, or, on a plan of massing
 * (floor outlines and no walls), the outlines' corners. A plan with neither has nothing to turn.
 */
function extentPoints(plan: FloorPlan, doing: 'mirror' | 'turn'): { xs: number[]; ys: number[] } {
  const points: (readonly [number, number])[] = plan.walls.length > 0 ? plan.walls.flatMap((w) => [w.start, w.end]) : (plan.floors ?? []).flatMap((floor) => floor.outline ?? [])
  if (points.length === 0) throw new EditRefused(`The plan has no walls and no floor outline, so there is nothing to ${doing}.`)
  return { xs: points.map((p) => p[0]), ys: points.map((p) => p[1]) }
}

/** BRF-4: the floors with every stated outline moved as `move` moves a point; null when no floor states one. */
function movedOutlines(plan: FloorPlan, move: (p: readonly [number, number]) => Pair): FloorPlan['floors'] | null {
  if (!(plan.floors ?? []).some((floor) => floor.outline !== undefined)) return null
  return plan.floors!.map((floor) => (floor.outline === undefined ? floor : { ...floor, outline: floor.outline.map(move) }))
}

/** VEW-3: the plan's saved views, mirrored: what each is pointed at, and the side it stands on. Null when it has none. */
function mirroredViews(plan: FloorPlan, how: Mirror, flip: (p: readonly [number, number]) => Pair, north: number | undefined): StoredView[] | null {
  const views = plan.views ?? []
  if (views.length === 0) return null
  const before = planOrientation(plan)
  const after = { ...plan, ...(north !== undefined ? { north } : {}) } as FloorPlan
  return views.map((view) => {
    const setting = viewSetting(view)
    const onDrawing = drawingBearing(setting.bearing, before, setting.north ?? null)
    const [x, y] = flip([setting.target.point[0], setting.target.point[1]])
    const record = cameraRecord(after, {
      ...setting,
      target: { ...setting.target, point: [x, y, setting.target.point[2]] },
      bearing: compassBearing(how === 'left-right' ? -onDrawing : 180 - onDrawing, planOrientation(after)),
      north: planOrientation(after).north,
    })
    return storedView(view.name, record)
  })
}
