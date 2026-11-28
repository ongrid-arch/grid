/**
 * SHT-23: the elevations and the sections of a client or check sheet. Pure: no file, no canvas.
 *
 * Grid chooses where the sections are cut, as the plan states no section of its own: section A
 * runs along the building's longer side and section B across it, each through the largest room
 * of the lowest floor, moved off any wall that runs along the line, from a metre outside the
 * building to a metre outside it on the other side. Every floor's plan on the sheet marks both.
 *
 * Every side of the building and both sections are drawn at one scale, the largest usual one at
 * which each fits its place on its page, so they print true on A3 and can be measured against
 * each other. The pictures are the viewer's own (`facadePicture`, `sectionPicture`), and nothing
 * here works out a face or a cut: this only decides how large each picture is and where it goes.
 * A pixel is `DRAWING_PIXEL_PT` points on every one of them, so their words print alike.
 *
 * A section is drawn without the band under its picture: its name goes under it on the page
 * (`SECTION_NAME_PT`), and what it took that the plan does not state goes in the page's notes, so
 * a long list never shrinks the drawings.
 */
import { buildFloorPlan, planFacade, planFloors, planForFloor, planSection, withPatterns, type Bounds, type FacadeSide, type NamedSectionLine, type SectionAssumption, type SectionLine, type Vec2 } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { COMPASS_SIDES } from '@ongrid/floorplan/types/floorplan'
import type { Language } from '@ongrid/floorplan/messages'
import { FRAME_MARGIN } from '@ongrid/viewer/src/canvas2d/viewport'
import { facadeFraming, facadePicture } from '@ongrid/viewer/src/picture/facade'
import { sectionFraming, sectionPicture } from '@ongrid/viewer/src/picture/section'
import { fullHeight, type Picture } from '@ongrid/viewer/src/picture/planSvg'
import { COMMON_SCALES } from './drawingPapers'
import { KEPT_DRAWN, keptIn } from '@ongrid/floorplan/geometry/kept'
import type { FacadePictureOptions } from '@ongrid/viewer/src/picture/facade'
import type { SectionPictureOptions } from '@ongrid/viewer/src/picture/section'

/** The drawing box of an elevations or sections page, in PDF points: the page's width inside its margins. */
export const DRAWINGS_BOX = { width: 1095, height: 524 } as const
/** How large one picture pixel prints, in points: a level's figure (11 px) at about 6.6 pt. */
export const DRAWING_PIXEL_PT = 0.6
/** The scales tried, largest drawing first: the usual ones for a building's sides, from 1:50. */
export const SIDE_SCALES: readonly number[] = COMMON_SCALES.filter((scale) => scale >= 50)
/** The room a section's name takes under its picture, in points. */
export const SECTION_NAME_PT = 14
/** Points between two drawings on a page. */
const GAP_PT = 24
/** How far a section line runs past the building at each end, in metres. */
const SECTION_RUN = 1
/** How far a section line keeps from the middle of a wall that runs along it, past half the wall's thickness, in metres. */
const WALL_CLEAR = 0.15
/** The steps a section line is moved by, in metres, to keep off such a wall. */
const NUDGE = 0.3
const NUDGES = 6
/** A wall within this much of parallel to a line, as a share of its length, runs along it. */
const PARALLEL = 0.02

/** The options of a picture as one key: its fields in order, so the same options give the same key. */
const keyOf = (options: object): string => JSON.stringify(Object.entries(options).sort(([a], [b]) => (a < b ? -1 : 1)))

/**
 * SHT-25: an elevation's picture, kept with a frozen plan: the sheet draws it here to size it on
 * its page and again in the PDF, from the same options.
 */
export function keptFacadePicture(plan: FloorPlan, options: FacadePictureOptions): ReturnType<typeof facadePicture> {
  return keptIn(KEPT_DRAWN, plan, `facadePicture\u0000${keyOf(options)}`, () => facadePicture(plan, options))
}

/** SHT-25: a section's picture, kept with a frozen plan as an elevation's is. */
export function keptSectionPicture(plan: FloorPlan, line: SectionLine, options: SectionPictureOptions): ReturnType<typeof sectionPicture> {
  return keptIn(KEPT_DRAWN, plan, `sectionPicture\u0000${keyOf(line)}\u0000${keyOf(line.from)}\u0000${keyOf(line.to)}\u0000${keyOf(options)}`, () => sectionPicture(plan, line, options))
}

/** Points in a metre of the building at 1:N. */
export const pointsPerMetre = (scale: number): number => ((1000 / scale) * 72) / 25.4

/** One drawing on a page: what it is, its size in pixels, and its place and size on the page in points from the box's top left. */
export type PlacedDrawing =
  | (PlacedSize & { readonly of: 'facade'; readonly side: FacadeSide })
  | (PlacedSize & { readonly of: 'section'; readonly cut: NamedSectionLine })

interface PlacedSize {
  /** The picture's width and height in pixels, as the viewer is asked for it. */
  readonly width: number
  readonly height: number
  /** Where it is drawn, in points from the box's top left, and how large, its key under it included. */
  readonly x: number
  readonly y: number
  readonly drawn: { readonly width: number; readonly height: number }
}

/** The sheet's elevations and sections at their one scale; either list is empty when there is nothing to draw. */
export interface SideDrawings {
  /** N in 1:N. */
  readonly scale: number
  readonly elevations: readonly PlacedDrawing[]
  readonly sections: readonly PlacedDrawing[]
  /** The section lines, for the floor plans to mark. */
  readonly cuts: readonly NamedSectionLine[]
  /** What the sections took that the plan does not state, each once, with the sections that took it. */
  readonly taken: readonly { readonly labels: readonly string[]; readonly assumed: SectionAssumption }[]
}

/** The building's outline on the plan: every solid wall of every floor, or null when it has none. */
function buildingBounds(plan: FloorPlan): { bounds: Bounds; walls: { a: Vec2; b: Vec2; thickness: number }[]; lowest: string } | null {
  const floors = planFloors(plan)
  const patterned = withPatterns(plan)
  const walls: { a: Vec2; b: Vec2; thickness: number }[] = []
  for (const floor of floors) {
    for (const wall of buildFloorPlan(planForFloor(patterned, floor.id)).walls) {
      if (wall.virtual || wall.landscape === true) continue
      walls.push({ a: wall.centerline[0], b: wall.centerline[1], thickness: wall.thickness })
    }
  }
  if (walls.length === 0 || floors.length === 0) return null
  const xs = walls.flatMap((w) => [w.a.x, w.b.x])
  const ys = walls.flatMap((w) => [w.a.y, w.b.y])
  const min = { x: Math.min(...xs), y: Math.min(...ys) }
  const max = { x: Math.max(...xs), y: Math.max(...ys) }
  return { bounds: { min, max, width: max.x - min.x, height: max.y - min.y }, walls, lowest: floors[0]!.id }
}

/**
 * Where on the axis across a line it is cut: `start`, else the nearest step from it that keeps off
 * every wall running along the line, inside the building's span.
 */
function offWalls(start: number, across: 'x' | 'y', walls: readonly { a: Vec2; b: Vec2; thickness: number }[], span: readonly [number, number]): number {
  const along = across === 'y' ? 'x' : 'y'
  const running = walls.filter((w) => {
    const length = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
    return length > 0 && Math.abs(w.b[across] - w.a[across]) <= PARALLEL * length && Math.abs(w.b[along] - w.a[along]) > 0
  })
  const clear = (at: number): boolean => running.every((w) => Math.abs((w.a[across] + w.b[across]) / 2 - at) > w.thickness / 2 + WALL_CLEAR)
  for (let step = 0; step <= NUDGES; step++) {
    for (const at of step === 0 ? [start] : [start + step * NUDGE, start - step * NUDGE]) {
      if (at > span[0] && at < span[1] && clear(at)) return at
    }
  }
  return start
}

/** Sections A and B: along the building's longer side and across it, through its largest room on the lowest floor. */
export function sheetSectionLines(plan: FloorPlan): NamedSectionLine[] {
  const building = buildingBounds(plan)
  if (building === null) return []
  const { bounds, walls, lowest } = building
  const rooms = buildFloorPlan(planForFloor(withPatterns(plan), lowest)).rooms.filter((room) => room.outdoor !== true)
  const largest = rooms.reduce<(typeof rooms)[number] | null>((best, room) => (best === null || room.area > best.area ? room : best), null)
  const through = largest?.labelAt ?? { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 }
  // Walking east, the left is north; walking south, the left is east.
  const eastward = (): SectionLine => {
    const y = offWalls(through.y, 'y', walls, [bounds.min.y, bounds.max.y])
    return { from: { x: bounds.min.x - SECTION_RUN, y }, to: { x: bounds.max.x + SECTION_RUN, y }, toward: 'left' }
  }
  const southward = (): SectionLine => {
    const x = offWalls(through.x, 'x', walls, [bounds.min.x, bounds.max.x])
    return { from: { x, y: bounds.max.y + SECTION_RUN }, to: { x, y: bounds.min.y - SECTION_RUN }, toward: 'left' }
  }
  const [a, b] = bounds.width >= bounds.height ? [eastward(), southward()] : [southward(), eastward()]
  return [{ line: a, label: 'A' }, { line: b, label: 'B' }].filter(({ line }) => !planSection(plan, line).reach.missesBuilding)
}

interface Sized { readonly width: number; readonly height: number; readonly drawn: { readonly width: number; readonly height: number } }

/**
 * A picture's pixels for a frame at a scale, and its size on the page: its key under it included,
 * or, for a section, its name (`under`) in its key's place.
 */
function sizeOf(frame: Bounds, grow: number, scale: number, under: number | null, draw: (width: number, height: number) => Picture): Sized {
  const metresPerPixel = DRAWING_PIXEL_PT / pointsPerMetre(scale)
  const width = Math.max(1, Math.round((frame.width * grow) / metresPerPixel))
  const height = Math.max(1, Math.round((frame.height * grow) / metresPerPixel))
  const picture = draw(width, height)
  const drawnWidth = picture.view.width * pointsPerMetre(scale)
  const drawnHeight = under === null ? (fullHeight(picture) / picture.width) * drawnWidth : (picture.height / picture.width) * drawnWidth + under
  return { width, height, drawn: { width: drawnWidth, height: drawnHeight } }
}

/**
 * The drawings in a grid of cells, the fewest columns at which each fits its cell, or null when
 * none does. Elevations stand on the foot of their cell, so a row's grounds line up; sections
 * hang from its top.
 */
function laidOut<T>(items: readonly (T & Sized)[], foot: boolean): (T & PlacedSize)[] | null {
  if (items.length === 0) return []
  for (let columns = 1; columns <= items.length; columns++) {
    const rows = Math.ceil(items.length / columns)
    const cell = { width: (DRAWINGS_BOX.width - (columns - 1) * GAP_PT) / columns, height: (DRAWINGS_BOX.height - (rows - 1) * GAP_PT) / rows }
    if (!items.every((item) => item.drawn.width <= cell.width && item.drawn.height <= cell.height)) continue
    return items.map((item, i) => {
      const column = i % columns
      const row = Math.floor(i / columns)
      const left = column * (cell.width + GAP_PT)
      const top = row * (cell.height + GAP_PT)
      return { ...item, x: left + (cell.width - item.drawn.width) / 2, y: foot ? top + cell.height - item.drawn.height : top }
    })
  }
  return null
}

/**
 * Every side of the building and its two sections, at the largest of `SIDE_SCALES` at which all
 * of them fit their pages, or null when the plan has no walls or nothing fits even at 1:1000.
 */
export function sideDrawings(plan: FloorPlan, options: { readonly language?: Language; readonly look: 'technical' }): SideDrawings | null {
  const cuts = sheetSectionLines(plan)
  const facades = COMPASS_SIDES.map((side) => ({ side, facade: planFacade(plan, side) })).filter(({ facade }) => facade.extent !== null)
  if (facades.length === 0 && cuts.length === 0) return null
  const sections = cuts.map((cut) => ({ cut, section: planSection(plan, cut.line) }))
  const language = options.language === undefined ? {} : { language: options.language }
  for (const scale of SIDE_SCALES) {
    const metresPerPixel = DRAWING_PIXEL_PT / pointsPerMetre(scale)
    const elevations = laidOut(facades.map(({ side, facade }) => ({
      of: 'facade' as const,
      side,
      ...sizeOf(facadeFraming(facade), 1 + 2 * FRAME_MARGIN, scale, null, (width, height) => keptFacadePicture(plan, { side, width, height, look: options.look, paperScale: scale, ...language })),
    })), true)
    if (elevations === null) continue
    // VEW-89: a sheet's sections are drawn without their dimension chains, so they keep the
    // elevations' usual scale; grid_view and grid draw give the chains.
    const cutsLaid = laidOut(sections.map(({ cut, section }) => ({
      of: 'section' as const,
      cut,
      ...sizeOf(sectionFraming(plan, section, metresPerPixel, { ...language, dimensions: false }), 1, scale, SECTION_NAME_PT, (width, height) => keptSectionPicture(plan, cut.line, { width, height, look: options.look, paperScale: scale, label: cut.label, dimensions: false, ...language })),
    })), false)
    if (cutsLaid === null) continue
    return { scale, elevations, sections: cutsLaid, cuts: sections.map(({ cut }) => cut), taken: takenOnce(sections) }
  }
  return null
}

/** What the sections took, each sentence once, with the names of the sections that took it. */
function takenOnce(sections: readonly { cut: NamedSectionLine; section: { assumed: readonly SectionAssumption[] } }[]): SideDrawings['taken'] {
  const byWords = new Map<string, { labels: string[]; assumed: SectionAssumption }>()
  for (const { cut, section } of sections) {
    for (const assumed of section.assumed) {
      const known = byWords.get(assumed.words)
      if (known === undefined) byWords.set(assumed.words, { labels: [cut.label], assumed })
      else if (!known.labels.includes(cut.label)) known.labels.push(cut.label)
    }
  }
  return [...byWords.values()]
}
