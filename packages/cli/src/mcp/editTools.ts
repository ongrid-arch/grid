/**
 * The room edits of `grid serve` (WRT-3, lab WR-2): one sentence of request is one call. Merge
 * two rooms, split one, build a room against a side, stretch the whole building, and rename a
 * room or change its use. Each goes through `writeChange` as the other changes do: worked out
 * on Grid's reading of the plan, refused with nothing written when it would break the drawing,
 * and written back with only that change in the file's own JSON. Each answer says what changed,
 * what was guessed and what could not be kept, and names the file as a path in the project.
 */
import { OPENING_KINDS, ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { NAME_MAX } from '../command/planText'
import { addOpening } from '../edit/addOpening'
import { addRoom, IN_THE_WAY, SIZE_BASES } from '../edit/addRoom'
import { DIRECTIONS, type Direction } from '../edit/edits'
import { mergeRooms } from '../edit/merge'
import { renameRoom, type UseOrNone } from '../edit/rename'
import { splitRoom } from '../edit/split'
import { squarePlan } from '../edit/square'
import { stretchPlan } from '../edit/stretch'
import { limit } from '@ongrid/floorplan/geometry'
import { placeItems } from '../edit/place'
import { libraryFor } from '../library/office'
import { DECIMAL_IN_ARG, floorArg, listSchema, NUMBER, objectSchema, PLAN_ARG, planFileOf, projectOf, roomArg, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

const NAME = (description: string, example: string, required = false): { type: 'string'; maxLength: number; description: string; examples: string[]; required: boolean } => ({ type: 'string', maxLength: NAME_MAX, description, examples: [example], required })
const USE_WORDS_TAKEN = `One of ${ROOM_USES.join(', ')}; or a word that plainly means one, in the person's language (cocina, Flur, salle de bains), read as that use.`
/** MSG-22: a room's use, or a word that plainly means one in the person's language (`cocina`), read as the use. */
const USE = (description: string): { type: 'string'; use: true; description: string; examples: string[] } => ({ type: 'string', use: true, description: `${description} ${USE_WORDS_TAKEN}`, examples: ['bathroom', 'cocina'] })

const mergeTool: GridTool = {
  name: 'grid_merge_rooms',
  title: 'Knock two rooms into one',
  hint: 'change-plan',
  description:
    'Use this when the person asks to knock two rooms into one, open them up or take out the wall between them: "knock the kitchen and living room into one". '
    + 'It takes out the stretch of wall the two rooms share, cut where the walls round them meet it, with the doors and windows in that stretch; the first room takes in the second and keeps its id, name and use unless name or use say otherwise. '
    + 'Two rooms of different uses (a kitchen and a living room) need use, the merged room\'s, or zones true, which keeps both as zones of one open-plan room, each with its id, name and use, either side of a dividing line; left out, the call is refused and asks. It answers with the area of the room it makes, and the verdict names any use the plan no longer has. A type fact the rooms carry ("1.5x3") is kept as the first room\'s and said to be out of date, unless type gives the merged room its own; two doors on one wall of the merged room are named, with the call that takes one out. '
    + 'When the two share several walls (an earlier knock-through left two), every shared stretch is taken out in the one call, and the answer names each wall cut; a counted fact the two rooms state differently (desks 28 and 40) is answered with the value kept and the one not, so correct it if it should be the sum. Rooms whose meeting would leave more than one outline or a hole are refused. Do not use to make a room bigger by moving a wall (grid_move_room_side). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room that takes in the other and keeps its id; with zones, the first zone.', examples: ['living'] },
    with: { type: 'string', id: true, required: true, description: 'The room it takes in, which is gone after; with zones, the second zone.', examples: ['kitchen'] },
    name: NAME('The merged room\'s name. The first room\'s when left out.', 'Kitchen and living'),
    use: USE('The merged room\'s use. The first room\'s when left out; needed when the two rooms have different uses, unless zones is true.'),
    type: { type: 'string', maxLength: NAME_MAX, description: 'The merged room\'s type, the value of the type fact its rooms carry (a fact named "type" when they carry none). Left out, the merged room keeps the first room\'s type, and the answer says it may no longer fit.', examples: ['3x3'] },
    zones: { type: 'boolean', description: 'true to keep both rooms as zones of the merged room, each with its id, name and use: an open-plan room. The merged room is a new room.', examples: [true] },
    new_room: { type: 'string', id: true, description: 'With zones: the merged room\'s id. Made from the two rooms\' ids when left out.', examples: ['kitchen-living'] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const a = roomArg(survey.plan, args['room'])
      const b = roomArg(survey.plan, args['with'], 'with room')
      return mergeRooms(survey, a, b, {
        ...(args['name'] !== undefined ? { name: args['name'] as string } : {}),
        ...(args['use'] !== undefined ? { use: args['use'] as string } : {}),
        ...(args['type'] !== undefined ? { type: args['type'] as string } : {}),
        ...(args['zones'] === true ? { zones: true } : {}),
        ...(args['new_room'] !== undefined ? { id: args['new_room'] as string } : {}),
      })
    })
  },
}

const splitTool: GridTool = {
  name: 'grid_split_room',
  title: 'Split a room in two',
  hint: 'change-plan',
  description:
    'Use this when the person asks to divide a room, or take part of one for another room: "bedroom 2 into a study and a second bathroom", "a 1.4 m bathroom off the east end". '
    + 'A new wall goes across the room; the new room takes its side, size metres inside from that side\'s face, and the room keeps its id and the rest, with name and use for its own if they change. A door goes in the new wall, centred unless door_from and door_distance place it (door_width 0 for none). It answers with both areas, what it guessed and a room left with no window. '
    + 'Rectangles square to the drawing only. Do not use to add a room outside the walls (grid_add_room). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room to split.', examples: ['bed2'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'The side of the room the new room takes.', examples: ['east'] },
    size: { type: 'number', length: true, required: true, description: 'The new room\'s inside size across from that side, in metres.', examples: [1.4], minimum: 0.3, maximum: 100 },
    new_room: { type: 'string', id: true, required: true, description: 'The new room\'s id.', examples: ['bath2'] },
    new_name: NAME('The new room\'s name.', 'Bathroom 2', true),
    new_use: USE('The new room\'s use.'),
    name: NAME('The room\'s own new name, if it changes.', 'Study'),
    use: USE('The room\'s own new use, if it changes.'),
    wall: { type: 'string', id: true, description: 'An id for the new wall. Made from the new room\'s when left out.', examples: ['study-east'] },
    thickness: { type: 'number', length: true, description: 'The new wall\'s thickness, in metres. 0.1 when left out.', examples: [0.1], minimum: 0.03, maximum: 1 },
    door_width: { type: 'number', length: true, description: 'The door in the new wall, in metres; 0 for none. 0.8 when left out. As wide as the new wall allows.', examples: [0.7, 0], minimum: 0, maximum: limit('openingWidest') },
    door_from: { type: 'string', enum: DIRECTIONS, description: 'Which end of the new wall the door is measured from: a side of the room.', examples: ['south'] },
    door_distance: { type: 'number', length: true, description: 'Metres from that side\'s inside face to the door\'s nearer edge.', examples: [1.35], minimum: 0, maximum: 100 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const id = roomArg(survey.plan, args['room'])
      return splitRoom(survey, id, {
        side: args['side'] as Direction,
        size: args['size'] as number,
        newRoom: { id: args['new_room'] as string, name: args['new_name'] as string, ...(args['new_use'] !== undefined ? { use: args['new_use'] as string } : {}) },
        ...(args['name'] !== undefined ? { name: args['name'] as string } : {}),
        ...(args['use'] !== undefined ? { use: args['use'] as string } : {}),
        ...(args['wall'] !== undefined ? { wallId: args['wall'] as string } : {}),
        ...(args['thickness'] !== undefined ? { thickness: args['thickness'] as number } : {}),
        ...(args['door_width'] !== undefined ? { doorWidth: args['door_width'] as number } : {}),
        ...(args['door_from'] !== undefined ? { doorFrom: args['door_from'] as Direction } : {}),
        ...(args['door_distance'] !== undefined ? { doorDistance: args['door_distance'] as number } : {}),
      })
    })
  },
}

const addRoomTool: GridTool = {
  name: 'grid_add_room',
  title: 'Add a room against a side',
  hint: 'change-plan',
  description:
    'Use this when the person asks for an extension or a new room outside the walls, against one side of a room: "a 3 x 4 m extension at the back of the living room, with an opening into it and a door to the garden". '
    + 'It builds the room\'s three walls, as thick as the wall it stands against, cuts that wall where they meet it, and makes the stretch between the rooms an inside wall. A door or window in that stretch is in the way: pass in_the_way remove or keep (kept, it joins the two rooms); left out, the call is refused naming them. opening_width puts a doorless opening between the rooms and door_width a door in the far side, both centred. '
    + 'Sizes are inside sizes unless size is centre (to the walls\' centre lines). The door is drawn with no swing until grid_change_opening gives it one, or a kind such as sliding or folding. Do not use to make an existing room bigger (grid_move_room_side) or to divide one (grid_split_room). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The new room\'s id.', examples: ['extension'] },
    name: NAME('The new room\'s name.', 'Garden room', true),
    use: USE('The new room\'s use.'),
    against: { type: 'string', id: true, required: true, description: 'The room it is built against.', examples: ['living'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which side of that room: north is the top of the drawing.', examples: ['south'] },
    width: { type: 'number', length: true, required: true, description: 'Its size along that side, in metres.', examples: [3], minimum: 0.5, maximum: 100 },
    depth: { type: 'number', length: true, required: true, description: 'Its size out from that side, in metres.', examples: [4], minimum: 0.5, maximum: 100 },
    size: { type: 'string', enum: SIZE_BASES, description: 'inside (the default) or centre: what width and depth measure to.', examples: ['inside', 'centre'] },
    from: { type: 'string', enum: DIRECTIONS, description: 'Its place along the side: which side of the room it is built against it is measured from. Centred when left out.', examples: ['west'] },
    distance: { type: 'number', length: true, description: 'Metres from that side\'s inside face to the new room\'s inside face.', examples: [0.8], minimum: 0, maximum: 100 },
    in_the_way: { type: 'string', enum: IN_THE_WAY, description: 'What happens to doors and windows in the stretch of wall it covers: remove, or keep them between the two rooms.', examples: ['remove'] },
    opening_width: { type: 'number', length: true, description: 'A doorless opening between the two rooms, centred, in metres.', examples: [2.4], minimum: 0, maximum: limit('openingWidest') },
    door_width: { type: 'number', length: true, description: 'A door in the far side, to the outside, centred, in metres.', examples: [2.2], minimum: 0, maximum: limit('openingWidest') },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const against = roomArg(survey.plan, args['against'], 'against room')
      return addRoom(survey, {
        id: args['room'] as string,
        name: args['name'] as string,
        ...(args['use'] !== undefined ? { use: args['use'] as string } : {}),
        against,
        side: args['side'] as Direction,
        width: args['width'] as number,
        depth: args['depth'] as number,
        ...(args['size'] !== undefined ? { size: args['size'] as (typeof SIZE_BASES)[number] } : {}),
        ...(args['from'] !== undefined ? { from: args['from'] as Direction } : {}),
        ...(args['distance'] !== undefined ? { distance: args['distance'] as number } : {}),
        ...(args['in_the_way'] !== undefined ? { inTheWay: args['in_the_way'] as (typeof IN_THE_WAY)[number] } : {}),
        ...(args['opening_width'] !== undefined ? { openingWidth: args['opening_width'] as number } : {}),
        ...(args['door_width'] !== undefined ? { doorWidth: args['door_width'] as number } : {}),
      })
    })
  },
}

const stretchTool: GridTool = {
  name: 'grid_stretch',
  title: 'Make the building wider or longer',
  hint: 'change-plan',
  description:
    'Use this when the person asks for the whole building, flat or house wider, longer or deeper: "the flat 30 cm wider", "the house 1 m longer to the north, through the kitchen". '
    + 'Everything beyond a line across the building moves out by the distance: the line is just inside the outside wall on that side, or through the middle of a room with through. Walls across the line get longer and the rooms they bound grow, and the columns, parking bays, stairs, ramps, structural grids and site things beyond it move with them, an opening pattern keeping its pitch (what stays behind is named); every floor moves together unless floor names one. Doors and windows keep their anchor or their place in the building, so one in a wall that grows at its start does not slide. '
    + 'Do not use for one room (grid_move_room_side). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which way it grows: north is the top of the drawing.', examples: ['east'] },
    by: { type: 'number', length: true, required: true, description: 'Metres to grow; negative to shrink.', examples: [0.3, -0.2], minimum: -50, maximum: 50 },
    through: { type: 'string', id: true, description: 'A room the line runs through, across its middle: it and the rooms in line with it grow.', examples: ['living'] },
    floor: { type: 'string', id: true, description: 'A floor id from the plan\'s "floors": stretch that floor only. Every floor when left out.', examples: ['ground'] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    if (args['by'] === 0) throw new ToolRefusal('by is 0: nothing would move.')
    return writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor'])
      const through = args['through'] === undefined ? undefined : roomArg(survey.plan, args['through'], 'through room')
      return stretchPlan(survey, { side: args['side'] as Direction, by: args['by'] as number, ...(through !== undefined ? { through } : {}), ...(floor !== undefined ? { floor } : {}) })
    })
  },
}

const renameTool: GridTool = {
  name: 'grid_rename_room',
  title: 'Rename a room, or change its use, finishes or whether it is heated',
  hint: 'change-plan',
  description:
    'Use this when the person asks to call a room something else, to use it for something else, what its floor, walls, ceiling or skirting are finished in, or whether it is heated or cooled: "the front room is a bedroom now", "the room names in Spanish", "tile the kitchen floor", "the bathroom walls are tiled", "the lanai is not air-conditioned", "the garage is heated now". '
    + 'conditioned says whether the room is in the living area under air (grid_areas): unstated, a room is under air unless it is used for parking, and outdoor space never is. '
    + 'It changes the room\'s name, its use (none to leave it unstated), its finishes (by the person\'s own names; none takes one out), or more than one, and nothing else, and answers with which of Grid\'s checks now look at the room and which no longer do: they go by its use, never its name. A zone of an open-plan room takes finishes too: its part of the room is finished in them. '
    + 'Do not use to change a room\'s size (grid_move_room_side) or its id. It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room to rename or give another use.', examples: ['bed2'] },
    name: NAME('Its new name.', 'Dormitorio 2'),
    use: { type: 'string', use: true, enum: ['none'], description: `Its new use, or none to leave its use unstated. ${USE_WORDS_TAKEN}`, examples: ['other', 'bedroom', 'cocina'] },
    floor_finish: NAME('Its floor finish, in the person\'s words, or none to take it out.', 'Porcelain tile'),
    wall_finish: NAME('The finish of its walls\' inside faces, or none to take it out.', 'Painted plaster'),
    ceiling_finish: NAME('Its ceiling finish, or none to take it out.', 'Painted plasterboard'),
    skirting_finish: NAME('Its skirting, or none to take it out.', 'Oak skirting'),
    conditioned: { type: 'string', enum: ['yes', 'no'], description: 'yes when the room is heated or cooled, so in the living area under air; no when it is not, so in the total under roof only.', examples: ['no', 'yes'] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), checks: objectSchema({ now: listSchema(STRING), noLonger: listSchema(STRING) }) } },
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const id = roomArg(survey.plan, args['room'])
      const finishes = Object.fromEntries((['floor', 'wall', 'ceiling', 'skirting'] as const).filter((surface) => args[`${surface}_finish`] !== undefined).map((surface) => [surface === 'wall' ? 'walls' : surface, args[`${surface}_finish`] as string]))
      return renameRoom(survey, id, { ...(args['name'] !== undefined ? { name: args['name'] as string } : {}), ...(args['use'] !== undefined ? { use: args['use'] as UseOrNone } : {}), ...(Object.keys(finishes).length === 0 ? {} : { finishes }), ...(args['conditioned'] === undefined ? {} : { conditioned: args['conditioned'] === 'yes' }) })
    })
  },
}

const squareTool: GridTool = {
  name: 'grid_square_scan',
  title: 'Square a scanned plan',
  hint: 'change-plan',
  description:
    'Use this when a plan came from a scan or a capture and its walls are a degree or two off square, or the person asks to square it up or straighten the walls: "square the scan". '
    + 'It turns each wall within about 3 degrees of the plan\'s main directions onto them, about its middle, puts the corners back where the new lines cross, and answers with how far each wall turned and moved; a wall further off is left as it is and named. '
    + 'Only the walls the plan marks scanned (its marks, source scanned) are squared unless all is true. The marks stay, so areas from those walls still carry their give or take. '
    + 'Do not use for a plan drawn by hand, or to move one wall (grid_move_room_side). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm); angles are degrees.',
  args: {
    plan: PLAN_ARG,
    all: { type: 'boolean', description: 'true to square every wall, not only those marked scanned. false when left out.', examples: [true, false] },
    floor: { type: 'string', id: true, description: 'A floor id from the plan\'s "floors": square that floor only. Every floor when left out.', examples: ['ground'] },
    out: OUT_ARG,
  },
  outputSchema: {
    ...EDIT_OUTPUT,
    properties: {
      ...(EDIT_OUTPUT['properties'] as Record<string, unknown>),
      // WRT-6 (lab AE-4): each wall the squaring moved, and the walls it left as they were.
      moves: listSchema(objectSchema({ wall: STRING, turned: NUMBER, moved: NUMBER })),
      leftAsTheyAre: listSchema(STRING),
    },
  },
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor'])
      return squarePlan(survey, { ...(args['all'] === true ? { all: true } : {}), ...(floor !== undefined ? { floor } : {}) })
    })
  },
}

// CNT-20 (C30): a library item or a typical room placed by name.
const placeTool: GridTool = {
  name: 'grid_place_item',
  title: 'Place a fixture, furniture or a typical room from the library',
  hint: 'change-plan',
  description:
    'Use this when the person asks to put a fixture or a piece of furniture in the plan, or a whole typical room\'s worth: "put a double bed in the main bedroom", "a bath and a WC in the bathroom", "use our standard bathroom here", "will a double bed and two side tables fit". '
    + 'It places a library entry by name (grid_measure what=library lists them: Grid\'s own sizes, the office\'s files in the library folder beside the plan, and the plan\'s own), so a double bed is the same bed every time, with its size, height and the clear floor it keeps in front, and answers with the room it landed in and whether it fits: a wall it runs into, an item it stands in, the clear floor kept in front of one that something blocks. '
    + 'x and y are the middle of an item, or the inside back-left corner of a typical room, whose items are set out from there; unturned, an item\'s back faces -y (down the drawing), and turn turns it counter-clockwise. An entry from the office\'s folder is copied into the plan, so the plan reads the same without the folder. '
    + 'Do not use to move or size an item already placed, or to add a room (grid_add_room). It replaces the plan file unless out is given. Lengths are metres, or text with their unit; angles are degrees.',
  args: {
    plan: PLAN_ARG,
    name: { type: 'string', id: true, required: true, description: 'The library entry: an item (double-bed, wc, bath) or a typical room (bathroom, double-bedroom), or an office\'s own.', examples: ['double-bed', 'bathroom'] },
    x: { type: 'number', length: true, required: true, description: 'Where on the drawing, in metres: an item\'s middle, or a typical room\'s inside back-left corner.', examples: [2.5], minimum: -limit('largest'), maximum: limit('largest') },
    y: { type: 'number', length: true, required: true, description: 'Where on the drawing, in metres, with x.', examples: [1.2], minimum: -limit('largest'), maximum: limit('largest') },
    turn: { type: 'number', description: 'Degrees counter-clockwise: 0 puts an item\'s back to -y, 90 to +x, 180 to +y, 270 to -x. 0 when left out.', examples: [0, 90, 180], minimum: -360, maximum: 360 },
    floor: { type: 'string', id: true, description: 'A floor id from the plan\'s "floors". The ground floor when left out.', examples: ['first'] },
    id: { type: 'string', id: true, description: 'For an item: its id. Unstated, its library name, made unique.', examples: ['bed-main'] },
    out: OUT_ARG,
  },
  outputSchema: {
    ...EDIT_OUTPUT,
    properties: {
      ...(EDIT_OUTPUT['properties'] as Record<string, unknown>),
      placed: listSchema(STRING),
      fits: { type: 'boolean' },
      worthALook: listSchema(objectSchema({ code: STRING, id: STRING, message: STRING })),
    },
  },
  run(args, context) {
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    return writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor'])
      const { library, problems } = libraryFor(project, file, survey.plan)
      return placeItems(survey, library, {
        name: args['name'] as string,
        at: [args['x'] as number, args['y'] as number],
        ...(args['turn'] !== undefined ? { turn: args['turn'] as number } : {}),
        ...(floor !== undefined ? { floor } : {}),
        ...(args['id'] !== undefined ? { id: args['id'] as string } : {}),
      }, problems)
    })
  },
}

// WRT-72: a door, window or opening added to a plan that already has its walls.
const addOpeningTool: GridTool = {
  name: 'grid_add_opening',
  title: 'Add a door, window or opening',
  hint: 'change-plan',
  description:
    'Use this when the person asks to put a door, window or doorless opening in a wall that has none there: "a door in the bathroom\'s north wall", "a window in the kitchen, 0.6 from the east side", "a door between the hall and the living room", "a 2.4 m opening into the garden room", "a sliding door to the terrace". '
    + 'It adds one opening to the plan as it is, with nothing else rewritten (so it works over a plan with phases, where it is new work, or one with parts written by hand). Say where: room with side (that side of the room\'s wall) or room with between (the wall the two rooms share). Centred unless from and distance place it, as rooms text does: "0.25 from west" is from and distance, from a side of room. '
    + 'width, height and sill default to rooms text\'s own (a door 0.9 × 2.1 m; a window 1.2 m wide, sill 0.9 m, 1.2 m high). A door opens into a room or "outside" with opens_into and is hinged on the left or right as seen from a room with hinged; given neither it has no swing drawn, and the answer says so. A width that does not fit is refused with the wall\'s free stretches, as grid_change_opening refuses one, and nothing is written. '
    + 'Do not use to change, move or take out an opening already there (grid_change_opening), or to build a room (grid_add_room). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    type: { type: 'string', enum: ['door', 'window', 'opening'], required: true, description: 'A door, a window or a doorless opening.', examples: ['door', 'window', 'opening'] },
    room: { type: 'string', id: true, required: true, description: 'The room whose side it goes in; with between, the first of the two rooms.', examples: ['bath', 'hall'] },
    side: { type: 'string', enum: DIRECTIONS, description: 'The side of room whose wall it goes in. Give this or between.', examples: ['north'] },
    between: { type: 'string', id: true, description: 'A second room: it goes in the wall the two rooms share. Give this or side.', examples: ['living'] },
    from: { type: 'string', enum: DIRECTIONS, description: 'With distance: the side of room (its inside face) its place is measured from, as rooms text says "0.25 from west".', examples: ['west'] },
    distance: { type: 'number', length: true, description: 'With from: metres from that side to the opening\'s nearer edge. Left out with from, it is centred.', examples: [0.25], minimum: 0, maximum: 100 },
    width: { type: 'number', length: true, description: 'The width of the hole in the wall, in metres. 0.9 for a door or opening, 1.2 for a window when left out.', examples: [0.9, 1.5], minimum: 0.3, maximum: limit('openingWidest') },
    height: { type: 'number', length: true, description: 'Its height, in metres. 2.1 for a door or opening, 1.2 for a window when left out.', examples: [2.1, 1.2], minimum: 0.2, maximum: 10 },
    sill: { type: 'number', length: true, description: 'The height of its lower edge above the floor, in metres. 0.9 for a window, 0 otherwise when left out.', examples: [0.9, 0], minimum: 0, maximum: 5 },
    kind: { type: 'string', enum: [...OPENING_KINDS], description: 'Its kind. A door: single, double, sliding, pocket, folding, roller or garage. A window: single, double, sliding, fixed or high-level.', examples: ['sliding', 'double'] },
    opens_into: { type: 'string', id: true, description: 'Doors: the room id it opens into, or "outside": one of the two sides of its wall.', examples: ['hall', 'outside'] },
    hinged: { type: 'string', enum: ['left', 'right'], description: 'Doors, with opens_into: the side it is hinged on as seen from seen_from, else from the room it opens into.', examples: ['left'] },
    seen_from: { type: 'string', id: true, description: 'Doors, with hinged: the room id it is seen from, or "outside". The room it opens into when left out.', examples: ['bedroom'] },
    id: { type: 'string', id: true, description: 'Its id. Unstated, made from its type, room and side, and unique.', examples: ['door-bath'] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const room = roomArg(survey.plan, args['room'])
      const between = args['between'] !== undefined ? roomArg(survey.plan, args['between'], 'between room') : undefined
      if (args['opens_into'] !== undefined && args['opens_into'] !== 'outside') roomArg(survey.plan, args['opens_into'], 'opens_into room')
      if (args['seen_from'] !== undefined && args['seen_from'] !== 'outside') roomArg(survey.plan, args['seen_from'], 'seen_from room')
      return addOpening(survey, {
        type: args['type'] as 'door' | 'window' | 'opening',
        room,
        ...(args['side'] !== undefined ? { side: args['side'] as Direction } : {}),
        ...(between !== undefined ? { between } : {}),
        ...(args['from'] !== undefined ? { from: args['from'] as Direction } : {}),
        ...(args['distance'] !== undefined ? { distance: args['distance'] as number } : {}),
        ...(args['width'] !== undefined ? { width: args['width'] as number } : {}),
        ...(args['height'] !== undefined ? { height: args['height'] as number } : {}),
        ...(args['sill'] !== undefined ? { sill: args['sill'] as number } : {}),
        ...(args['kind'] !== undefined ? { kind: args['kind'] as (typeof OPENING_KINDS)[number] } : {}),
        ...(args['opens_into'] !== undefined ? { opensInto: args['opens_into'] as string } : {}),
        ...(args['hinged'] !== undefined ? { hinged: args['hinged'] as 'left' | 'right' } : {}),
        ...(args['seen_from'] !== undefined ? { seenFrom: args['seen_from'] as string } : {}),
        ...(args['id'] !== undefined ? { id: args['id'] as string } : {}),
      })
    })
  },
}

/** In the order `tools/list` gives them, after the other changes to the plan. */
export const EDIT_TOOLS: readonly GridTool[] = [mergeTool, splitTool, addRoomTool, stretchTool, renameTool, squareTool, placeTool, addOpeningTool]
