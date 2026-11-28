/**
 * ARE-79: the area figures people quote where the plan will be built, beside the net and gross
 * ones, made from `planAreas`' own figures and named as people there name them. They follow no
 * published standard and the answer says so; a place Grid has none for gets none.
 *
 * - ES: the useful area, the net less the floor under the low headroom band (`headroomLow`)
 *   where a floor states its roof; the built area without the shared parts, each flat to the
 *   outside face of its outer walls and the middle of its party walls (ARE-14's outside-face
 *   figure), the gross external area with no flats; and with the shared parts, the common parts'
 *   figure shared out by the flats' built areas, since the plan states no shares.
 * - US: the living area under air (ARE-60) of the floors at or above the ground floor
 *   (`footprintFloors`), so a heated basement is not in the headline.
 */
import { footprintFloors, limit, type FloorPlan } from '@ongrid/floorplan/geometry'
import type { Speaker } from '@ongrid/floorplan/messages'
import { name, num } from '@ongrid/floorplan/messages'
import type { Display } from '@ongrid/floorplan/types/units'
import { notCounted, type PlanAreas, type RoomArea } from './areas'
import { areaText } from './units'

/** One flat's figures, Spain. */
export interface LocalFlat {
  readonly id: string
  readonly name: string
  readonly useful: number
  readonly built: number | null
  readonly builtShared: number | null
}

export type LocalAreas =
  | {
      readonly country: 'ES'
      readonly useful: number
      readonly built: number | null
      readonly builtShared: number | null
      readonly flats: readonly LocalFlat[]
    }
  | {
      readonly country: 'US'
      /** The living area under air of the floors at or above the ground floor; null when one of them is unknown. */
      readonly aboveGround: number | null
      readonly floors: readonly string[]
      readonly all: number | null
    }

/** A room's useful floor: its net, less the floor with under the low headroom band over it. */
function usefulOf(room: RoomArea): number {
  const net = room.net ?? 0
  const low = room.headroom?.bands.find((b) => b.height === limit('headroomLow'))
  return low === undefined ? net : Math.min(net, low.area)
}

/** The figures quoted where the plan will be built, or null where Grid has none. */
export function localAreas(plan: FloorPlan, areas: PlanAreas): LocalAreas | null {
  const country = areas.reader.country
  if (country === 'ES') {
    const useful = new Map<string, number>()
    for (const f of areas.floors) for (const r of f.rooms) if (notCounted(r) === null && r.net !== null) useful.set(r.id, (useful.get(r.id) ?? 0) + usefulOf(r))
    const total = [...useful.values()].reduce((a, b) => a + b, 0)
    const shared = areas.notInFlatsToPartyWalls?.grossExternal ?? null
    const builtSum = areas.flats.reduce((sum, flat) => sum + (flat.toPartyWalls?.grossExternal ?? 0), 0)
    const flats = areas.flats.map((flat): LocalFlat => {
      const built = flat.toPartyWalls?.grossExternal ?? null
      const builtShared = built === null || shared === null || builtSum === 0 ? null : built + (shared * built) / builtSum
      return { id: flat.id, name: flat.name, useful: flat.rooms.reduce((sum, id) => sum + (useful.get(id) ?? 0), 0), built, builtShared }
    })
    // With flats, the built area without the shared parts is the flats' own; with them, the whole.
    const built = flats.length === 0 ? areas.grossExternal : flats.some((f) => f.built === null) ? null : builtSum
    return { country, useful: total, built, builtShared: areas.grossExternal, flats }
  }
  if (country === 'US') {
    const floors = new Set(footprintFloors(plan))
    const counted = areas.floors.filter((f) => floors.has(f.floor))
    const aboveGround = counted.some((f) => f.conditioned === null) ? null : counted.reduce((sum, f) => sum + (f.conditioned ?? 0), 0)
    return { country, aboveGround, floors: counted.map((f) => f.floor), all: areas.conditioned }
  }
  return null
}

/** The figures' lines for grid_areas, in the speaker's language. */
export function localAreaLines(local: LocalAreas, units: Display, s: Speaker): string[] {
  const A = (v: number | null): string => (v === null ? s.say('areas.local.notKnown') : areaText(v, units))
  if (local.country === 'US') {
    return [s.say('areas.local.heading.US'), `  ${s.say('areas.local.aboveGround', { area: A(local.aboveGround), all: A(local.all) })}`, s.say('areas.local.rule')]
  }
  const lines = [
    s.say('areas.local.heading.ES'),
    `  ${s.say('areas.local.useful', { area: A(local.useful), low: num(String(limit('headroomLow'))) })}`,
    `  ${s.say('areas.local.built', { area: A(local.built) })}`,
  ]
  if (local.flats.length === 0) lines.push(`  ${s.say('areas.local.builtShared.noFlats', { area: A(local.builtShared) })}`)
  else {
    lines.push(`  ${s.say('areas.local.builtShared', { area: A(local.builtShared) })}`)
    for (const flat of local.flats) lines.push(`    ${s.say('areas.local.flat', { flat: name(flat.name), useful: A(flat.useful), built: A(flat.built), shared: A(flat.builtShared) })}`)
  }
  lines.push(s.say('areas.local.rule'))
  return lines
}

/** The figures as data, rounded to the millimetre's square. */
export function localAreaData(local: LocalAreas): Record<string, unknown> {
  const r = (v: number | null): number | null => (v === null ? null : Math.round(Number((v * 1e6).toPrecision(12))) / 1e6 + 0)
  if (local.country === 'US') return { country: 'US', aboveGround: r(local.aboveGround), floors: local.floors, conditioned: r(local.all) }
  return {
    country: 'ES',
    useful: r(local.useful),
    built: r(local.built),
    builtShared: r(local.builtShared),
    flats: local.flats.map((f) => ({ id: f.id, name: f.name, useful: r(f.useful), built: r(f.built), builtShared: r(f.builtShared) })),
  }
}
