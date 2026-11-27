/**
 * Party walls and the neighbours round the plan (CNT-60): the two changes that write what C23
 * already holds and no change wrote.
 *
 * `setPartyWall` (`grid_set_party_wall`) makes walls party walls: kind `separating`, with what lies
 * `beyond` them, a neighbour (another home or property) or a common part of the building that is
 * not drawn. The walls are named by id or found as a room's side, read as every edit reads a side
 * (`roomSide`). `clear` makes them ordinary walls again: of the kind their rooms give them, outside
 * with a room on one side only, else inside.
 *
 * `changeNeighbour` (`grid_change_neighbour`) adds, moves, resizes and takes out a context shape
 * (`context`): a neighbour's house, the hall a stand stands in. Its outline is in plan metres, on a
 * floor (unstated, the ground floor) and with a height. Each is drawn only: never a wall or a room,
 * in no measure, check or count. Every change is a patch of the plan's own fields, refused with
 * nothing written when what it would leave could not be read (`ContextShapeSchema`).
 */
import { indexPlan, metresText, planFloors, wallSides } from '@ongrid/floorplan/geometry'
import { ContextShapeSchema, type ContextShape, type FloorPlan, type Wall } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch } from './edits'
import { EditRefused } from './refused'
import { roomSide } from './sideNames'

type Pair = [number, number]

/** What lies beyond a party wall: a neighbour, or a common part of the building not drawn. */
export const PARTY_BEYOND = ['neighbour', 'common'] as const
export type PartyBeyond = (typeof PARTY_BEYOND)[number]

export interface PartyWallRequest {
  /** The walls by id; or `room` and `side`. */
  readonly walls?: readonly string[]
  readonly room?: string
  readonly side?: string
  readonly beyond?: PartyBeyond
  /** Makes them ordinary walls again. */
  readonly clear?: boolean
}

const BEYOND_WORDS: Readonly<Record<PartyBeyond, string>> = { neighbour: 'a neighbour', common: 'a common part of the building' }

/** The walls a request names: by id, or the walls along a room's side. */
function partyWalls(survey: Survey, request: PartyWallRequest): { walls: Wall[]; called: string | null } {
  const plan = survey.plan
  if (request.walls !== undefined && request.walls.length > 0) {
    if (request.room !== undefined || request.side !== undefined) throw new EditRefused('Name the walls by id, or a room and its side, not both.')
    const walls = [...new Set(request.walls)].map((id) => plan.walls.find((w) => w.id === id)!)
    return { walls, called: null }
  }
  if (request.room === undefined || request.side === undefined) throw new EditRefused('Name the walls by id, or a room and its side: room hall, side west.')
  const room = survey.byId.get(request.room)
  if (room === undefined || room.polygon.length < 3) throw new EditRefused('That room has no outline Grid can measure; grid_check says why.')
  const found = roomSide(survey, request.room, request.side)
  const ids = [...new Set(found.edges.flatMap((edge) => (edge.wall === null ? [] : [edge.wall.id])))]
  return { walls: ids.map((id) => plan.walls.find((w) => w.id === id)!).filter((w) => w !== undefined), called: `${found.called} of ${JSON.stringify(room.facts.name)}` }
}

/** Walls made party walls with what lies beyond them, or ordinary walls again. */
export function setPartyWall(survey: Survey, request: PartyWallRequest): Patch {
  const { walls, called } = partyWalls(survey, request)
  const virtual = walls.filter((w) => w.virtual === true)
  if (virtual.length > 0) throw new EditRefused(`${virtual.map((w) => w.id).join(', ')} ${virtual.length === 1 ? 'is a dividing line' : 'are dividing lines'}, not a wall: a party wall is a solid wall.`)
  const ids = walls.map((w) => w.id).join(', ')
  const where = called === null ? '' : ` (${called})`
  const changes = new Map<string, { kind?: Wall['kind'] | null; beyond?: Wall['beyond'] | null }>()
  if (request.clear === true) {
    if (request.beyond !== undefined) throw new EditRefused('clear makes the walls ordinary walls: give beyond to make them party walls instead.')
    // Read with the party wall taken out, so the rooms alone say which kind each is.
    const plain: FloorPlan = { ...survey.plan, walls: survey.plan.walls.map((w) => (walls.includes(w) ? { ...w, kind: 'interior' as const, beyond: undefined } : w)) }
    const index = indexPlan(plain)
    const kinds: string[] = []
    for (const wall of walls) {
      const worked = wallSides(index, wall.id)?.worked
      const kind: Wall['kind'] = worked === 'interior' ? 'interior' : 'exterior'
      changes.set(wall.id, { kind, beyond: null })
      kinds.push(`${wall.id} ${kind === 'interior' ? 'inside' : 'outside'}`)
    }
    const party = walls.filter((w) => w.kind === 'separating' || w.beyond !== undefined)
    const line = party.length === 0
      ? `${ids}${where}: no party wall to clear; ${walls.length === 1 ? 'it is' : 'they are'} an ordinary wall as before (${kinds.join(', ')}).`
      : `${ids}${where}: an ordinary wall again, of the kind its rooms give it (${kinds.join(', ')}); nothing lies beyond it now but what the drawing shows.`
    return { ...emptyPatch([line]), walls: changes }
  }
  const beyond = request.beyond ?? 'neighbour'
  for (const wall of walls) changes.set(wall.id, { kind: 'separating', beyond })
  const line = `${ids}${where}: a party wall now, with ${BEYOND_WORDS[beyond]} beyond it. A door through it into a neighbour is no way out; the 3D views and the GLB draw it as a cut.`
  return { ...emptyPatch([line]), walls: changes, extra: { walls: walls.map((w) => w.id) } }
}

/** The actions `grid_change_neighbour` takes. */
export const NEIGHBOUR_ACTIONS = ['add', 'move', 'resize', 'remove'] as const
export type NeighbourAction = (typeof NEIGHBOUR_ACTIONS)[number]

export interface NeighbourRequest {
  readonly action: NeighbourAction
  readonly id?: string
  /** The outline's corners, in order round it. */
  readonly points?: readonly Pair[]
  /** Or a box: its south-west corner, its width east-west and its depth north-south. */
  readonly box?: { readonly at: Pair; readonly width: number; readonly depth: number }
  readonly height?: number
  readonly floor?: string
  readonly name?: string
  /** For move: how far, or where its middle goes. */
  readonly by?: Pair
  readonly to?: Pair
}

const M = (v: number): string => `${metresText(v)} m`
const round = (v: number): number => Math.round(v * 1e6) / 1e6 + 0

function middleOf(points: readonly (readonly number[])[]): Pair {
  const xs = points.map((p) => p[0]!)
  const ys = points.map((p) => p[1]!)
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

function checkedShape(shape: Record<string, unknown>): ContextShape {
  const checked = ContextShapeSchema.safeParse(shape)
  if (checked.success) return checked.data
  const issue = checked.error.issues[0]!
  throw new EditRefused(`The neighbour would not be read: ${issue.path.length === 0 ? '' : `${issue.path.join('.')} `}${issue.message}.`)
}

function outlineOf(request: NeighbourRequest): Pair[] | undefined {
  if (request.points !== undefined && request.box !== undefined) throw new EditRefused('Give the outline by points or by a box (at, width and depth), not both.')
  if (request.points !== undefined) return request.points.map(([x, y]) => [x, y])
  if (request.box === undefined) return undefined
  const { at: [x, y], width, depth } = request.box
  return [[x, y], [round(x + width), y], [round(x + width), round(y + depth)], [x, round(y + depth)]]
}

/** What a neighbour is, in words: its name or id, its size and its height. */
function shapeText(shape: ContextShape): string {
  const xs = shape.points.map((p) => p[0])
  const ys = shape.points.map((p) => p[1])
  const size = `${M(Math.max(...xs) - Math.min(...xs))} by ${M(Math.max(...ys) - Math.min(...ys))}`
  const height = shape.height === undefined ? 'no height (drawn as its footprint)' : `${M(shape.height)} high`
  return `${shape.id}${shape.name === undefined ? '' : ` (${JSON.stringify(shape.name)})`}, ${size}, ${height}${shape.floor === undefined ? '' : `, on floor ${shape.floor}`}`
}

/** One neighbour, or other shape of context, added, moved, resized or taken out. */
export function changeNeighbour(survey: Survey, request: NeighbourRequest): Patch {
  const plan = survey.plan
  const shapes = plan.context ?? []
  const listed = (): string => (shapes.length === 0 ? 'The plan has none.' : `Its neighbours: ${shapes.slice(0, 20).map((s) => s.id).join(', ')}${shapes.length > 20 ? ` and ${shapes.length - 20} more` : ''}.`)
  const withShapes = (list: readonly ContextShape[]): Patch['plan'] => ({ context: list.length === 0 ? null : list })
  if (request.floor !== undefined && !planFloors(plan).some((f) => f.id === request.floor)) {
    throw new EditRefused(`The plan has no floor ${request.floor}. Its floors: ${planFloors(plan).map((f) => f.id).join(', ')}.`)
  }
  const outline = outlineOf(request)

  if (request.action === 'add') {
    if (outline === undefined) throw new EditRefused('To add a neighbour, give its outline: points round it, or a box by at, width and depth.')
    if (request.by !== undefined || request.to !== undefined) throw new EditRefused('by and to move a neighbour already on the plan; a new one is placed by its outline.')
    let id = request.id
    if (id === undefined) {
      let n = shapes.length + 1
      while (shapes.some((s) => s.id === `neighbour-${n}`)) n++
      id = `neighbour-${n}`
    } else if (shapes.some((s) => s.id === id)) throw new EditRefused(`The plan has a neighbour with the id ${id} already: give the new one its own, or move or resize that one.`)
    const shape = checkedShape({
      id,
      points: outline,
      ...(request.name === undefined ? {} : { name: request.name }),
      ...(request.floor === undefined ? {} : { floor: request.floor }),
      ...(request.height === undefined ? {} : { height: request.height }),
    })
    return { ...emptyPatch([`Added the neighbour ${shapeText(shape)}. It is drawn only: no wall, room or area.`]), plan: withShapes([...shapes, shape]), extra: { neighbour: id } }
  }

  if (request.id === undefined) throw new EditRefused(`To ${request.action} a neighbour, name it by id. ${listed()}`)
  const shape = shapes.find((s) => s.id === request.id)
  if (shape === undefined) throw new EditRefused(`The plan has no neighbour with the id ${request.id}. ${listed()}`)
  if (request.action === 'remove') {
    return { ...emptyPatch([`Took the neighbour ${shape.id} off the plan.`]), plan: withShapes(shapes.filter((s) => s !== shape)), extra: { neighbour: shape.id } }
  }
  let next: Record<string, unknown>
  if (request.action === 'move') {
    if ((request.by === undefined) === (request.to === undefined)) throw new EditRefused('To move a neighbour, give by (how far, x,y) or to (where its middle goes, x,y), one of them.')
    if (outline !== undefined) throw new EditRefused('A move keeps the outline: give by or to, or resize it with its new points.')
    const middle = middleOf(shape.points)
    const [dx, dy] = request.by ?? [request.to![0] - middle[0], request.to![1] - middle[1]]
    next = { ...shape, points: shape.points.map(([x, y]) => [round(x + dx), round(y + dy)]) }
  } else {
    if (outline === undefined && request.height === undefined && request.floor === undefined && request.name === undefined) throw new EditRefused('To resize a neighbour, give its new outline (points or a box), height, floor or name: what changes.')
    next = {
      ...shape,
      ...(outline === undefined ? {} : { points: outline }),
      ...(request.height === undefined ? {} : { height: request.height }),
      ...(request.floor === undefined ? {} : { floor: request.floor }),
      ...(request.name === undefined ? {} : { name: request.name }),
    }
  }
  const changed = checkedShape(next)
  const verb = request.action === 'move' ? 'Moved' : 'Changed'
  return { ...emptyPatch([`${verb} the neighbour: ${shapeText(changed)} now.`]), plan: withShapes(shapes.map((s) => (s === shape ? changed : s))), extra: { neighbour: shape.id } }
}
