/**
 * A room renamed, or given another use (WRT-3, lab AB-8): "the front room is a let now", "the
 * rooms in Spanish for the guests". The answer says which of Grid's checks now look at the room
 * that did not before, and which no longer do, because the checks go by a room's stated use and
 * never by its name. ARE-60: it also says whether the room is heated or cooled, so in the living
 * area under air.
 *
 * Pure: a survey in, a patch out.
 */
import { FINISH_SURFACES, buildingKind, floorBuilding, floorOf, isConditioned, isOutdoor, roomFinishes, type FinishSurface } from '@ongrid/floorplan/geometry'
import { english, name as sayName, said as said_ } from '@ongrid/floorplan/messages'
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'
import { rulesForUse } from '@ongrid/rules'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'

/** A use, or `none` to leave the room's use unstated. */
export type UseOrNone = RoomUse | 'none'

/** CNT-15: a finish's name, or `none` to take it out. */
export type FinishOrNone = string

export function renameRoom(survey: Survey, roomId: string, request: { readonly name?: string; readonly use?: UseOrNone; readonly finishes?: Partial<Record<FinishSurface, FinishOrNone>>; readonly conditioned?: boolean }): Patch {
  const room = survey.plan.rooms.find((r) => r.id === roomId)!
  const name = quoted(room.name)
  const finishing = request.finishes !== undefined && Object.keys(request.finishes).length > 0
  if (request.name === undefined && request.use === undefined && !finishing && request.conditioned === undefined) throw new EditRefused('Pass name, use, a finish, conditioned, or more than one.')
  const change: RoomChange = {}
  const said: string[] = []
  // ARE-60: heated or cooled, or not. Outdoor space and a void never are, and a zone is as its room.
  if (request.conditioned !== undefined) {
    const called = sayName(room.name)
    if (isOutdoor(room)) throw new EditRefused(english(said_('edit.conditioned.outdoor', { room: called })))
    if (room.void === true) throw new EditRefused(english(said_('edit.conditioned.void', { room: called })))
    if (room.partOf !== undefined) {
      const of = survey.plan.rooms.find((r) => r.id === room.partOf && floorOf(r) === floorOf(room))
      throw new EditRefused(english(said_('edit.conditioned.zone', { room: called, of: sayName(of?.name ?? room.partOf) })))
    }
  }
  // CNT-15 (C24): the room's or zone's finishes, by the person's own names; none takes one out.
  if (finishing) {
    const was = roomFinishes(room)
    const next: Record<string, string> = Object.fromEntries(FINISH_SURFACES.flatMap((surface) => (was[surface] === null ? [] : [[surface, was[surface]!]])))
    for (const surface of FINISH_SURFACES) {
      const asked = request.finishes![surface]
      if (asked === undefined) continue
      const now = asked.trim().toLowerCase() === 'none' ? null : asked
      if (now === was[surface]) continue
      if (now === null) delete next[surface]
      else next[surface] = now
      said.push(`${quoted(request.name ?? room.name)}: ${surface} finish ${was[surface] === null ? 'not stated' : quoted(was[surface]!)} → ${now === null ? 'not stated' : quoted(now)}.`)
    }
    if (said.length > 0) change.finishes = Object.keys(next).length === 0 ? null : next
  }
  if (request.name !== undefined && request.name !== room.name) {
    change.name = request.name
    said.push(`Renamed ${name} to ${quoted(request.name)}.`)
  }
  const was = room.use
  const is = request.use === undefined ? was : request.use === 'none' ? undefined : request.use
  if (is !== was) {
    change.use = is ?? null
    said.push(`${quoted(request.name ?? room.name)} is ${is === undefined ? 'of no stated use' : `used as ${is}`} now, not ${was === undefined ? 'of no stated use' : was}.`)
  }
  // ARE-60: heated or cooled as asked, stated only where its new use would not give it, and said
  // whenever the room comes into the living area under air or leaves it. A zone is as its room.
  if (room.partOf === undefined) {
    const airBefore = isConditioned(room)
    const byUse = isConditioned({ ...room, use: is, conditioned: undefined })
    const airAfter = request.conditioned ?? isConditioned({ ...room, use: is })
    if (request.conditioned !== undefined) {
      const stated = airAfter === byUse ? undefined : airAfter
      if (stated !== room.conditioned) change.conditioned = stated ?? null
    }
    if (airAfter !== airBefore) said.push(english(said_(airAfter ? 'edit.conditioned.on' : 'edit.conditioned.off', { room: sayName(request.name ?? room.name) })))
  }
  if (said.length === 0) throw new EditRefused(`That is how ${name} is already: nothing to change.`)
  if (request.name === undefined && request.use === undefined) {
    const patch = emptyPatch(said)
    ;(patch.rooms as Map<string, RoomChange>).set(roomId, change)
    return { ...patch, extra: { checks: { now: [], noLonger: [] } } }
  }

  // Which checks look at the room before and after: they go by its use, never its name, and
  // run only in the kinds of building they read (CNT-5).
  const building = floorBuilding(survey.plan, floorOf(room))
  const before = rulesForUse(was, building)
  const after = rulesForUse(is, building)
  const now = after.filter((rule) => !before.some((r) => r.id === rule.id))
  const noLonger = before.filter((rule) => !after.some((r) => r.id === rule.id))
  const lines: string[] = []
  if (now.length > 0) lines.push(`Checks that now look at it: ${now.map((r) => r.title).join('; ')}.`)
  if (noLonger.length > 0) lines.push(`Checks that no longer do: ${noLonger.map((r) => r.title).join('; ')}.`)
  if (is === undefined && was !== undefined) lines.push('With no use stated, grid check names it as not checked.')
  if (is !== was && lines.length === 0) lines.push('The same checks look at it as before.')
  const plan = survey.plan
  const kindBefore = buildingKind(plan)
  const kindAfter = buildingKind({ ...plan, rooms: plan.rooms.map((r) => (r.id === roomId ? { ...r, use: is } : r)) })
  if (kindBefore !== kindAfter) lines.push(kindAfter === 'home' ? 'Grid now reads the plan as a home, and asks about sizes far from a home\'s.' : 'Grid no longer reads the plan as a home: it asks about sizes far from any building\'s.')
  const patch = emptyPatch([...said, ...lines])
  ;(patch.rooms as Map<string, RoomChange>).set(roomId, change)
  return { ...patch, extra: { checks: { now: now.map((r) => r.id), noLonger: noLonger.map((r) => r.id) } } }
}
