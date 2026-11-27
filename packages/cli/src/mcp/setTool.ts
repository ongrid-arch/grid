/**
 * `grid_set` (CMD-42): any field of walls, rooms, floors, columns, stairs, ramps, bays and
 * structural grids set by id, each value checked by the plan schema. The change is `edit/set.ts`,
 * written through `writeChange` as every change is, so it answers with the receipt every edit
 * gives, and takes `based_on` and answers the plan's revision through the server (`revisions.ts`).
 */
import { roofOfWords } from '@ongrid/floorplan/rooms'
import type { FloorPlan, Roof } from '@ongrid/floorplan/types/floorplan'
import { NAME_MAX } from '../command/planText'
import { SET_KINDS, setFields, type SetKind } from '../edit/set'
import { listSchema, objectSchema, PLAN_ARG, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

export const SET_TOOL_NAME = 'grid_set'

/** The most fields one call sets, the most parts it names, and the longest value as JSON. */
const FIELDS_MAX = 20
const PARTS_MAX = 500
const VALUE_MAX = 50_000

/** The fields to set, by name, each value as the file holds it. */
function readSet(value: unknown): Record<string, unknown> {
  const record = value as Record<string, unknown>
  const names = Object.keys(record)
  if (names.length === 0) throw new ToolRefusal('set names no field: give at least one, or leave set out.')
  if (names.length > FIELDS_MAX) throw new ToolRefusal(`set takes at most ${FIELDS_MAX} fields in one call.`)
  for (const name of names) {
    if (name.length > NAME_MAX) throw new ToolRefusal(`A field's name in set is longer than ${NAME_MAX} characters.`)
    const text = JSON.stringify(record[name])
    if (text === undefined || record[name] === null) throw new ToolRefusal(`set gives ${name} no value: take a field out with unset.`)
    if (text.length > VALUE_MAX) throw new ToolRefusal(`The value of ${name} in set is longer than ${VALUE_MAX} characters as JSON.`)
  }
  return record
}

/** WRT-79: the roof the words of a roof line write, as the plan file holds it; null for none. */
function readRoof(value: unknown): Roof | null {
  const text = String(value).trim().replace(/^roof\s+/i, '')
  try {
    return roofOfWords(['roof', ...text.split(/[\s,]+/).filter((w) => w !== '').map((w) => w.toLowerCase())], 0)
  } catch (error) {
    if (error instanceof Error && error.name === 'RoomsStop') throw new ToolRefusal(`roof: ${error.message.replace(/^line 0: /, '')}`)
    throw error
  }
}

/** WRT-79: one floor's roof lights and dormers, kept on the roof that takes its roof's place. */
function keptOn(plan: FloorPlan, parts: readonly string[], roof: Roof | null): Roof | null {
  if (roof === null || parts.length !== 1) return roof
  const had = (plan.floors ?? []).find((f) => f.id === parts[0])?.roof
  return { ...roof, ...(had?.rooflights === undefined ? {} : { rooflights: had.rooflights }), ...(had?.dormers === undefined ? {} : { dormers: had.dormers }) }
}

const PART_DONE = objectSchema({ kind: STRING, id: STRING, set: { type: 'object' }, unset: listSchema(STRING) }, ['kind', 'id', 'set', 'unset'])

export const setTool: GridTool = {
  name: SET_TOOL_NAME,
  title: 'Set a field of parts by id',
  hint: 'change-plan',
  description:
    'Use this when the person asks for a follow-up no other change tool makes, on parts you can name by id: "raise the terrace 0.6 m" (a room\'s floorOffset), "the hall walls are 3.2 m high" (a wall\'s height), "the first floor stands at 3.4 m" (a floor\'s elevation), "curve this wall" (its arc), "the columns are 0.5 m" (a column\'s width), a floor\'s outline or roof (roof takes it in words: gable pitch 45 eaves 2.7), a room\'s height or ceiling. '
    + 'It sets fields of walls, rooms, floors, columns, stairs, ramps, bays and structural grids named in parts, every part taking the same values; set gives each field its whole value as the plan file holds it (lengths in metres, an object for arc, roof or ceiling), unset takes fields out. A field and its value are checked by the plan schema, and a change that would break the drawing is refused, with nothing written. It answers with what each field was and is now, and the area verdict; the plan JSON Schema (grid://schema/plan) lists every field. '
    + 'Do not use for what has its own tool: facts and room numbers (grid_set_facts), phases (grid_set_phase), a room\'s name, use, finishes or heating (grid_rename_room), a room\'s walls (grid_move_room_side, grid_split_room, grid_merge_rooms, grid_add_room), a wall\'s thickness (grid_change_wall) or its ends (grid_move_room_side), named types (grid_change_type), doors and windows (grid_change_opening), the plot, north and the site\'s things (grid_set_site, grid_change_site). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    parts: {
      type: 'array',
      required: true,
      description: 'The parts to change, by id: walls, rooms, floors, columns, stairs, ramps, bays or structural grids, as grid_find lists them.',
      examples: [['terrace'], ['w-hall-n', 'w-hall-s'], ['first']],
      items: { id: true },
      minItems: 1,
      maxItems: PARTS_MAX,
    },
    kind: { type: 'string', enum: SET_KINDS, description: 'Which kind of part the ids name, when one id is used by two kinds (a room and a floor both called "office").', examples: ['room', 'floor'] },
    set: {
      type: 'object',
      description: 'Fields to set on every part named, by the plan file\'s field names, each with its whole new value: a number in metres, text, true or false, a list or an object.',
      examples: [{ floorOffset: 0.6 }, { height: 3.2 }, { elevation: 3.4 }, { arc: { centre: [5, 0], sweep: 90 } }],
      schema: { type: 'object', properties: {}, additionalProperties: true, maxProperties: FIELDS_MAX },
      read: (value) => readSet(value),
    },
    unset: {
      type: 'array',
      description: 'Fields to take out of every part named, so Grid reads them as unstated: a wall\'s height then comes from its floor.',
      examples: [['floorOffset'], ['height']],
      items: { maxLength: NAME_MAX },
      minItems: 1,
      maxItems: FIELDS_MAX,
    },
    roof: {
      type: 'string',
      description:
        'For floors: the roof over them in the words of a rooms text roof line, <flat|gable|hip|mono-pitch> [pitch <degrees> | ridge <m>] eaves <m> [ridge runs east-west|north-south] [high <north|east|south|west>], heights in metres above the floor\'s level to the roof\'s underside; none takes it off. With one floor named, its roof lights and dormers stay on the new roof.',
      examples: ['gable pitch 45 eaves 2.7', 'mono-pitch pitch 10 eaves 2.4 high north', 'flat eaves 3'],
      maxLength: NAME_MAX,
    },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), parts: listSchema(PART_DONE) } },
  run(args, context) {
    const roofGiven = args['roof'] !== undefined
    const set = args['set'] as Record<string, unknown> | undefined
    if (roofGiven && set !== undefined && Object.hasOwn(set, 'roof')) throw new ToolRefusal('Give the roof once: in roof, as words, or in set, as the plan file holds it.')
    const words = roofGiven ? readRoof(args['roof']) : undefined
    return writeChange(context, args, (_survey, _problemsOf, stated) => {
      const parts = args['parts'] as string[]
      const roof = words === undefined ? undefined : keptOn(stated, parts, words)
      const unset = [...((args['unset'] as string[] | undefined) ?? []), ...(roofGiven && roof === null ? ['roof'] : [])]
      const fields = { ...(set ?? {}), ...(roof === undefined || roof === null ? {} : { roof }) }
      return setFields(stated, {
        parts,
        ...(args['kind'] === undefined ? (roofGiven ? { kind: 'floor' as SetKind } : {}) : { kind: args['kind'] as SetKind }),
        ...(Object.keys(fields).length === 0 ? {} : { set: fields }),
        ...(unset.length === 0 ? {} : { unset }),
      })
    })
  },
}
