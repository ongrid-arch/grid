/**
 * The plan's own settings (CNT-50, `grid_set_plan`): what a person says about the plan as a whole,
 * set in one change. The plan's name; how it is read (`display`: the language Grid writes in, the
 * unit of lengths and of areas, the decimal mark and the precision), which never changes a stored
 * number, the file staying in metres; the floors' names, by floor id; and the site's name,
 * address, country and north, through `setSite`, so the two tools set the site the same way.
 *
 * A floor in the plan's floors list is renamed in its own record. A plan that lists no floors gets
 * its list, every floor in the order it is read in, so naming one moves none. The address and the
 * names are kept as written: Grid never looks an address up.
 *
 * Its receipts are keys of the message files, said in English as the edits' answers are. Pure: a
 * survey in, a patch out.
 */
import { planFloors } from '@ongrid/floorplan/geometry'
import { english, hasMessages, joined, name as sayName, num, said, type MessageKey, type Values } from '@ongrid/floorplan/messages'
import { textProblem, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type PartList, type Patch } from './edits'
import { EditRefused } from './refused'
import { setSite, type SiteField, type SiteRequest } from './site'

/** The units lengths and areas may be shown in (`display`), as the plan file holds them. */
export const LENGTH_UNITS = ['m', 'cm', 'mm', 'ft-in'] as const
export const AREA_UNITS = ['m2', 'ft2'] as const
export const DECIMAL_MARKS = ['point', 'comma'] as const

/** The plan-wide fields `grid_set_plan` can take out, beside the site's. */
export const PLAN_FIELDS = ['name', 'language', 'units', 'area', 'decimal', 'precision'] as const
export type PlanField = (typeof PLAN_FIELDS)[number]

/** Where each plan-wide field lives in `display`; `name` is the plan's own. */
const DISPLAY_KEY: Readonly<Record<Exclude<PlanField, 'name'>, string>> = { language: 'language', units: 'length', area: 'area', decimal: 'decimal', precision: 'precision' }

export interface PlanRequest {
  readonly name?: string
  /** A language as `readLanguage` reads it: its primary subtag. */
  readonly language?: string
  readonly units?: (typeof LENGTH_UNITS)[number]
  readonly area?: (typeof AREA_UNITS)[number]
  readonly decimal?: (typeof DECIMAL_MARKS)[number]
  readonly precision?: number
  /** New floor names, by floor id. */
  readonly floors?: Readonly<Record<string, string>>
  /** The site's fields, as `grid_set_site` takes them. */
  readonly site?: Pick<SiteRequest, 'name' | 'address' | 'country' | 'north'>
  readonly remove?: readonly (PlanField | 'site name' | 'address' | 'country' | 'north')[]
}

const refuse = (key: MessageKey, values?: Values): never => {
  throw new EditRefused(english(said(key, values)))
}
const line = (key: MessageKey, values?: Values): string => english(said(key, values))

/** A name of the plan's, held to the text rule; refused naming the field, never the text. */
function nameOf(field: string, value: string): string {
  const trimmed = value.trim()
  const problem = trimmed === '' ? 'is empty' : textProblem(trimmed, 'name')
  if (problem !== null) refuse('edit.plan.refused.text', { field: sayName(field), problem })
  return trimmed
}

/** The plan's name, display, floor names and site set or taken out, as one patch. */
export function setPlan(survey: Survey, request: PlanRequest): Patch {
  const plan = survey.plan
  const remove = request.remove ?? []
  const siteRemove = remove.flatMap((field): SiteField[] => (field === 'site name' ? ['name'] : field === 'address' || field === 'country' || field === 'north' ? [field] : []))
  const siteGiven = Object.values(request.site ?? {}).some((v) => v !== undefined)
  const floors = Object.entries(request.floors ?? {})
  const given = [request.name, request.language, request.units, request.area, request.decimal, request.precision].some((v) => v !== undefined) || floors.length > 0 || siteGiven
  if (!given && remove.length === 0) refuse('edit.plan.refused.nothing')

  const said_: string[] = []
  const top: Record<string, unknown> = {}
  if (request.name !== undefined) {
    top['name'] = nameOf('name', request.name)
    said_.push(line('edit.plan.name', { name: sayName(top['name'] as string) }))
  }
  if (remove.includes('name')) {
    if (request.name !== undefined) refuse('edit.plan.refused.both', { field: sayName('name') })
    top['name'] = null
    said_.push(line('edit.plan.removed', { field: sayName('name') }))
  }

  // How the plan is read: the stated display, with what the call gives in its place.
  const display: Record<string, unknown> = { ...(plan.display ?? {}) }
  let displayChanged = false
  const setDisplay = (field: Exclude<PlanField, 'name'>, value: unknown, receipt: string): void => {
    if (remove.includes(field)) refuse('edit.plan.refused.both', { field: sayName(field) })
    display[DISPLAY_KEY[field]] = value
    displayChanged = true
    said_.push(receipt)
  }
  if (request.language !== undefined) {
    setDisplay('language', request.language, line(hasMessages(request.language) || request.language === 'en' ? 'edit.plan.language' : 'edit.plan.language.own', { language: request.language }))
  }
  if (request.units !== undefined) setDisplay('units', request.units, line('edit.plan.units', { unit: request.units }))
  if (request.area !== undefined) setDisplay('area', request.area, line('edit.plan.area', { unit: request.area === 'm2' ? 'm²' : 'ft²' }))
  if (request.decimal !== undefined) setDisplay('decimal', request.decimal, line(request.decimal === 'comma' ? 'edit.plan.decimal.comma' : 'edit.plan.decimal.point'))
  if (request.precision !== undefined) setDisplay('precision', request.precision, line('edit.plan.precision', { count: num(String(request.precision)) }))
  for (const field of remove) {
    if (field === 'name' || !(field in DISPLAY_KEY)) continue
    delete display[DISPLAY_KEY[field as Exclude<PlanField, 'name'>]]
    displayChanged = true
    said_.push(line('edit.plan.removed', { field: sayName(field) }))
  }
  if (displayChanged) top['display'] = Object.keys(display).length === 0 ? null : display

  // The floors' names, by id.
  let parts: Map<PartList, Map<string, Record<string, unknown>>> | undefined
  if (floors.length > 0) {
    const all = planFloors(plan)
    const listed = new Set((plan.floors ?? []).map((f) => f.id))
    for (const [id] of floors) {
      if (!all.some((f) => f.id === id)) refuse('edit.plan.refused.floor', { floor: sayName(id), floors: joined(all.map((f) => sayName(f.id)), 'join.comma') })
      if (plan.floors !== undefined && !listed.has(id)) refuse('edit.plan.refused.unlisted', { floor: sayName(id) })
    }
    const names = new Map(floors.map(([id, value]) => [id, nameOf(`floor ${id}`, value)] as const))
    if (plan.floors === undefined) top['floors'] = all.map((f) => ({ id: f.id, name: names.get(f.id) ?? f.name, level: f.level }))
    else parts = new Map([['floors', new Map([...names].map(([id, value]) => [id, { name: value }] as const))]])
    for (const [id, value] of names) said_.push(line('edit.plan.floor', { floor: sayName(id), name: sayName(value) }))
  }

  // The site's name, address, country and north, as grid_set_site sets them.
  let sitePatch: Patch | null = null
  if (siteGiven || siteRemove.length > 0) {
    const site = request.site ?? {}
    sitePatch = setSite(survey, {
      ...(site.name === undefined ? {} : { name: nameOf('site name', site.name) }),
      ...(site.address === undefined ? {} : { address: nameOf('address', site.address) }),
      ...(site.country === undefined ? {} : { country: site.country }),
      ...(site.north === undefined ? {} : { north: site.north }),
      ...(siteRemove.length === 0 ? {} : { remove: siteRemove }),
    })
    said_.push(...sitePatch.said)
  }
  return {
    ...emptyPatch(said_),
    plan: { ...top, ...(sitePatch?.plan ?? {}) },
    ...(parts === undefined ? {} : { parts }),
  }
}

/** The plan's settings as one record, for the answer: what a reader of the plan now finds. */
export function planSettings(plan: FloorPlan): Record<string, unknown> {
  const site = plan.site
  return {
    name: plan.name ?? null,
    siteName: site?.name ?? null,
    address: site?.address ?? null,
    country: site?.country ?? null,
    north: plan.north ?? null,
    language: plan.display?.language ?? null,
    units: plan.display?.length ?? null,
    area: plan.display?.area ?? null,
    decimal: plan.display?.decimal ?? null,
    precision: plan.display?.precision ?? null,
    floors: planFloors(plan).map((f) => ({ id: f.id, name: f.name })),
  }
}
