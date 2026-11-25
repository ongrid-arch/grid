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
import { planFloors, planInState, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { keptDerived, LAYOUT_SHAPES, type LayoutShape } from '@ongrid/floorplan/rooms'
import { doorsThatChangedRooms } from '@ongrid/floorplan/geometry/rules/doors'
import { EXPORT_FORMATS, isExportFormat } from '@ongrid/floorplan/export'
import { inspectPlan } from '@ongrid/rules'
import { approximatedText, checkExportRequest, dxfProfileLine, ExportWriteFailed, exportIntoProject, leftOutText } from '../command/export'
import { DXF_PROFILE_FILE, DxfProfileRefused } from '../export/dxfProfile'
import { UsageError } from '../command/options'
import { PlanRefused } from '../command/plan'
import { changeOpening, DIRECTIONS, EditRefused, FROMS, insideAcross, KEEPS, MIRRORS, mirrorPlan, moveRoomSide, applyPatch, readingAfter, TURNS, turnPlanBy, type Direction, type From, type Mirror, type Patch, type Turn } from '../edit/edits'
import { parseSheetWordsChecked } from '../sheet/claims'
import { SheetWordsRefused, sheetWordsJsonSchema, sheetWordsProblem } from '@ongrid/floorplan/types/sheet'
import { checkSheetRequest, drawingIntoProject, drawingLine, readSheetWords, sheetIntoProject, type SheetKind } from '../sheet/sheetFile'
import { PAPER_NAMES, SCALE_MAX } from '../sheet/drawingPapers'
import { askedLanguage } from '../command/language'
import { RoomsRefused, writeRoomsIntoProject } from '../command/write'
import { writeScanIntoProject } from '../command/scan'
import { PATH_MAX, PathRefused, quoted } from '../fs/projectFiles'
import { ROOM_NAMES_TRAVEL } from './protocol'
import { comparePlans } from '../quantities/compare'
import { surveyPlan, type Survey } from '../quantities/survey'
import { LANGUAGE_ARG, openingBetween } from './readTools'
import { briefAnswer } from '../brief/answer'
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
  ToolRefusal,
  type GridTool,
  type ToolContext,
} from './toolkit'

export const EXPORT_TOOL_NAME = 'grid_export'

const q = (text: string): string => JSON.stringify(text)

// ---------------------------------------------------------------------------------------------
// grid_export

/** The command's messages name its options; a tool names its arguments. */
function asArguments(message: string): string {
  return message.replace(/--(format|floor|layout|sheet)\b/g, '$1')
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
    + `A dxf is in metres, with doors and windows as blocks, filled walls, dimensions, room tags and an A3 sheet; it takes its layer names and pens from ${DXF_PROFILE_FILE} in the project folder when there is one, and answers with that file as dxfProfile. `
    + `${ROOM_NAMES_TRAVEL} `
    + 'Do not use for a picture to look at (grid_view). For a PDF to read or print, use grid_sheet; JPG is not made. The plan must be a file inside the project folder: any other path is refused.',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['floor-plan.json', 'plan.json'] },
    format: { type: 'string', required: true, enum: EXPORT_FORMATS, description: 'The file format.', examples: ['dxf', 'ifc'] },
    floor: { ...FLOOR_ARG, description: 'dxf, obj and glb only: a floor id from the plan\'s "floors". The lowest floor when left out.' },
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
    note: { type: ['string', 'null'] },
    dxfProfile: { type: ['string', 'null'] },
  }),
  run(args, context) {
    const project = projectOf(context)
    const plan = args['plan'] as string
    const format = args['format'] as string
    const floor = args['floor'] as string | undefined
    if (!isExportFormat(format)) throw new ToolRefusal(`Pass format: one of ${EXPORT_FORMATS.join(', ')}.`)
    // The floor is checked against the plan first, so an unknown one is not repeated back (MS-19).
    if (floor !== undefined) floorArg(readPlan(context, plan).loaded.plan, floor)
    try {
      checkExportRequest({ format, floor })
      const done = exportIntoProject(project, plan, format, { floor })
      const written = project.relative(done.written)
      const lines = [`Wrote ${quoted(written)} in the project folder.`]
      if (done.note) lines.push(done.note)
      // HND-6: what this file leaves out, which the file says too.
      const left = leftOutText(done.leftOut)
      if (left !== null) lines.push(left)
      const curves = approximatedText(done.approximated)
      if (curves !== null) lines.push(curves)
      // HND-1: a DXF names the project's profile when its layers and pens came from one.
      if (done.dxfProfile !== null) lines.push(dxfProfileLine(done.dxfProfile))
      return { text: lines.join('\n'), data: { written, format, leftOut: done.leftOut.length, leftOutParts: done.leftOut, approximated: done.approximated, note: done.note ?? null, dxfProfile: done.dxfProfile } }
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
const DRAWING_ARGS = ['scale', 'paper', 'floor', 'roomSizes'] as const

const sheetTool: GridTool = {
  name: SHEET_TOOL_NAME,
  title: 'Make a PDF sheet',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a PDF to read, print or send: layout client for the person the house is for (a cover with the 3D model and key figures, then a page per floor with its drawing and room areas), or layout check for whoever checks the plan (every id, every room\'s use, and what grid check finds on each floor). '
    + 'The words of a client sheet (name, headline, intro, a few paragraphs per floor) are yours to write: pass them as sheet, or Grid reads sheet.json beside the plan. The name is the one the person gave the building, else the plan\'s; never a name from an example. Grid draws only what the plan holds: no furniture or landscape. Every page carries "General guidance, not your local rules". '
    + 'It writes the PDF into the exports folder beside the plan, replacing an earlier sheet of the same name and layout, and answers with the path and what is on each page. It never changes the plan. '
    + `${ROOM_NAMES_TRAVEL} `
    + 'Layout drawing (SHT-6) is one floor to print and measure: drawn at a true scale (scale, N in 1:N) on a paper (A4 to A0), in black on white with walls joined, dimensions along the walls and room sizes, with a scale bar, a caption, north, a title block and the label; it writes a vector PDF, an SVG and a PNG, and returns the PNG to look at. Left out, the scale is the largest of 1:100, 1:200 and 1:500 the floor fits and the paper the smallest; a floor too large for the paper asked for is refused with what fits. '
    + 'Do not use for a single picture (grid_view) or a file for another program (grid_export).',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['plan.json'] },
    layout: { type: 'string', required: true, enum: ['client', 'check', 'drawing'], description: 'client, check, or drawing for one floor at a true scale.', examples: ['client', 'check', 'drawing'] },
    sheet: {
      type: 'object',
      description: 'Client only: the words, as sheet.json holds them. sheet.json beside the plan is read when left out.',
      examples: [{ version: '1', name: 'Example House', headline: 'A private retreat for one', intro: ['A two-storey home for work and rest.'], floors: { ground: ['The study sits beside the entry.'] } }],
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
    floor: { ...FLOOR_ARG, description: 'Drawing only: the floor to draw. The lowest when left out.' },
    roomSizes: { type: 'boolean', description: 'Drawing only: each room\'s width and depth along its walls. true when left out.', examples: [true, false] },
    language: LANGUAGE_ARG,
  },
  outputSchema: objectSchema({
    written: STRING, layout: STRING, pages: { type: 'array', items: objectSchema({ kind: STRING, title: NULLABLE_STRING, floor: STRING }, ['kind', 'title']) }, leftOut: { type: 'number' }, note: { type: ['string', 'null'] },
    // SHT-6: a drawing's other files, its scale and its paper; null for a client or check sheet.
    svg: NULLABLE_STRING, png: NULLABLE_STRING, scale: { type: ['number', 'null'] }, paper: NULLABLE_STRING,
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
        }
        const done = await drawingIntoProject(project, file, asked, words, askedLanguage(args['language'], 'language'))
        const written = { pdf: project.relative(done.written.pdf), svg: project.relative(done.written.svg), png: project.relative(done.written.png) }
        const lines = [drawingLine(done.sheet), `Wrote ${quoted(written.pdf)}, ${quoted(written.svg)} and ${quoted(written.png)} in the project folder. Print the PDF at 100%, not fitted to the page, to keep the scale. Look at the picture before you describe it.`]
        if (done.note) lines.push(done.note)
        const leftOut = done.loaded.broken.size
        if (leftOut > 0) lines.push(leftOutLine(leftOut))
        const pages = [{ kind: 'drawing', title: done.sheet.words.drawing, floor: done.sheet.floor }]
        return {
          text: lines.join('\n'),
          data: { written: written.pdf, layout, pages, leftOut, note: done.note ?? null, svg: written.svg, png: written.png, scale: done.sheet.scale, paper: done.sheet.paper.name },
          image: { data: done.png, mimeType: 'image/png' as const },
        }
      }
      const words = layout === 'check'
        ? null
        : given !== undefined
          ? parseSheetWordsChecked(given, planFloors(loaded.plan).map((floor) => floor.id))
          : readSheetWords(project, file, loaded, undefined)
      const done = await sheetIntoProject(project, file, layout, words, askedLanguage(args['language'], 'language'))
      const written = project.relative(done.written)
      const lines = [`Wrote ${quoted(written)} in the project folder: ${done.pages.length} pages.`]
      if (done.note) lines.push(done.note)
      const leftOut = done.loaded.broken.size
      if (leftOut > 0) lines.push(leftOutLine(leftOut))
      return { text: lines.join('\n'), data: { written, layout, pages: done.pages, leftOut, note: done.note ?? null, svg: null, png: null, scale: null, paper: null } }
    } catch (error) {
      if (error instanceof SheetWordsRefused) throw new ToolRefusal(`The sheet words: ${error.message}.`)
      if (error instanceof ExportWriteFailed) throw new ToolRefusal(error.message)
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

export const EDIT_OUTPUT = objectSchema({
  written: STRING,
  changed: listSchema(STRING),
  verdict: STRING,
  drawingProblems: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }),
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
})

function errorsOf(plan: FloorPlan): Array<{ id: string; message: string }> {
  return validatePlan(plan).issues.filter((i) => i.severity === 'error').map((i) => ({ id: i.id, message: i.message }))
}

/** Applies a patch to the plan file, or refuses it with nothing written. */
export function writeChange(context: ToolContext, args: Record<string, unknown>, make: (survey: Survey) => Patch): { text: string; data: Record<string, unknown> } {
  const { project, file, loaded } = readPlan(context, args['plan'], { whole: true })
  const out = (args['out'] as string | undefined) ?? file
  if (!out.toLowerCase().endsWith('.json')) throw new ToolRefusal('out must name a .json file.')
  const before = surveyPlan(loaded.plan)
  let patch: Patch
  try {
    patch = make(before)
  } catch (error) {
    if (error instanceof EditRefused) throw new ToolRefusal(`${error.message} Nothing was written.`)
    throw error
  }
  // CNT-10: a fit-out's base is read-only; in a plan with phases, the change is the work.
  if (loaded.base !== undefined) {
    const touched = baseTouched(patch, loaded.base)
    if (touched.length > 0) throw new ToolRefusal(baseRefusal(touched, loaded.base.file))
  }
  patch = phasedPatch(loaded.plan, patch)
  // A plan written rooms first keeps its derived boundaries derived through Grid's own edits (WRT-2).
  const after = keptDerived(loaded.plan.rooms, readingAfter(loaded.plan, patch) as unknown as Record<string, unknown>) as unknown as FloorPlan
  const oldErrors = errorsOf(loaded.plan)
  const newErrors = errorsOf(after)
  const known = new Set(oldErrors.map((e) => `${e.id}|${e.message}`))
  const fresh = newErrors.filter((e) => !known.has(`${e.id}|${e.message}`))
  if (fresh.length > 0) {
    throw new ToolRefusal(`That change would break the drawing, so nothing was written: ${q(fresh[0]!.id)}: ${fresh[0]!.message}${fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : ''}`)
  }
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
    next = keptDerived(loaded.plan.rooms, applyPatch(raw, patch))
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
  const drawingProblems = { before: validatePlan(loaded.plan).issues.length, after: validatePlan(after).issues.length }
  // The files as written, before and after (MSG-4): a field Grid does not read is kept by the change, and counted.
  // CNT-10: a fit-out's files are read with its base, as the command reads them.
  const withBase = loaded.base === undefined ? {} : { base: loaded.base.plan }
  const toLookAt = { before: inspectPlan(raw, withBase).count, after: inspectPlan(next, withBase).count }
  const guessed = [...(patch.guessed ?? [])]
  const couldNotKeep = [...(patch.notKept ?? [])]
  // BRF-1: the brief beside the plan the change read, against the plan as it now is.
  const brief = briefAnswer(project, file, after)
  // HND-11 (lab WR-14): the taped lengths against the plan as it now is.
  const taped = tapedRows(after)
  const text = [
    ...patch.said,
    ...guessed.map((line) => `Guessed: ${line}`),
    ...couldNotKeep.map((line) => `Could not keep: ${line}`),
    verdict,
    ...doors,
    `To look at: ${toLookAt.before} → ${toLookAt.after}, of them problems in the drawing ${drawingProblems.before} → ${drawingProblems.after}. grid_check lists them.`,
    ...brief.text,
    ...tapedTable(taped, { max: TAPED_ROWS_IN_AN_EDIT }),
    `Wrote ${quoted(written)}.`,
  ].join('\n')
  return { text, data: { written, changed: [...patch.said], verdict, drawingProblems, toLookAt, doors, guessed, couldNotKeep, brief: brief.data, taped, ...(patch.extra ?? {}) } }
}

const changeOpeningTool: GridTool = {
  name: 'grid_change_opening',
  title: 'Change or remove a door or window',
  hint: 'change-plan',
  description:
    'Use this when the person asks to make a door or window wider or narrower, change which room a door opens into or which side it is hinged on, make it a sliding, double, folding, pocket, roller or garage door (or a fixed, sliding or high-level window), raise or lower a sill, turn a window into a door, or take a door or window out: "bathroom door to 90 cm, opening outwards", "hinged on the left as seen from the bedroom", "make the dock door a roller door", "block the kitchen door", "a 4 m opening to the garden". '
    + 'It changes one opening in place and answers with what changed and the area verdict. A width that does not fit is refused with the free stretches of the wall, and nothing is written. '
    + 'To move it to another wall, pass room and side ("the bathroom door to its north wall"); to place it, from and distance, as rooms text does ("0.25 from west"): from a side of room, or without room from an end of its wall. Given from, it keeps that distance when walls move later (its anchor). '
    + 'Do not use to move a wall (grid_move_room_side). Grid has no roof windows. It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    opening: { type: 'string', id: true, required: true, description: 'The id of the door, window or opening to change (grid_describe with for=agent lists them).', examples: ['door-bath', 'win-kitchen'] },
    width: { type: 'number', length: true, description: 'The new width of the hole in the wall, in metres.', examples: [0.9, 4], minimum: 0.3, maximum: 20 },
    keep: { type: 'string', enum: KEEPS, description: 'Which point stays put when the width changes: start (the end nearer the wall\'s start), centre or end. centre when left out.', examples: ['centre', 'start'] },
    height: { type: 'number', length: true, description: 'The new height of the opening, in metres.', examples: [2.1, 1.2], minimum: 0.2, maximum: 10 },
    sill: { type: 'number', length: true, description: 'Windows: the new sill above the floor, in metres.', examples: [0.9, 0.6], minimum: 0, maximum: 5 },
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
      const between = openingBetween(survey, id)
      return between ? { ...patch, said: [...patch.said, `It is between ${between}.`] } : patch
    })
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
    width: { type: 'number', length: true, description: 'Door and window types: the width of the hole in the wall, in metres.', examples: [0.9, 1.2], minimum: 0.3, maximum: 20 },
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
    + 'It moves the wall on the named side of the room straight out (a positive distance) or in (negative), or to give the room an inside size (to: "the kitchen 4 m deep"); walls that end on it follow, and its doors and windows move with it. Doors and windows on the walls that grow keep their anchor or their place in the building, and a door that would end up between other rooms follows the wall where it can. It answers with every room whose area changed, what it guessed and what it could not keep. '
    + 'Only a side square to the drawing moves: north is the top of the drawing. Do not use to add a separate room or to split one. It replaces the plan file unless out is given. Lengths are metres, or text with their unit (12\'6", 360 cm).',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room whose side moves.', examples: ['kitchen', 'bed1'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which side of the room: north (the top of the drawing), east, south or west.', examples: ['north', 'east'] },
    by: { type: 'number', length: true, description: 'Metres to move it: positive makes the room bigger, negative smaller. Pass by or to.', examples: [3, -0.5], minimum: -50, maximum: 50 },
    to: { type: 'number', length: true, description: 'The room\'s inside size across that side after the move, in metres: its depth for north or south, its width for east or west. Pass by or to.', examples: [4, 3.2], minimum: 0.3, maximum: 100 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    if (args['by'] === undefined && args['to'] === undefined) throw new ToolRefusal('Pass by (metres to move it) or to (the inside size it should have).')
    if (args['by'] !== undefined && args['to'] !== undefined) throw new ToolRefusal('Pass by or to, not both.')
    if (args['by'] === 0) throw new ToolRefusal('by is 0: nothing would move.')
    return writeChange(context, args, (survey) => {
      const id = roomArg(survey.plan, args['room'])
      const room = survey.byId.get(id)
      if (!room || room.polygon.length < 3) throw new EditRefused('That room has no outline Grid can measure; grid_check says why.')
      const side = args['side'] as Direction
      if (args['to'] === undefined) return moveRoomSide(survey, id, side, args['by'] as number)
      const now = insideAcross(survey, id, side)
      const by = (args['to'] as number) - now
      const across = side === 'north' || side === 'south' ? 'depth (north-south)' : 'width (east-west)'
      if (Math.abs(by) < 0.0005) throw new EditRefused(`${JSON.stringify(room.facts.name)} is ${now.toFixed(2)} m inside already, its ${across}.`)
      const patch = moveRoomSide(survey, id, side, by)
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
    + 'Do not use to turn the drawing for a picture (grid_view). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    how: { type: 'string', enum: MIRRORS, description: 'To mirror: left-right or top-bottom. Give how or turn, not both.', examples: ['left-right'] },
    turn: { type: 'number', minimum: -270, maximum: 270, description: 'To turn instead: 90, 180, 270 or -90 degrees, counter-clockwise as Grid draws the plan (y up). Quarter turns only.', examples: [90] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    const how = args['how'] as Mirror | undefined
    const turn = args['turn'] as number | undefined
    if (how !== undefined && turn !== undefined) throw new ToolRefusal('Pass how to mirror or turn to turn, not both: make two calls for a mirror and a turn.')
    if (how === undefined && turn === undefined) throw new ToolRefusal('Pass how (left-right or top-bottom) to mirror the plan, or turn (90, 180, 270 or -90 degrees) to turn it.')
    if (turn === undefined) return writeChange(context, args, (survey) => mirrorPlan(survey, how!))
    const degrees = ((turn % 360) + 360) % 360
    if (!(TURNS as readonly number[]).includes(degrees)) throw new ToolRefusal(`turn is ${turn}: Grid turns a plan by quarter turns only, 90, 180, 270 or -90 degrees.`)
    return writeChange(context, args, (survey) => turnPlanBy(survey, degrees as Turn))
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
  const given = (['rooms', 'layout', 'scan'] as const).filter((name) => args[name] !== undefined)
  if (given.length === 0) throw new ToolRefusal('Pass rooms (the rooms text to write), layout (tidy or sizes, a first layout from the brief beside the plan) or scan (a phone room scan file in the project): one of the three.')
  if (given.length === 3) throw new ToolRefusal('Pass one of rooms, layout and scan, not all three: each writes the plan in place of the others.')
  if (given.length === 2) {
    const [first, second] = given
    const why = second === 'scan' ? (first === 'layout' ? 'layout writes a first layout from the brief, scan writes the plan from a phone room scan' : 'scan writes the plan from a phone room scan, in place of rooms text') : 'layout writes a first layout from the brief, in place of rooms text'
    throw new ToolRefusal(`Pass ${first} or ${second}, not both: ${why}.`)
  }
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
    + 'A plain number is metres; a length may carry its unit in one word (360cm, 3600mm, 12ft, 12ft6in, 12\'6"). A display line (display ft-in, display mm, display m decimal comma) records how the person reads lengths: drawings, figures and sheets follow it, and the plan file stays in metres. '
    + 'From a phone room scan: pass scan, the scan file in the project (Apple\'s room model, as JSON), in place of rooms. Grid pairs each wall\'s two faces into one wall as thick as the gap between them, takes a wall seen from one side as an outside wall of its usual thickness, places the doors and windows on their walls, keeps the scan beside the plan as <plan>.scan.json keyed by its ids, and lists everything it assumed to confirm with the person. A re-scan keeps the plan\'s ids for the parts it finds again. '
    + 'Pass one of rooms, layout and scan. '
    + 'Do not use for one door or window (grid_change_opening) or one wall moved (grid_move_room_side). It replaces the plan file. Rooms text that names fewer floors than the plan holds is refused, naming the floors it would drop (replace=true drops them); rooms text with no rooms is always refused.',
  args: {
    plan: { ...PLAN_ARG, description: 'The plan file to write, inside the project folder, ending in .json. The project\'s own plan.json when left out.' },
    rooms: {
      type: 'string',
      lines: true,
      maxLength: ROOMS_TEXT_MAX,
      description: 'The rooms text, one statement a line; pass it, layout or scan. A room: room <id> "<name>" <use or -> <width> x <depth> [inside|centre|outside] <at x,y | north|south|east|west of <room> [align ...] [until <room>]>. An opening: door|window|opening <id> between <room> and <room> | in <room> <side>, <m> from <side> | centred, <m> wide [, sill <m>, height <m>, opens into <room>|in|out, hinged <direction>]. The first line sets the walls: walls outside <t> inside <t> height <h>.',
      examples: [ROOMS_EXAMPLE],
    },
    scan: { type: 'string', maxLength: PATH_MAX, description: 'In place of rooms: a phone room scan, as a path inside the project folder (Apple\'s room model saved as JSON). The plan is written from it, and the scan kept beside the plan.', examples: ['scans/flat.json'] },
    replace: { type: 'boolean', description: 'true to write over a plan that was not written from this text or scan, or was changed since. Refused with the difference when left out.', examples: [true] },
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
    // HND-11: each length taped on site against the plan as written; empty when it keeps none.
    taped: TAPED_OUTPUT,
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
            brief: done.brief,
            reminder: done.reminder,
            layout: null,
            taped: done.taped,
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
      const options = { replace: args['replace'] === true, brief: true }
      const laid = shape === undefined ? null : writeLayout(project, file, shape, options)
      const done = laid?.done ?? writeRoomsIntoProject(project, args['rooms'] as string, file, options)
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
          brief: done.brief,
          reminder: done.reminder,
          layout: laid?.layout ?? null,
          scan: null,
          taped: done.taped,
        },
      }
    } catch (error) {
      if (error instanceof RoomsRefused) throw new ToolRefusal(error.problems.length > 1 ? `The rooms text was not written, and the plan is as it was. ${error.problems.length} problems:\n${error.problems.map((p) => `  ${p}`).join('\n')}` : error.message.replace(/--replace/g, 'replace=true').replace(/grid describe --as rooms/g, 'grid_describe as=rooms'))
      throw asRefusal(error)
    }
  },
}

export const WRITE_TOOLS: readonly GridTool[] = [exportTool, sheetTool, writeRoomsTool, changeOpeningTool, changeTypeTool, moveSideTool, mirrorTool]
