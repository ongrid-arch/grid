/**
 * CNT-10 (lab AC-3, EL-10): a change costed as three lists, on top of ARE-13's quantities: what is
 * demolished, what is made good where it was, and what is new. A plan with phases says which is
 * which, so taking a wall or a window out is a line of work to price, never a saving.
 *
 * Each line is an `EstimateLine` (`estimate.ts`) with its list, a key a rates file prices
 * (`demolish:wall:interior:0.1`, `make_good:infill:exterior:0.3`, `new:door:0.9x2.1`; a shorter
 * key covers longer ones, so `demolish` prices every demolition line), a quantity, its rule in
 * one sentence and no price. Pure: a plan in, lines out.
 *
 * ARE-71: a new opening in a wall that stays is cut through it: the hole taken out
 * (`demolish:cut:<kind>:<thickness>`), its reveals and a lintel (`new:lintel:<kind>:<thickness>`,
 * in metres, assumed: the plan holds no lintels).
 */
import {
  dot,
  limit,
  partPhases,
  planHasPhases,
  sub,
  tolerance,
  validatePlan,
  wallCurve,
  wallLength,
  wallRise,
  wallSegments,
  wallStandsOn,
  type FloorPlan,
  type Opening,
  type Wall,
} from '@ongrid/floorplan/geometry'
import type { Phase } from '@ongrid/floorplan/types/floorplan'
import { planAreas } from './areas'
import type { Estimate, EstimateLine, QuantityUnit } from './estimate'
import { surveyPlan } from './survey'

/** The three lists of a change, in the order the work is done. */
export const CHANGE_LISTS = ['demolish', 'make good', 'new'] as const
export type ChangeList = (typeof CHANGE_LISTS)[number]

/** The rule of each kind of line, one sentence each, in Grid's words. */
export const CHANGE_RULES = {
  demolishWall: 'Each wall to be demolished, by the kind and thickness the plan states: its centre-line length times its height, less the openings in it.',
  demolishOpening: 'Each door, window and doorless opening to be demolished, its own or in a wall to be demolished, counted once by the size of its hole.',
  floor: 'The floor where a solid wall to be demolished stood, to be made good: its centre-line length times its thickness.',
  wallEnd: 'Where a wall to be demolished ended on a wall that stays, the face of the wall that stays to be made good: its height, once for each such end.',
  cut: 'Each new door, window and doorless opening cut through a wall that stays, by the wall\'s kind and thickness: its hole, less the part of it an opening to be demolished in the same wall leaves open already.',
  infill: 'Each opening to be demolished in a wall that stays, filled in to the wall\'s kind and thickness: its hole, less the part of it a new opening in the same wall takes.',
  reveals: 'Round each new door, window and doorless opening cut in a wall that stays, its two sides and its head, and its sill when it has one, times the thickness of the wall.',
  newWall: 'Each new wall, by the kind and thickness the plan states: its centre-line length times its height, less the openings in it.',
  newOpening: 'Each new door, window and doorless opening, counted once by the size of its hole.',
  lintel: `Assumed: a lintel over each new door, window and doorless opening cut through a wall that stays whose head is below the wall's top, by the wall's kind and thickness, its width and ${limit('lintelBearing')} m bearing at each end, because the plan holds no lintels.`,
  newFloor: 'The net floor area of the new rooms of this use, as grid_areas measures it after the work; the plan holds no finishes, so which finish goes down is the person\'s.',
} as const

/** A line of a change: an estimate line with the list it is in. */
export interface ChangeLine extends EstimateLine {
  readonly list: ChangeList
}

export interface ChangeEstimate extends Estimate {
  readonly lines: readonly ChangeLine[]
}

/** A size as a key writes it: metres, to the millimetre, with no trailing zeros. */
const size = (value: number): string => String(Math.round(value * 1000) / 1000)
const metres = (value: number): string => value.toFixed(2)

const KIND_ORDER = { exterior: 0, separating: 1, interior: 2, partition: 3 } as const
const TYPE_WORDS = { door: 'Door', window: 'Window', opening: 'Doorless opening' } as const

/** How much of an opening's hole lies in its wall: its width by its height up to the wall's top, `top` above its floor. */
function hole(opening: Opening, top: number): number {
  const height = Math.max(0, Math.min(opening.sill + opening.height, top) - opening.sill)
  return opening.width * height
}

/** The part of one opening's hole another in the same wall takes. */
function overlap(a: Opening, b: Opening): number {
  const along = Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset)
  const up = Math.min(a.sill + a.height, b.sill + b.height) - Math.max(a.sill, b.sill)
  return along > 0 && up > 0 ? along * up : 0
}

/**
 * Whether a point lies on a wall: on its axis, within half its thickness and the joint tolerance.
 * A curved wall (CNT-18) is looked along piece by piece, the chords of its curve.
 */
function endsOn(point: readonly [number, number], wall: Wall): boolean {
  const p = { x: point[0], y: point[1] }
  const slack = wall.thickness / 2 + tolerance('wallContact')
  return wallSegments(wall).some((axis) => {
    const along = dot(sub(p, axis.start), axis.dir)
    const across = Math.abs(dot(sub(p, axis.start), axis.normal))
    return across <= slack && along >= -slack && along <= axis.length + slack
  })
}

/**
 * The three lists of the plan's work. A plan with no phases holds no work: its lines are empty,
 * and a note says why.
 */
export function planChange(plan: FloorPlan, options: { floors?: readonly string[] } = {}): ChangeEstimate {
  if (!planHasPhases(plan)) {
    return { lines: [], notes: ['The plan states no phase, so it holds no work to cost: mark it with grid_start_works before the work\'s edits, or its parts with grid_set_phase (existing, demolished or new).'] }
  }
  // LVL-5: a wall through floors stands on each floor it rises through, and is taken off once,
  // whole, its height its whole rise above its own floor.
  const onFloor = (wall: Wall): boolean => options.floors === undefined || options.floors.some((floor) => wallStandsOn(plan, wall, floor))
  const rise = (wall: Wall): number => wallRise(plan, wall)
  const phases = partPhases(plan)
  const phase = (id: string): Phase | undefined => phases.get(id)
  const broken = validatePlan(plan).broken
  const walls = plan.walls.filter((w) => !broken.has(w.id) && onFloor(w))
  const byId = new Map(walls.map((w) => [w.id, w] as const))
  const openings = plan.openings.filter((o) => !broken.has(o.id) && byId.has(o.wall))
  const inWall = (wall: Wall): Opening[] => openings.filter((o) => o.wall === wall.id)
  const notes: string[] = []

  type Bucket = { key: string; what: string; quantity: number; unit: QuantityUnit; rule: string; list: ChangeList; order: readonly (number | string)[]; assumed?: true }
  const buckets = new Map<string, Bucket>()
  const add = (bucket: Omit<Bucket, 'quantity'>, quantity: number): void => {
    const was = buckets.get(bucket.key)
    buckets.set(bucket.key, { ...bucket, quantity: (was?.quantity ?? 0) + quantity })
  }
  const wallLine = (list: ChangeList, prefix: string, wall: Wall, rule: string, words: string, quantity: number, unit: QuantityUnit = 'm2', assumed = false): void => {
    const kind = wall.kind
    add({ key: `${prefix}:${kind}:${size(wall.thickness)}`, what: `${words}, ${kind} ${metres(wall.thickness)} m thick`, unit, rule, list, order: [KIND_ORDER[kind], wall.thickness], ...(assumed ? { assumed: true as const } : {}) }, quantity)
  }
  const openingLine = (list: ChangeList, prefix: string, opening: Opening, rule: string, words: string): void => {
    add({ key: `${prefix}:${opening.type}:${size(opening.width)}x${size(opening.height)}`, what: `${words} ${TYPE_WORDS[opening.type].toLowerCase()} ${metres(opening.width)} × ${metres(opening.height)} m`, unit: 'nr', rule, list, order: [['door', 'window', 'opening'].indexOf(opening.type), opening.width, opening.height] }, 1)
  }

  for (const wall of walls) {
    if (wall.virtual === true) continue
    // CNT-18: a curved wall's length is along its curve.
    const length = wallLength(wall)
    if (length < tolerance('noLength')) continue
    const holes = inWall(wall).reduce((sum, o) => sum + hole(o, rise(wall)), 0)
    const p = phase(wall.id)
    if (p === 'demolished') {
      wallLine('demolish', 'demolish:wall', wall, CHANGE_RULES.demolishWall, 'Walls to be demolished', Math.max(0, length * rise(wall) - holes))
      add({ key: 'make_good:floor', what: 'Floor made good where walls are demolished', unit: 'm2', rule: CHANGE_RULES.floor, list: 'make good', order: [0] }, length * wall.thickness)
      // A whole circle (CNT-18) has no ends.
      for (const end of wallCurve(wall)?.closed === true ? [] : [wall.start, wall.end]) {
        const stays = walls.find((other) => other.id !== wall.id && other.virtual !== true && phase(other.id) === 'existing' && endsOn(end, other))
        if (stays !== undefined) add({ key: 'make_good:wall_end', what: 'Wall faces made good where a demolished wall met them', unit: 'm', rule: CHANGE_RULES.wallEnd, list: 'make good', order: [1] }, rise(stays))
      }
    } else if (p === 'new') {
      wallLine('new', 'new:wall', wall, CHANGE_RULES.newWall, 'New walls', Math.max(0, length * rise(wall) - holes))
    }
  }

  for (const opening of openings) {
    const wall = byId.get(opening.wall)!
    const p = phase(opening.id)
    if (p === 'demolished') {
      openingLine('demolish', 'demolish', opening, CHANGE_RULES.demolishOpening, 'To be demolished:')
      if (phase(wall.id) === 'existing' && wall.virtual !== true) {
        const taken = inWall(wall).filter((o) => phase(o.id) === 'new').reduce((sum, o) => sum + overlap(opening, o), 0)
        const infill = Math.max(0, hole(opening, rise(wall)) - taken)
        if (infill > tolerance('areaEqual')) wallLine('make good', 'make_good:infill', wall, CHANGE_RULES.infill, 'Openings filled in', infill)
      }
    } else if (p === 'new') {
      openingLine('new', 'new', opening, CHANGE_RULES.newOpening, 'New')
      if (phase(wall.id) === 'existing' && wall.virtual !== true) {
        // ARE-71: cut through a wall that stays: the hole taken out, its reveals (a doorless
        // opening's too) and a lintel over it, assumed, where its head is below the wall's top.
        const top = rise(wall)
        const height = Math.max(0, Math.min(opening.sill + opening.height, top) - opening.sill)
        const open = inWall(wall).filter((o) => phase(o.id) === 'demolished').reduce((sum, o) => sum + overlap(opening, o), 0)
        const cut = Math.max(0, hole(opening, top) - open)
        if (cut > tolerance('areaEqual')) {
          wallLine('demolish', 'demolish:cut', wall, CHANGE_RULES.cut, 'Openings cut through walls that stay', cut)
          if (opening.sill + opening.height < top - tolerance('noLength')) {
            wallLine('new', 'new:lintel', wall, CHANGE_RULES.lintel, 'Lintels over openings cut through walls that stay', opening.width + 2 * limit('lintelBearing'), 'm', true)
          }
        }
        const reveals = (2 * height + opening.width * (opening.sill > tolerance('noLength') ? 2 : 1)) * wall.thickness
        add({ key: 'make_good:reveals', what: 'Reveals of new openings cut in walls that stay', unit: 'm2', rule: CHANGE_RULES.reveals, list: 'make good', order: [3] }, reveals)
      }
    }
  }

  // The new rooms' floors, by use, measured after the work.
  const areas = planAreas(surveyPlan(plan), options.floors === undefined ? {} : { floors: options.floors })
  for (const floor of areas.floors) {
    for (const room of floor.rooms) {
      if (phase(room.id) !== 'new' || room.net === null || room.countedWith !== undefined) continue
      const use = room.use ?? 'no-use'
      add({ key: `new:floor:${use}`, what: `Floor finish of new rooms, ${use === 'no-use' ? 'no use stated' : use}`, unit: 'm2', rule: CHANGE_RULES.newFloor, list: 'new', order: [9, use] }, room.net)
    }
  }

  const compare = (a: readonly (number | string)[], b: readonly (number | string)[]): number => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? ''
      const y = b[i] ?? ''
      if (x === y) continue
      return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    }
    return 0
  }
  const rank = (b: Bucket): number =>
    CHANGE_LISTS.indexOf(b.list) * 10 +
    (b.key.includes(':wall:') || b.key.startsWith('make_good:floor') ? 0 : b.key.startsWith('make_good:wall_end') ? 1 : b.key.includes(':infill:') ? 2 : b.key.startsWith('make_good:reveals') ? 3 : b.key.startsWith('new:floor') ? 6 : b.key.includes(':cut:') || b.key.includes(':lintel:') ? 5 : 4)
  const lines: ChangeLine[] = [...buckets.values()]
    .filter((b) => b.quantity > tolerance('areaEqual'))
    .sort((a, b) => rank(a) - rank(b) || compare(a.order, b.order) || a.key.localeCompare(b.key))
    .map(({ key, what, quantity, unit, rule, list, assumed }) => ({ key, what, quantity, unit, rule, assumed: assumed === true, list }))
  if (lines.length === 0) notes.push('The plan states phases, but nothing in it is to be demolished or new.')
  return { lines, notes }
}
