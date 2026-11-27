/**
 * How a plan looks: its named looks, their colours, line widths and typeface, as final values.
 *
 * A look (SHT-1) is a named set of values that the one drawing function, `planScene`, applies
 * to the same geometry. Nothing here measures the plan: a look only says how each part the
 * core works out is drawn.
 *
 * - `working`: the screen and every picture an agent gets. The app's colours, clear labels and
 *   strong contrast, with lines in screen pixels.
 * - `technical`: sheets and files to hand on. Black on white, cut walls outlined heaviest with a
 *   grey tone inside, windows as a break in the wall with two face lines and a glass line, and a
 *   door with no stated swing marked as undecided, and dimensions with 45-degree ticks and
 *   their numbers along the line (SHT-4). Its lines are in millimetres on paper, from a pen set
 *   chosen by the output scale (1:50, 1:100 or 1:200).
 * - `dark`: the working look on dark paper, as the app's dark theme. A screen look only: a picture
 *   written to a file or handed to an agent is always drawn on light paper (`fileLook`, SHT-10).
 * - `simple` and `large` (VEW-76): a picture a person sees, in the working look's colours, drawn
 *   for reading (`forPeople`); `large` is its large-print form.
 *
 * SHT-10's refinements are options of each look: walls drawn by kind (`walls`: outside, inside and
 * partition each with its own fill and, on paper, its own pen), what lies above the plan's cut
 * dashed (`aboveDashed`), the detail a drawing at 1:50 or larger shows (`detail`: each wall
 * material's hatch, door and window frames, a window's two panes and its sills), and the tints a
 * drawing coloured by room use or floor finish fills its rooms with (`tints`), which the key then
 * lists. Every colour a look draws text or a symbol in is held to a contrast ratio against what it
 * is drawn on (`contrast.ts`, `lookPairs`).
 *
 * The app's stylesheets (`plan-tokens.css`, `canvas2d/plan.css`) say the working look again in
 * CSS. A test reads both sheets and checks every value here against them, so a restyle that
 * changes one and not the other fails.
 *
 * Pure: no DOM.
 */
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'
import type { WallDrawnKind } from '@ongrid/floorplan/geometry'
import { relativeLuminance } from './contrast'

/** A look's colours. */
export interface PlanLook {
  readonly paper: string
  readonly room: string
  readonly outdoorRoom?: string
  readonly edge?: string
  readonly wall: string
  readonly wallExterior: string
  /** SHT-10: an inside wall's fill, where it differs from `wall` (the ink); `wall` when left out. */
  readonly wallInside?: string
  /** SHT-10: a partition's fill; the inside wall's when left out. */
  readonly wallPartition?: string
  readonly virtual: string
  readonly window: string
  readonly label: string
  readonly labelSoft: string
  readonly dimension: string
  readonly dimensionSoft: string
  readonly dimensionText: string
  readonly dimensionSoftText: string
  readonly warning: string
  /** A CSS font-family list. The first one installed is used. */
  readonly font: string
}

/**
 * Sans-serif faces found on macOS, Windows and most Linux machines, in that order. The app
 * uses its own `--font-sans`, which a picture cannot see.
 */
export const PICTURE_FONT = "Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"

/** The light theme, from `plan-tokens.css`. */
export const LIGHT_LOOK: PlanLook = {
  paper: '#ffffff',
  room: '#f2efe7',
  outdoorRoom: '#e6eee1',
  edge: '#657363',
  wall: '#232320',
  wallExterior: '#121210',
  // SHT-10: the inside walls a mid grey and the partitions lighter, so the outside walls read
  // apart from them; the soft lines and text darker, to hold their contrast on every room fill.
  wallInside: '#57544e',
  wallPartition: '#827e75',
  virtual: '#817e75',
  window: '#dce9f2',
  label: '#232320',
  labelSoft: '#66635c',
  dimension: '#6f6c63',
  dimensionSoft: '#817e75',
  dimensionText: '#4a483f',
  dimensionSoftText: '#66635c',
  warning: '#a14a17',
  font: PICTURE_FONT
}

/** The dark theme, from `plan-tokens.css`. */
export const DARK_LOOK: PlanLook = {
  paper: '#15150f',
  room: '#23201a',
  outdoorRoom: '#263027',
  edge: '#a1b39b',
  wall: '#ddd8cc',
  wallExterior: '#f3f1ec',
  wallInside: '#aea9a2',
  wallPartition: '#847d72',
  virtual: '#817a70',
  window: '#22323d',
  label: '#ddd8cc',
  labelSoft: '#9f988e',
  dimension: '#a9a598',
  dimensionSoft: '#817a70',
  dimensionText: '#c9c4b6',
  dimensionSoftText: '#9f988e',
  warning: '#f2a774',
  font: PICTURE_FONT
}

/**
 * Line widths and dashes in screen pixels, from `plan.css`. The app keeps them at this size
 * whatever the zoom with `vector-effect: non-scaling-stroke`; a picture has one zoom, so it
 * writes them in metres instead (pixels times metres per pixel).
 */
export const LINE_PX = {
  virtual: 1.5,
  edge: 1,
  virtualDash: [7, 5],
  opening: 1,
  jamb: 1,
  /** A step between rooms at different levels (LVL-7). */
  step: 1.5,
  /** A stair's flights, landings, risers and walking line (LVL-3), its break line and a lift's cross (SHT-11). */
  stair: 0.75,
  /** SHT-11: the outline of the floor above, dashed. */
  above: 1,
  /** SHT-11: the dashes of what lies above the cut: the floor above, and a stair past its break line. */
  aboveDash: [4, 3],
  /** A fixture's symbol (CNT-12). */
  fixture: 0.75,
  doorLeaf: 1.5,
  doorArc: 0.75,
  dimension: 1,
  extension: 0.75,
  /** The dash of a room's dimension line. */
  roomDimensionDash: [3, 3],
  /** The warning dot's ring. Drawn inside a group already scaled to pixels. */
  warningRing: 1.5,
  /** The halo behind a warning's text. Drawn inside a group already scaled to pixels. */
  warningHalo: 4,
  /** The box round the walls of a room that could not be drawn (MSG-8). */
  undrawn: 1.5,
  /** SHT-7: a sketch line, drawn only. */
  sketch: 1,
  undrawnDash: [6, 4]
} as const

/** How much of the warning colour tints the box of a room that could not be drawn. */
export const UNDRAWN_TINT = 0.1

/**
 * SHT-7: a room's fill by its use, when a drawing is coloured by use: pale, so the walls, the
 * text and the marks stay readable on them in every look.
 */
export const USE_FILLS: Readonly<Record<RoomUse, string>> = {
  bedroom: '#dfe8f3',
  living: '#f4ead2',
  dining: '#f2e1d3',
  kitchen: '#e3efd9',
  bathroom: '#d8eeee',
  // CNT-5: the uses past homes, each near its group's colour and as pale.
  toilet: '#d5e9ec',
  utility: '#e6eadc',
  study: '#efe6d6',
  office: '#e8e6f2',
  meeting: '#e2e2f0',
  reception: '#eee7ef',
  retail: '#f3e4e4',
  classroom: '#e4eddf',
  treatment: '#dcecf0',
  waiting: '#e8eff1',
  sport: '#e1ecdf',
  changing: '#dde9e5',
  staff: '#efe9dd',
  worship: '#f1e6da',
  assembly: '#ebe2ea',
  corridor: '#ecebe6',
  stair: '#e5e0ee',
  // LVL-3: a lift shaft, beside the stair's colour.
  lift: '#e0e3ec',
  storage: '#e9e4dc',
  plant: '#e4e2de',
  parking: '#e7e7e3',
  platform: '#e6e8ee',
  concourse: '#e9e9e4',
  ticketing: '#ece8ee',
  checkin: '#e8eaee',
  security: '#efe4e1',
  gate: '#e4e8ee',
  ward: '#dcebf0',
  operating: '#d6e8ec',
  anteroom: '#e3eef0',
  gallery: '#ede6ec',
  auditorium: '#e8dfe8',
  stage: '#eae0e8',
  foyer: '#efe9ee',
  library: '#ece6d8',
  cafe: '#f2e6d8',
  bar: '#f1e0d6',
  breakout: '#e9f0dc',
  print: '#e5e5ea',
  comms: '#e0e4ea',
  phonebooth: '#e4e6f1',
  focus: '#e3e8f2',
  wellbeing: '#dfeee6',
  training: '#e6ecdc',
  lab: '#dcecee',
  cleanroom: '#e1f0f2',
  cell: '#e8e3e1',
  prep: '#eee9d9',
  other: '#f0f0ee'
}

/**
 * SHT-10: the room fills by use on dark paper: each use's hue from `USE_FILLS`, dark, so the
 * light text and walls of the dark look hold their contrast on them.
 */
export const DARK_USE_FILLS: Readonly<Record<RoomUse, string>> = {
  bedroom: '#162334',
  living: '#3a2b07',
  dining: '#3c230e',
  kitchen: '#233514',
  bathroom: '#0e2f2f',
  toilet: '#0e2c31',
  utility: '#272d18',
  study: '#352810',
  office: '#201d2f',
  meeting: '#1d1d32',
  reception: '#271d29',
  retail: '#331d1d',
  classroom: '#222f1a',
  treatment: '#122a30',
  waiting: '#1c2629',
  sport: '#20301d',
  changing: '#1a2c26',
  staff: '#302715',
  worship: '#352513',
  assembly: '#291c28',
  corridor: '#28261f',
  stair: '#221a2f',
  lift: '#1d212f',
  storage: '#2d261a',
  plant: '#28251f',
  parking: '#262620',
  platform: '#1e2128',
  concourse: '#272722',
  ticketing: '#26212a',
  checkin: '#1f2229',
  security: '#33211d',
  gate: '#1c2229',
  ward: '#122b32',
  operating: '#0f272c',
  anteroom: '#17292c',
  gallery: '#2a1f29',
  auditorium: '#281b27',
  stage: '#2d1c28',
  foyer: '#2a2229',
  library: '#2f2814',
  cafe: '#352512',
  bar: '#34200f',
  breakout: '#27341a',
  print: '#232329',
  comms: '#1b2029',
  phonebooth: '#20213a',
  focus: '#1c2236',
  wellbeing: '#173023',
  training: '#252f17',
  lab: '#122c30',
  cleanroom: '#10303a',
  cell: '#2a2321',
  prep: '#302b14',
  other: '#252522'
}

/**
 * SHT-10: the room fills by floor finish, one per finish the plan names, in the order its rooms
 * first name them; past the last, they start again. Pale, as the fills by use are.
 */
export const FINISH_FILLS: readonly string[] = ['#efe4cf', '#e1eaf2', '#e6efdc', '#f2e4e4', '#e9e5f2', '#f3ebd3', '#dfefea', '#efe7de']

/** SHT-10: the room fills by floor finish on dark paper. */
export const DARK_FINISH_FILLS: readonly string[] = ['#3a290a', '#172531', '#253216', '#321d1d', '#221c2f', '#382c08', '#172f27', '#312517']

/**
 * CNT-9: the colours a drawing picks parts out in, from the tool server's `highlight` and
 * `colour` by a field: one per value, in turn, strong enough to read on a wall or a door and
 * laid over a room's fill at half strength. `HIGHLIGHT` is the one colour of parts picked out.
 */
export const GROUP_COLOURS: readonly string[] = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f']
export const HIGHLIGHT_COLOUR = '#e4572e'

/** Font sizes in screen pixels, from `plan.css`. */
export const TEXT_PX = {
  roomName: 13,
  roomArea: 11,
  dimension: 11,
  roomDimension: 10,
  warning: 12,
  /** The number on a fault mark (MSG-8). */
  faultNumber: 10,
  /** SHT-7: sketch text, notes and tags, and the title under the drawing. */
  sketch: 11,
  note: 12,
  title: 18,
  /** CNT-16: a structural grid line's name, in its circle. */
  gridName: 11,
  /** CNT-19: a parking bay's number, and a ramp's slope. */
  bayNumber: 10,
  siteLabel: 10,
  rampSlope: 10
} as const

/** CNT-16: the radius of the circle a structural grid line's name is written in, in screen pixels. */
export const GRID_BUBBLE_PX = 10

/** A length for an attribute: short, and the same on every machine. */
export function lengthText(value: number): string {
  return String(Number(value.toPrecision(4)))
}

/** The parts of the drawing a look gives a line width. */
export type LinePart =
  | 'wallOutline'
  | 'virtual'
  | 'edge'
  | 'opening'
  | 'jamb'
  | 'step'
  | 'fixture'
  /** A stair's flights, landings, risers and walking line (LVL-3), its break line and a lift's cross (SHT-11). */
  | 'stair'
  /** SHT-11: the outline of the floor above. */
  | 'above'
  | 'doorLeaf'
  | 'doorArc'
  | 'dimension'
  /** The 45-degree tick at each end of a dimension line, in a look that draws one (SHT-4). */
  | 'tick'
  | 'extension'
  | 'windowFace'
  | 'glass'
  | 'undecided'
  /** BRF-3: the plot's boundary, its street edges, and the site's things (fences, gates, paths, paving, pools, trees). */
  | 'boundary'
  | 'street'
  | 'site'
  /**
   * LVL-8: a facade's lines, heaviest first: the ground, the outline of the facade against the sky,
   * the edges of the faces on its front plane, of the faces set back, of the faces further back,
   * and its doors and windows and the floor-level marks.
   */
  | 'elevationGround'
  | 'elevationOutline'
  | 'elevationNear'
  | 'elevationBack'
  | 'elevationFar'
  | 'elevationOpening'
  | 'elevationLevel'
  /** LVL-9: the hatching over what a section takes that the plan does not state. */
  | 'hatch'
  /** LVL-9: a section's cut line on the plan, and the marks for elevations and levels. */
  | 'mark'
  /** CNT-10: the dashed outline of a wall or an opening to be demolished. */
  | 'demolished'
  /** CNT-16: a column's outline, cut through as a wall is. */
  | 'column'
  /** CNT-16: a structural grid's chain lines and the circles its names are written in. */
  | 'grid'
  /** SHT-10: a door's or window's frame, on a drawing in detail. */
  | 'frame'
  /** SHT-10: a window's sill, on a drawing in detail. */
  | 'sill'

/** The parts of the drawing a look gives a dash pattern. */
export type DashPart = 'virtual' | 'roomDimension' | 'undecided' | 'above' | 'chain' | 'boundary' | 'demolished'

/** Lines for the screen: widths and dashes in screen pixels, whatever the zoom. */
export interface ScreenLines {
  readonly unit: 'px'
  readonly widths: Readonly<Record<LinePart, number>>
  readonly dashes: Readonly<Record<DashPart, readonly number[]>>
}

/** The output scales a paper look has a pen set for: 1:50, 1:100 and 1:200. */
export const PAPER_SCALES = [50, 100, 200] as const
export type PaperScale = (typeof PAPER_SCALES)[number]

/** The pens of a paper look, heaviest first. */
export type Pen = 'cut' | 'medium' | 'fine' | 'finest'

/**
 * Lines for paper: each part is drawn with one pen, and each output scale has its own pen set,
 * in millimetres on the paper. Dashes are millimetres on the paper too.
 */
export interface PaperLines {
  readonly unit: 'mm'
  readonly pens: Readonly<Record<PaperScale, Readonly<Record<Pen, number>>>>
  readonly pen: Readonly<Record<LinePart, Pen>>
  readonly dashes: Readonly<Record<DashPart, readonly number[]>>
}

/** A named look: every value the drawing function needs to draw a plan one way. */
export interface Look {
  readonly name: string
  readonly colors: PlanLook
  readonly lines: ScreenLines | PaperLines
  /** The colour of the thin lines: door leaves, swings, jambs, steps and window lines. */
  readonly ink: string
  /**
   * The colour of the heavy outline round every cut wall, with the wall's own colour as a tone
   * inside it; `null` draws walls solid, with no outline.
   */
  readonly wallOutline: string | null
  /** Windows as a break in the wall, bridged by two face lines and a glass line, not a tint. */
  readonly glass: boolean
  /** A door with no stated hinge or swing gets its own "undecided" mark, not a plain gap. */
  readonly undecidedDoors: boolean
  /**
   * Dimensions as a drawing gives them (SHT-4): a 45-degree tick at each end of the line and
   * the number along it. Otherwise plain ends and the number upright, as on screen.
   */
  readonly draftedDimensions: boolean
  /** CNT-10: how a plan with phases draws each phase (`PhaseLook`). */
  readonly phases: PhaseLook
  /** BRF-3: the site's colours: the plot and what is on it, drawn in their own style, never as walls or rooms. */
  readonly site: SiteColors
  /** SHT-10: how each kind of wall is drawn (`wallDrawnKind` in the core). */
  readonly walls: WallKindsLook
  /** SHT-10: what lies above the plan's cut drawn dashed: a stair past its cut, a symbol's line overhead, a high window. */
  readonly aboveDashed: boolean
  /** SHT-10: the detail drawn at 1:50 or larger, or null for none at any scale. */
  readonly detail: DetailLook | null
  /** SHT-10: the room fills of a drawing coloured by room use or by floor finish. */
  readonly tints: TintLook
  /**
   * VEW-76: a look for a picture a person sees, not a drawing to check: rooms coloured by use,
   * each label with its size and area in two units, the overall sizes only (none in large print),
   * the floor's total under the drawing, and none of the check's notes. Left out on every other look.
   */
  readonly forPeople?: PeopleLook
}

/** VEW-76: how a look for people reads. `large` is the large-print form: big names and no dimensions. */
export interface PeopleLook {
  readonly large: boolean
}

/**
 * SHT-10: how each kind of wall reads. `fill` is the wall's fill (a tone inside the outline, in a
 * look that outlines its walls); `pen` the pen of the outline round it, in a paper look that
 * outlines its walls. A wall's phase (CNT-10), where the look gives one, fills it instead.
 */
export interface WallKindsLook {
  readonly fill: Readonly<Record<WallDrawnKind, string>>
  readonly pen?: Readonly<Record<WallDrawnKind, Pen>>
}

/**
 * SHT-10: the detail a drawing at a large scale shows: each wall material's hatch (CNT-15's wall
 * types), a door's and a window's frames, a window's glass as two panes and its sills. The core
 * works each out (`hatchLines`, `openingDetail`); the look only says when, and how.
 */
export interface DetailLook {
  /**
   * The smallest scale it is drawn at, as N in 1:N: a drawing whose pen set (`penSetFor`) is this
   * scale's, or a larger scale's, shows it.
   */
  readonly from: PaperScale
  /** How far apart a hatch's lines are, in millimetres on paper. */
  readonly hatchSpacing: number
  /**
   * Each material's hatch, in turn by `planWallMaterials`: the angles of its lines, in degrees
   * counter-clockwise from the plan's x. Past the last, they start again.
   */
  readonly hatches: readonly (readonly number[])[]
}

/** SHT-10: the room fills of a drawing coloured by use (`uses`) or by floor finish (`finishes`, in turn). */
export interface TintLook {
  readonly uses: Readonly<Record<RoomUse, string>>
  readonly finishes: readonly string[]
}

/** BRF-3: how the site is drawn in a look. A fill of `none` leaves the paper. */
export interface SiteColors {
  readonly boundary: string
  readonly street: string
  readonly fence: string
  readonly gate: string
  readonly pathFill: string
  readonly pathEdge: string
  readonly pavingFill: string
  readonly pavingEdge: string
  readonly poolFill: string
  readonly poolEdge: string
  readonly treeFill: string
  readonly treeEdge: string
}

/** BRF-3: the site in the light theme: earth and green, soft beside the walls. */
export const LIGHT_SITE: SiteColors = {
  boundary: '#8a6a3c',
  street: '#4a483f',
  fence: '#75726a',
  gate: '#4a483f',
  pathFill: '#ebe5d6',
  // SHT-10: the edges darker, to hold their contrast on the paper and on their own fills.
  pathEdge: '#86827a',
  pavingFill: '#e2ded3',
  pavingEdge: '#827e75',
  poolFill: '#cfe5f1',
  poolEdge: '#467694',
  treeFill: '#dce9cf',
  treeEdge: '#577a40'
}

/** BRF-3: the site in the dark theme. */
export const DARK_SITE: SiteColors = {
  boundary: '#c9a46b',
  street: '#c9c4b6',
  fence: '#8a8175',
  gate: '#c9c4b6',
  pathFill: '#2b2820',
  pathEdge: '#857c6e',
  pavingFill: '#302c24',
  pavingEdge: '#8a8172',
  poolFill: '#1d3542',
  poolEdge: '#6c9fc0',
  treeFill: '#22301b',
  treeEdge: '#7fa566'
}

/** BRF-3: the site in black on white: lines in black and greys, the pool and the paving a pale tone. */
export const TECHNICAL_SITE: SiteColors = {
  boundary: '#000000',
  street: '#000000',
  fence: '#000000',
  gate: '#000000',
  pathFill: '#ffffff',
  pathEdge: '#595959',
  pavingFill: '#f2f2f2',
  pavingEdge: '#595959',
  poolFill: '#e6e6e6',
  poolEdge: '#000000',
  treeFill: 'none',
  treeEdge: '#3c3c3c'
}

/**
 * CNT-10: how a plan with phases is drawn, as a demolition and new-work drawing is: what is to be
 * demolished as a dashed outline with no fill, what stays in a tone, and what is new filled
 * solid. A fill that is `null` is the wall's own, as a plan with no phases draws it.
 */
export interface PhaseLook {
  /** The fill of an existing wall, or null for the wall's own. */
  readonly existing: string | null
  /** The fill of a new wall, or null for the wall's own. */
  readonly new: string | null
  /** The dashed outline of a wall or an opening to be demolished. */
  readonly demolished: string
}

/** The names a look is chosen by. */
export const LOOK_NAMES = ['working', 'technical', 'dark', 'simple', 'large'] as const
export type LookName = (typeof LOOK_NAMES)[number]

/**
 * LVL-8: a facade's lines on screen, in pixels, heaviest first: the ground, the facade's outline,
 * then each face's edges lighter the further back it stands. Grid's own choice; the app draws no
 * facade, so no stylesheet says them again.
 */
export const ELEVATION_PX = {
  ground: 3,
  outline: 2,
  near: 1.25,
  back: 0.75,
  far: 0.5,
  opening: 0.75,
  level: 0.75
} as const

/**
 * CNT-10: the dashed outline of what is to be demolished, on screen, in pixels. Grid's own choice;
 * the app's stylesheet does not say it again, as it draws the outline only through this tree.
 */
export const DEMOLISHED_PX = { width: 1.25, dash: [6, 4] } as const

/** The working look's lines: `LINE_PX`, the app's own, and the parts only other looks draw. */
const SCREEN_LINES: ScreenLines = {
  unit: 'px',
  widths: {
    wallOutline: 0,
    virtual: LINE_PX.virtual,
    edge: LINE_PX.edge,
    opening: LINE_PX.opening,
    jamb: LINE_PX.jamb,
    step: LINE_PX.step,
    fixture: LINE_PX.fixture,
    stair: LINE_PX.stair,
    above: LINE_PX.above,
    doorLeaf: LINE_PX.doorLeaf,
    doorArc: LINE_PX.doorArc,
    dimension: LINE_PX.dimension,
    tick: LINE_PX.dimension,
    extension: LINE_PX.extension,
    windowFace: LINE_PX.opening,
    glass: LINE_PX.opening,
    undecided: LINE_PX.opening,
    // BRF-3: the plot's boundary a long dash and a dot, its street edges heavier, the site's things fine.
    boundary: 2,
    street: 4,
    site: 1,
    elevationGround: ELEVATION_PX.ground,
    elevationOutline: ELEVATION_PX.outline,
    elevationNear: ELEVATION_PX.near,
    elevationBack: ELEVATION_PX.back,
    elevationFar: ELEVATION_PX.far,
    elevationOpening: ELEVATION_PX.opening,
    elevationLevel: ELEVATION_PX.level,
    // LVL-9: the section's hatch and the marks on a plan, which the app does not draw, so plan.css
    // has none. A section's ground, what it sees beyond and its level marks are LVL-8's parts.
    hatch: 0.75,
    mark: 1,
    demolished: DEMOLISHED_PX.width,
    // CNT-16: a column and a structural grid, which the app draws only through this tree, so
    // plan.css has none.
    column: 1,
    grid: 0.75,
    // SHT-10: the detail only paper draws, so plan.css has none.
    frame: 0.75,
    sill: 0.75
  },
  dashes: { virtual: LINE_PX.virtualDash, roomDimension: LINE_PX.roomDimensionDash, undecided: [4, 3], above: LINE_PX.aboveDash, boundary: [12, 3, 2, 3], chain: [12, 3, 2, 3], demolished: DEMOLISHED_PX.dash }
}

/**
 * The technical look's pens, in millimetres on paper: Grid's own choice from the usual pen
 * sizes, four weights, one step finer for each halving of the scale.
 */
export const PAPER_PENS: PaperLines['pens'] = {
  50: { cut: 0.7, medium: 0.35, fine: 0.25, finest: 0.18 },
  100: { cut: 0.5, medium: 0.25, fine: 0.18, finest: 0.13 },
  200: { cut: 0.35, medium: 0.18, fine: 0.13, finest: 0.1 }
}

const PAPER_LINES: PaperLines = {
  unit: 'mm',
  pens: PAPER_PENS,
  pen: {
    wallOutline: 'cut',
    virtual: 'fine',
    edge: 'finest',
    opening: 'fine',
    jamb: 'fine',
    step: 'medium',
    fixture: 'finest',
    stair: 'finest',
    above: 'fine',
    doorLeaf: 'medium',
    doorArc: 'finest',
    dimension: 'finest',
    tick: 'fine',
    extension: 'finest',
    windowFace: 'fine',
    glass: 'fine',
    undecided: 'fine',
    boundary: 'medium',
    street: 'cut',
    site: 'finest',
    // LVL-8: a facade: the ground with the cut pen, the outline with the medium one, the front
    // plane fine and what stands back finest, as an elevation is drawn.
    elevationGround: 'cut',
    elevationOutline: 'medium',
    elevationNear: 'fine',
    elevationBack: 'finest',
    elevationFar: 'finest',
    elevationOpening: 'finest',
    elevationLevel: 'finest',
    hatch: 'finest',
    mark: 'fine',
    // CNT-10: what is to be demolished, dashed with the medium pen.
    demolished: 'medium',
    // CNT-16: a column is cut, as a wall is; a structural grid's lines and circles are finest.
    column: 'cut',
    grid: 'finest',
    // SHT-10: a frame and a sill fine, the material hatch (`hatch`) finest.
    frame: 'fine',
    sill: 'finest'
  },
  dashes: { virtual: [2, 1.2], roomDimension: [0.8, 0.8], undecided: [1, 0.8], above: [1.5, 1], boundary: [5, 1, 0.6, 1], chain: [6, 1.5, 0.8, 1.5], demolished: [2, 1] }
}

/** Black on white: the technical look's colours. Walls are a grey tone inside a black outline. */
export const TECHNICAL_COLORS: PlanLook = {
  paper: '#ffffff',
  room: '#ffffff',
  outdoorRoom: '#f2f2f2',
  edge: '#595959',
  wall: '#8c8c8c',
  // SHT-10: the outside walls a darker tone than the inside ones, a partition the palest.
  wallExterior: '#595959',
  wallInside: '#8c8c8c',
  wallPartition: '#c8c8c8',
  virtual: '#595959',
  window: '#ffffff',
  label: '#000000',
  labelSoft: '#3c3c3c',
  dimension: '#000000',
  dimensionSoft: '#595959',
  dimensionText: '#000000',
  dimensionSoftText: '#3c3c3c',
  warning: '#000000',
  font: PICTURE_FONT
}

/** SHT-10: each kind of wall's fill from a look's colours: the outside walls', the inside walls' and the partitions'. */
export function wallFillsOf(colors: PlanLook): WallKindsLook['fill'] {
  const inside = colors.wallInside ?? colors.wall
  return { outside: colors.wallExterior, inside, partition: colors.wallPartition ?? inside }
}

/** SHT-10: the light tints, by use (SHT-7) and by floor finish. */
const LIGHT_TINTS: TintLook = { uses: USE_FILLS, finishes: FINISH_FILLS }

/** The screen and every picture an agent gets: the app's light theme. */
export const WORKING_LOOK: Look = {
  name: 'working',
  colors: LIGHT_LOOK,
  lines: SCREEN_LINES,
  ink: LIGHT_LOOK.wall,
  wallOutline: null,
  glass: false,
  undecidedDoors: false,
  draftedDimensions: false,
  // CNT-10: what stays in a mid tone, the new walls as walls are drawn, the demolished dashed in ink.
  phases: { existing: '#7f7a70', new: null, demolished: LIGHT_LOOK.wall },
  site: LIGHT_SITE,
  walls: { fill: wallFillsOf(LIGHT_LOOK) },
  aboveDashed: true,
  // SHT-10: the screen is not paper: it draws no detail at any zoom.
  detail: null,
  tints: LIGHT_TINTS
}

/** The working look on dark paper: the app's dark theme. A screen look: a file is never drawn in it (`fileLook`). */
export const DARK_WORKING_LOOK: Look = {
  ...WORKING_LOOK,
  name: 'dark',
  colors: DARK_LOOK,
  ink: DARK_LOOK.wall,
  site: DARK_SITE,
  phases: { existing: '#867e70', new: null, demolished: DARK_LOOK.wall },
  walls: { fill: wallFillsOf(DARK_LOOK) },
  tints: { uses: DARK_USE_FILLS, finishes: DARK_FINISH_FILLS }
}

/** Sheets and files to hand on: black on white, with lines in millimetres on paper. */
export const TECHNICAL_LOOK: Look = {
  name: 'technical',
  colors: TECHNICAL_COLORS,
  lines: PAPER_LINES,
  ink: '#000000',
  wallOutline: '#000000',
  glass: true,
  undecidedDoors: true,
  draftedDimensions: true,
  // CNT-10: what stays in the grey tone walls have, the new walls filled black, the demolished dashed.
  phases: { existing: null, new: '#000000', demolished: '#000000' },
  site: TECHNICAL_SITE,
  // SHT-10: outside and inside walls outlined with the cut pen, a partition with the medium one;
  // each a tone of its own inside.
  walls: { fill: wallFillsOf(TECHNICAL_COLORS), pen: { outside: 'cut', inside: 'cut', partition: 'medium' } },
  aboveDashed: true,
  // SHT-10: at 1:50 and larger, hatches 1.5 mm apart: diagonal one way, the other way, crossed,
  // then level, upright and squared, for each material in turn.
  detail: { from: 50, hatchSpacing: 1.5, hatches: [[45], [-45], [45, -45], [0], [90], [0, 90]] },
  tints: LIGHT_TINTS
}

/**
 * VEW-76: a picture to show a person: the working look's colours and lines, drawn for reading
 * rather than checking (`PeopleLook`).
 */
export const SIMPLE_LOOK: Look = { ...WORKING_LOOK, name: 'simple', forPeople: { large: false } }

/** VEW-76: the large-print form of the simple look: names drawn large where they fit, no dimensions. */
export const LARGE_LOOK: Look = { ...WORKING_LOOK, name: 'large', forPeople: { large: true } }

export const LOOKS: Readonly<Record<LookName, Look>> = {
  working: WORKING_LOOK,
  technical: TECHNICAL_LOOK,
  dark: DARK_WORKING_LOOK,
  simple: SIMPLE_LOOK,
  large: LARGE_LOOK
}

/** SHT-10: the named looks a file is drawn in: those on light paper (`fileLook`). `dark` is the screen's only. */
export const FILE_LOOK_NAMES: readonly LookName[] = LOOK_NAMES.filter((name) => fileLook(LOOKS[name]) === LOOKS[name])

/** Colours of your own, drawn the working way. */
export function lookWithColors(colors: PlanLook): Look {
  return { ...WORKING_LOOK, name: 'custom', colors, ink: colors.wall, walls: { fill: wallFillsOf(colors) } }
}

/**
 * SHT-10: the look a picture written to a file or handed to an agent is drawn in. A file is always
 * on light paper, whatever the screen's theme: a look on dark paper (the dark look, or colours of
 * your own on a dark paper) gives the working look; any other is itself.
 */
export function fileLook(look: Look): Look {
  return relativeLuminance(look.colors.paper) < 0.5 ? WORKING_LOOK : look
}

/**
 * SHT-10: whether a drawing in this look, at this zoom and output scale, shows the look's detail:
 * a paper look whose pen set for the scale is its detail's scale or a larger one.
 */
export function detailShown(look: Look, metresPerPixel: number, paperScale?: number): boolean {
  if (look.detail === null || look.lines.unit !== 'mm') return false
  return penSetFor(paperScale ?? paperScaleOf(metresPerPixel)) <= look.detail.from
}

/**
 * SHT-10: the width of the outline round a wall of this kind, in plan metres: twice its pen (the
 * wall's fill covers the inner half), the kind's own pen in a paper look that gives one.
 */
export function wallOutlineMetres(look: Look, kind: WallDrawnKind, metresPerPixel: number, paperScale?: number): number {
  const { lines } = look
  const pen = look.walls.pen?.[kind]
  if (lines.unit === 'px' || pen === undefined) return 2 * lineMetres(look, metresPerPixel, paperScale).width('wallOutline')
  const scale = paperScale ?? paperScaleOf(metresPerPixel)
  return (2 * lines.pens[penSetFor(scale)][pen] * scale) / 1000
}

/** SHT-10: how far apart a detail's hatch lines are, in plan metres, at this zoom and output scale. */
export function hatchSpacingMetres(look: Look, metresPerPixel: number, paperScale?: number): number {
  if (look.detail === null) return 0
  return (look.detail.hatchSpacing * (paperScale ?? paperScaleOf(metresPerPixel))) / 1000
}

/** How long a CSS pixel is on paper, in millimetres: 96 to the inch. */
export const PX_MM = 25.4 / 96

/**
 * The scale a picture is drawn at, as N in 1:N, when each of its pixels is a CSS pixel on paper
 * and measures `metresPerPixel` of the plan.
 */
export function paperScaleOf(metresPerPixel: number): number {
  return (metresPerPixel * 1000) / PX_MM
}

/**
 * The pen set for a scale: the one of 1:50, 1:100 and 1:200 it is nearest to, by ratio, so 1:70
 * draws with the 1:50 pens and 1:150 with the 1:200 pens.
 */
export function penSetFor(scale: number): PaperScale {
  if (scale <= Math.sqrt(50 * 100)) return 50
  if (scale <= Math.sqrt(100 * 200)) return 100
  return 200
}

/** Every line width and dash of a look, in plan metres, for one zoom and output scale. */
export interface LineMetres {
  readonly width: (part: LinePart) => number
  readonly dash: (part: DashPart) => readonly number[]
}

/**
 * A look's line widths and dashes in plan metres. A screen look's pixels are times the metres
 * per pixel; a paper look's millimetres are times the scale, read from the pen set for it.
 * `paperScale` is N in 1:N; left out, it is the picture's own (`paperScaleOf`).
 */
export function lineMetres(look: Look, metresPerPixel: number, paperScale?: number): LineMetres {
  const { lines } = look
  if (lines.unit === 'px') {
    return {
      width: (part) => lines.widths[part] * metresPerPixel,
      dash: (part) => lines.dashes[part].map((value) => value * metresPerPixel)
    }
  }
  const scale = paperScale ?? paperScaleOf(metresPerPixel)
  const pens = lines.pens[penSetFor(scale)]
  const metres = (mm: number): number => (mm * scale) / 1000
  return {
    width: (part) => metres(pens[lines.pen[part]]),
    dash: (part) => lines.dashes[part].map(metres)
  }
}

/** A look by itself, or colours of your own, which are drawn the working way. */
export function toLook(look: Look | PlanLook): Look {
  return 'colors' in look ? look : lookWithColors(look)
}
