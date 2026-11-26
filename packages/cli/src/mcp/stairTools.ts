/**
 * The stairs' tools (LVL-21): `grid_add_stair` adds a stair, laid in a room by the same words as
 * a rooms text `stair` line or along a walking line of its own, and `grid_change_stair` changes or
 * removes one. Both go through `writeChange`, as every change does, and answer with what Grid
 * worked out for the stair: its risers, their height, the going, the pitch and the rooms at its
 * ends. The stair is the plan's own `stairs` entry, which the drawing, the sections, the 3D model,
 * the IFC export and the way-out check read. The changes are `edit/stairs.ts`.
 *
 * A point is text, `x,y`, as rooms text writes it (a tool's lists hold text): each length in
 * metres, or with its unit.
 */
import { STAIR_SHAPES, STAIR_WAYS, type StairShape, type StairWay } from '@ongrid/floorplan/rooms'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { addStair, changeStair, type StairRequest } from '../edit/stairs'
import { NAME_MAX } from '../command/planText'
import { PathRefused } from '../fs/projectFiles'
import { DECIMAL_IN_ARG, listSchema, PLAN_ARG, projectOf, STRING, ToolRefusal, type ArgSpecs, type GridTool, type ToolContext } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

type Pair = [number, number]

/** The most points a walking line takes (the schema's own limit), the longest point text, and the farthest a point lies. */
const RUN_MAX = 64
const POINT_MAX = 60
const LARGEST = 100_000

/** A point written `x,y`, each length in metres or with its unit; refused naming the argument. */
function pointArg(text: string): Pair {
  const usage = 'run takes points written x,y, each a length in metres or with its unit (3.5,0 or 12ft,0), with a decimal point.'
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
  if (!point.every((v) => Number.isFinite(v) && Math.abs(v) <= LARGEST)) throw new ToolRefusal(`run takes points within ${LARGEST} m of the drawing's origin.`)
  return point
}

const STAIR_ARGS: ArgSpecs = {
  plan: PLAN_ARG,
  decimal: DECIMAL_IN_ARG,
  from: { type: 'string', id: true, description: 'The floor the walking line starts on: a floor\'s id, or a room\'s, which stands for its floor. Either end may be the higher.', examples: ['ground', 'hall'] },
  to: { type: 'string', id: true, description: 'The floor it ends on: a floor\'s id, or a room\'s.', examples: ['first', 'landing'] },
  width: { type: 'number', length: true, description: 'The width of the flight, across its walking line.', examples: [0.9, 1], minimum: 0.3, maximum: 20 },
  room: { type: 'string', id: true, description: 'The room it is laid in, with shape and runs: inside its walls, with a landing as deep as the stair is wide at each end. Left out, the room from (or else to) names.', examples: ['hall', 'stair'] },
  shape: { type: 'string', enum: STAIR_SHAPES, description: 'straight, L (a quarter turn on a square landing in the far corner) or U (up one side and back down the other, a short flight across the well between two landings). straight when left out.', examples: ['U', 'straight'] },
  runs: { type: 'string', enum: STAIR_WAYS, description: 'The way the walking line goes from the from floor, a side of the drawing (north is up it).', examples: ['north'] },
  then: { type: 'string', enum: STAIR_WAYS, description: 'For an L or a U: the way it turns, across runs. A quarter turn clockwise from runs when left out.', examples: ['west'] },
  along: { type: 'string', enum: STAIR_WAYS, description: 'For a straight stair: the side of the room it goes up against, across runs. Centred across the room when left out.', examples: ['east'] },
  run: { type: 'array', items: { maxLength: POINT_MAX }, minItems: 2, maxItems: RUN_MAX, description: 'In place of room, shape and runs: the walking line down the middle of the flight, each point "x,y": its foot on the from floor, each turn (a square landing as wide as the flight), and its head.', examples: [['1.2,1', '1.2,4.5']] },
  risers: { type: 'number', description: 'How many risers, when the design has chosen. Grid works the count out from the rise and the going when left out; 0 leaves it to Grid again.', examples: [16], minimum: 0, maximum: 600 },
  name: { type: 'string', maxLength: NAME_MAX, description: 'The person\'s name for it.', examples: ['Main stair'] },
}

/** The request from the call's arguments, each only when given. */
function requestOf(args: Record<string, unknown>): StairRequest {
  const text = (key: string): string | undefined => args[key] as string | undefined
  const risers = args['risers'] as number | undefined
  if (risers !== undefined && !Number.isInteger(risers)) throw new ToolRefusal('risers takes a whole number.')
  return {
    ...(text('id') === undefined ? {} : { id: text('id')! }),
    ...(text('name') === undefined ? {} : { name: text('name')!.normalize('NFC') }),
    ...(text('from') === undefined ? {} : { from: text('from')! }),
    ...(text('to') === undefined ? {} : { to: text('to')! }),
    ...(args['width'] === undefined ? {} : { width: args['width'] as number }),
    ...(text('room') === undefined ? {} : { room: text('room')! }),
    ...(text('shape') === undefined ? {} : { shape: text('shape') as StairShape }),
    ...(text('runs') === undefined ? {} : { runs: text('runs') as StairWay }),
    ...(text('then') === undefined ? {} : { then: text('then') as StairWay }),
    ...(text('along') === undefined ? {} : { along: text('along') as StairWay }),
    ...(args['run'] === undefined ? {} : { run: (args['run'] as string[]).map(pointArg) }),
    ...(risers === undefined ? {} : { risers }),
  }
}

/** An out path outside the project is refused before the stair is laid out, whatever the plan holds. */
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

const STAIR_OUTPUT = { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), stair: STRING, stairs: listSchema(STRING) } }

/** The plan's stairs after the change, by id, for the answer's data. */
function withStairs(changed: { text: string; data: Record<string, unknown> }, survey: () => readonly { id: string }[]): { text: string; data: Record<string, unknown> } {
  return { text: changed.text, data: { ...changed.data, stairs: survey().map((s) => s.id) } }
}

export const addStairTool: GridTool = {
  name: 'grid_add_stair',
  title: 'Add a stair between two floors',
  hint: 'change-plan',
  description:
    'Use this when a plan of more than one floor needs its stair: "a straight stair up from the hall", "a U stair in the stair core", "an L stair to the loft, turning west". '
    + 'It adds the plan\'s own stair, which the drawing (treads, break line, arrow), the sections, the 3D model, the IFC export and the way-out check read: never draw treads as walls or leave the stair an empty room. '
    + 'Give from and to (floors, or rooms that stand for their floors) and width, then either room, shape and runs (Grid lays the walking line in the room, a landing as deep as the stair is wide at each end) or run, the walking line itself. '
    + 'It answers with what Grid worked out: the risers, their height, the going, the pitch and the rooms the stair leaves from and arrives in, and refuses a stair that does not fit its room, naming the room\'s size. '
    + 'Rooms text writes the same: stair st from ground to first in hall, 1 wide, U, runs north. Do not use to change or remove a stair (grid_change_stair), for a ramp, or for a lift. It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    ...STAIR_ARGS,
    id: { type: 'string', id: true, description: 'Its id; stair-<n> when left out.', examples: ['st', 'main-stair'] },
    from: { ...(STAIR_ARGS['from'] as object), required: true } as ArgSpecs[string],
    to: { ...(STAIR_ARGS['to'] as object), required: true } as ArgSpecs[string],
    width: { ...(STAIR_ARGS['width'] as object), required: true } as ArgSpecs[string],
    out: OUT_ARG,
  },
  outputSchema: STAIR_OUTPUT,
  run(args, context) {
    outFirst(context, args)
    const request = requestOf(args)
    let after: readonly { id: string }[] = []
    const changed = writeChange(context, args, (survey) => {
      const patch = addStair(survey, request)
      after = (patch.plan?.['stairs'] as { id: string }[] | undefined) ?? []
      return patch
    })
    return withStairs(changed, () => after)
  },
}

export const changeStairTool: GridTool = {
  name: 'grid_change_stair',
  title: 'Change or remove a stair',
  hint: 'change-plan',
  description:
    'Use this when the person asks to change a stair the plan has: "make the stair 1.1 m wide", "turn it into a U", "run it east", "move it to the other hall", "16 risers", or "take the stair out". '
    + 'Name it by id (grid_describe lists the stairs), then give what changes: from, to, width, room, shape, runs, then, along, risers or name, or run, a new walking line; or remove. A stair laid in a room is laid out again from its words with the new ones; one along a walking line of its own keeps its line unless run is given. '
    + 'It answers with what changed and what Grid worked out for the stair, and refuses, with nothing written, a stair that does not fit its room. '
    + 'Do not use to add a stair (grid_add_stair). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    ...STAIR_ARGS,
    id: { type: 'string', id: true, required: true, description: 'The stair to change.', examples: ['st'] },
    remove: { type: 'boolean', description: 'Take the stair out of the plan.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: STAIR_OUTPUT,
  run(args, context) {
    outFirst(context, args)
    const request = requestOf(args)
    let after: readonly { id: string }[] = []
    const changed = writeChange(context, args, (survey) => {
      const patch = changeStair(survey, { ...request, id: args['id'] as string, ...(args['remove'] === true ? { remove: true } : {}) })
      const listed = patch.plan?.['stairs'] as { id: string }[] | null | undefined
      after = listed === null ? [] : (listed ?? survey.plan.stairs ?? [])
      return patch
    })
    return withStairs(changed, () => after)
  },
}

export const STAIR_TOOLS: readonly GridTool[] = [addStairTool, changeStairTool]
