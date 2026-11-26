/**
 * CNT-20: the one registry of the kinds of thing a plan's items may be. Each kind is one entry
 * that brings together everything Grid does with it: its group (a fixture, which takes free floor,
 * or furniture, which can be moved), its word, what an agent is told of it, its plain symbol and
 * any checks of its own. The drawing, the DXF and IFC exports, the measures and the drawing's
 * check read a kind only through here, so a new kind is added by one entry and reaches all of
 * them; the IFC writes every kind as an IfcFurnishingElement with its kind as its type.
 *
 * Grid's own kinds are `ITEM_KIND_DEFINITIONS`, in `ITEM_KINDS` order. Another program adds one
 * with `registerItemKind`; a plan names it by its `kind`, as it names Grid's.
 *
 * Every symbol is drawn inside the footprint the plan states, in shares of it, so whatever the
 * size the drawing is to scale. The shares are Grid's own way of drawing and say nothing about
 * how big a thing should be. CNT-42: so is each kind's solid, the plain blocks it is raised as in
 * 3D (the view, the stills, the GLB and the OBJ), inside its footprint and up to its height.
 *
 * Pure: plain data and functions of an item.
 */

import { FIXTURE_KINDS, ITEM_KINDS, type Item, type ItemKind } from '../types/floorplan'
import type { Said, Value } from '../messages/say'
import { said } from '../messages/say'
import type { FloorPlan, Room } from './plan'
import type { Vec2 } from './vec2'
import type { Severity } from './validate'
import { EQUIPMENT_KIND_DEFINITIONS } from './equipmentKinds'

/** A fixture takes the floor it stands on from its room's free floor; furniture can be moved and takes none. */
export type ItemGroup = 'fixture' | 'furniture'

/** How a kind is drawn: closed rings filled with the paper, in order, and open lines over them. */
export interface ItemSymbol {
  readonly rings: readonly (readonly Vec2[])[]
  readonly lines: readonly (readonly Vec2[])[]
}

/**
 * What a symbol is drawn with: points and shapes in shares of the item's footprint, `u` from
 * -0.5 (its left, seen from its front) to 0.5, `v` from -0.5 (its back) to 0.5 (its front), and
 * its own width and depth in metres for a shape of a fixed size.
 */
export interface SymbolPen {
  readonly width: number
  readonly depth: number
  point(u: number, v: number): Vec2
  /** A box between two corners. */
  box(u0: number, v0: number, u1: number, v1: number): Vec2[]
  /** An ellipse round a middle, its radii in shares. */
  ellipse(u: number, v: number, ru: number, rv: number, steps?: number): Vec2[]
  /** A circle of radius `r` metres round a middle. */
  circle(u: number, v: number, r: number, steps?: number): Vec2[]
  /** A box with corners rounded to `r` metres. */
  roundedBox(u0: number, v0: number, u1: number, v1: number, r: number, steps?: number): Vec2[]
}

/**
 * CNT-42: one block a kind is raised as in 3D: its outline on the plan, counter-clockwise, solid
 * from `bottom` to `top`, in metres above the floor the item stands on.
 */
export interface ItemBlock {
  readonly outline: readonly Vec2[]
  readonly bottom: number
  readonly top: number
}

/** What a kind's own check is given: the plan, and the room the item stands in (null for none). */
export interface ItemCheckContext {
  readonly plan: FloorPlan
  readonly room: Room | null
}

/**
 * A kind's own finding about one item. `said` is the sentence by its key, for a kind of Grid's;
 * a kind added from outside gives its own words in `message` and is said in them, as written.
 */
export interface ItemFinding {
  readonly code: string
  readonly severity: Severity
  readonly message: string
  readonly said?: Said
}

export interface ItemKindDefinition {
  /** The kind as a plan writes it: `bed`. */
  readonly kind: string
  readonly group: ItemGroup
  /** CNT-37: whether the kind keeps clear floor at its sides (default true). A kitchen run or a shower is set against its neighbours and needs none. */
  readonly sides?: boolean
  /**
   * CNT-42: whether it lies flat on the floor, as a rug does (default false): other items stand on
   * it, and it stands in no item's clear floor, no fixture's space and no doorway.
   */
  readonly underfoot?: boolean
  /** What a person calls it in a sentence, in English, and its label when the item states none. */
  readonly word: string
  /** What an agent is told of it: what it is and how its size is read. A key's sentence for Grid's own. */
  readonly about: Value
  /** Its plain symbol, inside its footprint. */
  symbol(pen: SymbolPen): ItemSymbol
  /**
   * CNT-42: the blocks it is raised as in 3D, from its pen and its height in metres. Unstated, its
   * footprint, solid from the floor to its height.
   */
  solid?(pen: SymbolPen, height: number): readonly ItemBlock[]
  /** Its own checks, run after Grid's checks on every item, on an item Grid can draw. */
  check?(item: Item, context: ItemCheckContext): readonly ItemFinding[]
}

// ── Grid's own kinds ─────────────────────────────────────────────────────────────────────────

const outline = (p: SymbolPen): Vec2[] => p.box(-0.5, -0.5, 0.5, 0.5)
const short = (p: SymbolPen): number => Math.min(p.width, p.depth)

const about = (kind: ItemKind): Said => said(`kind.about.${kind}`)

/** CNT-42: a block of a solid, `bottom` to `top` metres above the floor. */
const block = (outline: readonly Vec2[], bottom: number, top: number): ItemBlock => ({ outline, bottom, top })

/** CNT-42: the share of its width each arm of a sofa or an armchair takes, as its symbol draws it. */
const armShare = (p: SymbolPen): number => Math.min(0.2, (short(p) * 0.2) / p.width)

/** CNT-42: a top on four legs, as a table and a desk are raised: the top a sixteenth of its height, each leg a twelfth of its shorter side square. */
function onLegs(p: SymbolPen, height: number): ItemBlock[] {
  const top = height / 16
  const leg = short(p) / 12
  const lu = leg / p.width
  const lv = leg / p.depth
  const legs = [
    [-0.5, -0.5],
    [0.5 - lu, -0.5],
    [0.5 - lu, 0.5 - lv],
    [-0.5, 0.5 - lv],
  ].map(([u, v]) => block(p.box(u!, v!, u! + lu, v! + lv), 0, height - top))
  return [block(outline(p), height - top, height), ...legs]
}

/** CNT-42: a seat with its back along its back and, for a sofa or an armchair, an arm at each end. */
function seated(p: SymbolPen, height: number, arms: boolean): ItemBlock[] {
  const back = -0.25
  const arm = arms ? armShare(p) : 0
  const seat = height * 0.5
  return [
    block(p.box(-0.5, -0.5, 0.5, back), 0, height),
    block(p.box(-0.5 + arm, back, 0.5 - arm, 0.5), 0, seat),
    ...(arms ? [block(p.box(-0.5, back, -0.5 + arm, 0.5), 0, height * 0.75), block(p.box(0.5 - arm, back, 0.5, 0.5), 0, height * 0.75)] : []),
  ]
}

/** CNT-42: the symbol of a sofa and an armchair: its outline, its back along its back and an arm at each end. */
const seatWithArms = (p: SymbolPen): ItemSymbol => {
  const arm = armShare(p)
  return { rings: [outline(p), p.box(-0.5, -0.5, 0.5, -0.25), p.box(-0.5, -0.25, -0.5 + arm, 0.5), p.box(0.5 - arm, -0.25, 0.5, 0.5)], lines: [] }
}

/**
 * Grid's own kinds, in `ITEM_KINDS` order:
 *
 * - toilet: the cistern against its back and the pan, an oval, in front of it;
 * - basin: its outline with the bowl, an oval, and the tap at its back;
 * - shower: the tray with both diagonals, falling to the waste in its middle;
 * - bath: its outline with the tub inside, rounded, and the waste at its left end;
 * - kitchen run: the worktop's outline;
 * - bed: its outline, the pillows at its head (its back) and the turned-down cover;
 * - table: its outline;
 * - chair: its seat, with its back along its back;
 * - sofa: its outline, its back along its back and an arm at each end;
 * - storage: its outline and a line across its front, where it opens;
 * - armchair (CNT-42): as a sofa, one seat wide;
 * - stool: its round seat;
 * - desk: its outline and a screen at its back;
 * - rug: its outline and its border;
 * - plant: its leaves' spread, its pot and four leaves.
 *
 * In 3D (CNT-42), a toilet is its cistern and a lower pan, a shower its tray, a table and a desk
 * a top on four legs, a chair a seat and a back, a sofa and an armchair a seat, a back and two
 * lower arms, a stool a drum, a plant its pot and its leaves above it; every other kind its
 * footprint to its height.
 */
export const ITEM_KIND_DEFINITIONS: readonly ItemKindDefinition[] = [
  {
    kind: 'toilet',
    group: 'fixture',
    word: 'toilet',
    about: about('toilet'),
    symbol: (p) => ({ rings: [p.box(-0.5, -0.5, 0.5, -0.2), p.ellipse(0, 0.12, 0.38, 0.38)], lines: [] }),
    solid: (p, h) => [block(p.box(-0.5, -0.5, 0.5, -0.2), 0, h), block(p.ellipse(0, 0.12, 0.38, 0.38), 0, h * 0.5)],
  },
  {
    kind: 'basin',
    group: 'fixture',
    word: 'basin',
    about: about('basin'),
    symbol: (p) => ({ rings: [outline(p), p.ellipse(0, 0.1, 0.38, 0.34), p.circle(0, -0.36, short(p) / 16)], lines: [] }),
  },
  {
    kind: 'shower',
    group: 'fixture',
    sides: false,
    word: 'shower',
    about: about('shower'),
    symbol: (p) => ({
      rings: [outline(p), p.circle(0, 0, short(p) / 16)],
      lines: [
        [p.point(-0.5, -0.5), p.point(0.5, 0.5)],
        [p.point(0.5, -0.5), p.point(-0.5, 0.5)],
      ],
    }),
    // Its height is its screen's; its tray, a fortieth of it, is what stands solid on the floor.
    solid: (p, h) => [block(outline(p), 0, h / 40)],
  },
  {
    kind: 'bath',
    group: 'fixture',
    word: 'bath',
    about: about('bath'),
    symbol: (p) => {
      const s = short(p)
      const iu = 0.5 - (s * 0.1) / p.width
      const iv = 0.5 - (s * 0.1) / p.depth
      return { rings: [outline(p), p.roundedBox(-iu, -iv, iu, iv, s * 0.25), p.circle(-iu + (s * 0.15) / p.width, 0, s / 16)], lines: [] }
    },
  },
  {
    kind: 'kitchen-run',
    group: 'fixture',
    sides: false,
    word: 'kitchen run',
    about: about('kitchen-run'),
    symbol: (p) => ({ rings: [outline(p)], lines: [] }),
  },
  {
    kind: 'bed',
    group: 'furniture',
    word: 'bed',
    about: about('bed'),
    symbol: (p) => {
      // One pillow on a bed narrower than a metre, two on a wider one.
      const gap = 1 / 32
      const pillows = p.width < 1 ? [[-0.4, 0.4]] : [[-0.45, -gap], [gap, 0.45]]
      return {
        rings: [outline(p), ...pillows.map(([u0, u1]) => p.roundedBox(u0!, -0.46, u1!, -0.3, short(p) / 25))],
        lines: [[p.point(-0.5, -0.12), p.point(0.5, -0.12)]],
      }
    },
  },
  {
    kind: 'table',
    group: 'furniture',
    word: 'table',
    about: about('table'),
    symbol: (p) => ({ rings: [outline(p)], lines: [] }),
    solid: onLegs,
  },
  {
    kind: 'chair',
    group: 'furniture',
    word: 'chair',
    about: about('chair'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.5, -0.5, 0.5, -0.3)], lines: [] }),
    solid: (p, h) => seated(p, h, false),
  },
  {
    kind: 'sofa',
    group: 'furniture',
    word: 'sofa',
    about: about('sofa'),
    symbol: seatWithArms,
    solid: (p, h) => seated(p, h, true),
  },
  {
    kind: 'storage',
    group: 'furniture',
    word: 'storage unit',
    about: about('storage'),
    symbol: (p) => ({ rings: [outline(p)], lines: [[p.point(-0.5, 0.4), p.point(0.5, 0.4)]] }),
  },
  {
    kind: 'armchair',
    group: 'furniture',
    word: 'armchair',
    about: about('armchair'),
    symbol: seatWithArms,
    solid: (p, h) => seated(p, h, true),
  },
  {
    kind: 'stool',
    group: 'furniture',
    word: 'stool',
    about: about('stool'),
    symbol: (p) => ({ rings: [p.ellipse(0, 0, 0.5, 0.5)], lines: [] }),
    solid: (p, h) => [block(p.ellipse(0, 0, 0.5, 0.5), 0, h)],
  },
  {
    kind: 'desk',
    group: 'furniture',
    word: 'desk',
    about: about('desk'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.2, -0.45, 0.2, -0.38)], lines: [] }),
    solid: onLegs,
  },
  {
    kind: 'rug',
    group: 'furniture',
    underfoot: true,
    sides: false,
    word: 'rug',
    about: about('rug'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.45, -0.45, 0.45, 0.45)], lines: [] }),
  },
  {
    kind: 'plant',
    group: 'furniture',
    word: 'plant',
    about: about('plant'),
    symbol: (p) => ({
      rings: [p.ellipse(0, 0, 0.5, 0.5), p.ellipse(0, 0, 0.2, 0.2)],
      lines: [
        [p.point(-0.2, -0.2), p.point(-0.33, -0.33)],
        [p.point(0.2, -0.2), p.point(0.33, -0.33)],
        [p.point(0.2, 0.2), p.point(0.33, 0.33)],
        [p.point(-0.2, 0.2), p.point(-0.33, 0.33)],
      ],
    }),
    solid: (p, h) => [block(p.ellipse(0, 0, 0.2, 0.2), 0, h * 0.35), block(p.ellipse(0, 0, 0.5, 0.5), h * 0.35, h)],
  },
  // CNT-47: the equipment, after the furniture (`equipmentKinds.ts`).
  ...EQUIPMENT_KIND_DEFINITIONS,
]

// ── The registry ─────────────────────────────────────────────────────────────────────────────

const registry = new Map<string, ItemKindDefinition>(ITEM_KIND_DEFINITIONS.map((definition) => [definition.kind, definition]))

/** Why a kind could not be registered. */
export class ItemKindRefused extends Error {
  override readonly name = 'ItemKindRefused'
}

/**
 * Adds a kind of thing, with everything Grid does with it. Refused for a kind already held or one
 * that is not a plain id. Returns the call that takes it out again.
 */
export function registerItemKind(definition: ItemKindDefinition): () => void {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(definition.kind)) throw new ItemKindRefused(`A kind is lower-case letters, digits and dashes, starting with a letter: ${JSON.stringify(definition.kind)} is not one.`)
  if (registry.has(definition.kind)) throw new ItemKindRefused(`Kind ${JSON.stringify(definition.kind)} is held already.`)
  registry.set(definition.kind, definition)
  return () => {
    if (registry.get(definition.kind) === definition && !(ITEM_KINDS as readonly string[]).includes(definition.kind)) registry.delete(definition.kind)
  }
}

/** A kind's entry, or undefined for a kind Grid does not hold. */
export function itemKindDefinition(kind: string): ItemKindDefinition | undefined {
  return registry.get(kind)
}

/** Whether Grid holds the kind: one of its own, or one registered. */
export function isItemKind(kind: string): boolean {
  return registry.has(kind)
}

/** Whether the kind is one of Grid's own, which have their words in the message files. */
export function isOwnItemKind(kind: string): kind is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(kind)
}

/** The kinds held, Grid's own first and then those registered, in the order they were; of one group when given. */
export function itemKinds(group?: ItemGroup): string[] {
  return [...registry.values()].filter((definition) => group === undefined || definition.group === group).map((definition) => definition.kind)
}

/** CNT-42: whether an item of this kind lies flat on the floor (a rug): things stand on it and it is in no one's way. */
export function liesUnderfoot(kind: string): boolean {
  return registry.get(kind)?.underfoot === true
}

/** Whether an item of this kind takes the floor it stands on from its room's free floor: fixtures do. */
export function takesFloor(kind: string): boolean {
  return registry.get(kind)?.group === 'fixture'
}

/** What a person calls the kind in a sentence, in English; the kind as written for one Grid does not hold. */
export function itemKindWord(kind: string): string {
  return registry.get(kind)?.word ?? kind
}

/** Grid's own fixture kinds, which the firm's standards and the use checks name. */
export { FIXTURE_KINDS }
