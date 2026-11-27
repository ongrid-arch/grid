/**
 * ARE-68: the arguments of `grid_areas` and `grid_compare` for the lettable area and the area per
 * person, and the brief's `people` schema: who the building is for, as the call or the brief gives it.
 */
import { ROOM_TENURES, ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { PEOPLE_KINDS, PEOPLE_MAX, readPeople, type PeopleFigures } from '../quantities/lettable'
import { ToolRefusal, type ArgSpec } from './toolkit'

/** One figure for who the building is for: a whole number, or a count and the rooms it is for. */
const FIGURE_SCHEMA = {
  anyOf: [
    { type: 'integer', minimum: 1, maximum: PEOPLE_MAX },
    {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1, maximum: PEOPLE_MAX },
        rooms: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 500, description: 'The rooms it is for, by id or name; the whole building when left out.' },
      },
      required: ['count'],
      additionalProperties: false,
    },
  ],
}

/** The brief's and the call's `people`: each figure by its name. */
export const PEOPLE_SCHEMA = {
  type: 'object',
  description: `Who the building, or some of its rooms, is for: ${PEOPLE_KINDS.join(', ')}, each a whole number or a count with the rooms it is for. A fact, not a wish: grid_areas and grid_compare give the area per one of each.`,
  properties: Object.fromEntries(PEOPLE_KINDS.map((kind) => [kind, FIGURE_SCHEMA])),
  additionalProperties: false,
}

export const PEOPLE_ARG: ArgSpec = {
  type: 'object',
  description:
    `Who the building, or some of its rooms, is for, when the person says it: ${PEOPLE_KINDS.join(', ')}, each a whole number or a count with the rooms it is for. `
    + 'The answer gives the gross internal, gross external, net and lettable area per one (per pupil, per key, per cover); for named rooms, their net per one. Left out, the brief\'s people, else the covers and desks counted from the furniture.',
  examples: [{ pupils: 420 }, { keys: 120, covers: { count: 80, rooms: ['restaurant'] } }],
  schema: PEOPLE_SCHEMA,
  read(value) {
    const read = readPeople(value, 'people')
    if (typeof read === 'string') throw new ToolRefusal(`${read}.`)
    if (Object.keys(read).length === 0) throw new ToolRefusal(`people takes at least one figure: ${PEOPLE_KINDS.join(', ')}.`)
    return read
  },
}

export const LETTABLE_USES_ARG: ArgSpec = {
  type: 'array',
  description: 'The room uses the person counts as lettable or saleable, in place of Grid\'s reading (a room\'s stated tenure, else every use but stair, lift, plant, corridor and parking). With lettable_tenures, a room of either is lettable.',
  examples: [['office'], ['retail', 'storage']],
  items: { enum: [...ROOM_USES] },
  minItems: 1,
  maxItems: ROOM_USES.length,
}

export const LETTABLE_TENURES_ARG: ArgSpec = {
  type: 'array',
  description: 'The tenures the person counts as lettable or saleable (rooms marked private, shared, common or commercial), in place of Grid\'s reading. With lettable_uses, a room of either is lettable.',
  examples: [['commercial'], ['private', 'commercial']],
  items: { enum: [...ROOM_TENURES] },
  minItems: 1,
  maxItems: ROOM_TENURES.length,
}

export type { PeopleFigures }
