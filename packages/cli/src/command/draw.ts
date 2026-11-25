/**
 * `grid draw <plan>`: one floor as an SVG picture, or as a PNG with `--png`, through `drawPlan`,
 * in the technical look, as a file to hand on, unless `--look` names another (SHT-1), with what went wrong marked on it by the numbers
 * `grid check` gives, and listed under it (MSG-8), and the plan's title, notes, key and sketch
 * (SHT-7); `--hide`, `--colour` and `--key` choose what it shows.
 * With `--3d`, the 3D model as the app opens it, as a PNG, through `drawStill`; with `--view`, a
 * view saved with the plan (VEW-3), through its camera record. With `--facade` (LVL-8), one side of
 * the building in elevation, every floor at its level, through `drawFacade`. With `--section`, a
 * section along a line through every floor, through `drawSection` (LVL-9); `--marks` adds the
 * marks for the plan's other drawings to a floor plan.
 * Written to `--out`, or to standard output when no file is named.
 */
import { DISPLAY_UNITS, displayFor } from '../quantities/units'
import { FILE_LOOK_NAMES, LOOK_NAMES, type LookName } from '@ongrid/viewer/src/picture/look'
import { inspectPlan } from '@ongrid/rules'
import { FACADE_SIDES, cameraRecord, findView, resolveFloor, viewSetting, type FacadeSide } from '@ongrid/floorplan/geometry'
import { drawFacade, drawPlan } from '../draw/drawPlan'
import { planPicture } from '@ongrid/viewer/src/picture'
import { drawShowOf } from './drawShow'
import { floorOption, type LoadedPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'
import { askedLanguage, LANG_OPTION, languageFor, spokenPlan } from './language'
import type { SectionLine } from '@ongrid/floorplan/geometry/section'
import type { DrawingMarksAsked } from '@ongrid/floorplan/geometry/drawingMarks'
import { marksAsked, readMarks, readSectionOption, towardOf } from './section'
import { withScheduleMarks } from '../quantities/schedule'
import type { Project } from '../fs/projectFiles'
import { readTrace } from '../trace/traceImage'

export const DRAW_OPTIONS: OptionSpecs = {
  '--png': { takesValue: false, help: 'Draw a PNG instead of an SVG.' },
  '--3d': { takesValue: false, help: 'Draw the 3D model as the app opens it, as a PNG of 1200 by 800 pixels.' },
  '--facade': { takesValue: true, help: 'Draw one side of the building in elevation instead of a floor plan: north, east, south or west, the sides of the drawing (north is its top). Every floor at its level. Not with --3d, --view or --floor.' },
  '--view': { takesValue: true, help: 'Draw a view saved with the plan (grid_save_view), by name: the 3D model through its camera, as a PNG of 1200 by 800 pixels.' },
  '--out': { takesValue: true, help: 'The file to write, inside the project, ending in .svg (or .png with --png or --3d). Standard output when left out.' },
  '--floor': { takesValue: true, help: 'The floor to draw (a floor id from the plan). The lowest floor when left out. With --3d, that floor as a cutaway; the whole building when left out.' },
  '--look': { takesValue: true, help: 'How the plan is drawn: technical (the default: black on white, lines in millimetres on paper) or working (as on screen, on light paper). Not with --3d.' },
  '--hide': { takesValue: true, help: 'Parts to leave off, joined by commas: title, key, notes, sketch, dimensions, areas, swings, warnings, above (the dashed outline of the floor above). Not with --3d.' },
  '--colour': { takesValue: true, help: 'use: fill each room by its use, with the uses in the key. Not with --3d.' },
  '--key': { takesValue: false, help: 'Add a key under the drawing, even where the plan asks for none. Not with --3d.' },
  '--ids': { takesValue: false, help: 'The check view: draw the id of every room, door and window, as the plan file holds them. Not with --3d.' },
  '--scale': { takesValue: true, help: 'PNG only: pixels per picture pixel, above 0 and up to 8 (up to 4 with --3d). 1 when left out.' },
  '--units': { takesValue: true, help: 'How areas and dimensions are written: m, cm, mm or ft-in. The plan\'s own display, or m, when left out. Not with --3d.' },
  '--decimal': { takesValue: true, help: 'The decimal mark: point or comma. The plan\'s own display, or point, when left out.' },
  ...LANG_OPTION,
  '--section': { takesValue: true, help: 'Draw a section instead of a floor plan: the line to cut along, x1,y1:x2,y2 in metres, through every floor, with its levels and room heights, and what it takes that the plan does not state dashed and listed. Not with --3d, --view or --facade.' },
  '--toward': { takesValue: true, help: 'With --section: the side of the line the section looks toward, walking from its first point to its second: left (the default) or right.' },
  '--marks': { takesValue: true, help: 'Marks to add to a floor plan, joined by commas: levels (each room\'s floor level), elevations (where each side of the building is seen from), section (the line of --section and the way it looks, on the plan, instead of drawing the section), schedule (each room\'s and opening\'s mark in the schedules: the room\'s number, D1, W1, O1). Not with --3d, --view or --facade.' },
  ...PROJECT_OPTION,
}

export const MAX_SCALE = 8
/** A 3D still is drawn pixel by pixel in memory: 4 makes it 4800 by 3200. */
export const MAX_SCALE_3D = 4

export interface DrawRequest {
  readonly png: boolean
  /** The 3D model instead of a floor plan. */
  readonly threeD?: boolean
  /** VEW-3: a saved view's name: the 3D model through its camera. */
  readonly view?: string
  /** LVL-8: one side of the building in elevation instead of a floor plan, as given. */
  readonly facade?: string
  readonly out?: string
  readonly floor?: string
  readonly scale?: string
  /** The check view: every room, door and window carries its id (VEW-2). */
  readonly ids?: boolean
  /** The look's name, as given. */
  readonly look?: string
  /** WRT-7: the display's unit and decimal mark, as given. */
  readonly units?: string
  readonly decimal?: string
  /** SHT-7: the parts to leave off, as given: words joined by commas. */
  readonly hide?: string
  /** SHT-7: how rooms are filled, as given. */
  readonly colour?: string
  /** SHT-7: add a key the plan does not ask for. */
  readonly key?: boolean
  /** MSG-11: the language Grid's own words on the drawing are in (`--lang`), as given. */
  readonly lang?: string
  /** LVL-9: the line to cut a section along, as given (`x1,y1:x2,y2`). */
  readonly section?: string
  /** LVL-9: the side the section looks toward, as given. */
  readonly toward?: string
  /** LVL-9: the marks to add to a floor plan, as given: words joined by commas. */
  readonly marks?: string
}

/** LVL-9: what `--section`, `--toward` and `--marks` ask for, read. */
export interface SectionAsked {
  /** The section to draw, when the picture is a section. */
  readonly section: SectionLine | null
  /** The marks on a floor plan, when any are asked for. */
  readonly marks: DrawingMarksAsked | null
  /** ARE-15: the schedules' marks are asked for, added once the plan is read. */
  readonly schedule: boolean
}

/** What a drawn file is: a picture file's text or bytes, and the doors drawn as undecided. */
export interface DrawnFile {
  readonly file: string | Uint8Array
  readonly undecidedDoors: readonly string[]
  /** LVL-9: what a section took that the plan does not state, for standard error, when the file is one. */
  readonly sectionNote?: string | null
  /** HND-10: the line on the plan's trace image, for standard error, when a floor plan is drawn and the plan names one. */
  readonly traceNote?: string | null
}

/** CMD-25: the picture asked for is a PNG, whichever kind: a floor plan, the model, a saved view, a facade or a section. */
export function drawsPng(request: DrawRequest): boolean {
  return request.png || request.threeD === true
}

/** CMD-25: said when a PNG would go to a terminal. */
export const PNG_TO_TERMINAL = 'A PNG is not shown in a terminal: name a file with --out, or send the output to a file or another program.'

/** The look `grid draw` uses when none is named: a file to hand on. */
export const DRAW_LOOK: LookName = 'technical'

/**
 * LVL-9: reads `--section`, `--toward` and `--marks`, and refuses, by name, an option that means
 * nothing with them: a section cuts every floor and has no plan labels, keys or ids.
 */
export function sectionAsked(request: DrawRequest): SectionAsked {
  if (request.toward !== undefined && request.section === undefined) throw new UsageError('--toward says which way a section looks: add --section, or leave --toward out.')
  const words = request.marks === undefined ? null : readMarks(request.marks.split(',').map((w) => w.trim()).filter((w) => w.length > 0))
  for (const [given, flag] of [[request.section, '--section'], [request.marks, '--marks']] as const) {
    if (request.view !== undefined && given !== undefined) throw new UsageError(`${flag} is for a drawing, not a saved view of the 3D model: leave ${flag} or --view out.`)
    if (request.threeD && given !== undefined) throw new UsageError(`${flag} is for a drawing, not the 3D model: leave ${flag} or --3d out.`)
  }
  if (words?.has('section') && request.section === undefined) throw new UsageError('--marks section draws the line of a section on the plan: add --section with the line, or leave section out of --marks.')
  const line = request.section === undefined ? null : readSectionOption(request.section, towardOf(request.toward))
  if (line !== null && !words?.has('section')) {
    if (words !== null) throw new UsageError('--marks marks a floor plan, and --section draws a section: add section to --marks to draw the plan with the section\'s line on it, or leave --marks out.')
    for (const [given, flag] of [[request.floor, '--floor'], [request.hide, '--hide'], [request.colour, '--colour'], [request.key || undefined, '--key'], [request.ids || undefined, '--ids'], [request.units, '--units'], [request.decimal, '--decimal']] as const) {
      if (given !== undefined) throw new UsageError(`${flag} is for a floor plan; a section cuts every floor and writes its levels in metres: leave ${flag} or --section out.`)
    }
    return { section: line, marks: null, schedule: false }
  }
  return { section: null, marks: words === null ? null : marksAsked(words, line), schedule: words?.has('schedule') === true }
}

/** Checks the options against each other, before the plan is read. */
export function checkDrawRequest(request: DrawRequest): { scale: number; look: LookName } {
  if (request.view !== undefined && request.floor !== undefined) throw new UsageError('--view draws the floors its camera was saved with: leave --floor or --view out.')
  // A still is always a PNG, so --png would say nothing.
  if (request.threeD && request.png) throw new UsageError('--png does nothing with --3d, which always draws a PNG: leave --png out.')
  if (request.facade !== undefined) checkFacadeRequest(request)
  if (request.threeD && request.ids) throw new UsageError('--ids draws the ids on a floor plan, not on the 3D model: leave --ids or --3d out.')
  if (request.threeD && request.look !== undefined) throw new UsageError('--look is for a floor plan, not the 3D model: leave --look or --3d out.')
  if (request.threeD && (request.units !== undefined || request.decimal !== undefined)) throw new UsageError('--units and --decimal write the labels of a floor plan, not the 3D model: leave them or --3d out.')
  if (request.units !== undefined && !(DISPLAY_UNITS as readonly string[]).includes(request.units)) throw new UsageError(`--units takes one of ${DISPLAY_UNITS.join(', ')}.`)
  if (request.decimal !== undefined && request.decimal !== 'point' && request.decimal !== 'comma') throw new UsageError('--decimal takes point or comma.')
  for (const [given, flag] of [[request.hide, '--hide'], [request.colour, '--colour'], [request.key || undefined, '--key']] as const) {
    if (request.threeD && given !== undefined) throw new UsageError(`${flag} is for a floor plan, not the 3D model: leave ${flag} or --3d out.`)
  }
  drawShowOf(request)
  askedLanguage(request.lang)
  sectionAsked(request)
  const look = (request.look ?? DRAW_LOOK) as LookName
  // SHT-10: a file is always drawn on light paper, so the screen's dark look is refused by name.
  // SHT-10 adds one sentence here (ownWords.test.ts).
  if ((LOOK_NAMES as readonly string[]).includes(look) && !FILE_LOOK_NAMES.includes(look)) {
    throw new UsageError(`--look ${look} is the screen's dark theme, and a file is always drawn on light paper: use one of ${FILE_LOOK_NAMES.join(', ')}.`)
  }
  if (!(FILE_LOOK_NAMES as readonly string[]).includes(look)) {
    throw new UsageError(`--look ${JSON.stringify(request.look)} is not a look Grid draws: use one of ${FILE_LOOK_NAMES.join(', ')}.`)
  }
  const png = request.png || request.threeD === true
  const extension = png ? '.png' : '.svg'
  if (request.out !== undefined && !request.out.toLowerCase().endsWith(extension)) {
    const hint = png ? 'name a .png file' : request.out.toLowerCase().endsWith('.png') ? 'add --png, or name a .svg file' : 'name a .svg file'
    throw new UsageError(`--out ${JSON.stringify(request.out)} does not end in ${extension}: ${hint}.`)
  }
  if (request.scale === undefined) return { scale: 1, look }
  if (!png) throw new UsageError('--scale only applies to a PNG: add --png or --3d, or leave --scale out.')
  const max = request.threeD ? MAX_SCALE_3D : MAX_SCALE
  const scale = Number(request.scale)
  if (!/^\d*\.?\d+$/.test(request.scale) || !(scale > 0) || scale > max) {
    throw new UsageError(`--scale takes a number above 0 and up to ${max}${request.threeD ? ' with --3d' : ''}: got ${JSON.stringify(request.scale)}.`)
  }
  return { scale, look }
}

/**
 * LVL-8: a facade is one side of the whole building, in elevation: it takes the side, and how it is
 * drawn and written (--look, --png, --scale, --out), and refuses what belongs to a floor plan or
 * to the 3D model, by name.
 */
function checkFacadeRequest(request: DrawRequest): void {
  const side = request.facade!
  if (!(FACADE_SIDES as readonly string[]).includes(side)) {
    throw new UsageError(`--facade ${JSON.stringify(side)} is not a side Grid draws: use one of ${FACADE_SIDES.join(', ')}, the sides of the drawing (north is its top).`)
  }
  if (request.view !== undefined) throw new UsageError('--facade draws one side of the building and --view a saved view of the model: give one of them.')
  if (request.threeD) throw new UsageError('--facade draws one side of the building and --3d the model: give one of them.')
  if (request.section !== undefined) throw new UsageError('--facade draws one side of the building and --section a cut through it: give one of them.')
  if (request.floor !== undefined) throw new UsageError('--floor picks a floor plan; a facade shows every floor at its level: leave --floor or --facade out.')
  const planOnly: [unknown, string][] = [[request.ids || undefined, '--ids'], [request.hide, '--hide'], [request.colour, '--colour'], [request.key || undefined, '--key'], [request.units, '--units'], [request.decimal, '--decimal'], [request.marks, '--marks']]
  for (const [given, flag] of planOnly) {
    if (given !== undefined) throw new UsageError(`${flag} is for a floor plan, not a facade: leave ${flag} or --facade out.`)
  }
}

/**
 * The picture `grid draw` writes. HND-10: with the project the plan was read from, a floor plan
 * draws the plan's trace image under it, read from the project folder (`readTrace`).
 */
export async function drawFile(read: LoadedPlan, request: DrawRequest, scale: number, look: LookName = DRAW_LOOK, project?: Project): Promise<DrawnFile> {
  // MSG-11: the language asked for, else the plan's own, else English, with its messages loaded.
  const asked = askedLanguage(request.lang)
  const language = await languageFor(asked, read.plan)
  // MSG-22: the floor the plan names in no list, named in the drawing's language.
  const loaded = spokenPlan(read, language)
  if (request.facade !== undefined) {
    const side = request.facade as FacadeSide
    const tongue = language === 'en' && asked === undefined ? {} : { language }
    const file = request.png ? await drawFacade(loaded.plan, { format: 'png', side, look, scale, ...tongue }) : await drawFacade(loaded.plan, { format: 'svg', side, look, ...tongue })
    return { file, undecidedDoors: [] }
  }
  const drawing = sectionAsked(request)
  if (drawing.section !== null) {
    // Loaded only for a section. MSG-11: its words in the language asked for, else the plan's own.
    const { drawSection } = await import('../draw/drawSection')
    const tongue = language === 'en' && asked === undefined ? {} : { language }
    const drawn = await drawSection(loaded.plan, drawing.section, request.png ? { format: 'png', look, scale, ...tongue } : { format: 'svg', look, ...tongue })
    return { file: drawn.file, undecidedDoors: [], sectionNote: drawn.note }
  }
  const floor = floorOption(loaded.plan, request.floor)
  if (request.view !== undefined) {
    const saved = findView(loaded.plan.views, request.view)
    if (saved === null) {
      const names = (loaded.plan.views ?? []).slice(0, 20).map((v) => JSON.stringify(v.name))
      throw new UsageError(`--view names no view saved with this plan. ${names.length === 0 ? 'It has no saved views.' : `Its views: ${names.join(', ')}.`}`)
    }
    const { drawStill } = await import('../draw/drawStill')
    return { file: await drawStill(loaded.plan, { camera: cameraRecord(loaded.plan, viewSetting(saved)), scale }), undecidedDoors: [] }
  }
  if (request.threeD) {
    // Loaded only for a still: it brings Three and React with it.
    const { drawStill } = await import('../draw/drawStill')
    return { file: await drawStill(loaded.plan, { focus: floor ?? null, scale, ...(language === 'en' ? {} : { language }) }), undecidedDoors: [] }
  }
  const display = request.units === undefined && request.decimal === undefined && asked === undefined ? undefined : displayFor(request.units, request.decimal, loaded.plan, language)
  const labels = { ...(request.ids || display ? { labels: { ...(request.ids ? { ids: true } : {}), ...(display ? { display } : {}) } } : {}), ...drawShowOf(request), ...(drawing.marks === null ? {} : { marks: drawing.schedule ? withScheduleMarks(drawing.marks, loaded.plan) : drawing.marks }) }
  // What went wrong, numbered as `grid check` numbers it, marked on the drawing (MSG-8).
  // VEW-15: from the file's text and its base, as `grid check` reads them, so the fields the reading adds are no notes.
  const faults = inspectPlan(loaded.text ?? loaded.plan, { ...(language === 'en' ? {} : { language, ...(loaded.plan.display?.decimal ? { decimal: loaded.plan.display.decimal } : {}) }), ...(loaded.base === undefined ? {} : { base: loaded.base.plan }) }).lines
  const undecidedDoors = planPicture(loaded.plan, { floor, look, ...labels }).undecidedDoors
  // HND-10: the trace image under the floor drawn, and its line for standard error.
  const trace = project === undefined ? null : readTrace(project, loaded.plan, resolveFloor(loaded.plan, floor), language)
  const traced = trace?.picture ? { trace: trace.picture } : {}
  const file = request.png
    ? await drawPlan(loaded.plan, { format: 'png', floor, scale, look, faults, ...labels, ...traced })
    : await drawPlan(loaded.plan, { format: 'svg', floor, look, faults, ...labels, ...traced })
  return { file, undecidedDoors, traceNote: trace?.line ?? null }
}

/** The line `grid draw` prints on standard error for doors drawn as undecided, or `null`. */
export function undecidedNote(ids: readonly string[]): string | null {
  if (ids.length === 0) return null
  const list = ids.map((id) => JSON.stringify(id)).join(', ')
  return `Drew ${ids.length === 1 ? 'a door' : `${ids.length} doors`} with no stated swing as undecided, a dashed line and "?": ${list}. Set each one's hinge and swing in the plan.\n`
}

