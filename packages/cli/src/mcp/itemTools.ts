/**
 * The items' tools (CNT-45): `grid_add_item` puts a fixture or a piece of furniture against a
 * side of a room, its turn worked out, or at a point; `grid_move_item` moves or turns one;
 * `grid_remove_item` takes items out. Each goes through `writeChange`, as every change does, and
 * answers with the room the item stands in and what Grid's checks say of it. The words are rooms
 * text's own (`item tub bath in bathroom against north, at west`); the changes are `edit/items.ts`.
 */
import { limit } from '@ongrid/floorplan/geometry'
import { ITEM_SIDES, type ItemSide, type RowWords } from '@ongrid/floorplan/rooms'
import { NAME_MAX, PARTS_MAX } from '../command/planText'
import { PathRefused } from '../fs/projectFiles'
import { addItem, moveItem, removeItems, type ItemPlace } from '../edit/items'
import { addFixtureSet, typicalRoomOf } from '../edit/fixtureSets'
import { libraryFor } from '../library/office'
import { BOOLEAN, DECIMAL_IN_ARG, floorArg, listSchema, objectSchema, PLAN_ARG, planFileOf, projectOf, STRING, ToolRefusal, type ArgSpecs, type GridTool, type ToolContext } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'
import { readSet } from './factsTool'

const PLACE_ARGS: ArgSpecs = {
  room: { type: 'string', id: true, description: 'The room it stands in, whose side against names. With x and y, only to say its floor.', examples: ['bathroom', 'bed1'] },
  against: { type: 'string', enum: ITEM_SIDES, description: 'The side of room its back stands against (north is up the drawing): it faces into the room, its turn worked out.', examples: ['north'] },
  end: { type: 'string', enum: ITEM_SIDES, description: 'With against: the end of that side it goes to, in the corner, as rooms text says "at west". Centred on the side when left out.', examples: ['west'] },
  from: { type: 'string', enum: ITEM_SIDES, description: 'With against and distance: the end of that side its place is measured from, as rooms text says "0.3 from west".', examples: ['west'] },
  distance: { type: 'number', length: true, description: 'With from: metres from that end of the side to the item\'s nearer edge.', examples: [0.3], minimum: 0, maximum: 1000 },
  full_width: { type: 'boolean', description: 'With against: as wide as that side of the room, a built-in wardrobe or a run of cupboards.', examples: [true] },
  x: { type: 'number', length: true, description: 'In place of against: its middle on the drawing, in metres, with y.', examples: [2.5], minimum: -limit('largest'), maximum: limit('largest') },
  y: { type: 'number', length: true, description: 'In place of against: its middle on the drawing, in metres, with x.', examples: [1.2], minimum: -limit('largest'), maximum: limit('largest') },
  turn: { type: 'number', description: 'With x and y: degrees counter-clockwise; 0 puts its back to -y, 90 to +x, 180 to +y, 270 to -x.', examples: [0, 90], minimum: -360, maximum: 360 },
  floor: { type: 'string', id: true, description: 'With x and y: a floor id from the plan\'s "floors". The ground floor, or room\'s, when left out.', examples: ['first'] },
}

const ITEM_OUTPUT = {
  ...EDIT_OUTPUT,
  properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), item: STRING, fits: BOOLEAN, notPlaced: listSchema(STRING), worthALook: listSchema(objectSchema({ code: STRING, id: STRING, message: STRING })) },
}

/** An out path outside the project is refused before the item is placed, whatever the plan holds. */
function outFirst(context: ToolContext, args: Record<string, unknown>): void {
  const out = args['out']
  if (typeof out !== 'string') return
  try {
    projectOf(context).resolve(out)
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw error
  }
}

/** The place from the call's arguments, each only when given. */
function placeOf(args: Record<string, unknown>): ItemPlace {
  const side = (key: string): ItemSide | undefined => args[key] as ItemSide | undefined
  const x = args['x'] as number | undefined
  const y = args['y'] as number | undefined
  if ((x === undefined) !== (y === undefined)) throw new ToolRefusal(`Give x and y together: an item's middle is both. Only ${x === undefined ? 'y' : 'x'} was given.`)
  if ((args['from'] === undefined) !== (args['distance'] === undefined)) throw new ToolRefusal('Give from and distance together: "0.3 from west" is both.')
  return {
    ...(args['room'] === undefined ? {} : { room: args['room'] as string }),
    ...(side('against') === undefined ? {} : { against: side('against')! }),
    ...(side('end') === undefined ? {} : { end: side('end')! }),
    ...(side('from') === undefined ? {} : { from: { side: side('from')!, distance: args['distance'] as number } }),
    ...(args['full_width'] === true ? { fullWidth: true } : {}),
    ...(x === undefined || y === undefined ? {} : { at: [x, y] as const }),
    ...(args['turn'] === undefined ? {} : { turn: args['turn'] as number }),
    ...(args['floor'] === undefined ? {} : { floor: args['floor'] as string }),
  }
}

/** CNT-47: the row from the call's arguments, or undefined for one item. */
function rowOf(args: Record<string, unknown>): RowWords | undefined {
  const count = args['repeat'] as number | undefined
  if (count === undefined) {
    const stray = ['every', 'rows', 'row_every', 'behind'].filter((key) => args[key] !== undefined)
    if (stray.length > 0) throw new ToolRefusal(`${stray.join(', ')} lay out a row: give repeat, how many side by side, too.`)
    return undefined
  }
  if (args['rows'] === undefined && (args['row_every'] !== undefined || args['behind'] !== undefined)) throw new ToolRefusal('row_every and behind lay out rows: give rows, how many, too.')
  const whole = (key: string): number => {
    const n = args[key] as number
    if (!Number.isInteger(n)) throw new ToolRefusal(`${key} is a whole number, not ${n}.`)
    return n
  }
  return {
    count: whole('repeat'),
    ...(args['every'] === undefined ? {} : { every: args['every'] as number }),
    ...(args['rows'] === undefined ? {} : { rows: whole('rows') }),
    ...(args['row_every'] === undefined ? {} : { rowEvery: args['row_every'] as number }),
    ...(args['behind'] === true ? { behind: true } : {}),
  }
}

export const addItemTool: GridTool = {
  name: 'grid_add_item',
  title: 'Add a fixture, furniture or a point',
  hint: 'change-plan',
  description:
    'Use this when the person asks for a fixture or a piece of furniture against a wall of a room: "a bath along the north wall of the bathroom, in the west corner", "a WC 0.3 m from the west end of the south wall", "a built-in wardrobe the full width of the bedroom\'s east wall", "a sofa against the living room\'s west wall", or for a point: "an extinguisher by the stair door", "the assembly point in the car park", "a spawn point here". '
    + 'Give name (a library entry such as bath, wc, double-bed, wardrobe, sofa-3, rack, seat, pew, fume-cupboard; grid_measure what=library lists them; or a kind: toilet, basin, shower, bath, kitchen-run, bed, table, chair, sofa, storage, armchair, stool, desk, rug, plant, and the equipment rack, generator, pump, tank, seat, pew, altar, fume-cupboard, lab-bench, safety-shower, kennel, exam-table, clinical-sink, or equipment for any other thing, given its width, depth, height and label; the bathroom\'s bidet, urinal, vanity, double-basin, towel-radiator, shower-screen; the kitchen\'s sink, hob, oven, fridge (and fridge-freezer), tall-unit, wall-unit and a commercial kitchen\'s range, fryer, prep-table, dishwasher, hood, drawn with their label; a plain word such as WC, loo or tub is read as its kind; and the points extinguisher, aed, call-point, first-aid, sensor, desk-point, spawn, camera and the fire and wayfinding set you-are-here, hose-reel, fire-door, exit, refuge, assembly-point, each placed at x and y, on a wall or outside, and drawn with its symbol and keyed), room and against: its back goes on that side\'s inside face and its turn is worked out, so it faces into the room. end puts it in a corner, from and distance that far from one, full_width makes it the length of the side; centred otherwise. Or give x and y (its middle) and turn. '
    + 'width, depth, height, elevation, clearance and label are its own figures in place of the entry\'s; elevation hangs it above the floor (a wall unit, a hood, a wall-hung WC): drawn dashed above the cut from 1 m up, and in its height checked against what stands under it; a kind with no size is Grid\'s first entry of that kind. facts gives it facts of the person\'s own (an extinguisher\'s type and service date). It answers with the room it stands in and whether it fits (a wall it runs into, an item it stands in, the clear floor kept on a side of one that something blocks; a point is in no one\'s way). Rooms text writes the same: item tub bath in bathroom against north, at west. '
    + 'repeat lays out that many side by side along their backs, every metres apart (their width unstated), and rows that many rows, row_every apart, in front of the first (behind with behind, at a point): 200 racks, 1,800 seats or a bank of kennels in one call, ids <id>-<n> or <id>-<row>-<n>; rooms text writes the same with row r rack in hall against north, repeat 20, 10 rows every 2.4. '
    + 'A room\'s usual fixtures in one call: name a typical room (kitchen, bathroom, shower-room, cloakroom, or the office\'s own) with room and no against, x or y, and each of its items is set out against a side of that room where Grid\'s checks find it clear of the walls, the doors and the other fixtures, a smaller one of the same thing (a shower for a bath, a 2.4 m kitchen run for a 3 m one) when it fits nowhere; a kind the room holds already is not added again, and notPlaced lists what fits nowhere. '
    + 'Do not use to set a typical room out at a point as it is drawn (grid_place_item), or to move or take out an item already placed (grid_move_item, grid_remove_item). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    name: { type: 'string', id: true, required: true, description: 'A library entry (bath, wc, double-bed, wardrobe), a kind (toilet, storage), or with room alone a typical room (kitchen, bathroom) whose usual fixtures are set out in it.', examples: ['bath', 'wardrobe', 'toilet', 'kitchen'] },
    id: { type: 'string', id: true, description: 'Its id. Unstated, its name, made unique.', examples: ['tub', 'robe-1'] },
    label: { type: 'string', maxLength: NAME_MAX, description: 'What the drawing calls it, in place of the entry\'s label.', examples: ['Bath 1700', 'Built-in wardrobe'] },
    ...PLACE_ARGS,
    width: { type: 'number', length: true, description: 'Its own width along its back, in metres, with depth.', examples: [1.7], minimum: 0.01, maximum: 100 },
    depth: { type: 'number', length: true, description: 'Its own depth from its back to its front, in metres; with full_width, alone.', examples: [0.7], minimum: 0.01, maximum: 100 },
    height: { type: 'number', length: true, description: 'Its own height, in metres: from the floor, or with elevation from its underside.', examples: [0.55], minimum: 0.01, maximum: 100 },
    elevation: { type: 'number', length: true, description: 'How high its underside hangs above the floor, in metres: a wall unit 1.45, a wall-hung WC 0.2. Its height is then its own. Unstated, its library entry\'s, else on the floor.', examples: [1.45, 0.2], minimum: 0, maximum: 100 },
    clearance: { type: 'number', length: true, description: 'The clear floor it keeps in front of it, in metres (0 for none).', examples: [0.7], minimum: 0, maximum: 100 },
    clear_back: { type: 'number', length: true, description: 'The clear floor it keeps behind it, as wide as it is, in metres.', examples: [0.6], minimum: 0, maximum: 100 },
    clear_left: { type: 'number', length: true, description: 'The clear floor it keeps at its own left (facing out of its front), as deep as it is, in metres.', examples: [0.9], minimum: 0, maximum: 100 },
    clear_right: { type: 'number', length: true, description: 'The clear floor it keeps at its own right (facing out of its front), as deep as it is, in metres.', examples: [0.9], minimum: 0, maximum: 100 },
    repeat: { type: 'number', description: 'How many to lay out side by side in a row, along their backs from the first one\'s left. One item when left out.', examples: [20], minimum: 1, maximum: PARTS_MAX },
    every: { type: 'number', length: true, description: 'With repeat: metres from one middle to the next along the row. Their width, so they touch, when left out.', examples: [0.6, 0.55], minimum: 0.01, maximum: 100 },
    rows: { type: 'number', description: 'With repeat: how many rows, each in front of the last.', examples: [10], minimum: 1, maximum: PARTS_MAX },
    row_every: { type: 'number', length: true, description: 'With rows: metres from one row to the next. Their depth and the clear floor in front, the aisle, when left out.', examples: [2.4, 0.9], minimum: 0.01, maximum: 1000 },
    behind: { type: 'boolean', description: 'With rows, at a point: each row behind the last in place of in front of it.', examples: [true] },
    facts: {
      type: 'object',
      description: 'Facts of the person\'s own the item carries, by name: text, a number, or true or false (an extinguisher\'s type, a sensor\'s address). grid_find, grid_count and grid_schedule of=items read them.',
      examples: [{ type: 'CO2', serviced: '2026-09' }, { address: 'S-14' }],
      schema: { type: 'object', properties: {}, additionalProperties: { type: ['string', 'number', 'boolean'], maxLength: NAME_MAX }, maxProperties: 30 },
      read: (value) => readSet(value),
    },
    out: OUT_ARG,
  },
  outputSchema: { ...ITEM_OUTPUT, properties: { ...ITEM_OUTPUT.properties, placed: listSchema(STRING) } },
  run(args, context) {
    outFirst(context, args)
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    const width = args['width'] as number | undefined
    const depth = args['depth'] as number | undefined
    if (width !== undefined && depth === undefined) throw new ToolRefusal("Give width with depth: the item's own size is both.")
    const row = rowOf(args)
    const clearSides = {
      ...(args['clear_back'] === undefined ? {} : { back: args['clear_back'] as number }),
      ...(args['clear_left'] === undefined ? {} : { left: args['clear_left'] as number }),
      ...(args['clear_right'] === undefined ? {} : { right: args['clear_right'] as number }),
    }
    return writeChange(context, args, (survey) => {
      const { library } = libraryFor(project, file, survey.plan)
      // CNT-48: a typical room named with a room and no place: its usual fixtures, each where it fits.
      const set = args['room'] !== undefined && args['against'] === undefined && args['x'] === undefined && args['y'] === undefined ? typicalRoomOf(library, args['name'] as string) : undefined
      if (set !== undefined) {
        const own = ['id', 'label', 'facts', 'width', 'depth', 'height', 'elevation', 'clearance', 'clear_back', 'clear_left', 'clear_right', 'end', 'from', 'distance', 'full_width', 'turn', 'floor', 'repeat', 'every', 'rows', 'row_every', 'behind'].filter((key) => args[key] !== undefined)
        if (own.length > 0) throw new ToolRefusal(`${JSON.stringify(args['name'])} is a typical room of several items, each set out where it fits, so it takes no ${own.join(', ')}: give name and room alone, or add its items one by one.`)
        return addFixtureSet(survey, library, { name: args['name'] as string, room: args['room'] as string })
      }
      const floor = floorArg(survey.plan, args['floor'])
      return addItem(survey, library, {
        name: args['name'] as string,
        ...(args['id'] === undefined ? {} : { id: args['id'] as string }),
        ...(args['label'] === undefined ? {} : { label: (args['label'] as string).normalize('NFC') }),
        ...(width !== undefined && depth !== undefined ? { size: [width, depth] as const } : {}),
        ...(width === undefined && depth !== undefined ? { depth } : {}),
        ...(args['height'] === undefined ? {} : { height: args['height'] as number }),
        ...(args['elevation'] === undefined ? {} : { elevation: args['elevation'] as number }),
        ...(args['clearance'] === undefined ? {} : { clearance: args['clearance'] as number }),
        ...(Object.keys(clearSides).length === 0 ? {} : { clearSides }),
        ...(row === undefined ? {} : { row }),
        ...(args['facts'] === undefined ? {} : { facts: args['facts'] as Record<string, string | number | boolean> }),
        ...placeOf(args),
        ...(floor === undefined ? {} : { floor }),
      })
    })
  },
}

export const moveItemTool: GridTool = {
  name: 'grid_move_item',
  title: 'Move or turn a fixture or furniture',
  hint: 'change-plan',
  description:
    'Use this when the person asks to move, turn or re-place a fixture or a piece of furniture already in the plan: "put the sofa against the east wall instead", "move the desk 0.5 m north", "turn the bed to face the window", "move the WC into the other bathroom", "a second seating layout". '
    + 'Name it by id (grid_view and grid_find of=item list them), then give where it goes: room and against (with end, from and distance, or full_width) as grid_add_item takes them, x and y with turn, turn alone to turn it where it stands, or dx and dy to move it by a distance. It keeps its kind, size and height. '
    + 'It answers with where it now stands and whether it fits. Do not move a door or a wall to clear an item: move the item. Do not use to add an item (grid_add_item) or take one out (grid_remove_item). It replaces the plan file unless out is given. Lengths are metres, or text with their unit.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    id: { type: 'string', id: true, required: true, description: 'The item to move.', examples: ['sofa-3', 'tub'] },
    ...PLACE_ARGS,
    dx: { type: 'number', length: true, description: 'With dy: metres to move it east (+) or west (-).', examples: [0.5], minimum: -1000, maximum: 1000 },
    dy: { type: 'number', length: true, description: 'With dx: metres to move it north (+) or south (-).', examples: [0], minimum: -1000, maximum: 1000 },
    out: OUT_ARG,
  },
  outputSchema: ITEM_OUTPUT,
  run(args, context) {
    outFirst(context, args)
    const dx = args['dx'] as number | undefined
    const dy = args['dy'] as number | undefined
    if ((dx === undefined) !== (dy === undefined)) throw new ToolRefusal('Give dx and dy together (0 for no move that way).')
    const place = placeOf(args)
    return writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor'])
      return moveItem(survey, { id: args['id'] as string, ...place, ...(floor === undefined ? {} : { floor }), ...(dx !== undefined && dy !== undefined ? { by: [dx, dy] as const } : {}) })
    })
  },
}

export const removeItemTool: GridTool = {
  name: 'grid_remove_item',
  title: 'Take out fixtures or furniture',
  hint: 'change-plan',
  description:
    'Use this when the person asks to take a fixture or a piece of furniture out of the plan: "remove the second WC", "take the sofa out", "clear the lounge to lay it out again". '
    + 'Give ids (grid_view and grid_find of=item list them), or room to take out every item standing in that room. It answers with what it took out. '
    + 'Do not use to move an item (grid_move_item), or to take out a wall, a room or an opening. It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    ids: { type: 'array', description: 'The items to take out, by id.', examples: [['wc-2'], ['sofa-3', 'table-1']], items: { id: true }, minItems: 1, maxItems: 500 },
    room: { type: 'string', id: true, description: 'A room to clear: every item standing in it is taken out.', examples: ['lounge'] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), removed: listSchema(STRING) } },
  run(args, context) {
    outFirst(context, args)
    if (args['ids'] === undefined && args['room'] === undefined) throw new ToolRefusal('Give ids, the items to take out, or room, a room to clear.')
    return writeChange(context, args, (survey) => removeItems(survey, { ...(args['ids'] === undefined ? {} : { ids: args['ids'] as string[] }), ...(args['room'] === undefined ? {} : { room: args['room'] as string }) }))
  },
}

export const ITEM_TOOLS: readonly GridTool[] = [addItemTool, moveItemTool, removeItemTool]
