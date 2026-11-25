/**
 * CNT-15 (C24): one change to a named wall, door or window type, which every part of the type
 * takes in the same edit (lab RT-22, CP2-3): "make every partition 120 mm", "the glazed partition
 * is laminated glass". The same call adds a type, gives it to parts, by id, and makes it the
 * default for parts that name none.
 *
 * A part given the type has its own values for what the type states taken out, so it reads the
 * type's from then on; the answer names each. Pure: a survey in, a patch out.
 */
import { planDoorTypes, planWallTypes, planWindowTypes, wallTypeOf, openingTypeOf, type FloorPlan, type WallKind } from '@ongrid/floorplan/geometry'
import { DOOR_KINDS, WINDOW_KINDS, WallKindSchema, type DoorType, type WallType, type WindowType } from '@ongrid/floorplan/types/floorplan'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { emptyPatch, listed, type OpeningChange, type Patch } from './edits'
import { EditRefused } from './refused'

/** The lists a type change can be on: the part that names the type. */
export const TYPE_OF = ['wall', 'door', 'window'] as const
export type TypeOf = (typeof TYPE_OF)[number]

/** The fields of a type a change can set, by list. */
export const TYPE_FIELDS: Readonly<Record<TypeOf, readonly string[]>> = {
  wall: ['name', 'thickness', 'height', 'kind', 'glazed', 'material'],
  door: ['name', 'width', 'height', 'kind', 'glazed', 'material'],
  window: ['name', 'width', 'height', 'sill', 'kind', 'glazed', 'material'],
}

export interface TypeChange {
  readonly of: TypeOf
  /** The type's id: an existing one to change, or a new one to add. */
  readonly id: string
  /** The values to set. */
  readonly set: Readonly<Record<string, string | number | boolean>>
  /** The type's values to take out. */
  readonly clear?: readonly string[]
  /** The parts, by id, to give the type. */
  readonly parts?: readonly string[]
  /** Make it the default for parts that name no type (a wall type for walls of its kind). */
  readonly makeDefault?: boolean
}

type AnyType = WallType | DoorType | WindowType
const LIST = { wall: 'walls', door: 'doors', window: 'windows' } as const

/** A value in an answer: metres to the centimetre, else as it is. */
function shown(field: string, value: unknown): string {
  if (value === undefined) return 'not stated'
  if (typeof value === 'number') return `${value.toFixed(2)} m`
  return typeof value === 'string' ? quoted(value) : String(value)
}

/** The plan's types, as a plain object the file can hold. */
function typesOf(plan: FloorPlan): Record<string, unknown> {
  return JSON.parse(JSON.stringify(plan.types ?? {})) as Record<string, unknown>
}

export function changeType(survey: Survey, change: TypeChange): Patch {
  const plan = survey.plan
  const { of, id } = change
  const fields = TYPE_FIELDS[of]
  for (const field of [...Object.keys(change.set), ...(change.clear ?? [])]) {
    if (!fields.includes(field)) throw new EditRefused(`A ${of} type has no ${field}: it takes ${fields.join(', ')}.`)
  }
  for (const field of change.clear ?? []) {
    if (field === 'name') throw new EditRefused('A type keeps its name: give another name instead.')
    if (Object.hasOwn(change.set, field)) throw new EditRefused(`${field} is both set and taken out: give one.`)
  }
  const kind = change.set['kind']
  if (kind !== undefined) {
    const kinds: readonly string[] = of === 'wall' ? WallKindSchema.options : of === 'door' ? DOOR_KINDS : WINDOW_KINDS
    if (typeof kind !== 'string' || !kinds.includes(kind)) throw new EditRefused(`A ${of} type's kind is one of ${kinds.join(', ')}.`)
  }
  const byId: ReadonlyMap<string, AnyType> = of === 'wall' ? planWallTypes(plan) : of === 'door' ? planDoorTypes(plan) : planWindowTypes(plan)
  const was = byId.get(id)
  if (was === undefined && typeof change.set['name'] !== 'string') {
    const known = [...byId.keys()]
    throw new EditRefused(`The plan has no ${of} type ${quoted(id)}${known.length === 0 ? '' : ` (it has ${listed(known.map(quoted), 6)})`}; to add it, give its name.`)
  }
  if (was === undefined && Object.keys(change.set).length === 0 && (change.parts ?? []).length === 0) throw new EditRefused('Nothing to change: give a value to set, a value to take out, or parts to give the type.')

  const said: string[] = []
  const next: Record<string, unknown> = { ...(was ?? { id }) }
  for (const [field, value] of Object.entries(change.set)) {
    const before = (was as Record<string, unknown> | undefined)?.[field]
    if (was !== undefined && before !== value) said.push(`${field} ${shown(field, before)} → ${shown(field, value)}`)
    next[field] = value
  }
  for (const field of change.clear ?? []) {
    const before = (was as Record<string, unknown> | undefined)?.[field]
    if (before === undefined) continue
    said.push(`${field} ${shown(field, before)} taken out`)
    delete next[field]
  }
  const types = typesOf(plan)
  const list = Array.isArray(types[LIST[of]]) ? [...(types[LIST[of]] as Record<string, unknown>[])] : []
  const at = list.findIndex((t) => t['id'] === id)
  if (at >= 0) list[at] = next
  else list.push(next)
  types[LIST[of]] = list
  const typeName = quoted(String(next['name']))
  const lines = [was === undefined ? `Added ${of} type ${quoted(id)} (${typeName}).` : said.length === 0 ? `${of[0]!.toUpperCase()}${of.slice(1)} type ${quoted(id)} (${typeName}) is unchanged.` : `${of[0]!.toUpperCase()}${of.slice(1)} type ${quoted(id)} (${typeName}): ${said.join(', ')}.`]

  // The parts given the type: each takes out its own values for what the type states.
  const states = (field: string): boolean => next[field] !== undefined && !(field === 'height' && next[field] === 'floor')
  const walls = new Map<string, NonNullable<ReturnType<Patch['walls']['get']>>>()
  const openings = new Map<string, OpeningChange>()
  const given: string[] = []
  const took: string[] = []
  for (const part of change.parts ?? []) {
    if (of === 'wall') {
      const wall = plan.walls.find((w) => w.id === part)
      if (wall === undefined) throw new EditRefused(`The plan has no wall ${quoted(part)}.`)
      if (wall.virtual === true) throw new EditRefused(`Wall ${quoted(part)} is a dividing line, which takes no type.`)
      // Its own: stated in its file, not filled by its type or the reading.
      const own = (['thickness', 'height', 'kind'] as const).filter((field) => states(field) && !(wall.typed ?? []).includes(field) && !(wall.unstated ?? []).includes(field))
      walls.set(part, { wallType: id, ...Object.fromEntries(own.map((field) => [field, null])) })
      given.push(quoted(part))
      if (own.length > 0) took.push(`${quoted(part)} its own ${own.join(' and ')}`)
    } else {
      const opening = plan.openings.find((o) => o.id === part)
      if (opening === undefined) throw new EditRefused(`The plan has no opening ${quoted(part)}.`)
      if (opening.type !== of) throw new EditRefused(`${quoted(part)} is a ${opening.type === 'opening' ? 'doorless opening' : opening.type}, and only a ${of} takes a ${of} type.`)
      const own = (['width', 'height', 'sill', 'kind', 'opens'] as const).filter((field) => states(field) && !(opening.typed ?? []).includes(field) && (opening as Record<string, unknown>)[field] !== undefined)
      openings.set(part, { [of === 'door' ? 'doorType' : 'windowType']: id, ...Object.fromEntries(own.map((field) => [field, null])) })
      given.push(quoted(part))
      if (own.length > 0) took.push(`${quoted(part)} its own ${own.join(' and ')}`)
    }
  }
  if (given.length > 0) lines.push(`Gave ${listed(given, 6)} the type.${took.length === 0 ? '' : ` Took out ${listed(took, 4)}, so ${took.length === 1 ? 'it reads' : 'they read'} the type's.`}`)

  if (change.makeDefault === true) {
    const defaults = { ...((types['defaults'] as Record<string, unknown> | undefined) ?? {}) }
    if (of === 'wall') {
      // WRT-59: a default is for the walls of one kind, so the type states which; never a guess.
      const kindOf = next['kind'] as WallKind | undefined
      if (kindOf === undefined) throw new EditRefused(`A default wall type is for walls of one kind: give kind (interior or exterior) with default, so ${quoted(id)} is the default for the right walls.`)
      defaults['walls'] = { ...((defaults['walls'] as Record<string, unknown> | undefined) ?? {}), [kindOf]: id }
      lines.push(`It is the default for ${kindOf} walls that name no type.`)
    } else {
      defaults[of] = id
      lines.push(`It is the default for ${of}s that name no type.`)
    }
    types['defaults'] = defaults
  }

  // Every part of the type, as the plan reads now: the ones a change to it reaches.
  const of_ = of === 'wall'
    ? plan.walls.filter((w) => wallTypeOf(plan, w)?.id === id).map((w) => w.id)
    : plan.openings.filter((o) => openingTypeOf(plan, o)?.id === id).map((o) => o.id)
  // A new default also reaches the parts that name no type of their own (the plan is read before it).
  const ownType = (typed: readonly string[] | undefined, field: string, value: unknown): boolean => value !== undefined && !(typed ?? []).includes(field)
  const byDefault = change.makeDefault !== true
    ? []
    : of === 'wall'
      ? plan.walls.filter((w) => w.virtual !== true && w.kind === next['kind'] && !ownType(w.typed, 'wallType', w.wallType)).map((w) => w.id)
      : plan.openings.filter((o) => o.type === of && !ownType(o.typed, of === 'door' ? 'doorType' : 'windowType', of === 'door' ? o.doorType : o.windowType)).map((o) => o.id)
  const reached = [...new Set([...of_, ...byDefault, ...(change.parts ?? [])])]
  const overriding = of === 'wall'
    ? plan.walls.filter((w) => reached.includes(w.id) && !walls.has(w.id) && w.thickness !== undefined && !(w.typed ?? []).includes('thickness') && !(w.unstated ?? []).includes('thickness') && next['thickness'] !== undefined).map((w) => quoted(w.id))
    : []
  if (change.makeDefault === true && reached.length === 0) {
    if (of === 'wall') {
      const solid = plan.walls.filter((w) => w.virtual !== true)
      const count = (kind: string): number => solid.filter((w) => w.kind === kind && !ownType(w.typed, 'wallType', w.wallType)).length
      const other = next['kind'] === 'interior' ? 'exterior' : 'interior'
      lines.push(`No wall takes it: the plan has no ${next['kind'] as string} wall that names no type (${count('interior')} interior, ${count('exterior')} exterior).${count(other) > 0 ? ` Change its kind to ${other} to reach the ${count(other)} ${other} wall${count(other) === 1 ? '' : 's'}, or give it walls with parts.` : ' Give it walls with parts.'}`)
    } else lines.push(`No ${of} takes it: the plan has no ${of} that names no type. Give it ${of}s with parts.`)
  } else if (said.length > 0 || given.length > 0 || change.makeDefault === true) lines.push(`${reached.length} ${of}${reached.length === 1 ? '' : 's'} take${reached.length === 1 ? 's' : ''} it${reached.length === 0 ? '' : `: ${listed(reached.map(quoted), 6)}`}.`)
  if (overriding.length > 0) lines.push(`${listed(overriding, 4)} state${overriding.length === 1 ? 's' : ''} a thickness of its own, which wins over the type's; give it the type with parts to read the type's.`)
  const patch = emptyPatch(lines)
  return { ...patch, walls, openings, plan: { types } }
}
