/**
 * The buildings' tool (LVL-23): `grid_set_building` adds a building of the plan, changes its name,
 * its pad or its floors, or takes it out, through `writeChange` as every change does. A building's
 * floors stack from its own ground (its pad), and its ground floor, way out, height and storeys are
 * its own. Rooms text writes the same: building row-a "Row A" pad 2.5ft, then its floor lines.
 * The change is `edit/buildings.ts`.
 */
import { buildingHeights, groundLevel, type FloorPlan } from '@ongrid/floorplan/geometry'
import { safeParseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { setBuilding, type BuildingRequest } from '../edit/buildings'
import { addStorey, placeBuilding, removeBuilding, writeBuildingText } from '../edit/buildingEdits'
import { readRoomsFile } from '../command/write'
import { PlanRefused } from '../command/plan'
import { PATH_MAX, PathRefused } from '../fs/projectFiles'
import { NAME_MAX } from '../command/planText'
import { DECIMAL_IN_ARG, listSchema, objectSchema, PLAN_ARG, projectOf, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, ROOMS_TEXT_MAX, writeChange } from './writeTools'

const BUILDING_OUTPUT = { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), building: STRING, buildings: listSchema(STRING) } }

/** One line on the building as Grid now reads it: its ground floor and its height, from what. */
function standing(plan: FloorPlan | null, id: string): string[] {
  if (plan === null) return []
  const ground = groundLevel(plan)
  const own = ground.buildings.get(id)
  const height = buildingHeights(plan).find((b) => b.id === id)
  const mine = new Set((plan.buildings ?? []).find((b) => b.id === id)?.floors ?? [])
  const floor = ground.groundFloors.find((f) => mine.has(f.id))
  if (own === undefined || height === undefined) return []
  // ARE-76: the ground its height is measured from, which may be the ground under it.
  const measured = height.height?.from ?? own.from
  const from = measured === 'pad' ? 'its pad' : measured === 'site' ? "the site's ground" : measured === 'under' ? 'the ground under it' : 'its ground floor'
  const tall = height.height === null ? '' : `, ${Math.round(height.height.height * 100) / 100 + 0} m high from ${from}`
  return [`Its ground floor: ${floor?.id ?? 'none on the ground'}; ${height.storeys.above + height.storeys.below} storey${height.storeys.above + height.storeys.below === 1 ? '' : 's'}${tall}.`]
}

export const setBuildingTool: GridTool = {
  name: 'grid_set_building',
  title: 'Add, change or remove a building of the plan',
  hint: 'change-plan',
  description:
    'Use this when a plan holds more than one building (a housing estate, a campus, a row of terrace houses, a house and a detached garage) and says which floors are each one\'s: "row A is floors ag to a3, on a pad 2.5 ft up", "the garage is its own building", "take the studio out of the buildings". '
    + 'Each building stacks its own floors from its pad (the level of its own ground, from the plan\'s datum) and has its own ground floor, way out, height, storeys, distances to the plot\'s edges and IFC building. '
    + 'Give id and floors to add one; give id and name, pad or floors to change it (floors replaces its list); or remove to take it out (its floors stay, in no building). A floor is in one building at most. '
    + 'Rooms text writes the same: building row-a "Row A" pad 2.5ft, then the building\'s floor lines. Do not use for what kind of building the plan is (a building line of rooms text, building home). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    id: { type: 'string', id: true, required: true, description: 'The building\'s id: a new one adds it.', examples: ['row-a', 'garage'] },
    name: { type: 'string', maxLength: NAME_MAX, description: 'The person\'s name for it.', examples: ['Row A'] },
    pad: { type: 'number', length: true, description: 'The level of its own ground, from the plan\'s datum (the 0 a floor\'s elevation is measured from). Its floors that state no elevation stack from it.', examples: [0.76, -1.2], minimum: -1000, maximum: 1000 },
    floors: { type: 'array', description: 'The floors that are its own, by id.', examples: [['ag', 'a1', 'a2']], items: { id: true }, minItems: 1, maxItems: 500 },
    remove: { type: 'boolean', description: 'Take the building out of the plan; its floors stay.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: BUILDING_OUTPUT,
  run(args, context) {
    const request: BuildingRequest = {
      id: args['id'] as string,
      ...(args['name'] === undefined ? {} : { name: (args['name'] as string).normalize('NFC') }),
      ...(args['pad'] === undefined ? {} : { pad: args['pad'] as number }),
      ...(args['floors'] === undefined ? {} : { floors: args['floors'] as string[] }),
      ...(args['remove'] === true ? { remove: true } : {}),
    }
    let after: readonly { id: string }[] = []
    let next: FloorPlan | null = null
    const changed = writeChange(context, args, (survey) => {
      const patch = setBuilding(survey, request)
      const listed = patch.plan?.['buildings'] as { id: string }[] | null | undefined
      after = listed ?? []
      next = request.remove === true ? null : safeParseFloorPlan({ ...survey.plan, buildings: listed ?? [] })
      return { ...patch, said: [...patch.said, ...standing(next, request.id)] }
    })
    return { text: changed.text, data: { ...changed.data, buildings: after.map((b) => b.id) } }
  },
}

// ---------------------------------------------------------------------------------------------
// CMD-47: one building of a site of many, changed on its own

/** A point written `x,y`, each length in metres or with its unit; refused naming the argument. */
function pointArg(name: string, text: string): [number, number] {
  const usage = `${name} takes a point written x,y, each a length in metres or with its unit (12,0 or 40ft,0), with a decimal point.`
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
  const point: [number, number] = [length(parts[0]!), length(parts[1]!)]
  if (!point.every((v) => Number.isFinite(v) && Math.abs(v) <= 100_000)) throw new ToolRefusal(`${name} takes a point within 100000 m of the drawing's origin.`)
  return point
}

const ONE_BUILDING_OUTPUT = { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), building: STRING } }

export const writeBuildingTool: GridTool = {
  name: 'grid_write_building',
  title: 'Write one building of the plan from rooms text',
  hint: 'change-plan',
  description:
    'Use this when the plan holds many buildings (a housing site, a resort, a campus) and one of them changes, or is swapped for others: "add a study to house 12", "swap the villa for three townhouses". '
    + 'Read the building with grid_describe as=rooms building=<id>, change that text and pass it here: its floors and every part on them are replaced by what the text writes, and every other building stays in the file exactly as written, so the plan never has to be read whole. '
    + 'Text read from another version of the building is refused with the difference, and text with no based on line over a building with rooms needs replace=true; nothing is written then. '
    + 'The text names each of its floors with a floor line, and writes no plot or north line. With building lines of its own (building t1 "Townhouse 1", its floor lines, end) it writes those buildings in place of this one; with none, all its floors are this building, keeping its name and pad. A building id the plan does not have adds it. '
    + 'An id the text writes that another building holds is given its floor\'s id in front (living on floor t2g becomes t2g-living), as a whole plan\'s later floors are. A text with no item, stair or bay lines keeps the building\'s on the floors it keeps. '
    + 'Do not use for a plan of one building (grid_write_rooms). It replaces the plan file unless out is given. A plain number in the text is metres, as in grid_write_rooms.',
  args: {
    plan: PLAN_ARG,
    building: { type: 'string', id: true, required: true, description: 'The building the text writes, by id: one the plan does not have is added.', examples: ['villa-3'] },
    rooms: { type: 'string', lines: true, maxLength: ROOMS_TEXT_MAX, description: 'The building\'s rooms text, as grid_describe as=rooms building=<id> gives it, changed; pass it or roomsFile. The grammar is grid_write_rooms\'s.', examples: ['based on 0123456789abcdef\nfloor vg "Ground floor" level 0\nroom living "Living" living 5 x 4 at 40,10\nbuilding villa-3 "Villa 3" floors vg'] },
    roomsFile: { type: 'string', maxLength: PATH_MAX, description: 'In place of rooms: a file of the building\'s rooms text, as a path inside the project folder.', examples: ['villa-3.rooms'] },
    replace: { type: 'boolean', description: 'true to write over a building the text was not read from, or one changed since. Refused with the difference when left out.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), building: STRING, buildingsWritten: listSchema(STRING), renamed: objectSchema({}, []) } },
  run(args, context) {
    if ((args['rooms'] === undefined) === (args['roomsFile'] === undefined)) throw new ToolRefusal('Pass rooms (the building\'s rooms text) or roomsFile (a file of it in the project), one of the two.')
    let text: string
    try {
      text = args['roomsFile'] === undefined ? (args['rooms'] as string) : readRoomsFile(projectOf(context), args['roomsFile'] as string)
    } catch (error) {
      if (error instanceof PlanRefused || error instanceof PathRefused) throw new ToolRefusal(error.message)
      throw error
    }
    return writeChange(context, args, (survey) => writeBuildingText(survey, { building: args['building'] as string, text, ...(args['replace'] === true ? { replace: true } : {}) }))
  },
}

export const addStoreyTool: GridTool = {
  name: 'grid_add_storey',
  title: 'Add a storey on top of a building',
  hint: 'change-plan',
  description:
    'Use this when the person asks for another storey on one building of the plan: "add a floor to block B", "put a third storey on the townhouses like the second". '
    + 'It adds a floor on top of the building, laid out like one of its floors (its top floor when like is left out): its walls, rooms, doors and windows, items, columns, bays and flats copied with ids of the new floor, stacked on the old top floor. '
    + 'The building\'s record takes the new floor, and its cores go up with it: a wall or column that rises through the old top floor rises through the new one, a stair that reaches the old top floor gets a flight on to the new one, and the old top floor\'s roof and parapet go up to the new top. Notes and sketch lines are not copied. '
    + 'Do not use for a plan of one building with no building record (grid_write_rooms with a copy line), nor for a floor put in between (it adds on top only). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    building: { type: 'string', id: true, required: true, description: 'The building to add the storey to, by id.', examples: ['block-b'] },
    like: { type: 'string', id: true, description: 'The floor of the building the new storey is laid out like. The building\'s top floor when left out.', examples: ['b2'] },
    id: { type: 'string', id: true, description: 'The new floor\'s id. The top floor\'s id counted up (b3 after b2) when left out.', examples: ['b3'] },
    name: { type: 'string', maxLength: NAME_MAX, description: 'The new floor\'s name. The building\'s name and the level when left out.', examples: ['Third floor'] },
    out: OUT_ARG,
  },
  outputSchema: { ...ONE_BUILDING_OUTPUT, properties: { ...(ONE_BUILDING_OUTPUT['properties'] as Record<string, unknown>), floor: STRING } },
  run(args, context) {
    return writeChange(context, args, (survey) =>
      addStorey(survey, {
        building: args['building'] as string,
        ...(args['like'] === undefined ? {} : { like: args['like'] as string }),
        ...(args['id'] === undefined ? {} : { id: args['id'] as string }),
        ...(args['name'] === undefined ? {} : { name: (args['name'] as string).normalize('NFC') }),
      }))
  },
}

export const removeBuildingTool: GridTool = {
  name: 'grid_remove_building',
  title: 'Take a building out with everything on its floors',
  hint: 'change-plan',
  description:
    'Use this when one building of the plan goes: "take out the villa by the lake", "the clubhouse is not being built". '
    + 'It takes out the building, its floors and everything on them (walls, rooms, doors and windows, items, columns, bays, stairs, ramps, notes and flats), and the stairs and ramps between it and another building. Every other building stays in the file as written. '
    + 'To put something in its place, write it with grid_write_rooms building=<id> instead (rooms text that replaces the building), or place a copy of another with grid_place_building. '
    + 'Do not use to take a building\'s record out and keep its floors (grid_set_building remove). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    id: { type: 'string', id: true, required: true, description: 'The building to take out, by id.', examples: ['villa-7'] },
    out: OUT_ARG,
  },
  outputSchema: ONE_BUILDING_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => removeBuilding(survey, args['id'] as string))
  },
}

export const placeBuildingTool: GridTool = {
  name: 'grid_place_building',
  title: 'Place a copy of a building on another lot',
  hint: 'change-plan',
  description:
    'Use this when a building of the plan is a type, a unit or a house, to be built again on another lot of the site: "put another of house type A on lot 12", "two more townhouses east of this one". '
    + 'It copies the building from, every floor and every part on it, each with an id of its own (a floor whose id starts with the building\'s takes the new building\'s, so a-g becomes b-g; another gets the new id in front), moved by move, or with the south-west corner of its walls\' box put at at. The copy keeps the pad of the one it is copied from unless pad is given. '
    + 'The answer warns when its walls\' box overlaps another building\'s. It is moved, never turned or mirrored. '
    + 'Do not use for a row of rooms or flats inside one building (rooms text unit and repeat lines). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    from: { type: 'string', id: true, required: true, description: 'The building to copy, by id.', examples: ['house-a'] },
    id: { type: 'string', id: true, required: true, description: 'The new building\'s id.', examples: ['house-b'] },
    name: { type: 'string', maxLength: NAME_MAX, description: 'The new building\'s name.', examples: ['House B'] },
    move: { type: 'string', maxLength: 60, description: 'How far to move the copy, "dx,dy" east and north; in place of at.', examples: ['12,0', '40ft,-20ft'] },
    at: { type: 'string', maxLength: 60, description: 'Where the south-west corner of the copy\'s walls goes, "x,y"; in place of move.', examples: ['60,24'] },
    pad: { type: 'number', length: true, description: 'The level of the copy\'s own ground, from the plan\'s datum. The copied building\'s when left out.', examples: [0.6], minimum: -1000, maximum: 1000 },
    out: OUT_ARG,
  },
  outputSchema: { ...ONE_BUILDING_OUTPUT, properties: { ...(ONE_BUILDING_OUTPUT['properties'] as Record<string, unknown>), from: STRING, moved: listSchema({ type: 'number' }), overlaps: listSchema(STRING) } },
  run(args, context) {
    const move = args['move'] === undefined ? undefined : pointArg('move', args['move'] as string)
    const at = args['at'] === undefined ? undefined : pointArg('at', args['at'] as string)
    return writeChange(context, args, (survey) =>
      placeBuilding(survey, {
        from: args['from'] as string,
        id: args['id'] as string,
        ...(args['name'] === undefined ? {} : { name: (args['name'] as string).normalize('NFC') }),
        ...(args['pad'] === undefined ? {} : { pad: args['pad'] as number }),
        ...(move === undefined ? {} : { move }),
        ...(at === undefined ? {} : { at }),
      }))
  },
}

export const BUILDING_TOOLS: readonly GridTool[] = [setBuildingTool, writeBuildingTool, addStoreyTool, removeBuildingTool, placeBuildingTool]
