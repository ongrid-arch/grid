/**
 * `grid_set_finishes` (CNT-51): the finishes of many rooms in one call, per wall face and in height
 * bands: "oak floors everywhere but the wet rooms", "a tiled splashback 600 high behind the kitchen
 * run", "no skirting in the plant room". The change is `edit/finishes.ts`, written through
 * `writeChange` as every change is; the take-off and `grid_schedule of=finishes` then measure each
 * band and face on its own and take it off the room's walls finish.
 */
import type { FinishBand, FinishFace } from '@ongrid/floorplan/types/floorplan'
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { NAME_MAX } from '../command/planText'
import { setFinishes, WET_USES } from '../edit/finishes'
import type { FinishSurface } from '../quantities/finishes'
import { FLOOR_ARG, floorArg, ID_PATTERN, listSchema, NUMBER, objectSchema, PLAN_ARG, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

export const SET_FINISHES_TOOL_NAME = 'grid_set_finishes'

/** The most rooms one call names, and the most wall faces it sets. */
const ROOMS_MAX = 2000
const FACES_MAX = 50
/** The highest a band may stand, in metres: higher than any storey. */
const BAND_HIGHEST = 100

const FINISH = (description: string, example: string): { type: 'string'; maxLength: number; description: string; examples: string[] } => ({ type: 'string', maxLength: NAME_MAX, description, examples: [example] })

/** The wall faces to finish, by wall id: a finish, or unset. */
function readFaces(value: unknown): FinishFace[] {
  const record = value as Record<string, unknown>
  const walls = Object.keys(record)
  if (walls.length > FACES_MAX) throw new ToolRefusal(`faces takes at most ${FACES_MAX} walls in one call.`)
  return walls.map((wall) => {
    const finish = record[wall]
    if (!new RegExp(ID_PATTERN).test(wall)) throw new ToolRefusal('Each key of faces is a wall id, as grid_find kind=wall lists them.')
    if (typeof finish !== 'string' || finish.trim() === '' || finish.length > NAME_MAX) throw new ToolRefusal(`Each wall in faces takes its finish's name, at most ${NAME_MAX} characters, or unset.`)
    return { wall, finish: finish.normalize('NFC') }
  })
}

/** The one band to lay: a finish and a height, and where. */
function readBand(value: unknown): FinishBand {
  const band = value as Record<string, unknown>
  for (const key of Object.keys(band)) if (!['finish', 'height', 'from', 'wall', 'behind'].includes(key)) throw new ToolRefusal('band takes finish, height, from, wall and behind.')
  const finish = band['finish']
  if (typeof finish !== 'string' || finish.trim() === '' || finish.length > NAME_MAX) throw new ToolRefusal(`band needs its finish's name, at most ${NAME_MAX} characters.`)
  const metres = (key: string, least: number): number | undefined => {
    const v = band[key]
    if (v === undefined) return undefined
    if (typeof v !== 'number' || !Number.isFinite(v) || v < least || v > BAND_HIGHEST || (least === 0 && key === 'height' && v === 0)) throw new ToolRefusal(`band's ${key} is metres, from ${least} to ${BAND_HIGHEST}.`)
    return v
  }
  const height = metres('height', 0)
  if (height === undefined || height === 0) throw new ToolRefusal('band needs its height in metres, more than 0: 0.6 for a splashback 600 high.')
  const from = metres('from', 0)
  const id = (key: string): string | undefined => {
    const v = band[key]
    if (v === undefined) return undefined
    if (typeof v !== 'string' || !new RegExp(ID_PATTERN).test(v)) throw new ToolRefusal(`band's ${key} is an id of the plan.`)
    return v
  }
  const wall = id('wall')
  const behind = id('behind')
  return { finish: finish.normalize('NFC'), height, ...(from === undefined ? {} : { from }), ...(wall === undefined ? {} : { wall }), ...(behind === undefined ? {} : { behind }) }
}

const BAND_DONE = objectSchema({ finish: STRING, wall: { type: ['string', 'null'] }, behind: { type: ['string', 'null'] }, from: NUMBER, to: NUMBER, length: NUMBER, area: NUMBER }, ['finish', 'from', 'to', 'length', 'area'])
const ROOM_DONE = objectSchema({ room: STRING, finishes: { type: ['object', 'null'] }, bands: listSchema(BAND_DONE) }, ['room', 'finishes', 'bands'])

export const setFinishesTool: GridTool = {
  name: SET_FINISHES_TOOL_NAME,
  title: 'Set the finishes of rooms, wall faces and bands',
  hint: 'change-plan',
  description:
    'Use this when the person says what rooms are finished in, for one room or many: "oak floors everywhere but the bathrooms", "every room except the wet rooms is painted plaster", "a tiled splashback 600 high behind the kitchen run", "tile the shower room to 1.2 m all round", "the north wall of the bedroom is a feature wall", "the plant room has no skirting". '
    + `Name the rooms by id in rooms, or all for every room that is not a zone, a void or outdoor space; or pick them by use in uses; narrow with floor and leave rooms out with except (ids or uses; wet stands for ${WET_USES.join(', ')}). `
    + 'floor_finish, wall_finish, ceiling_finish and skirting_finish take the person\'s own name for the finish, or unset to take one out; skirting_finish none says the rooms have no skirting, so none is measured. faces finishes one wall\'s face in a room other than its walls, by wall id. band lays one band of finish height metres high: on every wall face of the room, on one wall\'s face (wall), or behind an item (behind, such as a kitchen run), over the length of its back, starting at the item\'s top unless from says; it replaces the room\'s band in the same place. clear_bands takes the rooms\' bands out first. '
    + 'It answers with what changed in which rooms and each band\'s area as measured. grid_takeoff and grid_schedule of=finishes then give each band and face its own quantity, taken off the room\'s walls finish, and grid_find and grid_count ask by floor finish, wall finish and the rest. Grid checks no finish. '
    + 'Do not use to rename a room or change its use (grid_rename_room), for named wall types (grid_change_type), or for a fact of the person\'s own (grid_set_facts). It replaces the plan file unless out is given. Lengths are metres.',
  args: {
    plan: PLAN_ARG,
    rooms: {
      type: 'array',
      description: 'The rooms to finish, by id, or all: every room that is not a zone, a void or outdoor space. A zone named by id takes its own finishes: its part of its room.',
      examples: [['all'], ['kitchen', 'hall', 'bed1']],
      items: { maxLength: NAME_MAX },
      minItems: 1,
      maxItems: ROOMS_MAX,
    },
    uses: {
      type: 'array',
      description: 'The rooms of these uses, as well as any named in rooms.',
      examples: [['bathroom', 'toilet']],
      items: { enum: ROOM_USES },
      minItems: 1,
      maxItems: ROOM_USES.length,
    },
    floor: FLOOR_ARG,
    except: {
      type: 'array',
      description: `Rooms to leave out of those picked, by id or by use; wet stands for ${WET_USES.join(', ')}.`,
      examples: [['wet'], ['plant', 'store-1']],
      items: { maxLength: NAME_MAX },
      minItems: 1,
      maxItems: ROOMS_MAX,
    },
    floor_finish: FINISH('The floor finish, in the person\'s words, or unset to take it out.', 'Oak boards'),
    wall_finish: FINISH('The finish of the walls\' inside faces, or unset to take it out. Faces and bands keep their own.', 'Painted plaster'),
    ceiling_finish: FINISH('The ceiling finish, or unset to take it out.', 'Painted plasterboard'),
    skirting_finish: FINISH('The skirting, none for no skirting (none is measured), or unset to take it out.', 'none'),
    faces: {
      type: 'object',
      description: 'Wall faces finished other than the room\'s walls, by wall id: the finish, or unset to give the face the room\'s walls finish again. Each goes to the rooms named that the wall is round.',
      examples: [{ 'w-north': 'Feature paint' }],
      schema: { type: 'object', properties: {}, additionalProperties: { type: 'string', maxLength: NAME_MAX }, maxProperties: FACES_MAX },
      read: (value) => readFaces(value),
    },
    band: {
      type: 'object',
      description: 'One band of finish: finish, height in metres, and from (metres above the floor its bottom stands; behind an item, its top when left out, else 0), on wall (one wall\'s face) or behind (an item\'s back), or neither for every wall face of the room. It goes to the rooms named that have the wall, or that the item stands in against a wall.',
      examples: [{ finish: 'Ceramic tile', height: 0.6, behind: 'k-run' }, { finish: 'Porcelain tile', height: 1.2 }],
      schema: {
        type: 'object',
        properties: {
          finish: { type: 'string', maxLength: NAME_MAX },
          height: { type: 'number', minimum: 0, maximum: BAND_HIGHEST },
          from: { type: 'number', minimum: 0, maximum: BAND_HIGHEST },
          wall: { type: 'string', pattern: ID_PATTERN },
          behind: { type: 'string', pattern: ID_PATTERN },
        },
        required: ['finish', 'height'],
        additionalProperties: false,
      },
      read: (value) => readBand(value),
    },
    clear_bands: { type: 'boolean', description: 'true takes every band out of the rooms picked, before band.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), rooms: listSchema(ROOM_DONE) } },
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor'])
      const surfaces: Partial<Record<FinishSurface, string>> = {}
      for (const [arg, surface] of [['floor_finish', 'floor'], ['wall_finish', 'walls'], ['ceiling_finish', 'ceiling'], ['skirting_finish', 'skirting']] as const) {
        if (args[arg] !== undefined) surfaces[surface] = (args[arg] as string).normalize('NFC')
      }
      return setFinishes(survey, {
        ...(args['rooms'] === undefined ? {} : { rooms: args['rooms'] as string[] }),
        ...(args['uses'] === undefined ? {} : { uses: args['uses'] as string[] }),
        ...(args['except'] === undefined ? {} : { except: args['except'] as string[] }),
        ...(floor === undefined ? {} : { floor }),
        surfaces,
        ...(args['faces'] === undefined ? {} : { faces: args['faces'] as FinishFace[] }),
        ...(args['band'] === undefined ? {} : { band: args['band'] as FinishBand }),
        ...(args['clear_bands'] === true ? { clearBands: true } : {}),
      })
    })
  },
}
