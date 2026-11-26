/**
 * The parking tools (CNT-46): `grid_place_bays` places rows of bays in a room, by the same words as
 * a rooms text `bays` line, and `grid_add_ramp` adds a ramp between two floors, by the same words
 * as a `ramp` line: straight in its room, along its middle line, or a helix. Both go through
 * `writeChange`, as every change does, and answer with what Grid laid out: how many bays, their ids
 * and numbers, and the ramp's rise, length and slope. What they write is the plan's own `bays` and
 * `ramps`, which the drawing, the counts, the takeoff and the checks read. The changes are
 * `edit/parking.ts`.
 *
 * A point is text, `x,y`, as rooms text writes it (a tool's lists hold text): each length in
 * metres, or with its unit.
 */
import { BAY_KINDS, BAY_ROWS, BAYS_MOST, PARKING_WAYS, type BayKind, type BayRows, type ParkingWay } from '@ongrid/floorplan/rooms'
import { RAMP_RUN_MAX } from '@ongrid/floorplan/types/floorplan'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { addRamp, placeBays, type BaysRequest, type RampRequest } from '../edit/parking'
import { NAME_MAX } from '../command/planText'
import { PathRefused } from '../fs/projectFiles'
import { DECIMAL_IN_ARG, floorArg, PLAN_ARG, projectOf, STRING, ToolRefusal, type GridTool, type ToolContext } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

type Pair = [number, number]

const POINT_MAX = 60
const LARGEST = 100_000
const NUMBER = { type: 'number' } as const
/** The sides a helix starts at, in degrees counter-clockwise from east. */
const STARTS = { east: 0, north: 90, west: 180, south: 270 } as const

/** A point written `x,y`, each length in metres or with its unit; refused naming the argument. */
function pointArg(name: string, text: string): Pair {
  const usage = `${name} takes points written x,y, each a length in metres or with its unit (3.5,0 or 12ft,0), with a decimal point.`
  const parts = text.split(',').map((p) => p.trim())
  if (parts.length !== 2 || parts.some((p) => p === '')) throw new ToolRefusal(usage)
  const length = (part: string): number => {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(part)) return Number(part)
    try {
      return readLength(part)
    } catch (error) {
      if (error instanceof LengthRefused) throw new ToolRefusal(usage)
      throw error
    }
  }
  const point: Pair = [length(parts[0]!), length(parts[1]!)]
  if (!point.every((v) => Number.isFinite(v) && Math.abs(v) <= LARGEST)) throw new ToolRefusal(`${name} takes points within ${LARGEST} m of the drawing's origin.`)
  return point
}

/** An out path outside the project is refused before anything is laid out, whatever the plan holds. */
function outFirst(context: ToolContext, args: Record<string, unknown>): void {
  const out = args['out']
  if (typeof out !== 'string') return
  try {
    projectOf(context).resolve(out)
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw error
  }
}

const given = <T>(args: Record<string, unknown>, key: string): { [k: string]: T } => (args[key] === undefined ? {} : { [key]: args[key] as T })

export const placeBaysTool: GridTool = {
  name: 'grid_place_bays',
  title: 'Place rows of parking bays in a room',
  hint: 'change-plan',
  description:
    'Use this when a car park, a basement or a garage needs its parking bays: "fill the deck with 2.5 by 5 m bays and 6 m aisles", "a row of accessible bays along the north wall", "number them from B1-001". '
    + 'It writes the plan\'s own bays, which the drawing, the bay counts by floor, the takeoff and the checks read: never draw bays as rooms or walls, or write hundreds of them into the plan file by hand. '
    + 'Give group (the bays are <group>-1, <group>-2, ...) and room, then the module: width and length, or kind (car, small, accessible, motorcycle: Grid\'s own starting sizes, not a code\'s). With along, one row against that side (count, offset from the face, inset and from which end); without it, the room is filled with rows and the aisles between them (aisle wide, rows east-west or north-south, from the side they start at), leaving out bays that would stand on a column or another bay. '
    + 'The bays are numbered on from the floor\'s highest number unless numbered gives the first. Placing a group again replaces its bays. It answers with how many it placed, their ids and numbers, and what it chose. '
    + 'Rooms text writes the same: bays f in deck fill, 2.5 x 5, aisle 6. Do not use for a ramp (grid_add_ramp). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    group: { type: 'string', id: true, required: true, description: 'The group\'s id: its bays are <group>-1, <group>-2 and on. Placing a group again replaces its bays.', examples: ['b1-east', 'f'] },
    room: { type: 'string', id: true, required: true, description: 'The room the bays go in, inside its walls.', examples: ['deck'] },
    along: { type: 'string', enum: PARKING_WAYS, description: 'One row against this side of the room, the bays\' length across it. Left out, the room is filled with rows and aisles.', examples: ['north'] },
    width: { type: 'number', length: true, description: 'A bay\'s width, along its row; with length.', examples: [2.5], minimum: 0.5, maximum: 20 },
    length: { type: 'number', length: true, description: 'A bay\'s length, across its row; with width.', examples: [5], minimum: 0.5, maximum: 30 },
    kind: { type: 'string', enum: BAY_KINDS, description: 'In place of width and length: Grid\'s own starting size for the kind (car 2.5 x 5, small 2.3 x 4.5, accessible 3.6 x 5, motorcycle 1 x 2.2), not a code\'s. The plan records the size only. car when nothing is given.', examples: ['accessible'] },
    aisle: { type: 'number', length: true, description: 'For a fill: the width of each aisle between rows. Grid\'s own 6 m when left out.', examples: [6], minimum: 1, maximum: 30 },
    rows: { type: 'string', enum: BAY_ROWS, description: 'For a fill: the way the rows run. Along the room\'s longer side when left out.', examples: ['east-west'] },
    from: { type: 'string', enum: PARKING_WAYS, description: 'For a fill: the side the first row is against (south or west when left out). For a row along a side: the end it starts at (west or south when left out).', examples: ['south'] },
    count: { type: 'number', description: 'How many bays at most; as many as fit when left out.', examples: [12], minimum: 1, maximum: BAYS_MOST },
    offset: { type: 'number', length: true, description: 'For a row along a side: its distance from the face. 0 when left out.', examples: [0.5], minimum: 0, maximum: 100 },
    inset: { type: 'number', length: true, description: 'For a row along a side: its distance from the end it starts at. 0 when left out.', examples: [1], minimum: 0, maximum: 1000 },
    numbered: { type: 'string', maxLength: 40, description: 'The first bay\'s number, a number or text ending in one; the others count on, keeping its digits (B1-007, B1-008). Left out, on from the floor\'s highest number, or 1.', examples: ['B1-001', '1'] },
    floor: { type: 'string', id: true, description: 'The floor of the room, when rooms on several floors share its id. The room\'s own floor when left out.', examples: ['b1'] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), bays: NUMBER, group: STRING, first: STRING, last: STRING } },
  run(args, context) {
    outFirst(context, args)
    const count = args['count'] as number | undefined
    if (count !== undefined && !Number.isInteger(count)) throw new ToolRefusal('count takes a whole number.')
    const request: BaysRequest = {
      group: args['group'] as string,
      room: args['room'] as string,
      ...given<ParkingWay>(args, 'along'),
      ...given<number>(args, 'width'),
      ...given<number>(args, 'length'),
      ...given<BayKind>(args, 'kind'),
      ...given<number>(args, 'aisle'),
      ...given<BayRows>(args, 'rows'),
      ...given<ParkingWay>(args, 'from'),
      ...given<number>(args, 'count'),
      ...given<number>(args, 'offset'),
      ...given<number>(args, 'inset'),
      ...given<string>(args, 'numbered'),
    }
    return writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor'])
      return placeBays(survey, floor === undefined ? request : { ...request, floor })
    })
  },
}

export const addRampTool: GridTool = {
  name: 'grid_add_ramp',
  title: 'Add a ramp between two floors',
  hint: 'change-plan',
  description:
    'Use this when a car park needs its ramp between two floors: "a straight ramp down to the basement along the west wall", "a helix ramp in the spiral core, two turns". '
    + 'It writes the plan\'s own ramp, which the drawing, the slab openings and the slope check read: never draw a ramp or a helix as a room. '
    + 'Give from and to (floors, or rooms that stand for their floors) and width, then either room, shape straight and runs (Grid lays it from face to face of the room, centred or along a side), shape helix (round at, or the middle of room; radius to its middle line, the largest the room holds when left out; turns; starts at a side or an angle; clockwise), or run, the middle line itself. '
    + 'It answers with the rise, the length along the middle line and the slope Grid works out from the floors\' levels, and refuses a ramp that does not fit its room, naming the room\'s size. '
    + 'Rooms text writes the same: ramp h from b1 to ground in spiral, 3.5 wide, helix, turns 1. Do not use for bays (grid_place_bays) or for a stair (grid_add_stair). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    id: { type: 'string', id: true, description: 'Its id; ramp-<n> when left out.', examples: ['r1', 'helix'] },
    name: { type: 'string', maxLength: NAME_MAX, description: 'The person\'s name for it.', examples: ['Down ramp'] },
    from: { type: 'string', id: true, required: true, description: 'The floor the middle line starts on: a floor\'s id, or a room\'s, which stands for its floor. Either end may be the higher.', examples: ['b1'] },
    to: { type: 'string', id: true, required: true, description: 'The floor it ends on: a floor\'s id, or a room\'s.', examples: ['ground'] },
    width: { type: 'number', length: true, required: true, description: 'The ramp\'s width, across its middle line.', examples: [3.5], minimum: 1, maximum: 30 },
    room: { type: 'string', id: true, description: 'The room it is laid in, for a straight ramp or a helix. Left out, the room from (or else to) names.', examples: ['spiral'] },
    shape: { type: 'string', enum: ['straight', 'helix'], description: 'straight, from face to face of its room, or helix, round a circle. straight when left out.', examples: ['helix'] },
    runs: { type: 'string', enum: PARKING_WAYS, description: 'For a straight ramp: the way it goes from the from floor, a side of the drawing.', examples: ['north'] },
    along: { type: 'string', enum: PARKING_WAYS, description: 'For a straight ramp: the side of the room it goes against, across runs. Centred across the room when left out.', examples: ['west'] },
    at: { type: 'string', maxLength: POINT_MAX, description: 'For a helix: its middle, "x,y". The middle of its room when left out.', examples: ['36,10'] },
    radius: { type: 'number', length: true, description: 'For a helix: the radius to its middle line. The largest its room holds when left out.', examples: [4], minimum: 0.5, maximum: 200 },
    turns: { type: 'number', description: 'For a helix: how many full turns between its two floors. 1 when left out.', examples: [1, 1.5], minimum: 0.1, maximum: 5 },
    starts: { type: 'string', maxLength: 12, description: 'For a helix: where on its circle it starts, a side (north, south, east, west) or degrees counter-clockwise from east. south when left out.', examples: ['west', '45'] },
    clockwise: { type: 'boolean', description: 'For a helix: it turns clockwise going from the from floor. Counter-clockwise when left out.', examples: [true] },
    run: { type: 'array', items: { maxLength: POINT_MAX }, minItems: 2, maxItems: RAMP_RUN_MAX, description: 'In place of room and shape: the middle line, each point "x,y": its edge on the from floor, each turn, and its edge on the to floor.', examples: [['2,2', '20,2']] },
    slope: { type: 'number', description: 'The slope the design means, in percent, which the check holds the drawn slope to.', examples: [15], minimum: 0.1, maximum: 100 },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), ramp: STRING, rise: NUMBER, length: NUMBER, slope: NUMBER, points: NUMBER } },
  run(args, context) {
    outFirst(context, args)
    const startsText = args['starts'] as string | undefined
    let starts: number | undefined
    if (startsText !== undefined) {
      const side = (STARTS as Readonly<Record<string, number>>)[startsText]
      starts = side ?? Number(startsText)
      if (!Number.isFinite(starts)) throw new ToolRefusal('starts takes a side (north, south, east or west) or degrees counter-clockwise from east.')
    }
    const request: RampRequest = {
      ...given<string>(args, 'id'),
      ...(args['name'] === undefined ? {} : { name: (args['name'] as string).normalize('NFC') }),
      from: args['from'] as string,
      to: args['to'] as string,
      width: args['width'] as number,
      ...given<string>(args, 'room'),
      ...given<'straight' | 'helix'>(args, 'shape'),
      ...given<ParkingWay>(args, 'runs'),
      ...given<ParkingWay>(args, 'along'),
      ...(args['at'] === undefined ? {} : { at: pointArg('at', args['at'] as string) }),
      ...given<number>(args, 'radius'),
      ...given<number>(args, 'turns'),
      ...(starts === undefined ? {} : { starts }),
      ...(args['clockwise'] === true ? { clockwise: true } : {}),
      ...(args['run'] === undefined ? {} : { run: (args['run'] as string[]).map((p) => pointArg('run', p)) }),
      ...given<number>(args, 'slope'),
    }
    return writeChange(context, args, (survey) => addRamp(survey, request))
  },
}

export const PARKING_TOOLS: readonly GridTool[] = [placeBaysTool, addRampTool]
