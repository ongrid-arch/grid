/**
 * `grid_set_facts` (WRT-74): facts of the person's own and a room's number written into the plan,
 * on parts named by id or picked as `grid_find` picks them (the same `kind`, `floor`, `room` and
 * `where`), so "lot 7 is sold" and "every room on the first floor is Sales" are each one call. The
 * change is `edit/facts.ts`, written through `writeChange` as every change is, and the answer says
 * what changed on which parts and what was so already.
 */
import { PART_KINDS, type PartKind } from '../quantities/query'
import type { FactValue } from '@ongrid/floorplan/types/floorplan'
import { NAME_MAX } from '../command/planText'
import { setFacts } from '../edit/facts'
import { FLOOR_ARG, floorArg, listSchema, objectSchema, PLAN_ARG, roomArg, STRING, ToolRefusal, type GridTool } from './toolkit'
import { KIND_ARG, ROOM_IN_ARG, WHERE_ARG } from './readTools'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

export const SET_FACTS_TOOL_NAME = 'grid_set_facts'

/** The most facts one call sets, and the most parts it names by id. */
const FACTS_MAX = 30
const PARTS_MAX = 2000

/** The facts to set, by name: text, a number, or true or false. */
function readSet(value: unknown): Record<string, FactValue> {
  const record = value as Record<string, unknown>
  const names = Object.keys(record)
  if (names.length > FACTS_MAX) throw new ToolRefusal(`set takes at most ${FACTS_MAX} facts in one call.`)
  const out: Record<string, FactValue> = {}
  for (const name of names) {
    const fact = record[name]
    if (name.length > NAME_MAX) throw new ToolRefusal(`A fact's name in set is longer than ${NAME_MAX} characters.`)
    if (typeof fact === 'string') {
      if (fact.length > NAME_MAX) throw new ToolRefusal(`The value of a fact in set is longer than ${NAME_MAX} characters.`)
      out[name.normalize('NFC')] = fact.normalize('NFC')
    } else if ((typeof fact === 'number' && Number.isFinite(fact)) || typeof fact === 'boolean') out[name.normalize('NFC')] = fact
    else throw new ToolRefusal('Each fact in set takes text, a number, or true or false: take one out with unset.')
  }
  return out
}

const PART_DONE = objectSchema({ kind: STRING, id: STRING, set: { type: 'object' }, unset: listSchema(STRING), number: { type: ['string', 'null'] } }, ['kind', 'id', 'set', 'unset'])

export const setFactsTool: GridTool = {
  name: SET_FACTS_TOOL_NAME,
  title: 'Set facts and a room number',
  hint: 'change-plan',
  description:
    'Use this when the person tells you something about parts of the plan to record: a department, a status, a zone, a head count, a fire rating, a room number. "Lot 7 is sold", "every room on the first floor is Sales", "the meeting room is 2.03", "these doors are EI 30". '
    + 'Name the parts by id in parts (any kind), or pick them as grid_find does (kind, floor, room, where), or both, each narrowing the other; pass kind, or every kind of part picked gets the fact. set gives facts by name, as text, a number or true or false; unset takes facts out; number gives one room its number, or none to leave it to Grid\'s count. '
    + 'A name the plan already spells otherwise (Department for department) keeps the plan\'s spelling. It answers with what changed on which parts and what was so already; grid_find, grid_count and grid_view colour then read the facts. Grid checks nothing against a fact. '
    + 'Do not use to rename a room or change its use (grid_rename_room), or for anything Grid measures, such as an area. It replaces the plan file unless out is given. A length in a where condition is metres unless it gives its unit (900 mm).',
  args: {
    plan: PLAN_ARG,
    parts: {
      type: 'array',
      description: 'The parts to change, by id: walls, doors, windows, openings, rooms or floors, as grid_find lists them. With kind, floor, room or where, only those of them that are picked.',
      examples: [['lot-7'], ['g-office', 'g-meeting']],
      items: { id: true },
      minItems: 1,
      maxItems: PARTS_MAX,
    },
    kind: KIND_ARG,
    floor: FLOOR_ARG,
    room: ROOM_IN_ARG,
    where: WHERE_ARG,
    set: {
      type: 'object',
      description: 'Facts to give every part named, by name: text, a number, or true or false. A fact the part has is replaced.',
      examples: [{ department: 'Sales' }, { status: 'sold' }, { capacity: 4, bookable: true }],
      schema: {
        type: 'object',
        properties: {},
        additionalProperties: { type: ['string', 'number', 'boolean'], maxLength: NAME_MAX },
        maxProperties: FACTS_MAX,
      },
      read: (value) => readSet(value),
    },
    unset: {
      type: 'array',
      description: 'Facts to take off every part named, by name. A part that does not carry one is said to.',
      examples: [['status'], ['fire rating', 'zone']],
      items: { maxLength: NAME_MAX },
      minItems: 1,
      maxItems: FACTS_MAX,
    },
    number: {
      type: 'string',
      maxLength: NAME_MAX,
      description: 'One room\'s number as the person states it (2.03, G.01, 101), or none to leave it to Grid\'s count. Name one room only. Refused when another room has it.',
      examples: ['2.03', 'none'],
    },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), parts: listSchema(PART_DONE) } },
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const room = args['room'] === undefined ? undefined : roomArg(survey.plan, args['room'])
      const floor = floorArg(survey.plan, args['floor'])
      const kinds = args['kind'] as PartKind[] | undefined
      if (kinds !== undefined && kinds.some((kind) => !(PART_KINDS as readonly string[]).includes(kind))) throw new ToolRefusal(`kind takes ${PART_KINDS.join(', ')}.`)
      return setFacts(survey, {
        ...(args['parts'] === undefined ? {} : { parts: args['parts'] as string[] }),
        selection: {
          ...(kinds === undefined ? {} : { kinds }),
          ...(floor === undefined ? {} : { floor }),
          ...(room === undefined ? {} : { room }),
          ...(args['where'] === undefined ? {} : { where: args['where'] as string[] }),
        },
        ...(args['number'] === undefined ? {} : { number: args['number'] as string }),
        ...(args['set'] === undefined ? {} : { set: args['set'] as Record<string, FactValue> }),
        ...(args['unset'] === undefined ? {} : { unset: args['unset'] as string[] }),
      })
    })
  },
}
