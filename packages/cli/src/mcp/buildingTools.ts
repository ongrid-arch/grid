/**
 * The buildings' tool (LVL-23): `grid_set_building` adds a building of the plan, changes its name,
 * its pad or its floors, or takes it out, through `writeChange` as every change does. A building's
 * floors stack from its own ground (its pad), and its ground floor, way out, height and storeys are
 * its own. Rooms text writes the same: building row-a "Row A" pad 2.5ft, then its floor lines.
 * The change is `edit/buildings.ts`.
 */
import { buildingHeights, groundLevel, type FloorPlan } from '@ongrid/floorplan/geometry'
import { safeParseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { setBuilding, type BuildingRequest } from '../edit/buildings'
import { NAME_MAX } from '../command/planText'
import { DECIMAL_IN_ARG, listSchema, PLAN_ARG, STRING, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

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
  const from = own.from === 'pad' ? 'its pad' : own.from === 'site' ? "the site's ground" : 'its ground floor'
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

export const BUILDING_TOOLS: readonly GridTool[] = [setBuildingTool]
