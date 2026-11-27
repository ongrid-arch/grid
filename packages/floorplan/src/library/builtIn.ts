/**
 * CNT-20 (C30): Grid's built-in library: named sizes of fixtures and furniture, and typical rooms
 * made of them, so an agent that places "a double bed" places the same bed every time.
 *
 * Every size here is Grid's own: a plain, common size for the thing, written for this library and
 * read from no document, so each entry's `source` says so. None is a code's figure or a product's:
 * an office that works to a document or a maker's sizes keeps its own entries in its library
 * folder (`library/` in the project), each with its source.
 *
 * A built-in entry never changes size once released: a plan that names `double-bed` reads the
 * same bed in every version. A new size is a new name. Pure data.
 */
import type { LibraryItem, RoomUse } from '../types/floorplan'

/** What every built-in entry says of where its size comes from. */
export const BUILT_IN_SOURCE = "Grid's own size, not a code figure"

const entry = (name: string, kind: string, label: string, size: readonly [number, number], height: number, clearance?: number, elevation?: number): LibraryItem => ({
  name,
  kind,
  label,
  size: [size[0], size[1]],
  height,
  ...(elevation === undefined ? {} : { elevation }),
  ...(clearance === undefined ? {} : { clearance }),
  source: BUILT_IN_SOURCE,
})

/**
 * The built-in items, by kind. `size` is the width along the back and the depth to the front; a
 * bed's back is its head, so its depth is its length. `clearance` is the clear floor kept in
 * front of it, as wide as it is.
 */
export const BUILT_IN_ITEMS: readonly LibraryItem[] = [
  entry('wc', 'toilet', 'WC', [0.4, 0.65], 0.8, 0.6),
  entry('wc-compact', 'toilet', 'WC', [0.36, 0.6], 0.8, 0.6),
  entry('basin', 'basin', 'Basin', [0.55, 0.45], 0.85, 0.6),
  entry('basin-small', 'basin', 'Basin', [0.45, 0.35], 0.85, 0.6),
  entry('shower-800', 'shower', 'Shower', [0.8, 0.8], 2, 0.6),
  entry('shower-900', 'shower', 'Shower', [0.9, 0.9], 2, 0.6),
  entry('shower-1200', 'shower', 'Shower', [1.2, 0.8], 2, 0.6),
  entry('bath', 'bath', 'Bath', [1.7, 0.7], 0.55, 0.7),
  entry('bath-1500', 'bath', 'Bath', [1.5, 0.7], 0.55, 0.7),
  entry('kitchen-run-2400', 'kitchen-run', 'Kitchen', [2.4, 0.6], 0.9, 1.2),
  entry('kitchen-run-3000', 'kitchen-run', 'Kitchen', [3, 0.6], 0.9, 1.2),
  entry('single-bed', 'bed', 'Single bed', [0.9, 2], 0.5, 0.6),
  entry('double-bed', 'bed', 'Double bed', [1.4, 2], 0.5, 0.6),
  entry('large-double-bed', 'bed', 'Double bed', [1.6, 2], 0.5, 0.6),
  entry('king-bed', 'bed', 'King bed', [1.8, 2], 0.5, 0.6),
  entry('side-table', 'table', 'Side table', [0.45, 0.4], 0.55),
  entry('bedside-table', 'table', 'Bedside table', [0.4, 0.35], 0.5),
  entry('coffee-table', 'table', 'Coffee table', [1.1, 0.6], 0.4),
  entry('dining-table-4', 'table', 'Table', [1.2, 0.8], 0.75),
  entry('dining-table-6', 'table', 'Table', [1.8, 0.9], 0.75),
  entry('chair', 'chair', 'Chair', [0.45, 0.5], 0.9),
  entry('stool', 'stool', 'Stool', [0.35, 0.35], 0.45),
  entry('bar-stool', 'stool', 'Bar stool', [0.4, 0.4], 0.75),
  entry('armchair', 'armchair', 'Armchair', [0.8, 0.85], 0.85),
  entry('sofa-2', 'sofa', 'Sofa', [1.6, 0.9], 0.85),
  entry('sofa-3', 'sofa', 'Sofa', [2.1, 0.9], 0.85),
  entry('wardrobe', 'storage', 'Wardrobe', [1, 0.6], 2, 0.6),
  entry('chest-of-drawers', 'storage', 'Drawers', [0.8, 0.45], 0.8, 0.5),
  entry('tv-unit', 'storage', 'TV unit', [1.6, 0.45], 0.5, 0.5),
  // CNT-42: furniture counted by its own kind.
  entry('desk', 'desk', 'Desk', [1.2, 0.6], 0.75, 0.75),
  entry('desk-1400', 'desk', 'Desk', [1.4, 0.7], 0.75, 0.75),
  entry('rug', 'rug', 'Rug', [2, 1.4], 0.01),
  entry('rug-large', 'rug', 'Rug', [3, 2], 0.01),
  entry('plant', 'plant', 'Plant', [0.5, 0.5], 1.2),
  // CNT-43: child-size fixtures and furniture, for a nursery or a school. A cot is a bed (its
  // back is its head) and a coat rail is storage, told apart by name and label.
  entry('wc-child', 'toilet', 'Child WC', [0.32, 0.5], 0.35, 0.5),
  entry('basin-low', 'basin', 'Low basin', [0.45, 0.35], 0.55, 0.5),
  entry('cot', 'bed', 'Cot', [0.66, 1.26], 0.95, 0.5),
  entry('nap-cot', 'bed', 'Nap cot', [0.6, 1.3], 0.15, 0.4),
  entry('changing-table', 'table', 'Changing table', [0.9, 0.7], 0.9, 0.7),
  entry('coat-rail', 'storage', 'Coat rail', [1.2, 0.4], 1.7, 0.6),
  entry('coat-rail-low', 'storage', 'Coat rail', [1.2, 0.3], 1.1, 0.6),
  // CNT-47: equipment, one plain size of each kind; any other thing is `equipment`, given its own size.
  entry('rack', 'rack', 'Rack', [0.6, 1.2], 2, 1),
  entry('generator', 'generator', 'Generator', [3, 1.2], 2, 1),
  entry('pump', 'pump', 'Pump', [0.6, 0.6], 0.8, 0.6),
  entry('tank', 'tank', 'Tank', [1.5, 1.5], 2),
  entry('seat', 'seat', 'Seat', [0.5, 0.6], 0.9),
  entry('pew', 'pew', 'Pew', [3, 0.6], 0.9),
  entry('altar', 'altar', 'Altar', [2, 1], 1, 1),
  entry('fume-cupboard', 'fume-cupboard', 'Fume cupboard', [1.5, 0.9], 2.4, 1),
  entry('lab-bench', 'lab-bench', 'Lab bench', [3, 0.75], 0.9, 1),
  entry('safety-shower', 'safety-shower', 'Safety shower', [1, 1], 2.3),
  entry('kennel', 'kennel', 'Kennel', [0.9, 0.9], 0.9),
  entry('exam-table', 'exam-table', 'Exam table', [1.2, 0.6], 0.9, 0.8),
  entry('clinical-sink', 'clinical-sink', 'Clinical sink', [0.9, 0.6], 0.9, 0.6),
  // CNT-55: the bathroom's and the kitchen's, one plain size of each kind. What hangs on a wall
  // carries its elevation, its underside above the floor, and its own height; a sink and a hob
  // are set into a worktop 0.9 m high.
  entry('wall-hung-wc', 'toilet', 'WC', [0.36, 0.54], 0.22, 0.6, 0.2),
  entry('bidet', 'bidet', 'Bidet', [0.36, 0.55], 0.4, 0.6),
  entry('urinal', 'urinal', 'Urinal', [0.4, 0.35], 0.6, 0.6, 0.35),
  entry('vanity', 'vanity', 'Vanity', [0.8, 0.5], 0.85, 0.6),
  entry('double-basin', 'double-basin', 'Double basin', [1.2, 0.5], 0.85, 0.6),
  entry('towel-radiator', 'towel-radiator', 'Towel radiator', [0.5, 0.1], 1.2, undefined, 0.15),
  entry('shower-screen', 'shower-screen', 'Shower screen', [0.9, 0.02], 2),
  entry('sink', 'sink', 'Sink', [1, 0.5], 0.2, undefined, 0.7),
  entry('hob', 'hob', 'Hob', [0.6, 0.5], 0.03, undefined, 0.88),
  entry('oven', 'oven', 'Oven', [0.6, 0.6], 0.9, 1),
  entry('fridge', 'fridge', 'Fridge', [0.6, 0.65], 0.85, 1),
  entry('fridge-freezer', 'fridge', 'Fridge-freezer', [0.6, 0.65], 1.8, 1),
  entry('tall-unit', 'tall-unit', 'Tall unit', [0.6, 0.6], 2.1, 1),
  entry('wall-unit', 'wall-unit', 'Wall unit', [0.6, 0.35], 0.72, undefined, 1.45),
  entry('range', 'range', 'Range', [0.9, 0.9], 0.9, 1.2),
  entry('fryer', 'fryer', 'Fryer', [0.4, 0.8], 0.9, 1.2),
  entry('prep-table', 'prep-table', 'Prep table', [1.8, 0.7], 0.9, 1),
  entry('dishwasher', 'dishwasher', 'Dishwasher', [0.7, 0.75], 1.5, 1),
  entry('hood', 'hood', 'Hood', [1.8, 1], 0.6, undefined, 2),
  // CNT-52: points, one of each kind: the size its symbol is drawn at and the height it is shown at.
  entry('extinguisher', 'extinguisher', 'Extinguisher', [0.4, 0.4], 1),
  entry('aed', 'aed', 'AED', [0.4, 0.4], 1.2),
  entry('call-point', 'call-point', 'Call point', [0.3, 0.3], 1.4),
  entry('first-aid', 'first-aid', 'First aid', [0.4, 0.4], 1.4),
  entry('sensor', 'sensor', 'Sensor', [0.3, 0.3], 2.4),
  entry('desk-point', 'desk-point', 'Desk', [0.4, 0.4], 0.75),
  entry('spawn', 'spawn', 'Spawn', [0.6, 0.6], 0.05),
  entry('camera', 'camera', 'Camera', [0.3, 0.3], 2.6),
  entry('you-are-here', 'you-are-here', 'You are here', [0.5, 0.5], 1.6),
  entry('hose-reel', 'hose-reel', 'Hose reel', [0.5, 0.5], 1.4),
  entry('fire-door', 'fire-door', 'Fire door', [0.4, 0.4], 2.1),
  entry('exit', 'exit', 'Exit', [0.4, 0.4], 2.2),
  entry('refuge', 'refuge', 'Refuge', [0.5, 0.5], 1.2),
  entry('assembly-point', 'assembly-point', 'Assembly point', [0.6, 0.6], 2),
]

/** One item of a typical room: a library item by name, where it stands in the room and its turn. */
export interface TypicalRoomItem {
  readonly library: string
  /** Its middle, from the room's inside back-left corner: x along the back wall, y into the room. */
  readonly at: readonly [number, number]
  /** Degrees counter-clockwise; unturned, its back is against the back wall. */
  readonly turn?: number | undefined
  readonly label?: string | undefined
}

/**
 * A typical room: library items set out in a room of `size` (its inside width along its back wall
 * and its depth from it), placed together in a plan by naming it. The room itself is not drawn:
 * the items go into the room the plan already has.
 */
export interface TypicalRoom {
  readonly name: string
  readonly label?: string | undefined
  readonly use?: RoomUse | undefined
  readonly size: readonly [number, number]
  readonly items: readonly TypicalRoomItem[]
  readonly source?: string | undefined
}

/**
 * The built-in typical rooms. Each item's clear floor is kept clear of every other item and of
 * the room's walls (a test holds them to it).
 */
export const BUILT_IN_ROOMS: readonly TypicalRoom[] = [
  {
    name: 'bathroom',
    label: 'Bathroom',
    use: 'bathroom',
    size: [2.4, 1.9],
    items: [
      { library: 'bath', at: [0.85, 0.35] },
      { library: 'wc', at: [2.05, 0.325] },
      { library: 'basin', at: [0.6, 1.675], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
  // CNT-48: a shower room and a kitchen, so a room's usual fixtures are one call
  // (`grid_add_item` with the typical room's name and a room).
  {
    name: 'shower-room',
    label: 'Shower room',
    use: 'bathroom',
    size: [2.1, 1.8],
    items: [
      { library: 'shower-900', at: [0.45, 0.45] },
      { library: 'wc', at: [1.25, 0.325] },
      { library: 'basin', at: [1.75, 1.575], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
  {
    name: 'cloakroom',
    label: 'Cloakroom',
    use: 'toilet',
    size: [1, 1.6],
    items: [
      { library: 'wc', at: [0.4, 0.325] },
      { library: 'basin-small', at: [0.825, 1.2], turn: 90 },
    ],
    source: BUILT_IN_SOURCE,
  },
  {
    name: 'kitchen',
    label: 'Kitchen',
    use: 'kitchen',
    size: [3, 2.4],
    items: [{ library: 'kitchen-run-3000', at: [1.5, 0.3] }],
    source: BUILT_IN_SOURCE,
  },
  {
    name: 'double-bedroom',
    label: 'Double bedroom',
    use: 'bedroom',
    size: [3.2, 3.4],
    items: [
      { library: 'double-bed', at: [1.6, 1] },
      { library: 'side-table', at: [0.625, 0.2] },
      { library: 'side-table', at: [2.575, 0.2] },
      { library: 'wardrobe', at: [2.5, 3.1], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
  {
    name: 'single-bedroom',
    label: 'Single bedroom',
    use: 'bedroom',
    size: [2.4, 3],
    items: [
      { library: 'single-bed', at: [0.5, 1] },
      { library: 'side-table', at: [1.225, 0.2] },
      { library: 'wardrobe', at: [1.8, 2.7], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
  // CNT-61: a living room and a dining room, so `grid_furnish_rooms` furnishes every room of a
  // house. The living room's sofa has its back to the back wall, the coffee table in front of it,
  // an armchair against the left wall and the TV unit facing the sofa across the room; the dining
  // room is a table for six with floor round it to pull the chairs out.
  {
    name: 'living-room',
    label: 'Living room',
    use: 'living',
    size: [3.6, 3.4],
    items: [
      { library: 'sofa-3', at: [1.8, 0.45] },
      { library: 'coffee-table', at: [1.8, 1.45] },
      { library: 'armchair', at: [0.425, 1.6], turn: 270 },
      { library: 'tv-unit', at: [1.8, 3.175], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
  {
    name: 'dining-room',
    label: 'Dining room',
    use: 'dining',
    size: [3, 3.1],
    items: [
      { library: 'chair', at: [0.9, 0.85] },
      { library: 'chair', at: [1.5, 0.85] },
      { library: 'chair', at: [2.1, 0.85] },
      { library: 'dining-table-6', at: [1.5, 1.55] },
      { library: 'chair', at: [0.9, 2.25], turn: 180 },
      { library: 'chair', at: [1.5, 2.25], turn: 180 },
      { library: 'chair', at: [2.1, 2.25], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
  // CNT-44: sets of a table and its chairs, which `grid_fill_room` repeats through a café or a
  // meeting room. The chairs face the table from its long sides, set out clear of it; the set's
  // size is the table and its chairs, with no floor round them (the fill's aisle is that).
  {
    name: 'table-4-chairs',
    label: '4-seat table',
    size: [1.2, 1.8],
    items: [
      { library: 'chair', at: [0.3, 0.25] },
      { library: 'chair', at: [0.9, 0.25] },
      { library: 'dining-table-4', at: [0.6, 0.9] },
      { library: 'chair', at: [0.3, 1.55], turn: 180 },
      { library: 'chair', at: [0.9, 1.55], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
  {
    name: 'table-6-chairs',
    label: '6-seat table',
    size: [1.8, 1.9],
    items: [
      { library: 'chair', at: [0.3, 0.25] },
      { library: 'chair', at: [0.9, 0.25] },
      { library: 'chair', at: [1.5, 0.25] },
      { library: 'dining-table-6', at: [0.9, 0.95] },
      { library: 'chair', at: [0.3, 1.65], turn: 180 },
      { library: 'chair', at: [0.9, 1.65], turn: 180 },
      { library: 'chair', at: [1.5, 1.65], turn: 180 },
    ],
    source: BUILT_IN_SOURCE,
  },
]

const ITEMS_BY_NAME = new Map(BUILT_IN_ITEMS.map((item) => [item.name, item]))
const ROOMS_BY_NAME = new Map(BUILT_IN_ROOMS.map((room) => [room.name, room]))

/** A built-in item by name, or undefined. */
export function builtInItem(name: string): LibraryItem | undefined {
  return ITEMS_BY_NAME.get(name)
}

/** A built-in typical room by name, or undefined. */
export function builtInRoom(name: string): TypicalRoom | undefined {
  return ROOMS_BY_NAME.get(name)
}
