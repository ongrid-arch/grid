/**
 * The site's changes (CNT-41): the plot, its streets and set-backs, north and where the building
 * is on the earth (`setSite`, `grid_set_site`), and the site's things added, moved, resized and
 * removed (`changeSiteThing`, `grid_change_site`). Each is a patch of the plan's own fields, as
 * every change is, refused with nothing written when the site it would leave could not be read
 * (`SiteSchema`), naming the field. A thing moved or resized is changed in the file's own record
 * (`parts`), so it keeps every field as written.
 *
 * Sides are the drawing's, as in rooms text and every edit (C4: north is up the drawing); the
 * reading of them is rooms text's own (`rooms/site.ts`), so the two read a side the same way.
 */
import { metresText, pointInPolygon, SITE_THING_WORDS } from '@ongrid/floorplan/geometry'
import { northWordsOf, plotCorners, siteEdges, type SetbackWords } from '@ongrid/floorplan/rooms'
import { SiteSchema, SiteThingSchema, boundaryEdgeCount, type FloorPlan, type Site, type SiteThing, type SiteThingKind } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch } from './edits'
import { EditRefused } from './refused'

type Pair = [number, number]

/** The fields `grid_set_site` can take out. */
export const SITE_FIELDS = ['boundary', 'streets', 'setbacks', 'north', 'origin', 'location', 'elevation', 'ground', 'country', 'things'] as const
export type SiteField = (typeof SITE_FIELDS)[number]

export interface SiteRequest {
  readonly boundary?: readonly Pair[]
  readonly plot?: { readonly width: number; readonly depth: number; readonly at?: Pair }
  readonly streets?: readonly (number | { readonly side: string })[]
  readonly setbacks?: readonly SetbackWords[]
  readonly north?: number
  readonly origin?: Pair
  readonly latitude?: number
  readonly longitude?: number
  readonly elevation?: number
  readonly ground?: number
  readonly country?: string
  readonly remove?: readonly SiteField[]
}

const M = (v: number): string => `${metresText(v)} m`
/** A point as rooms text writes one: to the millimetre, no trailing zeros. */
const short = (v: number): string => String(Math.round(v * 1000) / 1000 + 0)
const P = (p: readonly number[]): string => `${short(p[0]!)},${short(p[1]!)}`

/** The building's walls' outside faces, as a box; null when it has no walls. */
function wallExtent(plan: FloorPlan): readonly [number, number, number, number] | null {
  if (plan.walls.length === 0) return null
  const ends = plan.walls.flatMap((w) => [w.start, w.end].map((p) => [p[0], p[1], w.thickness / 2] as const))
  return [Math.min(...ends.map((e) => e[0] - e[2])), Math.min(...ends.map((e) => e[1] - e[2])), Math.max(...ends.map((e) => e[0] + e[2])), Math.max(...ends.map((e) => e[1] + e[2]))]
}

/** The first thing the schema finds wrong with a site, as `site.<field> <what>`; null when none. */
function siteProblem(site: Record<string, unknown>): string | null {
  const checked = SiteSchema.safeParse(site)
  if (checked.success) return null
  const issue = checked.error.issues[0]!
  const where = ['site', ...issue.path].map((p) => (typeof p === 'number' ? `[${p}]` : p)).join('.').replace(/\.\[/g, '[')
  return `${where} ${issue.message}`
}

const setbackText = (s: NonNullable<Site['setbacks']>[number]): string =>
  `${M(s.distance)} from ${s.from === 'all' ? 'every edge' : s.from === 'street' ? 'the street edges' : `edge ${s.from}`}${s.source === 'assumed' ? ', assumed for the person to confirm' : ''}`

/** The plot, its streets and set-backs, north and where the building is, set or taken out. */
export function setSite(survey: Survey, request: SiteRequest): Patch {
  const plan = survey.plan
  const site: Record<string, unknown> = { ...(plan.site ?? {}) }
  let north: number | null | undefined
  const said: string[] = []
  const notKept: string[] = []
  const guessed: string[] = []
  const gives = Object.entries(request).filter(([k, v]) => v !== undefined && k !== 'remove').length
  if (gives === 0 && (request.remove ?? []).length === 0) {
    throw new EditRefused('Give the plot (boundary, or plot_width and plot_depth), streets, setbacks, north, origin, latitude and longitude, elevation, ground or country to set, or remove to take one out.')
  }
  for (const field of request.remove ?? []) {
    if (field === 'north') {
      north = null
      said.push('Took north out: the ways are read with north up the drawing again, said as not known.')
      continue
    }
    const keys = field === 'location' ? ['latitude', 'longitude'] : field === 'boundary' ? ['boundary', 'streets', 'setbacks'] : [field]
    for (const key of keys) delete site[key]
    said.push(field === 'boundary' ? "Took the plot's boundary out, with its streets and set-backs, which are measured from it." : `Took the site's ${field} out.`)
  }
  if (request.boundary !== undefined && request.plot !== undefined) throw new EditRefused('Give the plot as boundary or as plot_width and plot_depth, not both.')
  let boundary: Pair[] | null = null
  if (request.plot !== undefined) {
    let at = request.plot.at
    if (at === undefined) {
      const extent = wallExtent(plan)
      if (extent === null) throw new EditRefused('The plan has no walls to centre the plot on: give plot_x and plot_y, its south-west corner.')
      at = [(extent[0] + extent[2] - request.plot.width) / 2, (extent[1] + extent[3] - request.plot.depth) / 2]
      guessed.push(`the plot's place: centred on the building, its south-west corner at ${P(plotCorners(request.plot.width, request.plot.depth, at)[0]!)}. Give plot_x and plot_y to place it where it is.`)
    }
    boundary = plotCorners(request.plot.width, request.plot.depth, at)
  } else if (request.boundary !== undefined) boundary = request.boundary.map((p) => [p[0], p[1]])
  if (boundary !== null) {
    site['boundary'] = boundary
    const edges = boundaryEdgeCount(boundary)
    // The streets and set-backs that still name one of its edges stay, unless the call gives its own.
    if (request.streets === undefined && Array.isArray(site['streets'])) {
      const streets = site['streets'] as number[]
      const kept = streets.filter((e) => e <= edges)
      if (kept.length < streets.length) notKept.push(`the street on edge ${streets.filter((e) => e > edges).join(' and ')}, which the new boundary does not have`)
      if (kept.length === 0) delete site['streets']
      else site['streets'] = kept
    }
    if (request.setbacks === undefined && Array.isArray(site['setbacks'])) {
      const setbacks = site['setbacks'] as NonNullable<Site['setbacks']>
      const kept = setbacks.filter((s) => typeof s.from !== 'number' || s.from <= edges)
      if (kept.length < setbacks.length) notKept.push(`the set-back from edge ${setbacks.filter((s) => typeof s.from === 'number' && s.from > edges).map((s) => s.from).join(' and ')}, which the new boundary does not have`)
      if (kept.length === 0) delete site['setbacks']
      else site['setbacks'] = kept
    }
    said.push(`Set the plot's boundary: ${edges} corners, ${boundary.map(P).join(' ')}, edge 1 from the first to the second.`)
  }
  if (request.streets !== undefined || request.setbacks !== undefined) {
    const points = site['boundary'] as Pair[] | undefined
    if (points === undefined) throw new EditRefused('Streets and set-backs are measured from the plot\'s boundary, which the site does not state: give boundary, or plot_width and plot_depth, with them.')
    let edged: ReturnType<typeof siteEdges>
    try {
      edged = siteEdges(points, request.streets ?? [], request.setbacks ?? [])
    } catch (error) {
      // Rooms text's reading of a side, refused in its words.
      if (error instanceof Error && /^rooms\//.test(String((error as { code?: unknown }).code))) throw new EditRefused(error.message.replace(/^./, (c) => c.toUpperCase()))
      throw error
    }
    if (request.streets !== undefined) {
      if (edged.streets.length === 0) delete site['streets']
      else site['streets'] = edged.streets
      said.push(edged.streets.length === 0 ? 'No edge is on a street now.' : `On the street: edge ${edged.streets.join(' and ')}.`)
    }
    if (request.setbacks !== undefined) {
      if (edged.setbacks.length === 0) delete site['setbacks']
      else site['setbacks'] = edged.setbacks
      said.push(edged.setbacks.length === 0 ? 'No set-back is asked now.' : `Set-backs asked, the person's own figures: ${edged.setbacks.map(setbackText).join('; ')}.`)
    }
  }
  if (request.north !== undefined) {
    north = request.north
    said.push(`North: ${northWordsOf(request.north)}.`)
  }
  if (request.origin !== undefined) {
    site['origin'] = [request.origin[0], request.origin[1]]
    said.push(`The plan's point ${P(request.origin)} is the one placed on the earth.`)
  }
  if (request.latitude !== undefined || request.longitude !== undefined) {
    if (request.latitude === undefined || request.longitude === undefined) throw new EditRefused('Give latitude and longitude together: one alone places nothing.')
    site['latitude'] = request.latitude
    site['longitude'] = request.longitude
    said.push(`Where it is: latitude ${request.latitude}, longitude ${request.longitude}${site['origin'] === undefined ? ', placed nowhere on the drawing until origin names the point it is' : ''}.`)
  }
  if (request.elevation !== undefined) {
    site['elevation'] = request.elevation
    said.push(`Its height above sea level: ${M(request.elevation)}.`)
  }
  if (request.ground !== undefined) {
    site['ground'] = request.ground
    said.push(`The ground outside: ${M(request.ground)} from the ground floor's floor level.`)
  }
  if (request.country !== undefined) {
    site['country'] = request.country
    said.push('Set where it will be built; grid_check applies the figures that hold there.')
  }
  const problem = siteProblem(site)
  if (problem !== null) throw new EditRefused(`The site would not be read: ${problem}.`)
  const top: Record<string, unknown> = { site: Object.keys(site).length === 0 ? null : site }
  if (north !== undefined) top['north'] = north
  return { ...emptyPatch(said), plan: top, ...(guessed.length === 0 ? {} : { guessed }), ...(notKept.length === 0 ? {} : { notKept }) }
}

/** What `grid_change_site` does to one of the site's things. */
export const SITE_ACTIONS = ['add', 'move', 'resize', 'remove'] as const
export type SiteAction = (typeof SITE_ACTIONS)[number]

export interface ThingRequest {
  readonly action: SiteAction
  readonly id?: string
  readonly kind?: SiteThingKind
  readonly points?: readonly Pair[]
  readonly at?: Pair
  readonly by?: Pair
  readonly to?: Pair
  readonly width?: number
  readonly canopy?: number
  readonly height?: number
  readonly label?: string
}

const word = (kind: SiteThingKind): string => SITE_THING_WORDS[kind][0]

/** Where a thing is, for an answer: its trunk, or its points. */
const placeText = (thing: Pick<SiteThing, 'at' | 'points'>): string => (thing.at !== undefined ? `at ${P(thing.at)}` : `through ${(thing.points ?? []).map(P).join(' ')}`)

/** The middle of a thing: its trunk, or the middle of the box round its points. */
function middleOf(thing: SiteThing): Pair {
  if (thing.at !== undefined) return [thing.at[0], thing.at[1]]
  const xs = (thing.points ?? []).map((p) => p[0])
  const ys = (thing.points ?? []).map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

/** A line when the thing stands outside the plot's boundary, in part or whole; null when it is inside or there is none. */
function outsideLine(plan: FloorPlan, thing: SiteThing): string | null {
  const boundary = plan.site?.boundary
  if (boundary === undefined) return null
  const ring = boundary.map(([x, y]) => ({ x, y }))
  const points = thing.at !== undefined ? [thing.at] : (thing.points ?? [])
  // A point on the boundary is inside it: a fence along it, a gate in it.
  const out = points.filter(([x, y]) => !pointInPolygon({ x, y }, ring) && !onRing(ring, x, y))
  if (out.length === 0) return null
  return `The ${word(thing.kind)} ${thing.id} stands ${out.length === points.length ? 'outside' : 'partly outside'} the plot's boundary.`
}

function onRing(ring: readonly { x: number; y: number }[], x: number, y: number): boolean {
  return ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) return Math.hypot(x - a.x, y - a.y) < 1e-6
    const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (length * length)
    if (t < 0 || t > 1) return false
    return Math.abs((x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x)) / length < 1e-6
  })
}

function checkedThing(thing: Record<string, unknown>): SiteThing {
  const checked = SiteThingSchema.safeParse(thing)
  if (checked.success) return checked.data
  const issue = checked.error.issues[0]!
  throw new EditRefused(`The ${String(thing['kind'])} would not be read: ${issue.path.length === 0 ? '' : `${issue.path.join('.')} `}${issue.message}.`)
}

/** One of the site's things added, moved, resized or removed. */
export function changeSiteThing(survey: Survey, request: ThingRequest): Patch {
  const plan = survey.plan
  const things = plan.site?.things ?? []
  const named = (): SiteThing => {
    if (request.id === undefined) throw new EditRefused(`To ${request.action} a thing, name it by id. ${things.length === 0 ? 'The site has none.' : `The site's things: ${things.slice(0, 20).map((t) => `${t.id} (${word(t.kind)})`).join(', ')}${things.length > 20 ? ` and ${things.length - 20} more` : ''}.`}`)
    const found = things.find((t) => t.id === request.id)
    if (found === undefined) throw new EditRefused(`The site has no thing with the id ${request.id}. ${things.length === 0 ? 'It has none.' : `Its things: ${things.slice(0, 20).map((t) => t.id).join(', ')}${things.length > 20 ? ` and ${things.length - 20} more` : ''}.`}`)
    return found
  }
  const withThings = (list: readonly unknown[]): Patch['plan'] => {
    const site: Record<string, unknown> = { ...(plan.site ?? {}) }
    if (list.length === 0) delete site['things']
    else site['things'] = list
    return { site: Object.keys(site).length === 0 ? null : site }
  }
  const after = (thing: SiteThing, line: string): string[] => [line, ...[outsideLine(plan, thing)].filter((l): l is string => l !== null)]

  if (request.action === 'add') {
    if (request.kind === undefined) throw new EditRefused(`To add a thing, give its kind: ${Object.keys(SITE_THING_WORDS).join(', ')}.`)
    if (request.by !== undefined || request.to !== undefined) throw new EditRefused('by and to move a thing already on the site; a new one is placed by points or at.')
    let id = request.id
    if (id === undefined) {
      let n = things.filter((t) => t.kind === request.kind).length + 1
      while (things.some((t) => t.id === `${request.kind}-${n}`)) n++
      id = `${request.kind}-${n}`
    } else if (things.some((t) => t.id === id)) throw new EditRefused(`The site has a thing with the id ${id} already: give the new one its own, or move or resize that one.`)
    const thing = checkedThing({
      id,
      kind: request.kind,
      ...(request.points === undefined ? {} : { points: request.points }),
      ...(request.at === undefined ? {} : { at: request.at }),
      ...(request.width === undefined ? {} : { width: request.width }),
      ...(request.canopy === undefined ? {} : { canopy: request.canopy }),
      ...(request.height === undefined ? {} : { height: request.height }),
      ...(request.label === undefined ? {} : { label: request.label }),
    })
    const size = thing.width !== undefined ? `, ${M(thing.width)} wide` : thing.canopy !== undefined ? `, its canopy ${M(thing.canopy)} across` : ''
    return { ...emptyPatch(after(thing, `Added the ${word(thing.kind)} ${thing.id} ${placeText(thing)}${size}.`)), plan: withThings([...things, thing]), extra: { thing: id } }
  }

  const thing = named()
  if (request.action === 'remove') {
    return { ...emptyPatch([`Took the ${word(thing.kind)} ${thing.id} off the site.`]), plan: withThings(things.filter((t) => t !== thing)), extra: { thing: thing.id } }
  }
  if (request.kind !== undefined && request.kind !== thing.kind) throw new EditRefused(`${thing.id} is a ${word(thing.kind)}; a thing keeps its kind. Remove it and add a ${word(request.kind)} in its place.`)
  let change: Record<string, unknown>
  let line: string
  if (request.action === 'move') {
    if ((request.by === undefined) === (request.to === undefined)) throw new EditRefused('To move a thing, give by (how far, x,y) or to (where its middle goes, x,y), one of them.')
    const middle = middleOf(thing)
    const [dx, dy] = request.by ?? [request.to![0] - middle[0], request.to![1] - middle[1]]
    const shift = (p: readonly number[]): Pair => [Math.round((p[0]! + dx) * 1e6) / 1e6, Math.round((p[1]! + dy) * 1e6) / 1e6]
    change = { ...(thing.at === undefined ? {} : { at: shift(thing.at) }), ...(thing.points === undefined ? {} : { points: thing.points.map(shift) }) }
    const ways = [dx === 0 ? '' : `${M(Math.abs(dx))} ${dx > 0 ? 'east' : 'west'}`, dy === 0 ? '' : `${M(Math.abs(dy))} ${dy > 0 ? 'north' : 'south'}`].filter((w) => w !== '')
    line = `Moved the ${word(thing.kind)} ${thing.id} ${ways.length === 0 ? 'nowhere: it is there already' : ways.join(' and ')} on the drawing, ${placeText({ ...thing, ...change })} now.`
  } else {
    change = {
      ...(request.points === undefined ? {} : { points: request.points }),
      ...(request.at === undefined ? {} : { at: request.at }),
      ...(request.width === undefined ? {} : { width: request.width }),
      ...(request.canopy === undefined ? {} : { canopy: request.canopy }),
      ...(request.height === undefined ? {} : { height: request.height }),
      ...(request.label === undefined ? {} : { label: request.label }),
    }
    if (Object.keys(change).length === 0) throw new EditRefused('To resize a thing, give its width, canopy, height, points, at or label: what changes.')
    const was = (key: 'width' | 'canopy' | 'height'): string => (thing[key] === undefined ? 'none' : M(thing[key]!))
    const parts = [
      ...(request.width === undefined ? [] : [`width ${was('width')} to ${M(request.width)}`]),
      ...(request.canopy === undefined ? [] : [`canopy ${was('canopy')} to ${M(request.canopy)}`]),
      ...(request.height === undefined ? [] : [`height ${was('height')} to ${M(request.height)}`]),
      ...(request.points === undefined && request.at === undefined ? [] : [placeText({ ...thing, ...change } as SiteThing)]),
      ...(request.label === undefined ? [] : ['its label']),
    ]
    line = `Changed the ${word(thing.kind)} ${thing.id}: ${parts.join('; ')}.`
  }
  const next = checkedThing({ ...thing, ...change })
  return { ...emptyPatch(after(next, line)), parts: new Map([['site.things', new Map([[thing.id, change]])]]), extra: { thing: thing.id } }
}
