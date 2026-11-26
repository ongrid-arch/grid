/**
 * CMD-43: an IFC file read for its rooms (`Drawing`, `model.ts`), from its STEP records
 * (`step.ts`).
 *
 * What is read:
 *
 * - The length unit: `IFCSIUNIT` with its prefix (millimetres, centimetres, metres), or a
 *   conversion of one (feet, inches).
 * - Where each part is: its `IFCLOCALPLACEMENT`s composed down to the world's frame.
 * - The storeys (`IFCBUILDINGSTOREY`), each with its name and elevation.
 * - The spaces (`IFCSPACE`) as rooms: each footprint from its body (an extruded profile: a
 *   polyline, an indexed poly curve, a composite of them, a rectangle or a circle; a clipped body
 *   by the body it clips) or its `FootPrint` curve, its long name as the room's name and its name
 *   as the room's number when the two differ, and the depth of its body as its storey's height.
 * - The walls (`IFCWALL`, `IFCWALLSTANDARDCASE`, `IFCWALLELEMENTEDCASE`) by their footprints,
 *   for the outside walls' thickness and their GlobalIds; and, on a storey with no spaces, the
 *   rooms the walls close round (`faces.ts`).
 * - The doors and windows by their placement, `OverallWidth` and `OverallHeight`, the sill from
 *   their height above their storey; a doorless opening in a wall (`IFCOPENINGELEMENT` filled by
 *   nothing, at least door high) by its body.
 * - Which storey holds each part: `IFCRELCONTAINEDINSPATIALSTRUCTURE`, `IFCRELAGGREGATES`, a door
 *   through the opening it fills and the wall that opening is cut in, else the storey below it.
 *
 * Pure: the file's text in, a drawing out. Refuses with `DrawingRefused`.
 */
import { roomsFromFaces, type FaceSegment } from './faces'
import { arcPoints, count, dist, DrawingRefused, signedArea, tidyRing, type DrawnFloor, type DrawnOpening, type DrawnRoom, type DrawnWall, type Drawing, type LayerUse, type P } from './model'
import { readStep, type StepRecord, type StepValue } from './step'

type V3 = readonly [number, number, number]
/** A frame: its origin and its three axes, in the world's frame. */
interface Frame {
  readonly o: V3
  readonly x: V3
  readonly y: V3
  readonly z: V3
}
const WORLD: Frame = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
const v3add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const v3mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const v3dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const v3cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const v3unit = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2])
  return n === 0 ? [0, 0, 1] : [a[0] / n, a[1] / n, a[2] / n]
}
/** A point of `inner`'s frame in `outer`'s. */
const at = (f: Frame, p: V3): V3 => v3add(f.o, v3add(v3mul(f.x, p[0]), v3add(v3mul(f.y, p[1]), v3mul(f.z, p[2]))))
const turn = (f: Frame, v: V3): V3 => v3add(v3mul(f.x, v[0]), v3add(v3mul(f.y, v[1]), v3mul(f.z, v[2])))
const within = (outer: Frame, inner: Frame): Frame => ({ o: at(outer, inner.o), x: turn(outer, inner.x), y: turn(outer, inner.y), z: turn(outer, inner.z) })

/** The IFC classes read, and what each is read as, for the answer's map. */
const CLASSES: Readonly<Record<string, LayerUse['readAs']>> = {
  IFCBUILDINGSTOREY: 'names',
  IFCSPACE: 'rooms',
  IFCWALL: 'walls',
  IFCWALLSTANDARDCASE: 'walls',
  IFCWALLELEMENTEDCASE: 'walls',
  IFCDOOR: 'doors',
  IFCDOORSTANDARDCASE: 'doors',
  IFCWINDOW: 'windows',
  IFCWINDOWSTANDARDCASE: 'windows',
  IFCOPENINGELEMENT: 'openings',
}
/** Classes with a place in a building that Grid does not read into rooms text. */
const NOT_READ = ['IFCSLAB', 'IFCCOLUMN', 'IFCBEAM', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAMP', 'IFCROOF', 'IFCCURTAINWALL', 'IFCRAILING', 'IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCMEMBER', 'IFCPLATE', 'IFCCOVERING', 'IFCBUILDINGELEMENTPROXY', 'IFCFLOWTERMINAL', 'IFCSANITARYTERMINAL']

/** The smallest doorless opening read, door high (m). */
const OPENING_HIGHEST_SILL = 0.1
const OPENING_LOWEST = 1.5
/** Curves are cut into straight pieces no further than this from them (m). */
const CURVE_OFF = 0.01

/** An IFC file read for its rooms. */
export function readIfc(text: string): Drawing {
  const records = readStep(text)
  const get = (v: StepValue | undefined): StepRecord | null => (v?.kind === 'ref' ? (records.get(v.value) ?? null) : null)
  const str = (v: StepValue | undefined): string | null => (v?.kind === 'string' ? v.value : v?.kind === 'typed' && v.value[0]?.kind === 'string' ? v.value[0].value : null)
  const numOf = (v: StepValue | undefined): number | null => (v?.kind === 'number' ? v.value : v?.kind === 'typed' && v.value[0]?.kind === 'number' ? v.value[0].value : null)
  const listOf = (v: StepValue | undefined): readonly StepValue[] => (v?.kind === 'list' ? v.value : [])
  const byType = (...types: string[]): StepRecord[] => [...records.values()].filter((r) => types.includes(r.type))
  if (byType('IFCPROJECT').length === 0) throw new DrawingRefused('drawing/not-read', 'This STEP file holds no IFCPROJECT, so it is not an IFC model Grid can read.')

  // The length unit.
  const prefix: Readonly<Record<string, number>> = { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 }
  const unitScale = (r: StepRecord | null): { scale: number; name: string } | null => {
    if (r === null) return null
    if (r.type === 'IFCSIUNIT' && r.args[1]?.kind === 'enum' && r.args[1].value === 'LENGTHUNIT') {
      const p = r.args[2]?.kind === 'enum' ? r.args[2].value : null
      const scale = p === null ? 1 : (prefix[p] ?? 1)
      return { scale, name: scale === 0.001 ? 'millimetres' : scale === 0.01 ? 'centimetres' : scale === 1 ? 'metres' : `${p?.toLowerCase() ?? ''}metres` }
    }
    if (r.type === 'IFCCONVERSIONBASEDUNIT' && r.args[1]?.kind === 'enum' && r.args[1].value === 'LENGTHUNIT') {
      const measure = get(r.args[3])
      const factor = numOf(measure?.args[0])
      const base = unitScale(get(measure?.args[1]))
      if (factor !== null && base !== null) return { scale: factor * base.scale, name: (str(r.args[2]) ?? 'unit').toLowerCase() }
    }
    return null
  }
  let unit = { scale: 1, name: 'metres', from: 'file' as const }
  for (const assignment of byType('IFCUNITASSIGNMENT')) {
    for (const u of listOf(assignment.args[0])) {
      const found = unitScale(get(u))
      if (found !== null) unit = { ...found, from: 'file' }
    }
  }
  const k = unit.scale

  // Frames.
  const pointOf = (r: StepRecord | null): V3 => {
    const c = listOf(r?.args[0]).map((v) => numOf(v) ?? 0)
    return [(c[0] ?? 0) * k, (c[1] ?? 0) * k, (c[2] ?? 0) * k]
  }
  const dirOf = (r: StepRecord | null, fallback: V3): V3 => {
    if (r === null) return fallback
    const c = listOf(r.args[0]).map((v) => numOf(v) ?? 0)
    return v3unit([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0])
  }
  const axes = (r: StepRecord | null): Frame => {
    if (r === null) return WORLD
    const o = pointOf(get(r.args[0]))
    if (r.type === 'IFCAXIS2PLACEMENT2D') {
      const x = dirOf(get(r.args[1]), [1, 0, 0])
      const x2 = v3unit([x[0], x[1], 0])
      return { o, x: x2, y: [-x2[1], x2[0], 0], z: [0, 0, 1] }
    }
    const z = dirOf(get(r.args[1]), [0, 0, 1])
    const ref = dirOf(get(r.args[2]), Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0])
    const x = v3unit(v3add(ref, v3mul(z, -v3dot(ref, z))))
    return { o, x, y: v3cross(z, x), z }
  }
  const placed = new Map<number, Frame>()
  const placementOf = (r: StepRecord | null, depth = 0): Frame => {
    if (r === null || depth > 64) return WORLD
    const known = placed.get(r.id)
    if (known !== undefined) return known
    let f = WORLD
    if (r.type === 'IFCLOCALPLACEMENT') f = within(placementOf(get(r.args[0]), depth + 1), axes(get(r.args[1])))
    placed.set(r.id, f)
    return f
  }

  // Curves and profiles, as rings in their own frame (metres).
  const ring2 = (pts: readonly V3[]): P[] => pts.map((p) => [p[0], p[1]] as const)
  const curve = (r: StepRecord | null, depth = 0): P[] | null => {
    if (r === null || depth > 16) return null
    switch (r.type) {
      case 'IFCPOLYLINE':
        return ring2(listOf(r.args[0]).map((v) => pointOf(get(v))))
      case 'IFCINDEXEDPOLYCURVE': {
        const list = get(r.args[0])
        const coords = listOf(list?.args[0]).map((v) => {
          const c = listOf(v).map((x) => (numOf(x) ?? 0) * k)
          return [c[0] ?? 0, c[1] ?? 0] as const
        })
        const segments = listOf(r.args[1])
        if (segments.length === 0) return coords
        const out: P[] = []
        for (const s of segments) {
          if (s.kind !== 'typed') continue
          const idx = listOf(s.value[0]).map((x) => (numOf(x) ?? 1) - 1)
          const pts = idx.map((i) => coords[i]).filter((p): p is P => p !== undefined)
          if (s.type === 'IFCARCINDEX' && pts.length === 3) out.push(...threePointArc(pts[0]!, pts[1]!, pts[2]!).slice(out.length === 0 ? 0 : 1))
          else out.push(...pts.slice(out.length === 0 ? 0 : 1))
        }
        return out
      }
      case 'IFCCOMPOSITECURVE': {
        const out: P[] = []
        for (const s of listOf(r.args[0])) {
          const seg = get(s)
          const parent = curve(get(seg?.args[2]), depth + 1)
          if (parent === null) return null
          const same = seg?.args[1]?.kind === 'enum' ? seg.args[1].value !== 'F' : true
          const pts = same ? parent : [...parent].reverse()
          out.push(...(out.length > 0 && dist(out[out.length - 1]!, pts[0]!) < 1e-6 ? pts.slice(1) : pts))
        }
        return out
      }
      case 'IFCTRIMMEDCURVE': {
        const basis = get(r.args[0])
        if (basis?.type === 'IFCLINE') {
          const ends = [r.args[1], r.args[2]].map((t) => listOf(t).map((v) => get(v)).find((x) => x?.type === 'IFCCARTESIANPOINT') ?? null)
          if (ends[0] === null || ends[1] === null) return null
          return ring2([pointOf(ends[0]!), pointOf(ends[1]!)])
        }
        if (basis?.type !== 'IFCCIRCLE') return null
        const f = axes(get(basis.args[0]))
        const radius = (numOf(basis.args[1]) ?? 0) * k
        const ends = [r.args[1], r.args[2]].map((t) => listOf(t).map((v) => get(v)).find((x) => x?.type === 'IFCCARTESIANPOINT') ?? null)
        if (ends[0] === null || ends[1] === null || !(radius > 0)) return null
        const angle = (p: V3): number => Math.atan2(p[1] - f.o[1], p[0] - f.o[0])
        const [a0, a1] = [angle(pointOf(ends[0]!)), angle(pointOf(ends[1]!))]
        const sense = r.args[3]?.kind === 'enum' ? r.args[3].value !== 'F' : true
        let sweep = a1 - a0
        if (sense && sweep <= 0) sweep += 2 * Math.PI
        if (!sense && sweep >= 0) sweep -= 2 * Math.PI
        return arcPoints([f.o[0], f.o[1]], radius, a0, sweep, CURVE_OFF)
      }
      default:
        return null
    }
  }
  const placed2 = (f: Frame, ring: readonly P[]): P[] => ring.map((p) => {
    const w = at(f, [p[0], p[1], 0])
    return [w[0], w[1]] as const
  })
  const profile = (r: StepRecord | null): P[] | null => {
    if (r === null) return null
    if (r.type === 'IFCARBITRARYCLOSEDPROFILEDEF' || r.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') return curve(get(r.args[2]))
    if (r.type === 'IFCRECTANGLEPROFILEDEF' || r.type === 'IFCRECTANGLEHOLLOWPROFILEDEF') {
      const [x, y] = [(numOf(r.args[3]) ?? 0) * k, (numOf(r.args[4]) ?? 0) * k]
      if (!(x > 0 && y > 0)) return null
      return placed2(axes(get(r.args[2])), [[-x / 2, -y / 2], [x / 2, -y / 2], [x / 2, y / 2], [-x / 2, y / 2]])
    }
    if (r.type === 'IFCCIRCLEPROFILEDEF') {
      const radius = (numOf(r.args[3]) ?? 0) * k
      if (!(radius > 0)) return null
      const pts = arcPoints([0, 0], radius, 0, 2 * Math.PI, CURVE_OFF)
      pts.pop()
      return placed2(axes(get(r.args[2])), pts)
    }
    return null
  }

  /** A solid's footprint in the world's frame, its depth and its lowest point, from a representation item placed in `f`. */
  interface Body {
    ring: P[]
    depth: number
    bottom: number
  }
  const bodyOf = (item: StepRecord | null, f: Frame, depth = 0): Body | null => {
    if (item === null || depth > 16) return null
    if (item.type === 'IFCBOOLEANCLIPPINGRESULT' || item.type === 'IFCBOOLEANRESULT') return bodyOf(get(item.args[1]), f, depth + 1)
    if (item.type === 'IFCMAPPEDITEM') {
      const map = get(item.args[0])
      const origin = axes(get(map?.args[0]))
      const target = get(item.args[1])
      const t: Frame = target === null ? WORLD : { o: pointOf(get(target.args[2])), x: dirOf(get(target.args[0]), [1, 0, 0]), y: dirOf(get(target.args[1]), [0, 1, 0]), z: dirOf(get(target.args[4]), [0, 0, 1]) }
      const rep = get(map?.args[1])
      const bodies = listOf(rep?.args[3]).map((v) => bodyOf(get(v), within(within(f, t), origin), depth + 1)).filter((b): b is Body => b !== null)
      return largest(bodies)
    }
    if (item.type === 'IFCEXTRUDEDAREASOLID') {
      const position = within(f, axes(get(item.args[1])))
      const dir = turn(position, dirOf(get(item.args[2]), [0, 0, 1]))
      if (Math.abs(dir[2]) < 0.99) return null
      const ring = profile(get(item.args[0]))
      if (ring === null || ring.length < 3) return null
      const d = (numOf(item.args[3]) ?? 0) * k
      return { ring: placed2(position, ring), depth: d * Math.abs(dir[2]), bottom: Math.min(position.o[2], position.o[2] + d * dir[2]) }
    }
    if (item.type === 'IFCPOLYLINE' || item.type === 'IFCINDEXEDPOLYCURVE' || item.type === 'IFCCOMPOSITECURVE') {
      const ring = curve(item)
      return ring === null || ring.length < 3 ? null : { ring: placed2(f, ring), depth: 0, bottom: f.o[2] }
    }
    if (item.type === 'IFCGEOMETRICCURVESET' || item.type === 'IFCGEOMETRICSET') return largest(listOf(item.args[0]).map((v) => bodyOf(get(v), f, depth + 1)).filter((b): b is Body => b !== null))
    return null
  }
  const largest = (bodies: readonly Body[]): Body | null => bodies.reduce<Body | null>((best, b) => (best === null || Math.abs(signedArea(b.ring)) > Math.abs(signedArea(best.ring)) ? b : best), null)
  const shapeOf = (product: StepRecord, f: Frame): Body | null => {
    const shape = get(product.args[6])
    const reps = listOf(shape?.args[2]).map((v) => get(v)).filter((r): r is StepRecord => r !== null)
    const body = reps.filter((r) => str(r.args[1]) === 'Body')
    const foot = reps.filter((r) => str(r.args[1]) === 'FootPrint')
    for (const group of [body, foot, reps]) {
      const found = largest(group.flatMap((r) => listOf(r.args[3]).map((v) => bodyOf(get(v), f)).filter((b): b is Body => b !== null)))
      if (found !== null) return found
    }
    return null
  }

  // Storeys, and what each holds.
  const storeys = byType('IFCBUILDINGSTOREY')
  const storeyOf = new Map<number, number>()
  for (const rel of byType('IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
    const s = get(rel.args[5])
    if (s === null) continue
    for (const v of listOf(rel.args[4])) if (v.kind === 'ref') storeyOf.set(v.value, s.id)
  }
  const parentOf = new Map<number, number>()
  for (const rel of byType('IFCRELAGGREGATES')) {
    const parent = get(rel.args[4])
    if (parent === null) continue
    for (const v of listOf(rel.args[5])) if (v.kind === 'ref') parentOf.set(v.value, parent.id)
  }
  const storeyIds = new Set(storeys.map((s) => s.id))
  const upTo = (id: number): number | null => {
    for (let at = id, guard = 0; guard < 32; guard++) {
      if (storeyIds.has(at)) return at
      const s = storeyOf.get(at)
      if (s !== undefined && storeyIds.has(s)) return s
      const p = parentOf.get(at)
      if (p === undefined) return null
      at = p
    }
    return null
  }
  const filledBy = new Map<number, number>()
  for (const rel of byType('IFCRELFILLSELEMENT')) {
    const hole = get(rel.args[4])
    const filler = get(rel.args[5])
    if (hole !== null && filler !== null) filledBy.set(filler.id, hole.id)
  }
  const filled = new Set(filledBy.values())
  const wallOfHole = new Map<number, number>()
  for (const rel of byType('IFCRELVOIDSELEMENT')) {
    const wall = get(rel.args[4])
    const hole = get(rel.args[5])
    if (wall !== null && hole !== null) wallOfHole.set(hole.id, wall.id)
  }
  const storeyFrame = new Map(storeys.map((s) => [s.id, placementOf(get(s.args[5]))] as const))
  const elevationOf = (s: StepRecord): number => {
    const e = numOf(s.args[9])
    return e !== null ? e * k : storeyFrame.get(s.id)!.o[2]
  }
  const byHeight = [...storeys].sort((a, b) => elevationOf(a) - elevationOf(b))
  const storeyFor = (product: StepRecord, z: number): number | null => {
    const direct = upTo(product.id)
    if (direct !== null) return direct
    const hole = filledBy.get(product.id)
    const wall = hole === undefined ? undefined : wallOfHole.get(hole)
    if (wall !== undefined) {
      const viaWall = upTo(wall)
      if (viaWall !== null) return viaWall
    }
    const below = byHeight.filter((s) => elevationOf(s) <= z + 0.1)
    return below.length > 0 ? below[below.length - 1]!.id : (byHeight[0]?.id ?? null)
  }

  const assumed: string[] = []
  const leftOut: string[] = []
  const keyOf = (storey: number | null): string => (storey === null ? 'none' : `#${storey}`)
  const guid = (r: StepRecord): string | null => str(r.args[0])

  // Spaces.
  const rooms: DrawnRoom[] = []
  const spaceHeights = new Map<string, number[]>()
  let spacesNoShape = 0
  for (const s of byType('IFCSPACE')) {
    const f = placementOf(get(s.args[5]))
    const body = shapeOf(s, f)
    if (body === null) {
      spacesNoShape++
      continue
    }
    const storey = storeyFor(s, f.o[2])
    const key = keyOf(storey)
    const name = str(s.args[7]) ?? str(s.args[2])
    const number = str(s.args[7]) !== null && str(s.args[2]) !== null && str(s.args[2]) !== str(s.args[7]) ? str(s.args[2]) : null
    const ring = tidyRing(body.ring, 0.0005)
    if (ring.length < 3) {
      spacesNoShape++
      continue
    }
    rooms.push({ floor: key, outline: ring, name: name === '' ? null : name, number, statedArea: null, use: str(s.args[4]), source: guid(s), from: 'space' })
    if (body.depth > 0) spaceHeights.set(key, [...(spaceHeights.get(key) ?? []), body.depth])
  }
  if (spacesNoShape > 0) leftOut.push(`${count(spacesNoShape, 'space')} whose shape Grid cannot read as a footprint (a boundary representation, or a curve it does not read): not drawn.`)

  // Walls.
  const walls: DrawnWall[] = []
  const wallHeights: number[] = []
  let wallsNoShape = 0
  for (const w of byType('IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE')) {
    const f = placementOf(get(w.args[5]))
    const body = shapeOf(w, f)
    const id = guid(w)
    if (body === null || id === null) {
      wallsNoShape++
      continue
    }
    const storey = storeyFor(w, f.o[2])
    const ring = tidyRing(body.ring, 0.0005)
    walls.push({ floor: keyOf(storey), source: id, faces: ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as const), footprint: ring, height: body.depth > 0 ? body.depth : null })
    if (body.depth > 0) wallHeights.push(body.depth)
  }
  if (wallsNoShape > 0) leftOut.push(`${count(wallsNoShape, 'wall')} whose shape Grid cannot read as a footprint: not used.`)

  // Doors, windows and doorless openings.
  const openings: DrawnOpening[] = []
  let openingsNoSize = 0
  const elevationOfKey = (key: string): number => {
    const s = storeys.find((x) => keyOf(x.id) === key)
    return s === undefined ? 0 : elevationOf(s)
  }
  for (const o of byType('IFCDOOR', 'IFCDOORSTANDARDCASE', 'IFCWINDOW', 'IFCWINDOWSTANDARDCASE')) {
    const f = placementOf(get(o.args[5]))
    const width = (numOf(o.args[9]) ?? 0) * k
    const height = (numOf(o.args[8]) ?? 0) * k
    let centre: V3 = at(f, [width / 2, 0, 0])
    let along: P = [f.x[0], f.x[1]]
    let w = width
    if (!(width > 0)) {
      // No overall width: the footprint of its body, along its x.
      const body = shapeOf(o, f)
      if (body === null) {
        openingsNoSize++
        continue
      }
      const xs = body.ring.map((p) => (p[0] - f.o[0]) * f.x[0] + (p[1] - f.o[1]) * f.x[1])
      w = Math.max(...xs) - Math.min(...xs)
      centre = at(f, [(Math.max(...xs) + Math.min(...xs)) / 2, 0, 0])
      along = [f.x[0], f.x[1]]
    }
    const storey = storeyFor(o, f.o[2])
    const key = keyOf(storey)
    const kind = o.type.startsWith('IFCDOOR') ? 'door' : 'window'
    const sill = Math.max(0, f.o[2] - elevationOfKey(key))
    openings.push({ floor: key, kind, at: [centre[0], centre[1]], along, width: w, height: height > 0 ? height : null, sill: kind === 'window' ? sill : null, source: guid(o), how: 'element' })
  }
  for (const hole of byType('IFCOPENINGELEMENT')) {
    if (filled.has(hole.id) || !wallOfHole.has(hole.id)) continue
    const f = placementOf(get(hole.args[5]))
    const body = shapeOf(hole, f)
    if (body === null) continue
    const storey = storeyFor(hole, f.o[2])
    const key = keyOf(storey)
    if (body.bottom - elevationOfKey(key) > OPENING_HIGHEST_SILL || body.depth < OPENING_LOWEST) continue
    // Its width along the wall: the footprint's longer side.
    const ring = body.ring
    let best: { a: P; b: P } | null = null
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      if (best === null || dist(a, b) > dist(best.a, best.b)) best = { a, b }
    }
    if (best === null) continue
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length
    const L = dist(best.a, best.b)
    openings.push({ floor: key, kind: 'opening', at: [cx, cy], along: [(best.b[0] - best.a[0]) / L, (best.b[1] - best.a[1]) / L], width: L, height: body.depth, sill: null, source: guid(hole), how: 'element' })
  }
  if (openingsNoSize > 0) leftOut.push(`${count(openingsNoSize, 'door or window', 'doors and windows')} with no width Grid can read: not placed.`)

  // Floors: each storey that holds a room.
  const keys = new Set([...rooms.map((r) => r.floor), ...walls.map((w) => w.floor)])
  const floors: DrawnFloor[] = []
  for (const s of byHeight) {
    const key = keyOf(s.id)
    if (!keys.has(key)) continue
    const heights = spaceHeights.get(key) ?? []
    floors.push({ key, name: str(s.args[2]) || str(s.args[7]) || `Storey ${floors.length + 1}`, elevation: elevationOf(s), height: heights.length === 0 ? null : median(heights), source: guid(s) })
  }
  if (keys.has('none')) floors.push({ key: 'none', name: 'No storey', elevation: null, height: null, source: null })
  const empty = storeys.filter((s) => !keys.has(keyOf(s.id))).length
  if (empty > 0) leftOut.push(`${count(empty, 'storey')} holding no space and no wall: no floor written for ${empty === 1 ? 'it' : 'them'}.`)

  // Rooms from the walls of a storey with no spaces, and each storey's outside wall thickness.
  const outside = new Map<string, number>()
  for (const f of floors) {
    const segs: FaceSegment[] = walls.filter((w) => w.floor === f.key).flatMap((w) => w.faces.map(([a, b]) => ({ a, b, source: w.source })))
    if (segs.length === 0) continue
    const theirs = rooms.filter((r) => r.floor === f.key)
    const reading = roomsFromFaces(segs, [])
    if (reading.outside !== null) outside.set(f.key, reading.outside)
    if (theirs.length === 0 && reading.rooms.length > 0) {
      for (const r of reading.rooms) rooms.push({ floor: f.key, outline: tidyRing(r.outline, 0.0005), name: null, number: null, statedArea: null, source: null, from: 'faces' })
      assumed.push(`${q(f.name)} has walls and no spaces: its rooms are the ${count(reading.rooms.length, 'region')} its walls close round, each with no name.`)
    }
  }
  if (rooms.length === 0) throw new DrawingRefused('drawing/no-rooms', `No room was read from the IFC file: it has ${count(byType('IFCSPACE').length, 'space')} and ${count(walls.length, 'wall')} whose footprints Grid can read.`)
  const unnamed = rooms.filter((r) => r.name === null).length
  if (unnamed > 0) assumed.push(`${count(unnamed, 'room')} ${unnamed === 1 ? 'has' : 'have'} no name: named "Room 1" and on, with no use.`)
  if (floors.some((f) => f.height !== null)) assumed.push('Each floor\'s height is the height its spaces are drawn to (the middle one where they differ).')
  const sillsAssumed = openings.filter((o) => o.kind === 'window').length
  if (sillsAssumed > 0) assumed.push('A window\'s sill is how far its placement stands above its storey\'s floor.')

  const counts = new Map<string, number>()
  for (const r of records.values()) if (r.type in CLASSES || NOT_READ.includes(r.type)) counts.set(r.type, (counts.get(r.type) ?? 0) + 1)
  const layers: LayerUse[] = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([layer, entities]) => ({ layer, entities, readAs: layer === 'IFCBUILDINGSTOREY' ? 'names' : (CLASSES[layer] ?? 'nothing'), why: 'class' }))
  const notRead = [...counts].filter(([type]) => NOT_READ.includes(type))
  if (notRead.length > 0) leftOut.push(`Parts rooms text does not write: ${notRead.map(([type, n]) => `${n} ${type}`).join(', ')}.`)
  const wallHeight = wallHeights.length === 0 ? null : median(wallHeights)
  return { format: 'ifc', unit, floors, rooms, openings, walls, outside, wallHeight, layers, assumed, leftOut }
}

const q = (text: string): string => JSON.stringify(text)

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

/** The points of the arc through three points, from the first to the last. */
function threePointArc(a: P, b: P, c: P): P[] {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) < 1e-12) return [a, c]
  const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d
  const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d
  const centre: P = [ux, uy]
  const r = dist(centre, a)
  const ang = (p: P): number => Math.atan2(p[1] - uy, p[0] - ux)
  const [a0, a1, a2] = [ang(a), ang(b), ang(c)]
  const norm = (x: number): number => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  // Counter-clockwise from a to c if b is met on the way, else clockwise.
  const ccw = norm(a1 - a0) < norm(a2 - a0)
  const sweep = ccw ? norm(a2 - a0) : -norm(a0 - a2)
  const pts = arcPoints(centre, r, a0, sweep, CURVE_OFF)
  pts[0] = a
  pts[pts.length - 1] = c
  return pts
}
