/**
 * The site in rooms text (CNT-41): the plot, its street edges and set-backs, north, where the
 * building is on the earth and the site's own things, each in a line of its own:
 *
 *   plot <width> x <depth> [at x,y]       a rectangular plot, its south-west corner at x,y; with
 *                                         no `at`, centred on the building's walls, and said
 *   site boundary x,y x,y x,y ...         the plot's corners, in order round it (C13)
 *   street <side|edge n> ...              the edges on a street: by the side of the drawing they
 *                                         face (north is up the drawing, as in every rooms line),
 *                                         or by number
 *   setback <all|street|side|edge n> <m> [assumed|given]
 *                                         a set-back the person asked for, their own figure
 *   north <degrees> [clockwise]           the plan's real north: degrees counter-clockwise from
 *                                         up the drawing, as the plan file holds it, or clockwise
 *   north <up|down|left|right|up-left|up-right|down-left|down-right>
 *                                         where the north arrow points on the drawing
 *   site origin x,y                       a point of the plan, placed on the earth by
 *   site location <latitude>,<longitude>  degrees, north and east positive
 *   site elevation <m>                    above sea level
 *   ground <m> [below|above]              the ground outside, from the ground floor's floor level
 *                                         (ARE-62, `ground.ts`); `site ground <m>` is the same field
 *   site country <name or code>           where it will be built (C10)
 *   site address "<address>"              the site's address, as the person writes it (CNT-50)
 *   site name "<name>"                    the site's own name: "Harbour House" (CNT-50)
 *   site <fence|gate|path|paving|tree|pool> [<id>] <points | at x,y> [width <m>] [canopy <m>]
 *        [height <m>] [id <id>] ["<label>"]
 *                                         one of the site's things, never a wall or a room
 *
 * `street` and `setback` lines need the boundary in the same text, so an edge's number or side
 * always means the boundary written beside them. `grid write` keeps what the text does not write
 * as the file has it (`writtenSite`), and the read-back writes the plan's site as these lines
 * (`siteLines`), so writing it again loses nothing.
 *
 * Pure: words in, the plan's `site` and `north` out.
 */
import { SITE_THING_KINDS, SiteSchema, type FloorPlan, type Site, type SiteThing, type SiteThingKind } from '../types/floorplan'
import { metres, numberOf, pointOf, isPointWord, RoomsStop, type LineWord, type PlainNumbers, PLAIN_METRES } from './words'
import { GROUND_LINE_WORD, SLOPE_LINE_WORD, fallOfWords, groundLineOfWords, slopeLines, type GroundWords } from './ground'
import { english, said } from '../messages/say'

type P = readonly [number, number]

/** The first words of the lines this file reads. */
export const SITE_LINE_WORDS: readonly string[] = ['site', 'plot', 'street', 'streets', 'setback', 'setbacks', 'north', GROUND_LINE_WORD, SLOPE_LINE_WORD]

/** The sides of the drawing a street or a set-back may name (C4: north is up the drawing). */
export const DRAWING_SIDES: Readonly<Record<string, P>> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] }

/** Where a north arrow may point on the drawing, with its turn counter-clockwise from up. */
export const NORTH_WAYS: Readonly<Record<string, number>> = {
  up: 0,
  'up-left': 45,
  left: 90,
  'down-left': 135,
  down: 180,
  'down-right': -135,
  right: -90,
  'up-right': -45,
}

/** A set-back as a line or a tool states it, before its side is turned into edges. */
export interface SetbackWords {
  readonly from: 'all' | 'street' | number | { readonly side: string }
  readonly distance: number
  readonly source?: 'given' | 'assumed'
}

/** A note on the site lines, as the compiler records its others. */
export interface SiteNote {
  readonly code: string
  readonly line: number | null
  readonly message: string
}

/** `line N: ` in front of a message, or nothing when the words come from a tool (`at` 0). */
const lead = (at: number): string => (at > 0 ? `line ${at}: ` : '')
const stop = (at: number, message: string): never => {
  throw new RoomsStop('rooms/site', `${lead(at)}${message}`, at > 0 ? at : null)
}
const settled = (value: number): number => {
  const r = Math.round(value * 1e9) / 1e9
  return Object.is(r, -0) ? 0 : r
}

/** A turn in degrees, between -180 (left out) and 180. */
export function turnOf(degrees: number): number {
  let d = degrees % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return settled(d)
}

/**
 * The plan's north from the words after `north`: degrees counter-clockwise from up the drawing,
 * the same followed by `clockwise` (a compass arrow measured clockwise), or a way on the drawing.
 */
export function northOfWords(words: readonly string[], at = 0): number {
  const usage = "write 'north <degrees>' (counter-clockwise from up the drawing, as the plan file holds it), 'north <degrees> clockwise', or where the arrow points: 'north up', 'north left', 'north up-right' and so on."
  const [first, second, ...rest] = words
  if (first === undefined || rest.length > 0) return stop(at, usage)
  if (Object.hasOwn(NORTH_WAYS, first) && second === undefined) return NORTH_WAYS[first]!
  const value = Number(first.replace(/°$/, ''))
  if (!Number.isFinite(value) || first.trim() === '') return stop(at, usage)
  if (second === undefined || second === 'ccw' || second === 'counter-clockwise' || second === 'anticlockwise') return turnOf(value)
  if (second === 'cw' || second === 'clockwise') return turnOf(-value)
  return stop(at, usage)
}

/** Where each way of `NORTH_WAYS` points, in words. */
const WAY_WORDS: Readonly<Record<string, string>> = {
  up: 'up the drawing',
  'up-left': 'up and to the left of the drawing',
  left: 'to the left of the drawing',
  'down-left': 'down and to the left of the drawing',
  down: 'down the drawing',
  'down-right': 'down and to the right of the drawing',
  right: 'to the right of the drawing',
  'up-right': 'up and to the right of the drawing',
}

/** North in words, for an answer: where the arrow points on the drawing, and the figure it is. */
export function northWordsOf(north: number): string {
  const turn = turnOf(north)
  const way = Object.entries(NORTH_WAYS).find(([, d]) => turnOf(d) === turn)?.[0]
  const angle = `${metres(Math.abs(turn))}° ${turn >= 0 ? 'counter-clockwise' : 'clockwise'} from up`
  return way === undefined ? `north ${metres(turn)}: the arrow turned ${angle} the drawing` : `north ${metres(turn)}: the arrow points ${WAY_WORDS[way]}${turn === 0 ? '' : ` (${angle})`}`
}

/** A set-back from the words after `setback`: from what, how far, and who gave it. */
export function setbackOfWords(words: readonly string[], at = 0, plain: PlainNumbers = PLAIN_METRES): SetbackWords {
  const usage = "write 'setback all <m>', 'setback street <m>', 'setback <north|south|east|west> <m>' or 'setback edge <n> <m>', with 'assumed' after it when it is not the person's own figure yet."
  const t = [...words]
  const source = t.at(-1) === 'assumed' || t.at(-1) === 'given' ? (t.pop() as 'assumed' | 'given') : undefined
  let from: SetbackWords['from']
  if (t[0] === 'all' || t[0] === 'street') from = t.shift() as 'all' | 'street'
  else if (t[0] === 'edge') {
    t.shift()
    from = edgeNumber(t.shift(), at)
  } else if (t[0] !== undefined && Object.hasOwn(DRAWING_SIDES, t[0])) from = { side: t.shift()! }
  else if (t[0] !== undefined && /^\d+$/.test(t[0]) && t.length === 2) from = edgeNumber(t.shift(), at)
  else return stop(at, usage)
  if (t.length !== 1) return stop(at, usage)
  const distance = numberOf(t[0]!, at > 0 ? at : 0, plain)
  if (distance < 0) return stop(at, 'a set-back is a distance of 0 or more.')
  return { from, distance, ...(source === undefined ? {} : { source }) }
}

function edgeNumber(word: string | undefined, at: number): number {
  if (word === undefined || !/^\d+$/.test(word) || Number(word) < 1) return stop(at, `an edge is named by its number, 1 for the edge from the boundary's first point to its second${word === undefined ? '' : `, not '${word}'`}.`)
  return Number(word)
}

/** The streets from the words after `street`: sides of the drawing and edge numbers. */
export function streetsOfWords(words: readonly string[], at = 0): Array<number | { readonly side: string }> {
  const out: Array<number | { readonly side: string }> = []
  for (const w of words) {
    if (w === 'edge' || w === 'edges' || w === 'and' || w === ',') continue
    for (const part of w.split(',').filter((p) => p !== '')) {
      if (Object.hasOwn(DRAWING_SIDES, part)) out.push({ side: part })
      else if (/^\d+$/.test(part)) out.push(edgeNumber(part, at))
      else stop(at, `'${part}' is not a side or an edge: write 'street <north|south|east|west>' for the edges that face that side of the drawing, or 'street edge <n>'.`)
    }
  }
  if (out.length === 0) stop(at, "write 'street <north|south|east|west>' or 'street edge <n>': the edges of the boundary on a street.")
  return out
}

/** The boundary's corners without a last point written on the first again. */
function cornersOf(points: readonly P[]): P[] {
  const first = points[0]
  const last = points.at(-1)
  return points.length > 1 && first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : [...points]
}

/** The side of the drawing each edge of the boundary faces, out of the plot, by number from 1. */
export function edgeSides(points: readonly P[]): string[] {
  const corners = cornersOf(points)
  let twice = 0
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!
    twice += a[0] * b[1] - b[0] * a[1]
  })
  const turn = twice >= 0 ? 1 : -1
  return corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length]!
    const out: P = [turn * (b[1] - a[1]), -turn * (b[0] - a[0])]
    return Object.keys(DRAWING_SIDES).reduce((best, k) => (DRAWING_SIDES[k]![0] * out[0] + DRAWING_SIDES[k]![1] * out[1] > DRAWING_SIDES[best]![0] * out[0] + DRAWING_SIDES[best]![1] * out[1] ? k : best))
  })
}

/** The edges, by number, that face `side` of the drawing; refused, naming what each faces, when none does. */
export function edgesFacing(points: readonly P[], side: string, at = 0): number[] {
  const sides = edgeSides(points)
  const found = sides.flatMap((s, i) => (s === side ? [i + 1] : []))
  if (found.length === 0) stop(at, `no edge of the boundary faces ${side}: ${sides.map((s, i) => `edge ${i + 1} faces ${s}`).join(', ')}.`)
  return found
}

/** The four corners of a plot `width` by `depth` from its south-west corner, edge 1 the south one. */
export function plotCorners(width: number, depth: number, at: P): [number, number][] {
  const [x, y] = at
  return [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth]].map(([a, b]) => [settled(a!), settled(b!)])
}

/** The plan's streets and set-backs, by edge number, from words that may name sides. */
export function siteEdges(points: readonly P[], streets: readonly (number | { readonly side: string })[], setbacks: readonly SetbackWords[], at = 0): { streets: number[]; setbacks: NonNullable<Site['setbacks']> } {
  const edges = new Set<number>()
  for (const s of streets) for (const e of typeof s === 'number' ? [s] : edgesFacing(points, s.side, at)) edges.add(e)
  const out: Array<NonNullable<Site['setbacks']>[number]> = []
  for (const s of setbacks) {
    const froms = typeof s.from === 'object' ? edgesFacing(points, s.from.side, at) : [s.from]
    for (const from of froms) out.push({ from, distance: s.distance, ...(s.source === undefined ? {} : { source: s.source }) })
  }
  return { streets: [...edges].sort((a, b) => a - b), setbacks: out }
}

/** The things a `site` line may write, and what each takes. */
const THING_WORDS = new Set(['at', 'width', 'canopy', 'height', 'id'])

/** One of the site's things from the words after `site <kind>`, with its label as written. */
export function thingOfWords(kind: SiteThingKind, words: readonly LineWord[], at: number, plain: PlainNumbers, fallbackId: string): SiteThing {
  const usage = `write 'site ${kind} [<id>] ${kind === 'tree' ? 'at x,y [canopy <m>]' : kind === 'path' ? 'x,y x,y ... width <m>' : kind === 'gate' ? 'x,y x,y' : 'x,y x,y x,y ...'} [height <m>] ["<label>"]'.`
  const thing: { -readonly [K in keyof SiteThing]?: SiteThing[K] } = { kind }
  const points: [number, number][] = []
  let i = 0
  const first = words[0]
  if (first !== undefined && !first.quoted && !isPointWord(first.text) && !THING_WORDS.has(first.text)) {
    thing.id = first.text
    i = 1
  }
  while (i < words.length) {
    const w = words[i]!
    if (w.quoted) {
      if (thing.label !== undefined) stop(at, `a ${kind} takes one label in quotes. ${usage}`)
      thing.label = w.text
      i++
    } else if (isPointWord(w.text)) {
      points.push(pointOf(w.text, at, plain))
      i++
    } else if (THING_WORDS.has(w.text) && words[i + 1] !== undefined) {
      const v = words[i + 1]!
      if (w.text === 'at') thing.at = pointOf(v.text, at, plain)
      else if (w.text === 'id') thing.id = v.text
      else thing[w.text as 'width' | 'canopy' | 'height'] = numberOf(v.text, at, plain)
      i += 2
    } else stop(at, `'${w.text}' is not understood on a site ${kind} line. ${usage}`)
  }
  if (points.length > 0) thing.points = points
  if (thing.id === undefined) thing.id = fallbackId
  return thing as SiteThing
}

interface Written<T> {
  readonly value: T
  readonly line: number
}

/**
 * The site lines of one rooms text, read as they come and made into the plan's `site` and
 * `north` once the walls are worked out (`finish`).
 */
export class SiteLines {
  private boundary: Written<P[]> | null = null
  private plot: Written<{ width: number; depth: number; at: P | null }> | null = null
  private readonly streets: Array<Written<Array<number | { readonly side: string }>>> = []
  private readonly setbacks: Array<Written<SetbackWords>> = []
  private north: Written<number> | null = null
  private readonly fields = new Map<string, Written<unknown>>()
  private readonly things: Array<Written<SiteThing>> = []
  // CNT-49: the ground along edges of the plot, one line each.
  private readonly groundEdges: Array<Written<{ edge: number; start: number; end?: number }>> = []
  private readonly lines: number[] = []

  /** Whether the text writes any site line, north among them. */
  get written(): boolean {
    return this.lines.length > 0 || this.north !== null
  }

  /** One line: `t` its words, `words` the same with whether each was quoted. */
  read(t: readonly string[], words: readonly LineWord[], at: number, plain: PlainNumbers): void {
    const kw = t[0]!
    if (kw === 'north') {
      if (this.north !== null) stop(at, `north is written on line ${this.north.line} already: write it once.`)
      this.north = { value: northOfWords(t.slice(1), at), line: at }
      return
    }
    this.lines.push(at)
    if (kw === 'street' || kw === 'streets') {
      this.streets.push({ value: streetsOfWords(t.slice(1), at), line: at })
      return
    }
    if (kw === 'setback' || kw === 'setbacks') {
      this.setbacks.push({ value: setbackOfWords(t.slice(1), at, plain), line: at })
      return
    }
    if (kw === 'plot') return this.readPlot(t.slice(1), at, plain)
    // ARE-62: `ground <m>`, the field `site ground <m>` writes too. CNT-49: and the ground on a slope.
    if (kw === GROUND_LINE_WORD) return this.groundLine(groundLineOfWords(t.slice(1), at, plain), at)
    if (kw === SLOPE_LINE_WORD) return this.groundLine({ kind: 'fall', fall: fallOfWords(t.slice(1), at) }, at)
    // `site ...`
    const what = t[1]
    if (what === 'plot') return this.readPlot(t.slice(2), at, plain)
    if (what === 'boundary') {
      this.once(at)
      const points = t.slice(2).map((w) => pointOf(w, at, plain))
      if (points.length < 3) stop(at, "a boundary needs three or more corners, written x,y with no space, in order round the plot: 'site boundary 0,0 15,0 15,30 0,30'.")
      this.boundary = { value: points, line: at }
      return
    }
    if (what !== undefined && (SITE_THING_KINDS as readonly string[]).includes(what)) {
      const n = this.things.filter((x) => x.value.kind === what).length + 1
      this.things.push({ value: thingOfWords(what as SiteThingKind, words.slice(2), at, plain, `${what}-${n}`), line: at })
      return
    }
    const field = (key: string, value: unknown): void => {
      const had = this.fields.get(key)
      if (had !== undefined) stop(at, `site ${key} is written on line ${had.line} already: write it once.`)
      this.fields.set(key, { value, line: at })
    }
    const rest = t.slice(2)
    if (what === 'origin' && rest.length === 1) return field('origin', pointOf(rest[0]!, at, plain))
    if (what === 'location') {
      const parts = rest.join(',').split(',').filter((p) => p !== '').map(Number)
      if (parts.length !== 2 || !parts.every(Number.isFinite)) stop(at, "write 'site location <latitude>,<longitude>' in degrees, north and east positive: 'site location 40.4168,-3.7038'.")
      return field('location', parts)
    }
    if (what === 'elevation' && rest.length === 1) return field(what, numberOf(rest[0]!, at, plain))
    if (what === 'ground') return this.groundLine(groundLineOfWords(rest, at, plain), at)
    if (what === 'country' && rest.length > 0) {
      const named = words.slice(2).map((w) => w.text).join(' ')
      return field('country', named)
    }
    // CNT-50: the site's address and its own name, kept as written: never looked up.
    if ((what === 'address' || what === 'name') && rest.length > 0) return field(what, words.slice(2).map((w) => w.text).join(' '))
    stop(at, `write 'site boundary x,y x,y x,y ...', 'site origin x,y', 'site location <latitude>,<longitude>', 'site elevation <m>', 'ground <m>', 'site country <name>', 'site address "<address>"', 'site name "<name>"' or one of the site's things: 'site <${SITE_THING_KINDS.join('|')}> ...'.`)
  }

  /** CNT-49: a `ground` line: its level, or the sides or the fall (each written once), or an edge's levels. */
  private groundLine(words: GroundWords, at: number): void {
    if (words.kind === 'level') return this.ground(words.level, at)
    if (words.kind === 'edge') {
      this.groundEdges.push({ value: words.edge, line: at })
      return
    }
    const key = words.kind === 'sides' ? 'groundSides' : 'fall'
    const had = this.fields.get(key)
    if (had !== undefined) throw new RoomsStop('rooms/site', english(said('rooms.ground.once', { line: String(at), first: String(had.line) })), at)
    this.fields.set(key, { value: words.kind === 'sides' ? words.sides : words.fall, line: at })
  }

  /** The ground's level, from a `ground` or a `site ground` line, written once. */
  private ground(level: number, at: number): void {
    const had = this.fields.get('ground')
    if (had !== undefined) throw new RoomsStop('rooms/site', english(said('rooms.ground.once', { line: String(at), first: String(had.line) })), at)
    this.fields.set('ground', { value: level, line: at })
  }

  private once(at: number): void {
    const had = this.boundary?.line ?? this.plot?.line
    if (had !== undefined) stop(at, `the plot's boundary is written on line ${had} already: write it once, as 'plot <width> x <depth>' or 'site boundary x,y ...'.`)
  }

  private readPlot(t: readonly string[], at: number, plain: PlainNumbers): void {
    this.once(at)
    const usage = "write 'plot <width> x <depth> [at x,y]': a rectangular plot, width east-west and depth north-south, its south-west corner at x,y (centred on the building when 'at' is left out)."
    const [w, x, d, atWord, point, ...more] = t
    if (w === undefined || x !== 'x' || d === undefined || more.length > 0 || (atWord !== undefined && (atWord !== 'at' || point === undefined))) stop(at, usage)
    const width = numberOf(w!, at, plain)
    const depth = numberOf(d!, at, plain)
    if (!(width > 0) || !(depth > 0)) stop(at, `a plot's width and depth are more than 0. ${usage}`)
    this.plot = { value: { width, depth, at: point === undefined ? null : pointOf(point, at, plain) }, line: at }
  }

  /**
   * The plan's `site` (only the fields the text writes) and `north`, with the notes on them. A plot
   * with no `at` is centred on `extent`, the building's walls (`[minX, minY, maxX, maxY]`).
   */
  finish(extent: readonly [number, number, number, number] | null): { site?: Site; north?: number; problems: SiteNote[]; warnings: SiteNote[] } {
    const problems: SiteNote[] = []
    const warnings: SiteNote[] = []
    const out: { site?: Site; north?: number; problems: SiteNote[]; warnings: SiteNote[] } = { problems, warnings }
    if (this.north !== null) out.north = this.north.value
    if (this.lines.length === 0) return out
    const site: Record<string, unknown> = {}
    let points: P[] | null = this.boundary?.value ?? null
    const plot = this.plot
    if (plot !== null) {
      let corner = plot.value.at
      if (corner === null) {
        if (extent === null) {
          problems.push({ code: 'rooms/site', line: plot.line, message: `line ${plot.line}: the plot has no 'at x,y' and there are no walls to centre it on: write 'plot ${metres(plot.value.width)} x ${metres(plot.value.depth)} at x,y', its south-west corner.` })
          return out
        }
        corner = [settled((extent[0] + extent[2] - plot.value.width) / 2), settled((extent[1] + extent[3] - plot.value.depth) / 2)]
        warnings.push({
          code: 'rooms/plot-centred',
          line: plot.line,
          message: `Line ${plot.line}: the plot is centred on the building, its south-west corner at ${metres(corner[0])},${metres(corner[1])}; write 'plot ${metres(plot.value.width)} x ${metres(plot.value.depth)} at x,y' to place it where it is.`,
        })
      }
      points = plotCorners(plot.value.width, plot.value.depth, corner)
    }
    const edged = [...this.streets, ...this.setbacks]
    if (points === null && edged.length > 0) {
      const line = edged[0]!.line
      problems.push({ code: 'rooms/site', line, message: `line ${line}: a street or set-back is measured from the plot's boundary, which this text does not write: add 'plot <width> x <depth> [at x,y]' or 'site boundary x,y x,y x,y ...' (grid describe --as rooms writes the plan's own).` })
      return out
    }
    try {
      if (points !== null) {
        site['boundary'] = points.map((p) => [p[0], p[1]])
        const streets: number[] = []
        for (const s of this.streets) streets.push(...siteEdges(points, s.value, [], s.line).streets)
        const setbacks: NonNullable<Site['setbacks']> = []
        for (const s of this.setbacks) setbacks.push(...siteEdges(points, [], [s.value], s.line).setbacks)
        if (this.streets.length > 0) site['streets'] = [...new Set(streets)].sort((a, b) => a - b)
        if (this.setbacks.length > 0) site['setbacks'] = setbacks
      }
    } catch (error) {
      if (!(error instanceof RoomsStop)) throw error
      problems.push({ code: error.code, line: error.line, message: error.message })
      return out
    }
    for (const [key, { value }] of this.fields) {
      if (key === 'location') {
        site['latitude'] = (value as number[])[0]
        site['longitude'] = (value as number[])[1]
      } else site[key] = value
    }
    if (this.things.length > 0) site['things'] = this.things.map((t) => t.value)
    if (this.groundEdges.length > 0) site['groundEdges'] = this.groundEdges.map((g) => g.value)
    const checked = SiteSchema.safeParse(site)
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        const [head, index] = issue.path
        const line =
          head === 'things' && typeof index === 'number'
            ? this.things[index]?.line
            : head === 'groundEdges' && typeof index === 'number'
              ? this.groundEdges[index]?.line
            : head === 'setbacks' && typeof index === 'number'
              ? this.setbacks[Math.min(index, this.setbacks.length - 1)]?.line
              : head === 'streets'
                ? this.streets[0]?.line
                : head === 'boundary'
                  ? (this.boundary?.line ?? this.plot?.line)
                  : head === 'latitude' || head === 'longitude'
                    ? this.fields.get('location')?.line
                    : typeof head === 'string'
                      ? this.fields.get(head)?.line
                      : undefined
        const at = line ?? this.lines[0]!
        const where = issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : p)).join('.').replace(/\.\[/g, '[')
        problems.push({ code: 'rooms/site', line: at, message: `line ${at}: the site's ${where} ${issue.message}.` })
      }
      return out
    }
    out.site = checked.data
    return out
  }
}

const point = (p: readonly number[]): string => `${metres(p[0]!)},${metres(p[1]!)}`
/** A word as rooms text reads it back unchanged: an id in plain letters, or in quotes after `id`. */
const plainWord = (word: string): boolean => /^[a-z0-9][a-z0-9._-]*$/.test(word)
const quote = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`)

/** One of the site's things as its `site` line. */
function thingLine(thing: SiteThing): string {
  const words = [`site ${thing.kind}`]
  const first = plainWord(thing.id) && !THING_WORDS.has(thing.id)
  if (first) words.push(thing.id)
  if (thing.at !== undefined) words.push(`at ${point(thing.at)}`)
  if (thing.points !== undefined) words.push(...thing.points.map(point))
  if (thing.width !== undefined) words.push(`width ${metres(thing.width)}`)
  if (thing.canopy !== undefined) words.push(`canopy ${metres(thing.canopy)}`)
  if (thing.height !== undefined) words.push(`height ${metres(thing.height)}`)
  if (!first) words.push(`id ${quote(thing.id)}`)
  if (thing.label !== undefined) words.push(quote(thing.label))
  return words.join(' ')
}

/** The plan's site and north as rooms text writes them: nothing when it states neither. */
export function siteLines(plan: Pick<FloorPlan, 'site' | 'north'>): string[] {
  const lines: string[] = []
  if (plan.north !== undefined) lines.push(`north ${metres(plan.north)}`)
  const site = plan.site
  if (site === undefined) return lines
  if (site.boundary !== undefined) lines.push(`site boundary ${site.boundary.map(point).join(' ')}`)
  if (site.streets !== undefined && site.streets.length > 0) lines.push(`street edge ${site.streets.join(' ')}`)
  for (const s of site.setbacks ?? []) lines.push(`setback ${typeof s.from === 'number' ? `edge ${s.from}` : s.from} ${metres(s.distance)}${s.source === undefined ? '' : ` ${s.source}`}`)
  if (site.origin !== undefined) lines.push(`site origin ${point(site.origin)}`)
  if (site.latitude !== undefined && site.longitude !== undefined) lines.push(`site location ${site.latitude},${site.longitude}`)
  if (site.elevation !== undefined) lines.push(`site elevation ${metres(site.elevation)}`)
  if (site.ground !== undefined) lines.push(`ground ${metres(site.ground)}`)
  lines.push(...slopeLines(site))
  if (site.country !== undefined) lines.push(`site country ${quote(site.country)}`)
  if (site.name !== undefined) lines.push(`site name ${quote(site.name)}`)
  if (site.address !== undefined) lines.push(`site address ${quote(site.address)}`)
  for (const thing of site.things ?? []) lines.push(thingLine(thing))
  return lines
}

/**
 * What `grid write` writes as the plan's site: the file's, with what the text writes in its place.
 * A boundary in the text brings its streets and set-backs (written or not) with it; each other
 * field, and the things as one list, replaces the file's only when the text writes it.
 */
export function writtenSite(file: unknown, text: Site | undefined): unknown {
  if (text === undefined) return file
  const base: Record<string, unknown> = typeof file === 'object' && file !== null && !Array.isArray(file) ? { ...(file as Record<string, unknown>) } : {}
  if (text.boundary !== undefined) {
    delete base['streets']
    delete base['setbacks']
  }
  return { ...base, ...text }
}
