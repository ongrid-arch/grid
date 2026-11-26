/**
 * A facade as a picture (LVL-8): one side of the building, every floor stacked at its level, drawn
 * from the faces the core works out (`planFacade`), and nothing worked out here.
 *
 * It is drawn through the same looks as the plan (SHT-1), with the look's own line weights: in the
 * technical look, millimetres on paper from the pen set chosen by the scale; in the working look,
 * screen pixels. Heaviest first: the ground, then the facade's outline against the sky, then the
 * edges of each face, lighter the further back it stands (`tier`); doors, windows and the floor
 * marks finest. The faces are drawn farthest first, each filled, so a nearer face hides what stands
 * behind it; what lies under the ground is covered by the paper.
 *
 * Pure: no DOM, no React. `pictureToSvg` writes it out with the label (MSG-3), as it does a plan.
 */
import type { Bounds } from '@ongrid/floorplan/geometry'
import { facadeGroundAt, hatchLines, levelText, planFacade, type Facade, type FacadeFace, type FacadeOpening, type FacadeRect, type FacadeSide } from '@ongrid/floorplan/geometry'
import { fitTo } from '../canvas2d/viewport'
import type { LinePart, Look } from './look'
import { TEXT_PX, lengthText, lineMetres, paperScaleOf } from './look'
import type { Picture, PictureOptions } from './planSvg'
import { DEFAULT_WIDTH, displayOfPicture, lookOf, pictureToSvg } from './planSvg'
import type { SvgNode } from './svgNode'
import { el } from './svgNode'
import type { Language } from '@ongrid/floorplan/messages'
import { said } from '@ongrid/floorplan/messages'
import { ENGLISH_WORDS, drawingText, wordsOf, type DrawingWords } from './words'
import { METRES, type Display } from '@ongrid/floorplan/types/units'

export interface FacadePictureOptions {
  /** Which side of the drawing: north is the top of the drawing (+y), as `grid describe` says. */
  readonly side: FacadeSide
  /** Width in pixels. 1200 by default. */
  readonly width?: number
  /** Height in pixels. By default it follows the facade's shape. */
  readonly height?: number
  /** A named look (SHT-1), as for a plan: `working` by default. */
  readonly look?: PictureOptions['look']
  /** N in 1:N, for a look whose lines are in millimetres on paper. The picture's own when left out. */
  readonly paperScale?: number
  /** MSG-11: the language of its words; the plan's own display language when left out. */
  readonly language?: Language
  /** VEW-20: the units its levels are written in; the plan's own display when left out. */
  readonly display?: Display
}

/** A facade laid out as a picture, with the facade it draws. */
export interface FacadePicture extends Picture {
  readonly facade: Facade
}

/** The line part of a face's edges, by how far back it stands. */
const TIER_PARTS: readonly LinePart[] = ['elevationNear', 'elevationBack', 'elevationFar']

/**
 * VEW-12: how far apart a roof's covering is drawn, its courses level along the eaves: in
 * millimetres on paper in a look whose lines are on paper, in pixels on the screen.
 */
const COURSE_MM = 1.5
const COURSE_PX = 6
/** VEW-12: how deep a gutter is drawn along the eaves, in metres, at the top of the fascia. */
const GUTTER_DEPTH = 0.12

/**
 * VEW-63: a window's glass on a facade: the look's window tone, or this pale grey where the look's
 * windows are the paper itself (the technical look), so the glass still reads apart from its frame.
 */
const GLASS_ON_PAPER = '#e4e4e4'

/** The share of the facade's width the floor marks and their names take on its right. */
const LEVEL_ROOM = 0.25
/** How far the ground line runs past the facade at each end, as a share of its width, and at least. */
const GROUND_RUN = 0.06
const GROUND_RUN_LEAST = 0.5
/** How much ground, and how much sky, the picture frames, in metres. */
const BELOW = 0.6
const ABOVE = 0.4

/**
 * The parts of the drawing a facade frames, in plan screen terms (`u` across, `z` up). SHT-23: a
 * sheet reads it to draw every side at one scale.
 */
export function facadeFraming(facade: Facade): Bounds {
  const extent = facade.extent ?? { u0: 0, u1: 10, bottom: facade.ground.level, top: facade.ground.level + 3 }
  const span = Math.max(extent.u1 - extent.u0, 1)
  const run = Math.max(span * GROUND_RUN, GROUND_RUN_LEAST)
  // CNT-49: on a slope, the lowest of the ground line's ends.
  const min = { x: extent.u0 - run, y: Math.min(facade.ground.level, facadeGroundAt(facade, extent.u0 - run), facadeGroundAt(facade, extent.u1 + run)) - BELOW }
  const max = { x: extent.u1 + run + span * LEVEL_ROOM, y: extent.top + ABOVE }
  return { min, max, width: max.x - min.x, height: max.y - min.y }
}

/** Text in pixels, at a point of the picture: it reads the same at any size. */
function textNode(look: Look, x: number, y: number, unitsPerPixel: number, words: string, part: string, anchor: 'start' | 'end' = 'start'): SvgNode {
  return el('g', { 'data-part': part, transform: `translate(${lengthText(x)} ${lengthText(y)}) scale(${lengthText(unitsPerPixel)})` }, [
    el('text', { x: 0, y: 0, fill: look.colors.labelSoft, 'font-family': look.colors.font, 'font-size': TEXT_PX.dimension, 'text-anchor': anchor }, [words])
  ])
}

/** The way a facade is named under it: its side, and the way that side faces when the plan says (MSG-11: `drawing.facade.*`). */
export function facadeCaption(facade: Facade, words: DrawingWords = ENGLISH_WORDS): string {
  return drawingText(words, 'drawing.facade.caption', {
    facade: said(`drawing.facade.name.${facade.side}`),
    side: said(`drawing.facade.side.${facade.side}`),
    compass: facade.compass === null ? '' : said('drawing.facade.compass', { faces: said(`describe.way.${facade.compass.faces}`) }),
    ground: facade.ground.stated ? '' : said('drawing.facade.noGround')
  })
}

/**
 * The elements of a facade, in plan screen terms: `x` is `u`, across the facade, and `y` is minus
 * the height, as SVG runs down the page. Widths in metres from the look's lines at this zoom.
 */
export function facadeScene(facade: Facade, look: Look, metresPerPixel: number, paperScale?: number, words: DrawingWords = ENGLISH_WORDS, units: Display = METRES): SvgNode[] {
  const lines = lineMetres(look, metresPerPixel, paperScale)
  const width = (part: LinePart): string => lengthText(lines.width(part))
  const nodes: SvgNode[] = []
  const frame = facadeFraming(facade)
  const extent = facade.extent
  if (extent === null) {
    nodes.push(textNode(look, frame.min.x + frame.width / 2, -(facade.ground.level + 1.5), metresPerPixel, drawingText(words, 'drawing.facade.empty', { side: said(`drawing.facade.side.${facade.side}`) }), 'facade-empty', 'start'))
    return nodes
  }

  const courseSpacing = look.lines.unit === 'mm' ? (COURSE_MM * (paperScale ?? paperScaleOf(metresPerPixel))) / 1000 : COURSE_PX * metresPerPixel
  // VEW-12: a roof's plane with its covering and its lines, a band along its eaves with its gutter.
  const roofParts = (face: FacadeFace, ink: string): SvgNode[] => {
    const parts: SvgNode[] = []
    if (face.kind === 'roof-plane') {
      const ring = face.outline.map(([u, z]) => ({ x: u, y: z }))
      for (const [a, b] of hatchLines(ring, courseSpacing, 0)) {
        parts.push(el('line', { 'data-part': 'facade-roof-course', x1: lengthText(a.x), y1: lengthText(-a.y), x2: lengthText(b.x), y2: lengthText(-b.y), stroke: ink, 'stroke-width': width('elevationOpening') }))
      }
      for (const line of face.roofLines) {
        const main = line.kind === 'ridge' || line.kind === 'hip'
        parts.push(
          el('line', {
            'data-part': `facade-roof-${line.kind}`,
            x1: lengthText(line.from[0]),
            y1: lengthText(-line.from[1]),
            x2: lengthText(line.to[0]),
            y2: lengthText(-line.to[1]),
            stroke: ink,
            'stroke-width': width(main ? 'elevationNear' : TIER_PARTS[face.tier]!),
            'stroke-linecap': 'round'
          })
        )
      }
    }
    if (face.kind === 'roof' && face.edge === 'eaves') {
      const depth = Math.min(GUTTER_DEPTH, face.top - face.bottom)
      parts.push(
        el('rect', {
          'data-part': 'facade-gutter',
          x: lengthText(face.u0),
          y: lengthText(-face.top),
          width: lengthText(face.u1 - face.u0),
          height: lengthText(depth),
          fill: look.colors.paper,
          stroke: ink,
          'stroke-width': width(TIER_PARTS[face.tier]!)
        })
      )
    }
    return parts
  }

  // VEW-63: a window as the core sees it: its head over the hole, the hole, its lights in the glass
  // tone, the members of its frame and sashes farthest first, and its sill last, standing in front.
  const glass = look.colors.window === look.colors.paper ? GLASS_ON_PAPER : look.colors.window
  const box = (part: string, r: FacadeRect, fill: string, ink: string): SvgNode =>
    el('rect', { 'data-part': part, x: lengthText(r.u0), y: lengthText(-r.top), width: lengthText(r.u1 - r.u0), height: lengthText(r.top - r.bottom), fill, stroke: ink, 'stroke-width': width('elevationOpening') })
  const windowParts = (opening: FacadeOpening, hole: SvgNode, ink: string): SvgNode => {
    const w = opening.window!
    return el('g', { 'data-part': 'facade-window', 'data-id': opening.id, 'data-kind': w.kind }, [
      ...(w.head === null ? [] : [box('facade-window-head', w.head, look.colors.room, ink)]),
      hole,
      ...w.lights.map((light) => box('facade-window-light', light, glass, ink)),
      ...w.members.map((member) => box('facade-window-frame', member, look.colors.paper, ink)),
      ...(w.sill === null ? [] : [box('facade-window-sill', w.sill, look.colors.paper, ink)])
    ])
  }

  const faces = facade.faces.map((face, i) => {
    const ink = face.tier === 2 ? look.colors.labelSoft : look.ink
    const windowNode = (opening: FacadeOpening, hole: SvgNode): SvgNode => windowParts(opening, hole, ink)
    // VEW-49: a doorless opening is a void: a hole in the face's path, the wall's edges stepping
    // back to an inner edge (its reveals), and what stands behind it seen through it.
    const voids = face.openings.filter((o) => o.type === 'opening' && o.u0 >= face.u0 && o.u1 <= face.u1 && o.bottom >= face.bottom && o.top <= face.top)
    const holes = voids.map((o) => `M${lengthText(o.u0)},${lengthText(-o.bottom)}L${lengthText(o.u1)},${lengthText(-o.bottom)}L${lengthText(o.u1)},${lengthText(-o.top)}L${lengthText(o.u0)},${lengthText(-o.top)}Z`)
    const openings = face.openings.flatMap((opening) => {
      const isVoid = voids.includes(opening)
      const rect = el('rect', {
        'data-part': 'facade-opening',
        'data-id': opening.id,
        'data-type': opening.type,
        x: lengthText(opening.u0),
        y: lengthText(-opening.top),
        width: lengthText(opening.u1 - opening.u0),
        height: lengthText(opening.top - opening.bottom),
        fill: isVoid ? 'none' : opening.type === 'window' ? look.colors.window : look.colors.paper,
        stroke: ink,
        'stroke-width': width('elevationOpening')
      })
      if (opening.window !== undefined) return [windowNode(opening, rect)]
      if (!isVoid) return [rect]
      const w = opening.u1 - opening.u0
      const h = opening.top - opening.bottom
      const inset = Math.min(opening.reveal, Math.min(w, h) / 4)
      const [a, b, c, d] = [opening.u0 + inset, opening.u1 - inset, -(opening.top - inset), -(opening.bottom + inset)]
      const line = (x1: number, y1: number, x2: number, y2: number) => el('line', { 'data-part': 'facade-reveal', x1: lengthText(x1), y1: lengthText(y1), x2: lengthText(x2), y2: lengthText(y2), stroke: ink, 'stroke-width': width('elevationOpening') })
      return [
        rect,
        el('rect', { 'data-part': 'facade-reveal', x: lengthText(a), y: lengthText(c), width: lengthText(b - a), height: lengthText(d - c), fill: 'none', stroke: ink, 'stroke-width': width('elevationOpening') }),
        line(opening.u0, -opening.top, a, c),
        line(opening.u1, -opening.top, b, c),
        line(opening.u0, -opening.bottom, a, d),
        line(opening.u1, -opening.bottom, b, d)
      ]
    })
    return el(
      'g',
      {
        'data-part': 'facade-face',
        'data-kind': face.kind,
        'data-floor': face.floor,
        ...(face.wall === null ? {} : { 'data-wall': face.wall }),
        ...(face.edge === null ? {} : { 'data-edge': face.edge }),
        'data-tier': face.tier
      },
      [
        el('path', {
          d: `M${face.outline.map(([u, z]) => `${lengthText(u)},${lengthText(-z)}`).join('L')}Z${holes.join('')}`,
          ...(holes.length === 0 ? {} : { 'fill-rule': 'evenodd' }),
          fill: look.colors.room,
          stroke: ink,
          'stroke-width': width(TIER_PARTS[face.tier]!),
          'stroke-linejoin': 'miter'
        }),
        ...roofParts(face, ink),
        ...openings
      ],
      `face-${i}`
    )
  })
  nodes.push(el('g', { 'data-part': 'facade-faces' }, faces))

  // Under the ground nothing is seen: the paper covers it, under the ground line. CNT-49: on a
  // slope the line, and the paper under it, follow the ground along the face.
  const span = Math.max(extent.u1 - extent.u0, 1)
  const run = Math.max(span * GROUND_RUN, GROUND_RUN_LEAST)
  const [left, right] = [frame.min.x - frame.width, frame.min.x + frame.width * 2]
  const deep = Math.min(facadeGroundAt(facade, left), facadeGroundAt(facade, right)) - frame.height * 2
  nodes.push(
    facade.ground.fall === undefined
      ? el('rect', {
          'data-part': 'facade-below-ground',
          x: lengthText(left),
          y: lengthText(-facade.ground.level),
          width: lengthText(frame.width * 3),
          height: lengthText(frame.height * 2),
          fill: look.colors.paper
        })
      : el('path', {
          'data-part': 'facade-below-ground',
          d: `M${lengthText(left)},${lengthText(-facadeGroundAt(facade, left))}L${lengthText(right)},${lengthText(-facadeGroundAt(facade, right))}L${lengthText(right)},${lengthText(-deep)}L${lengthText(left)},${lengthText(-deep)}Z`,
          fill: look.colors.paper
        })
  )

  if (facade.outline.length > 0) {
    const d = facade.outline.map((ring) => `M${ring.map(([u, z]) => `${lengthText(u)},${lengthText(-z)}`).join('L')}Z`).join('')
    nodes.push(el('path', { 'data-part': 'facade-outline', d, fill: 'none', stroke: look.ink, 'stroke-width': width('elevationOutline'), 'stroke-linejoin': 'miter' }))
  }

  nodes.push(
    el('line', {
      'data-part': 'facade-ground',
      x1: lengthText(extent.u0 - run),
      y1: lengthText(-facadeGroundAt(facade, extent.u0 - run)),
      x2: lengthText(extent.u1 + run),
      y2: lengthText(-facadeGroundAt(facade, extent.u1 + run)),
      stroke: look.ink,
      'stroke-width': width('elevationGround')
    })
  )

  // Each floor at its level, on the right: a mark and its name with its level.
  const markFrom = extent.u1 + run
  const markTo = markFrom + Math.min(span * LEVEL_ROOM * 0.2, 1)
  const levels = facade.levels.map((level) =>
    el('g', { 'data-part': 'facade-level', 'data-floor': level.floor }, [
      el('line', {
        x1: lengthText(markFrom),
        y1: lengthText(-level.level),
        x2: lengthText(markTo),
        y2: lengthText(-level.level),
        stroke: look.ink,
        'stroke-width': width('elevationLevel')
      }),
      textNode(look, markTo + metresPerPixel * 4, -level.level - metresPerPixel * 3, metresPerPixel, `${levelText(level.level, units)} ${level.name}`, 'facade-level-name')
    ])
  )
  nodes.push(el('g', { 'data-part': 'facade-levels' }, levels))
  nodes.push(textNode(look, extent.u0 - run, -Math.min(facadeGroundAt(facade, extent.u0 - run), facade.ground.level) + metresPerPixel * 18, metresPerPixel, facadeCaption(facade, words), 'facade-caption'))
  return nodes
}

function pixels(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`The picture's ${name} must be a whole number of pixels, at least 1: got ${value}`)
  return value
}

/** Lays out one facade of a plan as a picture. Opening patterns are expanded by the core. */
export function facadePicture(plan: Parameters<typeof planFacade>[0], options: FacadePictureOptions): FacadePicture {
  const facade = planFacade(plan, options.side)
  const look = lookOf(options.look)
  const framed = facadeFraming(facade)
  const width = pixels('width', options.width ?? DEFAULT_WIDTH)
  const shape = Math.min(Math.max(framed.height / framed.width, 0.4), 2.5)
  const height = options.height === undefined ? Math.max(1, Math.round(width * shape)) : pixels('height', options.height)
  const view = fitTo(framed, width / height)
  if (options.paperScale !== undefined && !(Number.isFinite(options.paperScale) && options.paperScale > 0)) {
    throw new RangeError(`The paper scale is N in 1:N, a number above 0: got ${options.paperScale}`)
  }
  const shown = displayOfPicture(plan, { ...(options.language === undefined ? {} : { language: options.language }), ...(options.display === undefined ? {} : { labels: { display: options.display } }) })
  const words: DrawingWords = wordsOf(shown)
  const nodes = facadeScene(facade, look, view.width / width, options.paperScale, words, { ...(shown ?? METRES), decimal: words.decimal })
  const floors = facade.levels.length
  const title = drawingText(words, floors === 1 ? 'drawing.facade.title.one' : 'drawing.facade.title.many', { facade: said(`drawing.facade.name.${facade.side}`), count: floors })
  const picture = { width, height, view, look, rooms: 0, undecidedDoors: [], nodes, key: null, title, facade }
  return words.language === 'en' ? picture : { ...picture, language: words.language }
}

/** One facade of a plan as an SVG file, with the label (MSG-3). */
export function facadeToSvg(plan: Parameters<typeof planFacade>[0], options: FacadePictureOptions): string {
  return pictureToSvg(facadePicture(plan, options))
}
