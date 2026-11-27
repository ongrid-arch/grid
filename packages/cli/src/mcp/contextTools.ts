/**
 * Party walls and neighbours (CNT-60): `grid_set_party_wall` makes walls party walls, by a room's
 * side or by id, with a neighbour or a common part of the building beyond them, or ordinary walls
 * again; `grid_change_neighbour` adds, moves, resizes and takes out a neighbouring building or any
 * other shape drawn round the plan for context. Both go through `writeChange`, as every change
 * does; they come after the site's tools. The changes are `edit/context.ts`.
 */
import { NAME_MAX } from '../command/planText'
import { changeNeighbour, NEIGHBOUR_ACTIONS, PARTY_BEYOND, setPartyWall, type NeighbourAction, type PartyBeyond } from '../edit/context'
import { pointArg } from './siteTools'
import { DECIMAL_IN_ARG, floorArg, listSchema, PLAN_ARG, roomArg, STRING, ToolRefusal, wallArg, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

const POINTS_MAX = 2000
const POINT_MAX = 60
const LARGEST = 100_000
const WALLS_MAX = 500

export const setPartyWallTool: GridTool = {
  name: 'grid_set_party_wall',
  title: 'Mark a party wall, with a neighbour or a common part beyond it',
  hint: 'change-plan',
  description:
    'Use this when the person says a wall is shared with the house or flat next door, or with a part of the building that is not drawn: "the hall\'s west wall is a party wall", "the kitchen backs onto next door", "the bedroom wall to the landing is the flat\'s separating wall", "that is not a party wall, it is outside". '
    + 'It makes the walls on a room\'s side (room and side, as rooms text names a side: north, east, south, west, ne, east.2, a wall id or facing <room>), or the walls named by id, party walls: of kind separating, with beyond saying what lies past them, a neighbour (another home or property, the default) or common (a landing, a stair or a hall of the building that is not drawn). A door through a party wall into a neighbour is refused as a way out, and the 3D views and the GLB draw it as a cut. clear makes them ordinary walls again, outside or inside as their rooms give them. '
    + 'It answers with the walls changed and the receipt every change gives. Do not use for a wall\'s thickness (grid_change_wall), for the neighbour\'s own building (grid_change_neighbour) or for the plot (grid_set_site). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    room: { type: 'string', id: true, description: 'The room whose side is the party wall, with side.', examples: ['hall', 'kitchen'] },
    side: { type: 'string', maxLength: 200, description: 'Which side of the room, as rooms text names it: north (the top of the drawing), east, south, west; ne, nw, se or sw; east.2; a wall id; or facing <room>.', examples: ['west', 'north'] },
    walls: { type: 'array', items: { id: true }, minItems: 1, maxItems: WALLS_MAX, description: 'The walls by id, in place of room and side.', examples: [['w-west', 'w-west-2']] },
    beyond: { type: 'string', enum: [...PARTY_BEYOND], description: 'What lies past the wall: neighbour (another home or property; the default) or common (a part of the building not drawn: a landing, a stair, a hall).', examples: ['neighbour', 'common'] },
    clear: { type: 'boolean', description: 'true makes the walls ordinary walls again, of the kind their rooms give them.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), walls: listSchema(STRING) } },
  run(args, context) {
    const given = (key: string): boolean => args[key] !== undefined
    if (given('walls') && (given('room') || given('side'))) throw new ToolRefusal('Name the walls by id, or a room and its side, not both.')
    if (!given('walls') && !(given('room') && given('side'))) throw new ToolRefusal('Name the walls by id (walls), or a room and its side (room and side).')
    if (args['clear'] === true && given('beyond')) throw new ToolRefusal('clear makes the walls ordinary walls: give beyond to make them party walls instead.')
    return writeChange(context, args, (survey) =>
      setPartyWall(survey, {
        ...(given('walls') ? { walls: (args['walls'] as string[]).map((id) => wallArg(survey.plan, id)) } : { room: roomArg(survey.plan, args['room']), side: args['side'] as string }),
        ...(given('beyond') ? { beyond: args['beyond'] as PartyBeyond } : {}),
        ...(args['clear'] === true ? { clear: true } : {}),
      })
    )
  },
}

const number = (description: string, examples: number[], minimum: number, maximum: number): GridTool['args'][string] => ({ type: 'number', length: true, description, examples, minimum, maximum })

export const changeNeighbourTool: GridTool = {
  name: 'grid_change_neighbour',
  title: 'Add, move, resize or remove a neighbouring building',
  hint: 'change-plan',
  description:
    'Use this when the person gives the buildings round the plan, or any other shape drawn round it for context: "the house next door is 9 m high", "a six-storey block across the street", "the hall the stand stands in", "a 4 m high platform on the first floor", "take the old shed next door out". '
    + 'One call is one change of one shape: action add (its outline: points round it, or a box by at, its south-west corner, width east-west and depth north-south), move (id, and by: how far, or to: where its middle goes), resize (id, and its new outline, height, floor or name) or remove (id). height is how high it stands; floor the floor it stands on (left out, the ground: a shape on an upper floor stands at that floor\'s level). '
    + 'A neighbour is drawn only: in the 3D views and the GLB it is a mass from the ground (or its floor) to its height, and with no height its footprint. It is never a wall or a room, and is in no area, check or count. It answers with what changed. '
    + 'Do not use for a wall shared with the neighbour (grid_set_party_wall), for the plot (grid_set_site), or for a tree, path, pool, fence or gate (grid_change_site). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    action: { type: 'string', enum: NEIGHBOUR_ACTIONS, required: true, description: 'add, move, resize or remove.', examples: ['add', 'move'] },
    id: { type: 'string', id: true, description: 'The neighbour to move, resize or remove; for add, its id (neighbour-1 and on when left out).', examples: ['no-12', 'neighbour-1'] },
    points: { type: 'array', items: { maxLength: POINT_MAX }, minItems: 3, maxItems: POINTS_MAX, description: 'Its outline\'s corners in order round it, each "x,y" in plan metres (or with a unit: "40ft,0").', examples: [['10,0', '18,0', '18,9', '10,9']] },
    at: { type: 'string', maxLength: POINT_MAX, description: 'A box\'s south-west corner, "x,y", with width and depth, in place of points.', examples: ['10.5,0'] },
    width: number('A box\'s width, east-west on the drawing, with at and depth.', [6, 8], 0.1, LARGEST),
    depth: number('A box\'s depth, north-south on the drawing, with at and width.', [9, 12], 0.1, LARGEST),
    height: number('How high it stands, in metres, from the ground or from its floor.', [9, 18], 0.01, 1000),
    floor: { type: 'string', id: true, description: 'The floor it stands on, by id; left out, the ground.', examples: ['first'] },
    name: { type: 'string', maxLength: NAME_MAX, description: 'What the person calls it.', examples: ['No. 12', 'Exhibition hall'] },
    by: { type: 'string', maxLength: POINT_MAX, description: 'For move: how far, "dx,dy" (2,0 is 2 m east on the drawing).', examples: ['2,0'] },
    to: { type: 'string', maxLength: POINT_MAX, description: 'For move: where the middle of the box round it goes, "x,y".', examples: ['14,4.5'] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), neighbour: STRING } },
  run(args, context) {
    const given = (key: string): boolean => args[key] !== undefined
    const box = ['at', 'width', 'depth'].filter(given)
    if (box.length > 0 && box.length < 3) throw new ToolRefusal('A box takes at, width and depth together: its south-west corner and its size.')
    const point = (key: string): [number, number] | undefined => (given(key) ? pointArg(key, args[key] as string) : undefined)
    const changed = writeChange(context, args, (survey) =>
      changeNeighbour(survey, {
        action: args['action'] as NeighbourAction,
        ...(given('id') ? { id: args['id'] as string } : {}),
        ...(given('points') ? { points: (args['points'] as string[]).map((p) => pointArg('points', p)) } : {}),
        ...(box.length === 3 ? { box: { at: point('at')!, width: args['width'] as number, depth: args['depth'] as number } } : {}),
        ...(given('height') ? { height: args['height'] as number } : {}),
        ...(given('floor') ? { floor: floorArg(survey.plan, args['floor'])! } : {}),
        ...(given('name') ? { name: args['name'] as string } : {}),
        ...(point('by') === undefined ? {} : { by: point('by')! }),
        ...(point('to') === undefined ? {} : { to: point('to')! }),
      })
    )
    return changed
  },
}

export const CONTEXT_TOOLS: readonly GridTool[] = [setPartyWallTool, changeNeighbourTool]
