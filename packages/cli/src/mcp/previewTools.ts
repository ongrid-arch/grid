/**
 * VEW-4: the preview the person and the agent share, in two tools.
 *
 * `grid_preview` is the agent's: it shows the person a floor, a view, a room framed and parts
 * picked out, with a short note, and reads back what the person selected. `grid_preview_sync` is
 * the page's own (MCP Apps visibility `app`): the viewer page (`packages/viewer/src/page/`) reads
 * the plan's drawing and the shared record through it, and writes what the person did there.
 * Both meet in the record beside the plan (`preview/record.ts`), and every picture either gives
 * also comes back as a PNG with its text, so a host that shows no MCP App loses nothing.
 */
import { createHash } from 'crypto'
import { cameraRecord, pickInModel, planFloors, resolveFloor, type CameraRecord, type FloorPlan } from '@ongrid/floorplan/geometry'
import { PREVIEW_RESOURCE_URI, PREVIEW_SYNC_TOOL } from '@ongrid/viewer/src/page/names'
import { CanvasMissing } from '../draw/canvas'
import { CameraRefused, cameraFor, settingOfCamera } from '../draw/cameraAsk'
import { LOOKS, namedLook, type LookName } from '../draw/viewNames'
import { PathRefused } from '../fs/projectFiles'
import { surveyPlan, type Survey } from '../quantities/survey'
import { readTrace } from '../trace/traceImage'
import { HIGHLIGHT_MAX, planParts, PREVIEW_NOTE_MAX, readPreview, writePreview, type PreviewRead, type PreviewRecord, type PreviewSelection, type PreviewView } from '../preview/record'
import { CAMERA_ARG, CAMERA_SCHEMA, READ_TOOLS } from './readTools'
import {
  BOOLEAN,
  FLOOR_ARG,
  floorArg,
  listSchema,
  nearestIdText,
  NULLABLE_STRING,
  NUMBER,
  objectSchema,
  PLAN_ARG,
  readArgs,
  readPlan,
  roomArg,
  STRING,
  ToolRefusal,
  type Answer,
  type GridTool,
  type ToolContext,
} from './toolkit'

export const PREVIEW_TOOL_NAME = 'grid_preview'
export { PREVIEW_NOTE_MAX, PREVIEW_SYNC_TOOL }

const q = (text: string): string => JSON.stringify(text)
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/** The page's revision: what its drawing is drawn from, then the record's revision. */
const hashOf = (...parts: readonly string[]): string => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16)

function previewOf(context: ToolContext, plan: unknown): { project: ReturnType<typeof readPlan>['project']; file: string; plan: FloorPlan; read: PreviewRead } {
  const { project, file: named, loaded } = readPlan(context, plan)
  try {
    // The plan by its path in the project, never the machine's: the page sends it back as plan.
    const file = project.relative(project.resolve(named))
    return { project, file, plan: loaded.plan, read: readPreview(project, file) }
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw error
  }
}

function writeOf(project: ReturnType<typeof readPlan>['project'], file: string, read: PreviewRead, change: Parameters<typeof writePreview>[3]): PreviewRecord {
  try {
    return writePreview(project, file, read, change)
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') throw new ToolRefusal('The preview record beside the plan could not be written: permission denied.')
    throw error
  }
}

/** The camera the preview's 3D view looks through: the record's, else Grid's opening view of the framed room or floor. */
function cameraOf(plan: FloorPlan, survey: Survey, record: PreviewRecord): CameraRecord {
  if (record.camera !== null) {
    try {
      const setting = settingOfCamera(record.camera as unknown as Record<string, unknown>)
      const room = setting.target.room
      return cameraRecord(plan, room !== null && !plan.rooms.some((r) => r.id === room) ? { ...setting, target: { ...setting.target, room: null } } : setting)
    } catch (error) {
      // A camera that no longer fits the plan gives way to the opening view.
      if (!(error instanceof CameraRefused)) throw error
    }
  }
  const frame = record.frame !== null && plan.rooms.some((r) => r.id === record.frame) ? record.frame : undefined
  const cut = record.floor !== null && planFloors(plan).length > 1 && planFloors(plan).some((f) => f.id === record.floor) ? record.floor : undefined
  try {
    return cameraFor(plan, survey, { ...(frame ? { room: frame } : {}), ...(cut ? { cut } : {}) })
  } catch (error) {
    if (error instanceof CameraRefused) return cameraFor(plan, survey, cut ? { cut } : {})
    throw error
  }
}

/** The selection in words, for the agent: what the person clicked last. */
function selectionLine(plan: FloorPlan, selected: PreviewSelection | null): string {
  if (selected === null) return 'The person has selected nothing in the preview.'
  const part = planParts(plan).get(selected.id)
  if (part === undefined) return `The person had selected ${q(selected.id)}, which the plan no longer has.`
  return `The person has selected ${part.kind} ${q(part.id)}${part.name ? ` (${q(part.name)})` : ''} on floor ${q(part.floor)}.`
}

/** The selection as data, or null when the plan no longer has the part. */
function selectionData(plan: FloorPlan, selected: PreviewSelection | null): Record<string, unknown> | null {
  if (selected === null) return null
  const part = planParts(plan).get(selected.id)
  return part === undefined ? null : { id: part.id, kind: part.kind, name: part.name, floor: part.floor }
}

const SELECTED_SCHEMA = { type: ['object', 'null'], properties: { id: STRING, kind: STRING, name: NULLABLE_STRING, floor: STRING } }
const RECORD_SCHEMA = {
  type: 'object',
  properties: {
    version: STRING,
    revision: NUMBER,
    view: STRING,
    floor: NULLABLE_STRING,
    camera: { ...CAMERA_SCHEMA, type: ['object', 'null'] },
    selected: SELECTED_SCHEMA,
    highlight: listSchema(STRING),
    frame: NULLABLE_STRING,
    note: NULLABLE_STRING,
    changedBy: NULLABLE_STRING,
  },
}

const viewTool = READ_TOOLS.find((tool) => tool.name === 'grid_view')!

/**
 * The picture of what the preview shows, as `grid_view` draws it: the plan with the parts picked
 * out and the room framed, or the model through the preview's camera. Where the canvas a PNG needs
 * is not installed, its reason instead: the preview still moves, and only the PNG is missing.
 */
async function pictureOf(plan: FloorPlan, record: PreviewRecord, camera: CameraRecord | null, context: ToolContext, planFile: string): Promise<Answer> {
  try {
    return await drawnOf(plan, record, camera, context, planFile)
  } catch (error) {
    if (error instanceof CanvasMissing) return { text: error.message, data: {} }
    throw error
  }
}

async function drawnOf(plan: FloorPlan, record: PreviewRecord, camera: CameraRecord | null, context: ToolContext, planFile: string): Promise<Answer> {
  const floors = new Set(planFloors(plan).map((f) => f.id))
  if (record.view === '3d') {
    return viewTool.run(readArgs(viewTool, { plan: planFile, kind: '3d', ...(camera !== null ? { camera } : {}) }), context)
  }
  const floor = resolveFloor(plan, record.floor ?? null)
  const parts = planParts(plan)
  const frame = record.frame !== null && parts.has(record.frame) && parts.get(record.frame)!.floors.includes(floor) ? record.frame : undefined
  const highlight = record.highlight.filter((id) => parts.has(id))
  return viewTool.run(readArgs(viewTool, {
    plan: planFile,
    kind: 'plan',
    ...(floors.has(floor) ? { floor } : {}),
    ...(highlight.length > 0 ? { highlight } : {}),
    ...(frame ? { crop: frame } : {}),
  }), context)
}

// ---------------------------------------------------------------------------------------------
// grid_preview

export const previewTool: GridTool = {
  name: PREVIEW_TOOL_NAME,
  title: 'Show in preview',
  hint: 'write-file',
  ui: { resourceUri: PREVIEW_RESOURCE_URI },
  description:
    'Use this when you have changed the plan, once, to point the person at the change in Grid\'s preview, or when they ask to see a floor, a room or some parts there: the floor you changed, the view that shows it best (3d for heights and volumes, 2d for layout), a room to frame, the parts to pick out (highlight, by id) and a short note in your own words saying what to look at. '
    + 'Call it with no argument but plan to read what the person selected by clicking a picture of the preview, when they say "this", "here" or "the one I clicked". '
    + 'The preview is a page beside the chat in a host that shows MCP Apps, and a browser page that grid preview opens elsewhere; both show the same record, kept beside the plan in <plan>.preview.json, and every answer also carries the picture the preview shows, so a host without the page loses nothing. '
    + 'It changes nothing in the plan. The floor, room and ids are checked against the plan. Do not use to get a picture for yourself (grid_view) or to save a view (grid_save_view).',
  args: {
    plan: PLAN_ARG,
    floor: { ...FLOOR_ARG, description: 'A floor id from the plan\'s "floors".' },
    room: { type: 'string', id: true, description: 'A room id to frame. The preview shows the floor that room is on.', examples: ['kitchen', 'f1-r2'] },
    view: { type: 'string', enum: ['2d', '3d'], description: '2d for the plan view, 3d for the model.', examples: ['2d', '3d'] },
    highlight: { type: 'array', description: 'Rooms, walls, doors, windows, openings or fixtures to pick out, by id, replacing those picked out before; an empty list picks out none.', examples: [['d1', 'd4'], []], items: { id: true }, minItems: 0, maxItems: HIGHLIGHT_MAX },
    camera: { ...CAMERA_ARG, description: 'For 3d: a camera record exactly as grid_view returned it, for the preview to look through. The view becomes 3d.' },
    note: { type: 'string', maxLength: 500, description: `One short sentence for the person, in your own words, saying what to look at. Cut to ${PREVIEW_NOTE_MAX} characters.`, examples: ['The new bathroom is behind the kitchen.'] },
  },
  outputSchema: objectSchema({
    floor: STRING,
    view: STRING,
    room: NULLABLE_STRING,
    note: NULLABLE_STRING,
    highlight: listSchema(STRING),
    selected: SELECTED_SCHEMA,
    camera: { ...CAMERA_SCHEMA, type: ['object', 'null'] },
    revision: NUMBER,
    planFile: STRING,
    previewFile: STRING,
    shown: BOOLEAN,
  }),
  async run(args, context) {
    const { project, file, plan, read } = previewOf(context, args['plan'])
    const asked = ['floor', 'room', 'view', 'highlight', 'camera', 'note'].some((key) => args[key] !== undefined)
    const survey = surveyPlan(plan)
    const shownFloor = (record: PreviewRecord): string => record.view === '3d' && record.camera !== null ? (cameraOf(plan, survey, record).cut ?? resolveFloor(plan, record.floor ?? null)) : resolveFloor(plan, record.floor ?? null)
    const dataOf = (record: PreviewRecord, camera: CameraRecord | null, shown: boolean): Record<string, unknown> => ({
      floor: shownFloor(record),
      view: record.view,
      room: record.frame,
      note: record.note,
      highlight: [...record.highlight],
      selected: selectionData(plan, record.selected),
      camera,
      revision: record.revision,
      planFile: file,
      previewFile: read.file,
      shown,
    })

    if (!asked) {
      // A read: what the person sees and selected. Nothing is written.
      const record = read.record
      const lines = [
        selectionLine(plan, record.selected),
        `The preview shows floor ${q(shownFloor(record))} in ${record.view}${record.frame ? `, room ${q(record.frame)} framed` : ''}${record.highlight.length > 0 ? `, ${record.highlight.length} part${record.highlight.length === 1 ? '' : 's'} picked out` : ''}${record.changedBy === 'person' ? ', as the person last set it' : ''}.`,
      ]
      if (read.problem !== null) lines.push(`${read.problem}; it is taken as empty, and written afresh on the next change.`)
      return { text: lines.join('\n'), data: dataOf(record, record.view === '3d' ? cameraOf(plan, survey, record) : null, false) }
    }

    let floor = floorArg(plan, args['floor'])
    const room = args['room'] === undefined ? undefined : roomArg(plan, args['room'])
    if (room !== undefined) {
      const of = plan.rooms.find((r) => r.id === room)!.floor ?? resolveFloor(plan, null)
      if (floor !== undefined && floor !== of) throw new ToolRefusal(`That room is on floor ${q(of)}, not the floor named.`)
      floor = of
    }
    const parts = planParts(plan)
    const highlight = args['highlight'] as string[] | undefined
    if (highlight !== undefined) {
      const missing = highlight.filter((id) => !parts.has(id))
      if (missing.length > 0) throw new ToolRefusal(`highlight names ${missing.length === 1 ? 'an id' : `${missing.length} ids`} the plan has no room, wall, door, window, opening or fixture for.${nearestIdText(missing[0], [...parts.keys()])}`)
    }
    let camera: CameraRecord | undefined
    if (args['camera'] !== undefined) {
      try {
        camera = cameraRecord(plan, args['camera'] as Parameters<typeof cameraRecord>[1])
      } catch (error) {
        if (error instanceof CameraRefused) throw new ToolRefusal(error.message)
        throw error
      }
    }
    const view = (args['view'] as PreviewView | undefined) ?? (camera !== undefined ? '3d' : read.record.view)
    const moved = floor !== undefined || room !== undefined
    const note = (args['note'] as string | undefined)?.replace(CONTROL, '').trim().slice(0, PREVIEW_NOTE_MAX) || null
    const record = writeOf(project, file, read, {
      view,
      floor: floor ?? read.record.floor,
      // A new floor or room starts a new frame and a new camera; a camera sent is looked through.
      frame: room ?? (moved ? null : read.record.frame),
      camera: camera ?? (moved ? null : read.record.camera),
      highlight: highlight ?? read.record.highlight,
      note,
      changedBy: 'agent',
    })
    const shownCamera = record.view === '3d' ? cameraOf(plan, survey, record) : null
    const picture = await pictureOf(plan, record, shownCamera, context, file)
    const picked = record.highlight.length
    const lines = [
      `Showing floor ${q(shownFloor(record))}${record.frame ? `, room ${q(record.frame)} framed` : ''} in ${record.view}${picked > 0 ? `, ${picked} part${picked === 1 ? '' : 's'} picked out` : ''}${note ? ', with your note' : ''}. The picture is what the preview shows.`,
      selectionLine(plan, record.selected),
      ...picture.text.split('\n'),
    ]
    return { text: lines.join('\n'), data: dataOf(record, shownCamera, true), ...(picture.image ? { image: picture.image } : {}) }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_preview_sync

const PICK_ARG = {
  type: 'object',
  description: 'A click on the 3D picture: x and y from its top-left corner, each from 0 to 1 across its width and down its height. The part it shows becomes the selection.',
  examples: [{ x: 0.5, y: 0.6 }],
  schema: { type: 'object', properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } }, required: ['x', 'y'], additionalProperties: false },
  read(value: unknown) {
    const point = value as Record<string, unknown>
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
    if (!ok(point['x']) || !ok(point['y']) || Object.keys(point).some((key) => key !== 'x' && key !== 'y')) throw new ToolRefusal('pick takes x and y, each a number from 0 to 1.')
    return { x: point['x'], y: point['y'] }
  },
} as const

export const previewSyncTool: GridTool = {
  name: PREVIEW_SYNC_TOOL,
  title: 'Preview page',
  hint: 'write-file',
  ui: { resourceUri: PREVIEW_RESOURCE_URI, visibility: ['app'] },
  description:
    'Use this when you are Grid\'s preview page: it reads the plan\'s drawing and the record the page shares with the agent, and writes what the person did there (the floor and view chosen, a 3D camera turned, a part clicked: select, clear, or pick on the 3D picture). '
    + 'Pass since, the revision of the last answer, to be told only that nothing changed when nothing did; a drawing comes back when the plan, the view or the 3D camera changed, as the viewer\'s SVG with each part\'s box for 2d and always as a PNG picture. '
    + 'Do not use as an agent: grid_preview shows the person something and reads what they selected, and grid_view gives you a picture.',
  args: {
    plan: PLAN_ARG,
    since: { type: 'string', maxLength: 64, description: 'The revision of the last answer the page drew.', examples: ['3f2a9c0d1e4b5a6c.7'] },
    look: { type: 'string', enum: ['working', 'dark'], description: 'The 2D drawing\'s look: working on a light page, dark on a dark one. working when left out.', examples: ['dark'] },
    floor: { ...FLOOR_ARG, description: 'The floor the person chose.' },
    view: { type: 'string', enum: ['2d', '3d'], description: 'The view the person chose.', examples: ['3d'] },
    select: { type: 'string', id: true, description: 'The id of the part the person clicked on the 2D drawing.', examples: ['kitchen', 'd1'] },
    clear: { type: 'boolean', description: 'true when the person clicked where there is no part: the selection is cleared.', examples: [true] },
    pick: PICK_ARG,
    camera: { ...CAMERA_ARG, description: 'The camera the person turned the 3D view to, as the last answer gave it with bearing, tilt or distance changed.' },
  },
  outputSchema: objectSchema({
    changed: BOOLEAN,
    revision: STRING,
    planFile: STRING,
    record: RECORD_SCHEMA,
    selected: SELECTED_SCHEMA,
    picked: { type: ['object', 'null'] },
    floors: { type: 'array' },
    parts: { type: 'array' },
    drawing: { type: ['object', 'null'] },
  }, ['changed', 'revision', 'planFile', 'record', 'selected']),
  async run(args, context) {
    const { project, file, plan, read } = previewOf(context, args['plan'])
    const survey = surveyPlan(plan)
    const parts = planParts(plan)
    const look = (args['look'] as LookName | undefined) ?? 'working'
    if (!(LOOKS as readonly string[]).includes(look)) throw new ToolRefusal('look takes working or dark.')
    const change: Parameters<typeof writePreview>[3] = {}
    const floor = floorArg(plan, args['floor'])
    if (floor !== undefined) Object.assign(change, { floor, frame: read.record.frame !== null && parts.get(read.record.frame)?.floors.includes(floor) !== true ? null : read.record.frame, camera: null })
    if (args['view'] !== undefined) Object.assign(change, { view: args['view'] })
    if (args['camera'] !== undefined) {
      try {
        Object.assign(change, { camera: cameraRecord(plan, args['camera'] as Parameters<typeof cameraRecord>[1]), view: '3d' })
      } catch (error) {
        if (error instanceof CameraRefused) throw new ToolRefusal(error.message)
        throw error
      }
    }
    let picked: Record<string, unknown> | null = null
    const select = args['select'] as string | undefined
    if (select !== undefined) {
      const part = parts.get(select)
      if (part === undefined) throw new ToolRefusal(`select names an id the plan has no part for.${nearestIdText(select, [...parts.keys()])}`)
      Object.assign(change, { selected: { id: part.id, kind: part.kind, floor: part.floor } })
    }
    if (args['clear'] === true) Object.assign(change, { selected: null })
    if (args['pick'] !== undefined) {
      const point = args['pick'] as { x: number; y: number }
      const hit = pickInModel(plan, cameraOf(plan, survey, { ...read.record, ...change }), point.x, point.y)
      const part = hit === null ? undefined : parts.get(hit.id)
      picked = hit === null ? null : { id: hit.id, kind: hit.kind, floor: hit.floor, at: hit.at }
      Object.assign(change, { selected: part === undefined ? null : { id: part.id, kind: part.kind, floor: part.floor } })
    }
    const changed = Object.keys(change).length > 0
    const record = changed ? writeOf(project, file, read, { ...change, changedBy: 'person' }) : read.record

    const shown = resolveFloor(plan, record.floor ?? null)
    const camera = record.view === '3d' ? cameraOf(plan, survey, record) : null
    const key = hashOf(JSON.stringify(plan), record.view, shown, look, camera === null ? '' : JSON.stringify(camera))
    const revision = `${key}.${record.revision}`
    const base = { revision, planFile: file, record: { ...record, highlight: [...record.highlight] }, selected: selectionData(plan, record.selected), picked }
    const said = [selectionLine(plan, record.selected)]
    if (picked === null && args['pick'] !== undefined) said.unshift('The click on the 3D picture met no part of the model.')
    if (args['since'] === revision) return { text: ['Nothing changed.', ...said].join('\n'), data: { changed: false, ...base } }
    if (typeof args['since'] === 'string' && args['since'].startsWith(`${key}.`)) {
      return { text: ['The record changed; the drawing did not.', ...said].join('\n'), data: { changed: true, ...base, drawing: null } }
    }
    const floors = planFloors(plan).map((f) => ({ id: f.id, name: f.name }))
    const onFloor = [...parts.values()].filter((part) => record.view === '3d' || part.floors.includes(shown)).map((part) => ({ id: part.id, kind: part.kind, name: part.name }))
    const picture = await pictureOf(plan, record, camera, context, file)
    if (record.view === '3d') {
      return {
        text: [`The model, for the preview page.`, ...said].join('\n'),
        data: { changed: true, ...base, floors, parts: onFloor, drawing: { view: '3d', floor: camera?.cut ?? shown, camera } },
        ...(picture.image ? { image: picture.image } : {}),
      }
    }
    const { planDrawing } = await import('../draw/views')
    // VEW-67: the trace image under the floor shown, read from the project folder as grid_view reads it.
    const trace = readTrace(project, plan, shown)
    const drawing = planDrawing(plan, shown, namedLook(look), trace.picture ?? undefined)
    return {
      text: [`Floor ${q(shown)} as a drawing, for the preview page.`, ...said].join('\n'),
      data: { changed: true, ...base, floors, parts: onFloor, drawing: { view: '2d', floor: shown, ...drawing } },
      ...(picture.image ? { image: picture.image } : {}),
    }
  },
}

export const PREVIEW_TOOLS: readonly GridTool[] = [previewTool, previewSyncTool]
