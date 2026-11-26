/**
 * CNT-48: a room's usual fixtures in one call: `grid_add_item` given a typical room's name (the
 * library's `kitchen`, `bathroom`, `shower-room`, `cloakroom`, or an office's own) and a room,
 * with no side and no point, sets out each of its items against a side of that room where it fits.
 *
 * Each item is placed by the same reading as an `item` line and `grid_add_item` (`placeItem`),
 * against the room's sides, longest first, in each corner of the side and then centred on it. The
 * first place where Grid's fit checks (`FIT_CODES`, and an item leaving its room) name nothing
 * about it is kept, and the next item is tried with it in the plan. When the entry fits nowhere,
 * the smaller entries of the same thing Grid keeps are tried (`SMALLER`): a 2.4 m kitchen run for
 * a 3 m one, a shower for a bath. An item of a kind the room already holds is not added again. It
 * is a first set-out, from Grid's own checks, for the person to move from, never a layout rule.
 *
 * Pure: a survey in, a patch out.
 */
import { indexPlan, itemKindWord, itemRoom, roomShapes, tryRoomPolygon, validatePlan, type FloorPlan, type Issue } from '@ongrid/floorplan/geometry'
import type { FoundRoom, Library } from '@ongrid/floorplan/library'
import { ItemRefused, placeItem, type ItemMade, type ItemSide, type ItemWords } from '@ongrid/floorplan/rooms'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { emptyPatch, listed, readingAfter, type Patch } from './edits'
import { FIT_CODES } from './place'
import { EditRefused } from './refused'

type RawRecord = Record<string, unknown>

/** What the call names: the typical room and the room it is set out in. */
export interface FixtureSetRequest {
  readonly name: string
  readonly room: string
}

/** One thing to try: a library entry, or a kind at a size of Grid's own. */
interface Try {
  readonly name: string
  readonly size?: readonly [number, number]
}

/** One place tried for an item, and what Grid's checks say of it there. */
interface Trial {
  readonly made: ItemMade
  readonly plan: FloorPlan
  readonly notes: Issue[]
  readonly where: string
  readonly tried: Try
}

/**
 * The smaller entries of the same thing, tried in order when an entry fits nowhere. Grid's own
 * choice of what stands in for what, said in the answer when used.
 */
const SMALLER: Readonly<Record<string, readonly Try[]>> = {
  'kitchen-run-3000': [{ name: 'kitchen-run-2400' }, { name: 'kitchen-run', size: [1.8, 0.6] }],
  'kitchen-run-2400': [{ name: 'kitchen-run', size: [1.8, 0.6] }],
  bath: [{ name: 'bath-1500' }, { name: 'shower-900' }, { name: 'shower-800' }],
  'bath-1500': [{ name: 'shower-900' }, { name: 'shower-800' }],
  'shower-1200': [{ name: 'shower-900' }, { name: 'shower-800' }],
  'shower-900': [{ name: 'shower-800' }],
  basin: [{ name: 'basin-small' }],
  wc: [{ name: 'wc-compact' }],
}

/** The checks that say an item does not fit where it stands. */
const DOES_NOT_FIT = new Set([...FIT_CODES, 'item/leaves-room'])

/** The two ends of a side: the sides of the drawing square to it. */
const ENDS: Readonly<Record<ItemSide, readonly [ItemSide, ItemSide]>> = {
  north: ['west', 'east'],
  south: ['west', 'east'],
  east: ['south', 'north'],
  west: ['south', 'north'],
}

/** Whether a name is a typical room the library holds. */
export function typicalRoomOf(library: Library, name: string): FoundRoom | undefined {
  return library.rooms.get(name)
}

/** The notes of Grid's fit checks about the item `id` in `plan`. */
function fitNotes(plan: FloorPlan, id: string): Issue[] {
  return validatePlan(plan).issues.filter((issue) => DOES_NOT_FIT.has(issue.code) && (issue.id === id || ((issue as { readonly hits?: readonly string[] }).hits ?? []).includes(id)))
}

/** A typical room's items, each against a side of `request.room` where it fits. */
export function addFixtureSet(survey: Survey, library: Library, request: FixtureSetRequest): Patch {
  const plan = survey.plan
  const found = typicalRoomOf(library, request.name)
  if (found === undefined) throw new EditRefused(`No library holds a typical room named ${quoted(request.name)}.`)
  const room = plan.rooms.find((r) => r.id === request.room)
  if (room === undefined) throw new EditRefused(`The plan has no room ${quoted(request.room)}.`)
  const roomName = quoted(room.name || room.id)
  const polygon = tryRoomPolygon(room, indexPlan(plan))
  if (polygon === null) throw new EditRefused(`Grid cannot draw room ${roomName}, so it has no sides to set fixtures against.`)

  // The sides, longest first: north and south run across the room, east and west along it.
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const across = Math.max(...xs) - Math.min(...xs)
  const along = Math.max(...ys) - Math.min(...ys)
  const sides: ItemSide[] = across >= along ? ['north', 'south', 'east', 'west'] : ['east', 'west', 'north', 'south']

  // The kinds the room holds already are not added again.
  const shapes = roomShapes(indexPlan(plan))
  const held = new Set((plan.items ?? []).filter((item) => itemRoom(item, shapes)?.id === room.id).map((item) => item.kind))
  const taken = new Set([...plan.walls, ...plan.rooms, ...plan.openings, ...(plan.items ?? []), ...(plan.columns ?? [])].map((part) => part.id))

  const added: RawRecord[] = []
  const copies: RawRecord[] = []
  const placed: { id: string; kind: string; where: string; instead: string | null; guesses: readonly string[] }[] = []
  const notPlaced: string[] = []
  const skipped: string[] = []
  const lines: string[] = []

  for (const want of found.room.items) {
    const entry = library.items.get(want.library)?.entry
    if (entry === undefined) {
      notPlaced.push(want.library)
      lines.push(`Could not place ${quoted(want.library)}: no library holds an item of that name.`)
      continue
    }
    if (held.has(entry.kind)) {
      skipped.push(want.library)
      continue
    }
    const tries: Try[] = [{ name: want.library }, ...(SMALLER[want.library] ?? [])]
    let best: Trial | null = null
    let kept = null as Trial | null
    search: for (const tried of tries) {
      let id = tried.name
      for (let n = 2; taken.has(id); n++) id = `${tried.name}-${n}`
      for (const against of sides) {
        for (const end of [...ENDS[against], undefined]) {
          const words: ItemWords = {
            id,
            name: tried.name,
            ...(tried.size === undefined ? {} : { size: tried.size }),
            ...(want.label === undefined ? {} : { label: want.label }),
            room: room.id,
            against,
            ...(end === undefined ? {} : { end }),
          }
          let made: ItemMade
          try {
            made = placeItem(plan, words, library)
          } catch (error) {
            if (error instanceof ItemRefused) continue
            throw error
          }
          const patch: Patch = { ...emptyPatch([]), addItems: [...added, { ...made.record }] }
          const after = readingAfter(plan, patch)
          const notes = fitNotes(after, id)
          const where = `against the ${against} side${end === undefined ? ', centred on it' : `, in its ${end} corner`}`
          const trial: Trial = { made, plan: after, notes, where, tried }
          if (notes.length === 0) {
            kept = trial
            break search
          }
          if (best === null || notes.length < best.notes.length) best = trial
        }
      }
    }
    if (kept === null) {
      notPlaced.push(want.library)
      lines.push(`Could not place ${itemKindWord(entry.kind)} ${quoted(want.library)}: no side of room ${roomName} holds it${tries.length > 1 ? ', or a smaller one,' : ''} clear of its walls, doors and other fixtures${best === null ? '.' : ` (at best: ${best.notes[0]!.message})`}`)
      continue
    }
    const id = kept.made.record['id'] as string
    taken.add(id)
    added.push({ ...kept.made.record })
    for (const copy of kept.made.copy) if (!copies.some((c) => c['name'] === copy.name)) copies.push({ ...copy })
    placed.push({ id, kind: kept.made.item.kind, where: kept.where, instead: kept.tried.name === want.library ? null : kept.tried.name, guesses: kept.made.guesses })
  }

  if (added.length === 0) {
    if (skipped.length > 0 && notPlaced.length === 0) throw new EditRefused(`Room ${roomName} already holds ${listed(skipped.map((name) => quoted(name)), 6)} of the kinds typical room ${quoted(found.room.name)} sets out, so nothing was added. Use grid_move_item to move them.`)
    throw new EditRefused(`Nothing of typical room ${quoted(found.room.name)} fits in room ${roomName}. ${lines.join(' ')}`)
  }

  const said = [
    `Set out ${added.length} of the ${found.room.items.length} items of typical room ${quoted(found.room.name)} in room ${roomName}, each against a side where Grid's checks find it clear of the walls, the doors and the other fixtures: a first set-out to move from.`,
    ...placed.map((p) => `Placed ${itemKindWord(p.kind)} ${quoted(p.id)} ${p.where}${p.instead === null ? '' : `, as ${quoted(p.instead)}: the typical room's own size fits nowhere in this room`}.`),
    ...placed.flatMap((p) => p.guesses.map((g) => `${g.charAt(0).toUpperCase()}${g.slice(1)}`)),
    ...(skipped.length === 0 ? [] : [`Not added again: the room already holds ${listed(skipped.map((name) => quoted(name)), 6)} of those kinds.`]),
    ...lines,
  ]
  const patch: Patch = { ...emptyPatch(said), addItems: added, ...(copies.length === 0 ? {} : { addLibrary: copies }) }
  return { ...patch, extra: { item: placed[0]!.id, placed: placed.map((p) => p.id), fits: notPlaced.length === 0, worthALook: [], notPlaced } }
}
