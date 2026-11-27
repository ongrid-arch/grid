/**
 * CNT-52: the point kinds of the kinds registry (`itemKinds.ts`): the things that stand at a point
 * of the plan, an extinguisher, a defibrillator, a camera, a game's spawn point, and the fire and
 * wayfinding set of an evacuation map. Each is of the group `point`: it takes no floor, and the
 * checks on where a fixture stands (in a room, clear of the walls, of the other items and of their
 * clear floor) do not apply to it, so a call point on a wall or an assembly point outside is said
 * nothing of. It is drawn, keyed, exported, counted and listed as every item is.
 *
 * Its footprint is the size its symbol is drawn at, and its height the height it is shown at. As
 * for Grid's other kinds, every symbol is drawn inside that footprint, in shares of it, and says
 * nothing about how big a thing should be; each is told apart by its shape alone, so a drawing in
 * black on white keys them.
 *
 * Pure: plain data and functions of an item.
 */

import type { ItemBlock, ItemKindDefinition, ItemSymbol, SymbolPen } from './itemKinds'
import type { ItemKind } from '../types/floorplan'
import { said } from '../messages/say'
import type { Vec2 } from './vec2'

const outline = (p: SymbolPen): Vec2[] => p.box(-0.5, -0.5, 0.5, 0.5)
const disc = (p: SymbolPen): Vec2[] => p.ellipse(0, 0, 0.5, 0.5)
const about = (kind: ItemKind): ReturnType<typeof said> => said(`kind.about.${kind}`)
const line = (p: SymbolPen, ...uv: readonly (readonly [number, number])[]): Vec2[] => uv.map(([u, v]) => p.point(u, v))

/**
 * A point is raised in 3D as a block of its footprint as deep as its shorter side, its top at its
 * height: a marker where it is mounted. One standing at the floor (a spawn point) is as high as it is.
 */
const marker = (p: SymbolPen, h: number): ItemBlock[] => [{ outline: outline(p), bottom: Math.max(0, h - Math.min(p.width, p.depth)), top: h }]

/** A point kind: its group and its solid are every point's. */
const point = (kind: ItemKind, word: string, symbol: (p: SymbolPen) => ItemSymbol): ItemKindDefinition => ({ kind, group: 'point', sides: false, word, about: about(kind), symbol, solid: marker })

/**
 * The point kinds, in `POINT_KINDS` order:
 *
 * - extinguisher: its body, a disc, with the nozzle at its back;
 * - aed: its case with a flash across it;
 * - call point: its case with the glass inside it and the dot to press;
 * - first aid: its case with a cross inside it;
 * - sensor: a disc and a smaller disc in it;
 * - desk point: its outline and a disc in it;
 * - spawn: a disc with cross hairs;
 * - camera: its body and its lens, a wedge to its front;
 * - you are here: a disc, a ring and the dot in its middle;
 * - hose reel: its drum, two discs, and the hose leaving it to its front;
 * - fire door: its outline with the leaf and its swing;
 * - exit: its outline with an arrow out of its front;
 * - refuge: its outline with a person, a head and a body;
 * - assembly point: a diamond and a smaller one inside it.
 */
export const POINT_KIND_DEFINITIONS: readonly ItemKindDefinition[] = [
  point('extinguisher', 'fire extinguisher', (p) => ({ rings: [p.ellipse(0, 0.1, 0.32, 0.4), p.box(-0.1, -0.5, 0.1, -0.3)], lines: [] })),
  point('aed', 'defibrillator', (p) => ({ rings: [outline(p)], lines: [line(p, [0.1, -0.4], [-0.15, 0.1], [0.15, -0.1], [-0.1, 0.4])] })),
  point('call-point', 'fire alarm call point', (p) => ({ rings: [outline(p), p.box(-0.3, -0.3, 0.3, 0.3), p.ellipse(0, 0, 0.1, 0.1)], lines: [] })),
  point('first-aid', 'first aid point', (p) => ({
    rings: [outline(p)],
    lines: [line(p, [-0.1, -0.35], [0.1, -0.35], [0.1, -0.1], [0.35, -0.1], [0.35, 0.1], [0.1, 0.1], [0.1, 0.35], [-0.1, 0.35], [-0.1, 0.1], [-0.35, 0.1], [-0.35, -0.1], [-0.1, -0.1], [-0.1, -0.35])],
  })),
  point('sensor', 'sensor', (p) => ({ rings: [disc(p), p.ellipse(0, 0, 0.2, 0.2)], lines: [] })),
  point('desk-point', 'desk point', (p) => ({ rings: [outline(p), p.ellipse(0, 0, 0.25, 0.25)], lines: [] })),
  point('spawn', 'spawn point', (p) => ({ rings: [disc(p)], lines: [line(p, [-0.5, 0], [0.5, 0]), line(p, [0, -0.5], [0, 0.5])] })),
  point('camera', 'camera', (p) => ({ rings: [p.box(-0.35, -0.5, 0.35, 0.1)], lines: [line(p, [-0.15, 0.1], [-0.45, 0.5], [0.45, 0.5], [0.15, 0.1])] })),
  point('you-are-here', 'you are here', (p) => ({ rings: [disc(p), p.ellipse(0, 0, 0.32, 0.32), p.ellipse(0, 0, 0.1, 0.1)], lines: [] })),
  point('hose-reel', 'hose reel', (p) => ({ rings: [p.ellipse(0, -0.1, 0.4, 0.4), p.ellipse(0, -0.1, 0.15, 0.15)], lines: [line(p, [0.15, -0.1], [0.4, 0.5])] })),
  point('fire-door', 'fire door', (p) => ({
    rings: [outline(p)],
    lines: [line(p, [-0.4, 0.4], [-0.4, -0.4]), line(p, [-0.4, -0.4], [-0.1, -0.36], [0.19, -0.23], [0.39, 0], [0.4, 0.4])],
  })),
  point('exit', 'exit', (p) => ({ rings: [outline(p)], lines: [line(p, [0, -0.35], [0, 0.35]), line(p, [-0.2, 0.15], [0, 0.35], [0.2, 0.15])] })),
  point('refuge', 'refuge', (p) => ({ rings: [outline(p), p.ellipse(0, -0.22, 0.1, 0.1)], lines: [line(p, [0, -0.1], [0, 0.18]), line(p, [-0.2, 0.38], [0, 0.18], [0.2, 0.38]), line(p, [-0.2, 0], [0.2, 0])] })),
  point('assembly-point', 'assembly point', (p) => ({ rings: [line(p, [0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]), line(p, [0, -0.25], [0.25, 0], [0, 0.25], [-0.25, 0])], lines: [] })),
]
