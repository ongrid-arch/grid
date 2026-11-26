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

const entry = (name: string, kind: string, label: string, size: readonly [number, number], height: number, clearance?: number): LibraryItem => ({
  name,
  kind,
  label,
  size: [size[0], size[1]],
  height,
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
