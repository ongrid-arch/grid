/**
 * DXF export: AutoCAD's open interchange format, 2D, as a drawing a drafter can go on working in
 * (HND-1, lab EX-1 and CP1-18).
 *
 * The version is AutoCAD 2013's, `AC1027`. From AutoCAD 2007's (`AC1021`) on, a DXF's text is
 * UTF-8, so a room called "Baño" is stored as those four letters and every reader shows it as it
 * is; before, the file was R12 (`AC1009`), plain ASCII with `\U+00F1` codes that three of the
 * lab's four readers showed as codes. R12 had no field for units either; this version records
 * metres (`$INSUNITS` 6). It is the oldest version that has everything the drawing uses (UTF-8
 * text, line weights, hatches, attribute blocks, layouts), and the one the lab's readers and the
 * common CAD programs all read.
 *
 * A version that new is a whole document, not a list of shapes: a header, the classes, the tables
 * (each entry with its handle and its owner), the block definitions with model space and paper
 * space, the entities and the objects (the root dictionary and the layouts). Every handle is given
 * out in the order the file is made, and the file is made in the order of the drawing, so the same
 * plan gives the same bytes (QAR-5: `exportPlan` hands the parts over in id order).
 *
 * What it holds, in a drafter's order:
 *
 * - Units: metres, and the plan's own axes, 1:1, no Y flip (C4).
 * - Doors, windows and doorless openings as blocks: one block per kind and size (and, for a door
 *   whose hinge and swing the plan states, per hand), inserted and turned on its wall. A door's
 *   leaf and arc are the core's (`doorSwing`), on the door-swing layer inside its block. A door or
 *   window that states its kind (CNT-14) or the part of it that opens is drawn by its kind's
 *   symbol (`openingSymbol`), one block per symbol, and what that symbol shows above the cut or
 *   hidden in the wall is on a dashed layer of its own.
 * - Walls as closed outlines, joined at their corners by the core (SHT-2: `PlanWall.slices`) and
 *   then joined into one outline and one hatch per run of touching walls on a layer, so no mitre
 *   line crosses a corner (VEW-54), filled by a solid hatch on a layer of its own. A curved wall's outline and hatch have its
 *   faces as true arcs, by their bulges (CNT-18: `PlanWall.curve`), and a curved dividing line is
 *   an ARC, or a CIRCLE all the way round; the room outlines along a curve are straight pieces,
 *   and the left-out note says so.
 * - Dimensions as dimension entities, with the core's chains outside the plan and its room
 *   dimensions inside (SHT-4: `buildDimensions`), each drawn in its own block as a dimension is.
 * - Fixtures and furniture as blocks (CNT-20): one block per library entry, or per kind and size,
 *   drawn in the item's own frame and inserted at its middle, turned as the plan turns it. CNT-55:
 *   one hung above the plan's cut on a dashed layer of its own, and a commercial kitchen's piece
 *   with its label at its middle.
 * - A tag in each room: a block with its number, name and area as attributes.
 * - A paper layout: an A3 sheet in millimetres with one viewport showing the plan at the profile's
 *   scale, and every text sized for that scale.
 *
 * Layers, colours, line weights and line types come from the export profile (`dxfProfile.ts`).
 *
 * Input is a `PlanDrawing`, not a `FloorPlan`: by then the openings are already cut out of the
 * walls, broken geometry is already dropped, and the shapes are the ones the 2D canvas draws, so
 * the export cannot disagree with what the user saw. Exporting one storey is
 * `toDxf(buildFloorPlan(planForFloor(plan, floor)))`.
 */

import type { Vec2 } from '../vec2'
import { add, distance, normalize, perp, scale, sub } from '../vec2'
import type { Bounds, PlanDrawing, PlanOpening } from '../floorplan'
import { computeBounds } from '../floorplan'
import { doorSwing, type SwingArc } from '../door'
import { boundsWithDimensions, buildDimensions, RADIUS_MARK, type Dimension } from '../dimensions'
import { openingSymbol, type SymbolPiece } from '../openingSymbol'
import { doorHand } from '../handing'
import { english, name as sayName, num as sayNum, said } from '../../messages/say'
import { TOLERANCES } from '../tolerances'
import { cutOutline, piecesAsRings, ringOf } from '../polygons'
import { areaText, metresText } from '../rounding'
import { GENERAL_GUIDANCE_LABEL } from '../rules/types'
import { approximationLines, kindLabel, leftOutByKind, leftOutSummary, NO_APPROXIMATIONS, partNames, type Approximations, type LeftOutPart } from './leftOut'
import type { PlanCurve } from '../floorplan'
import type { FloorPlan } from '../../types/floorplan'
import { factOf, factText, ROOM_NUMBER_FACT } from '../../types/facts'
import { indexPlan } from '../plan'
import { roomZones } from '../zones'
import { DXF_CATEGORIES, DXF_LINETYPES, NEUTRAL_DXF_PROFILE, type DxfCategory, type DxfLinetype, type DxfPen, type DxfProfile } from './dxfProfile'

export * from './dxfProfile'

const neutral = (category: DxfCategory): string => NEUTRAL_DXF_PROFILE.pens[category].layer

/**
 * The neutral profile's layer names. A downstream tool keys its pens off a file's layer names;
 * with no profile of the office's own, these are they.
 */
export const DXF_LAYERS = {
  wallExterior: neutral('walls-outside'),
  wallInterior: neutral('walls-inside'),
  wallVirtual: neutral('dividing-lines'),
  wallFill: neutral('wall-fill'),
  wallExisting: neutral('walls-existing'),
  wallNew: neutral('walls-new'),
  wallDemolished: neutral('walls-demolished'),
  wallFillNew: neutral('wall-fill-new'),
  openingsDemolished: neutral('openings-demolished'),
  rooms: neutral('rooms'),
  roomTags: neutral('room-tags'),
  doors: neutral('doors'),
  doorSwings: neutral('door-swings'),
  windows: neutral('windows'),
  openings: neutral('openings'),
  // CNT-14: what a door's or window's symbol shows above the plan's cut or hidden in its wall (a
  // pocket, a garage door open overhead, a high-level window), dashed.
  openingsAbove: neutral('openings-above'),
  fixtures: neutral('fixtures'),
  // CNT-55: an item hung above the plan's cut, dashed.
  fixturesAbove: neutral('fixtures-above'),
  columns: neutral('columns'),
  structuralGrid: neutral('structural-grid'),
  dimensions: neutral('dimensions'),
  notes: neutral('notes'),
  facts: neutral('facts'),
  leftOut: neutral('left-out'),
  labels: neutral('label'),
  sheet: neutral('sheet'),
  viewport: neutral('viewport')
} as const

/**
 * SHT-7: the layer of one sketch category: the profile's sketch layer (`GRID-SKETCH`), a dash and
 * the category in capitals, every character a layer name cannot hold made a dash.
 */
export function sketchLayer(category: string, prefix: string = neutral('sketch')): string {
  return `${prefix}-${category.toUpperCase().replace(/[^A-Z0-9_-]/g, '-')}`
}

/** The version written: AutoCAD 2013's. */
export const DXF_VERSION = 'AC1027'

/** `$INSUNITS` for metres. */
export const DXF_METRES = 6

/** The block every room tag inserts, and its attributes' tags. */
export const DXF_ROOM_TAG = { block: 'GRID-ROOM-TAG', number: 'NUMBER', name: 'NAME', area: 'AREA' } as const

/** The dimension style the dimensions use. */
export const DXF_DIMENSION_STYLE = 'GRID'

/** The paper layout's name. */
export const DXF_LAYOUT = 'Sheet'

/**
 * Text and dimension sizes in millimetres on paper: Grid's own choice. The file holds them in
 * metres, times the profile's scale, so they print at these sizes from the layout.
 */
const PAPER_MM = { name: 2.5, text: 2, fact: 1.5, label: 2.5, tick: 1.5, gap: 0.6, extensionGap: 1, extensionPast: 1.25, title: 3.5, dash: 2, gap2: 1.2, dot: 1 } as const

/** The sheet: A3 across, in millimetres, its border and the viewport inside it. */
const SHEET = { width: 420, height: 297, border: 10, title: 15 } as const

/**
 * A text value holds at most this many characters: AutoCAD's single-line text holds 256, and a
 * label is not where detail belongs. The cap is applied between characters.
 */
const MAX_TEXT = 250

/**
 * One line of text as the file holds it. The format is line-oriented: a value is one line, so
 * anything that can carry a line break could forge a group code and corrupt every entity after
 * it, and the text comes from the plan file. Control characters go, and the line and paragraph
 * separators become spaces.
 *
 * The text is UTF-8 and stays as written, except three characters a CAD program reads as a code:
 * a backslash goes out as `\U+005C` (else `\U+0041` typed into a name would read back as "A"), a
 * caret as `^ ` (the format's own way of writing one), and a percent sign as `%%%` in text that
 * holds `%%` (else `%%d` would read back as a degree sign). A lone surrogate is no character at
 * all, and becomes `?`.
 */
export function dxfText(text: string): string {
  const percent = text.includes('%%')
  let out = ''
  let count = 0
  for (const char of text.replace(/\p{Cc}/gu, '').replace(/[\u2028\u2029]/g, ' ')) {
    if (count >= MAX_TEXT) break
    const code = char.codePointAt(0)!
    out += code >= 0xd800 && code <= 0xdfff ? '?' : char === '\\' ? '\\U+005C' : char === '^' ? '^ ' : char === '%' && percent ? '%%%' : char
    count++
  }
  return out
}

/** Avoids `-0.000000`, which some readers parse but no one wants to read. */
function num(value: number): string {
  const fixed = value.toFixed(6)
  return fixed === '-0.000000' ? '0.000000' : fixed
}

/** Whether every number can be written as one: the file never holds "Infinity" or "NaN". */
const writable = (...values: readonly number[]): boolean => values.every(Number.isFinite)
const writablePoints = (points: readonly Vec2[]): boolean => points.every((p) => writable(p.x, p.y))

/** Degrees in [0, 360). */
function degrees(radians: number): number {
  const d = (radians * 180) / Math.PI
  const wrapped = ((d % 360) + 360) % 360
  // Rounding noise must not turn 0° into 359.999999.
  return Math.abs(wrapped - 360) < TOLERANCES.relativeNoise.value ? 0 : wrapped
}

/** Group codes and values, two lines each, CRLF: what the format is written with. */
class Out {
  readonly lines: string[] = []
  /** VEW-72: how far a floor after the first is moved along X in model space, added to every point. */
  shift: Vec2 = { x: 0, y: 0 }

  pair(code: number, value: string | number): void {
    this.lines.push(String(code), String(value))
  }

  /** A point: x and y at `code` and `code + 10`, and z, always 0 in a plan, at `code + 20`. */
  point(at: Vec2, code = 10, z = true): void {
    this.pair(code, num(at.x + this.shift.x))
    this.pair(code + 10, num(at.y + this.shift.y))
    if (z) this.pair(code + 20, num(0))
  }

  /** Each handle and its owner: `5` (or `105` for a dimension style), `330`. */
  head(type: string, handle: string, owner: string, handleCode = 5): void {
    this.pair(0, type)
    this.pair(handleCode, handle)
    this.pair(330, owner)
  }

  /** A record of a table: its handle, its owner table, its subclass and its name. */
  record(type: string, handle: string, table: string, subclass: string, name: string, handleCode = 5): void {
    this.head(type, handle, table, handleCode)
    this.pair(100, 'AcDbSymbolTableRecord')
    this.pair(100, subclass)
    this.pair(2, name)
    this.pair(70, 0)
  }

  /** Reactors: the dictionary that owns an object. */
  reactors(owner: string): void {
    this.pair(102, '{ACAD_REACTORS')
    this.pair(330, owner)
    this.pair(102, '}')
  }
}

/** Handles, given out in order, in hexadecimal. */
class Handles {
  private last = 0

  take(): string {
    this.last += 1
    return this.last.toString(16).toUpperCase()
  }

  /** The first handle not given out: `$HANDSEED`. */
  get seed(): string {
    return (this.last + 1).toString(16).toUpperCase()
  }
}

/** What the whole document shares while it is written. */
interface Doc {
  readonly handles: Handles
  readonly profile: DxfProfile
  /** Each category's layer name, spelt as the first category with that name spells it. */
  readonly layerOf: Readonly<Record<DxfCategory, string>>
  /** The layers something is drawn on, keyed in capitals, with their pens. */
  readonly used: Map<string, { readonly name: string; readonly pen: DxfPen }>
  /** Sizes in metres in the model. */
  readonly size: Readonly<Record<keyof typeof PAPER_MM, number>>
  readonly style: string
}

/** Where entities go: model space, paper space or a block, with the record that owns them. */
class Space {
  constructor(
    readonly doc: Doc,
    readonly out: Out,
    readonly owner: string,
    readonly paper = false
  ) {}

  /** A layer by its category, marked as used. */
  layer(category: DxfCategory): string {
    const name = this.doc.layerOf[category]
    this.use(name, this.doc.profile.pens[category])
    return name
  }

  use(name: string, pen: DxfPen): void {
    const key = name.toUpperCase()
    if (!this.doc.used.has(key)) this.doc.used.set(key, { name, pen })
  }

  /** The start every entity shares, and its subclass when it has one. Returns its handle. */
  start(type: string, layer: string, subclass?: string): string {
    const handle = this.doc.handles.take()
    this.out.head(type, handle, this.owner)
    this.out.pair(100, 'AcDbEntity')
    if (this.paper) this.out.pair(67, 1)
    this.out.pair(8, layer)
    if (subclass !== undefined) this.out.pair(100, subclass)
    return handle
  }

  line(layer: string, from: Vec2, to: Vec2): void {
    if (!writablePoints([from, to])) return
    this.start('LINE', layer, 'AcDbLine')
    this.out.point(from)
    this.out.point(to, 11)
  }

  /**
   * A light polyline; `closed` makes it an outline that hatches and fills downstream. CNT-18:
   * `turns`, one per stretch to the next point, makes a curved stretch a true arc: the vertex's
   * bulge (42) is the tangent of a quarter of its turn.
   */
  polyline(layer: string, points: readonly Vec2[], closed: boolean, turns: readonly number[] = []): void {
    if (points.length < 2 || !writablePoints(points) || !turns.every(Number.isFinite)) return
    this.start('LWPOLYLINE', layer, 'AcDbPolyline')
    this.out.pair(90, points.length)
    this.out.pair(70, closed ? 1 : 0)
    points.forEach((p, i) => {
      this.out.point(p, 10, false)
      const turn = turns[i] ?? 0
      if (turn !== 0) this.out.pair(42, num(Math.tan(turn / 4)))
    })
  }

  /** CNT-18: a whole circle, as a curved dividing line that goes all the way round is. */
  circle(layer: string, centre: Vec2, radius: number): void {
    if (!writable(centre.x, centre.y, radius)) return
    this.start('CIRCLE', layer, 'AcDbCircle')
    this.out.point(centre)
    this.out.pair(40, num(radius))
  }

  /** An arc always runs counter-clockwise from its start angle, so a clockwise one is written from its end. */
  arc(layer: string, arc: SwingArc): void {
    const [start, end] = arc.counterClockwise ? [arc.from, arc.to] : [arc.to, arc.from]
    if (!writable(arc.center.x, arc.center.y, arc.radius, start, end)) return
    this.start('ARC', layer, 'AcDbCircle')
    this.out.point(arc.center)
    this.out.pair(40, num(arc.radius))
    this.out.pair(100, 'AcDbArc')
    this.out.pair(50, num(degrees(start)))
    this.out.pair(51, num(degrees(end)))
  }

  /**
   * One line of text. Centred on its point, as the 2D plan draws it: with a horizontal alignment a
   * reader places the text at 11/21/31, so the point is repeated there. Left-aligned, it starts
   * at its point and runs to the right.
   */
  text(layer: string, at: Vec2, words: string, height: number, options: { centred?: boolean; rotation?: number } = {}): void {
    const value = dxfText(words)
    const { centred = true, rotation = 0 } = options
    if (value.length === 0 || !writablePoints([at]) || !writable(height, rotation)) return
    this.start('TEXT', layer, 'AcDbText')
    this.out.point(at)
    this.out.pair(40, num(height))
    this.out.pair(1, value)
    if (rotation !== 0) this.out.pair(50, num(rotation))
    this.out.pair(7, this.doc.style)
    if (centred) {
      this.out.pair(72, 1)
      this.out.point(at, 11)
    }
    this.out.pair(100, 'AcDbText')
  }

  /**
   * A solid fill bounded by closed outlines, each one a loop of its own. CNT-18: a loop with
   * `turns` (one per stretch) has its curved stretches as true arcs, by their bulges.
   */
  hatch(layer: string, loops: readonly (readonly Vec2[])[], turns: readonly (readonly number[])[] = []): void {
    const kept = loops.map((loop, i) => ({ loop, turns: turns[i] ?? [] })).filter(({ loop, turns: t }) => loop.length >= 2 && writablePoints(loop) && t.every(Number.isFinite) && (loop.length >= 3 || t.some((v) => v !== 0)))
    if (kept.length === 0) return
    this.start('HATCH', layer, 'AcDbHatch')
    // The elevation point: only its height counts, and it is not moved with the floor.
    for (const code of [10, 20, 30]) this.out.pair(code, num(0))
    this.out.pair(210, num(0))
    this.out.pair(220, num(0))
    this.out.pair(230, num(1))
    this.out.pair(2, 'SOLID')
    this.out.pair(70, 1)
    this.out.pair(71, 0)
    this.out.pair(91, kept.length)
    for (const { loop, turns: bulged } of kept) {
      // An outer polyline loop, closed; with bulges where a stretch is an arc (CNT-18).
      const arcs = bulged.some((t) => t !== 0)
      this.out.pair(92, 3)
      this.out.pair(72, arcs ? 1 : 0)
      this.out.pair(73, 1)
      this.out.pair(93, loop.length)
      loop.forEach((p, i) => {
        this.out.point(p, 10, false)
        if (arcs) this.out.pair(42, num(Math.tan((bulged[i] ?? 0) / 4)))
      })
      this.out.pair(97, 0)
    }
    this.out.pair(75, 0)
    this.out.pair(76, 1)
    this.out.pair(98, 0)
  }

  /** A block inserted at `at`, turned `rotation` degrees, with its attributes' values. */
  insert(layer: string, block: string, at: Vec2, rotation: number, attributes: readonly Attribute[] = []): void {
    if (!writablePoints([at]) || !writable(rotation)) return
    const handle = this.start('INSERT', layer, 'AcDbBlockReference')
    if (attributes.length > 0) this.out.pair(66, 1)
    this.out.pair(2, block)
    this.out.point(at)
    if (rotation !== 0) this.out.pair(50, num(rotation))
    if (attributes.length === 0) return
    const owned = new Space(this.doc, this.out, handle, this.paper)
    for (const attribute of attributes) owned.attribute(layer, attribute)
    owned.start('SEQEND', layer)
  }

  private attribute(layer: string, a: Attribute): void {
    this.start('ATTRIB', layer, 'AcDbText')
    this.out.point(a.at)
    this.out.pair(40, num(a.height))
    this.out.pair(1, dxfText(a.value))
    this.out.pair(7, this.doc.style)
    this.out.pair(72, 1)
    this.out.point(a.at, 11)
    this.out.pair(100, 'AcDbAttribute')
    this.out.pair(280, 0)
    this.out.pair(2, a.tag)
    this.out.pair(70, a.invisible === true ? 1 : 0)
  }

  /** An attribute's definition in a block: where its value goes, and its tag. */
  attributeDefinition(a: Omit<Attribute, 'value'> & { readonly prompt: string }): void {
    this.start('ATTDEF', '0', 'AcDbText')
    this.out.point(a.at)
    this.out.pair(40, num(a.height))
    this.out.pair(1, '')
    this.out.pair(7, this.doc.style)
    this.out.pair(72, 1)
    this.out.point(a.at, 11)
    this.out.pair(100, 'AcDbAttributeDefinition')
    this.out.pair(280, 0)
    this.out.pair(3, a.prompt)
    this.out.pair(2, a.tag)
    this.out.pair(70, a.invisible === true ? 1 : 0)
  }
}

interface Attribute {
  readonly tag: string
  readonly value: string
  readonly at: Vec2
  readonly height: number
  /** VEW-72: kept in the file and the block's data, not drawn. */
  readonly invisible?: boolean
}

// ── What the drawing needs as blocks ─────────────────────────────────────────────────────────

type OpeningKind = 'door' | 'window' | 'opening'

/**
 * VEW-72: what the schedules say of one opening, which its insert's attributes carry: its mark
 * (`D1`, `W1`, the IFC's Tag too), its schedule type's key, its height and its sill.
 */
export interface DxfOpeningFacts {
  readonly mark: string
  /** `window:1.2x1.5`, or `window-type:<id>` for a type the plan names (the schedule's `typeKey`); null for the kind and size. */
  readonly type: string | null
  readonly height: number | null
  readonly sill: number | null
}

/** VEW-72: the attributes every door, window and doorless opening insert carries, by tag. */
export const DXF_OPENING_ATTRIBUTES = { mark: 'MARK', type: 'TYPE', width: 'WIDTH', height: 'HEIGHT', sill: 'SILL' } as const

/** One block an opening inserts: one schedule type, in one wall thickness, with one hand. */
interface OpeningBlock {
  readonly key: string
  readonly kind: OpeningKind
  readonly width: number
  /** CMD-26: the width the plan states, which names the block; on a curved wall `width` is the chord. */
  readonly stated: number
  /** VEW-72: the height of the opening, which names the block too; null when the plan states none. */
  readonly height: number | null
  /** VEW-72: the schedule type's key, and the word of a type the plan names, for the block's name. */
  readonly type: string
  readonly named: string | null
  readonly thickness: number
  /** `L` opens towards +Y of the block, `R` towards −Y; null for a door with no swing stated. */
  readonly hand: 'L' | 'R' | null
  /** VEW-72: its hand in Grid's one convention (`doorHand`), when the plan states its hinge and swing. */
  readonly handed: 'LH' | 'RH' | null
  /**
   * CNT-14: for a door or window drawn by its kind's symbol, the symbol in the block's own frame,
   * the kind it is drawn as and, in millimetres, the part that opens and a garage door's height
   * when they shape it. Null for one drawn as before.
   */
  readonly symbol: { readonly kind: string; readonly pieces: readonly SymbolPiece[]; readonly part: number | null; readonly height: number | null } | null
}

/** Where one opening's block goes, and the values of its attributes. */
interface OpeningPlace {
  readonly key: string
  readonly kind: OpeningKind
  readonly at: Vec2
  readonly rotation: number
  readonly block: OpeningBlock
  readonly values: Readonly<Record<keyof typeof DXF_OPENING_ATTRIBUTES, string>>
}

const KIND_ORDER: Record<OpeningKind, number> = { door: 0, window: 1, opening: 2 }

const mm = (metres: number): number => Math.round(metres * 1000)

/**
 * CNT-14: the symbol of a door or window that states its kind (other than one leaf or casement,
 * which is drawn as before) or the part of it that opens, drawn on the block's own opening: along
 * +X from the origin, its normal +Y, hung from the origin's end. A door or window hung from its end
 * jamb is drawn from the other end, and the face it opens to is then the other one (−Y), as for a
 * door's hand. Null for one drawn as before, and for one whose symbol the core cannot draw (a
 * door that swings with no swing stated), which keeps its block of before.
 */
function kindBlock(opening: PlanOpening, width: number, fromEnd: boolean): Pick<OpeningBlock, 'hand' | 'symbol'> | null {
  if (opening.type === 'opening' || (opening.opens === undefined && (opening.kind === undefined || opening.kind === 'single'))) return null
  const swing = opening.swing === undefined ? undefined : fromEnd ? (opening.swing === 'left' ? 'right' : 'left') : opening.swing
  const own: PlanOpening = {
    id: opening.id,
    wallId: opening.wallId,
    type: opening.type,
    from: { x: 0, y: 0 },
    to: { x: width, y: 0 },
    normal: { x: 0, y: 1 },
    thickness: opening.thickness,
    width: opening.width,
    ...(opening.hinge !== undefined ? { hinge: 'start' as const } : {}),
    ...(swing !== undefined ? { swing } : {}),
    ...(opening.kind !== undefined ? { kind: opening.kind } : {}),
    ...(opening.opens !== undefined ? { opens: opening.opens } : {}),
    ...(opening.height !== undefined ? { height: opening.height } : {})
  }
  const symbol = openingSymbol(own)
  // A kind its type does not take is read as none (`opening/kind-not-for-type`): drawn as before.
  if (symbol === null || (symbol.kind === 'single' && opening.opens === undefined)) return null
  const pieces = symbol.pieces.filter((piece) => piece.shape === 'arc' || piece.part !== 'jamb')
  const part = opening.opens !== undefined && writable(opening.opens.width) ? mm(opening.opens.width) : null
  const height = symbol.kind === 'garage' && opening.height !== undefined && writable(opening.height) ? mm(opening.height) : null
  return { hand: swing === undefined ? null : swing === 'left' ? 'L' : 'R', symbol: { kind: symbol.kind, pieces, part, height } }
}

/** A symbol as a key: the same lines and arcs, to the file's precision, are one block. */
function symbolKey(pieces: readonly SymbolPiece[]): string {
  const p = (at: Vec2): string => `${num(at.x)},${num(at.y)}`
  return pieces
    .map((piece) => (piece.shape === 'arc' ? `a${p(piece.center)};${num(piece.radius)};${p(piece.tip)};${p(piece.far)};${piece.counterClockwise ? 1 : 0}` : `l${piece.part}${piece.above ? '^' : ''};${p(piece.from)};${p(piece.to)}`))
    .join('|')
}

/** A size in a type's key, to the millimetre, as the schedule writes it: `0.9`, `2.1`. */
const keySize = (value: number): string => String(Math.round(value * 1000) / 1000)

/** VEW-72: the face of the block a mark stands by: away from a door's swing. */
const markSide = (hand: OpeningBlock['hand']): number => (hand === 'L' ? -1 : 1)

/** VEW-72: a dimension in metres as an attribute holds it, or nothing when it is not known. */
const metresValue = (value: number | null | undefined): string => (value === null || value === undefined || !writable(value) ? '' : metresText(value))

/**
 * Each opening as a block and where it goes. A block is drawn along +X from its insertion point,
 * as wide as the opening, with the wall's axis on X. A door hung from its start jamb is inserted
 * at the start; one hung from its end jamb is the same block turned half round at the end, so a
 * door of one size has two blocks, one per hand, whichever jamb it hangs from. A door or window of
 * a kind (CNT-14) is placed the same way, by the jamb it hangs from or opens toward.
 *
 * VEW-72: a block is one schedule type (`facts`, else the kind and the size, width by height), so
 * two windows of one width and different heights are two blocks, and each insert carries the
 * opening's mark, type, width, height and sill as attributes.
 */
function openingBlocks(drawings: readonly { readonly drawing: PlanDrawing; readonly facts: ReadonlyMap<string, DxfOpeningFacts> | undefined }[]): { blocks: OpeningBlock[]; places: OpeningPlace[][] } {
  const blocks = new Map<string, OpeningBlock>()
  const places = drawings.map(({ drawing, facts }) => {
    const placed: OpeningPlace[] = []
    for (const opening of drawing.openings) {
      // CNT-10: an opening to be demolished has no block: it is its outline (`writeModel`).
      if (opening.phase === 'demolished') continue
      const width = distance(opening.from, opening.to)
      if (!writablePoints([opening.from, opening.to]) || !writable(opening.thickness) || !(width > 0)) continue
      const kind: OpeningKind = opening.type === 'door' ? 'door' : opening.type === 'window' ? 'window' : 'opening'
      const ofKind = kindBlock(opening, width, opening.hinge === 'end')
      const stated = kind === 'door' && opening.hinge !== undefined && opening.swing !== undefined
      const fromEnd = ofKind !== null ? opening.hinge === 'end' : stated && opening.hinge === 'end'
      const hand = ofKind !== null ? ofKind.hand : !stated ? null : (opening.swing === 'left') !== fromEnd ? 'L' : 'R'
      const symbol = ofKind?.symbol ?? null
      const own = facts?.get(opening.id)
      const height = own?.height ?? (opening.height !== undefined && writable(opening.height) ? opening.height : null)
      const type = own?.type ?? `${kind}:${symbol === null ? '' : `${symbol.kind}:`}${keySize(opening.width)}${height === null ? '' : `x${keySize(height)}`}`
      const namedType = /^(?:door|window)-type:([^:]+)/.exec(type)
      const side = kind === 'door' ? doorHand(opening) : null
      const handed = side === null ? null : side === 'left' ? 'LH' : 'RH'
      const key = `${kind}|${num(width)}|${num(opening.width)}|${num(opening.thickness)}|${hand ?? ''}|${height === null ? '' : num(height)}|${type}${symbol === null ? '' : `|${symbol.kind}|${symbolKey(symbol.pieces)}`}`
      if (!blocks.has(key)) blocks.set(key, { key, kind, width, stated: opening.width, height, type, named: namedType === null ? null : blockWord(namedType[1]!), thickness: opening.thickness, hand, handed, symbol })
      const along = Math.atan2(opening.to.y - opening.from.y, opening.to.x - opening.from.x)
      const values = { mark: own?.mark ?? opening.id, type, width: metresValue(opening.width), height: metresValue(height), sill: metresValue(own?.sill) }
      placed.push({ key, kind, at: fromEnd ? opening.to : opening.from, rotation: degrees(fromEnd ? along + Math.PI : along), block: blocks.get(key)!, values })
    }
    return placed
  })
  const sorted = [...blocks.values()].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.symbol?.kind ?? '').localeCompare(b.symbol?.kind ?? '') ||
      a.width - b.width ||
      (a.height ?? 0) - (b.height ?? 0) ||
      a.thickness - b.thickness ||
      (a.hand ?? '').localeCompare(b.hand ?? '') ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  )
  return { blocks: sorted, places }
}

/**
 * `GRID-DOOR-900x2100-W200-RH`: the kind, the stated width by the height and the wall's thickness
 * in millimetres, and the hand in Grid's one convention (VEW-72: the side of the hinges seen from
 * the side the door opens toward). A type the plan names adds its id (`GRID-DOOR-OAK-900x2100-W200`);
 * a door or window of a kind (CNT-14) adds its kind and the part that opens (`-P800`):
 * `GRID-DOOR-SLIDING-2400x2100-W200`.
 */
function blockNames(blocks: readonly OpeningBlock[]): Map<string, string> {
  const names = new Map<string, string>()
  const taken = new Set<string>()
  for (const block of blocks) {
    const kind = block.symbol === null ? '' : `-${block.symbol.kind.toUpperCase()}`
    const named = block.named === null ? '' : `-${block.named}`
    const size = block.height === null ? `${mm(block.stated)}` : `${mm(block.stated)}x${mm(block.height)}`
    const part = block.symbol?.part == null ? '' : `-P${block.symbol.part}`
    const height = block.height !== null || block.symbol?.height == null ? '' : `-H${block.symbol.height}`
    const base = `GRID-${block.kind.toUpperCase()}${kind}${named}-${size}-W${mm(block.thickness)}${block.handed === null ? '' : `-${block.handed}`}${part}${height}`
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`
    taken.add(name)
    names.set(block.key, name)
  }
  return names
}

// ── Fixtures and furniture as blocks (CNT-20) ───────────────────────────────────────────────

/** One block an item inserts: its symbol in its own frame, by what it is and its size. */
interface ItemBlock {
  readonly key: string
  readonly base: string
  readonly width: number
  readonly depth: number
  readonly rings: readonly (readonly Vec2[])[]
  readonly lines: readonly (readonly Vec2[])[]
}

/** Where one item's block goes. */
interface ItemPlace {
  readonly key: string
  readonly at: Vec2
  readonly rotation: number
  /** CNT-55: it hangs above the plan's cut, so it goes on the dashed layer. */
  readonly raised: boolean
  /** CNT-55: the label written at its middle, for a kind drawn with its label; null for none. */
  readonly label: string | null
}

/** A block name's part from a name of the plan's: letters and digits kept, the rest dashes. */
function blockWord(text: string): string {
  const word = text.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return word === '' ? 'ITEM' : word.slice(0, 40)
}

/**
 * Each item as a block and where it goes (CNT-20): one block per library entry, or per kind,
 * size and symbol for an item placed without one, drawn in the item's own frame (its middle at
 * the insertion point, its back towards -Y) and inserted at its middle, turned as the plan turns
 * it. So a CAD program counts the fixtures and furniture by their blocks and swaps one for all.
 */
function itemBlocks(drawings: readonly PlanDrawing[]): { blocks: ItemBlock[]; places: ItemPlace[][]; names: Map<string, string> } {
  const blocks = new Map<string, ItemBlock>()
  const places = drawings.map((drawing) => {
    const placed: ItemPlace[] = []
    for (const item of drawing.items) {
      const { rings, lines } = item.block
      if (!writablePoints([item.at, ...rings.flat(), ...lines.flat()]) || !writable(item.turn, item.size[0], item.size[1])) continue
      const shape = [...rings.map((ring) => `r${ring.map((p) => `${num(p.x)},${num(p.y)}`).join(';')}`), ...lines.map((line) => `l${line.map((p) => `${num(p.x)},${num(p.y)}`).join(';')}`)].join('|')
      const base = blockWord(item.library ?? item.kind)
      const key = `${base}|${num(item.size[0])}|${num(item.size[1])}|${shape}`
      if (!blocks.has(key)) blocks.set(key, { key, base, width: item.size[0], depth: item.size[1], rings, lines })
      placed.push({ key, at: item.at, rotation: item.turn, raised: item.raised === true, label: item.labelled === true && item.label !== '' ? item.label : null })
    }
    return placed
  })
  const sorted = [...blocks.values()].sort((a, b) => a.base.localeCompare(b.base) || a.width - b.width || a.depth - b.depth || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  // `GRID-DOUBLE-BED-1400x2000`: the library entry's name, or the kind, then the width and depth in millimetres.
  const names = new Map<string, string>()
  const taken = new Set<string>()
  for (const block of sorted) {
    const name0 = `GRID-${block.base}-${mm(block.width)}x${mm(block.depth)}`
    let name = name0
    for (let n = 2; taken.has(name); n++) name = `${name0}-${n}`
    taken.add(name)
    names.set(block.key, name)
  }
  return { blocks: sorted, places, names }
}

/** What one item block draws: its symbol's rings closed and its lines open, on layer 0 so they take the insert's layer. */
function drawItemBlock(space: Space, block: ItemBlock): void {
  for (const ring of block.rings) space.polyline('0', ring, true)
  for (const line of block.lines) space.polyline('0', line, false)
}

/**
 * CNT-14: a kind's symbol in its block. A door's leaves and swings go on the door-swing layer, as
 * one leaf's do; its fixed panel, and a window's faces and glass, on layer 0, so they take the
 * insert's layer (the doors' or the windows'); what lies above the cut or hidden in the wall on
 * its own dashed layer.
 */
function drawSymbol(space: Space, block: OpeningBlock, pieces: readonly SymbolPiece[]): void {
  for (const piece of pieces) {
    if (piece.shape === 'arc') {
      const angle = (p: Vec2): number => Math.atan2(p.y - piece.center.y, p.x - piece.center.x)
      space.arc(space.layer('door-swings'), { center: piece.center, radius: piece.radius, from: angle(piece.far), to: angle(piece.tip), counterClockwise: piece.counterClockwise })
      continue
    }
    const layer = piece.above ? space.layer('openings-above') : block.kind === 'door' && piece.part === 'leaf' ? space.layer('door-swings') : '0'
    space.line(layer, piece.from, piece.to)
  }
}

/** VEW-72: where an opening's mark stands in its block's frame: by its middle, on the face away from a door's swing. */
function markPoint(block: Pick<OpeningBlock, 'width' | 'thickness' | 'hand'>, size: Doc['size']): Vec2 {
  return { x: block.width / 2, y: markSide(block.hand) * (block.thickness / 2 + size.text * 1.5) }
}

/** VEW-72: the attributes' prompts, by tag. */
const OPENING_PROMPTS: Readonly<Record<keyof typeof DXF_OPENING_ATTRIBUTES, string>> = { mark: 'Mark', type: 'Type', width: 'Width', height: 'Height', sill: 'Sill' }

/**
 * What one opening block draws, in its own frame: the core's door swing for a door that has one.
 * VEW-72: and its attributes, the mark shown by the opening and the type, width, height and sill
 * kept in the file, not drawn.
 */
function drawOpeningBlock(space: Space, block: OpeningBlock): void {
  drawOpeningShape(space, block)
  const { size } = space.doc
  for (const field of Object.keys(DXF_OPENING_ATTRIBUTES) as (keyof typeof DXF_OPENING_ATTRIBUTES)[]) {
    const shown = field === 'mark'
    space.attributeDefinition({ tag: DXF_OPENING_ATTRIBUTES[field], prompt: OPENING_PROMPTS[field], at: shown ? markPoint(block, size) : { x: 0, y: 0 }, height: size.text, invisible: !shown })
  }
}

function drawOpeningShape(space: Space, block: OpeningBlock): void {
  const { width: w, thickness: t } = block
  const from = { x: 0, y: 0 }
  const to = { x: w, y: 0 }
  if (block.kind === 'window') {
    if (block.symbol !== null) {
      drawSymbol(space, block, block.symbol.pieces)
      return
    }
    // The wall's break bridged by a line along each face and the glass along the middle.
    for (const y of [t / 2, -t / 2, 0]) space.line('0', { x: 0, y }, { x: w, y })
    return
  }
  // The line across the gap, so an opening reads as one rather than as a missing wall.
  space.line('0', from, to)
  if (block.symbol !== null) {
    drawSymbol(space, block, block.symbol.pieces)
    return
  }
  if (block.hand === null) return
  const swing = doorSwing({ id: '', wallId: '', type: 'door', from, to, normal: { x: 0, y: 1 }, thickness: t, width: w }, 'start', block.hand === 'L' ? 'left' : 'right')
  if (swing === null) return
  const layer = space.layer('door-swings')
  space.line(layer, swing.leaf[0], swing.leaf[1])
  space.arc(layer, swing.arc)
}

// ── Dimensions ───────────────────────────────────────────────────────────────────────────────

/** One dimension with what its block draws: its text, and where the text sits. */
interface PlacedDimension {
  readonly dim: Dimension
  readonly text: string
  readonly textAt: Vec2
  readonly textMiddle: Vec2
  readonly rotation: number
  readonly along: Vec2
  readonly across: Vec2
}

const NOISE = TOLERANCES.relativeNoise.value

/** The dimensions the file holds: the core's, each turned so its text reads from below or the right. */
function placedDimensions(drawing: PlanDrawing, size: Doc['size']): PlacedDimension[] {
  const out: PlacedDimension[] = []
  for (const dim of buildDimensions(drawing)) {
    if (!writablePoints([dim.from, dim.to, dim.normal]) || !writable(dim.offset, dim.value) || !(dim.value > 0)) continue
    let along = normalize(sub(dim.to, dim.from))
    if (along.x < -NOISE || (Math.abs(along.x) <= NOISE && along.y < 0)) along = scale(along, -1)
    const across = perp(along)
    const shift = scale(dim.normal, dim.offset)
    const middle = scale(add(add(dim.from, shift), add(dim.to, shift)), 0.5)
    const textAt = add(middle, scale(across, size.gap))
    out.push({ dim, text: `${dim.kind === 'radius' ? RADIUS_MARK : ''}${metresText(dim.value)}`, textAt, textMiddle: add(textAt, scale(across, size.text / 2)), rotation: degrees(Math.atan2(along.y, along.x)), along, across })
  }
  return out
}

/** What a dimension's block draws: its extension lines, its line, a tick at each end and its text. */
function drawDimensionBlock(space: Space, placed: PlacedDimension): void {
  const { dim, along, across } = placed
  const { size } = space.doc
  const shift = scale(dim.normal, dim.offset)
  const a = add(dim.from, shift)
  const b = add(dim.to, shift)
  if (dim.offset > size.extensionGap) {
    for (const end of [dim.from, dim.to]) space.line('0', add(end, scale(dim.normal, size.extensionGap)), add(end, scale(dim.normal, dim.offset + size.extensionPast)))
  }
  space.line('0', a, b)
  const tick = scale(normalize(add(along, across)), size.tick / 2)
  // VEW-79: a radius has one end on the curve, and a cross at its centre where its line reaches it.
  for (const end of dim.kind === 'radius' ? [b] : [a, b]) space.line('0', sub(end, tick), add(end, tick))
  const centre = dim.centre
  if (dim.kind === 'radius' && centre !== undefined && centre.x === dim.from.x && centre.y === dim.from.y) {
    space.line('0', sub(centre, { x: size.tick, y: 0 }), add(centre, { x: size.tick, y: 0 }))
    space.line('0', sub(centre, { x: 0, y: size.tick }), add(centre, { x: 0, y: size.tick }))
  }
  space.text('0', placed.textAt, placed.text, size.text, { rotation: placed.rotation })
}

/** The dimension entity: what it measures, where its line and text are, and its block. */
function writeDimension(space: Space, layer: string, placed: PlacedDimension, block: string): void {
  const { dim } = placed
  space.start('DIMENSION', layer, 'AcDbDimension')
  const out = space.out
  out.pair(280, 0)
  out.pair(2, block)
  out.pair(3, DXF_DIMENSION_STYLE)
  if (dim.kind === 'radius' && dim.centre !== undefined) {
    // VEW-79: a radial dimension (4): its centre, the point on the curve and the leader's length
    // inside the curve; the block is this dimension's own (32).
    out.point(dim.centre)
    out.point(placed.textMiddle, 11)
    out.pair(70, 36)
    out.pair(71, 5)
    out.pair(42, num(dim.value))
    out.pair(100, 'AcDbRadialDimension')
    out.point(dim.to, 15)
    out.pair(40, num(distance(dim.from, dim.to)))
    return
  }
  out.point(add(dim.to, scale(dim.normal, dim.offset)))
  out.point(placed.textMiddle, 11)
  // Aligned (1), and the block is this dimension's own (32).
  out.pair(70, 33)
  out.pair(71, 5)
  out.pair(42, num(dim.value))
  out.pair(100, 'AcDbAlignedDimension')
  out.point(dim.from, 13)
  out.point(dim.to, 14)
}

// ── Notes, facts and the label ───────────────────────────────────────────────────────────────

/**
 * The lines of the note, each within the cap: a kind's names run on over as many lines as they
 * need, and a line never ends inside a name. A name longer than a line is cut by `dxfText`.
 */
function noteLines(leftOut: readonly LeftOutPart[]): string[] {
  const lines = [leftOutSummary(leftOut)]
  for (const { kind, parts } of leftOutByKind(leftOut)) {
    let line = kindLabel(kind, parts.length)
    let first = true
    for (const name of partNames(parts)) {
      const next = first ? name : `, ${name}`
      if (!first && dxfText(`${line}${next},`).length >= MAX_TEXT) {
        lines.push(`${line},`)
        line = `  ${name}`
      } else {
        line += next
      }
      first = false
    }
    lines.push(line)
  }
  return lines
}

/** A line of the note as a TEXT holds it: cut after a comma before `MAX_TEXT`, and carried on. */
function wrapped(line: string): string[] {
  const out: string[] = []
  let rest = line
  while (dxfText(rest).length >= MAX_TEXT) {
    const cut = rest.lastIndexOf(', ', MAX_TEXT - 2)
    if (cut <= 0) break
    out.push(rest.slice(0, cut + 1))
    rest = `  ${rest.slice(cut + 2)}`
  }
  return [...out, rest]
}

/** CNT-18: one solid run of a curved wall as one closed outline: its left face, then its right face back, each arc exact. */
function curvedRun(run: PlanCurve['runs'][number]): { points: Vec2[]; turns: number[] } {
  // The stretch from the end of one face to the start of the other is straight: a jamb or an end.
  return { points: [...run.left.points, ...run.right.points], turns: [...run.left.turns, 0, ...run.right.turns, 0] }
}

/** CNT-18: a curved dividing line, as an ARC, or a CIRCLE when it goes all the way round. */
function writeCurveLine(space: Space, layer: string, curve: PlanCurve): void {
  if (Math.abs(Math.abs(curve.sweep) - 2 * Math.PI) <= TOLERANCES.sameAngle.value) {
    space.circle(layer, curve.centre, curve.radius)
    return
  }
  const [from, to] = curve.sweep > 0 ? [curve.startAngle, curve.startAngle + curve.sweep] : [curve.startAngle + curve.sweep, curve.startAngle]
  space.arc(layer, { center: curve.centre, radius: curve.radius, from, to, counterClockwise: true })
}

/** CNT-9: one fact as the DXF writes it: where, and its words. */
interface FactLine {
  readonly at: Vec2
  readonly text: string
}

/**
 * CNT-9: the line a fact is written as: `[id] name: value`. The id ties it to its part, which a
 * reader cannot tell from a place alone; `dxfFacts` in a test reads the lines back this way.
 */
export function dxfFactText(id: string, name: string, value: string): string {
  return `[${id}] ${name}: ${value}`
}

/**
 * CNT-9: where each fact of the floor's parts goes: a room's under its tag, a wall's and an
 * opening's at its middle, and the floor's own over the drawing's upper left corner, each fact
 * one line below the one before. A room's stated number comes first, as `room number`. Parts the
 * drawing does not hold (left out, or on another floor) write none.
 */
function factLines(drawing: PlanDrawing, facts: DxfFacts | undefined, frame: Bounds, height: number): FactLine[] {
  if (facts === undefined) return []
  const lines: FactLine[] = []
  const step = height * 1.4
  const place = (id: string, at: Vec2, own: FactsOf | undefined, first = 0): void => {
    if (own === undefined) return
    const pairs: [string, string][] = []
    if (own.number !== undefined && factOf(own, ROOM_NUMBER_FACT) === undefined) pairs.push([ROOM_NUMBER_FACT, own.number])
    for (const [name, value] of Object.entries(own.properties ?? {})) pairs.push([name, factText(value)])
    pairs.forEach(([name, value], n) => lines.push({ at: { x: at.x, y: at.y - step * (first + n) }, text: dxfFactText(id, name, value) }))
  }
  const byId = new Map(facts.parts.map((part) => [part.id, part]))
  for (const room of drawing.rooms) place(room.id, room.labelAt, byId.get(room.id), 2)
  for (const wall of drawing.walls) {
    // A curved wall's facts go at the middle of its curve (CNT-18), not of its chord.
    const path = wall.curve?.path
    const [a, b] = wall.centerline
    place(wall.id, path !== undefined && path.length > 0 ? path[Math.floor(path.length / 2)]! : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, byId.get(wall.id))
  }
  for (const opening of drawing.openings) place(opening.id, { x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 }, byId.get(opening.id))
  // CNT-52: an item's facts at its middle.
  for (const item of drawing.items) place(item.id, item.at, byId.get(item.id))
  if (facts.floor !== null && writablePoints([frame.min, frame.max])) {
    const corner = { x: frame.min.x, y: frame.max.y + step * (Object.keys(facts.floor.properties ?? {}).length + 1) }
    place(facts.floor.id, corner, facts.floor)
  }
  return lines.filter((line) => writablePoints([line.at]) && dxfText(line.text).length > 0)
}

/** The words a note puts in a DXF: its text, or a symbol's name; a key has none of its own. */
function noteText(note: PlanDrawing['notes'][number]): string | null {
  if (note.kind === 'key') return null
  if (note.kind === 'symbol') return note.symbol === 'north' ? 'N' : (note.text ?? note.symbol ?? null)
  return note.text
}

/** CNT-9: what one part states of its own: its facts, and a room's number. */
export interface FactsOf {
  readonly id: string
  readonly number?: string | undefined
  readonly properties?: Readonly<Record<string, string | number | boolean>> | undefined
}

/** CNT-9: the facts of one floor's parts, and of the floor itself, for the `GRID-FACTS` layer. */
export interface DxfFacts {
  readonly parts: readonly FactsOf[]
  readonly floor: FactsOf | null
}

/**
 * CNT-9: the facts of a floor of the plan as the DXF writes them: its walls', openings' and
 * rooms' (CNT-52: and items'), and its own. A zone (CNT-8) is numbered by its room, so a number it states is not
 * written: it keeps its facts only.
 */
export function dxfFactsOf(plan: FloorPlan, floor: { readonly id: string; readonly properties?: FactsOf['properties'] } | null): DxfFacts {
  const carries = (part: FactsOf): boolean => part.number !== undefined || Object.keys(part.properties ?? {}).length > 0
  const zoneOf = plan.rooms.some((room) => room.partOf !== undefined) ? roomZones(indexPlan(plan)).zoneOf : null
  const rooms = plan.rooms.map((room): FactsOf => (zoneOf?.has(room.id) === true && room.number !== undefined ? { id: room.id, properties: room.properties } : room))
  const parts = [...plan.walls, ...plan.openings, ...rooms, ...(plan.items ?? [])].filter(carries)
  return { parts, floor: floor !== null && carries(floor) ? floor : null }
}

export interface DxfOptions {
  /** HND-6: the parts of the plan this file leaves out, named on the `GRID-LEFT-OUT` layer. */
  readonly leftOut?: readonly LeftOutPart[]
  /** CNT-9: the facts of the person's own to write on the `GRID-FACTS` layer. None when left out. */
  readonly facts?: DxfFacts
  /** HND-1: the layers, pens and scale; the neutral profile when left out. */
  readonly profile?: DxfProfile
  /** HND-1: each room's number for its tag (ARE-12, CNT-9), by room id. A room not here has none. */
  readonly roomNumbers?: ReadonlyMap<string, string>
  /** CNT-18: the curves it writes as straight pieces, named on the left-out layer. */
  readonly approximations?: Approximations
  /** VEW-72: each opening's mark, type, height and sill from the schedules, by opening id. */
  readonly openings?: ReadonlyMap<string, DxfOpeningFacts>
  /**
   * VEW-72: the scale the sheet shows the plan at, 100 for 1:100, as stated; `fit` for the largest
   * standard scale it fits at (`DXF_SHEET_SCALES`). Left out, the profile's scale when a profile is
   * given, else `fit`.
   */
  readonly scale?: number | 'fit'
}

/** VEW-72: one floor of a DXF of several: its drawing and what is written with it. */
export interface DxfFloor extends Omit<DxfOptions, 'profile' | 'scale'> {
  readonly id: string
  /** Its name on its layout and in its title: the floor's name, else its id. */
  readonly name: string
  readonly drawing: PlanDrawing
}

/** VEW-72: the scales a sheet is drawn at when none is stated, the largest first. 1:50 is drawn when stated. */
export const DXF_SHEET_SCALES = [100, 200, 500, 1000] as const

/** VEW-72: how one floor's sheet shows it. */
export interface DxfSheet {
  /** The floor's id; null for a file of one drawing (`toDxf`). */
  readonly floor: string | null
  readonly scale: number
  /** Whether the scale was stated, rather than the largest standard one the plan fits at. */
  readonly stated: boolean
  /** Whether the floor, with its dimensions, label and notes, fits the sheet's viewport at `scale`. */
  readonly fits: boolean
  /** When it does not fit, the largest standard scale it fits at; null when it fits, or fits at none. */
  readonly fitsAt: number | null
}

/** VEW-72: the viewport's size on paper, in millimetres: the sheet inside its border, above the title strip. */
const VIEWPORT_MM = { width: SHEET.width - SHEET.border * 2, height: SHEET.height - SHEET.border * 2 - SHEET.title } as const

/** VEW-72: room on paper, in millimetres, round the drawing's frame: a side, and above for the label and a floor's title. */
const FIT_MARGIN_MM = { side: 5, label: PAPER_MM.label * 3, title: PAPER_MM.title * 3 } as const

/** VEW-72: each floor after the first is moved along X by a whole number of these, in metres. */
const FLOOR_STEP = 10

/** The frame of a drawing with its dimensions, as the file frames it. */
function drawingFrame(drawing: PlanDrawing): Bounds {
  const dims = buildDimensions(drawing).filter((dim) => writablePoints([dim.from, dim.to, dim.normal]) && writable(dim.offset, dim.value) && dim.value > 0)
  return boundsWithDimensions(drawing, dims)
}

/** The lines of the note under a drawing: what it leaves out, then the curves written as straight pieces. */
function notedLines(leftOut: readonly LeftOutPart[], approximations: Approximations): string[] {
  return [...(leftOut.length === 0 ? [] : noteLines(leftOut)), ...approximationLines(approximations).flatMap(wrapped)]
}

/** VEW-72: whether a floor fits the viewport at 1:`ratio`, with room for its label, its title and its notes. */
function fitsAt(frame: Bounds, notes: number, titled: boolean, ratio: number): boolean {
  if (!writable(frame.width, frame.height) || frame.width < 0) return true
  const width = (frame.width * 1000) / ratio + FIT_MARGIN_MM.side * 2
  const height = (frame.height * 1000) / ratio + FIT_MARGIN_MM.side * 2 + FIT_MARGIN_MM.label + (titled ? FIT_MARGIN_MM.title : 0) + notes * PAPER_MM.text * 2
  return width <= VIEWPORT_MM.width && height <= VIEWPORT_MM.height
}

/**
 * VEW-72: the scale each floor's sheet shows it at, and whether it fits there. One scale for the
 * file, as a set of plans is drawn at one: the stated one, else the largest standard scale every
 * floor fits at, else the smallest standard one. A floor that does not fit says the largest
 * standard scale it would fit at.
 */
export function dxfSheets(floors: readonly Pick<DxfFloor, 'id' | 'drawing' | 'leftOut' | 'approximations'>[], scale: number | 'fit' = 'fit', single = false): DxfSheet[] {
  const titled = floors.length > 1
  const measured = floors.map((floor) => ({ id: floor.id, frame: drawingFrame(floor.drawing), notes: notedLines(floor.leftOut ?? [], floor.approximations ?? NO_APPROXIMATIONS).length }))
  const fits = (floor: (typeof measured)[number], ratio: number): boolean => fitsAt(floor.frame, floor.notes, titled, ratio)
  const stated = scale !== 'fit'
  const chosen = stated ? scale : (DXF_SHEET_SCALES.find((ratio) => measured.every((floor) => fits(floor, ratio))) ?? DXF_SHEET_SCALES[DXF_SHEET_SCALES.length - 1]!)
  return measured.map((floor) => {
    const ok = fits(floor, chosen)
    return { floor: single ? null : floor.id, scale: chosen, stated, fits: ok, fitsAt: ok ? null : (DXF_SHEET_SCALES.find((ratio) => fits(floor, ratio)) ?? null) }
  })
}

// ── The document ─────────────────────────────────────────────────────────────────────────────

/** The handles of the document's frame, given out first, in this order. */
interface Frame {
  readonly root: string
  readonly groups: string
  readonly layouts: string
  readonly modelLayout: string
  /** VEW-72: one paper layout per floor, and its paper space's record; the first is `*Paper_Space`. */
  readonly paperLayouts: readonly string[]
  readonly modelRecord: string
  readonly paperRecords: readonly string[]
  readonly tables: Readonly<Record<TableName, string>>
  readonly standardStyle: string
}

const TABLE_NAMES = ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD'] as const
type TableName = (typeof TABLE_NAMES)[number]

/** A block to define: its name, record handle, flags and what it draws. */
interface BlockDef {
  readonly name: string
  readonly record: string
  /** 1 for a dimension's own block, 2 for one with attributes to fill in. */
  readonly flags: number
  readonly draw: (space: Space) => void
  /** VEW-72: a paper space of a layout after the first: its layout, and its entities are on paper. */
  readonly layout?: string
}

/** The text style every text uses. A CAD program without the font shows its own in its place. */
const STYLE = { name: 'Standard', font: 'arial.ttf' } as const

/**
 * The drawing as a DXF document.
 *
 * Pure and total: it never throws and never reads the filesystem. Whatever the drawing could not
 * resolve is already absent from it, so a broken plan exports the part that is sound, the same
 * graceful degradation the canvases apply.
 */
export function toDxf(drawing: PlanDrawing, options: DxfOptions = {}): string {
  const { profile, scale, ...rest } = options
  return writeDxf([{ id: '', name: DXF_LAYOUT, drawing, ...rest }], profile, scale ?? (profile === undefined ? 'fit' : profile.scale), false)
}

/**
 * VEW-72: several floors as one DXF document: each floor in model space beside the one before,
 * from the first, moved along X by a whole number of `FLOOR_STEP` metres and titled with how far,
 * and each on a paper layout of its own named after it, at one scale. One floor is `toDxf`'s file.
 */
export function toDxfFloors(floors: readonly DxfFloor[], options: Pick<DxfOptions, 'profile' | 'scale'> = {}): string {
  const scale = options.scale ?? (options.profile === undefined ? 'fit' : options.profile.scale)
  return writeDxf(floors, options.profile, scale, floors.length > 1)
}

/** VEW-72: a floor's name as a layout's: no character a CAD program keeps for itself, once each. */
function layoutNames(floors: readonly DxfFloor[], several: boolean): string[] {
  if (!several) return [DXF_LAYOUT]
  const taken = new Set<string>(['MODEL'])
  return floors.map((floor) => {
    const clean = (text: string): string => dxfText(text).replace(/[<>/\\":;?*|=,\x60]/g, '-').trim().slice(0, 200)
    const base = clean(floor.name) || clean(floor.id) || 'Floor'
    let name = base
    for (let n = 2; taken.has(name.toUpperCase()); n++) name = `${base} (${n})`
    taken.add(name.toUpperCase())
    return name
  })
}

function writeDxf(floors: readonly DxfFloor[], given: DxfProfile | undefined, scale: number | 'fit', several: boolean): string {
  const sheets = dxfSheets(floors, scale, !several)
  const profile: DxfProfile = { ...(given ?? NEUTRAL_DXF_PROFILE), scale: sheets[0]?.scale ?? (scale === 'fit' ? DXF_SHEET_SCALES[0] : scale) }
  const handles = new Handles()
  const metres = (mm: number): number => (mm * profile.scale) / 1000
  const size = Object.fromEntries(Object.entries(PAPER_MM).map(([key, mm]) => [key, metres(mm)])) as Doc['size']

  // One spelling per layer, whatever case the categories that share it give it.
  const spelling = new Map<string, string>()
  const layerOf = Object.fromEntries(
    DXF_CATEGORIES.map((category) => {
      const name = profile.pens[category].layer
      if (!spelling.has(name.toUpperCase())) spelling.set(name.toUpperCase(), name)
      return [category, spelling.get(name.toUpperCase())!]
    })
  ) as Record<DxfCategory, string>

  const doc: Doc = { handles, profile, layerOf, used: new Map(), size, style: STYLE.name }
  doc.used.set('0', { name: '0', pen: { layer: '0', colour: 7, lineweight: -1, linetype: 'continuous' } })

  const frame: Frame = {
    root: handles.take(),
    groups: handles.take(),
    layouts: handles.take(),
    modelLayout: handles.take(),
    paperLayouts: floors.map(() => handles.take()),
    modelRecord: handles.take(),
    paperRecords: floors.map(() => handles.take()),
    tables: Object.fromEntries(TABLE_NAMES.map((name) => [name, handles.take()])) as Record<TableName, string>,
    standardStyle: handles.take()
  }

  // What the drawing needs as blocks: the openings', the room tag and one per dimension.
  const openings = openingBlocks(floors.map((floor) => ({ drawing: floor.drawing, facts: floor.openings })))
  const names = blockNames(openings.blocks)
  const dims = floors.map((floor) => placedDimensions(floor.drawing, size))
  const blocks: BlockDef[] = openings.blocks.map((block) => ({ name: names.get(block.key)!, record: handles.take(), flags: 2, draw: (space) => drawOpeningBlock(space, block) }))
  // CNT-20: each fixture and piece of furniture, one block per entry and size.
  const items = itemBlocks(floors.map((floor) => floor.drawing))
  for (const block of items.blocks) blocks.push({ name: items.names.get(block.key)!, record: handles.take(), flags: 0, draw: (space) => drawItemBlock(space, block) })
  const tag = { number: { x: 0, y: size.name * 1.4 }, name: { x: 0, y: 0 }, area: { x: 0, y: -size.name * 1.4 } }
  if (floors.some((floor) => floor.drawing.rooms.length > 0)) {
    blocks.push({
      name: DXF_ROOM_TAG.block,
      record: handles.take(),
      flags: 2,
      draw: (space) => {
        space.attributeDefinition({ tag: DXF_ROOM_TAG.number, prompt: 'Room number', at: tag.number, height: size.text })
        space.attributeDefinition({ tag: DXF_ROOM_TAG.name, prompt: 'Room name', at: tag.name, height: size.name })
        space.attributeDefinition({ tag: DXF_ROOM_TAG.area, prompt: 'Room area', at: tag.area, height: size.text })
      }
    })
  }
  let counted = 0
  const dimBlocks = dims.map((placed) => placed.map((one): BlockDef => ({ name: `*D${++counted}`, record: handles.take(), flags: 1, draw: (space) => drawDimensionBlock(space, one) })))
  for (const block of dimBlocks.flat()) blocks.push(block)

  // The frame round everything each floor's model draws, for the label, the note, the extents and the view.
  const planFrames = floors.map((floor, k) => boundsWithDimensions(floor.drawing, dims[k]!.map((placed) => placed.dim)))

  const blocksOut = new Out()
  writeBlocks(blocksOut, doc, frame, blocks)

  // VEW-72: each floor in model space, a floor after the first moved along X past the one before.
  const entities = new Out()
  const extents: Bounds[] = []
  const gap = size.label * 8
  floors.forEach((floor, k) => {
    const before = extents[k - 1]
    const step = before === undefined || !writablePoints([before.max, planFrames[k]!.min]) ? 0 : Math.max(0, Math.ceil((before.max.x + gap - planFrames[k]!.min.x) / FLOOR_STEP) * FLOOR_STEP)
    const shift = { x: step, y: 0 }
    const title = !several ? null : step === 0 ? english(said('dxf.floor.title', { floor: sayName(floor.name) })) : english(said('dxf.floor.moved', { floor: sayName(floor.name), dx: sayNum(metresText(step, 0)) }))
    const facts = factLines(floor.drawing, floor.facts, planFrames[k]!, size.text)
    entities.shift = shift
    const model = new Space(doc, entities, frame.modelRecord)
    const extent = writeModel(model, floor.drawing, { leftOut: floor.leftOut ?? [], approximations: floor.approximations ?? NO_APPROXIMATIONS, facts, frame: planFrames[k]!, places: openings.places[k]!, names, items: { places: items.places[k]!, names: items.names }, dims: dims[k]!, dimBlocks: dimBlocks[k]!, tag, numbers: floor.roomNumbers, title })
    entities.shift = { x: 0, y: 0 }
    extents.push(computeBounds([add(extent.min, shift), add(extent.max, shift)]))
  })
  const layouts = layoutNames(floors, several)
  const sheetTitle = (k: number): string => (several ? english(said('dxf.sheet.floor', { floor: sayName(floors[k]!.name), scale: profile.scale })) : `Scale 1:${profile.scale} on A3`)
  const paper = new Space(doc, entities, frame.paperRecords[0]!, true)
  writePaper(paper, extents[0]!, sheetTitle(0), sheets[0]!)
  // VEW-72: the layouts after the first, each its paper space's block.
  const paperBlocks: BlockDef[] = floors.slice(1).map((_, n) => ({ name: `*Paper_Space${n}`, record: frame.paperRecords[n + 1]!, flags: 0, layout: frame.paperLayouts[n + 1]!, draw: (space) => void writePaper(space, extents[n + 1]!, sheetTitle(n + 1), sheets[n + 1]!) }))
  writeBlocks(blocksOut, doc, frame, paperBlocks, false)
  const extent = computeBounds(extents.flatMap((e) => [e.min, e.max]).filter((p) => writablePoints([p])))

  const objects = new Out()
  writeObjects(objects, frame, extent, layouts)

  const tables = new Out()
  writeTables(tables, doc, frame, [...blocks, ...paperBlocks], extent)

  const header = new Out()
  writeHeader(header, doc, extent)

  const out = new Out()
  section(out, 'HEADER', header)
  section(out, 'CLASSES', classes())
  section(out, 'TABLES', tables)
  section(out, 'BLOCKS', blocksOut)
  section(out, 'ENTITIES', entities)
  section(out, 'OBJECTS', objects)
  out.pair(0, 'EOF')
  return `${out.lines.join('\r\n')}\r\n`
}

function section(out: Out, name: string, body: Out): void {
  out.pair(0, 'SECTION')
  out.pair(2, name)
  // One at a time: a large plan's section has more lines than a call takes arguments.
  for (const line of body.lines) out.lines.push(line)
  out.pair(0, 'ENDSEC')
}

/** The classes the objects use: the layout. */
function classes(): Out {
  const out = new Out()
  out.pair(0, 'CLASS')
  out.pair(1, 'LAYOUT')
  out.pair(2, 'AcDbLayout')
  out.pair(3, 'ObjectDBX Classes')
  out.pair(90, 0)
  out.pair(91, 2)
  out.pair(280, 0)
  out.pair(281, 0)
  return out
}

interface ModelParts {
  readonly leftOut: readonly LeftOutPart[]
  readonly approximations: Approximations
  readonly facts: readonly FactLine[]
  readonly frame: Bounds
  readonly places: readonly OpeningPlace[]
  readonly names: ReadonlyMap<string, string>
  readonly items: { readonly places: readonly ItemPlace[]; readonly names: ReadonlyMap<string, string> }
  readonly dims: readonly PlacedDimension[]
  readonly dimBlocks: readonly BlockDef[]
  readonly tag: Readonly<Record<'number' | 'name' | 'area', Vec2>>
  readonly numbers: ReadonlyMap<string, string> | undefined
  /** VEW-72: a floor's title above its drawing, in a file of several floors; null in a file of one. */
  readonly title: string | null
}

/** Model space, back to front, as the 2D plan draws it. Returns the box round what it drew. */
function writeModel(space: Space, drawing: PlanDrawing, parts: ModelParts): Bounds {
  const { size } = space.doc
  const points: Vec2[] = [parts.frame.min, parts.frame.max]

  // Rooms first, so their outlines sit under the walls. A room's holes (ARE-6) follow its outline
  // on the same layer, each a closed outline of its own, so a hatch made from them leaves each
  // hole open.
  for (const room of drawing.rooms) {
    const layer = space.layer('rooms')
    space.polyline(layer, room.polygon, true)
    for (const hole of room.holes) space.polyline(layer, hole, true)
  }

  // CNT-12: each fixture's symbol as the 2D plan draws it. CNT-20: as its block, inserted at its
  // middle and turned as the plan turns it.
  // CNT-55: one hung above the cut on the dashed layer, and a labelled kind's label at its middle.
  for (const place of parts.items.places) {
    space.insert(space.layer(place.raised ? 'fixtures-above' : 'fixtures'), parts.items.names.get(place.key)!, place.at, place.rotation)
    if (place.label !== null) space.text(space.layer(place.raised ? 'fixtures-above' : 'fixtures'), place.at, place.label, size.fact)
  }

  // Each wall: its fill, then its outlines over the fill, one closed outline per solid run
  // between its openings, with its corners joined (SHT-2). A dividing line has no substance: it
  // is a single line (C3). A wall that borders no room goes with the interior walls.
  //
  // CNT-10: in a plan with phases each wall goes on its phase's layer: a wall to be demolished as
  // its dashed outline with no fill, a new one with its fill on a layer of its own.
  // VEW-54: the straight walls that touch on one layer are one outline and one hatch, as a
  // drafter draws them, so no mitre line crosses a corner or a junction. A curved wall keeps its
  // own runs (its faces are true arcs).
  const joined = new Map<string, { fill: string | null; layer: string; slices: Vec2[][] }>()
  for (const wall of drawing.walls) {
    if (wall.virtual) {
      // CNT-18: a curved dividing line is a true arc, or a circle all the way round.
      const lineLayer = space.layer(wall.phase === 'demolished' ? 'walls-demolished' : 'dividing-lines')
      if (wall.curve !== undefined) writeCurveLine(space, lineLayer, wall.curve)
      else space.line(lineLayer, wall.centerline[0], wall.centerline[1])
      continue
    }
    if (wall.slices.length === 0) continue
    const fill = wall.phase === 'demolished' ? null : space.layer(wall.phase === 'new' ? 'wall-fill-new' : 'wall-fill')
    const layer = space.layer(
      wall.phase === 'demolished' ? 'walls-demolished' : wall.phase === 'new' ? 'walls-new' : wall.phase === 'existing' ? 'walls-existing' : wall.exposure === 'exterior' ? 'walls-outside' : 'walls-inside'
    )
    // CNT-18: a curved wall's runs, fill and outline, with their faces as true arcs.
    if (wall.curve !== undefined) {
      const runs = wall.curve.runs.map(curvedRun)
      if (fill !== null) space.hatch(fill, runs.map((run) => run.points), runs.map((run) => run.turns))
      for (const run of runs) space.polyline(layer, run.points, true, run.turns)
      continue
    }
    const key = `${layer}\n${fill ?? ''}`
    const group = joined.get(key) ?? { fill, layer, slices: [] }
    group.slices.push(...wall.slices)
    joined.set(key, group)
  }
  for (const { fill, layer, slices } of joined.values()) {
    // Rounded to the shell grid first, so two faces drawn to meet are one edge for the join.
    const steps = Math.round(1 / TOLERANCES.shellGrid.value)
    const snapped = slices.map((slice) => ringOf(slice.map((p) => ({ x: Math.round(p.x * steps) / steps, y: Math.round(p.y * steps) / steps }))))
    const pieces = slices.length > 1 ? cutOutline('union', [snapped[0]!], snapped.slice(1).map((ring) => [ring])) : null
    const outlines = pieces === null ? slices.map((slice) => ({ outline: slice, holes: [] as Vec2[][] })) : piecesAsRings(pieces)
    for (const { outline, holes } of outlines) {
      if (fill !== null) space.hatch(fill, [outline, ...holes])
      for (const ring of [outline, ...holes]) space.polyline(layer, ring, true)
    }
  }

  // CNT-16: each column, cut through as a wall is: filled, then its outline; a round one a true
  // circle, as two half-circle turns.
  for (const column of drawing.columns ?? []) {
    const layer = space.layer('columns')
    if (column.radius !== undefined) {
      const ends = [{ x: column.centre.x - column.radius, y: column.centre.y }, { x: column.centre.x + column.radius, y: column.centre.y }]
      space.hatch(layer, [ends], [[1, 1]])
      space.polyline(layer, ends, true, [1, 1])
    } else {
      space.hatch(layer, [column.outline])
      space.polyline(layer, column.outline, true)
    }
  }

  // CNT-16: each structural grid's lines, chain lines, with the line's name in a circle past each
  // end. Its spacing is with the other dimensions.
  for (const grid of drawing.grids ?? []) {
    const layer = space.layer('structural-grid')
    const r = size.text
    for (const line of grid.lines) {
      // WRT-83: a radial grid's ring is its pieces, named past its ends' own ways.
      if (line.path === undefined) space.line(layer, line.from, line.to)
      else for (let i = 0; i + 1 < line.path.length; i++) space.line(layer, line.path[i]!, line.path[i + 1]!)
      const ends = [[line.from, line.along], ...(line.namedAt === 'from' ? [] : [[line.to, line.outTo ?? scale(line.along, -1)]])] as const
      for (const [end, way] of ends) {
        const centre = add(end, scale(way, r))
        space.circle(layer, centre, r)
        space.text(layer, sub(centre, { x: 0, y: size.text / 2 }), line.name, size.text)
        points.push(add(centre, { x: r, y: r }), sub(centre, { x: r, y: r }))
      }
    }
  }

  // The openings, each its block on its kind's layer. VEW-72: with its mark shown beside it, and
  // its type, width, height and sill kept as attributes.
  for (const place of parts.places) {
    const layer = space.layer(place.kind === 'door' ? 'doors' : place.kind === 'window' ? 'windows' : 'openings')
    const turn = (place.rotation * Math.PI) / 180
    const local = markPoint(place.block, size)
    const markAt = { x: place.at.x + local.x * Math.cos(turn) - local.y * Math.sin(turn), y: place.at.y + local.x * Math.sin(turn) + local.y * Math.cos(turn) }
    const attributes = (Object.keys(DXF_OPENING_ATTRIBUTES) as (keyof typeof DXF_OPENING_ATTRIBUTES)[]).map((field): Attribute =>
      field === 'mark' ? { tag: DXF_OPENING_ATTRIBUTES.mark, value: place.values.mark, at: markAt, height: size.text } : { tag: DXF_OPENING_ATTRIBUTES[field], value: place.values[field], at: place.at, height: size.text, invisible: true })
    space.insert(layer, parts.names.get(place.key)!, place.at, place.rotation, attributes)
  }

  // CNT-10: each opening to be demolished, as the dashed outline across its wall where it stood.
  for (const opening of drawing.openings) {
    if (opening.phase !== 'demolished' || !writablePoints([opening.from, opening.to]) || !writable(opening.thickness)) continue
    const half = scale(opening.normal, opening.thickness / 2)
    space.polyline(space.layer('openings-demolished'), [add(opening.from, half), add(opening.to, half), sub(opening.to, half), sub(opening.from, half)], true)
  }

  // A tag in each room: its number above its name, its area below.
  for (const room of drawing.rooms) {
    const at = room.labelAt
    if (!writablePoints([at])) continue
    const value = (tag: string, words: string, offset: Vec2, height: number): Attribute => ({ tag, value: words, at: add(at, offset), height })
    space.insert(space.layer('room-tags'), DXF_ROOM_TAG.block, at, 0, [
      value(DXF_ROOM_TAG.number, parts.numbers?.get(room.id) ?? '', parts.tag.number, size.text),
      value(DXF_ROOM_TAG.name, room.name, parts.tag.name, size.name),
      value(DXF_ROOM_TAG.area, writable(room.area) ? `${areaText(room.area)} m²` : '', parts.tag.area, size.text)
    ])
  }

  // SHT-4: the dimensions.
  parts.dims.forEach((placed, n) => writeDimension(space, space.layer('dimensions'), placed, parts.dimBlocks[n]!.name))

  // SHT-7: the sketch layer, each category on a layer of its own, and the notes' words.
  for (const item of drawing.sketch) {
    const layer = sketchLayer(item.category, space.doc.layerOf.sketch)
    space.use(layer, space.doc.profile.pens.sketch)
    space.polyline(layer, item.points, item.closed)
    // CMD-26: an arc that goes all the way round is a circle: written as an ARC it starts and ends at one angle.
    if (item.arc) {
      if (Math.abs(Math.abs(item.arc.to - item.arc.from) - 2 * Math.PI) <= TOLERANCES.sameAngle.value) space.circle(layer, item.arc.center, item.arc.radius)
      else space.arc(layer, item.arc)
    }
    if (item.text) space.text(layer, item.text.at, item.text.text, size.text)
  }
  for (const note of drawing.notes) {
    const text = noteText(note)
    if (text !== null && note.at) space.text(space.layer('notes'), note.at, text, size.text)
  }

  // HND-6: the note, one text per line, from a line below the frame's lower left corner. CNT-18:
  // the curves written as straight pieces follow what is left out, on the same layer.
  const min = writablePoints([parts.frame.min]) ? parts.frame.min : { x: 0, y: 0 }
  const noted = notedLines(parts.leftOut, parts.approximations)
  for (const [n, line] of noted.entries()) {
    const at = { x: min.x, y: min.y - size.text * 2 * (n + 1) }
    space.text(space.layer('left-out'), at, line, size.text, { centred: false })
    points.push(at)
  }

  // CNT-9: the facts, on their layer, left-aligned.
  for (const line of parts.facts) {
    space.text(space.layer('facts'), line.at, line.text, size.fact, { centred: false })
    points.push(line.at)
  }

  // MSG-3: the label, centred above the frame, where whoever opens the file reads it first. It is
  // written last, so it is drawn over everything else.
  const { min: low, max: high } = parts.frame
  const labelAt = { x: (low.x + high.x) / 2, y: high.y + size.label * 2 }
  space.text(space.layer('label'), labelAt, GENERAL_GUIDANCE_LABEL, size.label)
  points.push({ x: labelAt.x, y: labelAt.y + size.label })

  // VEW-72: in a file of several floors, the floor's title over its label, saying where it was moved.
  if (parts.title !== null && writablePoints([low])) {
    const titleAt = { x: low.x, y: high.y + size.label * 2 + size.title * 2 }
    space.text(space.layer('label'), titleAt, parts.title, size.title, { centred: false })
    points.push({ x: titleAt.x, y: titleAt.y + size.title })
  }

  return computeBounds(points.filter((p) => writablePoints([p])))
}

/** The viewport onto the model: its middle and size on the sheet, and the model it shows. */
interface View {
  readonly centre: Vec2
  readonly width: number
  readonly height: number
  readonly target: Vec2
  /** How tall the piece of the model it shows is, in metres. */
  readonly modelHeight: number
}

/**
 * The paper layout: an A3 sheet across in millimetres, its border, one viewport showing the model
 * at the profile's scale round the middle of what it drew, and the scale and label under it.
 */
function writePaper(space: Space, extent: Bounds, heading: string, shown: DxfSheet): View {
  const { scale: ratio } = space.doc.profile
  const { width, height, border, title: strip } = SHEET
  const view: View = {
    centre: { x: width / 2, y: (height + strip) / 2 },
    width: width - border * 2,
    height: height - border * 2 - strip,
    target: { x: (extent.min.x + extent.max.x) / 2, y: (extent.min.y + extent.max.y) / 2 },
    modelHeight: ((height - border * 2 - strip) * ratio) / 1000
  }
  const viewports = space.layer('viewport')
  // The first viewport of a layout is the sheet itself; the second shows the model.
  writeViewport(space, viewports, 1, { centre: { x: width / 2, y: height / 2 }, width, height, target: { x: width / 2, y: height / 2 }, modelHeight: height }, false)
  writeViewport(space, viewports, 2, view, true)
  const layer = space.layer('sheet')
  space.polyline(layer, [{ x: border, y: border }, { x: width - border, y: border }, { x: width - border, y: height - border }, { x: border, y: height - border }], true)
  space.polyline(layer, [{ x: border, y: border + strip }, { x: width - border, y: border + strip }], false)
  space.text(layer, { x: border + PAPER_MM.title, y: border + strip / 2 - PAPER_MM.title / 2 }, heading, PAPER_MM.title, { centred: false })
  space.text(layer, { x: width / 2, y: border + strip / 2 - PAPER_MM.text / 2 }, GENERAL_GUIDANCE_LABEL, PAPER_MM.text)
  // VEW-72: a plan that does not fit says so on its sheet, and the scale it fits at.
  if (!shown.fits) {
    const smallest = DXF_SHEET_SCALES[DXF_SHEET_SCALES.length - 1]!
    const fit = shown.fitsAt !== null ? ` ${english(said('drawing.export.dxf.fitsAt', { scale: shown.fitsAt }))}` : ratio < smallest ? ` ${english(said('drawing.export.dxf.fitsNone', { scale: smallest }))}` : ''
    space.text(layer, { x: border + PAPER_MM.title, y: border + strip + PAPER_MM.title }, `${english(said('drawing.export.dxf.notFit.plan', { scale: ratio }))}${fit}`, PAPER_MM.text, { centred: false })
  }
  return view
}

function writeViewport(space: Space, layer: string, id: number, view: View, locked: boolean): void {
  space.start('VIEWPORT', layer, 'AcDbViewport')
  const out = space.out
  out.point(view.centre)
  out.pair(40, num(view.width))
  out.pair(41, num(view.height))
  out.pair(68, id)
  out.pair(69, id)
  out.point(view.target, 12, false)
  out.point({ x: 0, y: 0 }, 13, false)
  out.point({ x: 1, y: 1 }, 14, false)
  out.point({ x: 1, y: 1 }, 15, false)
  out.pair(16, num(0))
  out.pair(26, num(0))
  out.pair(36, num(1))
  out.point({ x: 0, y: 0 }, 17)
  out.pair(42, num(50))
  out.pair(43, num(0))
  out.pair(44, num(0))
  out.pair(45, num(view.modelHeight))
  out.pair(50, num(0))
  out.pair(51, num(0))
  out.pair(72, 1000)
  // Always on (32768), and the model viewport's scale locked (16384) so it keeps the stated one.
  out.pair(90, locked ? 49152 : 32768)
  out.pair(1, '')
  out.pair(281, 0)
  out.pair(71, 1)
  out.pair(74, 0)
  out.point({ x: 0, y: 0 }, 110)
  out.point({ x: 1, y: 0 }, 111)
  out.point({ x: 0, y: 1 }, 112)
  out.pair(79, 0)
  out.pair(146, num(0))
  out.pair(170, 0)
}

/** The blocks, after the model's and the first paper space's when `spaces` is set. */
function writeBlocks(out: Out, doc: Doc, frame: Frame, blocks: readonly BlockDef[], spaces = true): void {
  const one = (name: string, record: string, flags: number, paper: boolean, draw?: (space: Space) => void): void => {
    const begin = new Space(doc, out, record, paper)
    begin.start('BLOCK', '0', 'AcDbBlockBegin')
    out.pair(2, name)
    out.pair(70, flags)
    out.point({ x: 0, y: 0 })
    out.pair(3, name)
    out.pair(1, '')
    draw?.(new Space(doc, out, record, paper))
    begin.start('ENDBLK', '0', 'AcDbBlockEnd')
  }
  if (spaces) {
    one('*Model_Space', frame.modelRecord, 0, false)
    one('*Paper_Space', frame.paperRecords[0]!, 0, true)
  }
  for (const block of blocks) one(block.name, block.record, block.flags, block.layout !== undefined, block.draw)
}

/** A table's start: its handle, no owner, and how many records follow. */
function tableHead(out: Out, name: TableName, handle: string, count: number): void {
  out.pair(0, 'TABLE')
  out.pair(2, name)
  out.pair(5, handle)
  out.pair(330, 0)
  out.pair(100, 'AcDbSymbolTable')
  out.pair(70, count)
  if (name === 'DIMSTYLE') out.pair(100, 'AcDbDimStyleTable')
}

/** The line types: the three every drawing has, and those a layer uses, in metres in the model. */
function lineTypes(doc: Doc): { name: string; description: string; pattern: number[] }[] {
  const mm = (value: number): number => (value * doc.profile.scale) / 1000
  const patterns: Record<DxfLinetype, { description: string; pattern: number[] }> = {
    continuous: { description: 'Solid line', pattern: [] },
    dashed: { description: 'Dashed __ __ __', pattern: [mm(PAPER_MM.dash), -mm(PAPER_MM.gap2)] },
    dotted: { description: 'Dotted . . . .', pattern: [0, -mm(PAPER_MM.dot)] },
    'dash-dot': { description: 'Dash dot __ . __ .', pattern: [mm(PAPER_MM.dash), -mm(PAPER_MM.dot), 0, -mm(PAPER_MM.dot)] }
  }
  const used = new Set([...doc.used.values()].map((layer) => layer.pen.linetype))
  return [
    { name: 'ByBlock', description: '', pattern: [] },
    { name: 'ByLayer', description: '', pattern: [] },
    ...(Object.keys(DXF_LINETYPES) as DxfLinetype[]).filter((type) => type === 'continuous' || used.has(type)).map((type) => ({ name: DXF_LINETYPES[type], ...patterns[type] }))
  ]
}

/** The layers, in the order of the categories, the sketch's after them, `0` first. */
function layerList(doc: Doc): { name: string; pen: DxfPen }[] {
  const all = [...doc.used.values()]
  const rank = (name: string): number => {
    const at = DXF_CATEGORIES.findIndex((category) => doc.layerOf[category].toUpperCase() === name.toUpperCase())
    return name === '0' ? -1 : at === -1 ? DXF_CATEGORIES.length : at
  }
  return all.map((layer, n) => ({ layer, n })).sort((a, b) => rank(a.layer.name) - rank(b.layer.name) || a.n - b.n).map(({ layer }) => layer)
}

function writeTables(out: Out, doc: Doc, frame: Frame, blocks: readonly BlockDef[], extent: Bounds): void {
  const { tables } = frame
  const take = (): string => doc.handles.take()

  // The view the model opens in: the whole drawing.
  tableHead(out, 'VPORT', tables.VPORT, 1)
  out.record('VPORT', take(), tables.VPORT, 'AcDbViewportTableRecord', '*ACTIVE')
  out.point({ x: 0, y: 0 }, 10, false)
  out.point({ x: 1, y: 1 }, 11, false)
  out.point({ x: (extent.min.x + extent.max.x) / 2, y: (extent.min.y + extent.max.y) / 2 }, 12, false)
  out.point({ x: 0, y: 0 }, 13, false)
  out.point({ x: 1, y: 1 }, 14, false)
  out.point({ x: 1, y: 1 }, 15, false)
  out.pair(16, num(0))
  out.pair(26, num(0))
  out.pair(36, num(1))
  out.point({ x: 0, y: 0 }, 17)
  out.pair(40, num(Math.max(extent.height, extent.width / 1.5, 1) * 1.1))
  out.pair(41, num(1.5))
  out.pair(42, num(50))
  for (const code of [43, 44, 50, 51]) out.pair(code, num(0))
  for (const [code, value] of [[71, 0], [72, 1000], [73, 1], [74, 3], [75, 0], [76, 0], [77, 0], [78, 0], [281, 0], [65, 1]] as const) out.pair(code, value)
  out.point({ x: 0, y: 0 }, 110)
  out.point({ x: 1, y: 0 }, 111)
  out.point({ x: 0, y: 1 }, 112)
  out.pair(79, 0)
  out.pair(146, num(0))
  out.pair(0, 'ENDTAB')

  const types = lineTypes(doc)
  tableHead(out, 'LTYPE', tables.LTYPE, types.length)
  for (const type of types) {
    out.record('LTYPE', take(), tables.LTYPE, 'AcDbLinetypeTableRecord', type.name)
    out.pair(3, type.description)
    // 65 is the alignment code, "A", the only one there is.
    out.pair(72, 65)
    out.pair(73, type.pattern.length)
    out.pair(40, num(type.pattern.reduce((sum, length) => sum + Math.abs(length), 0)))
    // A positive length is a dash, a negative one a gap, zero a dot.
    for (const length of type.pattern) {
      out.pair(49, num(length))
      out.pair(74, 0)
    }
  }
  out.pair(0, 'ENDTAB')

  const layers = layerList(doc)
  tableHead(out, 'LAYER', tables.LAYER, layers.length)
  for (const { name, pen } of layers) {
    out.record('LAYER', take(), tables.LAYER, 'AcDbLayerTableRecord', name)
    out.pair(62, pen.colour)
    out.pair(6, DXF_LINETYPES[pen.linetype])
    // In hundredths of a millimetre; -3 is the drawing's default, for layer 0.
    out.pair(370, pen.lineweight < 0 ? -3 : Math.round(pen.lineweight * 100))
    if (name === doc.layerOf.viewport) out.pair(290, 0)
  }
  out.pair(0, 'ENDTAB')

  tableHead(out, 'STYLE', tables.STYLE, 1)
  out.record('STYLE', frame.standardStyle, tables.STYLE, 'AcDbTextStyleTableRecord', STYLE.name)
  out.pair(40, num(0))
  out.pair(41, num(1))
  out.pair(50, num(0))
  out.pair(71, 0)
  out.pair(42, num(doc.size.name))
  out.pair(3, STYLE.font)
  out.pair(4, '')
  out.pair(0, 'ENDTAB')

  tableHead(out, 'VIEW', tables.VIEW, 0)
  out.pair(0, 'ENDTAB')
  tableHead(out, 'UCS', tables.UCS, 0)
  out.pair(0, 'ENDTAB')

  tableHead(out, 'APPID', tables.APPID, 1)
  out.record('APPID', take(), tables.APPID, 'AcDbRegAppTableRecord', 'ACAD')
  out.pair(0, 'ENDTAB')

  // Every drawing has a Standard dimension style; Grid's draws ticks, metres to two places, the
  // text above the line and along it, sized for the scale.
  tableHead(out, 'DIMSTYLE', tables.DIMSTYLE, 2)
  out.record('DIMSTYLE', take(), tables.DIMSTYLE, 'AcDbDimStyleTableRecord', 'Standard', 105)
  out.pair(340, frame.standardStyle)
  const { size } = doc
  out.record('DIMSTYLE', take(), tables.DIMSTYLE, 'AcDbDimStyleTableRecord', DXF_DIMENSION_STYLE, 105)
  const dimvars: [number, string | number][] = [
    [40, num(1)], [41, num(size.tick)], [42, num(size.extensionGap)], [44, num(size.extensionPast)],
    [73, 0], [74, 0], [77, 1], [78, 0], [140, num(size.text)], [141, num(0)], [142, num(size.tick)],
    [144, num(1)], [147, num(size.gap)], [271, 2], [277, 2], [278, 46], [340, frame.standardStyle]
  ]
  for (const [code, value] of dimvars) out.pair(code, value)
  out.pair(0, 'ENDTAB')

  const records: [string, string, string][] = [['*Model_Space', frame.modelRecord, frame.modelLayout], ['*Paper_Space', frame.paperRecords[0]!, frame.paperLayouts[0]!], ...blocks.map((b): [string, string, string] => [b.name, b.record, b.layout ?? '0'])]
  tableHead(out, 'BLOCK_RECORD', tables.BLOCK_RECORD, records.length)
  for (const [name, record, layout] of records) {
    out.head('BLOCK_RECORD', record, tables.BLOCK_RECORD)
    out.pair(100, 'AcDbSymbolTableRecord')
    out.pair(100, 'AcDbBlockTableRecord')
    out.pair(2, name)
    out.pair(340, layout)
    // Metres for the blocks drawn in them, explodable, scaled as one.
    out.pair(70, DXF_METRES)
    out.pair(280, 1)
    out.pair(281, 0)
  }
  out.pair(0, 'ENDTAB')
}

/** The root dictionary, the groups and the layouts: the model's and one per name in `layouts`, in order. */
function writeObjects(out: Out, frame: Frame, extent: Bounds, layouts: readonly string[]): void {
  out.head('DICTIONARY', frame.root, '0')
  out.pair(100, 'AcDbDictionary')
  out.pair(281, 1)
  out.pair(3, 'ACAD_GROUP')
  out.pair(350, frame.groups)
  out.pair(3, 'ACAD_LAYOUT')
  out.pair(350, frame.layouts)

  out.pair(0, 'DICTIONARY')
  out.pair(5, frame.groups)
  out.reactors(frame.root)
  out.pair(330, frame.root)
  out.pair(100, 'AcDbDictionary')
  out.pair(281, 1)

  out.pair(0, 'DICTIONARY')
  out.pair(5, frame.layouts)
  out.reactors(frame.root)
  out.pair(330, frame.root)
  out.pair(100, 'AcDbDictionary')
  out.pair(281, 1)
  out.pair(3, 'Model')
  out.pair(350, frame.modelLayout)
  layouts.forEach((name, k) => {
    out.pair(3, name)
    out.pair(350, frame.paperLayouts[k]!)
  })

  const { width, height } = SHEET
  writeLayout(out, frame, { handle: frame.modelLayout, record: frame.modelRecord, name: 'Model', order: 0, flags: 1712, limits: [extent.min, extent.max], extent })
  layouts.forEach((name, k) => {
    writeLayout(out, frame, { handle: frame.paperLayouts[k]!, record: frame.paperRecords[k]!, name, order: k + 1, flags: 688, limits: [{ x: 0, y: 0 }, { x: width, y: height }], extent: computeBounds([{ x: 0, y: 0 }, { x: width, y: height }]) })
  })
}

interface LayoutParts {
  readonly handle: string
  readonly record: string
  readonly name: string
  readonly order: number
  /** Its plot settings' flags: Grid writes AutoCAD's usual ones for a model and for a sheet. */
  readonly flags: number
  readonly limits: readonly [Vec2, Vec2]
  readonly extent: Bounds
}

/** A layout and its plot settings: A3 across in millimetres, the sheet plotted 1:1. */
function writeLayout(out: Out, frame: Frame, layout: LayoutParts): void {
  out.pair(0, 'LAYOUT')
  out.pair(5, layout.handle)
  out.reactors(frame.layouts)
  out.pair(330, frame.layouts)
  out.pair(100, 'AcDbPlotSettings')
  out.pair(1, '')
  out.pair(2, 'none_device')
  out.pair(4, 'ISO_full_bleed_A3_(420.00_x_297.00_MM)')
  out.pair(6, '')
  for (const code of [40, 41, 42, 43]) out.pair(code, num(0))
  out.pair(44, num(SHEET.width))
  out.pair(45, num(SHEET.height))
  for (const code of [46, 47, 48, 49, 140, 141]) out.pair(code, num(0))
  out.pair(142, num(1))
  out.pair(143, num(1))
  out.pair(70, layout.flags)
  out.pair(72, 1)
  out.pair(73, 0)
  out.pair(74, 5)
  out.pair(7, '')
  out.pair(75, 16)
  out.pair(147, num(1))
  out.pair(76, 0)
  out.pair(77, 2)
  out.pair(78, 300)
  out.pair(148, num(0))
  out.pair(149, num(0))
  out.pair(100, 'AcDbLayout')
  out.pair(1, layout.name)
  out.pair(70, 1)
  out.pair(71, layout.order)
  out.point(layout.limits[0], 10, false)
  out.point(layout.limits[1], 11, false)
  out.point({ x: 0, y: 0 }, 12)
  out.point(layout.extent.min, 14)
  out.point(layout.extent.max, 15)
  out.pair(146, num(0))
  out.point({ x: 0, y: 0 }, 13)
  out.point({ x: 1, y: 0 }, 16)
  out.point({ x: 0, y: 1 }, 17)
  out.pair(76, 0)
  out.pair(330, layout.record)
}

function writeHeader(out: Out, doc: Doc, extent: Bounds): void {
  const variable = (name: string, code: number, value: string | number): void => {
    out.pair(9, name)
    out.pair(code, value)
  }
  const point = (name: string, at: Vec2, z = true): void => {
    out.pair(9, name)
    out.point(at, 10, z)
  }
  variable('$ACADVER', 1, DXF_VERSION)
  // Text is UTF-8 in this version; the code page is the one a reader falls back to for names.
  variable('$DWGCODEPAGE', 3, 'ANSI_1252')
  point('$INSBASE', { x: 0, y: 0 })
  point('$EXTMIN', extent.min)
  point('$EXTMAX', extent.max)
  point('$LIMMIN', extent.min, false)
  point('$LIMMAX', extent.max, false)
  variable('$LTSCALE', 40, num(1))
  // Dashes keep their model length in the sheet's viewport, which the scale makes right on paper.
  variable('$PSLTSCALE', 70, 0)
  variable('$TEXTSTYLE', 7, STYLE.name)
  variable('$CLAYER', 8, '0')
  variable('$DIMSTYLE', 2, DXF_DIMENSION_STYLE)
  // Decimal lengths to the millimetre, in metres, metric.
  variable('$LUNITS', 70, 2)
  variable('$LUPREC', 70, 3)
  variable('$INSUNITS', 70, DXF_METRES)
  variable('$MEASUREMENT', 70, 1)
  // Line weights shown on screen, as they print.
  variable('$LWDISPLAY', 290, 1)
  variable('$TILEMODE', 70, 1)
  variable('$HANDSEED', 5, doc.handles.seed)
}
