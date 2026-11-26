/**
 * CMD-43: a DXF drawing read for its rooms (`Drawing`, `model.ts`).
 *
 * A DXF is a list of pairs, a group code and a value, in sections. What is read:
 *
 * - The header's `$INSUNITS`, the unit the drawing is in; with none, `units` from the call, or
 *   the drawing's size: past `MILLIMETRES_PAST` units across it is millimetres, else metres.
 * - The entities, and the blocks they insert: LINE, LWPOLYLINE and POLYLINE (a bulge cut into
 *   straight pieces no more than `CURVE_OFF` from its arc), ARC and CIRCLE, TEXT, MTEXT and INSERT
 *   with its ATTRIBs. An insert of a door, window or opening block is that opening; any other is
 *   drawn out in its frame (an entity on layer 0 takes the insert's layer). A drawing turned over
 *   (its extrusion -Z) is turned back. Other entities (hatches, dimensions, splines) are not read.
 * - Each layer is read as walls, doors, windows, openings, room outlines, room names or nothing,
 *   by its name (`roleOfName`), or as the call's `layers` say. When no layer reads as walls or
 *   rooms, every layer with lines on it is read as walls, and the answer says so.
 *
 * Rooms are the closed outlines on a rooms layer when there are any, and otherwise the regions
 * the wall faces close round (`faces.ts`). A room's name, number and area are the texts and
 * attributes standing in it. Each door and window is the gap in the wall it stands in; a door or
 * window block standing in no gap is placed where it is inserted, as wide as it is drawn.
 *
 * Pure: the file's text in, a drawing out. Refuses with `DrawingRefused`.
 */
import { tolerance } from '@ongrid/floorplan/geometry/tolerances'
import { roomsFromFaces, type FaceSegment } from './faces'
import { add, arcPoints, bulgePoints, count, cross, dist, dot, DrawingRefused, folded, inside, LAYER_ROLES, mul, signedArea, sub, tidyRing, unit, type DrawnOpening, type DrawnRoom, type DrawnWall, type Drawing, type DrawingUnit, type LayerRole, type LayerUse, type OpeningKind, type P } from './model'

/** A curve is cut into straight pieces no further than this from it (m). */
export const CURVE_OFF = 0.01
/** A drawing with no unit that is more than this many units across is read as millimetres. */
export const MILLIMETRES_PAST = 300
/** Inserts drawn inside inserts, at most. */
const NESTING_MAX = 8
/** Points a room outline loses when they are this close to the line between their neighbours (m). */
const STRAIGHT = 0.0005

/** `$INSUNITS` codes Grid reads, in metres. */
const INSUNITS: Readonly<Record<number, { name: string; scale: number }>> = {
  1: { name: 'inches', scale: 0.0254 },
  2: { name: 'feet', scale: 0.3048 },
  4: { name: 'millimetres', scale: 0.001 },
  5: { name: 'centimetres', scale: 0.01 },
  6: { name: 'metres', scale: 1 },
  14: { name: 'decimetres', scale: 0.1 },
}

/** The units a call may name. */
export const DRAWING_UNITS: Readonly<Record<string, { name: string; scale: number }>> = {
  m: { name: 'metres', scale: 1 },
  cm: { name: 'centimetres', scale: 0.01 },
  mm: { name: 'millimetres', scale: 0.001 },
  in: { name: 'inches', scale: 0.0254 },
  ft: { name: 'feet', scale: 0.3048 },
}

export interface DxfOptions {
  /** `walls=A-WALL,A-WALL-EXT;doors=A-DOOR`: what layers are read as, over their names. */
  readonly layers?: string
  /** The unit of a drawing whose header states none (or another), from `DRAWING_UNITS`. */
  readonly units?: string
}

interface Pair {
  readonly code: number
  readonly value: string
}

interface Record_ {
  readonly type: string
  readonly pairs: Pair[]
  /** VERTEX records of a POLYLINE, ATTRIB records of an INSERT. */
  readonly children: Record_[]
}

/** An affine map: x' = a x + b y + c, y' = d x + e y + f. */
type Affine = readonly [number, number, number, number, number, number]
const IDENTITY: Affine = [1, 0, 0, 0, 1, 0]
const apply = (t: Affine, p: P): P => [t[0] * p[0] + t[1] * p[1] + t[2], t[3] * p[0] + t[4] * p[1] + t[5]]
const compose = (outer: Affine, inner: Affine): Affine => [
  outer[0] * inner[0] + outer[1] * inner[3],
  outer[0] * inner[1] + outer[1] * inner[4],
  outer[0] * inner[2] + outer[1] * inner[5] + outer[2],
  outer[3] * inner[0] + outer[4] * inner[3],
  outer[3] * inner[1] + outer[4] * inner[4],
  outer[3] * inner[2] + outer[4] * inner[5] + outer[5],
]

/** An entity drawn out in the drawing's frame, in its units. */
interface Flat {
  readonly type: string
  readonly layer: string
  readonly handle: string | null
  readonly lines: P[][]
  readonly closed: boolean[]
  /** Drawn from an arc or a bulge, cut into straight pieces. */
  readonly curved: boolean
  readonly text?: { readonly value: string; readonly at: P; readonly height: number; readonly tag: string | null }
  readonly insert?: { readonly block: string; readonly at: P; readonly along: P; readonly extent: readonly [number, number] | null; readonly across: P | null }
}

/** The pairs of a DXF text. Refuses a binary DXF. */
function pairsOf(text: string): Pair[] {
  if (text.startsWith('AutoCAD Binary DXF')) {
    throw new DrawingRefused('drawing/binary', 'This is a binary DXF, which Grid does not read: save it again as an ASCII DXF (in AutoCAD, Save As with DXF and the binary option off).')
  }
  const lines = text.split(/\r\n|\r|\n/)
  const out: Pair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim())
    if (!Number.isInteger(code)) throw new DrawingRefused('drawing/not-read', `This is not a DXF Grid can read: line ${i + 1} should be a group code, a whole number.`)
    out.push({ code, value: lines[i + 1]!.replace(/\s+$/, '') })
  }
  if (!out.some((p) => p.code === 0 && p.value === 'SECTION')) throw new DrawingRefused('drawing/not-read', 'This is not a DXF Grid can read: it has no SECTION.')
  return out
}

/** The records of each section, by name, with VERTEX and ATTRIB records under their owner. */
function sectionsOf(pairs: readonly Pair[]): Map<string, Record_[]> {
  const sections = new Map<string, Record_[]>()
  let i = 0
  while (i < pairs.length) {
    if (!(pairs[i]!.code === 0 && pairs[i]!.value === 'SECTION')) {
      i++
      continue
    }
    const name = pairs[i + 1]?.code === 2 ? pairs[i + 1]!.value.trim() : ''
    i += 2
    const records: Record_[] = []
    let owner: Record_ | null = null
    while (i < pairs.length && !(pairs[i]!.code === 0 && pairs[i]!.value === 'ENDSEC')) {
      if (pairs[i]!.code !== 0) {
        i++
        continue
      }
      const record: Record_ = { type: pairs[i]!.value.trim(), pairs: [], children: [] }
      i++
      while (i < pairs.length && pairs[i]!.code !== 0) record.pairs.push(pairs[i++]!)
      if ((record.type === 'VERTEX' || record.type === 'ATTRIB') && owner !== null) owner.children.push(record)
      else if (record.type === 'SEQEND') owner = null
      else {
        records.push(record)
        owner = record.type === 'POLYLINE' || (record.type === 'INSERT' && num(record, 66, 0) === 1) ? record : null
      }
    }
    sections.set(name, [...(sections.get(name) ?? []), ...records])
    i++
  }
  return sections
}

const first = (r: Record_, code: number): string | undefined => r.pairs.find((p) => p.code === code)?.value
function num(r: Record_, code: number, fallback: number): number {
  const v = first(r, code)
  const n = v === undefined ? NaN : Number(v.trim())
  return Number.isFinite(n) ? n : fallback
}
const layerOf = (r: Record_): string => (first(r, 8) ?? '0').trim()

/** A DXF text as written: its `\U+00F1` codes, its `%%d` codes and an MTEXT's formatting taken out. */
function textValue(raw: string, mtext: boolean): string {
  let t = raw.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  t = t.replace(/%%[dD]/g, '°').replace(/%%[cC]/g, '⌀').replace(/%%[pP]/g, '±').replace(/%%[uUoOkK]/g, '')
  if (mtext) {
    t = t.replace(/\\[Pp]/g, ' ').replace(/\\~/g, ' ').replace(/\\S([^;]*);/g, (_, s: string) => s.replace(/[#^]/g, '/'))
    t = t.replace(/\\[ACFHQTWfpc][^;\\{}]*;/g, '').replace(/\\[LlOoKkN]/g, '').replace(/[{}]/g, '').replace(/\\\\/g, '\\')
  }
  return t.replace(/\s+/g, ' ').trim()
}

/** The entity's turn-over: an extrusion of -Z mirrors x. */
const turnedOver = (r: Record_): boolean => num(r, 230, 1) < 0

/** An entity in its block's frame (or the drawing's), its curves cut into pieces of `off` units. */
function shapeOf(r: Record_, off: number): { lines: P[][]; closed: boolean[]; curved: boolean } | null {
  const flip = turnedOver(r)
  const fx = (p: P): P => (flip ? [-p[0], p[1]] : p)
  switch (r.type) {
    case 'LINE':
      return { lines: [[fx([num(r, 10, 0), num(r, 20, 0)]), fx([num(r, 11, 0), num(r, 21, 0)])]], closed: [false], curved: false }
    case 'LWPOLYLINE': {
      const vs: { p: P; bulge: number }[] = []
      for (const pair of r.pairs) {
        if (pair.code === 10) vs.push({ p: [Number(pair.value), 0], bulge: 0 })
        else if (pair.code === 20 && vs.length > 0) vs[vs.length - 1]!.p = [vs[vs.length - 1]!.p[0], Number(pair.value)]
        else if (pair.code === 42 && vs.length > 0) vs[vs.length - 1]!.bulge = Number(pair.value)
      }
      const closed = (num(r, 70, 0) & 1) === 1
      return polyline(vs.map((v) => ({ p: fx(v.p), bulge: flip ? -v.bulge : v.bulge })), closed, off)
    }
    case 'POLYLINE': {
      const flags = num(r, 70, 0)
      if ((flags & (16 | 64)) !== 0) return null
      const vs = r.children.filter((v) => (num(v, 70, 0) & 128) === 0).map((v) => ({ p: fx([num(v, 10, 0), num(v, 20, 0)]), bulge: (flip ? -1 : 1) * num(v, 42, 0) }))
      return polyline(vs, (flags & 1) === 1, off)
    }
    case 'ARC': {
      const c: P = [num(r, 10, 0), num(r, 20, 0)]
      const radius = num(r, 40, 0)
      const a0 = (num(r, 50, 0) * Math.PI) / 180
      let sweep = ((num(r, 51, 360) - num(r, 50, 0)) % 360 + 360) % 360
      if (sweep === 0) sweep = 360
      if (!(radius > 0)) return null
      return { lines: [arcPoints(c, radius, a0, (sweep * Math.PI) / 180, off).map(fx)], closed: [false], curved: true }
    }
    case 'CIRCLE': {
      const c: P = [num(r, 10, 0), num(r, 20, 0)]
      const radius = num(r, 40, 0)
      if (!(radius > 0)) return null
      const pts = arcPoints(c, radius, 0, 2 * Math.PI, off).map(fx)
      pts.pop()
      return { lines: [pts], closed: [true], curved: true }
    }
    default:
      return null
  }
}

function polyline(vs: readonly { p: P; bulge: number }[], closed: boolean, off: number): { lines: P[][]; closed: boolean[]; curved: boolean } | null {
  if (vs.length < 2) return null
  const pts: P[] = [vs[0]!.p]
  const n = closed ? vs.length : vs.length - 1
  for (let i = 0; i < n; i++) {
    const a = vs[i]!
    const b = vs[(i + 1) % vs.length]!
    const piece = bulgePoints(a.p, b.p, a.bulge, off)
    pts.push(...piece.slice(1))
  }
  if (closed) pts.pop()
  return { lines: [pts], closed: [closed], curved: vs.some((v, i) => v.bulge !== 0 && (closed || i < vs.length - 1)) }
}

/** Whether a word in a layer or block name names a part of a building. */
const has = (name: string, words: readonly string[]): boolean => words.some((w) => name.includes(w))
const NAME_WORDS = ['tag', 'text', 'txt', 'name', 'label', 'iden', 'anno', 'beschrift', 'nom', 'nombre', 'etiq', 'texto']
const ROOM_WORDS = ['room', 'space', 'area', 'raum', 'zone', 'pieza', 'piece', 'habitac', 'espacio', 'local', 'stanza', 'ambiente']
const DOOR_WORDS = ['door', 'tur', 'tuer', 'puerta', 'porte', 'porta']
const WINDOW_WORDS = ['window', 'wind', 'fenster', 'ventana', 'fenetre', 'janela', 'finestra', 'glaz']
const OPENING_WORDS = ['opening', 'offnung', 'oeffnung', 'abertura', 'ouverture', 'hueco', 'vano']
const WALL_WORDS = ['wall', 'wand', 'mur', 'muro', 'pared', 'parede', 'mauer']
/** Layers whose name says they hold none of a plan's parts, though they hold a word that does. */
const NOT_WORDS = ['fill', 'hatch', 'patt', 'dim', 'virtual', 'dividing', 'swing', 'demol', 'above', 'grid-sheet', 'viewport', 'left-out', 'facts', 'notes']

/** What a layer is read as, by its name. */
export function roleOfName(layer: string): LayerRole {
  const name = folded(layer)
  if (has(name, NOT_WORDS)) return 'nothing'
  if (has(name, NAME_WORDS)) return 'names'
  if (has(name, WINDOW_WORDS)) return 'windows'
  if (has(name, DOOR_WORDS)) return 'doors'
  if (has(name, OPENING_WORDS)) return 'openings'
  if (has(name, WALL_WORDS)) return 'walls'
  if (has(name, ROOM_WORDS)) return 'rooms'
  return 'nothing'
}

/** The kind of opening a block's name says it is, or null. */
function kindOfBlock(block: string): OpeningKind | null {
  const name = folded(block)
  if (has(name, WINDOW_WORDS) || /(^|[^a-z])win([^a-z]|$)/.test(name)) return 'window'
  if (has(name, DOOR_WORDS)) return 'door'
  if (has(name, OPENING_WORDS)) return 'opening'
  return null
}

/** The call's `layers`: each named layer, folded, and what it is read as. */
export function askedLayers(text: string | undefined): Map<string, LayerRole> {
  const out = new Map<string, LayerRole>()
  if (text === undefined) return out
  for (const part of text.split(';')) {
    if (part.trim() === '') continue
    const eq = part.indexOf('=')
    const role = (eq < 0 ? '' : part.slice(0, eq)).trim().toLowerCase()
    if (!(LAYER_ROLES as readonly string[]).includes(role)) {
      throw new DrawingRefused('drawing/layers', `layers reads <what>=<layer>,<layer>;...: ${JSON.stringify(part.trim())} names no part. The parts are ${LAYER_ROLES.join(', ')}.`)
    }
    for (const layer of part.slice(eq + 1).split(',')) if (layer.trim() !== '') out.set(folded(layer.trim()), role as LayerRole)
  }
  return out
}

/** A DXF read for its rooms. */
export function readDxf(text: string, options: DxfOptions = {}): Drawing {
  const sections = sectionsOf(pairsOf(text))
  // The header's variables are pairs with no record of their own: $INSUNITS is a 9 and then a 70.
  const raw = text.match(/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(-?\d+)/)
  const insunits = raw === null ? null : Number(raw[1])

  // Blocks by name.
  const blocks = new Map<string, { base: P; records: Record_[] }>()
  let current: { name: string; base: P; records: Record_[] } | null = null
  for (const r of sections.get('BLOCKS') ?? []) {
    if (r.type === 'BLOCK') current = { name: (first(r, 2) ?? '').trim(), base: [num(r, 10, 0), num(r, 20, 0)], records: [] }
    else if (r.type === 'ENDBLK') {
      if (current !== null) blocks.set(current.name, current)
      current = null
    } else if (current !== null) current.records.push(r)
  }
  const entities = sections.get('ENTITIES') ?? []
  if (entities.length === 0) throw new DrawingRefused('drawing/empty', 'The DXF has no entities in its ENTITIES section, so there is nothing to read.')

  const asked = askedLayers(options.layers)
  // The unit, first: curves are cut by it.
  const unitFrom = (): DrawingUnit | null => {
    if (options.units !== undefined) {
      const u = DRAWING_UNITS[options.units]
      if (u === undefined) throw new DrawingRefused('drawing/units', `units is ${JSON.stringify(options.units)}: give one of ${Object.keys(DRAWING_UNITS).join(', ')}.`)
      return { ...u, from: 'asked' }
    }
    const u = insunits === null ? undefined : INSUNITS[insunits]
    return u === undefined ? null : { ...u, from: 'file' }
  }
  let unitRead = unitFrom()
  const flats: Flat[] = []
  const notRead = new Map<string, number>()
  const explode = (records: readonly Record_[], t: Affine, insertLayer: string | null, depth: number, off: number): void => {
    for (const r of records) {
      // Paper space (67 = 1) is the sheet, not the plan.
      if (num(r, 67, 0) === 1) continue
      const own = layerOf(r)
      const layer = insertLayer !== null && own === '0' ? insertLayer : own
      const handle = first(r, 5)?.trim() ?? null
      if (r.type === 'INSERT') {
        const name = (first(r, 2) ?? '').trim()
        const block = blocks.get(name)
        const flip = turnedOver(r)
        const at0: P = [num(r, 10, 0), num(r, 20, 0)]
        const rot = (num(r, 50, 0) * Math.PI) / 180
        const sx = num(r, 41, 1)
        const sy = num(r, 42, sx)
        const base = block?.base ?? [0, 0]
        const [c, s] = [Math.cos(rot), Math.sin(rot)]
        let local: Affine = [c * sx, -s * sy, at0[0] - (c * sx * base[0] - s * sy * base[1]), s * sx, c * sy, at0[1] - (s * sx * base[0] + c * sy * base[1])]
        if (flip) local = compose([-1, 0, 0, 0, 1, 0], local)
        const whole = compose(t, local)
        const role = asked.get(folded(layer)) ?? roleOfName(layer)
        const kind = role === 'doors' ? 'door' : role === 'windows' ? 'window' : role === 'openings' ? 'opening' : kindOfBlock(name)
        for (const a of r.children) {
          const value = textValue(first(a, 1) ?? '', false)
          const p: P = [num(a, 10, 0), num(a, 20, 0)]
          if (value !== '') flats.push({ type: 'ATTRIB', layer, handle: first(a, 5)?.trim() ?? handle, lines: [], closed: [], curved: false, text: { value, at: apply(t, turnedOver(a) ? [-p[0], p[1]] : p), height: num(a, 40, 0), tag: (first(a, 2) ?? '').trim() } })
        }
        if (kind !== null && (role === 'doors' || role === 'windows' || role === 'openings' || role === 'nothing' || role === 'walls')) {
          // The opening: along its x, as wide as what its block draws along it.
          const along = unit(sub(apply(whole, [base[0] + 1, base[1]]), apply(whole, base)))
          const across: P = [-along[1], along[0]]
          const at = apply(whole, base)
          let extent: [number, number] | null = null
          let acrossExtent: [number, number] | null = null
          if (block !== undefined) {
            const inner: Flat[] = []
            const keep = flats.length
            explode(block.records, whole, layer, depth + 1, off)
            inner.push(...flats.splice(keep))
            for (const f of inner) {
              for (const line of f.lines) {
                for (const p of line) {
                  const x = dot(sub(p, at), along)
                  const y = dot(sub(p, at), across)
                  extent = extent === null ? [x, x] : [Math.min(extent[0], x), Math.max(extent[1], x)]
                  acrossExtent = acrossExtent === null ? [y, y] : [Math.min(acrossExtent[0], y), Math.max(acrossExtent[1], y)]
                }
              }
            }
          }
          flats.push({ type: 'INSERT', layer, handle, lines: [], closed: [], curved: false, insert: { block: name, at, along, extent, across: acrossExtent } })
          continue
        }
        if (block === undefined) continue
        if (depth >= NESTING_MAX) {
          notRead.set('inserts nested deeper than 8', (notRead.get('inserts nested deeper than 8') ?? 0) + 1)
          continue
        }
        explode(block.records, whole, layer, depth + 1, off)
        continue
      }
      if (r.type === 'TEXT' || r.type === 'MTEXT') {
        const raw = r.type === 'MTEXT' ? [...r.pairs.filter((p) => p.code === 3).map((p) => p.value), first(r, 1) ?? ''].join('') : (first(r, 1) ?? '')
        const aligned = r.type === 'TEXT' && (num(r, 72, 0) !== 0 || num(r, 73, 0) !== 0) && first(r, 11) !== undefined
        let at: P = aligned ? [num(r, 11, 0), num(r, 21, 0)] : [num(r, 10, 0), num(r, 20, 0)]
        if (turnedOver(r)) at = [-at[0], at[1]]
        // Each paragraph of an MTEXT is a text of its own: a name above its area.
        for (const part of r.type === 'MTEXT' ? raw.split(/\\P/) : [raw]) {
          const value = textValue(part, r.type === 'MTEXT')
          if (value !== '') flats.push({ type: r.type, layer, handle, lines: [], closed: [], curved: false, text: { value, at: apply(t, at), height: num(r, 40, 0), tag: null } })
        }
        continue
      }
      const shape = shapeOf(r, off)
      if (shape === null) {
        if (!['HATCH', 'DIMENSION', 'POINT', 'SOLID', 'VIEWPORT', 'ATTDEF', 'SEQEND', 'LEADER', 'MULTILEADER', 'WIPEOUT', 'IMAGE'].includes(r.type)) notRead.set(r.type, (notRead.get(r.type) ?? 0) + 1)
        continue
      }
      flats.push({ type: r.type, layer, handle, lines: shape.lines.map((line) => line.map((p) => apply(t, p))), closed: shape.closed, curved: shape.curved })
    }
  }
  // Curves are cut finer than CURVE_OFF in the drawing's units; with no unit yet, as for
  // millimetres, and again once the drawing's size has said it is in metres.
  explode(entities, IDENTITY, null, 0, CURVE_OFF / (unitRead?.scale ?? 0.001))
  const firstCut = unitRead === null

  // The layers and what each is read as.
  const counts = new Map<string, number>()
  for (const f of flats) counts.set(f.layer, (counts.get(f.layer) ?? 0) + 1)
  const known = new Map([...counts.keys()].map((layer) => [folded(layer), layer] as const))
  for (const [layer] of asked) {
    if (!known.has(layer)) {
      throw new DrawingRefused('drawing/layers', `layers names ${JSON.stringify(layer)}, a layer the drawing holds nothing on. Its layers: ${[...counts.keys()].sort().join(', ')}.`)
    }
  }
  const roles = new Map<string, { role: LayerRole; why: LayerUse['why'] }>()
  for (const layer of counts.keys()) {
    const a = asked.get(folded(layer))
    roles.set(layer, a !== undefined ? { role: a, why: 'asked' } : { role: roleOfName(layer), why: 'name' })
  }
  const assumed: string[] = []
  const leftOut: string[] = []
  const lined = (f: Flat): boolean => f.lines.length > 0
  const anyOf = (role: LayerRole): boolean => [...roles.values()].some((r) => r.role === role)
  if (!anyOf('walls') && !anyOf('rooms')) {
    const withLines = [...new Set(flats.filter(lined).map((f) => f.layer))].filter((layer) => roles.get(layer)!.why !== 'asked')
    for (const layer of withLines) roles.set(layer, { role: 'walls', why: 'content' })
    if (withLines.length > 0) assumed.push(`No layer is named for walls or rooms, so the lines on ${withLines.length === 1 ? 'its one layer' : `every layer with lines (${withLines.join(', ')})`} are read as wall faces. Pass layers to say which layer holds what.`)
  }
  const roleOf = (f: Flat): LayerRole => roles.get(f.layer)!.role
  const layers: LayerUse[] = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([layer, entities]) => ({ layer, entities, readAs: roles.get(layer)!.role, why: roles.get(layer)!.why }))

  // The unit, from the drawing's size when nothing states it.
  if (unitRead === null) {
    const pts = flats.filter((f) => roleOf(f) === 'walls' || roleOf(f) === 'rooms').flatMap((f) => f.lines.flat())
    const span = pts.length === 0 ? 0 : Math.max(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])))
    const mm = span > MILLIMETRES_PAST
    unitRead = { name: mm ? 'millimetres' : 'metres', scale: mm ? 0.001 : 1, from: 'guessed' }
    if (firstCut && !mm) {
      flats.splice(0)
      notRead.clear()
      explode(entities, IDENTITY, null, 0, CURVE_OFF)
    }
    assumed.push(`The drawing states no unit ($INSUNITS${insunits === null ? ' is not set' : ` is ${insunits}`}): it is ${Math.round(span).toLocaleString('en-US')} units across, so it is read in ${unitRead.name}. Pass units if it is in another.`)
  }
  const k = unitRead.scale
  const toM = (p: P): P => [p[0] * k, p[1] * k]

  // Wall faces, room outlines and names, in metres.
  const faces: FaceSegment[] = []
  const walls: DrawnWall[] = []
  for (const f of flats) {
    if (roleOf(f) !== 'walls' || !lined(f)) continue
    const segs: [P, P][] = []
    f.lines.forEach((line, i) => {
      const pts = line.map(toM)
      for (let j = 0; j + 1 < pts.length; j++) segs.push([pts[j]!, pts[j + 1]!])
      if (f.closed[i] && pts.length > 2) segs.push([pts[pts.length - 1]!, pts[0]!])
    })
    for (const [a, b] of segs) faces.push({ a, b, source: f.handle })
    if (f.handle !== null) walls.push({ floor: '', source: f.handle, faces: segs, footprint: null, height: null })
  }
  const curved = flats.filter((f) => (roleOf(f) === 'walls' || roleOf(f) === 'rooms') && f.curved).length
  if (curved > 0) assumed.push(`${count(curved, 'curved wall face')} (arcs and polyline bulges) on the walls and room outlines ${curved === 1 ? 'is' : 'are'} drawn as straight pieces no more than ${CURVE_OFF * 100} cm off the curve: rooms text draws a room's faces straight.`)

  const names = flats.filter((f) => f.text !== undefined && (f.type === 'ATTRIB' || roleOf(f) === 'names' || roleOf(f) === 'rooms' || (!anyOf('names') && !has(folded(f.layer), NOT_WORDS))))
  const namePoints = names.map((f) => toM(f.text!.at))

  const outlines = flats.filter((f) => roleOf(f) === 'rooms' && lined(f)).flatMap((f) =>
    f.lines.flatMap((line, i) => {
      const ring = line.map(toM)
      if (!f.closed[i] && !(ring.length > 3 && dist(ring[0]!, ring[ring.length - 1]!) < 0.002)) return []
      const tidy = tidyRing(ring, STRAIGHT)
      return tidy.length >= 3 && Math.abs(signedArea(tidy)) > 0.05 ? [{ ring: tidy, handle: f.handle }] : []
    })
  )
  const faceReading = faces.length > 0 ? roomsFromFaces(faces, namePoints) : null
  const rooms: DrawnRoom[] = []
  const labelOf = (ring: readonly P[]): ReturnType<typeof label> => label(names.filter((_, i) => inside(ring, namePoints[i]!)))
  if (outlines.length > 0) {
    for (const o of outlines) rooms.push({ floor: '', outline: o.ring, ...labelOf(o.ring), source: o.handle, from: 'outline' })
    const open = flats.filter((f) => roleOf(f) === 'rooms' && lined(f) && f.closed.every((c) => !c)).length
    if (open > 0) leftOut.push(`${count(open, 'line')} on a rooms layer that close round nothing: not read as rooms.`)
  } else if (faceReading !== null) {
    for (const r of faceReading.rooms) {
      const tidy = tidyRing(r.outline, STRAIGHT)
      const lab = labelOf(tidy)
      // A room worked out from faces keeps the handle of its name, the one entity that is its own.
      const own = names.filter((_, i) => inside(tidy, namePoints[i]!))[0]?.handle ?? null
      rooms.push({ floor: '', outline: tidy, ...lab, source: own, from: 'faces' })
    }
    const holes = faceReading.rooms.reduce((s, r) => s + r.holes, 0)
    if (holes > 0) leftOut.push(`${count(holes, 'piece')} of wall standing free inside a room (a column, a free-standing wall): rooms text draws a room with no hole, so ${holes === 1 ? 'it is' : 'they are'} not drawn.`)
    if (faceReading.narrow > 0) assumed.push(`${count(faceReading.narrow, 'region')} the walls close round with no name in ${faceReading.narrow === 1 ? 'it' : 'them'}, narrower than ${tolerance('roomsWallWidest')} m or smaller than half a square metre, ${faceReading.narrow === 1 ? 'is' : 'are'} read as wall, not as rooms.`)
  }
  if (rooms.length === 0) {
    throw new DrawingRefused(
      'drawing/no-rooms',
      `No room was read from the DXF: ${faces.length === 0 ? 'no layer was read as walls or as room outlines' : 'its wall faces close round no room'}. Its layers: ${layers.map((l) => `${l.layer} (${l.entities}, ${l.readAs})`).join(', ')}. Pass layers to say which layer holds the walls (walls=<layer>) or the room outlines (rooms=<layer>).`
    )
  }
  const unnamed = rooms.filter((r) => r.name === null).length
  if (unnamed > 0) assumed.push(`${count(unnamed, 'room')} ${unnamed === 1 ? 'has' : 'have'} no name standing in ${unnamed === 1 ? 'it' : 'them'}: named "Room 1" and on, with no use.`)

  // Openings: each closed gap, of the kind of the insert standing in it; inserts in no gap where they are.
  const inserts = flats.filter((f) => f.insert !== undefined).map((f) => {
    const ins = f.insert!
    const role = roleOf(f)
    const kind: OpeningKind = role === 'doors' ? 'door' : role === 'windows' ? 'window' : role === 'openings' ? 'opening' : (kindOfBlock(ins.block) ?? 'door')
    const atM = toM(ins.at)
    const extent = ins.extent === null ? null : ([ins.extent[0] * k, ins.extent[1] * k] as const)
    const centre = extent === null ? atM : add(atM, mul(ins.along, (extent[0] + extent[1]) / 2))
    return { kind, at: centre, along: ins.along, width: extent === null ? null : extent[1] - extent[0], handle: f.handle }
  })
  const openings: DrawnOpening[] = []
  const takenInserts = new Set<number>()
  let bare = 0
  for (const g of faceReading?.gaps ?? []) {
    const n: P = [-g.along[1], g.along[0]]
    const hit = inserts.findIndex((ins, i) => !takenInserts.has(i) && Math.abs(dot(sub(ins.at, g.at), g.along)) <= g.width / 2 + 0.1 && Math.abs(dot(sub(ins.at, g.at), n)) <= tolerance('roomsWallWidest'))
    if (hit >= 0) takenInserts.add(hit)
    const ins = hit >= 0 ? inserts[hit]! : null
    if (ins === null) bare++
    openings.push({ floor: '', kind: ins?.kind ?? 'opening', at: g.at, along: g.along, width: g.width, height: null, sill: null, source: ins?.handle ?? null, how: 'gap' })
  }
  if (bare > 0) assumed.push(`${count(bare, 'gap')} in the walls with no door or window block standing in ${bare === 1 ? 'it' : 'them'} ${bare === 1 ? 'is' : 'are'} read as ${bare === 1 ? 'a doorless opening' : 'doorless openings'}, as wide as the gap.`)
  let placedFree = 0
  inserts.forEach((ins, i) => {
    if (takenInserts.has(i)) return
    if (ins.width === null || !(ins.width > 0.2)) return
    placedFree++
    openings.push({ floor: '', kind: ins.kind, at: ins.at, along: ins.along, width: ins.width, height: null, sill: null, source: ins.handle, how: 'insert' })
  })
  if (placedFree > 0) assumed.push(`${count(placedFree, 'door or window block', 'door and window blocks')} ${placedFree === 1 ? 'stands' : 'stand'} in no gap of the walls: placed where ${placedFree === 1 ? 'it is' : 'they are'} inserted, as wide as ${placedFree === 1 ? 'its block draws' : 'their blocks draw'} along ${placedFree === 1 ? 'its' : 'their'} wall.`)
  const noWidth = inserts.filter((ins, i) => !takenInserts.has(i) && !(ins.width !== null && ins.width > 0.2)).length
  if (noWidth > 0) leftOut.push(`${count(noWidth, 'door or window block', 'door and window blocks')} in no gap of the walls whose block draws nothing to measure ${noWidth === 1 ? 'its' : 'their'} width by: not placed.`)
  if (openings.length > 0) assumed.push('A DXF does not give a door\'s or window\'s height or sill: Grid\'s defaults are written (doors 2.1 m high, windows 1.2 m high on a 0.9 m sill), with each door\'s swing as Grid guesses it.')
  if (notRead.size > 0) leftOut.push(`Entities Grid does not read for a plan: ${[...notRead].map(([type, n]) => `${n} ${type}`).join(', ')}.`)

  return {
    format: 'dxf',
    unit: unitRead,
    floors: [],
    rooms,
    openings,
    walls,
    outside: faceReading?.outside == null ? new Map() : new Map([['', faceReading.outside]]),
    wallHeight: null,
    layers,
    assumed,
    leftOut,
  }
}

const AREA = /([0-9]+(?:[.,][0-9]+)?)\s*(m²|m2|sq\.? ?m|sqm|ft²|ft2|sq\.? ?ft|sf)(?![\p{L}\d])/iu
const NUMBER = /^[A-Z]{0,3}[-.]?\d{1,4}(?:[.-]\d{1,3})*[A-Z]?$/i
const NAME_TAGS = /^(name|room ?name|roomname|raumname|nom|nombre|nome|bezeichnung)$/i
const NUMBER_TAGS = /^(number|no|nr|num|room ?number|roomnumber|nummer|numero|número)$/i

/** A room's name, number and stated area, from the texts standing in it. */
function label(texts: readonly Flat[]): { name: string | null; number: string | null; statedArea: number | null } {
  let name: string | null = null
  let number: string | null = null
  let statedArea: number | null = null
  let height = -1
  for (const f of texts) {
    const t = f.text!
    const area = t.value.match(AREA)
    if (area !== null) {
      const v = Number(area[1]!.replace(',', '.'))
      statedArea ??= /ft|sf/i.test(area[2]!) ? v * 0.09290304 : v
      continue
    }
    if (t.tag !== null && NUMBER_TAGS.test(t.tag)) {
      number ??= t.value
      continue
    }
    if (t.tag !== null && NAME_TAGS.test(t.tag)) {
      name = t.value
      height = Infinity
      continue
    }
    if (NUMBER.test(t.value) || !/\p{L}/u.test(t.value)) {
      number ??= t.value
      continue
    }
    if (t.height > height) {
      name = t.value
      height = t.height
    }
  }
  return { name, number, statedArea }
}

/** Whether a direction runs along another, either way. */
export const parallel = (a: P, b: P): boolean => Math.abs(cross(a, b)) < 0.02
