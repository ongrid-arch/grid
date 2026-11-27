/**
 * The floor-to-floor tool (LVL-24): `grid_set_levels` sets the distance from each floor's level to
 * the next one's, for every floor, one building's or the floors listed, as their elevations, and
 * their height to the slab over them; and may set their rooms' height, floor to ceiling, with it. The change is `edit/levels.ts`, through `writeChange` as
 * every change is; its answer lists every floor's level, floor-to-floor and clear height, and the
 * building's height from its datum.
 */
import { setLevels } from '../edit/levels'
import { DECIMAL_IN_ARG, listSchema, NUMBER, objectSchema, PLAN_ARG, STRING, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

const LEVEL = objectSchema({ floor: STRING, building: { type: ['string', 'null'] }, level: NUMBER, floorToFloor: NUMBER, clearHeight: NUMBER }, ['floor', 'building', 'level', 'floorToFloor', 'clearHeight'])

export const setLevelsTool: GridTool = {
  name: 'grid_set_levels',
  title: 'Set the floor-to-floor height of the floors',
  hint: 'change-plan',
  description:
    'Use this when the person gives the distance from one floor level to the next: "3.9 m floor to floor", "the ground floor is 4.5 m floor to floor, the rest 3.6 m", "the offices are 3.75 m floor to floor with 2.7 m ceilings". '
    + 'It stacks the floors by it, so a tower\'s height is its storeys\' floor-to-floor summed, and no elevation is added up by hand: the lowest floor at or above level 0 keeps its level, each floor over it stands its floor-to-floor over the one under it, and each basement its floor-to-floor under the one over it. It writes them as the floors\' elevations. '
    + 'Leave floors out to set every floor (of building, when given); list floors to set those, and the floors over them move with them, keeping their own. Each floor set gets the floor-to-floor less the slab over it as its height, so its walls meet that slab: the floor-to-floor wins over a height the floor stated, and the answer says it. ceiling sets the height of the rooms on those floors, floor to ceiling, under a lower ceiling. '
    + 'The answer lists every floor\'s level, floor-to-floor and height, and the building\'s height with what it is measured from. '
    + 'A floor\'s height in the plan is its clear height, what its walls take, never its floor-to-floor. Do not use for one floor\'s elevation or height on its own (grid_set), nor for a building\'s pad (grid_set_building). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    floorToFloor: { type: 'number', length: true, required: true, description: 'Metres from each floor\'s level to the level of the floor over it; the top floor\'s to the top of its roof slab.', examples: [3.9, 4.5], minimum: 0.01, maximum: 100 },
    floors: { type: 'array', description: 'The floors it is set on, by id. Every floor (of building, when given) when left out.', examples: [['ground']], items: { id: true }, minItems: 1, maxItems: 500 },
    building: { type: 'string', id: true, description: 'The building whose floors it is set on, by id, in a plan of many buildings. Every building when left out.', examples: ['tower-a'] },
    ceiling: { type: 'number', length: true, description: 'The rooms\' height on the same floors, floor to ceiling: a suspended ceiling under the slab. Left out, the rooms keep theirs.', examples: [2.7], minimum: 0.01, maximum: 100 },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), levels: listSchema(LEVEL) } },
  run(args, context) {
    return writeChange(context, args, (survey) =>
      setLevels(survey, {
        floorToFloor: args['floorToFloor'] as number,
        ...(args['floors'] === undefined ? {} : { floors: args['floors'] as string[] }),
        ...(args['building'] === undefined ? {} : { building: args['building'] as string }),
        ...(args['ceiling'] === undefined ? {} : { ceiling: args['ceiling'] as number }),
      }))
  },
}
