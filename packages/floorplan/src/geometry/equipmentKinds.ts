/**
 * CNT-47: the equipment kinds of the kinds registry (`itemKinds.ts`): the things a data hall, a
 * cinema, a church, a plant room, a lab or a clinic holds, and `equipment` for any other. Each is a
 * fixture, so it takes the floor it stands on, and is drawn, raised in 3D, exported, counted and
 * checked as every item is. The kinds that stand side by side in rows (racks, seats, pews,
 * kennels, benches) keep no clear floor at their sides of their own.
 *
 * As for Grid's other kinds, every symbol and solid is drawn inside the footprint the plan states,
 * in shares of it, and says nothing about how big a thing should be.
 *
 * Pure: plain data and functions of an item.
 */

import type { ItemBlock, ItemKindDefinition, ItemSymbol, SymbolPen } from './itemKinds'
import type { ItemKind } from '../types/floorplan'
import { said } from '../messages/say'
import type { Vec2 } from './vec2'

const outline = (p: SymbolPen): Vec2[] => p.box(-0.5, -0.5, 0.5, 0.5)
const short = (p: SymbolPen): number => Math.min(p.width, p.depth)
const block = (shape: readonly Vec2[], bottom: number, top: number): ItemBlock => ({ outline: shape, bottom, top })
const about = (kind: ItemKind): ReturnType<typeof said> => said(`kind.about.${kind}`)

/** A seat or a pew: its back along its back, the seat in front of it at half its height. */
const seat = (p: SymbolPen, h: number): ItemBlock[] => [block(p.box(-0.5, -0.5, 0.5, -0.3), 0, h), block(p.box(-0.5, -0.3, 0.5, 0.5), 0, h * 0.5)]

/** A top a tenth of its height deep on a plinth a third as wide and deep, as an exam table and an altar stand. */
const onPlinth = (p: SymbolPen, h: number): ItemBlock[] => [block(outline(p), h * 0.9, h), block(p.box(-0.33, -0.33, 0.33, 0.33), 0, h * 0.9)]

/** A bowl, a rounded box inside the outline, and the tap at its back, as a basin is drawn. */
const sink = (p: SymbolPen): ItemSymbol => ({ rings: [outline(p), p.roundedBox(-0.4, -0.25, 0.4, 0.4, short(p) / 8), p.circle(0, -0.38, short(p) / 16)], lines: [] })

/**
 * The equipment kinds, in `EQUIPMENT_KINDS` order:
 *
 * - rack: its outline with its front and back doors;
 * - generator: its outline, the engine and the alternator, a circle at its right;
 * - pump: its casing, a circle, and the pipe through it;
 * - tank: its shell, a circle, and a ring inside it;
 * - seat: its seat with its back along its back;
 * - pew: a bench with its back along its back;
 * - altar: its outline and its top's border;
 * - fume cupboard: its outline, its working space and its sash across the front;
 * - lab bench: its outline and its service spine along its back;
 * - safety shower: its standing floor, with both diagonals, and the head;
 * - kennel: its outline and the bars of its front;
 * - exam table: its outline and the head rest at its back;
 * - clinical sink: as a basin, wider;
 * - equipment: its outline and one diagonal, a box of the size and height it is given.
 *
 * In 3D, a seat and a pew are a back and a lower seat, an altar and an exam table a top on a
 * plinth, a safety shower its pull pole and its head, a pump and a tank a drum; every other kind
 * its footprint to its height.
 */
export const EQUIPMENT_KIND_DEFINITIONS: readonly ItemKindDefinition[] = [
  {
    kind: 'rack',
    group: 'fixture',
    sides: false,
    word: 'rack',
    about: about('rack'),
    symbol: (p) => ({
      rings: [outline(p)],
      lines: [
        [p.point(-0.5, 0.4), p.point(0.5, 0.4)],
        [p.point(-0.5, -0.4), p.point(0.5, -0.4)],
      ],
    }),
  },
  {
    kind: 'generator',
    group: 'fixture',
    word: 'generator',
    about: about('generator'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.42, -0.35, 0.12, 0.35), p.circle(0.3, 0, short(p) / 5)], lines: [] }),
  },
  {
    kind: 'pump',
    group: 'fixture',
    word: 'pump',
    about: about('pump'),
    symbol: (p) => ({ rings: [p.ellipse(0, 0, 0.5, 0.5)], lines: [[p.point(-0.5, 0), p.point(0.5, 0)]] }),
    solid: (p, h) => [block(p.ellipse(0, 0, 0.5, 0.5), 0, h)],
  },
  {
    kind: 'tank',
    group: 'fixture',
    word: 'tank',
    about: about('tank'),
    symbol: (p) => ({ rings: [p.ellipse(0, 0, 0.5, 0.5), p.ellipse(0, 0, 0.42, 0.42)], lines: [] }),
    solid: (p, h) => [block(p.ellipse(0, 0, 0.5, 0.5), 0, h)],
  },
  {
    kind: 'seat',
    group: 'fixture',
    sides: false,
    word: 'seat',
    about: about('seat'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.5, -0.5, 0.5, -0.3)], lines: [] }),
    solid: seat,
  },
  {
    kind: 'pew',
    group: 'fixture',
    sides: false,
    word: 'pew',
    about: about('pew'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.5, -0.5, 0.5, -0.3)], lines: [] }),
    solid: seat,
  },
  {
    kind: 'altar',
    group: 'fixture',
    word: 'altar',
    about: about('altar'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.45, -0.4, 0.45, 0.4)], lines: [] }),
    solid: onPlinth,
  },
  {
    kind: 'fume-cupboard',
    group: 'fixture',
    sides: false,
    word: 'fume cupboard',
    about: about('fume-cupboard'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.42, -0.4, 0.42, 0.3)], lines: [[p.point(-0.5, 0.38), p.point(0.5, 0.38)]] }),
  },
  {
    kind: 'lab-bench',
    group: 'fixture',
    sides: false,
    word: 'lab bench',
    about: about('lab-bench'),
    symbol: (p) => ({ rings: [outline(p)], lines: [[p.point(-0.5, -0.3), p.point(0.5, -0.3)]] }),
  },
  {
    kind: 'safety-shower',
    group: 'fixture',
    sides: false,
    word: 'safety shower',
    about: about('safety-shower'),
    symbol: (p) => ({
      rings: [outline(p), p.circle(0, 0, short(p) / 5)],
      lines: [
        [p.point(-0.5, -0.5), p.point(0.5, 0.5)],
        [p.point(0.5, -0.5), p.point(-0.5, 0.5)],
      ],
    }),
    // Its height is its head's; what stands solid is the pull pole at its back and the head over the middle.
    solid: (p, h) => [block(p.box(-1 / 20, -0.5, 1 / 20, -0.4), 0, h), block(p.ellipse(0, 0, 0.2, 0.2), h * 0.95, h)],
  },
  {
    kind: 'kennel',
    group: 'fixture',
    sides: false,
    word: 'kennel',
    about: about('kennel'),
    symbol: (p) => ({ rings: [outline(p)], lines: [-0.25, 0, 0.25].map((u) => [p.point(u, 0.3), p.point(u, 0.5)]) }),
  },
  {
    kind: 'exam-table',
    group: 'fixture',
    word: 'exam table',
    about: about('exam-table'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.45, -0.45, 0.45, -0.3)], lines: [] }),
    solid: onPlinth,
  },
  {
    kind: 'clinical-sink',
    group: 'fixture',
    word: 'clinical sink',
    about: about('clinical-sink'),
    symbol: sink,
  },
  {
    kind: 'equipment',
    group: 'fixture',
    word: 'equipment',
    about: about('equipment'),
    symbol: (p) => ({ rings: [outline(p)], lines: [[p.point(-0.5, -0.5), p.point(0.5, 0.5)]] }),
  },
]
