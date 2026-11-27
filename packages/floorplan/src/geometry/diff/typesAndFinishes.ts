/**
 * WRT-86: the plan's named types (C24, CNT-15) and the rooms' finishes compared between two
 * versions, for `compareBuildings`.
 *
 * A type is what fills its parts, so a type whose thickness changed changes every wall of it and
 * each wall says its own thickness; what no wall says is the type: its name, which figures of it
 * changed, and which parts take it. Each list of `types` is paired by id, and each type added,
 * removed or changed is one line, with the parts that take it (or took it). A part that takes
 * another type says so in its own line (`partTypeSaid`).
 *
 * A room's finishes change nothing that stands, so the building comparison said "Changes: none":
 * `finishChanges` says each surface, each face finished other than the walls and the bands of
 * finish, before and after.
 *
 * Pure: plans in, plain data out. Every word is a message (`messages/en.ts`).
 */
import type { FloorPlan, Opening, Room, Wall } from '../plan'
import type { FinishBand, Finishes } from '../../types/floorplan'
import { metresText } from '../rounding'
import { english, joined, name, num, said, type MessageKey, type Said, type Value } from '../../messages/say'
import type { EntityRef } from './types'

/** The lists of `types`, in the order they are said. */
export const TYPE_LISTS = ['walls', 'doors', 'windows'] as const
export type TypeListName = (typeof TYPE_LISTS)[number]

/** At most this many parts are named in a type's line; more are counted. */
const PARTS_NAMED = 4

type TypeRecord = Readonly<Record<string, unknown>> & { readonly id: string; readonly name: string }

export interface TypeFieldChange {
  readonly field: string
  /** The plan's own values; null when unstated. */
  readonly before: unknown
  readonly after: unknown
}

export interface TypeChange {
  readonly list: TypeListName
  readonly type: string
  /** Its name in the later plan, the earlier one's for a type removed. */
  readonly name: string
  readonly status: 'added' | 'removed' | 'changed'
  /** The fields that changed; for a type added, every field it states. */
  readonly fields: readonly TypeFieldChange[]
  /** The parts that take it, by the later ids; for a type removed, the parts that took it, by the earlier ones. */
  readonly parts: readonly EntityRef[]
  readonly said: Said
}

const listOf = (plan: FloorPlan, list: TypeListName): readonly TypeRecord[] => (plan.types?.[list] ?? []) as readonly TypeRecord[]

function byId(types: readonly TypeRecord[]): Map<string, TypeRecord> {
  const out = new Map<string, TypeRecord>()
  for (const type of types) if (!out.has(type.id)) out.set(type.id, type)
  return out
}

/** The id of the type an opening takes, by its kind. A doorless opening takes none. */
export function openingTypeId(opening: Opening): string | undefined {
  return opening.type === 'door' ? opening.doorType : opening.type === 'window' ? opening.windowType : undefined
}

const LENGTH_FIELDS: ReadonlySet<string> = new Set(['thickness', 'height', 'width', 'sill'])

/** A type's value in words: lengths in metres, names quoted, yes or no. */
function valueSaid(field: string, value: unknown): Value {
  if (value === undefined || value === null) return said('diff.value.notStated')
  if (typeof value === 'number') return LENGTH_FIELDS.has(field) ? said('diff.value.metres', { value: num(metresText(value)) }) : num(String(value))
  if (typeof value === 'boolean') return said(value ? 'diff.value.yes' : 'diff.value.no')
  if (typeof value === 'string') return field === 'height' || field === 'kind' ? value : name(value)
  if (typeof value === 'object') {
    const part = value as { readonly width?: unknown; readonly height?: unknown }
    if (typeof part.width === 'number') {
      const size = typeof part.height === 'number' ? `${metresText(part.width)} × ${metresText(part.height)}` : metresText(part.width)
      return said('diff.value.metres', { value: num(size) })
    }
  }
  return JSON.stringify(value)
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The fields of a type other than its id, in the order the later one states them. */
function fieldsBetween(before: TypeRecord | undefined, after: TypeRecord | undefined): TypeFieldChange[] {
  const keys = [...new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})])].filter((k) => k !== 'id')
  return keys.filter((k) => !same(before?.[k], after?.[k])).map((k) => ({ field: k, before: before?.[k] ?? null, after: after?.[k] ?? null }))
}

/** How a type is named in a line: by its name, with its id when that is another word. */
function typeName(type: TypeRecord): Value {
  return type.name === type.id ? name(type.name) : said('diff.type.named', { name: name(type.name), id: name(type.id) })
}

/** The type a part names, by its name in that plan; "none" when it names none, its id when no type has it. */
export function partTypeName(plan: FloorPlan, list: TypeListName, id: string | undefined): Value {
  if (id === undefined) return said('diff.type.none')
  const type = byId(listOf(plan, list)).get(id)
  return name(type?.name ?? id)
}

/** A part that takes another type, in words: `type "Brick 300" → "Block 200"`; null when it kept its type. */
export function partTypeSaid(earlier: FloorPlan, later: FloorPlan, list: TypeListName, before: string | undefined, after: string | undefined): Said | null {
  if (before === after) return null
  return said('diff.type.part', { before: partTypeName(earlier, list, before), after: partTypeName(later, list, after) })
}

function partsTaking(plan: FloorPlan, list: TypeListName, id: string): EntityRef[] {
  if (list === 'walls') return plan.walls.filter((w: Wall) => w.virtual !== true && w.wallType === id).map((w) => ({ type: 'wall', id: w.id }))
  const kind = list === 'doors' ? 'door' : 'window'
  return plan.openings.filter((o) => o.type === kind && openingTypeId(o) === id).map((o) => ({ type: 'opening', id: o.id }))
}

function partsSaid(parts: readonly EntityRef[], list: TypeListName, gone: boolean): Said {
  const prefix = gone ? 'diff.type.took' : 'diff.type.taken'
  if (parts.length === 0) return said(`${prefix}.none` as MessageKey)
  const named: Value[] = parts.slice(0, PARTS_NAMED).map((p) => name(p.id))
  if (parts.length > PARTS_NAMED) named.push(said('diff.type.more', { count: parts.length - PARTS_NAMED }))
  const values = { count: parts.length, parts: joined(named, 'join.comma', 'join.and') }
  return said(`${prefix}.${list}.${parts.length === 1 ? 'one' : 'many'}` as MessageKey, values)
}

const LIST_KEY: Readonly<Record<TypeListName, MessageKey>> = { walls: 'diff.type.walls', doors: 'diff.type.doors', windows: 'diff.type.windows' }

/**
 * Each type added, removed or changed between the two plans, list by list, in the later plan's
 * order and then the types removed. `earlier` is the earlier plan laid on the later one, under
 * its ids (`BuildingComparison.aligned`).
 */
export function compareTypes(earlier: FloorPlan, later: FloorPlan): TypeChange[] {
  const out: TypeChange[] = []
  for (const list of TYPE_LISTS) {
    const was = byId(listOf(earlier, list))
    const is = byId(listOf(later, list))
    for (const [id, type] of is) {
      const before = was.get(id)
      const fields = fieldsBetween(before, type)
      if (before !== undefined && fields.length === 0) continue
      const parts = partsTaking(later, list, id)
      const subject = said(LIST_KEY[list], { type: typeName(type) })
      const taken = partsSaid(parts, list, false)
      if (before === undefined) {
        const stated = fields.filter((f) => f.field !== 'name')
        const figures = stated.length === 0 ? '' : said('diff.type.figures', { figures: joined(stated.map((f) => said('diff.type.figure', { field: f.field, value: valueSaid(f.field, f.after) })), 'join.comma', 'join.and') })
        out.push({ list, type: id, name: type.name, status: 'added', fields: stated, parts, said: said('diff.type.added', { type: subject, figures, taken }) })
        continue
      }
      const changes = joined(fields.map((f) => said('diff.type.field', { field: f.field, before: valueSaid(f.field, f.before), after: valueSaid(f.field, f.after) })), 'join.comma', 'join.and')
      out.push({ list, type: id, name: type.name, status: 'changed', fields, parts, said: said('diff.type.changed', { type: subject, changes, taken }) })
    }
    for (const [id, type] of was) {
      if (is.has(id)) continue
      const parts = partsTaking(earlier, list, id)
      const subject = said(LIST_KEY[list], { type: typeName(type) })
      out.push({ list, type: id, name: type.name, status: 'removed', fields: [], parts, said: said('diff.type.removed', { type: subject, taken: partsSaid(parts, list, true) }) })
    }
  }
  return out
}

export type FinishPlace = 'floor' | 'walls' | 'ceiling' | 'skirting' | 'face' | 'bands'

export interface FinishChange {
  /** The surface, `face` for one wall's face finished other than the walls, or `bands`. */
  readonly surface: FinishPlace
  /** The wall, for a face. */
  readonly wall: string | null
  /** The plan's own values: a finish's name, `false` for no skirting, the bands as stated; null when unstated. */
  readonly before: unknown
  readonly after: unknown
  readonly said: Said
}

const SURFACES = ['floor', 'walls', 'ceiling', 'skirting'] as const
const SURFACE_KEY: Readonly<Record<(typeof SURFACES)[number], MessageKey>> = {
  floor: 'diff.finish.floor',
  walls: 'diff.finish.walls',
  ceiling: 'diff.finish.ceiling',
  skirting: 'diff.finish.skirting'
}

function finishSaid(value: string | false | undefined): Value {
  if (value === undefined) return said('diff.value.notStated')
  if (value === false) return said('diff.finish.noSkirting')
  return name(value)
}

function bandSaid(band: FinishBand): Said {
  const where = band.wall !== undefined ? said('diff.finish.band.wall', { wall: name(band.wall) }) : band.behind !== undefined ? said('diff.finish.band.behind', { item: name(band.behind) }) : ''
  return band.from === undefined && band.behind !== undefined
    ? said('diff.finish.band.onTop', { finish: name(band.finish), height: num(metresText(band.height)), where })
    : said('diff.finish.band', { finish: name(band.finish), height: num(metresText(band.height)), from: num(metresText(band.from ?? 0)), where })
}

function bandsSaid(bands: readonly FinishBand[] | undefined): Value {
  if (bands === undefined || bands.length === 0) return said('diff.finish.bands.none')
  return joined(bands.map(bandSaid), 'join.semicolon')
}

/** What changed in a room's finishes, surface by surface, then its faces by wall, then its bands. */
export function finishChanges(before: Pick<Room, 'finishes'>, after: Pick<Room, 'finishes'>): FinishChange[] {
  const a: Finishes = before.finishes ?? {}
  const b: Finishes = after.finishes ?? {}
  const out: FinishChange[] = []
  for (const surface of SURFACES) {
    const was = a[surface]
    const is = b[surface]
    if (was === is) continue
    out.push({ surface, wall: null, before: was ?? null, after: is ?? null, said: said('diff.finish.surface', { surface: said(SURFACE_KEY[surface]), before: finishSaid(was), after: finishSaid(is) }) })
  }
  const faces = (f: Finishes): Map<string, string> => {
    const found = new Map<string, string>()
    for (const face of f.faces ?? []) if (!found.has(face.wall)) found.set(face.wall, face.finish)
    return found
  }
  const facesWere = faces(a)
  const facesAre = faces(b)
  for (const wall of [...new Set([...facesAre.keys(), ...facesWere.keys()])]) {
    const was = facesWere.get(wall)
    const is = facesAre.get(wall)
    if (was === is) continue
    out.push({ surface: 'face', wall, before: was ?? null, after: is ?? null, said: said('diff.finish.face', { wall: name(wall), before: finishSaid(was), after: finishSaid(is) }) })
  }
  if (!same(a.bands ?? [], b.bands ?? [])) {
    out.push({ surface: 'bands', wall: null, before: a.bands ?? null, after: b.bands ?? null, said: said('diff.finish.bands', { before: bandsSaid(a.bands), after: bandsSaid(b.bands) }) })
  }
  return out
}

/** A finish change in English, for a room's line. */
export const finishWords = (change: FinishChange): string => english(change.said)
