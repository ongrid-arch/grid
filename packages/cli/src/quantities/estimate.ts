/**
 * ARE-13: the quantities a first estimate needs, line by line (lab AC-1, AC-6, AC-14).
 *
 * Each line has a key a rates file can price (`rates.ts`), a quantity in m², m or nr, the rule
 * it is measured by in one sentence, and an `assumed` mark when it rests on something the plan
 * does not hold: ceilings, the slab, upper floor structures and the roof. Nothing here is a
 * price, and nothing comes from a price list.
 *
 * Built on the measuring that is already there: the rooms' take-off (`takeoff.ts`: floor,
 * ceiling, skirting and wall face of each room), the areas (`areas.ts`: gross internal per
 * floor), the opening facts (each door and window once, as the schedule counts them) and the
 * library's outlines (`planShell`: the outside face, the slab and the roof). Floor finishes and
 * wall faces are grouped by the room's stated use where the room names no finish (lab AC-4):
 * which finish a use gets is the person's, through the key they price. CNT-15 (C24): a finish a
 * room or a zone names is a line of its own (`floor:finish:<name>`), a wall of a named type is
 * priced by its type (`wall-type:<id>:<thickness>`), and a door or window of one by its type
 * (`door-type:<id>`), so a separating wall is never priced as a partition (lab AC-5).
 *
 * Pure: a survey in, lines out. Nothing here reads a file.
 */
import {
  floorRoofShape,
  openingTypeOf,
  outdoorRoofed,
  planEnvelope,
  planHasFinishes,
  planShell,
  shellKnown,
  tolerance,
  wallJoints,
  wallTypeOf,
  type FloorRoof,
  type RoofShapeOverFloor,
} from '@ongrid/floorplan/geometry'
import { ROOM_USES, type RoomUse } from '@ongrid/floorplan/types/floorplan'
import { AREA_RULES, planAreas } from './areas'
import { finishShares, type FinishSurface } from './finishes'
import type { Survey } from './survey'
import { roomTakeoff, wallFaceOver } from './takeoff'

export type QuantityUnit = 'm2' | 'm' | 'nr'

/** The rule of each kind of line, one sentence each, in Grid's words. */
export const ESTIMATE_RULES = {
  floor: 'Net floor area of the rooms of this use, between their wall faces as grid_areas measures it, so a stair room over a stair room below is counted once, on the floor the stair rises from; the plan holds no finishes, so which finish goes down is the person\'s, by the key they price.',
  ceiling: 'Assumed: a flat ceiling the size of the floor below it in every room but an open outdoor space, because the plan holds no ceilings.',
  wallFinish: 'Each inside side of the rooms of this use times the height of the wall it is on, less every door, window and opening in it at its full size; both faces of an inside wall are counted, dividing lines are not.',
  skirting: 'Each room\'s inside perimeter less the width of every door and doorless opening on it; dividing lines take none.',
  reveals: 'Round each door and window, its two sides and its head, and its sill when it has one, times the thickness of its wall; doorless openings are left out.',
  walls: 'The length of each solid wall of this kind and thickness between the faces of the walls it meets (its centre line where it turns a corner), each wall counted once, times its height (under the roof its floor states, the face the roof leaves it, less the gable part, which is a line of its own), less every opening in it; the kind is the one the plan states.',
  wallType: 'The length of each solid wall of this type the plan names, at this thickness, between the faces of the walls it meets (its centre line where it turns a corner), each wall counted once, times its height (under the roof its floor states, the face the roof leaves it, less the gable part, which is a line of its own), less every opening in it.',
  finish: 'The rooms and zones that name this finish: floor and ceiling by their net area, wall faces by each inside side times its wall\'s height less every opening, skirting by the inside perimeter less doorways; a zone\'s finish is its part of its room.',
  openingType: 'Counted once per opening of this type the plan names; one that states a size of its own is still of its type.',
  externalFinish: 'The outer edge of each floor\'s outline, corners included, times the height of the wall it runs along, less every opening in those walls.',
  wallGable: 'The part of the walls\' faces that the walls of the kinds above leave out because it stands above the lowest their tops reach under the roof their floor states (a gable end\'s triangle), each wall\'s face taken under that roof, less every opening in it.',
  externalGable: 'The part of the outside face that the line above leaves out because it stands above the lowest the outer walls\' tops reach under the roof their floor states (a gable end\'s triangle).',
  openings: 'Counted once per opening, not once per room, by the size of its hole in the wall, width by height; the plan holds no frames, leaves or types.',
  slab: 'Assumed: a slab under the lowest floor\'s outline, to the outside face of its walls, less its openings and any open outdoor space on the ground, because the plan holds no slab.',
  upperFloor: 'Assumed: the gross internal area of each upper floor, less every opening its floor has over a stair, a stair room, a lift or a ramp, a void being out of that area already, because the plan holds no floor structure.',
  roof: 'Assumed: a roof over every part of a floor\'s outline that no floor above and no open outdoor space covers, on its slope where the floor states a sloped roof and flat where it states none, because the plan holds no overhang or build-up; none where the plan states more of the building above.',
  roofEdges: 'Assumed: each edge of the sloped roofs the floors state, laid as Grid lays them over the rectangle the roof spans with no overhang and no valleys, along the slope for a verge or a hip, because the plan holds no roof edges.',
  grossInternal: `${AREA_RULES.grossInternal} For a rate per square metre of the whole building: an alternative to the other lines, never added to them.`,
} as const

export interface EstimateLine {
  /** What a rates file prices it by: `floor:bedroom`, `wall:exterior:0.35`, `door:0.8x2.1`. */
  readonly key: string
  readonly what: string
  readonly quantity: number
  readonly unit: QuantityUnit
  readonly rule: string
  /** True when it rests on something the plan does not hold. */
  readonly assumed: boolean
  /** For the slab, upper floors and roof: each floor's part. */
  readonly floors?: readonly { readonly floor: string; readonly quantity: number }[]
}

export interface Estimate {
  readonly lines: readonly EstimateLine[]
  /** What the lines leave out, and why. */
  readonly notes: readonly string[]
}

/** The line that is an alternative to the others: a rate for the whole building. */
export const WHOLE_BUILDING_KEY = 'gross_internal'

const NO_USE = 'no-use' as const

/** Every use's words on its lines: one for each of `ROOM_USES`, so a new use fails the type check until it has them. */
const USE_WORDS: Readonly<Record<RoomUse | typeof NO_USE, string>> = {
  bedroom: 'bedrooms',
  living: 'living rooms',
  dining: 'dining rooms',
  kitchen: 'kitchens',
  bathroom: 'bathrooms',
  toilet: 'toilets',
  utility: 'utility rooms',
  study: 'studies',
  office: 'offices',
  meeting: 'meeting rooms',
  reception: 'reception areas',
  retail: 'shop floors',
  classroom: 'classrooms',
  treatment: 'treatment rooms',
  waiting: 'waiting areas',
  sport: 'sports halls',
  changing: 'changing rooms',
  staff: 'staff rooms',
  worship: 'worship rooms',
  assembly: 'assembly halls',
  corridor: 'corridors and halls',
  stair: 'stairs',
  lift: 'lift shafts',
  storage: 'stores',
  plant: 'plant rooms',
  parking: 'parking areas',
  other: 'other rooms',
  [NO_USE]: 'rooms with no use stated',
}

/** A size as a key writes it: metres, to the millimetre, with no trailing zeros. */
const size = (value: number): string => String(Math.round(value * 1000) / 1000)
/** A size as the line's words write it. */
const metres = (value: number): string => value.toFixed(2)

const KIND_ORDER = { exterior: 0, separating: 1, interior: 2, partition: 3 } as const

/** The lines of a first estimate for the plan, or for the floors given. */
export function planEstimate(survey: Survey, options: { floors?: readonly string[] } = {}): Estimate {
  const onFloor = (floor: string): boolean => options.floors === undefined || options.floors.includes(floor)
  const lines: EstimateLine[] = []
  const notes: string[] = []
  const add = (line: EstimateLine): void => {
    if (line.quantity > tolerance('areaEqual')) lines.push(line)
  }

  const areas = planAreas(survey, options.floors === undefined ? {} : { floors: options.floors })
  // SHT-11: a stair room over a stair room below has its floor counted there, as in the net area.
  const overStair = new Set(areas.floors.flatMap((f) => f.rooms.filter((room) => room.countedWith !== undefined).map((room) => `${f.floor}\u0000${room.id}`)))
  const overStairRoom = (room: string, floor: string): boolean => overStair.has(`${floor}\u0000${room}`)

  // Rooms: floor and wall faces by use, ceilings and skirting.
  const floorByUse = new Map<string, number>()
  const wallByUse = new Map<string, number>()
  let ceiling = 0
  let skirting = 0
  const leftOut: string[] = []
  // CNT-15: each finish a room or zone names, by surface, and the part of each room that names none.
  const byFinish = new Map<string, { surface: FinishSurface; finish: string; quantity: number }>()
  const finished = planHasFinishes(survey.plan)
  const shares = finished ? finishShares(survey, onFloor) : []
  for (const share of shares) {
    if (share.finish === null || share.quantity <= 0) continue
    if (share.surface === 'floor' && overStairRoom(share.room, share.floor)) continue
    const key = `${share.surface}\u0000${share.finish}`
    const total = byFinish.get(key) ?? { surface: share.surface, finish: share.finish, quantity: 0 }
    byFinish.set(key, { ...total, quantity: total.quantity + share.quantity })
  }
  const openOutdoor = new Set(survey.plan.rooms.filter((room) => outdoorRoofed(room) === false).map((room) => room.id))
  for (const room of survey.rooms) {
    // A zone's floor and walls are its room's (CNT-8): priced once.
    if (!onFloor(room.facts.floor) || room.facts.zoneOf !== undefined) continue
    if (room.facts.shape === null || room.polygon.length < 3) {
      leftOut.push(JSON.stringify(room.facts.name))
      continue
    }
    const t = roomTakeoff(room)
    const use = room.facts.use ?? NO_USE
    // CNT-15: what is left of a room once its own finishes and its zones' are priced by finish.
    const id = room.facts.id
    const left = (surface: FinishSurface, whole: number): number => {
      if (!finished) return whole
      const own = shares.find((share) => share.room === id && share.zone === null && share.surface === surface)
      return own === undefined ? whole : own.finish === null ? own.quantity : 0
    }
    if (!overStair.has(`${room.facts.floor}\u0000${room.facts.id}`)) floorByUse.set(use, (floorByUse.get(use) ?? 0) + left('floor', t.floorArea))
    wallByUse.set(use, (wallByUse.get(use) ?? 0) + left('walls', t.wallFace))
    // An outdoor space open to the sky (a deck, a terrace) has no ceiling; a porch has its soffit.
    if (!openOutdoor.has(id)) ceiling += left('ceiling', t.ceiling)
    skirting += left('skirting', t.skirting)
  }
  const uses = [...ROOM_USES, NO_USE].filter((use) => floorByUse.has(use))
  const finishLines = (surface: FinishSurface): void => {
    const words: Record<FinishSurface, { key: string; what: string; unit: QuantityUnit }> = {
      floor: { key: 'floor', what: 'Floor finish', unit: 'm2' },
      walls: { key: 'wall_finish', what: 'Inside wall faces', unit: 'm2' },
      ceiling: { key: 'ceiling', what: 'Ceilings', unit: 'm2' },
      skirting: { key: 'skirting', what: 'Skirting', unit: 'm' },
    }
    const of = [...byFinish.values()].filter((f) => f.surface === surface).sort((a, b) => (a.finish < b.finish ? -1 : a.finish > b.finish ? 1 : 0))
    for (const f of of) add({ key: `${words[surface].key}:finish:${f.finish}`, what: `${words[surface].what}, ${f.finish}`, quantity: f.quantity, unit: words[surface].unit, rule: ESTIMATE_RULES.finish, assumed: false })
  }
  finishLines('floor')
  for (const use of uses) add({ key: `floor:${use}`, what: `Floor finish, ${USE_WORDS[use]}`, quantity: floorByUse.get(use)!, unit: 'm2', rule: ESTIMATE_RULES.floor, assumed: false })
  finishLines('ceiling')
  add({ key: 'ceiling', what: finished ? 'Ceilings, every room that names no ceiling finish' : 'Ceilings, every room', quantity: ceiling, unit: 'm2', rule: ESTIMATE_RULES.ceiling, assumed: true })
  finishLines('walls')
  for (const use of uses) add({ key: `wall_finish:${use}`, what: `Inside wall faces, ${USE_WORDS[use]}`, quantity: wallByUse.get(use)!, unit: 'm2', rule: ESTIMATE_RULES.wallFinish, assumed: false })
  finishLines('skirting')
  add({ key: 'skirting', what: finished ? 'Skirting, every room that names no skirting' : 'Skirting, every room', quantity: skirting, unit: 'm', rule: ESTIMATE_RULES.skirting, assumed: false })

  // Openings, each once: the holes they take out of their walls, their reveals and their sizes.
  const holes = new Map<string, number>()
  const wallKey = (floor: string, wall: string): string => `${floor}\u0000${wall}`
  let reveals = 0
  const counts = new Map<string, { type: 'door' | 'window'; width: number; height: number; count: number; name?: string }>()
  const statedOpenings = new Map(survey.plan.openings.map((o) => [o.id, o] as const))
  for (const floor of survey.facts.floors) {
    if (!onFloor(floor.id)) continue
    const walls = new Map(floor.walls.map((wall) => [wall.id, wall] as const))
    for (const opening of floor.openings) {
      const wall = walls.get(opening.wall)
      if (wall === undefined) continue
      const height = Math.max(0, Math.min(opening.sill + opening.height, wall.height) - opening.sill)
      holes.set(wallKey(floor.id, wall.id), (holes.get(wallKey(floor.id, wall.id)) ?? 0) + opening.width * height)
      if (opening.type === 'opening') continue
      if (wall.virtual !== true) reveals += (2 * height + opening.width * (opening.sill > tolerance('noLength') ? 2 : 1)) * wall.thickness
      // CNT-15: a door or window of a type the plan names is priced by its type.
      const own = statedOpenings.get(opening.id)
      const named = own === undefined ? null : openingTypeOf(survey.plan, own)
      const key = named === null ? `${opening.type}:${size(opening.width)}x${size(opening.height)}` : `${opening.type}-type:${named.id}`
      const counted = counts.get(key) ?? { type: opening.type, width: opening.width, height: opening.height, count: 0, ...(named === null ? {} : { name: named.name }) }
      counts.set(key, { ...counted, count: counted.count + 1 })
    }
  }
  add({ key: 'reveals', what: 'Reveal linings round doors and windows', quantity: reveals, unit: 'm2', rule: ESTIMATE_RULES.reveals, assumed: false })

  // Walls by kind and thickness, on their centre lines.
  const byKind = new Map<string, { kind: keyof typeof KIND_ORDER; thickness: number; area: number; name?: string; order?: number }>()
  const statedWalls = new Map(survey.plan.walls.map((w) => [w.id, w] as const))
  const typeOrder = new Map((survey.plan.types?.walls ?? []).map((t, i) => [t.id, i] as const))
  // Each face's reach past the wall's axis ends once the corners are joined: a wall that butts into
  // another stops at its face, and at a corner one face gains what the other loses.
  const joints = wallJoints(survey.plan.walls)
  let gableWalls = 0
  for (const floor of survey.facts.floors) {
    if (!onFloor(floor.id)) continue
    for (const wall of floor.walls) {
      if (wall.virtual) continue
      // Along a curved wall's curve (CNT-18).
      const axis = wall.curve?.length ?? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
      if (axis < tolerance('noLength')) continue
      const ends = joints.get(wall.id)
      const length = ends === undefined ? axis : Math.max(0, axis + (ends.start.left + ends.start.right + ends.end.left + ends.end.right) / 2)
      // CNT-15: a wall of a type the plan names is priced by its type and thickness (lab AC-5).
      const own = statedWalls.get(wall.id)
      const named = own === undefined ? null : wallTypeOf(survey.plan, own)
      const key = named === null ? `wall:${wall.kind}:${size(wall.thickness)}` : `wall-type:${named.id}:${size(wall.thickness)}`
      const run = byKind.get(key) ?? { kind: wall.kind, thickness: wall.thickness, area: 0, ...(named === null ? {} : { name: named.name, order: typeOrder.get(named.id) ?? 0 }) }
      // CNT-34: under the roof the floor states, the face is what the roof leaves; its gable part is a line apart.
      const cut = own === undefined ? { face: length * wall.height, gable: 0 } : wallFaceOver(survey.plan, own, length)
      const net = Math.max(0, cut.face - (holes.get(wallKey(floor.id, wall.id)) ?? 0))
      const gable = Math.min(cut.gable, net)
      gableWalls += gable
      byKind.set(key, { ...run, area: run.area + net - gable })
    }
  }
  // CNT-15: the plan's named types first, in the order it lists them, then Grid's by kind.
  const kinds = [...byKind.entries()].sort(([, a], [, b]) => (a.order === undefined) !== (b.order === undefined) ? (a.order === undefined ? 1 : -1) : (a.order ?? 0) - (b.order ?? 0) || (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.thickness - b.thickness)
  for (const [key, run] of kinds) {
    const kind = run.kind.charAt(0).toUpperCase() + run.kind.slice(1)
    if (run.name !== undefined) add({ key, what: `${run.name} walls ${metres(run.thickness)} m thick`, quantity: run.area, unit: 'm2', rule: ESTIMATE_RULES.wallType, assumed: false })
    else add({ key, what: `${kind} walls ${metres(run.thickness)} m thick`, quantity: run.area, unit: 'm2', rule: ESTIMATE_RULES.walls, assumed: false })
  }

  add({ key: 'wall_gable', what: 'Gable parts of the walls, above the lowest their tops stand under the roof', quantity: gableWalls, unit: 'm2', rule: ESTIMATE_RULES.wallGable, assumed: false })

  // The outside: the outline's edge, then what stands on and over the outlines.
  const shells = planShell(survey.plan)
  const built = shells.filter((shell) => !shellKnown(shell) || shell.area > tolerance('areaEqual'))
  let outside = 0
  let outsideGable = 0
  for (const shell of built) {
    if (!onFloor(shell.floor)) continue
    if (!shellKnown(shell)) {
      notes.push(`Floor ${JSON.stringify(shell.floor)} has no outline Grid can work out, so its outside face, slab and roof are left out: ${shell.reason}.`)
      continue
    }
    const faced = new Set(shell.faces.map((face) => face.wall))
    for (const face of shell.faces) {
      const own = statedWalls.get(face.wall)
      const cut = own === undefined ? { face: face.length * face.height, gable: 0 } : wallFaceOver(survey.plan, own, face.length)
      outside += cut.face
      outsideGable += cut.gable
    }
    for (const wall of faced) outside -= holes.get(wallKey(shell.floor, wall)) ?? 0
  }
  const outsideNet = Math.max(0, outside)
  add({ key: 'external_finish', what: 'Outside face of the outer walls', quantity: outsideNet - Math.min(outsideGable, outsideNet), unit: 'm2', rule: ESTIMATE_RULES.externalFinish, assumed: false })
  add({ key: 'external_finish_gable', what: 'Gable parts of the outside face, above the lowest the walls\' tops stand under the roof', quantity: Math.min(outsideGable, outsideNet), unit: 'm2', rule: ESTIMATE_RULES.externalGable, assumed: false })
  const namedFirst = (a: string | undefined, b: string | undefined): number => ((a === undefined) === (b === undefined) ? 0 : a === undefined ? 1 : -1)
  for (const [key, c] of [...counts.entries()].sort(([, a], [, b]) => (a.type === b.type ? 0 : a.type === 'door' ? -1 : 1) || namedFirst(a.name, b.name) || a.width - b.width || a.height - b.height)) {
    const what = c.name === undefined ? `${c.type === 'door' ? 'Door' : 'Window'} ${metres(c.width)} × ${metres(c.height)} m` : `${c.type === 'door' ? 'Door' : 'Window'}, ${c.name}`
    add({ key, what, quantity: c.count, unit: 'nr', rule: c.name === undefined ? ESTIMATE_RULES.openings : ESTIMATE_RULES.openingType, assumed: false })
  }

  // The slab, the upper floors and the roof as the take-off works them out (`planEnvelope`): open
  // over stairs, lifts and voids, none under or over open outdoor space, the roof on its slope.
  const envelope = planEnvelope(survey.plan, options.floors === undefined ? {} : { floors: options.floors })
  const known = new Set(built.filter((shell) => shellKnown(shell)).map((shell) => shell.floor))
  const slab: { floor: string; quantity: number }[] = []
  const upper: { floor: string; quantity: number }[] = []
  const roof: { floor: string; quantity: number; shape: FloorRoof['shape']; pitch: number }[] = []
  const edges = { ridge: 0, eaves: 0, verge: 0, hip: 0 }
  const edgeFloors: Record<keyof typeof edges, { floor: string; quantity: number }[]> = { ridge: [], eaves: [], verge: [], hip: [] }
  for (const env of envelope.floors) {
    if (!known.has(env.floor) || env.slab === null) continue
    if (env.slab.kind === 'base') {
      if (env.slab.area > tolerance('areaEqual')) slab.push({ floor: env.floor, quantity: env.slab.area })
    } else {
      const gross = areas.floors.find((f) => f.floor === env.floor)?.grossInternal ?? null
      if (gross === null) {
        notes.push(`Floor ${JSON.stringify(env.floor)} has no gross internal area, so its floor structure is left out of upper_floor.`)
      } else {
        // A void is out of the gross internal area already (ARE-16).
        const open = env.slab.openings.reduce((sum, opening) => sum + (opening.kind === 'void' ? 0 : opening.area), 0)
        upper.push({ floor: env.floor, quantity: Math.max(0, gross - open) })
      }
    }
    if (!env.roofKnown) {
      notes.push(`The roof over floor ${JSON.stringify(env.floor)} is left out: ${env.why ?? 'its outline, or that of a floor above it, is not known'}.`)
      continue
    }
    if (env.roof === null || env.roof.area <= tolerance('areaEqual')) continue
    roof.push({ floor: env.floor, quantity: env.roof.slopeArea, shape: env.roof.shape, pitch: env.roof.pitch })
    const shape = env.roof.shape === null ? null : floorRoofShape(survey.plan, env.floor)
    if (shape === null) continue
    const lengths = roofEdges(shape, env.roof)
    for (const k of Object.keys(edges) as (keyof typeof edges)[]) {
      if (lengths[k] <= tolerance('noLength')) continue
      edges[k] += lengths[k]
      edgeFloors[k].push({ floor: env.floor, quantity: lengths[k] })
    }
  }
  if (slab.length > 0) {
    const named = slab.map((part) => floorName(survey, part.floor)).join(', ')
    add({ key: 'slab', what: `Lowest floor slab (${named})`, quantity: slab.reduce((sum, part) => sum + part.quantity, 0), unit: 'm2', rule: ESTIMATE_RULES.slab, assumed: true, floors: slab })
  }
  if (upper.length > 0) {
    const named = upper.map((part) => floorName(survey, part.floor)).join(', ')
    add({ key: 'upper_floor', what: `Upper floor structure (${named})`, quantity: upper.reduce((sum, part) => sum + part.quantity, 0), unit: 'm2', rule: ESTIMATE_RULES.upperFloor, assumed: true, floors: upper })
  }
  if (roof.length > 0) {
    const sloped = roof.some((part) => part.shape !== null && part.pitch > 0)
    const parts = roof.map((part) => `${floorName(survey, part.floor)} ${part.quantity.toFixed(2)} m²${part.shape !== null && part.pitch > 0 ? `, ${part.shape} at ${part.pitch.toFixed(1)}°` : ''}`).join(', ')
    const what = sloped ? `Roof, on its slope, wherever no floor is above (${parts})` : `Roof, taken as flat, wherever no floor is above (${parts})`
    add({ key: 'roof', what, quantity: roof.reduce((sum, part) => sum + part.quantity, 0), unit: 'm2', rule: ESTIMATE_RULES.roof, assumed: true, floors: roof.map((part) => ({ floor: part.floor, quantity: part.quantity })) })
  }
  const EDGE_WORDS: Record<keyof typeof edges, string> = { ridge: 'Ridge', eaves: 'Eaves', verge: 'Verges', hip: 'Hips' }
  for (const k of Object.keys(edges) as (keyof typeof edges)[]) {
    add({ key: k, what: `${EDGE_WORDS[k]} of the sloped roofs (${edgeFloors[k].map((part) => floorName(survey, part.floor)).join(', ')})`, quantity: edges[k], unit: 'm', rule: ESTIMATE_RULES.roofEdges, assumed: true, floors: edgeFloors[k] })
  }
  if (areas.grossInternal !== null) {
    add({ key: WHOLE_BUILDING_KEY, what: 'Gross internal area, for a rate for the whole building', quantity: areas.grossInternal, unit: 'm2', rule: ESTIMATE_RULES.grossInternal, assumed: false })
  } else if (areas.grossWhy !== null) {
    notes.push(`${areas.grossWhy}, so the line for a rate for the whole building is left out.`)
  }

  if (leftOut.length > 0) {
    notes.unshift(`The room lines leave out ${leftOut.length === 1 ? 'a room' : `${leftOut.length} rooms`} Grid could not draw, and are short by ${leftOut.length === 1 ? 'it' : 'them'}: ${leftOut.join(', ')}. grid_check says why.`)
  }
  return { lines, notes }
}

function floorName(survey: Survey, floor: string): string {
  const facts = survey.facts.floors.find((f) => f.id === floor)
  return JSON.stringify(facts?.name ?? floor)
}

/**
 * The edges of a sloped roof, in metres: its ridge, its eaves, its verges (along the slope, at a
 * gable's and a mono-pitch roof's ends) and its hips. Worked out over the rectangle its pieces span
 * along the roof's own sides, as Grid lays the roof: one roof over that rectangle, with no valleys.
 */
export function roofEdges(shape: RoofShapeOverFloor, roof: Pick<FloorRoof, 'pieces'>): { ridge: number; eaves: number; verge: number; hip: number } {
  const none = { ridge: 0, eaves: 0, verge: 0, hip: 0 }
  if (shape.planes.length === 0 || !(shape.slope > 0)) return none
  const { east, north } = shape.frame
  let w = Infinity
  let e = -Infinity
  let s = Infinity
  let n = -Infinity
  for (const polygon of roof.pieces) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        const u = x! * east.x + y! * east.y
        const v = x! * north.x + y! * north.y
        w = Math.min(w, u)
        e = Math.max(e, u)
        s = Math.min(s, v)
        n = Math.max(n, v)
      }
    }
  }
  if (!(e > w) || !(n > s)) return none
  const along = e - w
  const across = n - s
  const slopeLength = (run: number): number => run * Math.hypot(1, shape.slope)
  const { roof: stated } = shape
  if (stated.shape === 'gable') {
    const ridgeEastWest = shape.planes.length === 2 && Math.abs(shape.planes[0]!.gx * east.x + shape.planes[0]!.gy * east.y) < Math.abs(shape.planes[0]!.gx * north.x + shape.planes[0]!.gy * north.y)
    const [length, span] = ridgeEastWest ? [along, across] : [across, along]
    return { ridge: length, eaves: 2 * length, verge: 4 * slopeLength(span / 2), hip: 0 }
  }
  if (stated.shape === 'hip') {
    const long = Math.max(along, across)
    const short = Math.min(along, across)
    const half = short / 2
    return { ridge: long - short, eaves: 2 * (along + across), verge: 0, hip: 4 * Math.hypot(half, half, shape.slope * half) }
  }
  if (stated.shape === 'mono-pitch') {
    const northSouth = stated.highSide === 'north' || stated.highSide === 'south' || stated.highSide === undefined
    const [length, span] = northSouth ? [along, across] : [across, along]
    return { ridge: length, eaves: length, verge: 2 * slopeLength(span), hip: 0 }
  }
  return none
}
