/**
 * `grid_set_plan` (CNT-50): what the person says about the plan as a whole, set in one call: the
 * plan's name, the site's name and address (in their words, never looked up), the country, north,
 * the language Grid writes in, the units lengths and areas are shown in, the decimal mark, the
 * precision and the floors' names. It goes through `writeChange`, as every change does, changes no
 * wall, room or opening, and answers with the settings as the plan now holds them. The change is
 * `edit/plan.ts`; the site's fields go through `setSite`, as `grid_set_site` sets them.
 */
import { readLanguage } from '@ongrid/floorplan/messages'
import { NORTH_WAYS } from '@ongrid/floorplan/rooms'
import { NAME_MAX } from '../command/planText'
import { AREA_UNITS, DECIMAL_MARKS, LENGTH_UNITS, PLAN_FIELDS, planSettings, setPlan, type PlanRequest } from '../edit/plan'
import { PLAN_ARG, readPlan, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

/** What `remove` takes out: the plan-wide fields, and the site's that this tool sets. */
const REMOVABLE = [...PLAN_FIELDS, 'site name', 'address', 'country', 'north'] as const

/** The most floors one call names. */
const FLOORS_MAX = 500

export const setPlanTool: GridTool = {
  name: 'grid_set_plan',
  title: 'Set the plan\'s name, address, language, units and north',
  hint: 'change-plan',
  description:
    'Use this when the person says something about the plan as a whole: "it is Harbour House, 12 Harbour Road", "the address is Calle Mayor 5, Madrid", "write everything in Spanish", "show feet and inches", "use a decimal comma", "north is to the right", "it will be built in Spain", "call the ground floor Planta baja". '
    + 'It sets the plan\'s name, the site\'s own name (site_name) and address, kept exactly as the person writes them and never looked up or checked against a map; the language Grid writes its drawings, sheets, checks and descriptions in; the units lengths (units) and areas (area) are shown in, the decimal mark and the precision, which change how numbers are shown and never a stored number (the file stays in metres); north; the country the checks read; and floor names by floor id. Each only when given; remove takes one out. '
    + 'grid_describe, the sheets and the band under a drawing show the site\'s name and address. '
    + 'Do not use for the plot, streets, set-backs or the ground (grid_set_site), for Grid\'s words in a language it does not ship (grid_words writes them), or to edit the plan file\'s own units key, which is always m. It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    name: { type: 'string', maxLength: NAME_MAX, description: 'The plan\'s name, as the sheets and the drawing\'s title block carry it.', examples: ['Harbour House extension'] },
    site_name: { type: 'string', maxLength: NAME_MAX, description: 'The site\'s own name, in the person\'s words.', examples: ['Harbour House'] },
    address: { type: 'string', maxLength: NAME_MAX, description: 'The site\'s address, one line, as the person writes it. Grid keeps it as text and never looks it up: latitude and longitude (grid_set_site) place it on the earth.', examples: ['12 Harbour Road, Bristol'] },
    country: { type: 'string', maxLength: NAME_MAX, description: 'Where it will be built: a country\'s name or its two- or three-letter code. grid_check applies the figures that hold there.', examples: ['ES', 'United Kingdom'] },
    north: { type: 'number', length: false, description: 'Where north lies on the drawing, in degrees counter-clockwise from up the drawing (+y): 0 up, 90 left, -90 right, 180 down.', examples: [0, -90], minimum: -360, maximum: 360 },
    north_points: { type: 'string', enum: Object.keys(NORTH_WAYS), description: 'Where the north arrow points on the drawing, in place of north.', examples: ['right', 'up-left'] },
    language: { type: 'string', maxLength: 35, description: 'The language Grid writes in for this plan, as a language tag: en, es, de, pt-BR. Grid ships English and Spanish; for another, grid_words lists the words to write.', examples: ['es', 'de'] },
    units: { type: 'string', enum: LENGTH_UNITS, description: 'How lengths are shown: m, cm, mm or ft-in (feet and inches).', examples: ['ft-in', 'mm'] },
    area: { type: 'string', enum: AREA_UNITS, description: 'How areas are shown: m2 or ft2.', examples: ['ft2'] },
    decimal_mark: { type: 'string', enum: DECIMAL_MARKS, description: 'The decimal mark numbers are shown with. A language with a decimal comma shows one unless this says otherwise.', examples: ['comma'] },
    precision: { type: 'number', length: false, description: 'How many decimal places lengths are shown to, 0 to 5.', examples: [2], minimum: 0, maximum: 5 },
    floor_names: { type: 'array', items: { maxLength: NAME_MAX + 70 }, minItems: 1, maxItems: FLOORS_MAX, description: 'Floor names, each "<floor id>=<name>".', examples: [['ground=Planta baja', 'first=Primera planta']] },
    remove: { type: 'array', items: { enum: REMOVABLE }, minItems: 1, maxItems: REMOVABLE.length, description: 'Settings to take out: the plan then reads as Grid\'s default (English, metres, no north).', examples: [['units'], ['address']] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), settings: { type: 'object' } } },
  run(args, context) {
    const given = (key: string): boolean => args[key] !== undefined
    if (given('north') && given('north_points')) throw new ToolRefusal('Give north or north_points, not both.')
    if (given('precision') && !Number.isInteger(args['precision'])) throw new ToolRefusal('precision takes a whole number of decimal places, 0 to 5.')
    let language: string | undefined
    if (given('language')) {
      language = readLanguage(args['language']) ?? undefined
      if (language === undefined) throw new ToolRefusal('language takes a language tag, such as en, es, de or pt-BR.')
    }
    const floors: Record<string, string> = {}
    for (const entry of (args['floor_names'] as string[] | undefined) ?? []) {
      const at = entry.indexOf('=')
      const id = at < 0 ? '' : entry.slice(0, at).trim()
      if (id === '' || entry.slice(at + 1).trim() === '') throw new ToolRefusal('floor_names takes "<floor id>=<name>" for each floor: "ground=Planta baja".')
      if (Object.hasOwn(floors, id)) throw new ToolRefusal(`floor_names names floor ${JSON.stringify(id)} twice.`)
      floors[id] = entry.slice(at + 1)
    }
    const north = given('north_points') ? NORTH_WAYS[args['north_points'] as string]! : (args['north'] as number | undefined)
    const site = {
      ...(given('site_name') ? { name: args['site_name'] as string } : {}),
      ...(given('address') ? { address: args['address'] as string } : {}),
      ...(given('country') ? { country: args['country'] as string } : {}),
      ...(north === undefined ? {} : { north }),
    }
    const request: PlanRequest = {
      ...(given('name') ? { name: args['name'] as string } : {}),
      ...(language === undefined ? {} : { language }),
      ...(given('units') ? { units: args['units'] as PlanRequest['units'] } : {}),
      ...(given('area') ? { area: args['area'] as PlanRequest['area'] } : {}),
      ...(given('decimal_mark') ? { decimal: args['decimal_mark'] as PlanRequest['decimal'] } : {}),
      ...(given('precision') ? { precision: args['precision'] as number } : {}),
      ...(Object.keys(floors).length === 0 ? {} : { floors }),
      ...(Object.keys(site).length === 0 ? {} : { site }),
      ...(given('remove') ? { remove: args['remove'] as PlanRequest['remove'] } : {}),
    }
    const changed = writeChange(context, args, (survey) => setPlan(survey, request))
    const { loaded } = readPlan(context, changed.data['written'])
    return { text: changed.text, data: { ...changed.data, settings: planSettings(loaded.plan) } }
  },
}
