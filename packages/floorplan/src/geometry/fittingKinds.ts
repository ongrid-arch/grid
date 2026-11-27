/**
 * CNT-55: the bathroom's and the kitchen's kinds of the kinds registry (`itemKinds.ts`), besides
 * Grid's first fixtures (a toilet, a basin, a shower, a bath and a kitchen run): the sanitary
 * kinds, the kitchen's and a commercial kitchen's pieces. Each is a fixture, so it takes the floor
 * it stands on, and is drawn, raised in 3D, exported, counted and checked as every item is.
 *
 * A sink and a hob are set into a worktop and a shower screen stands on its tray's edge
 * (`inset`), so neither stands in the item it is set in. A commercial kitchen's pieces are drawn
 * with their label inside them (`labelled`): at 1:100 a fryer's symbol alone is not told from a
 * range's. What hangs on a wall (a wall unit, a hood, a towel radiator) is given its height above
 * the floor by the item's `elevation`, which its library entry fills.
 *
 * As for Grid's other kinds, every symbol and solid is drawn inside the footprint the plan states,
 * in shares of it, and says nothing about how big a thing should be.
 *
 * Pure: plain data and functions of an item.
 */

import type { ItemBlock, ItemIfcType, ItemKindDefinition, SymbolPen } from './itemKinds'
import type { ItemKind } from '../types/floorplan'
import { said } from '../messages/say'
import type { Vec2 } from './vec2'

const outline = (p: SymbolPen): Vec2[] => p.box(-0.5, -0.5, 0.5, 0.5)
const short = (p: SymbolPen): number => Math.min(p.width, p.depth)
const block = (shape: readonly Vec2[], bottom: number, top: number): ItemBlock => ({ outline: shape, bottom, top })
const about = (kind: ItemKind): ReturnType<typeof said> => said(`kind.about.${kind}`)
const sanitary = (predefined: string): ItemIfcType => ({ type: 'IFCSANITARYTERMINALTYPE', predefined })

/** Both diagonals of the outline, as a tall unit is drawn. */
const diagonals = (p: SymbolPen): Vec2[][] => [
  [p.point(-0.5, -0.5), p.point(0.5, 0.5)],
  [p.point(0.5, -0.5), p.point(-0.5, 0.5)],
]

/** A bowl in a counter at `u`, its half-width in shares at most `most`, and its tap behind it. */
function bowl(p: SymbolPen, u: number, most: number): Vec2[][] {
  const ru = Math.min(most, 0.22 / p.width)
  return [p.ellipse(u, 0.1, ru, 0.32), p.circle(u, -0.38, short(p) / 16)]
}

/** Four burners, one in each quarter, as a hob and a range are drawn. */
const burners = (p: SymbolPen, back: number, front: number): Vec2[][] => {
  const r = Math.min(p.width / 2, (front - back) * p.depth) / 3.2
  const mid = (back + front) / 2
  const dv = (front - back) / 4
  return [-0.25, 0.25].flatMap((u) => [p.circle(u, mid - dv, r), p.circle(u, mid + dv, r)])
}

/** A line across the item's front, where its door opens. */
const frontLine = (p: SymbolPen, v = 0.4): Vec2[] => [p.point(-0.5, v), p.point(0.5, v)]

/**
 * The kinds, in `SANITARY_KINDS` then `KITCHEN_KINDS` order:
 *
 * - bidet: its bowl, an oval, and the tap at its back;
 * - urinal: its bowl, rounded, and its lip;
 * - vanity: a counter with its bowl and tap;
 * - double basin: a counter with two bowls and two taps;
 * - towel radiator: its outline and its rail along the middle;
 * - shower screen: its glass, a thin outline;
 * - sink: its bowl at its left and its drainer's ribs at its right;
 * - hob: its outline and four burners;
 * - oven: its outline, its cavity and its door across the front;
 * - fridge: its outline, its door across the front and the cooling at its back;
 * - tall unit: its outline and both diagonals;
 * - wall unit: its outline and one diagonal;
 * - range: its outline, four burners and the oven door across the front;
 * - fryer: its outline and its two baskets;
 * - prep table: its outline and its upstand along its back;
 * - dishwasher: its outline, its rack and its door across the front;
 * - hood: its outline and its filter.
 *
 * In 3D, a bidet is its bowl, a urinal its rounded bowl and a sink its bowl; every other kind its
 * footprint to its height. Every kind is lifted by the item's elevation (`itemSolid`).
 */
export const FITTING_KIND_DEFINITIONS: readonly ItemKindDefinition[] = [
  {
    kind: 'bidet',
    group: 'fixture',
    ifc: sanitary('BIDET'),
    word: 'bidet',
    about: about('bidet'),
    symbol: (p) => ({ rings: [p.ellipse(0, 0.1, 0.4, 0.4), p.circle(0, -0.36, short(p) / 16)], lines: [] }),
    solid: (p, h) => [block(p.ellipse(0, 0.1, 0.4, 0.4), 0, h)],
  },
  {
    kind: 'urinal',
    group: 'fixture',
    sides: false,
    ifc: sanitary('URINAL'),
    word: 'urinal',
    about: about('urinal'),
    symbol: (p) => ({ rings: [p.roundedBox(-0.5, -0.5, 0.5, 0.5, short(p) * 0.3), p.ellipse(0, 0.1, 0.3, 0.3)], lines: [] }),
    solid: (p, h) => [block(p.roundedBox(-0.5, -0.5, 0.5, 0.5, short(p) * 0.3), 0, h)],
  },
  {
    kind: 'vanity',
    group: 'fixture',
    ifc: sanitary('WASHHANDBASIN'),
    word: 'vanity unit',
    about: about('vanity'),
    symbol: (p) => ({ rings: [outline(p), ...bowl(p, 0, 0.4)], lines: [] }),
  },
  {
    kind: 'double-basin',
    group: 'fixture',
    ifc: sanitary('WASHHANDBASIN'),
    word: 'double basin',
    about: about('double-basin'),
    symbol: (p) => ({ rings: [outline(p), ...bowl(p, -0.25, 0.2), ...bowl(p, 0.25, 0.2)], lines: [] }),
  },
  {
    kind: 'towel-radiator',
    group: 'fixture',
    sides: false,
    ifc: { type: 'IFCSPACEHEATERTYPE', predefined: 'TUBULARRADIATOR' },
    word: 'towel radiator',
    about: about('towel-radiator'),
    symbol: (p) => ({ rings: [outline(p)], lines: [[p.point(-0.5, 0), p.point(0.5, 0)]] }),
  },
  {
    kind: 'shower-screen',
    group: 'fixture',
    sides: false,
    inset: true,
    word: 'shower screen',
    about: about('shower-screen'),
    symbol: (p) => ({ rings: [outline(p)], lines: [] }),
  },
  {
    kind: 'sink',
    group: 'fixture',
    sides: false,
    inset: true,
    ifc: sanitary('SINK'),
    word: 'sink',
    about: about('sink'),
    symbol: (p) => ({
      rings: [outline(p), p.roundedBox(-0.45, -0.3, 0.1, 0.42, short(p) / 10), p.circle(-0.2, -0.4, short(p) / 16)],
      lines: [0.15, 0.27, 0.39].map((u) => [p.point(u, -0.3), p.point(u, 0.35)]),
    }),
    // Its bowl, sunk into the worktop it is set in.
    solid: (p, h) => [block(p.roundedBox(-0.45, -0.3, 0.1, 0.42, short(p) / 10), 0, h)],
  },
  {
    kind: 'hob',
    group: 'fixture',
    sides: false,
    inset: true,
    word: 'hob',
    about: about('hob'),
    symbol: (p) => ({ rings: [outline(p), ...burners(p, -0.5, 0.5)], lines: [] }),
  },
  {
    kind: 'oven',
    group: 'fixture',
    sides: false,
    word: 'oven',
    about: about('oven'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.4, -0.4, 0.4, 0.3)], lines: [frontLine(p)] }),
  },
  {
    kind: 'fridge',
    group: 'fixture',
    sides: false,
    word: 'fridge',
    about: about('fridge'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.35, -0.47, 0.35, -0.37)], lines: [frontLine(p)] }),
  },
  {
    kind: 'tall-unit',
    group: 'fixture',
    sides: false,
    word: 'tall unit',
    about: about('tall-unit'),
    symbol: (p) => ({ rings: [outline(p)], lines: diagonals(p) }),
  },
  {
    kind: 'wall-unit',
    group: 'fixture',
    sides: false,
    word: 'wall unit',
    about: about('wall-unit'),
    symbol: (p) => ({ rings: [outline(p)], lines: [[p.point(-0.5, 0.5), p.point(0.5, -0.5)]] }),
  },
  {
    kind: 'range',
    group: 'fixture',
    sides: false,
    labelled: true,
    word: 'range',
    about: about('range'),
    symbol: (p) => ({ rings: [outline(p), ...burners(p, -0.45, 0.3)], lines: [frontLine(p)] }),
  },
  {
    kind: 'fryer',
    group: 'fixture',
    sides: false,
    labelled: true,
    word: 'fryer',
    about: about('fryer'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.4, -0.4, -0.1, 0.3), p.box(0.1, -0.4, 0.4, 0.3)], lines: [] }),
  },
  {
    kind: 'prep-table',
    group: 'fixture',
    sides: false,
    labelled: true,
    word: 'prep table',
    about: about('prep-table'),
    symbol: (p) => ({ rings: [outline(p)], lines: [[p.point(-0.5, -0.42), p.point(0.5, -0.42)]] }),
  },
  {
    kind: 'dishwasher',
    group: 'fixture',
    sides: false,
    labelled: true,
    word: 'dishwasher',
    about: about('dishwasher'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.4, -0.4, 0.4, 0.3)], lines: [frontLine(p), [p.point(-0.4, -0.1), p.point(0.4, -0.1)]] }),
  },
  {
    kind: 'hood',
    group: 'fixture',
    sides: false,
    labelled: true,
    word: 'hood',
    about: about('hood'),
    symbol: (p) => ({ rings: [outline(p), p.box(-0.4, -0.4, 0.4, 0.2)], lines: [] }),
  },
]

