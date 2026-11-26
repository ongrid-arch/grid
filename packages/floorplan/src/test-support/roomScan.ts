/**
 * HND-12: phone room scans for the tests, made here from Grid's own numbers.
 *
 * A scan is built as Apple's room model lays one out (see `scan/roomModel.ts` for the shape in
 * Grid's words): every wall face, door, window, floor outline and object as a surface with an
 * identifier, its dimensions, a 4 by 4 transform written column by column, a category and a
 * confidence. Nothing here is copied from a real scan, a sample file or documentation: the
 * rooms, sizes and ids are invented, and so is the flat. A real scan can hold a home's layout,
 * which is personal; these hold no one's.
 *
 * The rooms are given as rectangles of their inside faces on a plan (x across, y up the
 * drawing); the scan is then turned by `heading` degrees about the vertical and moved by `at`,
 * as a phone's own frame would leave it.
 */

type P = readonly [number, number]
type P3 = readonly [number, number, number]

export interface InventedRoom {
  readonly name: string
  /** The inside faces: west, south, east and north. */
  readonly box: readonly [number, number, number, number]
  /** A room type as a scan writes it, for a section; null for none. */
  readonly label?: string | null
  readonly height?: number
}

export interface InventedOpening {
  readonly name: string
  readonly kind: 'door' | 'window' | 'opening'
  /** The face it is in, as `<room>-<side>`; null to name no wall. */
  readonly face: string | null
  /** Its middle, metres along the face from the face's start. */
  readonly along: number
  readonly width: number
  readonly height: number
  /** Its bottom above the floor. */
  readonly bottom: number
}

export interface InventedObject {
  readonly name: string
  readonly category: string
  readonly at: P
  /** Width along its back and depth. */
  readonly size: P
  readonly height: number
  /** Degrees counter-clockwise on the plan. */
  readonly turn: number
}

export interface InventedScanOptions {
  readonly rooms: readonly InventedRoom[]
  readonly openings?: readonly InventedOpening[]
  readonly objects?: readonly InventedObject[]
  /** Degrees the phone's frame is turned from the plan, about the vertical. */
  readonly heading?: number
  /** Where the plan's 0,0 is in the phone's frame: x and z. */
  readonly at?: P
  /** The floor's level in the phone's frame (the phone starts at about chest height). */
  readonly floorLevel?: number
  /** Whether each room gives its floor outline (newer captures), and its section. */
  readonly floors?: boolean
  readonly sections?: boolean
  /** Write each transform as four columns of four, not sixteen numbers. */
  readonly columns?: boolean
  /** Faces to leave out, as `<room>-<side>`. */
  readonly without?: readonly string[]
  /** Faces turned this many degrees about their middles, as `<room>-<side>`. */
  readonly skew?: Readonly<Record<string, number>>
}

export interface InventedScan {
  /** The scan as parsed JSON, shaped like Apple's room model. */
  readonly json: Record<string, unknown>
  /** The identifier of each surface, by its name here: `<room>-<side>`, `<room>-floor`, an opening's or object's name, and `capture`. */
  readonly ids: Readonly<Record<string, string>>
}

/** A made-up identifier in the shape of one, the same for the same name and count. */
function idFor(n: number): string {
  const hex = n.toString(16).toUpperCase().padStart(12, '0')
  return `5CA1AB1E-0000-4000-8000-${hex}`
}

const word = (w: string): Record<string, Record<string, never>> => ({ [w]: {} })

export const SIDES = ['south', 'east', 'north', 'west'] as const

/** A room's faces, round it counter-clockwise: south, east, north, west. */
export function facesOf(box: InventedRoom['box']): Record<(typeof SIDES)[number], [P, P]> {
  const [w, s, e, n] = box
  return { south: [[w, s], [e, s]], east: [[e, s], [e, n]], north: [[e, n], [w, n]], west: [[w, n], [w, s]] }
}

/** Builds a scan of invented rooms. */
export function inventedScan(options: InventedScanOptions): InventedScan {
  const heading = ((options.heading ?? 0) * Math.PI) / 180
  const [ax, az] = options.at ?? [0, 0]
  const floorLevel = options.floorLevel ?? 0
  const [c, s] = [Math.cos(heading), Math.sin(heading)]
  // The plan's (x, y) is the frame's (x, -z) before the turn.
  const turnVec = (v: P3): P3 => [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]
  const at = (p: P, up: number): P3 => {
    const v = turnVec([p[0], up, -p[1]])
    return [v[0] + ax, v[1], v[2] + az]
  }
  const dirOf = (d: P): P3 => turnVec([d[0], 0, -d[1]])
  const crossV = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const matrix = (x: P3, y: P3, z: P3, o: P3): number[] | number[][] => {
    const cols = [[...x, 0], [...y, 0], [...z, 0], [...o, 1]]
    return options.columns === true ? cols : cols.flat()
  }
  let n = 0
  const ids: Record<string, string> = {}
  const id = (name: string): string => (ids[name] ??= idFor(++n))
  id('capture')
  const faces = new Map<string, { a: P; b: P }>()
  const walls: unknown[] = []
  for (const room of options.rooms) {
    const height = room.height ?? 2.5
    const sides = facesOf(room.box)
    SIDES.forEach((side, k) => {
      const name = `${room.name}-${side}`
      if (options.without?.includes(name)) return
      let [a, b] = sides[side]
      // Every other face runs the other way: a scan's faces have no set direction.
      if (k % 2 === 1) [a, b] = [b, a]
      const skew = options.skew?.[name]
      if (skew !== undefined) {
        const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const t = (skew * Math.PI) / 180
        const turn = (p: P): P => [m[0] + Math.cos(t) * (p[0] - m[0]) - Math.sin(t) * (p[1] - m[1]), m[1] + Math.sin(t) * (p[0] - m[0]) + Math.cos(t) * (p[1] - m[1])]
        ;[a, b] = [turn(a), turn(b)]
      }
      faces.set(name, { a, b })
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      const x = dirOf([(b[0] - a[0]) / length, (b[1] - a[1]) / length])
      const y: P3 = [0, 1, 0]
      walls.push({
        identifier: id(name),
        category: word('wall'),
        confidence: word('high'),
        dimensions: [length, height, 0],
        transform: matrix(x, y, crossV(x, y), at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], floorLevel + height / 2)),
        parentIdentifier: null,
        polygonCorners: [],
        story: 0,
      })
    })
  }
  const lists: Record<'doors' | 'windows' | 'openings', unknown[]> = { doors: [], windows: [], openings: [] }
  for (const o of options.openings ?? []) {
    const face = o.face === null ? null : faces.get(o.face)
    if (o.face !== null && face === undefined) throw new Error(`no face ${o.face}`)
    // An opening naming no wall still stands on the face it was made from, here the first room's south.
    const host = face ?? faces.values().next().value!
    const length = Math.hypot(host.b[0] - host.a[0], host.b[1] - host.a[1])
    const u: P = [(host.b[0] - host.a[0]) / length, (host.b[1] - host.a[1]) / length]
    const middle: P = [host.a[0] + u[0] * o.along, host.a[1] + u[1] * o.along]
    const x = dirOf(u)
    const y: P3 = [0, 1, 0]
    const list = o.kind === 'door' ? 'doors' : o.kind === 'window' ? 'windows' : 'openings'
    lists[list].push({
      identifier: id(o.name),
      category: o.kind === 'door' ? { door: { isOpen: false } } : word(o.kind),
      confidence: word('medium'),
      dimensions: [o.width, o.height, 0],
      transform: matrix(x, y, crossV(x, y), at(middle, floorLevel + o.bottom + o.height / 2)),
      parentIdentifier: o.face === null ? null : id(o.face),
      polygonCorners: [],
      story: 0,
    })
  }
  const objects = (options.objects ?? []).map((o) => {
    const t = (o.turn * Math.PI) / 180
    const x = dirOf([Math.cos(t), Math.sin(t)])
    const y: P3 = [0, 1, 0]
    return {
      identifier: id(o.name),
      category: word(o.category),
      confidence: word('high'),
      dimensions: [o.size[0], o.height, o.size[1]],
      transform: matrix(x, y, crossV(x, y), at(o.at, floorLevel + o.height / 2)),
      parentIdentifier: null,
      story: 0,
    }
  })
  const json: Record<string, unknown> = { identifier: ids['capture'], version: 2, walls, ...lists, objects }
  if (options.floors !== false) {
    json['floors'] = options.rooms.map((room) => {
      const [w, s, e, nn] = room.box
      const middle: P = [(w + e) / 2, (s + nn) / 2]
      const x = dirOf([1, 0])
      const y = dirOf([0, 1])
      return {
        identifier: id(`${room.name}-floor`),
        category: word('floor'),
        confidence: word('high'),
        dimensions: [e - w, nn - s, 0],
        transform: matrix(x, y, crossV(x, y), at(middle, floorLevel)),
        parentIdentifier: null,
        polygonCorners: [[w - middle[0], s - middle[1], 0], [e - middle[0], s - middle[1], 0], [e - middle[0], nn - middle[1], 0], [w - middle[0], nn - middle[1], 0]],
        story: 0,
      }
    })
  }
  if (options.sections !== false) {
    json['sections'] = options.rooms
      .filter((room) => room.label !== undefined && room.label !== null)
      .map((room) => ({ label: word(room.label!), center: at([(room.box[0] + room.box[2]) / 2, (room.box[1] + room.box[3]) / 2], floorLevel), story: 0 }))
  }
  return { json, ids }
}

/**
 * An invented flat: a living room and a bedroom side by side, a hall and a long bathroom behind
 * them. Its walls inside are 0.1 and 0.12 m thick, the gaps between the rooms' faces.
 */
export const INVENTED_FLAT: InventedScanOptions = {
  rooms: [
    { name: 'living', box: [0, 0, 4, 4], label: 'livingRoom' },
    { name: 'bedroom', box: [4.1, 0, 7.3, 4], label: 'bedroom' },
    { name: 'hall', box: [0, 4.12, 2.4, 5.6], label: 'unidentified' },
    { name: 'bathroom', box: [2.52, 4.12, 7.3, 5.6], label: 'bathroom' },
  ],
  openings: [
    { name: 'front-door', kind: 'door', face: 'hall-west', along: 0.74, width: 0.9, height: 2.05, bottom: 0 },
    { name: 'living-door', kind: 'door', face: 'hall-south', along: 1.2, width: 0.8, height: 2.0, bottom: 0 },
    { name: 'bedroom-door', kind: 'door', face: 'living-east', along: 3.0, width: 0.8, height: 2.0, bottom: 0 },
    { name: 'bathroom-door', kind: 'door', face: 'bathroom-west', along: 0.74, width: 0.7, height: 2.0, bottom: 0 },
    { name: 'living-window', kind: 'window', face: 'living-south', along: 2.0, width: 1.6, height: 1.3, bottom: 0.9 },
    { name: 'bedroom-window', kind: 'window', face: 'bedroom-east', along: 2.0, width: 1.2, height: 1.2, bottom: 0.95 },
  ],
  objects: [
    { name: 'toilet', category: 'toilet', at: [6.9, 5.1], size: [0.38, 0.68], height: 0.8, turn: 90 },
    { name: 'bath', category: 'bathtub', at: [4.6, 5.2], size: [1.7, 0.75], height: 0.55, turn: 180 },
    { name: 'bed', category: 'bed', at: [5.7, 2.4], size: [1.6, 2.0], height: 0.5, turn: 0 },
    { name: 'sofa', category: 'sofa', at: [2.0, 2.0], size: [2.0, 0.9], height: 0.8, turn: 180 },
  ],
  heading: 31.7,
  at: [1.234, -2.5],
  floorLevel: -1.32,
}
