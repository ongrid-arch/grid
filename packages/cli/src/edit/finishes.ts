/**
 * CNT-51 (C24): the finishes of many rooms set in one call, as a person says them: "oak in every
 * room but the bathrooms", "painted plaster everywhere except the wet rooms", "a tiled splashback
 * 600 high behind the kitchen run", "tiles to 1.2 m all round the shower room", "the north wall of
 * the bedroom is a feature wall", "no skirting in the plant room".
 *
 * The rooms are named by id, picked by use, or all of them (`all`: every room that is not a zone,
 * a void or outdoor space), on one floor if asked, less those `except` names by id or use, `wet`
 * standing for bathrooms, toilets and utility rooms. Each surface takes a finish by the person's
 * own name, `unset` to take it out, and skirting `none` for no skirting, which is measured as none.
 * A face names one wall's face finished other than the room's walls; a band a finish from a height
 * above the floor, on every face of the room, on one wall's or behind an item (from its top unless
 * it says). A face and a band go to each picked room the wall bounds or the item stands against;
 * a band replaces the room's band in the same place (all round, on that wall, behind that item) and
 * keeps the others, and `clearBands` takes every band out of the picked rooms first.
 *
 * Grid checks no finish. Pure: a survey in, a patch out, with each band's area in the answer.
 */
import { floorOf, isOutdoor, type FinishSurface } from '@ongrid/floorplan/geometry'
import { english, name as sayName, num, said, type MessageKey, type Values } from '@ongrid/floorplan/messages'
import { FinishesSchema, ROOM_USES, type FinishBand, type FinishFace, type Room } from '@ongrid/floorplan/types/floorplan'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { measureBand, wallFaceInRoom, type BandLine } from '../quantities/finishes'
import type { Survey, SurveyRoom } from '../quantities/survey'
import { emptyPatch, listed, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'

/** CNT-51: the uses `wet` stands for in `except`. */
export const WET_USES = ['bathroom', 'toilet', 'utility'] as const

export interface FinishesRequest {
  /** The rooms by id, or `all`. */
  readonly rooms?: readonly string[]
  /** The rooms of these uses. */
  readonly uses?: readonly string[]
  /** Rooms left out, by id or use, or `wet`. */
  readonly except?: readonly string[]
  readonly floor?: string
  /** Each surface: a finish, `unset` to take it out, or on skirting `none` for no skirting. */
  readonly surfaces?: Partial<Record<FinishSurface, string>>
  /** Wall faces finished other than the room's walls; a finish `unset` takes the face out. */
  readonly faces?: readonly FinishFace[]
  /** A band, replacing the band in the same place in each room it goes to. */
  readonly band?: FinishBand
  /** Take every band out of the picked rooms, before `band`. */
  readonly clearBands?: boolean
}

/** What the change did to one room, for the answer's data. */
export interface RoomFinishesDone {
  readonly room: string
  readonly finishes: Readonly<Record<string, unknown>> | null
  readonly bands: readonly BandLine[]
}

const refuse = (key: MessageKey, values?: Values): never => {
  throw new EditRefused(english(said(key, values)))
}

const n2 = (value: number) => num(value.toFixed(2))
const roomsSaid = (rooms: readonly Room[]): string => listed(rooms.map((room) => JSON.stringify(room.name || room.id)), 8)

/** The rooms the request picks, in the plan's order. */
function pickRooms(survey: Survey, request: FinishesRequest): Room[] {
  const plan = survey.plan
  const ids = request.rooms ?? []
  const uses = request.uses ?? []
  if (ids.length === 0 && uses.length === 0) refuse('edit.finishes.noRooms')
  const known = new Set<string>(ROOM_USES)
  for (const use of uses) if (!known.has(use)) refuse('edit.finishes.unknownUse', { use: sayName(use) })
  const all = ids.some((id) => id.trim().toLowerCase() === 'all')
  for (const id of ids) {
    if (id.trim().toLowerCase() === 'all' || plan.rooms.some((room) => room.id === id)) continue
    const meant = likelyId(id, plan.rooms.map((room) => room.id))
    refuse('edit.finishes.unknownRoom', { room: sayName(id), meant: meant === null ? '' : said('edit.facts.meant', { part: sayName(meant) }) })
  }
  const except = new Set<string>()
  const exceptUses = new Set<string>()
  for (const given of request.except ?? []) {
    const word = given.trim().toLowerCase()
    if (word === 'wet') for (const use of WET_USES) exceptUses.add(use)
    else if (plan.rooms.some((room) => room.id === given)) except.add(given)
    else if (known.has(word)) exceptUses.add(word)
    else refuse('edit.finishes.unknownExcept', { what: sayName(given) })
  }
  const named = new Set(ids)
  const picked = plan.rooms.filter((room) => {
    if (request.floor !== undefined && floorOf(room) !== request.floor) return false
    if (except.has(room.id) || (room.use !== undefined && exceptUses.has(room.use))) return false
    if (named.has(room.id)) return true
    if (room.use !== undefined && uses.includes(room.use)) return true
    // All: every room that is a room of its own and has a floor and walls to finish.
    return all && room.partOf === undefined && room.void !== true && !isOutdoor(room)
  })
  if (picked.length === 0) refuse('edit.finishes.noneLeft')
  return picked
}

/** The survey's room for a plan room. */
function surveyed(survey: Survey, room: Room): SurveyRoom | undefined {
  return survey.rooms.find((r) => r.facts.id === room.id && r.facts.floor === floorOf(room))
}

/** Whether the room has a face on the wall. */
function hasFace(survey: Survey, room: Room, wall: string): boolean {
  return (surveyed(survey, room)?.edges ?? []).some((edge) => edge.wall?.id === wall && edge.wall.virtual !== true)
}

export function setFinishes(survey: Survey, request: FinishesRequest): Patch {
  const surfaces = Object.entries(request.surfaces ?? {}) as [FinishSurface, string][]
  if (surfaces.length === 0 && (request.faces ?? []).length === 0 && request.band === undefined && request.clearBands !== true) refuse('edit.finishes.nothing')
  const rooms = pickRooms(survey, request)
  const plan = survey.plan

  // Each face and band goes to the picked rooms it is on; one on none of them is refused.
  for (const face of request.faces ?? []) {
    if (!plan.walls.some((wall) => wall.id === face.wall)) {
      const meant = likelyId(face.wall, plan.walls.map((wall) => wall.id))
      refuse('edit.finishes.unknownWall', { wall: sayName(face.wall), meant: meant === null ? '' : said('edit.facts.meant', { part: sayName(meant) }) })
    }
    if (!rooms.some((room) => hasFace(survey, room, face.wall))) refuse('edit.finishes.wallNotRound', { wall: sayName(face.wall), rooms: roomsSaid(rooms) })
  }
  const bandIn = new Set<string>()
  const band = request.band
  if (band !== undefined) {
    if (band.wall !== undefined && band.behind !== undefined) refuse('edit.finishes.bandWallAndItem')
    if (band.wall !== undefined) {
      if (!plan.walls.some((wall) => wall.id === band.wall)) {
        const meant = likelyId(band.wall, plan.walls.map((wall) => wall.id))
        refuse('edit.finishes.unknownWall', { wall: sayName(band.wall), meant: meant === null ? '' : said('edit.facts.meant', { part: sayName(meant) }) })
      }
      if (!rooms.some((room) => hasFace(survey, room, band.wall!))) refuse('edit.finishes.wallNotRound', { wall: sayName(band.wall), rooms: roomsSaid(rooms) })
    }
    if (band.behind !== undefined && !(plan.items ?? []).some((item) => item.id === band.behind)) {
      const meant = likelyId(band.behind, (plan.items ?? []).map((item) => item.id))
      refuse('edit.finishes.unknownItem', { item: sayName(band.behind), meant: meant === null ? '' : said('edit.facts.meant', { part: sayName(meant) }) })
    }
    let placed = false
    for (const room of rooms) {
      const on = surveyed(survey, room)
      if (on === undefined) continue
      if (band.wall !== undefined && !hasFace(survey, room, band.wall)) continue
      if (band.behind !== undefined && !(measureBand(on, plan, band).line.length > 0)) continue
      bandIn.add(room.id)
      placed = true
    }
    if (!placed && band.behind !== undefined) refuse('edit.finishes.itemNotAgainst', { item: sayName(band.behind), rooms: roomsSaid(rooms) })
  }

  const lines: string[] = []
  const patch = emptyPatch(lines)
  const changes = patch.rooms as Map<string, RoomChange>
  const done: RoomFinishesDone[] = []
  // What each surface became, by the rooms it changed and the rooms it was so already, for one line each.
  const bySurface = new Map<string, { changed: Room[]; already: Room[] }>()
  const note = (key: string, room: Room, changed: boolean): void => {
    const entry = bySurface.get(key) ?? { changed: [], already: [] }
    ;(changed ? entry.changed : entry.already).push(room)
    bySurface.set(key, entry)
  }
  const faceLines: string[] = []
  const bandLines: string[] = []
  for (const room of rooms) {
    const was: Record<string, unknown> = { ...(room.finishes ?? {}) }
    const next: Record<string, unknown> = { ...was }
    for (const [surface, given] of surfaces) {
      const word = given.trim()
      const lower = word.toLowerCase()
      if (lower === 'none' && surface !== 'skirting') refuse('edit.finishes.noneNotSkirting', { surface: said(`edit.finishes.surface.${surface}`) })
      const value: string | false | undefined = lower === 'unset' ? undefined : lower === 'none' ? false : word
      if (value === undefined) delete next[surface]
      else next[surface] = value
      note(`${surface}\u0000${value === undefined ? '\u0001' : value === false ? '\u0002' : value}`, room, was[surface] !== value)
    }
    for (const face of request.faces ?? []) {
      if (!hasFace(survey, room, face.wall)) continue
      const faces = ((next['faces'] as FinishFace[] | undefined) ?? []).filter((f) => f.wall !== face.wall)
      const unset = face.finish.trim().toLowerCase() === 'unset'
      if (!unset) faces.push({ wall: face.wall, finish: face.finish.trim() })
      if (faces.length === 0) delete next['faces']
      else next['faces'] = faces
      const on = surveyed(survey, room)
      faceLines.push(english(said(unset ? 'edit.finishes.faceUnset' : 'edit.finishes.face', { room: sayName(room.name || room.id), wall: sayName(face.wall), finish: sayName(face.finish.trim()), area: n2(on === undefined ? 0 : wallFaceInRoom(on, plan, face.wall)) })))
    }
    if (request.clearBands === true || (band !== undefined && bandIn.has(room.id))) {
      const samePlace = (b: FinishBand): boolean => band !== undefined && (b.wall ?? null) === (band.wall ?? null) && (b.behind ?? null) === (band.behind ?? null)
      const kept = request.clearBands === true ? [] : ((was['bands'] as FinishBand[] | undefined) ?? []).filter((b) => !samePlace(b))
      if (request.clearBands === true && ((was['bands'] as unknown[] | undefined) ?? []).length > 0) bandLines.push(english(said('edit.finishes.bandsTaken', { room: sayName(room.name || room.id) })))
      const added = band !== undefined && bandIn.has(room.id) ? [{ finish: band.finish.trim(), height: band.height, ...(band.from === undefined ? {} : { from: band.from }), ...(band.wall === undefined ? {} : { wall: band.wall }), ...(band.behind === undefined ? {} : { behind: band.behind }) }] : []
      const bands = [...kept, ...added]
      if (bands.length === 0) delete next['bands']
      else next['bands'] = bands
    }
    const checked = FinishesSchema.safeParse(next)
    if (!checked.success) refuse('edit.finishes.refused', { room: sayName(room.name || room.id), problem: checked.error.issues[0]?.message ?? '' })
    const record = Object.keys(next).length === 0 ? null : next
    const on = surveyed(survey, room)
    const measured = on === undefined ? [] : ((next['bands'] as FinishBand[] | undefined) ?? []).map((band) => measureBand(on, plan, band).line)
    if (band !== undefined && bandIn.has(room.id) && on !== undefined) {
      const line = measureBand(on, plan, band).line
      const where = line.behind !== null ? said('edit.finishes.where.behind', { item: sayName(line.behind) }) : line.wall !== null ? said('edit.finishes.where.wall', { wall: sayName(line.wall) }) : said('edit.finishes.where.round')
      bandLines.push(english(said('edit.finishes.band', { room: sayName(room.name || room.id), finish: sayName(line.finish), from: n2(line.from), to: n2(line.to), where, length: n2(line.length), area: n2(line.area) })))
    }
    if (JSON.stringify(record) === JSON.stringify(room.finishes ?? null)) continue
    changes.set(room.id, { finishes: record })
    done.push({ room: room.id, finishes: record, bands: measured })
  }

  // One line per surface and value: the rooms it changed, then those it was so already.
  for (const [key, { changed, already }] of bySurface) {
    const [surface, value] = key.split('\u0000') as [FinishSurface, string]
    const what = said(`edit.finishes.surface.${surface}`)
    if (changed.length > 0) {
      if (value === '\u0001') lines.push(english(said('edit.finishes.unset', { surface: what, rooms: roomsSaid(changed) })))
      else if (value === '\u0002') lines.push(english(said('edit.finishes.noSkirting', { rooms: roomsSaid(changed) })))
      else lines.push(english(said('edit.finishes.set', { surface: what, finish: sayName(value), rooms: roomsSaid(changed) })))
    }
    if (already.length > 0) lines.push(english(said('edit.finishes.already', { surface: what, rooms: roomsSaid(already) })))
  }
  lines.push(...faceLines, ...bandLines)
  if (changes.size === 0) refuse('edit.finishes.unchanged')
  return { ...patch, extra: { rooms: done } }
}
