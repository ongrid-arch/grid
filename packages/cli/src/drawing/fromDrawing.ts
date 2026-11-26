/**
 * `grid write --from <drawing>` and `grid_write_rooms` with `from` (CMD-43): a plan written from
 * a DXF or IFC drawing, by way of rooms text the agent can check and change.
 *
 * The drawing is read through the project's one reader (the size limit, a path inside the
 * project), its text as UTF-8, or as Windows-1252 when it is not (an older DXF's code page), and
 * said. Its rooms text (`toRooms.ts`) is written beside the plan as `<plan>.rooms`, then the plan
 * from that text through `writeRoomsIntoProject`, so everything that holds for rooms text holds:
 * a plan changed since is refused unless `replace`, the answer is the same, and writing
 * `<plan>.rooms` again changes nothing. The walls' and openings' sources go on the plan as facts
 * by id (`handle` or `guid`), which a later write keeps (CNT-9).
 *
 * A rooms text the compile refuses is still written beside the plan, and the refusal names it, so
 * the agent changes the lines it names and writes it with `grid write`.
 */
import path from 'path'
import { PathRefused, type Project } from '../fs/projectFiles'
import { refuseGridFile } from '../command/planFile'
import { refuseReadOnly, RoomsRefused, writeRoomsIntoProject, type WriteDone } from '../command/write'
import { readDxf, type DxfOptions } from './dxf'
import { readIfc } from './ifc'
import { count, DrawingRefused, type Drawing } from './model'
import { roomsTextOf, type DrawingRooms } from './toRooms'

/** The largest drawing Grid reads. */
export const DRAWING_MAX_BYTES = 128 * 1024 * 1024
/** The first words of a rooms file Grid wrote from a drawing: one that does not start so is the person's own. */
const ROOMS_HEADER = '# Read from '
/** Rooms listed one by one in the answer, at most, before only those that differ from the drawing. */
const ROOMS_LISTED_MAX = 12
/** A room whose plan area is further than this share from its drawn or stated area is listed. */
const AREA_APART = 0.005

export const DRAWING_FORMATS = ['.dxf', '.ifc'] as const

/** The rooms text a plan is written from, beside it: `plan.json` is `plan.rooms`. */
export function roomsFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}.rooms`)
}

export interface DrawingWriteDone {
  readonly drawing: Drawing
  readonly reading: DrawingRooms
  /** The rooms file beside the plan, in the project. */
  readonly roomsFile: string
  readonly done: WriteDone
  readonly lines: readonly string[]
}

export interface DrawingWriteOptions extends DxfOptions {
  readonly replace?: boolean
  readonly brief?: boolean
}

const m2 = (v: number): string => (Number.isFinite(v) ? `${v.toFixed(2)} m²` : 'not measured')

/** The drawing's text: UTF-8, else Windows-1252, a byte-order mark dropped. */
function drawingText(project: Project, file: string): { text: string; codePage: boolean } {
  let bytes: Uint8Array
  try {
    bytes = project.readBytes(file, DRAWING_MAX_BYTES)
  } catch (error) {
    if (error instanceof PathRefused) throw error
    const errno = (error as NodeJS.ErrnoException).code
    if (errno === 'ENOENT') throw new RoomsRefused('drawing/not-read', `There is no file ${file}.`)
    if (errno === 'EISDIR') throw new RoomsRefused('drawing/not-read', `${file} is a folder, not a drawing.`)
    if (errno === 'EFBIG') throw new RoomsRefused('drawing/not-read', `${file} is larger than ${DRAWING_MAX_BYTES / 1024 / 1024} MB, the most Grid reads.`)
    if (errno === 'EACCES' || errno === 'EPERM') throw new RoomsRefused('drawing/not-read', `${file} can't be read: permission denied.`)
    throw error
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''), codePage: false }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), codePage: true }
  }
}

/**
 * Reads the drawing `file` into rooms text beside `planFile` and writes the plan from it. Refuses
 * with `RoomsRefused` (a drawing that can't be read, rooms text that does not write, a plan that
 * would lose a change), `PlanRefused` or the project's `PathRefused`.
 */
export function writeDrawingIntoProject(project: Project, file: string, planFile: string, options: DrawingWriteOptions = {}): DrawingWriteDone {
  // A path outside the project is refused as such before its ending is looked at.
  project.resolve(file)
  const ext = path.extname(file).toLowerCase()
  if (!(DRAWING_FORMATS as readonly string[]).includes(ext)) throw new RoomsRefused('drawing/format', `from reads a DXF or IFC drawing, a file ending in .dxf or .ifc: got ${JSON.stringify(path.basename(file))}. A DWG is saved as DXF first.`)
  if (!planFile.toLowerCase().endsWith('.json')) throw new RoomsRefused('rooms/plan-file', `The plan to write must be a .json file: got ${JSON.stringify(planFile)}.`)
  refuseGridFile(project.shown(project.resolve(planFile)), planFile)
  refuseReadOnly(project, planFile)
  if (ext === '.ifc' && options.layers !== undefined) throw new RoomsRefused('drawing/layers', 'layers is for a DXF, whose layers say what each line is: an IFC file says it by its classes.')
  if (ext === '.ifc' && options.units !== undefined) throw new RoomsRefused('drawing/units', 'units is for a DXF that states none: an IFC file always states its unit.')
  const { text, codePage } = drawingText(project, file)
  let drawing: Drawing
  try {
    drawing = ext === '.dxf' ? readDxf(text, options) : readIfc(text)
  } catch (error) {
    if (error instanceof DrawingRefused) throw new RoomsRefused(error.code, `${path.basename(file)}: ${error.message} Nothing was written.`)
    throw error
  }
  const shownDrawing = project.shown(project.resolve(file))
  const reading = roomsTextOf(codePage ? { ...drawing, assumed: [`The file is not UTF-8, so it is read as Windows-1252, as an older DXF is written: a name with a letter outside it may read wrong.`, ...drawing.assumed] } : drawing, path.basename(file))

  // The rooms text beside the plan, never over a rooms file of the person's own.
  const roomsFile = roomsFileOf(planFile)
  const shownRooms = project.shown(project.resolve(roomsFile))
  const was = project.readTextIfThere(roomsFile)
  if (was !== null && !was.startsWith(ROOMS_HEADER) && options.replace !== true) {
    throw new RoomsRefused('drawing/rooms-file', `${shownRooms} is there and Grid did not write it from a drawing, so it is not written over. Move it, name another plan (whose rooms text goes beside it), or add --replace to write over it.`)
  }
  const writtenRooms = project.relative(project.writeFile(roomsFile, reading.text))

  let done: WriteDone
  try {
    done = writeRoomsIntoProject(project, reading.text, planFile, { replace: options.replace === true, brief: options.brief === true, facts: reading.facts })
  } catch (error) {
    if (error instanceof RoomsRefused) {
      throw new RoomsRefused(error.code, `Read ${shownDrawing} into rooms text, written to ${writtenRooms}, but the plan was not written: ${error.message} Change the lines it names in ${writtenRooms} and write it with grid write ${writtenRooms}.`, error.problems)
    }
    throw error
  }

  const r = reading
  const openings = r.openings
  const placed = openings.filter((o) => o.written !== 'not placed')
  const furthest = placed.reduce((most, o) => Math.max(most, o.off ?? 0), 0)
  const floors = drawing.floors.length
  const kinds = (kind: string): number => openings.filter((o) => o.kind === kind).length
  const sourceCount = r.rooms.filter((x) => x.source !== null).length
  const apart = (x: (typeof r.rooms)[number]): boolean => [x.drawn, x.stated].some((v) => v !== null && v > 0 && Math.abs(x.area - v) / v > AREA_APART)
  const listed = r.rooms.length <= ROOMS_LISTED_MAX ? r.rooms : r.rooms.filter(apart)
  const roomWords = (x: (typeof r.rooms)[number]): string => `${JSON.stringify(x.name)} ${m2(x.area)} (drawn ${m2(x.drawn)}${x.stated === null ? '' : `, its label says ${m2(x.stated)}`})`
  const lines = [
    `Read ${shownDrawing} (${drawing.format.toUpperCase()}, in ${drawing.unit.name}): ${count(r.rooms.length, 'room')}${floors > 0 ? ` on ${count(floors, 'floor')}` : ''}, ${count(kinds('door'), 'door')}, ${count(kinds('window'), 'window')} and ${count(kinds('opening'), 'doorless opening')}. Its rooms text is in ${writtenRooms}: check it, change any line and write it again with grid write ${writtenRooms}.`,
    `How it was read: ${drawing.layers.map((l) => `${l.layer} ${l.readAs === 'nothing' ? 'not read' : `as ${l.readAs}`} (${l.entities})`).join('; ')}.${drawing.format === 'dxf' ? ' Pass layers (walls=<layer>,<layer>;doors=<layer>;...) to read a layer otherwise.' : ''}`,
    ...(listed.length === 0 ? [`Each room's area in the plan is the drawn one${r.rooms.some((x) => x.stated !== null) ? ', and the one its label states' : ''}.`] : [`Each room's area against the drawing: ${listed.map(roomWords).join('; ')}${listed.length < r.rooms.length ? `; the other ${r.rooms.length - listed.length} are as drawn` : ''}.`]),
    `Openings against the drawing: ${placed.length} of ${openings.length} placed${openings.some((o) => o.written === 'raw') ? ` (${openings.filter((o) => o.written === 'raw').length} written raw on their wall)` : ''}, the furthest ${(furthest * 1000).toFixed(1)} mm along its wall from where the drawing has it.`,
    `Each part keeps where it came from as the fact ${r.factName}: ${count(sourceCount, 'room')}, ${count(Object.keys(r.facts.walls).length, 'wall')} and ${count(Object.keys(r.facts.openings).length, 'opening')} (grid_find and grid_fields read them).`,
    `Assumed, to confirm with the person (${r.assumed.length}):`,
    ...r.assumed.map((a) => `  - ${a}`),
    ...(r.leftOut.length === 0 ? [] : [`Not written: ${r.leftOut.join(' ')}`]),
    ...done.lines,
  ]
  return { drawing, reading, roomsFile: writtenRooms, done, lines }
}
