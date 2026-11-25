/**
 * VEW-4: the preview's shared record, the one place the person's viewer page and the agent meet.
 *
 * It is kept in a file of its own beside the plan, `<plan>.preview.json` (`plan.preview.json`
 * beside `plan.json`), read and written only through `fs/projectFiles.ts`. The plan knows nothing
 * of it, and no export, sheet or drawing reads it. It holds what the preview shows (2d or 3d, the
 * floor, and in 3d VEW-3's camera record), what the person selected by clicking a picture, the
 * parts the agent asked to pick out and the room it asked to frame, and the agent's note:
 *
 *   {
 *     "version": "1",
 *     "revision": 7,
 *     "view": "2d",
 *     "floor": "ground",
 *     "camera": null,
 *     "selected": { "id": "kitchen", "kind": "room", "floor": "ground" },
 *     "highlight": ["d1", "d4"],
 *     "frame": "kitchen",
 *     "note": "The new door is on the left.",
 *     "changedBy": "agent"
 *   }
 *
 * Each writer reads the record, changes only its own fields and writes it back with the revision
 * one higher: the page writes `view`, `floor`, `camera` and `selected`; the agent's `grid_preview`
 * writes every field but `selected`. A record that cannot be read is taken as empty, and said to
 * be: it is the state of a view, not part of the plan, and a new one is written on the next change.
 */
import path from 'path'
import { floorOf, hasWallsThrough, planFloors, planForFloor, wallFloorIds, type CameraRecord, type FloorPlan } from '@ongrid/floorplan/geometry'
import { planIdText } from '@ongrid/floorplan/types/floorplan'
import { PathRefused, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'

export const PREVIEW_SUFFIX = '.preview.json'
/** The largest record Grid reads: a camera, an id and up to `HIGHLIGHT_MAX` ids are far less. */
export const PREVIEW_FILE_MAX_BYTES = 1024 * 1024
/** The most ids the agent may pick out at once, as `grid_view`'s `highlight`. */
export const HIGHLIGHT_MAX = 2000
/** The longest note, in characters, as `grid_preview` cuts it. */
export const PREVIEW_NOTE_MAX = 120

export const PREVIEW_VIEWS = ['2d', '3d'] as const
export type PreviewView = (typeof PREVIEW_VIEWS)[number]

/** The kinds of part a click on a picture can hit. */
export type PickedKind = 'room' | 'wall' | 'door' | 'window' | 'opening' | 'fixture'

export interface PreviewSelection {
  readonly id: string
  readonly kind: PickedKind
  readonly floor: string
}

export interface PreviewRecord {
  readonly version: '1'
  /** One higher on every write, so a page can tell a new record from the one it has. */
  readonly revision: number
  readonly view: PreviewView
  /** The floor shown, or null for the plan's ground floor (in 3d: the whole building). */
  readonly floor: string | null
  /** In 3d, the camera the preview looks through (VEW-3), or null for the opening view. */
  readonly camera: CameraRecord | null
  /** What the person clicked last on a picture, or null. */
  readonly selected: PreviewSelection | null
  /** The parts the agent asked to pick out, by id. */
  readonly highlight: readonly string[]
  /** The room the agent asked to frame, or null. */
  readonly frame: string | null
  readonly note: string | null
  readonly changedBy: 'agent' | 'person' | null
}

export const EMPTY_PREVIEW: PreviewRecord = {
  version: '1',
  revision: 0,
  view: '2d',
  floor: null,
  camera: null,
  selected: null,
  highlight: [],
  frame: null,
  note: null,
  changedBy: null,
}

/** The record file of a plan file: beside it, its name without `.json` and `.preview.json` after. */
export function previewFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${PREVIEW_SUFFIX}`)
}

export interface PreviewRead {
  /** The record file, relative to the project folder. */
  readonly file: string
  readonly record: PreviewRecord
  /** The record's text as read, or '' when there is none: what a page's revision is made from. */
  readonly text: string
  /** Why the file was taken as empty, or null. Never quotes the file. */
  readonly problem: string | null
}

const KINDS: readonly PickedKind[] = ['room', 'wall', 'door', 'window', 'opening', 'fixture']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** CMD-24: an id of the plan, as the plan holds it: the page sends back the ids it was given. */
const idOrNull = (value: unknown): string | null => (planIdText(value) ? value : null)

/** The record's fields, each one kept only when it has the shape it should; the rest are their empty values. */
export function recordOf(raw: unknown): PreviewRecord {
  if (!isObject(raw)) return EMPTY_PREVIEW
  const selected = isObject(raw['selected']) && idOrNull(raw['selected']['id']) !== null && KINDS.includes(raw['selected']['kind'] as PickedKind) && idOrNull(raw['selected']['floor']) !== null
    ? { id: raw['selected']['id'] as string, kind: raw['selected']['kind'] as PickedKind, floor: raw['selected']['floor'] as string }
    : null
  const revision = raw['revision']
  const note = raw['note']
  return {
    version: '1',
    revision: typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    view: raw['view'] === '3d' ? '3d' : '2d',
    floor: idOrNull(raw['floor']),
    // Read field by field again where it is used (`settingOfCamera`); only its shape is kept here.
    camera: isObject(raw['camera']) && isObject(raw['camera']['target']) ? (raw['camera'] as unknown as CameraRecord) : null,
    selected,
    highlight: Array.isArray(raw['highlight']) ? raw['highlight'].filter((id): id is string => planIdText(id)).slice(0, HIGHLIGHT_MAX) : [],
    frame: idOrNull(raw['frame']),
    note: typeof note === 'string' ? note.slice(0, PREVIEW_NOTE_MAX) : null,
    changedBy: raw['changedBy'] === 'agent' || raw['changedBy'] === 'person' ? raw['changedBy'] : null,
  }
}

/** Reads a plan's preview record; an absent file is the empty record. */
export function readPreview(project: Project, planFile: string): PreviewRead {
  const file = previewFileOf(planFile)
  const shown = path.basename(file)
  // A path the project refuses is refused here, before anything is read.
  const relative = project.relative(project.resolve(file))
  let text: string
  try {
    text = project.readText(file, PREVIEW_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof PathRefused) throw error
    const empty = (problem: string | null): PreviewRead => ({ file: relative, record: EMPTY_PREVIEW, text: '', problem })
    if (error instanceof TextNotDecoded) return empty(`${shown} could not be read as text`)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return empty(null)
    if (code === 'EISDIR') return empty(`${shown} is a folder, not a preview record`)
    if (code === 'EFBIG') return empty(`${shown} is larger than ${PREVIEW_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a preview record`)
    if (code === 'EACCES' || code === 'EPERM') return empty(`${shown} can't be read: permission denied`)
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // The parser's message quotes the text around the fault.
    return { file: relative, record: EMPTY_PREVIEW, text, problem: `${shown} is not JSON` }
  }
  return { file: relative, record: recordOf(raw), text, problem: null }
}

/** Writes the record with the changes given, one revision higher than the record it was read as. */
export function writePreview(project: Project, planFile: string, read: PreviewRead, change: Partial<Omit<PreviewRecord, 'version' | 'revision'>>): PreviewRecord {
  const record: PreviewRecord = { ...read.record, ...change, version: '1', revision: read.record.revision + 1 }
  project.writeFile(previewFileOf(planFile), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

/** A part of the plan by its id, as a click on a picture can hit it: its kind, floor and name. */
export interface PlanPart {
  readonly id: string
  readonly kind: PickedKind
  readonly floor: string
  /** The floors it is drawn on: its own, and (LVL-5) for a wall through floors each it rises through. */
  readonly floors: readonly string[]
  /** A room's name, or a fixture's label or kind; null for a wall or an opening. */
  readonly name: string | null
}

/**
 * Every part a picture can be clicked on, by id. Openings take their wall's floor. LVL-5: a wall
 * through floors is drawn on each floor it rises through, and an opening in it on each floor its
 * part lies on.
 */
export function planParts(plan: FloorPlan): Map<string, PlanPart> {
  const parts = new Map<string, PlanPart>()
  const wallFloor = new Map(plan.walls.map((w) => [w.id, floorOf(w)]))
  const wallFloors = new Map(plan.walls.map((w) => [w.id, wallFloorIds(plan, w)]))
  const openingFloors = new Map<string, string[]>()
  if (hasWallsThrough(plan)) {
    for (const floor of planFloors(plan)) {
      for (const opening of planForFloor(plan, floor.id).openings) openingFloors.set(opening.id, [...(openingFloors.get(opening.id) ?? []), floor.id])
    }
  }
  for (const room of plan.rooms) parts.set(room.id, { id: room.id, kind: 'room', floor: floorOf(room), floors: [floorOf(room)], name: room.name })
  for (const wall of plan.walls) if (!parts.has(wall.id)) parts.set(wall.id, { id: wall.id, kind: 'wall', floor: floorOf(wall), floors: wallFloors.get(wall.id)!, name: null })
  for (const opening of plan.openings) {
    if (parts.has(opening.id)) continue
    const kind: PickedKind = opening.type === 'door' ? 'door' : opening.type === 'window' ? 'window' : 'opening'
    const floor = wallFloor.get(opening.wall) ?? floorOf({})
    parts.set(opening.id, { id: opening.id, kind, floor, floors: openingFloors.get(opening.id) ?? wallFloors.get(opening.wall) ?? [floor], name: null })
  }
  for (const item of plan.items ?? []) {
    if (parts.has(item.id)) continue
    parts.set(item.id, { id: item.id, kind: 'fixture', floor: floorOf(item), floors: [floorOf(item)], name: item.label ?? item.kind })
  }
  return parts
}
