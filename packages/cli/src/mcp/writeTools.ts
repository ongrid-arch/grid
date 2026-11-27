/**
 * The tools of `grid serve` that write: an export file beside the plan, the
 * plan written from rooms text (WRT-2, the main way to write one), and the three changes to the
 * plan itself (an opening, one side of a room, a mirror).
 *
 * A change to the plan reads the file, works out the change on Grid's reading of it, and
 * writes the file's own JSON back with only that change in it. It is refused, and nothing is
 * written, when it would leave the drawing with a problem it did not have.
 */
import { baseRefusal, baseTouched, phasedPatch } from '../edit/phases'
import { planInMetres } from '@ongrid/floorplan/types/units'
import { DOOR_KINDS, OPENING_KINDS, WINDOW_KINDS, WallKindSchema, type OpeningKind } from '@ongrid/floorplan/types/floorplan'
import { changeType, TYPE_FIELDS, TYPE_OF, type TypeOf } from '../edit/types'
import { limit, planFloors, phaseCounts, planInState, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { keptDerived, LAYOUT_SHAPES, type LayoutShape } from '@ongrid/floorplan/rooms'
import { doorsThatChangedRooms } from '@ongrid/floorplan/geometry/rules/doors'
import { EXPORT_FORMATS, isExportFormat } from '@ongrid/floorplan/export'
import { inspectPlan } from '@ongrid/rules'
import { ALL_FLOORS, approximatedText, checkExportRequest, dxfProfileLine, emptyFloorsText, exportFile, exportFloorId, ExportWriteFailed, exportsIntoProject, floorsText, leftOutText, sheetsText, type ExportDone } from '../command/export'
import { DXF_PROFILE_FILE, DxfProfileRefused } from '../export/dxfProfile'
import { UsageError } from '../command/options'
import { loadPlan, PlanRefused } from '../command/plan'
import { nameNotes } from '../command/planText'
import { occupancyFileOf } from '../occupancy/occupancy'
import { keepRoomNumbers } from '../edit/numbers'
import { PlanBusy, withPlanLock } from '../edit/revision'
import { changeOpening, changeWallThickness, listed, DIRECTIONS, EditRefused, FROMS, insideAcross, KEEPS, MIRRORS, mirrorPlan, applyPatch, readingAfter, TURNS, turnPlanBy, type Direction, type From, type Mirror, type Patch, type Turn } from '../edit/edits'
import { NARROWEST_ACROSS, newProblems, problemsText, sideMoveThatFits, type ProblemsOf } from '../edit/fit'
import { parseSheetWordsChecked } from '../sheet/claims'
import { SheetWordsRefused, sheetWordsJsonSchema, sheetWordsProblem } from '@ongrid/floorplan/types/sheet'
import { checkSheetRequest, drawingIntoProject, drawingLine, readSheetWords, sheetIntoProject, type SheetKind } from '../sheet/sheetFile'
import { PAPER_NAMES, SCALE_MAX } from '../sheet/drawingPapers'
import { askedLanguage } from '../command/language'
import { readRoomsFile, RoomsRefused, writeRoomsIntoProject } from '../command/write'
import { roomsGrammarText } from './roomsGrammar'
import { writeScanIntoProject } from '../command/scan'
import { writeDrawingIntoProject } from '../drawing/fromDrawing'
import { PATH_MAX, PathRefused, quoted } from '../fs/projectFiles'
import { ROOM_NAMES_TRAVEL } from './protocol'
import { comparePlans } from '../quantities/compare'
import { surveyPlan, type Survey } from '../quantities/survey'
import { LANGUAGE_ARG, openingBetween } from './readTools'
import { say } from '@ongrid/floorplan/messages'
import { briefAnswer } from '../brief/answer'
import { renameInBrief } from '../brief/rename'
import { causedText, newLines } from '../edit/caused'
import { followWalls } from '../edit/items'
import { faultText } from '../command/plan'
import { refusePlanTarget } from '../command/planFile'
import { SEEN_NEW_OUTPUT, seenBefore as seenMarksBefore, seenMadeNew, seenNewData, seenNewLines } from '../edit/seen'
import { BRIEF_OUTPUT } from './briefTool'
import { writeLayout } from '../brief/layout'
import { TAPED_OUTPUT, TAPED_ROWS_IN_AN_EDIT, tapedRows, tapedTable } from '../taped/table'
import {
  asRefusal,
  FLOOR_ARG,
  floorArg,
  listSchema,
  NULLABLE_STRING,
  NUMBER,
  objectSchema,
  openingArg,
  PLAN_ARG,
  DECIMAL_IN_ARG,
  planFileOf,
  projectOf,
  readPlan,
  roomArg,
  STRING,
  wallArg,
  ToolRefusal,
  type GridTool,
  type ToolContext,
  usesRead,
} from './toolkit'
import { english, name as nameOf, said as sentence } from '@ongrid/floorplan/messages'
import { version } from '../../package.json'

export const EXPORT_TOOL_NAME = 'grid_export'

// ---------------------------------------------------------------------------------------------
// grid_export

/** The command's messages name its options; a tool names its arguments. */
function asArguments(message: string): string {
  return message.replace(/--(format|floor|layout|sheet|scale|out)\b/g, '$1')
}

/** What a written file leaves out of the plan, for the agent. */
function leftOutLine(count: number): string {
  return `Left out ${count} part${count === 1 ? '' : 's'} that can't be drawn: grid check says which and why.`
}

const exportTool: GridTool = {
  name: EXPORT_TOOL_NAME,
  title: 'Export the plan',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a file to open in another program: dxf for AutoCAD and other 2D CAD programs (the nearest to DWG), ifc for BIM programs such as Revit, glb or obj for 3D. '
    + 'It writes the file into the exports folder beside the plan, replacing an earlier copy of the same export, and answers with the path it wrote and every part of the plan the file leaves out (the file says so too). It never changes the plan, and refuses a file that would hold nothing of it. '
    + 'A dxf, glb or obj with no floor holds the whole building: a glb or obj each floor at its elevation (in a glb, a node per floor named by its id under one root node), a dxf each floor side by side in model space and on a paper layout of its own named after the floor. floor all writes one file per floor, each named after its floor, listed as files. The answer says which floors a file holds as floors and which it does not as floorsLeftOut. '
    + `A dxf is in metres, with doors and windows as blocks, one per schedule type, each insert carrying its MARK (the schedules' mark, the IFC's Tag), TYPE, WIDTH, HEIGHT and SILL, filled walls, dimensions, room tags and an A3 sheet per floor at the largest standard scale every floor fits at, or at scale; sheets says the scale and any floor that does not fit. It takes its layer names and pens from ${DXF_PROFILE_FILE} in the project folder when there is one, and answers with that file as dxfProfile. A door's hand is the side of its hinges seen from the side it opens toward, in the schedule, the dxf and the ifc alike. `
    + `${ROOM_NAMES_TRAVEL} `
    + 'Do not use for a picture to look at (grid_view). For a PDF to read or print, use grid_sheet; JPG is not made. The plan must be a file inside the project folder: any other path is refused.',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['floor-plan.json', 'plan.json'] },
    format: { type: 'string', required: true, enum: EXPORT_FORMATS, description: 'The file format.', examples: ['dxf', 'ifc'] },
    floor: { type: 'string', maxLength: 200, description: 'dxf, obj and glb only: a floor id or name from the plan\'s "floors", for that floor alone at its elevation, or all for each floor on its own. Left out, every floor.', examples: ['ground', 'all'] },
    scale: { type: 'number', description: 'dxf only: N in 1:N, a whole number, such as 100 or 200, for its sheets. Left out, the scale the profile states, else the largest of 100, 200, 500 and 1000 every floor fits at on A3.', examples: [100, 200], minimum: 1, maximum: 1000 },
    out: { type: 'string', maxLength: PATH_MAX, description: 'The file to write, inside the project folder, ending in the format\'s extension. The exports folder beside the plan when left out. Not with floor all.', examples: ['drawings/ground.dxf'] },
  },
  outputSchema: objectSchema({
    written: STRING,
    format: STRING,
    leftOut: { type: 'number' },
    leftOutParts: listSchema(
      objectSchema({ kind: STRING, id: NULLABLE_STRING, place: NULLABLE_STRING, floor: NULLABLE_STRING, code: NULLABLE_STRING }, ['kind', 'id', 'place', 'floor', 'code'])
    ),
    // CNT-18: the curved walls and the rooms along them the file writes as straight pieces.
    approximated: listSchema(objectSchema({ kind: STRING, id: STRING, floor: NULLABLE_STRING }, ['kind', 'id', 'floor'])),
    // VEW-64: the floors the file holds, lowest first, each with its elevation in metres, and the plan's floors it does not hold.
    floors: listSchema(objectSchema({ id: STRING, elevation: NUMBER }, ['id', 'elevation'])),
    floorsLeftOut: listSchema(STRING),
    // VEW-72: every file written, one per floor for floor all, and each DXF sheet's scale and fit.
    files: listSchema(objectSchema({ written: STRING, floors: listSchema(STRING) }, ['written', 'floors'])),
    sheets: listSchema(objectSchema({ floor: NULLABLE_STRING, scale: NUMBER, stated: { type: 'boolean' }, fits: { type: 'boolean' }, fitsAt: { type: ['number', 'null'] } }, ['floor', 'scale', 'stated', 'fits', 'fitsAt'])),
    note: { type: ['string', 'null'] },
    dxfProfile: { type: ['string', 'null'] },
    gridVersion: STRING,
  }),
  run(args, context) {
    const project = projectOf(context)
    const plan = args['plan'] as string
    const format = args['format'] as string
    const floor = args['floor'] as string | undefined
    const scale = args['scale'] as number | undefined
    const out = args['out'] as string | undefined
    if (!isExportFormat(format)) throw new ToolRefusal(`Pass format: one of ${EXPORT_FORMATS.join(', ')}.`)
    // The floor is checked against the plan first, so an unknown one is not repeated back (MS-19).
    // VEW-72: by its id or its name, or all.
    if (floor !== undefined && floor !== ALL_FLOORS) {
      const stated = readPlan(context, plan).loaded.plan
      if (exportFloorId(stated, floor) === undefined) floorArg(stated, floor)
    }
    try {
      const request = { format, floor, ...(scale === undefined ? {} : { scale: String(scale) }), ...(out === undefined ? {} : { out }) }
      checkExportRequest(request)
      let files: readonly ExportDone[]
      let empty: readonly string[] = []
      if (out === undefined) ({ done: files, empty } = exportsIntoProject(project, plan, format, request))
      else {
        // VEW-72: out, as grid export --out writes it.
        const loaded = loadPlan(project, plan)
        const made = exportFile(project, loaded, plan, format, request)
        let written: string
        try {
          written = project.writeFile(out, made.data)
        } catch (error) {
          if (error instanceof PathRefused) throw error
          throw new ExportWriteFailed(`Can't write ${quoted(out)}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'its folder does not exist' : 'it cannot be written there'}. Nothing was written.`)
        }
        files = [{ loaded, written, leftOut: made.leftOut, approximated: made.approximated, dxfProfile: made.dxfProfile, floors: made.floors, floorsLeftOut: made.floorsLeftOut, sheets: made.sheets }]
      }
      const each = floor === ALL_FLOORS && files.length > 1
      const lines: string[] = []
      for (const done of files) {
        lines.push(`Wrote ${quoted(project.relative(done.written))} in the project folder.`)
        if (done.note) lines.push(done.note)
        // HND-6: what this file leaves out, which the file says too.
        const left = leftOutText(done.leftOut)
        if (left !== null) lines.push(left)
        const curves = approximatedText(done.approximated)
        if (curves !== null) lines.push(curves)
        // VEW-64: which floors the file holds, and which it does not; a file of each floor asked for says neither.
        const held = each ? null : floorsText(done, format)
        if (held !== null) lines.push(held)
        // VEW-72: a DXF's scale, and a floor that does not fit at it.
        const sheets = sheetsText(done.sheets)
        if (sheets !== null) lines.push(sheets)
      }
      const nothing = emptyFloorsText(empty)
      if (nothing !== null) lines.push(nothing)
      const first = files[0]!
      // HND-1: a DXF names the project's profile when its layers and pens came from one.
      if (first.dxfProfile !== null) lines.push(dxfProfileLine(first.dxfProfile))
      const leftOutParts = files.flatMap((done) => done.leftOut)
      return {
        text: lines.join('\n'),
        data: {
          written: project.relative(first.written), format, leftOut: leftOutParts.length, leftOutParts, approximated: files.flatMap((done) => done.approximated),
          floors: files.flatMap((done) => done.floors), floorsLeftOut: each ? [] : first.floorsLeftOut,
          files: files.map((done) => ({ written: project.relative(done.written), floors: done.floors.map((held) => held.id) })),
          sheets: files.flatMap((done) => done.sheets), note: files.map((done) => done.note).filter((note) => note !== undefined).join(' ') || null, dxfProfile: first.dxfProfile, gridVersion: version,
        },
      }
    } catch (error) {
      if (error instanceof PathRefused || error instanceof PlanRefused || error instanceof ExportWriteFailed || error instanceof DxfProfileRefused) throw new ToolRefusal(error.message)
      if (error instanceof UsageError) throw new ToolRefusal(asArguments(error.message))
      throw error
    }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_sheet

export const SHEET_TOOL_NAME = 'grid_sheet'

/** The layout, checked as the command checks it, with the command's refusal in a tool's words. SHT-6: drawing takes words too. */
function sheetLayoutOf(layout: unknown, withWords: boolean): SheetKind {
  if (layout === 'drawing') return 'drawing'
  try {
    return checkSheetRequest({ layout: layout as string | undefined, sheet: withWords ? 'sheet' : undefined })
  } catch (error) {
    if (error instanceof UsageError) throw new ToolRefusal(asArguments(error.message))
    throw error
  }
}

/** SHT-6: the arguments only a drawing at a scale takes. */
const DRAWING_ARGS = ['scale', 'paper', 'floor', 'roomSizes', 'split'] as const

const sheetTool: GridTool = {
  name: SHEET_TOOL_NAME,
  title: 'Make a PDF sheet',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a PDF to read, print or send: layout client for the person the house is for (a cover with the 3D model and key figures, then a page per floor with its drawing and room areas), or layout check for whoever checks the plan (every id, every room\'s use, and what grid check finds on each floor). Both then have an elevations page (every side) and a sections page (A along the building, B across it, cut where Grid chooses and marked on every floor plan), all at one true scale on A3 with a scale bar and a title block; the check sheet lists what the sections took that the plan does not state. '
    + 'The words of a client sheet (name, headline, intro, a few paragraphs per floor) are yours to write: pass them as sheet, or Grid reads <plan>.sheet.json beside the plan. The name is the one the person gave the building, else the plan\'s; never a name from an example. A drawing reads the same words: name is the project in its title block, and drawing is its title there (Grid\'s own, such as "Ground floor plan", when left out). Grid draws only what the plan holds: no furniture or landscape. Every page carries "General guidance, not your local rules". '
    + 'It writes the PDF into the exports folder beside the plan, replacing an earlier sheet of the same name and layout, and answers with the path and what is on each page. It never changes the plan. '
    + `${ROOM_NAMES_TRAVEL} `
    + 'Layout drawing (SHT-6, SHT-20) is the building to print and measure: every floor, one page each (or the one floor asked for), all drawn at one true scale (scale, N in 1:N) on one paper (A4 to A0), in black on white with walls joined, dimensions along the walls and room sizes, each page with a scale bar, a caption, north, a title block and the label; it writes one vector PDF, an SVG and a PNG of each page, and returns the PNGs to look at. Left out, the scale is the largest of 1:100, 1:200 and 1:500 every floor fits and the paper the smallest; a floor too large for the paper asked for is refused naming it, with a paper and a scale that fit and the pages split would take. With split true, a long floor is cut over pages at the scale, each part saying which it is, with a dashed line where the next continues. '
    + 'A client or check sheet comes back with a small picture of each page, in order, to look at before you hand it over. Do not use for a single picture (grid_view) or a file for another program (grid_export).',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['plan.json'] },
    layout: { type: 'string', required: true, enum: ['client', 'check', 'drawing'], description: 'client, check, or drawing for one floor at a true scale.', examples: ['client', 'check', 'drawing'] },
    sheet: {
      type: 'object',
      description: 'Client and drawing (a check sheet takes none): the words, as the sheet file holds them. A drawing uses name as the project and drawing as its title in the title block. <plan>.sheet.json beside the plan is read when left out.',
      examples: [{ version: '1', name: 'Example House', drawing: 'Ground floor, as built', headline: 'A private retreat for one', intro: ['A two-storey home for work and rest.'], floors: { ground: ['The study sits beside the entry.'] } }],
      schema: sheetWordsJsonSchema(),
      // The shape and limits here; the plan's floor ids in run(), where the plan is known.
      read: (value, earlier) => {
        // A check sheet takes no words: that refusal comes before any about the words.
        sheetLayoutOf(earlier['layout'], true)
        const problem = sheetWordsProblem(value, null)
        if (problem !== null) throw new ToolRefusal(`The sheet words: ${problem}.`)
        return value
      },
    },
    scale: { type: 'number', description: 'Drawing only: N in 1:N, a whole number, such as 50, 100 or 200. The largest of 100, 200 and 500 the floor fits when left out.', examples: [100, 50], minimum: 1, maximum: SCALE_MAX },
    paper: { type: 'string', enum: PAPER_NAMES, description: 'Drawing only: the paper, turned the way the floor fits. The smallest that fits when left out.', examples: ['A4', 'A3'] },
    floor: { ...FLOOR_ARG, description: 'Drawing only: the one floor to draw. Every floor, one page each at one scale and paper, when left out.' },
    split: { type: 'boolean', description: 'Drawing only: true to cut a floor too large for the paper at the scale over pages at that scale (A0 when no paper is given). false when left out: such a floor is refused with what fits.', examples: [true] },
    roomSizes: { type: 'boolean', description: 'Drawing only: each room\'s width and depth along its walls. true when left out.', examples: [true, false] },
    date: { type: 'string', maxLength: 40, description: 'The date on the sheet: 2026-01-31 or a time such as 2026-01-31T09:00:00Z. SOURCE_DATE_EPOCH when left out, else today. The same date gives the same bytes.', examples: ['2026-01-31'] },
    language: LANGUAGE_ARG,
  },
  outputSchema: objectSchema({
    written: STRING, layout: STRING, pages: { type: 'array', items: objectSchema({ kind: STRING, title: NULLABLE_STRING, floor: STRING, part: { type: 'number' }, parts: { type: 'number' } }, ['kind', 'title']) }, leftOut: { type: 'number' }, note: { type: ['string', 'null'] },
    // SHT-6: a drawing's other files, its scale and its paper; null for a client or check sheet.
    // SHT-20: svg and png are the first page's; svgs and pngs every page's, in order.
    svg: NULLABLE_STRING, png: NULLABLE_STRING, scale: { type: ['number', 'null'] }, paper: NULLABLE_STRING,
    svgs: { type: ['array', 'null'], items: STRING }, pngs: { type: ['array', 'null'], items: STRING },
  }),
  async run(args, context) {
    // Already read: layout is one of the three, and words with a check sheet were refused there.
    const layout = args['layout'] as SheetKind
    const given = args['sheet'] as Record<string, unknown> | undefined
    const drawingAsked = DRAWING_ARGS.filter((name) => args[name] !== undefined)
    if (layout !== 'drawing' && drawingAsked.length > 0) {
      throw new ToolRefusal(`${drawingAsked.join(' and ')} ${drawingAsked.length === 1 ? 'is' : 'are'} for layout drawing, not ${layout}: leave ${drawingAsked.length === 1 ? 'it' : 'them'} out.`)
    }
    if (args['scale'] !== undefined && !Number.isInteger(args['scale'])) throw new ToolRefusal('scale is N in 1:N, a whole number, such as 100.')
    try {
      const { project, file, loaded } = readPlan(context, args['plan'])
      if (layout === 'drawing') {
        const words = given !== undefined ? parseSheetWordsChecked(given, planFloors(loaded.plan).map((floor) => floor.id)) : readSheetWords(project, file, loaded, undefined)
        const asked = {
          ...(args['scale'] === undefined ? {} : { scale: args['scale'] as number }),
          ...(args['paper'] === undefined ? {} : { paper: args['paper'] as (typeof PAPER_NAMES)[number] }),
          ...(args['floor'] === undefined ? {} : { floor: floorArg(loaded.plan, args['floor']) }),
          ...(args['roomSizes'] === undefined ? {} : { roomSizes: args['roomSizes'] as boolean }),
          ...(args['split'] === true ? { split: true } : {}),
        }
        const done = await drawingIntoProject(project, file, asked, words, askedLanguage(args['language'], 'language'), args['date'] as string | undefined)
        const written = { pdf: project.relative(done.written.pdf), svgs: done.written.svgs.map((file) => project.relative(file)), pngs: done.written.pngs.map((file) => project.relative(file)) }
        const files = [written.pdf, ...written.svgs.flatMap((svg, i) => [svg, written.pngs[i]!])].map(quoted)
        const several = files.length > 3
        const lines = [drawingLine(done.set), `Wrote ${files.slice(0, -1).join(', ')} and ${files.at(-1)} in the project folder. Print the PDF at 100%, not fitted to the page, to keep the scale. Look at ${several ? 'the pictures' : 'the picture'} before you describe ${several ? 'them' : 'it'}.`]
        if (done.note) lines.push(done.note)
        const leftOut = done.loaded.broken.size
        if (leftOut > 0) lines.push(leftOutLine(leftOut))
        const pages = done.set.sheets.map((sheet) => ({ kind: 'drawing', title: sheet.words.drawing, floor: sheet.floor, ...(sheet.part === null ? {} : { part: sheet.part.index, parts: sheet.part.count }) }))
        const [image, ...images] = done.pngs.map((data) => ({ data, mimeType: 'image/png' as const }))
        return {
          text: lines.join('\n'),
          data: { written: written.pdf, layout, pages, leftOut, note: done.note ?? null, svg: written.svgs[0]!, png: written.pngs[0]!, scale: done.set.scale, paper: done.set.paper, svgs: written.svgs, pngs: written.pngs },
          image: image!,
          ...(images.length > 0 ? { images } : {}),
        }
      }
      const words = layout === 'check'
        ? null
        : given !== undefined
          ? parseSheetWordsChecked(given, planFloors(loaded.plan).map((floor) => floor.id))
          : readSheetWords(project, file, loaded, undefined)
      const done = await sheetIntoProject(project, file, layout, words, askedLanguage(args['language'], 'language'), args['date'] as string | undefined, true)
      const written = project.relative(done.written)
      const lines = [`Wrote ${quoted(written)} in the project folder: ${done.pages.length} pages.`]
      if (done.note) lines.push(done.note)
      const leftOut = done.loaded.broken.size
      if (leftOut > 0) lines.push(leftOutLine(leftOut))
      // VEW-62: each page as a small picture, in page order, to look at before the sheet goes on.
      const images = (done.previews ?? []).map((data) => ({ data, mimeType: 'image/png' as const }))
      if (images.length > 0) lines.push(`The ${images.length === 1 ? 'picture is' : `${images.length} pictures are`} the page${images.length === 1 ? '' : 's'}, in order, drawn small: look at ${images.length === 1 ? 'it' : 'them'} before you hand the sheet on.`)
      return { text: lines.join('\n'), data: { written, layout, pages: done.pages, leftOut, note: done.note ?? null, svg: null, png: null, scale: null, paper: null, svgs: null, pngs: null }, ...(images.length === 0 ? {} : { images }) }
    } catch (error) {
      if (error instanceof SheetWordsRefused) throw new ToolRefusal(`The sheet words: ${error.message}.`)
      if (error instanceof ExportWriteFailed) throw new ToolRefusal(error.message)
      // SHT-20: a drawing's refusal offers the command's --split, the tool's split true.
      if (layout === 'drawing' && error instanceof PlanRefused) throw new ToolRefusal(error.message.replace('--split prints', 'split true prints'))
      throw asRefusal(error)
    }
  },
}

// ---------------------------------------------------------------------------------------------
// The changes to the plan

export const OUT_ARG = {
  type: 'string' as const,
  maxLength: PATH_MAX,
  description: 'Write the changed plan to this file, inside the project folder, ending in .json, and leave plan as it is. The plan itself is replaced when left out.',
  examples: ['option-b2.json', 'plan.json'],
}

/**
 * WRT-73 (C16): the phase rules, in the words the tools that write and edit a plan carry. A plan
 * with phases is read in two states, before the work and after it; an edit of it is the work.
 */
export const PHASE_RULES =
  'Phases: parts may state existing, demolished or new. In a plan that states a phase an edit is building work: what it adds is new and what it takes out of what stands is kept, to be demolished; a plan that states none is read as it is. grid_start_works marks a plan as it stands existing, grid_set_phase marks parts by id or room, grid_phase_from writes one plan from a before and an after. To fix the survey itself ("the hall is on the right, actually") pass correction, so the change is not work.'

/** WRT-73: on an edit of a plan with phases, true makes the change a correction of the survey, not building work. */
export const CORRECTION_ARG = {
  type: 'boolean' as const,
  description: 'true when the change fixes the survey rather than making building work: a plan with phases keeps every part\'s phase and the change is made in place, as on a plan with none. false (left out) makes the change the work.',
  examples: [true],
}

export const EDIT_OUTPUT = objectSchema({
  written: STRING,
  changed: listSchema(STRING),
  verdict: STRING,
  // CNT-45: and the notes on fixtures and furniture among them.
  drawingProblems: objectSchema({ before: { type: 'number' }, after: { type: 'number' }, items: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }) }, ['before', 'after']),
  // MSG-1: the result record's one count, before and after, as grid_check gives it.
  toLookAt: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }),
  // MSG-14: each door or doorless opening that joins other rooms after the change, in words.
  doors: listSchema(STRING),
  // WRT-3: what the request left open and Grid chose, and what the change could not keep.
  guessed: listSchema(STRING),
  couldNotKeep: listSchema(STRING),
  // BRF-1: each line of the brief beside the plan, met or missed after the change.
  brief: BRIEF_OUTPUT,
  // HND-11: each length taped on site against the plan as it now is; empty when it keeps none.
  taped: TAPED_OUTPUT,
  // WRT-59: the notes this change caused (the plot boundary's first), and what the reader left out of the plan.
  caused: { type: 'array', items: objectSchema({ code: STRING, message: STRING }) },
  leftOut: listSchema(STRING),
  // MSG-29: each note set aside as seen that the change made new again; empty when none did.
  seenNew: SEEN_NEW_OUTPUT,
})

/** WRT-59: the rooms a change renames, as [old name, new name]. */
function renamesIn(plan: FloorPlan, patch: Patch): [string, string][] {
  const out: [string, string][] = []
  for (const [id, change] of patch.rooms) {
    const room = plan.rooms.find((r) => r.id === id)
    if (room !== undefined && typeof change.name === 'string' && change.name !== room.name) out.push([room.name, change.name])
  }
  return out
}

/**
 * Applies a patch to the plan file, or refuses it with nothing written. CMD-41: it holds the plan's
 * lock from reading the plan to writing it back, so no other change, in this process or another,
 * comes between; `grid edit` gets it here too, the server already holds it (`revisions.ts`).
 */
export function writeChange(context: ToolContext, args: Record<string, unknown>, make: (survey: Survey, problemsOf: ProblemsOf, stated: FloorPlan) => Patch): { text: string; data: Record<string, unknown> } {
  const project = projectOf(context)
  try {
    return withPlanLock(project, planFileOf(project, args['plan']), () => writeChangeHeld(context, args, make))
  } catch (error) {
    if (error instanceof PlanBusy) throw new ToolRefusal(error.message)
    throw error
  }
}

function writeChangeHeld(context: ToolContext, args: Record<string, unknown>, make: (survey: Survey, problemsOf: ProblemsOf, stated: FloorPlan) => Patch): { text: string; data: Record<string, unknown> } {
  const { project, file, loaded } = readPlan(context, args['plan'], { whole: true, leftOutKept: true })
  const out = (args['out'] as string | undefined) ?? file
  if (!out.toLowerCase().endsWith('.json')) throw new ToolRefusal('out must name a .json file.')
  // CMD-45: out is never one of Grid's own files, nor a file there already that holds no plan.
  try {
    refusePlanTarget(project, out)
  } catch (error) {
    if (error instanceof PlanRefused || error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw error
  }
  const before = surveyPlan(loaded.plan)
  // A plan written rooms first keeps its derived boundaries derived through Grid's own edits (WRT-2).
  const planAfter = (patch: Patch): FloorPlan => keptDerived(loaded.plan.rooms, readingAfter(loaded.plan, patch) as unknown as Record<string, unknown>) as unknown as FloorPlan
  // WRT-73: a correction fixes the survey itself, so the change is not the work and every phase stays as it was.
  const asWork = (patch: Patch): Patch => (args['correction'] === true ? patch : phasedPatch(loaded.plan, patch))
  const problemsOf: ProblemsOf = (patch) => newProblems(loaded.plan, planAfter(asWork(patch)))
  let patch: Patch
  try {
    patch = make(before, problemsOf, loaded.plan)
  } catch (error) {
    if (error instanceof EditRefused) throw new ToolRefusal(`${error.message} Nothing was written.`)
    throw error
  }
  // WRT-59: one rule for a plan the reader leaves parts of out: the change goes on and the answer says
  // what was left out, the file keeping every part as written. A change of the whole plan would leave
  // those parts where they were, so it is refused, naming them.
  const unread = (loaded.faults ?? []).map((fault) => faultText(fault))
  if (patch.whole === true && unread.length > 0) {
    throw new ToolRefusal(`The plan has ${unread.length === 1 ? 'a part' : `${unread.length} parts`} Grid would leave out or read otherwise (${listed(unread, 3)}), and a change of the whole plan would leave ${unread.length === 1 ? 'it' : 'them'} where ${unread.length === 1 ? 'it is' : 'they are'}. grid check names each; correct ${unread.length === 1 ? 'it' : 'them'} first. Nothing was written.`)
  }
  // CNT-10: a fit-out's base is read-only; in a plan with phases, the change is the work.
  if (loaded.base !== undefined) {
    const touched = baseTouched(patch, loaded.base)
    if (touched.length > 0) throw new ToolRefusal(baseRefusal(touched, loaded.base.file))
  }
  patch = asWork(patch)
  // CNT-45: an item standing against a wall the change moves moves with it.
  patch = followWalls(loaded.plan, patch, planAfter)
  const after = planAfter(patch)
  const fresh = newProblems(loaded.plan, after)
  if (fresh.length > 0) throw new ToolRefusal(`That change would break the drawing, so nothing was written: ${problemsText(fresh)}`)
  // MSG-29: the seen marks beside the plan, against the plan as it is, when the change replaces it.
  const marked = project.resolve(out) === project.resolve(file) ? seenMarksBefore(project, file) : null
  let raw: Record<string, unknown>
  try {
    // WRT-7: a file in another unit is written back in metres, the only unit Grid writes.
    raw = planInMetres(JSON.parse(project.readText(file).text) as Record<string, unknown>).raw
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw new ToolRefusal(`${file} could not be read again to write the change; nothing was written.`)
  }
  let written: string
  let next: unknown
  try {
    // WRT-23: the rooms keep the numbers they had when the change would move them.
    next = keepRoomNumbers(loaded.plan, keptDerived(loaded.plan.rooms, applyPatch(raw, patch)))
    written = project.relative(project.writeFile(out, `${JSON.stringify(next, null, 2)}\n`))
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw new ToolRefusal(`Can't write ${quoted(out)}: ${String((error as Error).message).replace(/\s+/g, ' ')}`)
  }
  const verdict = comparePlans(before, surveyPlan(after), ['the plan before', 'the plan now'], { inPlace: patch.whole !== true }).verdict
  // A door that joined a room now part of another (a merge) joins the same space: not a change.
  const become = patch.roomsBecome ?? new Map<string, string>()
  const key = (sides: readonly object[]): string => sides.map((side) => ('room' in side ? `r${become.get((side as { room: string }).room) ?? (side as { room: string }).room}` : JSON.stringify(side))).sort().join('|')
  // WRT-15: in a plan with phases, the doors of the building after the work, before and after the change.
  const doors = doorsThatChangedRooms(planInState(loaded.plan, 'after'), planInState(after, 'after'))
    .filter((change) => become.size === 0 || key(change.before) !== key(change.after))
    .map((change) => `${change.message}.`)
  // CNT-45: the notes on fixtures and furniture are counted on their own too, so an item left behind is seen.
  const issuesBefore = validatePlan(loaded.plan).issues
  const issuesAfter = validatePlan(after).issues
  const itemNotes = { before: issuesBefore.filter((issue) => issue.entity === 'item').length, after: issuesAfter.filter((issue) => issue.entity === 'item').length }
  const drawingProblems = { before: issuesBefore.length, after: issuesAfter.length, items: itemNotes }
  // The files as written, before and after (MSG-4): a field Grid does not read is kept by the change, and counted.
  // CNT-10: a fit-out's files are read with its base, as the command reads them.
  const withBase = loaded.base === undefined ? {} : { base: loaded.base.plan }
  const seenBefore = inspectPlan(raw, withBase)
  const seenAfter = inspectPlan(next, withBase)
  const toLookAt = { before: seenBefore.count, after: seenAfter.count }
  // WRT-59: the notes this change caused lead the answer, the plot boundary's first.
  const newNotes = newLines(seenBefore, seenAfter)
  const caused = causedText(newNotes)
  const guessed = [...(patch.guessed ?? [])]
  const couldNotKeep = [...(patch.notKept ?? [])]
  // WRT-73: edits are worked out on the building after the work, so a correction does not reach what stands only before it.
  if (args['correction'] === true && patch.whole !== true && phaseCounts(loaded.plan).demolished.walls > 0) {
    couldNotKeep.push('A correction changes the plan as it stands after the work, so what is only to be demolished is left as it was: check it against the correction.')
  }
  // BRF-1: the brief beside the plan the change read, against the plan as it now is.
  // WRT-59: a room renamed is renamed in the brief's wishes too, so they do not read as missed.
  const renamed = renamesIn(loaded.plan, patch)
  const briefRenamed = renamed.length === 0 ? null : renameInBrief(project, file, renamed, after)
  const brief = briefAnswer(project, file, after)
  // HND-11 (lab WR-14): the taped lengths against the plan as it now is.
  const taped = tapedRows(after)
  // WRT-58: a use word read as another use (`gym` as `sport`) is said, so the person sees what it became.
  const seenNew = seenMadeNew(marked, project, file)
  const usesSaid = usesRead(args).map((read) => english(sentence('edit.use.read', { word: nameOf(read.word), use: read.use })))
  // CMD-30: a name the change brought in that reads as an instruction or holds a person's name, said gently.
  const namesSaid = nameNotes(next as Record<string, unknown>, raw, occupancyFileOf(written)).map((note) => english(note))
  const text = [
    ...(caused === null ? [] : [caused]),
    ...patch.said,
    ...usesSaid,
    ...(unread.length === 0 ? [] : [`Left out of the reading, and kept in the file as written: ${listed(unread, 3)}. grid check names each.`]),
    ...(briefRenamed === null || briefRenamed.line === null ? [] : [briefRenamed.line]),
    ...namesSaid,
    ...guessed.map((line) => `Guessed: ${line}`),
    ...couldNotKeep.map((line) => `Could not keep: ${line}`),
    verdict,
    ...doors,
    `To look at: ${toLookAt.before} → ${toLookAt.after}, of them problems in the drawing ${drawingProblems.before} → ${drawingProblems.after}${itemNotes.before + itemNotes.after === 0 ? '' : `, on fixtures and furniture ${itemNotes.before} → ${itemNotes.after}`}. grid_check lists them.`,
    ...seenNewLines(seenNew),
    ...brief.text,
    ...tapedTable(taped, { max: TAPED_ROWS_IN_AN_EDIT }),
    `Wrote ${quoted(written)}.`,
  ].join('\n')
  return { text, data: { written, changed: [...patch.said], verdict, drawingProblems, toLookAt, doors, guessed, couldNotKeep, caused: newNotes.map((line) => ({ code: line.code, message: line.message })), leftOut: unread, brief: brief.data, taped, seenNew: seenNewData(seenNew), ...(patch.extra ?? {}) } }
}

const changeOpeningTool: GridTool = {
  name: 'grid_change_opening',
  title: 'Change or remove a door or window',
  hint: 'change-plan',
  description:
    'Use this when the person asks to make a door or window wider or narrower, change which room a door opens into or which side it is hinged on, make it a sliding, double, folding, pocket, roller or garage door (or a fixed, sliding or high-level window), raise or lower a sill, turn a window into a door, or take a door or window out: "bathroom door to 90 cm, opening outwards", "hinged on the left as seen from the bedroom", "make the dock door a roller door", "block the kitchen door", "a 4 m opening to the garden". '
    + 'It changes one opening in place and answers with what changed and the area verdict. A width that does not fit is refused with the free stretches of the wall, and nothing is written. '
    + 'To move it to another wall, pass room and side ("the bathroom door to its north wall"); to place it, from and distance, as rooms text does ("0.25 from west"): from a side of room, or without room from an end of its wall. Given from, it keeps that distance when walls move later (its anchor). '
    + 'Do not use to move a wall (grid_move_room_side). Grid has no roof windows. In a plan with phases the change is building work; pass correction to fix the survey instead (grid_start_works and grid_set_phase set phases). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    opening: { type: 'string', id: true, required: true, description: 'The id of the door, window or opening to change (grid_describe with for=agent lists them).', examples: ['door-bath', 'win-kitchen'] },
    width: { type: 'number', length: true, description: 'The new width of the hole in the wall, in metres. As wide as its wall allows.', examples: [0.9, 4], minimum: 0.3, maximum: limit('openingWidest') },
    keep: { type: 'string', enum: KEEPS, description: 'Which point stays put when the width changes: start (the end nearer the wall\'s start), centre or end. centre when left out.', examples: ['centre', 'start'] },
    height: { type: 'number', length: true, description: 'The new height of the opening, in metres.', examples: [2.1, 1.2], minimum: 0.2, maximum: 10 },
    sill: { type: 'number', length: true, description: 'The new height of its lower edge above the floor, in metres: a window\'s sill, or a door\'s threshold (0 takes the step away).', examples: [0.9, 0.6, 0], minimum: 0, maximum: 5 },
    type: { type: 'string', enum: ['door', 'window', 'opening'], description: 'Make it a door, a window or a doorless opening.', examples: ['door', 'opening'] },
    opens_into: { type: 'string', id: true, description: 'Doors: the room id it opens into, or "outside".', examples: ['hall', 'outside'] },
    hinge: { type: 'string', enum: ['start', 'end'], description: 'Doors: the end of the opening it hangs from, start being nearer the wall\'s start. For a sliding, pocket or folding door, the end it opens toward. hinged says the same in the person\'s terms.', examples: ['start', 'end'] },
    hinged: { type: 'string', enum: ['left', 'right'], description: 'Doors: the side it is hinged on as seen from a room, standing in it and facing the door: from seen_from, else the room it opens into.', examples: ['left', 'right'] },
    seen_from: { type: 'string', id: true, description: 'Doors, with hinged: the room id it is seen from, or "outside". The room it opens into when left out.', examples: ['bedroom', 'hall'] },
    kind: { type: 'string', enum: [...OPENING_KINDS], description: 'Its kind. A door: single (one swinging leaf, what a door with no kind is), double, sliding, pocket, folding, roller or garage. A window: single, double, sliding, fixed or high-level. A sliding, pocket, roller or garage door sweeps nothing and needs no swing.', examples: ['sliding', 'double', 'roller'] },
    remove: { type: 'boolean', description: 'true to take the opening out and leave the wall solid. Takes nothing else.', examples: [true] },
    room: { type: 'string', id: true, description: 'A room: with side, the opening moves to that side of it; with from, it is measured from that room\'s side.', examples: ['bath', 'hall'] },
    side: { type: 'string', enum: DIRECTIONS, description: 'With room: the side of that room whose wall it moves to.', examples: ['north'] },
    from: { type: 'string', enum: FROMS, description: 'What its place is measured and kept from: with room, a side of that room (its inside face); without, an end of its wall: start, end, or the end toward north, east, south or west.', examples: ['west', 'start'] },
    distance: { type: 'number', length: true, description: 'Metres from that side or end to the opening\'s nearer edge. Left out with from, the distance it has now is kept.', examples: [0.25, 0.1], minimum: 0, maximum: 100 },
    correction: CORRECTION_ARG,
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const id = openingArg(survey.plan, args['opening'])
      if (args['room'] !== undefined) roomArg(survey.plan, args['room'])
      if (args['opens_into'] !== undefined && args['opens_into'] !== 'outside') roomArg(survey.plan, args['opens_into'], 'opens_into room')
      if (args['seen_from'] !== undefined && args['seen_from'] !== 'outside') roomArg(survey.plan, args['seen_from'], 'seen_from room')
      const patch = changeOpening(survey, id, {
        ...(args['width'] !== undefined ? { width: args['width'] as number } : {}),
        ...(args['keep'] !== undefined ? { keep: args['keep'] as (typeof KEEPS)[number] } : {}),
        ...(args['height'] !== undefined ? { height: args['height'] as number } : {}),
        ...(args['sill'] !== undefined ? { sill: args['sill'] as number } : {}),
        ...(args['type'] !== undefined ? { type: args['type'] as 'door' | 'window' | 'opening' } : {}),
        ...(args['opens_into'] !== undefined ? { opensInto: args['opens_into'] as string } : {}),
        ...(args['hinge'] !== undefined ? { hinge: args['hinge'] as 'start' | 'end' } : {}),
        ...(args['hinged'] !== undefined ? { hinged: args['hinged'] as 'left' | 'right' } : {}),
        ...(args['seen_from'] !== undefined ? { seenFrom: args['seen_from'] as string } : {}),
        ...(args['kind'] !== undefined ? { kind: args['kind'] as OpeningKind } : {}),
        ...(args['remove'] === true ? { remove: true } : {}),
        ...(args['room'] !== undefined ? { room: args['room'] as string } : {}),
        ...(args['side'] !== undefined ? { side: args['side'] as Direction } : {}),
        ...(args['from'] !== undefined ? { from: args['from'] as From } : {}),
        ...(args['distance'] !== undefined ? { distance: args['distance'] as number } : {}),
      })
      // MSG-28: what lies on each side of it where it is after the change, and moved to another
      // wall, what lay on each side of its old one.
      const moved = patch.openings.get(id)?.wall !== undefined
      const between = openingBetween(moved ? surveyPlan(readingAfter(survey.plan, patch)) : survey, id)
      if (!between) return patch
      const was = moved ? openingBetween(survey, id) : ''
      if (was) return { ...patch, said: [...patch.said, say('en', 'edit.opening.otherWall', { before: was, after: between })] }
      return { ...patch, said: [...patch.said, `It is between ${between}.`] }
    })
  },
}

/** WRT-38: one wall's thickness, a wall placed by its face keeping that face. */
const changeWallTool: GridTool = {
  name: 'grid_change_wall',
  title: 'Change one wall\'s thickness',
  hint: 'change-plan',
  description:
    'Use this when the person asks to make one wall thicker or thinner, or gives the thickness of a wall the plan guessed or left out: "the outside wall is 450 mm", "make the wall between the bedrooms 100 mm". '
    + 'It sets that wall\'s own thickness. A wall placed by its face (face in the file, as a survey taped inside gives it) keeps that face where it is and grows or shrinks on its other side, so the rooms it was taped from keep their size; any other wall keeps its centre line and each face moves half the change. A wall that ended in it and would end short of the thinner wall is carried to its new centre line. It answers with every room whose area changed and the taped lengths against the plan as it now is. '
    + 'Do not use to change every wall of a kind or a named type (grid_change_type), or to move a wall (grid_move_room_side). In a plan with phases the change is building work; pass correction to fix the survey instead (grid_start_works and grid_set_phase set phases). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (18", 450 mm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    wall: { type: 'string', id: true, required: true, description: 'The id of the wall (grid_describe with for=agent lists them).', examples: ['ext-s', 'w3'] },
    thickness: { type: 'number', length: true, required: true, description: 'Its new thickness, in metres.', examples: [0.45, 0.1], minimum: 0.01, maximum: 3 },
    correction: CORRECTION_ARG,
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => changeWallThickness(survey, wallArg(survey.plan, args['wall']), args['thickness'] as number))
  },
}

const TYPE_KINDS = [...new Set([...WallKindSchema.options, ...DOOR_KINDS, ...WINDOW_KINDS])]
const TYPE_CLEARABLE = [...new Set(Object.values(TYPE_FIELDS).flat())].filter((field) => field !== 'name')

/** CNT-15 (C24): one change to a named type, which every part of the type takes. */
const changeTypeTool: GridTool = {
  name: 'grid_change_type',
  title: 'Change a wall, door or window type',
  hint: 'change-plan',
  description:
    'Use this when the person asks to change every wall, door or window of one kind at once, or to say what they are made of: "make every partition 120 mm", "all the internal doors are 0.9 m", "the glass partition is laminated glass", "raise the partitions to 2.6 m", "the party walls are 250 mm concrete". '
    + 'It changes one of the plan\'s named types (types in the plan: a wall type\'s thickness, height, kind, whether it is glazed and its material; a door or window type\'s size, kind and material), and every wall, door or window of the type takes it in the same change. With a new type id and a name it adds the type. parts gives the type to walls or openings by id, taking out their own values for what the type states; default makes it the type of every wall of its kind, or every door or window, that names none. clear takes a value out of the type. '
    + 'It answers with what changed, every part of the type and the area verdict. A part that states a value of its own keeps it, and the answer says so. '
    + 'Do not use for one door or window alone (grid_change_opening), or to move a wall (grid_move_room_side). Grid checks no material. It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    of: { type: 'string', enum: TYPE_OF, required: true, description: 'Which list the type is in: wall, door or window.', examples: ['wall', 'door'] },
    type: { type: 'string', id: true, required: true, description: 'The type\'s id: one of the plan\'s types to change, or a new id to add one (then give its name).', examples: ['partition-100', 'D90'] },
    name: { type: 'string', maxLength: 120, description: 'The type\'s name, as the person and the IFC call it.', examples: ['Stud partition 100', 'Internal door 900'] },
    thickness: { type: 'number', length: true, description: 'Wall types: the thickness, in metres.', examples: [0.1, 0.25], minimum: 0.01, maximum: 3 },
    height: { type: 'number', length: true, description: 'The height, in metres: a wall type\'s walls, or a door or window type\'s opening. A wall type with none takes its floor\'s height.', examples: [2.6, 2.1], minimum: 0.1, maximum: 30 },
    width: { type: 'number', length: true, description: 'Door and window types: the width of the hole in the wall, in metres.', examples: [0.9, 1.2], minimum: 0.3, maximum: limit('openingWidest') },
    sill: { type: 'number', length: true, description: 'Window types: the sill above the floor, in metres.', examples: [0.9], minimum: 0, maximum: 5 },
    kind: { type: 'string', enum: TYPE_KINDS, description: `A wall type: ${WallKindSchema.options.join(', ')} (the kinds a wall may be). A door type: single, double, sliding, pocket, folding, roller or garage. A window type: single, double, sliding, fixed or high-level.`, examples: ['partition', 'sliding'] },
    glazed: { type: 'boolean', description: 'Whether the type is glass: a glazed partition, a glazed door.', examples: [true] },
    material: { type: 'string', maxLength: 120, description: 'What it is made of, in the person\'s words; the IFC writes it, and "Not stated" when left out.', examples: ['Concrete', 'Laminated glass', 'Oak'] },
    clear: { type: 'array', description: 'Values to take out of the type, so its parts take their own or the default.', examples: [['height'], ['material']], items: { enum: TYPE_CLEARABLE }, minItems: 1, maxItems: TYPE_CLEARABLE.length },
    parts: { type: 'array', description: 'Walls (of=wall), doors or windows, by id, to give the type; each takes out its own values for what the type states.', examples: [['w-hall-bath', 'w-bed1-bed2'], ['door-bath']], items: { id: true }, minItems: 1, maxItems: 500 },
    default: { type: 'boolean', description: 'true makes it the type of every wall of its kind (or every door, or window) that names none: the template an office keeps.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    const set = Object.fromEntries(['name', 'thickness', 'height', 'width', 'sill', 'kind', 'glazed', 'material'].filter((field) => args[field] !== undefined).map((field) => [field, args[field] as string | number | boolean]))
    return writeChange(context, args, (survey) =>
      changeType(survey, {
        of: args['of'] as TypeOf,
        id: args['type'] as string,
        set,
        ...(args['clear'] === undefined ? {} : { clear: args['clear'] as string[] }),
        ...(args['parts'] === undefined ? {} : { parts: args['parts'] as string[] }),
        ...(args['default'] === true ? { makeDefault: true } : {}),
      })
    )
  },
}

const moveSideTool: GridTool = {
  name: 'grid_move_room_side',
  title: 'Move one side of a room',
  hint: 'change-plan',
  description:
    'Use this when the person asks to make a room deeper or wider by moving one of its walls, or to build out: "go out 3 m at the back, full width", "make the kitchen 1 m longer", "bring the bedroom wall in 0.5 m". '
    + 'It moves the wall on the named side of the room straight out (a positive distance) or in (negative), or to give the room an inside size (to: "the kitchen 4 m deep"); walls that end on it follow, and its doors and windows move with it. Doors and windows on the walls that grow keep their anchor or their place in the building, and a door that would end up between other rooms follows the wall where it can. It answers with every room whose area changed, what it guessed and what it could not keep. A move that would leave the drawing with a new problem is refused with the largest move that way that fits; call again with that by. '
    + 'Only a side square to the drawing moves: north is the top of the drawing. Do not use to add a separate room or to split one. In a plan with phases the change is building work; pass correction to fix the survey instead (grid_start_works and grid_set_phase set phases). It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room whose side moves.', examples: ['kitchen', 'bed1'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which side of the room: north (the top of the drawing), east, south or west.', examples: ['north', 'east'] },
    by: { type: 'number', length: true, description: 'Metres to move it: positive makes the room bigger, negative smaller. Pass by or to.', examples: [3, -0.5], minimum: -50, maximum: 50 },
    to: { type: 'number', length: true, description: 'The room\'s inside size across that side after the move, in metres: its depth for north or south, its width for east or west. Pass by or to.', examples: [4, 3.2], minimum: NARROWEST_ACROSS, maximum: 100 },
    correction: CORRECTION_ARG,
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    if (args['by'] === undefined && args['to'] === undefined) throw new ToolRefusal('Pass by (metres to move it) or to (the inside size it should have).')
    if (args['by'] !== undefined && args['to'] !== undefined) throw new ToolRefusal('Pass by or to, not both.')
    if (args['by'] === 0) throw new ToolRefusal('by is 0: nothing would move.')
    return writeChange(context, args, (survey, problemsOf) => {
      const id = roomArg(survey.plan, args['room'])
      const room = survey.byId.get(id)
      if (!room || room.polygon.length < 3) throw new EditRefused('That room has no outline Grid can measure; grid_check says why.')
      const side = args['side'] as Direction
      if (args['to'] === undefined) return sideMoveThatFits(survey, id, side, args['by'] as number, problemsOf)
      const now = insideAcross(survey, id, side)
      const by = (args['to'] as number) - now
      const across = side === 'north' || side === 'south' ? 'depth (north-south)' : 'width (east-west)'
      if (Math.abs(by) < 0.0005) throw new EditRefused(`${JSON.stringify(room.facts.name)} is ${now.toFixed(2)} m inside already, its ${across}.`)
      const patch = sideMoveThatFits(survey, id, side, by, problemsOf)
      return { ...patch, said: [`${JSON.stringify(room.facts.name)}: inside ${across} ${now.toFixed(2)} → ${(args['to'] as number).toFixed(2)} m.`, ...patch.said] }
    })
  },
}

const mirrorTool: GridTool = {
  name: 'grid_mirror',
  title: 'Mirror or turn the plan',
  hint: 'change-plan',
  description:
    'Use this when the person asks to flip the plan, mirror it, have it the other way round, or turn it a quarter or half round: "the lounge is on the right as you come in, flip it", "rotate it 90 degrees". '
    + 'how left-right swaps east and west, top-bottom swaps north and south; turn instead turns the whole plan by 90, 180 or 270 degrees (-90 is 270), counter-clockwise as Grid draws it, y up. Every room keeps its size and every door keeps opening into the same room. '
    + 'A mirror mirrors a north the plan states, so the swap is the real one; a turn keeps the north, so the building faces new ways. '
    + 'For "I drew it the wrong way round", pass keep_north: the building is mirrored and the north the plan states stays. On a plan with phases a mirror is a correction of the survey, not building work: pass correction. '
    + 'Do not use to turn the drawing for a picture (grid_view). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    how: { type: 'string', enum: MIRRORS, description: 'To mirror: left-right or top-bottom. Give how or turn, not both.', examples: ['left-right'] },
    keep_north: { type: 'boolean', description: 'With how: true keeps the north the plan states, for a plan drawn the wrong way round; false (left out) mirrors the north with the building.', examples: [true] },
    correction: CORRECTION_ARG,
    turn: { type: 'number', minimum: -270, maximum: 270, description: 'To turn instead: 90, 180, 270 or -90 degrees, counter-clockwise as Grid draws the plan (y up). Quarter turns only.', examples: [90] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    const how = args['how'] as Mirror | undefined
    const turn = args['turn'] as number | undefined
    if (how !== undefined && turn !== undefined) throw new ToolRefusal('Pass how to mirror or turn to turn, not both: make two calls for a mirror and a turn.')
    if (args['keep_north'] === true && how === undefined) throw new ToolRefusal('keep_north goes with how: a turn keeps the north already.')
    if (how === undefined && turn === undefined) throw new ToolRefusal('Pass how (left-right or top-bottom) to mirror the plan, or turn (90, 180, 270 or -90 degrees) to turn it.')
    // WRT-73: a correction mirrors or turns the whole plan, what is to be demolished with the rest.
    const all = (survey: Survey, stated: FloorPlan): Survey => (args['correction'] === true ? { ...survey, plan: stated } : survey)
    if (turn === undefined) return writeChange(context, args, (survey, _, stated) => mirrorPlan(all(survey, stated), how!, { keepNorth: args['keep_north'] === true }))
    const degrees = ((turn % 360) + 360) % 360
    if (!(TURNS as readonly number[]).includes(degrees)) throw new ToolRefusal(`turn is ${turn}: Grid turns a plan by quarter turns only, 90, 180, 270 or -90 degrees.`)
    return writeChange(context, args, (survey, _, stated) => turnPlanBy(all(survey, stated), degrees as Turn))
  },
}

// ---------------------------------------------------------------------------------------------
// grid_write_rooms

/** The rooms text a tool call may pass, at most. */
export const ROOMS_TEXT_MAX = 200_000

/** BRF-6: a first layout's part of the answer, or null when rooms text was written. */
const LAYOUT_OUTPUT = {
  type: ['object', 'null'],
  properties: {
    shape: STRING,
    rooms: STRING,
    outline: listSchema(NUMBER),
    added: NULLABLE_STRING,
    notKept: listSchema(objectSchema({ room: STRING, name: STRING, text: STRING, by: NUMBER })),
    notPlaced: listSchema(STRING),
    touch: objectSchema({ wished: NUMBER, held: NUMBER }),
  },
  required: ['shape', 'rooms', 'outline', 'added', 'notKept', 'notPlaced', 'touch'],
}

const ROOMS_EXAMPLE = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room living "Living room" living 4.4 x 4.2',
  'room kitchen "Kitchen" kitchen 4.4 x 3.0 north of living',
  'room hall "Hall" corridor 1.3 x * east of living until kitchen',
  'door d1 between hall and living, 0.1 from south, 0.8 wide, opens into living',
  'door front in hall north, centred, 0.9 wide, opens in, hinged east',
  'window w1 in living south, centred, 1.8 wide, sill 0.6, height 1.5',
].join('\n')

/**
 * BRF-6 and HND-12: grid_write_rooms writes from exactly one of rooms text, a first layout from
 * the brief and a phone room scan. Refused, naming them, when none or more than one is given.
 */
function refuseWaysIn(args: Readonly<Record<string, unknown>>): void {
  // CMD-38: roomsFile is rooms text too, read from the project. CMD-43: from reads a drawing.
  const given = (['rooms', 'roomsFile', 'layout', 'scan', 'from'] as const).filter((name) => args[name] !== undefined)
  if (given.length === 0) throw new ToolRefusal('Pass rooms (the rooms text to write), roomsFile (a rooms text file in the project), layout (tidy or sizes, a first layout from the brief beside the plan), scan (a phone room scan file in the project) or from (a DXF or IFC drawing in the project): one of the five.')
  if (given.includes('roomsFile') && given.length > 1) throw new ToolRefusal(`Pass roomsFile or ${given.find((name) => name !== 'roomsFile')}, not both: roomsFile is the rooms text to write, read from the project.`)
  if (given.includes('from') && given.length > 1) throw new ToolRefusal(`Pass from or ${given.find((name) => name !== 'from')}, not both: from reads a DXF or IFC drawing into rooms text, in place of the others.`)
  if (given.length === 3) throw new ToolRefusal('Pass one of rooms, layout and scan, not all three: each writes the plan in place of the others.')
  if (given.length === 2) {
    const [first, second] = given
    const why = second === 'scan' ? (first === 'layout' ? 'layout writes a first layout from the brief, scan writes the plan from a phone room scan' : 'scan writes the plan from a phone room scan, in place of rooms text') : 'layout writes a first layout from the brief, in place of rooms text'
    throw new ToolRefusal(`Pass ${first} or ${second}, not both: ${why}.`)
  }
  for (const name of ['layers', 'units'] as const) if (args[name] !== undefined && args['from'] === undefined) throw new ToolRefusal(`${name} goes with from: it says how to read a DXF drawing.`)
}

const writeRoomsTool: GridTool = {
  name: 'grid_write_rooms',
  title: 'Write the plan rooms first',
  hint: 'change-plan',
  description:
    'Use this when you write a plan, or change more than one door or wall of it: the main way to write a plan. Name each room with its inside size, east-west by north-south, and where it goes (at x,y for the first, then "north of living"; * x 1.6 with until <room> stretches it); name each door and window by the two rooms it joins or the room side it is in, with its distance from a corner. '
    + 'Grid works out the walls, their kinds, each room\'s boundary and each opening\'s place, and writes them into the plan file, which stays the source of truth: its walls stay there and stay editable. '
    + 'To change a plan, read it back with grid_describe as=rooms, change that text and pass it here: rooms text read from an older plan, or written over a plan changed some other way, is refused with the difference, and nothing is written (replace=true writes over it). Overlapping rooms and gaps that are neither wall nor room are refused, naming both rooms. '
    + 'A size may say centre or outside (8 x 10 outside: to the outside faces); inside is the default. What rooms cannot say (a free-standing wall, a room with a hole) is written raw, as one line of Grid\'s own JSON: raw wall {...}. '
    + `${ROOM_NAMES_TRAVEL} `
    + 'In place of rooms, layout=tidy writes a first layout from the brief (grid_write_brief) in a rectangle, naming each size not kept and by how much; layout=sizes keeps every size. '
    + 'A plain number is metres; a length may carry its unit in one word (360cm, 3600mm, 12ft, 12ft6in, 12\'6"). A display line (display ft-in, display mm, display m decimal comma) records how the person reads lengths: drawings, figures and sheets follow it, and the plan file stays in metres. Under a display that is not metres, say what a plain number is on that line (display ft-in numbers ft, display mm numbers mm), or write every length with its unit: a plain number is refused there. '
    + 'From a phone room scan: pass scan, the scan file in the project (Apple\'s room model, as JSON), in place of rooms. Grid pairs each wall\'s two faces into one wall as thick as the gap between them, takes a wall seen from one side as an outside wall of its usual thickness, places the doors and windows on their walls, keeps the scan beside the plan as <plan>.scan.json keyed by its ids, and lists everything it assumed to confirm with the person. A re-scan keeps the plan\'s ids for the parts it finds again. '
    + 'Rooms text writes far more than rectangles (the rooms argument holds its whole grammar, each topic with an example, and grid://guide/rooms serves it): floors with their level, elevation and height, a floor copied from another and a stair or shaft standing through floors; rooms drawn as a polygon at any angle and corners cut out; a curved wall written raw with its arc\'s centre and sweep in degrees; a raw room bounded by its own walls; outdoor rooms (garden, terrace, balcony); a room\'s own height and its floor set lower or higher; rooms open to each other; a floor\'s roof written raw (gable, hip); and a room type written once as a unit and placed many times by place and repeat, mirrored. Write a whole building, every floor, in one rooms text: a long one goes in a file in the project, passed as roomsFile. '
    + `${PHASE_RULES} `
    + 'From a DXF or IFC drawing (a survey, a CAD plan, a BIM model): pass from, the drawing in the project, in place of rooms, and Grid reads its rooms (room outlines, an IFC\'s spaces, or the regions its wall faces close round), their names, the doors and windows by the gaps they stand in, and the floors with their elevations, into rooms text it writes beside the plan as <plan>.rooms, then writes the plan from it. The answer says how each DXF layer or IFC class was read (layers=walls=A-WALL;doors=A-DOOR reads a layer otherwise), what was assumed to confirm with the person, each room\'s area against the drawing and each opening\'s distance from it; every room, wall and opening keeps its DXF handle or IFC GlobalId as the fact handle or guid. Check the rooms text, change a line and pass it back as roomsFile. Do not retype a drawing\'s coordinates by hand. '
    + 'Pass one of rooms, roomsFile, layout, scan and from. '
    + 'Fixtures and furniture are item lines (item tub bath in bath against north, at west): a text with item lines replaces the file\'s items; one with none keeps them, each against a wall moved with it, with their ids, and lists them with their rooms and any a new wall runs into (itemsKept). '
    + 'Do not use for one door or window (grid_change_opening) or one wall moved (grid_move_room_side), nor for one building of a site of many (grid_write_building). It replaces the plan file. Rooms text that names fewer floors than the plan holds is refused, naming the floors it would drop (replace=true drops them); rooms text with no rooms is always refused.',
  args: {
    plan: { ...PLAN_ARG, description: 'The plan file to write, inside the project folder, ending in .json. The project\'s own plan.json when left out.' },
    rooms: {
      type: 'string',
      lines: true,
      maxLength: ROOMS_TEXT_MAX,
      // CMD-38: the whole grammar, by topic, each with one example (roomsGrammar.ts).
      description: `The rooms text, one statement a line; pass it, roomsFile, layout or scan. The whole grammar, by topic:\n\n${roomsGrammarText()}`,
      examples: [ROOMS_EXAMPLE],
    },
    // CMD-38: rooms text from a file in the project, so a long building is not pasted into the call.
    roomsFile: { type: 'string', maxLength: PATH_MAX, description: 'In place of rooms: a file of rooms text, as a path inside the project folder (such as building.rooms). Written as if its text were passed as rooms.', examples: ['building.rooms'] },
    scan: { type: 'string', maxLength: PATH_MAX, description: 'In place of rooms: a phone room scan, as a path inside the project folder (Apple\'s room model saved as JSON). The plan is written from it, and the scan kept beside the plan.', examples: ['scans/flat.json'] },
    // CMD-43: a DXF or IFC drawing, read into rooms text beside the plan.
    from: { type: 'string', maxLength: PATH_MAX, description: 'In place of rooms: a DXF or IFC drawing, as a path inside the project folder (ending in .dxf or .ifc). Its rooms text is written beside the plan as <plan>.rooms, then the plan from it.', examples: ['survey.dxf', 'model.ifc'] },
    layers: { type: 'string', maxLength: 4000, description: 'With from and a DXF: what its layers hold, over what their names say, as <what>=<layer>,<layer>;... with what one of walls, doors, windows, openings, rooms (closed room outlines), names (room names) and nothing.', examples: ['walls=A-WALL,A-WALL-EXT;doors=A-DOOR;rooms=A-AREA'] },
    units: { type: 'string', enum: ['m', 'cm', 'mm', 'in', 'ft'], description: 'With from and a DXF that states no unit (or the wrong one): the unit it is drawn in.', examples: ['mm'] },
    replace: { type: 'boolean', description: 'true to write over a plan that was not written from this text, scan or drawing, or was changed since. Refused with the difference when left out.', examples: [true] },
    // BRF-6: a first layout from the brief, in place of rooms text.
    layout: { type: 'string', enum: [...LAYOUT_SHAPES], description: 'In place of rooms: a first layout from the brief beside the plan. tidy: a rectangle; sizes: every size kept.', examples: ['tidy'] },
  },
  outputSchema: objectSchema({
    written: STRING,
    rooms: listSchema(objectSchema({ id: STRING, name: STRING, floor: STRING, width: { type: 'number' }, depth: { type: 'number' }, area: { type: 'number' }, basis: { type: ['string', 'null'] } })),
    walls: { type: 'number' },
    openings: { type: 'number' },
    guesses: listSchema(STRING),
    warnings: listSchema(STRING),
    verdict: { type: ['string', 'null'] },
    drawingProblems: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }),
    // WRT-57: what grid_check lists (the record's count), before and after; null for a scan.
    toLookAt: { type: ['object', 'null'], properties: { before: { type: 'number' }, after: { type: 'number' } }, required: ['before', 'after'] },
    // WRT-57: each door that joins other rooms than before, one that no longer leads outside first.
    doors: listSchema(STRING),
    // BRF-1: the brief's lines, and the one reminder when a first plan has no brief beside it.
    brief: BRIEF_OUTPUT,
    reminder: NULLABLE_STRING,
    // BRF-6: the first layout from the brief, or null.
    layout: LAYOUT_OUTPUT,
    // HND-12: what a scan gave, or null for rooms text.
    scan: {
      type: ['object', 'null'],
      properties: {
        evidence: STRING,
        paired: listSchema(objectSchema({ wall: STRING, faces: listSchema(STRING), thickness: { type: 'number' } })),
        oneSided: listSchema(STRING),
        areas: listSchema(objectSchema({ id: STRING, name: STRING, area: { type: 'number' }, scanArea: { type: 'number' }, from: STRING, difference: { type: 'number' } })),
        assumed: listSchema(objectSchema({ text: STRING, parts: listSchema(objectSchema({ part: STRING, id: STRING })), value: NULLABLE_STRING })),
        leftOut: listSchema(STRING),
        match: objectSchema({ kept: { type: 'number' }, fresh: { type: 'number' }, gone: listSchema(objectSchema({ scanId: STRING, part: STRING, id: STRING })) }),
      },
      required: ['evidence', 'paired', 'oneSided', 'areas', 'assumed', 'leftOut', 'match'],
    },
    // CMD-43: what a drawing gave, or null for rooms text.
    drawing: {
      type: ['object', 'null'],
      properties: {
        roomsFile: STRING,
        format: STRING,
        unit: STRING,
        layers: listSchema(objectSchema({ layer: STRING, entities: NUMBER, readAs: STRING, why: STRING })),
        areas: listSchema(objectSchema({ id: STRING, name: STRING, area: NUMBER, drawn: NUMBER, stated: { type: ['number', 'null'] }, source: NULLABLE_STRING })),
        openings: listSchema(objectSchema({ id: STRING, kind: STRING, source: NULLABLE_STRING, written: STRING, wall: NULLABLE_STRING, off: { type: ['number', 'null'] } })),
        factName: STRING,
        assumed: listSchema(STRING),
        leftOut: listSchema(STRING),
      },
      required: ['roomsFile', 'format', 'unit', 'layers', 'areas', 'openings', 'factName', 'assumed', 'leftOut'],
    },
    // HND-11: each length taped on site against the plan as written; empty when it keeps none.
    taped: TAPED_OUTPUT,
    // WRT-46: the fixtures and furniture the file keeps, which rooms text does not write: where each stands now. Empty for a scan.
    itemsKept: listSchema(objectSchema({ id: STRING, kind: STRING, at: listSchema(NUMBER), floor: STRING, room: NULLABLE_STRING, worthALook: listSchema(STRING) })),
  }),
  run(args, context) {
    const project = projectOf(context)
    const shape = args['layout'] as LayoutShape | undefined
    refuseWaysIn(args)
    try {
      const file = planFileOf(project, args['plan'])
      if (args['scan'] !== undefined) {
        const done = writeScanIntoProject(project, args['scan'] as string, file, { replace: args['replace'] === true })
        const c = done.conversion
        return {
          text: done.lines.join('\n').replace(/--replace/g, 'replace=true').replace(/grid check/g, 'grid_check'),
          data: {
            written: done.written,
            rooms: c.roomFacts.map((x) => ({ id: x.id, name: x.name, floor: x.floor, width: x.width, depth: x.depth, area: x.area, basis: x.basis })),
            walls: c.plan.walls.length,
            openings: c.plan.openings.length,
            guesses: [],
            warnings: [...c.warnings],
            verdict: done.verdict,
            drawingProblems: done.drawingProblems,
            toLookAt: null,
            doors: [],
            brief: done.brief,
            reminder: done.reminder,
            layout: null,
            drawing: null,
            taped: done.taped,
            itemsKept: [],
            scan: {
              evidence: done.evidence,
              paired: c.paired,
              oneSided: c.oneSided,
              areas: c.rooms.map((r) => ({ id: r.id, name: r.name, area: r.area, scanArea: r.scanArea, from: r.from, difference: r.difference })),
              assumed: c.assumed,
              leftOut: c.leftOut,
              match: c.match,
            },
          },
        }
      }
      if (args['from'] !== undefined) {
        const read = writeDrawingIntoProject(project, args['from'] as string, file, {
          replace: args['replace'] === true,
          brief: true,
          ...(args['layers'] === undefined ? {} : { layers: args['layers'] as string }),
          ...(args['units'] === undefined ? {} : { units: args['units'] as string }),
        })
        const done = read.done
        const r = done.result
        const g = read.reading
        return {
          text: read.lines.join('\n').replace(/--replace/g, 'replace=true').replace(/grid write (\S+\.rooms)/g, 'grid_write_rooms roomsFile=$1'),
          data: {
            written: done.written,
            rooms: r.rooms.map((x) => ({ id: x.id, name: x.name, floor: x.floor, width: x.width, depth: x.depth, area: x.area, basis: x.basis })),
            walls: r.walls.length,
            openings: r.openings.length,
            guesses: [...r.guesses],
            warnings: r.warnings.map((w) => `${w.code}: ${w.message}`),
            verdict: done.verdict,
            drawingProblems: done.drawingProblems,
            toLookAt: done.toLookAt,
            doors: [...done.doors],
            brief: done.brief,
            reminder: done.reminder,
            layout: null,
            scan: null,
            drawing: {
              roomsFile: read.roomsFile,
              format: read.drawing.format,
              unit: read.drawing.unit.name,
              layers: read.drawing.layers.map((l) => ({ ...l })),
              areas: g.rooms.map((x) => ({ id: x.id, name: x.name, area: x.area, drawn: x.drawn, stated: x.stated, source: x.source })),
              openings: g.openings.map((o) => ({ ...o })),
              factName: g.factName,
              assumed: [...g.assumed],
              leftOut: [...g.leftOut],
            },
            taped: done.taped,
            itemsKept: done.itemsKept,
          },
        }
      }
      const options = { replace: args['replace'] === true, brief: true }
      const laid = shape === undefined ? null : writeLayout(project, file, shape, options)
      const text = args['roomsFile'] === undefined ? (args['rooms'] as string) : readRoomsFile(project, args['roomsFile'] as string)
      const done = laid?.done ?? writeRoomsIntoProject(project, text, file, options)
      const r = done.result
      return {
        text: (laid?.lines ?? done.lines).join('\n'),
        data: {
          written: done.written,
          rooms: r.rooms.map((x) => ({ id: x.id, name: x.name, floor: x.floor, width: x.width, depth: x.depth, area: x.area, basis: x.basis })),
          walls: r.walls.length,
          openings: r.openings.length,
          guesses: [...r.guesses],
          warnings: r.warnings.map((w) => `${w.code}: ${w.message}`),
          verdict: done.verdict,
          drawingProblems: done.drawingProblems,
          toLookAt: done.toLookAt,
          doors: [...done.doors],
          brief: done.brief,
          reminder: done.reminder,
          layout: laid?.layout ?? null,
          scan: null,
          drawing: null,
          taped: done.taped,
          itemsKept: done.itemsKept,
        },
      }
    } catch (error) {
      if (error instanceof RoomsRefused) throw new ToolRefusal(error.problems.length > 1 ? `The rooms text was not written, and the plan is as it was. ${error.problems.length} problems:\n${error.problems.map((p) => `  ${p}`).join('\n')}` : error.message.replace(/--replace/g, 'replace=true').replace(/grid describe --as rooms/g, 'grid_describe as=rooms'))
      throw asRefusal(error)
    }
  },
}

export const WRITE_TOOLS: readonly GridTool[] = [exportTool, sheetTool, writeRoomsTool, changeOpeningTool, changeWallTool, changeTypeTool, moveSideTool, mirrorTool]
