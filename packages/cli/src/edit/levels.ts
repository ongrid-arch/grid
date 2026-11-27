/**
 * Floor-to-floor heights set (LVL-24, `grid_set_levels`): the levels a floor-to-floor gives
 * (`levelsSetTo` in the core) written as the floors' `elevation` and, where asked or where a floor
 * states none, their clear `height`: a patch of the plan's own floors, as every change is.
 *
 * `levelLines` says every floor's level, floor-to-floor and clear height, and the building's height
 * with the datum it is measured from, for this change's answer and for a write's (`command/write.ts`).
 */
import { buildingHeight, buildingHeights, floorOf, levelsSetTo, metresText, planBuildings, planFloors, planLevels, type FloorLevel, type FloorSet, type FloorToFloorRequest } from '@ongrid/floorplan/geometry'
import { english, joined, name, num, said, type Said, type Value } from '@ongrid/floorplan/messages'
import { heightStated, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type PartList, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'

const m = (value: number): Value => num(metresText(value))
const names = (ids: readonly string[]): Value => {
  const shown = ids.slice(0, 12).map((id) => name(id))
  return joined(ids.length > 12 ? [...shown, `+${ids.length - 12}`] : shown, 'join.comma', 'join.and')
}
const figures = (values: readonly number[]): Value => joined([...new Set(values.map((v) => metresText(v)))].map((v) => num(v)), 'join.comma', 'join.and')
const refuse = (sentence: Said): never => {
  throw new EditRefused(english(sentence))
}

/** The plan with each floor set as `set` says, and the walls that take their floor's height taking the new one. */
export function planWithLevels(plan: FloorPlan, set: readonly FloorSet[]): FloorPlan {
  const byId = new Map(set.map((s) => [s.floor, s] as const))
  const floors = (plan.floors ?? []).map((f) => {
    const s = byId.get(f.id)
    return s === undefined ? f : { ...f, ...(s.elevation === undefined ? {} : { elevation: s.elevation }), ...(s.height === undefined ? {} : { height: s.height }) }
  })
  const heightOf = new Map(set.flatMap((s) => (s.height === undefined ? [] : [[s.floor, s.height] as const])))
  const walls = plan.walls.map((w) => {
    const height = heightOf.get(w.through ?? floorOf(w))
    return height === undefined || w.virtual || heightStated(w) || plan.floors?.find((f) => f.id === (w.through ?? floorOf(w)))?.roof !== undefined ? w : { ...w, height }
  })
  return { ...plan, floors, walls }
}

/** One floor-to-floor set on the floors asked for, as a patch of their floors (and their rooms' height, given `ceiling`). */
export function setLevels(survey: Survey, request: FloorToFloorRequest): Patch {
  const plan = survey.plan
  const known = planFloors(plan).map((f) => f.id)
  if (request.building !== undefined) {
    const buildings = planBuildings(plan)
    const building = buildings.find((b) => b.id === request.building)
    if (building === undefined) refuse(said('edit.levels.unknownBuilding', { building: name(request.building), known: buildings.length === 0 ? said('edit.levels.buildings.none') : said('edit.levels.buildings', { buildings: names(buildings.map((b) => b.id)) }) }))
    const outside = (request.floors ?? []).filter((f) => !building!.floors.includes(f))
    if (outside.length > 0) refuse(said('edit.levels.notInBuilding', { floors: names(outside), building: name(request.building), known: names(building!.floors) }))
  }
  const unknown = (request.floors ?? []).filter((f) => !known.includes(f))
  if (unknown.length > 0) refuse(said('edit.levels.unknownFloor', { floors: names(unknown), known: names(known) }))

  const { set, problems } = levelsSetTo(plan, request)
  const first = problems[0]
  if (first !== undefined) {
    if (first.kind === 'no-room') refuse(said('edit.levels.noRoom', { height: m(request.floorToFloor), slab: m(first.slab), floor: name(first.floor) }))
    else refuse(said('edit.levels.ceilingTooTall', { ceiling: m(request.ceiling!), floor: name(first.floor), height: m(request.floorToFloor), fits: m(first.fits) }))
  }
  const before = new Map(planLevels(plan).map((l) => [l.floor, l] as const))
  const hit = set.filter((s) => s.set)
  const onHit = new Set(hit.map((s) => s.floor))
  const rooms = request.ceiling === undefined ? [] : plan.rooms.filter((r) => onHit.has(floorOf(r)) && r.height !== request.ceiling)
  const changed = set.filter((s) => {
    const floor = plan.floors?.find((f) => f.id === s.floor)
    return (s.elevation !== undefined && floor?.elevation !== s.elevation) || (s.height !== undefined && floor?.height !== s.height)
  })
  if (changed.length === 0 && rooms.length === 0) {
    refuse(said('edit.levels.unchanged', { height: m(request.floorToFloor), ceiling: request.ceiling === undefined ? '' : said('edit.levels.unchanged.ceiling', { height: m(request.ceiling) }) }))
  }

  const moved = set.filter((s) => !s.set).map((s) => s.floor)
  const kept = hit.filter((s) => s.elevation === undefined).map((s) => s.floor)
  const base = kept.length === 0 ? null : kept[0]!
  const lines: string[] = [
    english(said('edit.levels.set', {
      height: m(request.floorToFloor),
      floors: names(hit.map((s) => s.floor)),
      base: base === null ? said('edit.levels.base.none') : name(base),
      at: m(base === null ? 0 : before.get(base)!.floorLevel),
    })),
    english(said('edit.levels.walls', { floors: names(hit.map((s) => s.floor)), heights: figures(hit.map((s) => s.height!)) })),
  ]
  // The floor-to-floor wins over a height a floor stated, which its walls took as their storey's.
  const replaced = hit.filter((s) => s.was !== null && s.was !== undefined && metresText(s.was, 3) !== metresText(s.height!, 3))
  if (replaced.length > 0) lines.push(english(said('edit.levels.replaced', { floors: names(replaced.map((s) => s.floor)), heights: figures(replaced.map((s) => s.was!)) })))
  if (request.ceiling !== undefined) lines.push(english(said('edit.levels.ceiling', { height: m(request.ceiling), count: plan.rooms.filter((r) => onHit.has(floorOf(r))).length, floors: names(hit.map((s) => s.floor)) })))
  if (moved.length > 0) lines.push(english(said('edit.levels.moved', { floors: names(moved) })))
  const after = planWithLevels(plan, set)
  lines.push(...levelLines(after))

  const floors = new Map<string, Readonly<Record<string, unknown>>>()
  for (const s of changed) floors.set(s.floor, { ...(s.elevation === undefined ? {} : { elevation: s.elevation }), ...(s.height === undefined ? {} : { height: s.height }) })
  const parts = new Map<PartList, ReadonlyMap<string, Readonly<Record<string, unknown>>>>(floors.size === 0 ? [] : [['floors', floors]])
  const patch = emptyPatch(lines)
  for (const r of rooms) (patch.rooms as Map<string, RoomChange>).set(r.id, { height: request.ceiling } as RoomChange)
  return {
    ...patch,
    ...(parts.size === 0 ? {} : { parts }),
    extra: { levels: planLevels(after).map((l) => ({ floor: l.floor, building: l.building, level: l.floorLevel, floorToFloor: l.floorToFloor, clearHeight: l.clearHeight })) },
  }
}

/** A run of floors one over the other with the same floor-to-floor and clear height, said as one line. */
function rows(levels: readonly FloorLevel[]): string[] {
  const out: string[] = []
  let i = 0
  const same = (a: FloorLevel, b: FloorLevel): boolean => a.floorToFloor === b.floorToFloor && a.clearHeight === b.clearHeight && a.heightStated === b.heightStated && a.over.length > 0 && b.over.length > 0
  while (i < levels.length) {
    let j = i
    while (j + 1 < levels.length && same(levels[i]!, levels[j + 1]!) && levels[j]!.over.length === 1 && levels[j]!.over[0] === levels[j + 1]!.floor) j++
    const l = levels[i]!
    const stated = l.heightStated ? said('levels.stated') : ''
    if (j - i >= 2) {
      out.push(`  ${english(said('levels.run', { first: name(l.floor), last: name(levels[j]!.floor), count: j - i + 1, from: m(l.floorLevel), to: m(levels[j]!.floorLevel), ftf: m(l.floorToFloor), clear: m(l.clearHeight), stated }))}`)
      i = j + 1
    } else {
      out.push(`  ${english(said('levels.floor', { floor: name(l.floor), level: m(l.floorLevel), ftf: m(l.floorToFloor), clear: m(l.clearHeight), stated }))}`)
      i++
    }
  }
  return out
}

const HEIGHT_KEY = { floor: 'levels.height.floor', site: 'levels.height.site', pad: 'levels.height.pad', under: 'levels.height.under' } as const

/**
 * Every floor's level, floor-to-floor and clear height, by building, and each building's height
 * from its datum. Empty for a plan of one level, whose answer says its height elsewhere.
 */
export function levelLines(plan: FloorPlan): string[] {
  let levels: FloorLevel[]
  try {
    levels = planLevels(plan)
  } catch {
    return []
  }
  if (new Set(levels.map((l) => `${l.building ?? ''}|${l.level}`)).size < 2) return []
  const lines = [english(said('levels.heading'))]
  const groups = [...new Set(levels.map((l) => l.building))]
  const heights = groups.some((b) => b !== null) ? new Map(buildingHeights(plan).map((b) => [b.id, b.height] as const)) : null
  for (const group of groups) {
    const own = levels.filter((l) => l.building === group)
    if (group !== null) lines.push(english(said('levels.building', { building: name(group) })))
    lines.push(...rows(own))
    const height = group === null ? (heights === null ? buildingHeight(plan) : null) : heights!.get(group) ?? null
    if (height !== null && height !== undefined) lines.push(`  ${english(said(HEIGHT_KEY[height.from], { height: m(height.height), ground: m(height.ground), floor: name(height.floor) }))}`)
  }
  return lines
}
