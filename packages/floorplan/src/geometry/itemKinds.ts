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
 * how big a thing should be.
 *
 * Pure: plain data and functions of an item.
 */

import { FIXTURE_KINDS, ITEM_KINDS, type Item, type ItemKind } from '../types/floorplan'
import type { Said, Value } from '../messages/say'
import { said } from '../messages/say'
import type { FloorPlan, Room } from './plan'
import type { Vec2 } from './vec2'
import type { Severity } from './validate'

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
  /** What a person calls it in a sentence, in English, and its label when the item states none. */
  readonly word: string
  /** What an agent is told of it: what it is and how its size is read. A key's sentence for Grid's own. */
  readonly about: Value
  /** Its plain symbol, inside its footprint. */
  symbol(pen: SymbolPen): ItemSymbol
  /** Its own checks, run after Grid's checks on every item, on an item Grid can draw. */
  check?(item: Item, context: ItemCheckContext): readonly ItemFinding[]
}

// ── Grid's own kinds ─────────────────────────────────────────────────────────────────────────

const outline = (p: SymbolPen): Vec2[] => p.box(-0.5, -0.5, 0.5, 0.5)
const short = (p: SymbolPen): number => Math.min(p.width, p.depth)

const about = (kind: ItemKind): Said => said(`kind.about.${kind}`)

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
 * - storage: its outline and a line across its front, where it opens.
 */
export const ITEM_KIND_DEFINITIONS: readonly ItemKindDefinition[] = [
  {
    kind: 'toilet',
    group: 'fixture',
    word: 'toilet',
    about: about('toilet'),
    symbol: (p) => ({ rings: [p.box(-0.5, -0.5, 0.5, -0.2), p.ellipse(0, 0.12, 0.38, 0.38)], lines: [] }),
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
  },
  {
    kind: 'chair',
    group: 'furniture',
    word: 'chair',
    about: about('chair'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.5, -0.5, 0.5, -0.3)], lines: [] }),
  },
  {
    kind: 'sofa',
    group: 'furniture',
    word: 'sofa',
    about: about('sofa'),
    symbol: (p) => {
      const arm = Math.min(0.2, (short(p) * 0.2) / p.width)
      return { rings: [outline(p), p.box(-0.5, -0.5, 0.5, -0.25), p.box(-0.5, -0.25, -0.5 + arm, 0.5), p.box(0.5 - arm, -0.25, 0.5, 0.5)], lines: [] }
    },
  },
  {
    kind: 'storage',
    group: 'furniture',
    word: 'storage unit',
    about: about('storage'),
    symbol: (p) => ({ rings: [outline(p)], lines: [[p.point(-0.5, 0.4), p.point(0.5, 0.4)]] }),
  },
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
