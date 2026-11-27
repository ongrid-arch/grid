/**
 * CMD-43: a drawing (`model.ts`) written as rooms text, and the text checked by compiling it.
 *
 * 1. The rooms, each a polygon of its inside faces, counter-clockwise, with its name, its use
 *    when its name plainly means one (else `-`), its number, and the DXF handle or IFC GlobalId
 *    it came from as a fact (`handle`, `guid`). Two room outlines that touch are open to each
 *    other. The floors with their level and elevation; a walls line with the outside walls'
 *    thickness the drawing shows. The compiler works the walls out from the rooms' faces.
 * 2. The rooms alone are compiled. Each opening goes on the wall the compile put under it:
 *    `between <a> and <b>` or `in <room> <side>`, `<m> from <side>` measured as the compiler
 *    measures it, along the room's own side from its end that way.
 * 3. The whole text is compiled again. An opening line the compile refuses, or places more than
 *    `PLACED_OFF` from the drawing, is written as a `raw opening` on that wall's id at the drawn
 *    place, and the text compiled once more.
 * 4. The walls the compile worked out are matched to the drawing's walls by where they stand, and
 *    each gets the handles or GlobalIds of the walls it is drawn from, as a fact, by its id.
 * 5. CNT-59: from an IFC file, each part also keeps its element's GlobalId, Name and Tag as its
 *    `identity`, by id: a floor its storey's, a room its space's, an opening its element's, and
 *    a wall the one wall it is drawn from, or, of a drawn wall Grid writes as several, the
 *    longest. So no two parts keep one GlobalId.
 *
 * Pure: a drawing in, rooms text and what was checked out.
 */
import { WALL_DEFAULTS, ROOM_USES, isOutsideGuid, readUse, type Identity, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { compileRoomsText, type RoomsResult } from '@ongrid/floorplan/rooms'
import { tolerance } from '@ongrid/floorplan/geometry/tolerances'
import { count, cross, dist, dot, folded, inside, len, m, signedArea, sub, unit, add, mul, type Drawing, type DrawnOpening, type KeptNames, type P } from './model'

/** An opening the compile places further than this from the drawing is written raw (m). */
export const PLACED_OFF = 0.005
/** Grid's defaults for what a DXF does not give, as the compiler takes them. */
const DOOR_HEIGHT = 2.1
const WINDOW_SILL = 0.9
const WINDOW_HEIGHT = 1.2
/** Room outlines closer than this face to face touch (m). */
const TOUCH = tolerance('roomsTouch')
/** Handles kept on one wall, at most. */
const WALL_SOURCES_MAX = 12

const COMPASS: Readonly<Record<string, P>> = {
  north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0],
  ne: [Math.SQRT1_2, Math.SQRT1_2], nw: [-Math.SQRT1_2, Math.SQRT1_2], se: [Math.SQRT1_2, -Math.SQRT1_2], sw: [-Math.SQRT1_2, -Math.SQRT1_2],
}
const compassOf = (n: P): string => Object.keys(COMPASS).reduce((best, k) => (dot(n, COMPASS[k]!) > dot(n, COMPASS[best]!) ? k : best))

export interface RoomCheck {
  readonly id: string
  readonly name: string
  readonly floor: string
  /** The room's inside area in the plan, as Grid measures it. */
  readonly area: number
  /** The area of its outline in the drawing. */
  readonly drawn: number
  /** The area its label states, if it states one. */
  readonly stated: number | null
  readonly source: string | null
}

export interface OpeningCheck {
  readonly id: string
  readonly kind: DrawnOpening['kind']
  readonly source: string | null
  /** How it was written: a door, window or opening line, a raw opening on its wall, or not at all. */
  readonly written: 'line' | 'raw' | 'not placed'
  readonly wall: string | null
  /** How far along its wall it is from where the drawing has it (m); null when not placed. */
  readonly off: number | null
}

export interface DrawingRooms {
  readonly text: string
  /** The last compile: its plan is null when the text does not write. */
  readonly result: RoomsResult
  readonly rooms: readonly RoomCheck[]
  readonly openings: readonly OpeningCheck[]
  /** Facts the text cannot carry, to set on the plan by id: the walls' and openings' sources. */
  readonly facts: { readonly walls: Readonly<Record<string, Readonly<Record<string, string>>>>; readonly openings: Readonly<Record<string, Readonly<Record<string, string>>>> }
  readonly factName: 'handle' | 'guid'
  /** CNT-59: what the IFC file calls each part, to set on the plan by id; none from a DXF. */
  readonly identities: PartIdentities
  readonly assumed: readonly string[]
  readonly leftOut: readonly string[]
}

/** CNT-59: each list's parts' identities, by id. */
export interface PartIdentities {
  readonly walls: Readonly<Record<string, Identity>>
  readonly openings: Readonly<Record<string, Identity>>
  readonly rooms: Readonly<Record<string, Identity>>
  readonly floors: Readonly<Record<string, Identity>>
}

const NO_IDENTITIES: PartIdentities = { walls: {}, openings: {}, rooms: {}, floors: {} }

/** CNT-59: an element's identity from its GlobalId and its Name and Tag, or null when it states none Grid can keep. */
function identityFrom(source: string | null, kept: KeptNames | undefined): Identity | null {
  const guid = source !== null && isOutsideGuid(source) ? source : undefined
  const name = kept?.name ?? undefined
  const tag = kept?.tag ?? undefined
  if (guid === undefined && name === undefined && tag === undefined) return null
  return { ...(guid === undefined ? {} : { guid }), ...(name === undefined ? {} : { name }), ...(tag === undefined ? {} : { tag }) }
}

/** An id made from a name: plain letters and digits, dashes between, at most 40 long. */
function slug(text: string, fallback: string): string {
  const s = folded(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '')
  return s === '' || !/^[a-z0-9]/.test(s) ? fallback : s
}

/** The use a room's name plainly means, from the whole name, then its last word, then its first. */
function roomUseOf(name: string | null): RoomUse | null {
  if (name === null) return null
  const words = name.split(/\s+/).filter((w) => /\p{L}/u.test(w))
  for (const w of [name, words[words.length - 1], words[0]]) {
    if (w === undefined) continue
    const use = readUse(w)
    if (typeof use === 'string' && (ROOM_USES as readonly string[]).includes(use)) return use as RoomUse
  }
  return null
}

/** Rooms text quoting: JSON's quotes, which rooms text reads with its backslashes. */
const q = (text: string): string => JSON.stringify(text)

interface Placed {
  readonly id: string
  readonly floor: string
  readonly outline: readonly P[]
}

/** Rooms text from a drawing, checked by compiling it. */
export function roomsTextOf(drawing: Drawing, file: string): DrawingRooms {
  const factName = drawing.format === 'dxf' ? 'handle' : 'guid'
  const assumed = [...drawing.assumed]
  const leftOut = [...drawing.leftOut]
  const taken = new Set<string>()
  const fresh = (base: string): string => {
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    taken.add(id)
    return id
  }

  // Floors: their ids, levels and elevations from the lowest's.
  const floors = [...drawing.floors].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))
  const floorId = new Map<string, string>()
  const ground = floors.reduce<{ i: number; e: number } | null>((best, f, i) => {
    const e = Math.abs(f.elevation ?? 0)
    return best === null || e < best.e ? { i, e } : best
  }, null)
  for (const f of floors) floorId.set(f.key, fresh(slug(f.name, `floor-${floorId.size + 1}`)))
  // CNT-59: each floor's storey's GlobalId and Name, by the floor's id.
  const floorIdentities = (): Record<string, Identity> => {
    const out: Record<string, Identity> = {}
    for (const f of floors) {
      const own = identityFrom(f.source, f.kept)
      if (own !== null) out[floorId.get(f.key)!] = own
    }
    return out
  }
  if (floors.length > 0) {
    assumed.push(`Each storey's level is its place counted from the one nearest the drawing's zero (${q(floors[ground!.i]!.name)}, level 0), and its elevation is measured from that one's.`)
  }

  // Rooms, floor by floor.
  const lines: string[] = [
    `# Read from ${file} by grid write --from. Check it and change any line, then write it again with grid write.`,
    `# Units: ${drawing.unit.name}${drawing.unit.from === 'file' ? ', as the file states' : drawing.unit.from === 'asked' ? ', as asked' : ', guessed from its size'}. Every length below is in metres.`,
  ]
  for (const l of drawing.layers) lines.push(`# ${drawing.format === 'dxf' ? 'Layer' : 'Class'} ${l.layer} (${l.entities}): ${l.readAs === 'nothing' ? 'not read' : `read as ${l.readAs}`}${l.why === 'name' ? ', by its name' : l.why === 'asked' ? ', as asked' : l.why === 'content' ? ', by what it holds' : ''}.`)
  const floorKeys = floors.length === 0 ? [''] : floors.map((f) => f.key)
  const placed: Placed[] = []
  const roomChecks: { id: string; name: string; floor: string; drawn: number; stated: number | null; source: string | null }[] = []
  const roomIdentities: Record<string, Identity> = {}
  let unnamed = 0
  let noUse = 0
  const defaultOutside = WALL_DEFAULTS.solid.thickness
  let usedDefault = false
  const wallsLine = (key: string): string => {
    const t = drawing.outside.get(key)
    if (t === undefined) usedDefault = true
    const height = drawing.wallHeight === null ? '' : ` height ${m(drawing.wallHeight)}`
    return `walls outside ${m(t ?? defaultOutside)} inside 0.1${height}`
  }
  const openingLinesAt = new Map<string, number>()
  for (const key of floorKeys) {
    const f = floors.find((x) => x.key === key)
    if (f !== undefined) {
      const level = floors.indexOf(f) - ground!.i
      const elevation = (f.elevation ?? 0) - (floors[ground!.i]!.elevation ?? 0)
      // The slab under it: what the storey below leaves between its ceiling and this floor.
      const below = floors[floors.indexOf(f) - 1]
      const slab = below === undefined || below.height === null || below.elevation === null || f.elevation === null ? null : f.elevation - below.elevation - below.height
      const slabWords = slab !== null && slab > 0.01 && slab < 1 ? ` slab ${m(slab)}` : ''
      lines.push(`floor ${floorId.get(key)} ${q(f.name)} level ${level} elevation ${m(elevation)}${f.height === null ? '' : ` height ${m(f.height)}`}${slabWords}`)
    }
    lines.push(wallsLine(key))
    const here = drawing.rooms.filter((r) => r.floor === key)
    const mine: Placed[] = []
    for (const r of here) {
      const name = r.name ?? `Room ${++unnamed}`
      const id = fresh(slug(r.name ?? '', 'room'))
      const use = roomUseOf(r.use ?? null) ?? roomUseOf(r.name)
      if (use === null) noUse++
      const ring = signedArea(r.outline) < 0 ? [...r.outline].reverse() : [...r.outline]
      // A room whose outline touches one written before it is open to it: a dividing line, no wall.
      const touching = mine.find((o) => touches(o.outline, ring))
      const pts = ring.map((p) => `${m(p[0])},${m(p[1])}`).join(' ')
      const number = r.number !== null && !/["\\]/.test(r.number) ? ` number ${q(r.number)}` : ''
      const fact = r.source === null ? '' : ` facts ${factName}=${q(r.source)}`
      lines.push(`room ${id} ${q(name)} ${use ?? '-'} polygon ${pts}${touching === undefined ? '' : ` open ${touching.id}`}${number}${fact}`)
      const p: Placed = { id, floor: key, outline: ring }
      mine.push(p)
      roomChecks.push({ id, name, floor: f === undefined ? '' : floorId.get(key)!, drawn: Math.abs(signedArea(ring)), stated: r.statedArea, source: r.source })
      const own = identityFrom(r.source, r.kept)
      if (own !== null) roomIdentities[id] = own
    }
    placed.push(...mine)
    openingLinesAt.set(key, lines.length)
  }
  if (usedDefault) assumed.push(`The drawing shows no outside face beside a room${floors.length > 1 ? ' on some floors' : ''}, so the outside walls are Grid's usual ${defaultOutside} m.`)
  if (drawing.wallHeight === null) assumed.push(`The drawing gives no wall height: the walls are Grid's usual ${WALL_DEFAULTS.solid.height} m high${floors.length > 0 ? ', or their floor\'s height' : ''}.`)
  if (noUse > 0) assumed.push(`${count(noUse, 'room')} ${noUse === 1 ? 'has' : 'have'} a name that plainly means no use: written with none (-). Give each its use on its line.`)

  // The rooms alone first, for the walls the openings go in.
  const roomsOnly = compileRoomsText(lines.join('\n'))
  const kinds = new Map<string, number>()
  const openingIds = drawing.openings.map((o) => {
    kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + 1)
    return fresh(`${o.kind}-${kinds.get(o.kind)}`)
  })
  if (roomsOnly.plan === null) {
    // The rooms do not write: the openings are kept as comments, with where the drawing has them.
    const notes = drawing.openings.map((o, i) => `# ${o.kind} ${openingIds[i]} at ${m(o.at[0])},${m(o.at[1])}, ${m(o.width)} wide${o.source === null ? '' : ` (${factName} ${o.source})`}: placed once the rooms write.`)
    const text = [...lines, ...notes].join('\n') + '\n'
    return {
      text,
      result: roomsOnly,
      rooms: roomChecks.map((r) => ({ ...r, area: Number.NaN })),
      openings: drawing.openings.map((o, i) => ({ id: openingIds[i]!, kind: o.kind, source: o.source, written: 'not placed' as const, wall: null, off: null })),
      facts: { walls: {}, openings: {} },
      factName,
      identities: drawing.format === 'ifc' ? { ...NO_IDENTITIES, rooms: roomIdentities, floors: floorIdentities() } : NO_IDENTITIES,
      assumed,
      leftOut,
    }
  }
  const plan = roomsOnly.plan
  const wallFloor = (w: { floor?: string | undefined }): string => w.floor ?? ''
  const floorKeyOfId = new Map([...floorId].map(([k, id]) => [id, k] as const))
  const straight = plan.walls.filter((w) => w.arc === undefined && (w.thickness ?? 0) > 0)

  interface Want {
    readonly o: DrawnOpening
    readonly id: string
    readonly wall: (typeof straight)[number] | null
    line: string | null
    raw: boolean
  }
  const wants: Want[] = drawing.openings.map((o, i) => {
    const id = openingIds[i]!
    const candidates = straight
      .filter((w) => (floors.length === 0 ? true : floorKeyOfId.get(wallFloor(w)) === o.floor))
      .map((w) => {
        const u = unit(sub(w.end, w.start))
        const L = dist(w.start, w.end)
        const along = dot(sub(o.at, w.start), u)
        const across = Math.abs(cross(u, sub(o.at, w.start)))
        const turned = o.along === null ? 0 : Math.abs(cross(u, o.along))
        return { w, along, across, L, ok: across <= (w.thickness ?? 0) / 2 + 0.15 && along >= -0.05 && along <= L + 0.05 && turned < 0.1 }
      })
      .filter((c) => c.ok)
      .sort((a, b) => a.across - b.across)
    return { o, id, wall: candidates[0]?.w ?? null, line: null, raw: false }
  })
  const lineOf = (want: Want, raw: boolean): string | null => {
    const { o, id, wall } = want
    if (wall === null) return null
    const u = unit(sub(wall.end, wall.start))
    const L = dist(wall.start, wall.end)
    const t = wall.thickness ?? 0
    const width = Math.min(o.width, L)
    const height = o.height ?? (o.kind === 'window' ? WINDOW_HEIGHT : DOOR_HEIGHT)
    const sill = o.kind === 'window' ? (o.sill ?? WINDOW_SILL) : (o.sill ?? 0)
    if (raw) {
      const offset = Math.min(Math.max(dot(sub(o.at, wall.start), u) - width / 2, 0), Math.max(L - width, 0))
      return `raw opening ${JSON.stringify({ id, wall: wall.id, type: o.kind, offset: Number(m(offset)), width: Number(m(width)), sill: Number(m(sill)), height: Number(m(height)) })}`
    }
    // The rooms either side: those with a side along this wall where the opening stands.
    const near = placed
      .filter((r) => r.floor === o.floor || floors.length === 0)
      .flatMap((r) => {
        let best: { e: [P, P]; d: number } | null = null
        r.outline.forEach((p, k) => {
          const qq = r.outline[(k + 1) % r.outline.length]!
          const ue = unit(sub(qq, p))
          if (Math.abs(cross(ue, u)) > 0.1) return
          const s = dot(sub(o.at, p), ue)
          if (s < -0.05 || s > dist(p, qq) + 0.05) return
          const d = Math.abs(cross(ue, sub(o.at, p)))
          if (d > t / 2 + 0.05) return
          if (best === null || d < best.d) best = { e: [p, qq], d }
        })
        return best === null ? [] : [{ r, e: (best as { e: [P, P] }).e, d: (best as { d: number }).d }]
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
    if (near.length === 0) return null
    const A = near[0]!
    const [p, qq] = A.e
    const ue = unit(sub(qq, p))
    const from = ['north', 'south', 'east', 'west'].reduce((best, k) => (dot(ue, COMPASS[k]!) < dot(ue, COMPASS[best]!) ? k : best), 'west')
    const d = dot(sub(o.at, p), ue) - width / 2
    let where: string
    if (near.length === 2) where = `between ${A.r.id} and ${near[1]!.r.id}`
    else {
      // The side's word as the compiler counts it: the sides facing that way, from the west, then the south.
      const n: P = [ue[1], -ue[0]]
      const side = compassOf(n)
      const ring = A.r.outline
      const hits = ring
        .map((pp, k) => [pp, ring[(k + 1) % ring.length]!] as const)
        .filter(([a, b]) => {
          const v = unit(sub(b, a))
          return dot([v[1], -v[0]], COMPASS[side]!) > 0.9
        })
        .sort((x, y) => x[0][0] + x[1][0] - (y[0][0] + y[1][0]) || x[0][1] + x[1][1] - (y[0][1] + y[1][1]))
      const k = hits.findIndex(([a, b]) => dist(a, p) < tolerance('sameFace') && dist(b, qq) < tolerance('sameFace'))
      where = `in ${A.r.id} ${hits.length > 1 ? `${side}.${k + 1}` : side}`
    }
    const extra = `${o.kind === 'window' && o.sill !== null ? `, sill ${m(sill)}` : ''}${o.height === null ? '' : `, height ${m(height)}`}`
    return `${o.kind} ${id} ${where}, ${m(Math.max(d, 0))} from ${from}, ${m(width)} wide${extra}`
  }
  for (const want of wants) want.line = lineOf(want, false)

  // Compile the whole text, writing raw each opening the compile refuses or places off the drawing.
  const textWith = (): { text: string; lineOfWant: Map<number, Want> } => {
    const out: string[] = []
    const lineOfWant = new Map<number, Want>()
    let last = 0
    for (const key of floorKeys) {
      const end = openingLinesAt.get(key)!
      out.push(...lines.slice(last, end))
      for (const want of wants) {
        if (want.line === null || (floors.length > 0 && want.o.floor !== key)) continue
        out.push(want.line)
        lineOfWant.set(out.length, want)
      }
      last = end
    }
    return { text: out.join('\n') + '\n', lineOfWant }
  }
  let result = roomsOnly
  let text = ''
  for (let round = 0; round < 4; round++) {
    const made = textWith()
    text = made.text
    result = compileRoomsText(text)
    const wrong = new Set<Want>()
    for (const p of result.problems) {
      const want = p.line === null ? undefined : made.lineOfWant.get(p.line)
      if (want !== undefined) wrong.add(want)
    }
    if (result.plan !== null) {
      for (const want of wants) {
        if (want.line === null || want.wall === null) continue
        const op = result.plan.openings.find((x) => x.id === want.id)
        if (op === undefined) continue
        const w = result.plan.walls.find((x) => x.id === op.wall)
        if (w === undefined || w.id !== want.wall.id) {
          wrong.add(want)
          continue
        }
        const u = unit(sub(w.end, w.start))
        const at = add(w.start, mul(u, op.offset + op.width / 2))
        if (Math.abs(dot(sub(at, want.o.at), u)) > PLACED_OFF) wrong.add(want)
      }
    }
    if (wrong.size === 0) break
    for (const want of wrong) {
      if (want.raw) want.line = null
      else {
        want.raw = true
        want.line = lineOf(want, true)
      }
    }
  }

  // What was placed, and how far from the drawing.
  const openingChecks: OpeningCheck[] = wants.map((want) => {
    const op = result.plan?.openings.find((x) => x.id === want.id)
    if (want.line === null || op === undefined) return { id: want.id, kind: want.o.kind, source: want.o.source, written: 'not placed', wall: null, off: null }
    const w = result.plan!.walls.find((x) => x.id === op.wall)!
    const u = unit(sub(w.end, w.start))
    const at = add(w.start, mul(u, op.offset + op.width / 2))
    return { id: want.id, kind: want.o.kind, source: want.o.source, written: want.raw ? 'raw' : 'line', wall: w.id, off: Math.abs(dot(sub(at, want.o.at), u)) }
  })
  const raws = openingChecks.filter((o) => o.written === 'raw').length
  if (raws > 0) assumed.push(`${count(raws, 'opening')} could not be written by the rooms either side and the place the drawing gives: written raw on ${raws === 1 ? 'its' : 'their'} wall, by its id, at the drawn place.`)
  const lost = openingChecks.filter((o) => o.written === 'not placed')
  if (lost.length > 0) leftOut.push(`${count(lost.length, 'door, window or opening', 'doors, windows or openings')} on no wall Grid worked out from the rooms: ${lost.slice(0, 10).map((o) => `${o.id}${o.source === null ? '' : ` (${factName} ${o.source})`}`).join(', ')}${lost.length > 10 ? ` and ${lost.length - 10} more` : ''}.`)

  // The walls' sources, by where they stand.
  const wallFacts: Record<string, Record<string, string>> = {}
  // CNT-59: the Grid walls each drawn wall is under, with their lengths, for its identity.
  const under = new Map<string, { id: string; length: number }[]>()
  if (result.plan !== null) {
    for (const w of result.plan.walls) {
      if (w.arc !== undefined || (w.thickness ?? 0) <= 0) continue
      const key = floors.length === 0 ? '' : floorKeyOfId.get(wallFloor(w))
      const u = unit(sub(w.end, w.start))
      const L = dist(w.start, w.end)
      const t = w.thickness ?? 0
      const mid = add(w.start, mul(u, L / 2))
      const sources = new Set<string>()
      for (const dw of drawing.walls) {
        if (dw.floor !== key) continue
        if (dw.footprint !== null) {
          if (inside(dw.footprint, mid) || inside(dw.footprint, add(w.start, mul(u, L / 4))) || inside(dw.footprint, add(w.start, mul(u, (3 * L) / 4)))) sources.add(dw.source)
          continue
        }
        for (const [a, b] of dw.faces) {
          const v = sub(b, a)
          if (len(v) < 0.05 || Math.abs(cross(u, unit(v))) > 0.02) continue
          if (Math.abs(cross(u, sub(a, w.start))) > t / 2 + 0.02) continue
          const [s0, s1] = [dot(sub(a, w.start), u), dot(sub(b, w.start), u)].sort((x, y) => x - y) as [number, number]
          if (Math.min(L, s1) - Math.max(0, s0) > 0.05) {
            sources.add(dw.source)
            break
          }
        }
        if (sources.size >= WALL_SOURCES_MAX) break
      }
      if (sources.size > 0) wallFacts[w.id] = { [factName]: [...sources].join(' ') }
      for (const source of sources) under.set(source, [...(under.get(source) ?? []), { id: w.id, length: L }])
    }
  }
  const openingFacts: Record<string, Record<string, string>> = {}
  for (const o of openingChecks) if (o.source !== null && o.written !== 'not placed') openingFacts[o.id] = { [factName]: o.source }

  // CNT-59: what the IFC file calls each part. A drawn wall's goes to the longest Grid wall under
  // it that keeps none yet, so a GlobalId is kept once.
  const wallIdentities: Record<string, Identity> = {}
  const openingIdentities: Record<string, Identity> = {}
  if (drawing.format === 'ifc') {
    for (const dw of drawing.walls) {
      const own = identityFrom(dw.source, dw.kept)
      const free = (under.get(dw.source) ?? []).filter((w) => wallIdentities[w.id] === undefined).sort((a, b) => b.length - a.length)
      if (own !== null && free.length > 0) wallIdentities[free[0]!.id] = own
    }
    wants.forEach((want, i) => {
      const own = identityFrom(want.o.source, want.o.kept)
      if (own !== null && openingChecks[i]!.written !== 'not placed') openingIdentities[want.id] = own
    })
  }

  const areaOf = new Map((result.plan === null ? [] : result.rooms).map((r) => [r.id, r.area] as const))
  return {
    text,
    result,
    rooms: roomChecks.map((r) => ({ ...r, area: areaOf.get(r.id) ?? Number.NaN })),
    openings: openingChecks,
    facts: { walls: wallFacts, openings: openingFacts },
    factName,
    identities: drawing.format === 'ifc' ? { walls: wallIdentities, openings: openingIdentities, rooms: roomIdentities, floors: floorIdentities() } : NO_IDENTITIES,
    assumed,
    leftOut,
  }
}

/** Whether two counter-clockwise outlines touch: a side of one runs along a side of the other, closer than `TOUCH`. */
function touches(a: readonly P[], b: readonly P[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    const pq = a[(i + 1) % a.length]!
    const u = unit(sub(pq, p))
    const L = dist(p, pq)
    for (let j = 0; j < b.length; j++) {
      const r = b[j]!
      const rs = b[(j + 1) % b.length]!
      const v = unit(sub(rs, r))
      if (dot(u, v) > -0.999) continue
      if (Math.abs(cross(u, sub(r, p))) > TOUCH) continue
      const [s0, s1] = [dot(sub(r, p), u), dot(sub(rs, p), u)].sort((x, y) => x - y) as [number, number]
      if (Math.min(L, s1) - Math.max(0, s0) > 0.05) return true
    }
  }
  return false
}
