/**
 * CNT-9: the facts of the person's own when a plan is written again from rooms text.
 *
 * Rooms text says where the rooms, walls and openings are; it does not hold the facts a part
 * carries (a fire rating, a department) or a room's stated number. So a plan read back as rooms
 * text and written again keeps them by id: a wall, opening, room or floor the text writes with
 * the id of one the plan had keeps that part's facts, and a room keeps its number, unless the
 * text states its own (a `raw` line does). A part the text no longer has takes its facts with it,
 * and `carryFacts` says which, so none is lost unseen.
 *
 * Pure: two plans in, a plan out.
 *
 * CNT-15 (C24): so do a wall's, a door's and a window's named type and a room's finishes, which
 * rooms text does not hold either. A value the text writes that its type gives the same is left to
 * the type (`typed`), so a change to the type still reaches the part; one it gives otherwise is
 * the part's own.
 *
 * WRT-70: a type the part took from the plan's defaults (`types.defaults`) is not its own, so it is
 * not carried; a part the text writes with no type of its own takes the default as the reading
 * does, recorded in `typed`, so the file names a type only on the parts that named one.
 */
import { WallKindSchema, type FloorPlan, type TypedValue, type WallKind } from '../types/floorplan'
import { planDoorTypes, planWallTypes, planWindowTypes } from '../geometry/partTypes'

type Part = {
  readonly id: string
  readonly properties?: Readonly<Record<string, string | number | boolean>> | undefined
  readonly number?: string | undefined
  readonly finishes?: Readonly<Record<string, string | undefined>> | undefined
  readonly wallType?: string | undefined
  readonly doorType?: string | undefined
  readonly windowType?: string | undefined
  readonly typed?: readonly TypedValue[] | undefined
}

export interface FactsCarried {
  /** The plan written, with the facts carried onto it. */
  readonly plan: FloorPlan
  /** How many parts kept their facts or number. */
  readonly kept: number
  /** The parts that carried facts or a number and are not in the text, as `room "office"`. */
  readonly lost: readonly string[]
}

/** A type the part names itself, not one the reading gave it from the plan's defaults. */
const named = (part: Part, field: 'wallType' | 'doorType' | 'windowType'): string | undefined => (part.typed?.includes(field) === true ? undefined : part[field])

const carries = (part: Part): boolean =>
  part.number !== undefined || Object.keys(part.properties ?? {}).length > 0 || part.finishes !== undefined || named(part, 'wallType') !== undefined || named(part, 'doorType') !== undefined || named(part, 'windowType') !== undefined

/** The values of a part its type gives the same, which the type is left to give. */
function sameAsType(part: Record<string, unknown>, type: Readonly<Record<string, unknown>> | undefined, fields: readonly TypedValue[]): TypedValue[] {
  if (type === undefined) return []
  return fields.filter((field) => type[field] !== undefined && JSON.stringify(type[field]) === JSON.stringify(part[field]))
}

const withTyped = <T>(part: T, typed: readonly TypedValue[]): T => (typed.length === 0 ? part : ({ ...part, typed } as T))

export function carryFacts(before: FloorPlan, written: FloorPlan): FactsCarried {
  let kept = 0
  const lost: string[] = []
  const walls = planWallTypes(before)
  const doors = planDoorTypes(before)
  const windows = planWindowTypes(before)
  const defaults = before.types?.defaults
  const carry = <T extends Part>(kind: string, old: readonly Part[], now: readonly T[]): T[] => {
    const byId = new Map(old.filter(carries).map((part) => [part.id, part] as const))
    const ids = new Set(now.map((part) => part.id))
    for (const id of byId.keys()) if (!ids.has(id)) lost.push(`${kind} ${JSON.stringify(id)}`)
    return now.map((part) => {
      const was = byId.get(part.id)
      if (was === undefined) return part
      const next: Record<string, unknown> = { ...part }
      let changed = false
      if (part.properties === undefined && was.properties !== undefined) { next['properties'] = was.properties; changed = true }
      if (kind === 'room' && part.number === undefined && was.number !== undefined) { next['number'] = was.number; changed = true }
      if (kind === 'room' && part.finishes === undefined && was.finishes !== undefined) { next['finishes'] = was.finishes; changed = true }
      // CNT-15: the type, and what the text writes that the type gives the same.
      const typed: TypedValue[] = []
      const wallType = named(was, 'wallType')
      if (kind === 'wall' && part.wallType === undefined && wallType !== undefined) {
        next['wallType'] = wallType
        typed.push(...sameAsType(next, walls.get(wallType), ['thickness', 'height', 'kind']))
        changed = true
      }
      const field = kind !== 'opening' ? null : (next['type'] === 'door' ? 'doorType' : next['type'] === 'window' ? 'windowType' : null)
      const openingType = field === null ? undefined : named(was, field)
      if (field !== null && part[field] === undefined && openingType !== undefined) {
        next[field] = openingType
        typed.push(...sameAsType(next, (field === 'doorType' ? doors : windows).get(openingType), ['width', 'height', 'sill', 'kind', 'opens']))
        changed = true
      }
      if (typed.length > 0) next['typed'] = typed
      if (!changed) return part
      kept += 1
      return next as T
    })
  }
  // A part the text writes with its type (a raw line) leaves to the type what it gives the same.
  // WRT-70: one that names none takes the default its kind takes, as the reading gives it.
  const wallKind = (record: Record<string, unknown>): WallKind =>
    typeof record['kind'] === 'string' && (WallKindSchema.options as readonly string[]).includes(record['kind']) ? (record['kind'] as WallKind) : 'interior'
  const leftToType = <T extends Part & { readonly typed?: readonly TypedValue[] | undefined }>(kind: 'wall' | 'opening', parts: readonly T[]): T[] =>
    parts.map((part) => {
      if (part.typed !== undefined) return part
      const record = part as unknown as Record<string, unknown>
      if (kind === 'wall') {
        if (part.wallType !== undefined) return withTyped(part, sameAsType(record, walls.get(part.wallType), ['thickness', 'height', 'kind']))
        const id = record['virtual'] === true ? undefined : defaults?.walls?.[wallKind(record)]
        const type = id === undefined ? undefined : walls.get(id)
        return type === undefined ? part : withTyped({ ...part, wallType: type.id }, ['wallType', ...sameAsType(record, type, ['thickness', 'height', 'kind'])])
      }
      const door = record['type'] === 'door'
      if (!door && record['type'] !== 'window') return part
      const field = door ? 'doorType' : 'windowType'
      const fields: TypedValue[] = door ? ['width', 'height', 'kind', 'opens'] : ['width', 'height', 'sill', 'kind', 'opens']
      const list = door ? doors : windows
      const own = part[field]
      if (own !== undefined) return withTyped(part, sameAsType(record, list.get(own), fields))
      const id = door ? defaults?.door : defaults?.window
      const type = id === undefined ? undefined : list.get(id)
      return type === undefined ? part : withTyped({ ...part, [field]: type.id }, [field, ...sameAsType(record, type, fields)])
    })
  const plan: FloorPlan = {
    ...written,
    ...(written.types === undefined && before.types !== undefined ? { types: before.types } : {}),
    walls: leftToType('wall', carry('wall', before.walls, written.walls)),
    openings: leftToType('opening', carry('opening', before.openings, written.openings)),
    rooms: carry('room', before.rooms, written.rooms),
    ...(written.floors === undefined ? {} : { floors: carry('floor', before.floors ?? [], written.floors) }),
  }
  if (written.floors === undefined) for (const floor of (before.floors ?? []).filter(carries)) lost.push(`floor ${JSON.stringify(floor.id)}`)
  return { plan, kept, lost }
}
