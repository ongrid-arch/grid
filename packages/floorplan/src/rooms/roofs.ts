/**
 * A floor's roof and its roof lights in rooms text (WRT-79), so an agent writes LVL-6's `roof`
 * in words, never as the plan file's JSON:
 *
 *   roof <flat|gable|hip|mono-pitch> [pitch <degrees> | ridge <m>] eaves <m>
 *        [ridge runs east-west|north-south] [high <north|east|south|west>]
 *   roof none                        takes a roof copied from another floor off this one
 *   rooflight <id> over <room>, <width> x <length>
 *   rooflight <id> at x,y, <width> x <length>
 *
 * Both go under the floor's line (with none, the one floor the text has). The heights are metres
 * above the floor's level, to the roof's underside, as `RoofSchema` holds them; `pitch` is in
 * degrees (`45`, `45deg`). `gabled`, `hipped`, `mono`, `monopitch`, `shed`, `lean-to`, `skillion`
 * and `pent` are read as the shape they mean. A roof light's width runs along the eaves and its
 * length up the slope; over a room it stands over the middle of the room's box, so it is written
 * after the room's line, and after the roof's. `roof light` and `skylight` are read as `rooflight`.
 *
 * The read-back writes a roof with no dormers as these lines (`roofLines`), its roof lights at
 * their points; a roof with dormers stays in `raw floor`.
 *
 * Pure: words in, a roof out, or the reason there is none.
 */
import { COMPASS_SIDES, ROOF_SHAPES, RoofSchema, type Roof } from '../types/floorplan'
import { english, said, type MessageKey, type Values } from '../messages/say'
import { likelyMeant } from '../types/nearest'
import { plainId } from '../types/planText'
import { isPointWord, metres, numberOf, pointOf, RoomsStop, type PlainNumbers, PLAIN_METRES } from './words'

type P = readonly [number, number]

/** The first words of the lines this file reads. */
export const ROOF_LINE_WORDS: readonly string[] = ['roof', 'rooflight', 'skylight']

/** The words a roof's shape is written in, each with the shape it means. */
const SHAPE_WORDS: Readonly<Record<string, Roof['shape']>> = {
  flat: 'flat',
  gable: 'gable',
  gabled: 'gable',
  hip: 'hip',
  hipped: 'hip',
  'mono-pitch': 'mono-pitch',
  monopitch: 'mono-pitch',
  mono: 'mono-pitch',
  shed: 'mono-pitch',
  'lean-to': 'mono-pitch',
  skillion: 'mono-pitch',
  pent: 'mono-pitch',
}

/** The ways a gable's ridge is written, each with the way it runs. */
const RUN_WORDS: Readonly<Record<string, Roof['ridgeRuns'] & string>> = {
  'east-west': 'east-west',
  'west-east': 'east-west',
  'north-south': 'north-south',
  'south-north': 'north-south',
}

/** What a rooflight line says: its id, its size and where it stands, over a room or at a point. */
export interface RooflightWords {
  readonly id: string
  readonly width: number
  readonly length: number
  readonly over?: string
  readonly at?: P
}

const refuse = (at: number, key: MessageKey, values: Values = {}): never => {
  throw new RoomsStop('rooms/roof', english(said(key, { line: String(at), ...values })), at)
}

/** Whether a line's words are a rooflight's: `rooflight`, `skylight` or `roof light`. */
export function isRooflightLine(t: readonly string[]): boolean {
  return t[0] === 'rooflight' || t[0] === 'skylight' || (t[0] === 'roof' && (t[1] === 'light' || t[1] === 'lights'))
}

/** A slope in degrees: `45`, `45deg`, `45degrees` or `45°`, or `45 degrees` in two words. */
function degreesOf(word: string | undefined, at: number): number {
  const value = word === undefined ? NaN : Number(word.replace(/(°|deg|degrees)$/, ''))
  if (!Number.isFinite(value) || !(value > 0 && value < 90)) return refuse(at, 'rooms.roof.takes.pitch')
  return value
}

/**
 * The roof a `roof` line writes, from its words (`t[0]` is `roof`), checked by `RoofSchema`;
 * null for `roof none`. `at` is its line, or 0 from a tool.
 */
export function roofOfWords(t: readonly string[], at: number, plain: PlainNumbers = PLAIN_METRES): Roof | null {
  const forms = said('rooms.roof.forms')
  const word = t[1]
  if (word === undefined) return refuse(at, 'rooms.roof.usage', { forms })
  if (word === 'none' && t.length === 2) return null
  const shape = SHAPE_WORDS[word]
  if (shape === undefined) {
    const nearest = likelyMeant(word, [...ROOF_SHAPES])
    return refuse(at, nearest === null ? 'rooms.roof.shape' : 'rooms.roof.shape.nearest', { shape: word, ...(nearest === null ? {} : { nearest }) })
  }
  const found: { pitch?: number; ridge?: number; eaves?: number; ridgeRuns?: Roof['ridgeRuns']; highSide?: Roof['highSide'] } = {}
  const once = <K extends keyof typeof found>(key: K, value: (typeof found)[K], said: string): void => {
    if (found[key] !== undefined) refuse(at, 'rooms.roof.twice', { word: said })
    found[key] = value
  }
  const length = (w: string | undefined, after: string): number => {
    if (w === undefined) return refuse(at, 'rooms.roof.takes.length', { word: after })
    const value = numberOf(w, at, plain)
    if (!(value > 0)) return refuse(at, 'rooms.roof.takes.length', { word: after })
    return value
  }
  let i = 2
  while (i < t.length) {
    const w = t[i]!
    const next = t[i + 1]
    if (w === 'pitch' || w === 'slope') {
      once('pitch', degreesOf(next, at), 'pitch')
      i += t[i + 2] === 'degrees' || t[i + 2] === 'deg' ? 3 : 2
    } else if (w === 'ridge' && (next === 'runs' || next === 'run')) {
      const way = t[i + 2] === undefined ? undefined : RUN_WORDS[t[i + 2]!]
      if (way === undefined) return refuse(at, 'rooms.roof.takes.runs', { value: t[i + 2] ?? '' })
      once('ridgeRuns', way, 'ridge runs')
      i += 3
    } else if (w === 'runs' || w === 'ridgeruns') {
      const way = next === undefined ? undefined : RUN_WORDS[next]
      if (way === undefined) return refuse(at, 'rooms.roof.takes.runs', { value: next ?? '' })
      once('ridgeRuns', way, 'ridge runs')
      i += 2
    } else if (w === 'ridge') {
      once('ridge', length(next, 'ridge'), 'ridge')
      i += 2
    } else if (w === 'eaves' || w === 'eave') {
      once('eaves', length(next, 'eaves'), 'eaves')
      i += 2
    } else if (w === 'high' || w === 'rises' || w === 'rising' || w === 'highside') {
      // `high north`, `high side north`, `rises to north`.
      const skip = next === 'side' || next === 'to' ? 1 : 0
      const side = t[i + 1 + skip]
      if (side === undefined || !(COMPASS_SIDES as readonly string[]).includes(side)) return refuse(at, 'rooms.roof.takes.high', { value: side ?? '' })
      once('highSide', side as Roof['highSide'], 'high')
      i += 2 + skip
    } else return refuse(at, 'rooms.roof.word', { word: w, forms })
  }
  if (found.eaves === undefined) return refuse(at, 'rooms.roof.eaves', { shape })
  // In the schema's order, so the roof reads the same as one the plan file holds.
  const roof = {
    shape,
    eaves: found.eaves,
    ...(found.pitch === undefined ? {} : { pitch: found.pitch }),
    ...(found.ridge === undefined ? {} : { ridge: found.ridge }),
    ...(found.ridgeRuns === undefined ? {} : { ridgeRuns: found.ridgeRuns }),
    ...(found.highSide === undefined ? {} : { highSide: found.highSide }),
  }
  const checked = RoofSchema.safeParse(roof)
  if (!checked.success) {
    const issue = checked.error.issues[0]!
    return refuse(at, 'rooms.roof.invalid', { field: issue.path.join('.') || 'shape', problem: issue.message })
  }
  return checked.data
}

/** The words of a rooflight line, after `rooflight` (or `roof light`). `at` is its line. */
export function rooflightOfWords(t: readonly string[], at: number, plain: PlainNumbers = PLAIN_METRES): RooflightWords {
  const start = t[0] === 'roof' ? 2 : 1
  const id = t[start]
  const usage = (): never => refuse(at, 'rooms.rooflight.usage')
  if (id === undefined || id === 'over' || id === 'at') return usage()
  let over: string | undefined
  let point: P | undefined
  let size: [number, number] | undefined
  let i = start + 1
  while (i < t.length) {
    const w = t[i]!
    if (w === 'over' || w === 'in') {
      if (t[i + 1] === undefined || over !== undefined || point !== undefined) return usage()
      over = t[i + 1]!
      i += 2
    } else if (w === 'at') {
      if (t[i + 1] === undefined || !isPointWord(t[i + 1]!) || over !== undefined || point !== undefined) return usage()
      point = pointOf(t[i + 1]!, at, plain)
      i += 2
    } else if (size === undefined && t[i + 1] === 'x' && t[i + 2] !== undefined) {
      size = [numberOf(w, at, plain), numberOf(t[i + 2]!, at, plain)]
      i += 3
    } else if (size === undefined && /^[0-9.]+[a-z'"]*x[0-9.]/.test(w) && w.split('x').length === 2) {
      // `1.2x0.8`, written as one word.
      const [a, b] = w.split('x') as [string, string]
      size = [numberOf(a, at, plain), numberOf(b, at, plain)]
      i += 1
    } else return usage()
  }
  if (size === undefined || (over === undefined && point === undefined) || !(size[0] > 0 && size[1] > 0)) return usage()
  return { id, width: size[0], length: size[1], ...(over === undefined ? {} : { over }), ...(point === undefined ? {} : { at: point }) }
}

/** Whether an id is written back as a word, as the stair and item lines check theirs. */
const readable = (id: string): boolean => /^[A-Za-z0-9._-]+$/.test(id) && plainId(id) === id

/** Whether the read-back writes this roof as roof and rooflight lines: no dormers, readable ids. */
export function roofHasLines(roof: Roof): boolean {
  if ((roof.dormers ?? []).length > 0) return false
  const ids = (roof.rooflights ?? []).map((r) => r.id)
  return ids.every(readable) && new Set(ids).size === ids.length
}

/** A roof as its roof line and its roof lights as rooflight lines, each at its point. */
export function roofLines(roof: Roof): string[] {
  const words = [
    'roof',
    roof.shape,
    ...(roof.pitch === undefined ? [] : ['pitch', metres(roof.pitch)]),
    ...(roof.ridge === undefined ? [] : ['ridge', metres(roof.ridge)]),
    'eaves',
    metres(roof.eaves),
    ...(roof.ridgeRuns === undefined ? [] : ['ridge', 'runs', roof.ridgeRuns]),
    ...(roof.highSide === undefined ? [] : ['high', roof.highSide]),
  ]
  const lights = (roof.rooflights ?? []).map((r) => `rooflight ${r.id} at ${metres(r.at[0])},${metres(r.at[1])}, ${metres(r.width)} x ${metres(r.length)}`)
  return [words.join(' '), ...lights]
}

/** The ways an earlier roof on a floor was written, so a second one is refused with the first's line. */
export class RoofLines {
  private readonly written = new Map<string, number>()

  /** A roof written on a floor, by a roof line or `raw floor {"roof": ...}`, refused when it is the second. */
  claim(floor: string, at: number): void {
    const first = this.written.get(floor)
    if (first !== undefined) refuse(at, 'rooms.roof.once', { first: String(first) })
    this.written.set(floor, at)
  }

  /** The roof with a roof light added, refused when the floor has no roof or the id is in it already. */
  withLight(roof: unknown, light: { readonly id: string; readonly at: P; readonly width: number; readonly length: number }, at: number): Roof {
    if (roof === undefined || roof === null) return refuse(at, 'rooms.roof.lightFirst')
    const r = roof as Roof
    const lights = r.rooflights ?? []
    if (lights.some((x) => x.id === light.id)) return refuse(at, 'rooms.rooflight.twice', { id: light.id })
    return { ...r, rooflights: [...lights, { id: light.id, at: [light.at[0], light.at[1]], width: light.width, length: light.length }] }
  }
}
