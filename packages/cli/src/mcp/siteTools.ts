/**
 * The site's tools (CNT-41): `grid_set_site` writes the plot, its streets and set-backs, north and
 * where the building is on the earth, and answers with the plot as `grid_measure what=site` gives
 * it; `grid_change_site` adds, moves, resizes and removes the site's things. Both go through
 * `writeChange`, as every change does, and change the ground only, never the building: they come
 * after the changes to the building and before the saved views.
 *
 * A point is text, `x,y`, as rooms text writes it (a tool's lists hold text): each length in
 * metres, or with its unit (`40ft,0`). The changes are `edit/site.ts`.
 */
import { FALL_TOWARD, SITE_THING_KINDS, type FallToward, type SiteThingKind } from '@ongrid/floorplan/types/floorplan'
import { groundLineOfWords, NORTH_WAYS, setbackOfWords, streetsOfWords, type SetbackWords } from '@ongrid/floorplan/rooms'
import { siteThingsText } from '@ongrid/floorplan/geometry'
import { LengthRefused, readLength } from '@ongrid/floorplan/types/units'
import { changeSiteThing, setSite, SITE_ACTIONS, SITE_FIELDS, type SiteAction, type SiteField } from '../edit/site'
import { siteAnswer } from '../quantities/site'
import { displayFor } from '../quantities/units'
import { NAME_MAX } from '../command/planText'
import { DECIMAL_IN_ARG, listSchema, PLAN_ARG, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

type Pair = [number, number]

/** The most corners or points one call takes, and the longest point text. */
const POINTS_MAX = 2000
const POINT_MAX = 60
const LARGEST = 100_000

/** A point written `x,y`, each length in metres or with its unit; refused naming the argument. */
function pointArg(name: string, text: string): Pair {
  const parts = text.split(',').map((p) => p.trim())
  const length = (part: string): number => {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(part)) return Number(part)
    try {
      return readLength(part)
    } catch (error) {
      if (error instanceof LengthRefused) throw new ToolRefusal(`${name} takes points written x,y, each a length in metres or with its unit (3.5,0 or 40ft,12ft), with a decimal point.`)
      throw error
    }
  }
  if (parts.length !== 2 || parts.some((p) => p === '')) throw new ToolRefusal(`${name} takes points written x,y, each a length in metres or with its unit (3.5,0 or 40ft,12ft), with a decimal point.`)
  const point: Pair = [length(parts[0]!), length(parts[1]!)]
  if (!point.every((v) => Number.isFinite(v) && Math.abs(v) <= LARGEST)) throw new ToolRefusal(`${name} takes points within ${LARGEST} m of the drawing's origin.`)
  return point
}

/** Rooms text's reading of site words, its refusals as the tool's. */
function siteWords<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    if (error instanceof Error && /^rooms\//.test(String((error as { code?: unknown }).code))) throw new ToolRefusal(error.message.replace(/^line \d+: /, '').replace(/^./, (c) => c.toUpperCase()))
    throw error
  }
}

const words = (text: string): string[] => text.trim().toLowerCase().split(/\s+/).filter((w) => w !== '')

const POINT_ITEMS = { maxLength: POINT_MAX }
const number = (description: string, examples: number[], minimum: number, maximum: number, length = true): GridTool['args'][string] => ({ type: 'number', length, description, examples, minimum, maximum })

const SITE_OUTPUT = {
  ...EDIT_OUTPUT,
  properties: {
    ...(EDIT_OUTPUT['properties'] as Record<string, unknown>),
    // The plot after the change, as grid_measure what=site gives it.
    site: { type: 'object' },
  },
}

export const setSiteTool: GridTool = {
  name: 'grid_set_site',
  title: 'Set the plot, its streets and set-backs, and north',
  hint: 'change-plan',
  description:
    'Use this when the person gives the plot or where the building stands: "the plot is 12 by 25 m", "the street is to the south", "keep 5 m from the street and 2 m from the other sides", "a 40 m coastal set-back on the west", "north is to the top right", a north arrow on a sketch, or where the ground outside is: "the floor is 15 cm above the ground", "the basement is 3 m below ground", "the site falls 4.6 m from the north side to the south", "a 30% slope down to the south", "the street falls from 0 to -3 m along the front". '
    + 'It sets the plot\'s boundary (its corners, or plot_width by plot_depth from its south-west corner, centred on the building when plot_x and plot_y are left out, and said), the edges on a street, the set-backs the person asked for (their own figures, never a code\'s), north, where the building is on the earth, and the ground level (ground), each only when given; remove takes a field out. '
    + 'On a slope, give the ground at the building\'s sides (ground_north, ground_east, ground_south, ground_west), a fall (slope, in percent, toward a compass point; through ground, else 0, at the middle of the building) or the ground along edges of the plot (ground_edges, a street that falls along its edge): Grid takes the one even slope that fits them, says how far it is off any it cannot meet, and every check (below the ground, the way out), the footprint, the storeys, the height, the facades, the sections and the 3D ground read it at each wall. '
    + 'Sides are the sides of the drawing, north up it, as in rooms text: street "south" is every edge facing down the drawing. Edge 1 runs from the first corner to the second; a plot\'s edges are 1 south, 2 east, 3 north, 4 west. '
    + 'It answers with the plot\'s area (in acres too on a plan shown in feet and inches), the plot coverage and what it counts (roofed porches and carports in, open decks and terraces out), and each edge\'s distance to the building against its set-back, as grid_measure what=site does. '
    + 'Do not use for trees, paths, pools, fences or gates (grid_change_site), or to draw a path or a jetty as a room. Rooms text says the same in lines: plot 12 x 25, street south, setback all 2, north 135, ground -0.15. It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    boundary: { type: 'array', items: POINT_ITEMS, minItems: 3, maxItems: POINTS_MAX, description: 'The plot\'s corners in order round it, either way, each "x,y" in plan metres (or with a unit: "40ft,0").', examples: [['0,0', '15,0', '15,30', '0,30']] },
    plot_width: number('A rectangular plot\'s width, east-west on the drawing, in place of boundary.', [12, 15], 0.5, LARGEST),
    plot_depth: number('A rectangular plot\'s depth, north-south on the drawing, with plot_width.', [25, 30], 0.5, LARGEST),
    plot_x: number('With plot_width: x of the plot\'s south-west corner. Left out with plot_y, the plot is centred on the building.', [-3], -LARGEST, LARGEST),
    plot_y: number('With plot_width: y of the plot\'s south-west corner.', [-10], -LARGEST, LARGEST),
    streets: { type: 'array', items: { maxLength: 20 }, minItems: 0, maxItems: POINTS_MAX, description: 'The edges on a street: a side of the drawing ("south": every edge facing it) or an edge number ("2"). Replaces the streets; [] for none.', examples: [['south'], ['1', '2']] },
    setbacks: { type: 'array', items: { maxLength: 60 }, minItems: 0, maxItems: POINTS_MAX, description: 'The set-backs the person asked for, each "<from> <distance>" as rooms text writes them: "all 2", "street 5", "west 40", "edge 3 1.5"; "assumed" after it when it is not the person\'s figure yet. A side gives every edge facing it. Replaces the set-backs; [] for none.', examples: [['street 5', 'all 2'], ['west 40 assumed']] },
    north: number('Where north lies on the drawing, in degrees counter-clockwise from up the drawing (+y), as the plan file holds it: 0 up, 90 left, -90 right, 180 down. An arrow on a sketch turned 30° clockwise from up is -30.', [0, 135, -30], -360, 360, false),
    north_points: { type: 'string', enum: Object.keys(NORTH_WAYS), description: 'Where the north arrow points on the drawing, in place of north.', examples: ['up-right', 'left'] },
    origin: { type: 'string', maxLength: POINT_MAX, description: 'The point of the plan, "x,y", that latitude and longitude place on the earth, and that exports measure from.', examples: ['0,0'] },
    latitude: number('Where the origin is on the earth, degrees north positive, with longitude.', [31.2304], -90, 90, false),
    longitude: number('Degrees east positive, with latitude.', [121.4737], -180, 180, false),
    elevation: number('The origin\'s height above sea level, in metres.', [12], -500, 9000),
    ground: number('The ground outside, in metres from the ground floor\'s floor level, the level the sections, the 3D ground and the below-ground check read: -0.15 for a floor 15 cm above the ground, 0 for one at it. A basement is set by its floor\'s elevation below the ground floor, not here.', [-0.15, 0], -100, 100),
    ground_north: number('The ground at the building\'s north side (up the drawing), from the ground floor\'s floor level, on a slope.', [0], -100, 100),
    ground_east: number('The ground at the building\'s east side, on a slope.', [-1.2], -100, 100),
    ground_south: number('The ground at the building\'s south side, on a slope.', [-4.6], -100, 100),
    ground_west: number('The ground at the building\'s west side, on a slope.', [-1.2], -100, 100),
    slope: number('A fall of the ground, in percent (rise over run, times 100), with toward: 30 for 30%.', [30, 8], 0, 1000, false),
    toward: { type: 'string', enum: [...FALL_TOWARD], description: 'The compass point of the drawing the ground falls toward, with slope.', examples: ['south'] },
    ground_edges: { type: 'array', items: { maxLength: 60 }, minItems: 1, maxItems: POINTS_MAX, description: 'The ground along edges of the plot, each "<edge> <level> [to <level>]": its level at the edge\'s first corner and, when it falls along it, at its second. Replaces those edges\' levels.', examples: [['1 0 to -3'], ['2 -0.5']] },
    country: { type: 'string', maxLength: NAME_MAX, description: 'Where it will be built: a country\'s name or its two- or three-letter code. grid_check applies the figures that hold there.', examples: ['ES', 'United States'] },
    remove: { type: 'array', items: { enum: SITE_FIELDS }, minItems: 1, maxItems: SITE_FIELDS.length, description: 'Fields to take out: the boundary takes its streets and set-backs with it; location is latitude and longitude.', examples: [['north'], ['setbacks']] },
    out: OUT_ARG,
  },
  outputSchema: SITE_OUTPUT,
  run(args, context) {
    const given = (key: string): boolean => args[key] !== undefined
    if (given('north') && given('north_points')) throw new ToolRefusal('Give north or north_points, not both.')
    if ((given('plot_width') || given('plot_depth')) && !(given('plot_width') && given('plot_depth'))) throw new ToolRefusal('Give plot_width and plot_depth together: a rectangular plot.')
    if ((given('plot_x') || given('plot_y')) && !(given('plot_x') && given('plot_y'))) throw new ToolRefusal('Give plot_x and plot_y together: the plot\'s south-west corner.')
    if ((given('plot_x') || given('plot_y')) && !given('plot_width')) throw new ToolRefusal('plot_x and plot_y place a plot given by plot_width and plot_depth.')
    const boundary = given('boundary') ? (args['boundary'] as string[]).map((p) => pointArg('boundary', p)) : undefined
    const streets = given('streets') ? (args['streets'] as string[]).flatMap((s) => siteWords(() => streetsOfWords(words(s)))) : undefined
    const setbacks: SetbackWords[] | undefined = given('setbacks') ? (args['setbacks'] as string[]).map((s) => siteWords(() => setbackOfWords(words(s)))) : undefined
    const north = given('north_points') ? NORTH_WAYS[args['north_points'] as string]! : (args['north'] as number | undefined)
    // CNT-49: the ground on a slope.
    if (given('slope') !== given('toward')) throw new ToolRefusal('Give slope and toward together: how steep the ground falls and the way it falls.')
    const sides = Object.fromEntries((['north', 'east', 'south', 'west'] as const).filter((side) => given(`ground_${side}`)).map((side) => [side, args[`ground_${side}`] as number]))
    const groundEdges = given('ground_edges')
      ? (args['ground_edges'] as string[]).map((g) => {
          const read = siteWords(() => groundLineOfWords(['edge', ...words(g)], 1))
          if (read.kind !== 'edge') throw new ToolRefusal('ground_edges takes "<edge> <level> [to <level>]" for each edge.')
          return read.edge
        })
      : undefined
    const changed = writeChange(context, args, (survey) =>
      setSite(survey, {
        ...(boundary === undefined ? {} : { boundary }),
        ...(given('plot_width') ? { plot: { width: args['plot_width'] as number, depth: args['plot_depth'] as number, ...(given('plot_x') ? { at: [args['plot_x'] as number, args['plot_y'] as number] as Pair } : {}) } } : {}),
        ...(streets === undefined ? {} : { streets }),
        ...(setbacks === undefined ? {} : { setbacks }),
        ...(north === undefined ? {} : { north }),
        ...(given('origin') ? { origin: pointArg('origin', args['origin'] as string) } : {}),
        ...(given('latitude') ? { latitude: args['latitude'] as number } : {}),
        ...(given('longitude') ? { longitude: args['longitude'] as number } : {}),
        ...(given('elevation') ? { elevation: args['elevation'] as number } : {}),
        ...(given('ground') ? { ground: args['ground'] as number } : {}),
        ...(Object.keys(sides).length === 0 ? {} : { groundSides: sides }),
        ...(given('slope') ? { fall: { slope: args['slope'] as number, toward: args['toward'] as FallToward } } : {}),
        ...(groundEdges === undefined ? {} : { groundEdges }),
        ...(given('country') ? { country: args['country'] as string } : {}),
        ...(given('remove') ? { remove: args['remove'] as SiteField[] } : {}),
      })
    )
    // The plot as it now is, as grid_measure what=site gives it, in the plan's own units.
    const { loaded } = readPlan(context, changed.data['written'])
    const site = siteAnswer(loaded.plan, displayFor(undefined, undefined, loaded.plan))
    return { text: [changed.text, '', ...site.lines].join('\n'), data: { ...changed.data, site: site.data } }
  },
}

export const changeSiteTool: GridTool = {
  name: 'grid_change_site',
  title: 'Add, move, resize or remove a tree, path, pool, fence or gate',
  hint: 'change-plan',
  description:
    'Use this when the person asks to change what stands on the site, outside the building: "move the tree 2 m east", "widen the path to 3 m", "add a gate in the fence", "a pool behind the house", "take the old fence out", "an 80 m jetty". '
    + 'One call is one change of one thing: action add (kind, and points or at), move (id, and by: how far, or to: where its middle goes), resize (id, and its new width, canopy, height, points, at or label) or remove (id). A fence is a line through points, a gate the two posts it hangs between, a path its middle line through points with its width (a jetty or boardwalk is a path), paving and a pool a shape through three or more points, and a tree its trunk at a point with its canopy across. '
    + 'Things are drawn only: they add no wall, room or area, and change no figure. It answers with what changed, and says when a thing stands outside the plot\'s boundary. '
    + 'Do not use for the plot, its streets, set-backs or north (grid_set_site), or for a terrace or deck that is outdoor space of the building (a room, outdoor). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    action: { type: 'string', enum: SITE_ACTIONS, required: true, description: 'add, move, resize or remove.', examples: ['move', 'add'] },
    id: { type: 'string', id: true, description: 'The thing to move, resize or remove; for add, its id (made from its kind when left out). grid_measure what=site lists them.', examples: ['tree-1', 'path-1'] },
    kind: { type: 'string', enum: SITE_THING_KINDS, description: 'For add: what it is.', examples: ['gate', 'tree'] },
    points: { type: 'array', items: POINT_ITEMS, minItems: 2, maxItems: POINTS_MAX, description: 'Its points, each "x,y": a fence\'s or a path\'s line, a gate\'s two posts, the edge of paving or a pool.', examples: [['4,-10', '5,-10']] },
    at: { type: 'string', maxLength: POINT_MAX, description: 'A tree\'s trunk, "x,y".', examples: ['10,15'] },
    by: { type: 'string', maxLength: POINT_MAX, description: 'For move: how far, "dx,dy" (2,0 is 2 m east on the drawing).', examples: ['2,0'] },
    to: { type: 'string', maxLength: POINT_MAX, description: 'For move: where its middle goes, "x,y": a tree\'s trunk, or the middle of the box round its points.', examples: ['12,15'] },
    width: number('How wide a walk, drive or jetty is, across its middle line.', [1.2, 3], 0.05, 1000),
    canopy: number('A tree\'s canopy, across its crown.', [5], 0.1, 200),
    height: number('A fence\'s, a gate\'s or a tree\'s height, drawn only.', [1.8], 0.05, 200),
    label: { type: 'string', maxLength: NAME_MAX, description: 'The person\'s word for it.', examples: ['Old oak', 'Jetty'] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), thing: STRING, things: listSchema(STRING) } },
  run(args, context) {
    const point = (key: string): Pair | undefined => (args[key] === undefined ? undefined : pointArg(key, args[key] as string))
    const changed = writeChange(context, args, (survey) =>
      changeSiteThing(survey, {
        action: args['action'] as SiteAction,
        ...(args['id'] === undefined ? {} : { id: args['id'] as string }),
        ...(args['kind'] === undefined ? {} : { kind: args['kind'] as SiteThingKind }),
        ...(args['points'] === undefined ? {} : { points: (args['points'] as string[]).map((p) => pointArg('points', p)) }),
        ...(point('at') === undefined ? {} : { at: point('at')! }),
        ...(point('by') === undefined ? {} : { by: point('by')! }),
        ...(point('to') === undefined ? {} : { to: point('to')! }),
        ...(args['width'] === undefined ? {} : { width: args['width'] as number }),
        ...(args['canopy'] === undefined ? {} : { canopy: args['canopy'] as number }),
        ...(args['height'] === undefined ? {} : { height: args['height'] as number }),
        ...(args['label'] === undefined ? {} : { label: args['label'] as string }),
      })
    )
    const { loaded } = readPlan(context, changed.data['written'])
    const things = loaded.plan.site?.things ?? []
    const line = things.length === 0 ? 'The site has no things now.' : `The site's things, drawn only: ${siteThingsText(things)}.`
    return { text: [changed.text, line].join('\n'), data: { ...changed.data, things: things.map((t) => t.id) } }
  },
}

export const SITE_TOOLS: readonly GridTool[] = [setSiteTool, changeSiteTool]
