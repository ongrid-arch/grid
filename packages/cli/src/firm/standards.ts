/**
 * COD-8: a firm's own standards, kept in a plain file beside the plan: `firm-standards.json`, in
 * the plan's folder, for every plan there. A firm keeps it in git with its projects, and owns it.
 * It is read only through `fs/projectFiles.ts`; the plan knows nothing of it, and no export,
 * sheet or drawing reads it.
 *
 *   {
 *     "version": "1",
 *     "heading": "The firm's own standards: the firm's figures, not from any code or standard.",
 *     "standards": [
 *       { "measure": "corridor_width", "value": 1.5, "unit": "m", "name": "Corridors" },
 *       { "measure": "door_clear_width", "value": 850, "unit": "mm", "note": "Our office guide, part 3" },
 *       { "measure": "room_area", "value": 9, "unit": "m²", "uses": ["office"] },
 *       { "measure": "fixture_clearance", "value": 0.8, "unit": "m", "kinds": ["toilet"] },
 *       { "measure": "fixture_clearance", "value": 0.7, "width": 0.8, "unit": "m", "kinds": ["toilet"] }
 *     ]
 *   }
 *
 * Every figure in it is the firm's own: a least size, never a code's, so it cites no document,
 * has no status and is never `ai-found`. A field a code's figure carries (a document, a clause,
 * a status) is refused and says so. A measure Grid does not know is refused with the ones it
 * knows. A refusal names the place and the limit, and never repeats the text (MSG-9).
 */
import path from 'path'
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { itemKinds } from '@ongrid/floorplan/geometry'
import { FIRM_MEASURE_NAMES, FIRM_MEASURES, FIRM_ROOM_MEASURES, type FirmMeasure, type FirmStandard } from '@ongrid/rules'
import { PathRefused, quoted, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { NAME_MAX } from '../command/planText'
import { reasonProblem } from '../seen/marks'

/** The firm's file, in the plan's folder. */
export const FIRM_FILE = 'firm-standards.json'
/** The largest firm's file Grid reads. */
export const FIRM_FILE_MAX_BYTES = 1024 * 1024
/** The most standards a firm's file may hold. */
export const STANDARDS_MAX = 200
/** The longest note a standard may keep: the firm's words on where it comes from. */
export const NOTE_MAX = 300

/** The heading the firm's file may carry, and the one Grid writes in the examples. */
export const FIRM_FILE_HEADING = "The firm's own standards: the firm's figures, not from any code or standard."

/** The units a standard may be written in: metres or millimetres for a length, square metres for an area. */
const LENGTH_UNITS = ['m', 'mm'] as const
const AREA_UNITS = ['m²', 'm2'] as const

/** The fields a code's figure carries and a firm's standard never does: it cites no code. */
const CITATION_FIELDS = ['document', 'edition', 'clause', 'section', 'source', 'sources', 'citation', 'citations', 'status', 'verified', 'verifiedBy', 'verified_by', 'readOn', 'read_on', 'jurisdiction', 'country', 'place']

/** Why a firm's file was refused. One line, naming the place, never repeating the text. */
export class FirmRefused extends Error {
  override readonly name = 'FirmRefused'
}

/** The firm's file of a plan file: `firm-standards.json` in its folder. */
export function firmFileOf(planFile: string): string {
  return path.join(path.dirname(planFile), FIRM_FILE)
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const KEY = /^[A-Za-z0-9._-]{1,64}$/

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key))
  if (unknown.length === 0) return
  const cited = unknown.find((key) => CITATION_FIELDS.includes(key))
  if (cited !== undefined) {
    throw new FirmRefused(`${where} holds ${quoted(cited)}, which a code's figure carries: a firm's standard is the firm's own and cites no code. Say where it comes from, in the firm's words, in note`)
  }
  const named = unknown.length === 1 && KEY.test(unknown[0]!) ? ` (${quoted(unknown[0]!)})` : ''
  throw new FirmRefused(`${where} holds a field Grid does not know${named}: it may hold only ${listOf(keys)}`)
}

function words(value: unknown, where: string, max: number): string {
  if (typeof value !== 'string') throw new FirmRefused(`${where} must be text`)
  const problem = reasonProblem(value, max)
  if (problem !== null) throw new FirmRefused(`${where} ${problem}`)
  return value
}

function wordList<T extends string>(value: unknown, where: string, known: readonly T[], what: string): T[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length === 0) throw new FirmRefused(`${where} must be a list of ${what}, with at least one`)
  if (value.length > known.length) throw new FirmRefused(`${where} holds ${value.length.toLocaleString('en-US')} items; it may hold at most ${known.length}`)
  return value.map((item, i) => {
    if (!known.includes(item as T)) throw new FirmRefused(`${where}[${i}] must be one of the ${what}: ${known.join(', ')}`)
    return item as T
  })
}

function standard(raw: unknown, where: string): FirmStandard {
  if (!isObject(raw)) throw new FirmRefused(`${where} must be an object with measure, value and unit`)
  const measureRaw = raw['measure']
  if (!FIRM_MEASURE_NAMES.includes(measureRaw as FirmMeasure)) {
    const named = typeof measureRaw === 'string' && KEY.test(measureRaw) ? ` ${quoted(measureRaw)}` : ''
    throw new FirmRefused(`${where}.measure names a measure Grid does not know${named}. The measures it knows: ${listOf([...FIRM_MEASURE_NAMES])}`)
  }
  const measure = measureRaw as FirmMeasure
  const keys = ['measure', 'value', 'unit', 'name', 'note', ...(FIRM_ROOM_MEASURES.includes(measure) ? ['uses'] : []), ...(measure === 'fixture_clearance' ? ['kinds', 'width'] : [])]
  onlyKeys(raw, keys, where)
  const area = FIRM_MEASURES[measure].unit === 'm²'
  const units: readonly string[] = area ? AREA_UNITS : LENGTH_UNITS
  const unit = raw['unit']
  if (!units.includes(unit as string)) throw new FirmRefused(`${where}.unit must be ${area ? 'm² (or m2): a room area is in square metres' : 'm or mm: a length is in metres or millimetres'}`)
  const written = unit === 'm2' ? 'm²' : (unit as FirmStandard['written'])
  const value = raw['value']
  const max = written === 'mm' ? 100_000 : written === 'm' ? 100 : 100_000
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new FirmRefused(`${where}.value must be a number of ${written === 'mm' ? 'millimetres' : written === 'm' ? 'metres' : 'square metres'} above 0 and at most ${max.toLocaleString('en-US')}`)
  }
  // ARE-73: a fixture's clear floor as a zone on its centre line, as wide as this, in the standard's unit.
  const widthRaw = raw['width']
  if (widthRaw !== undefined && (typeof widthRaw !== 'number' || !Number.isFinite(widthRaw) || widthRaw <= 0 || widthRaw > max)) {
    throw new FirmRefused(`${where}.width must be a number of ${written === 'mm' ? 'millimetres' : 'metres'} above 0 and at most ${max.toLocaleString('en-US')}: the width of the zone on the fixture's centre line`)
  }
  const name = raw['name'] === undefined || raw['name'] === null ? null : words(raw['name'], `${where}.name`, NAME_MAX)
  const note = raw['note'] === undefined || raw['note'] === null ? null : words(raw['note'], `${where}.note`, NOTE_MAX)
  return {
    measure,
    value: written === 'mm' ? value / 1000 : value,
    written,
    name,
    note,
    uses: wordList(raw['uses'], `${where}.uses`, ROOM_USES, 'room uses'),
    // ARE-73: the registry's fixture kinds, so a kind added to it is taken with no change here.
    kinds: wordList(raw['kinds'], `${where}.kinds`, itemKinds('fixture'), 'fixture kinds'),
    ...(typeof widthRaw === 'number' ? { width: written === 'mm' ? widthRaw / 1000 : widthRaw } : {}),
  }
}

/** The firm's standards, checked. Refused with the first place that is wrong. */
export function parseFirmStandards(raw: unknown): FirmStandard[] {
  if (!isObject(raw)) throw new FirmRefused('it must be a JSON object with version and standards')
  onlyKeys(raw, ['version', 'heading', 'standards'], 'the file')
  if (raw['version'] !== '1') throw new FirmRefused('version must be "1"')
  if (raw['heading'] !== undefined) words(raw['heading'], 'heading', NOTE_MAX)
  const list = raw['standards']
  if (!Array.isArray(list)) throw new FirmRefused('standards must be a list')
  if (list.length === 0) throw new FirmRefused('standards holds none: give at least one')
  if (list.length > STANDARDS_MAX) throw new FirmRefused(`standards holds ${list.length.toLocaleString('en-US')} items; it may hold at most ${STANDARDS_MAX}`)
  return list.map((item, i) => standard(item, `standards[${i}]`))
}

function oneLine(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

/** The firm's file as read: its path in the project, its standards, and why it could not be read. */
export interface FirmRead {
  /** The firm's file, relative to the project folder. */
  readonly file: string
  readonly standards: readonly FirmStandard[]
  /** Why the file could not be read, when it is there and wrong: then it holds no standards. */
  readonly problem: string | null
}

/**
 * Reads the firm's file beside `planFile`, inside the project. Null when there is none. A file
 * that can't be read says why, so a check never fails on it. A path the project refuses throws
 * `PathRefused`, as the seen marks beside the plan do.
 */
export function readFirm(project: Project, planFile: string): FirmRead | null {
  const file = firmFileOf(planFile)
  const shown = path.basename(file)
  const relative = project.relative(project.resolve(file))
  const problem = (why: string): FirmRead => ({ file: relative, standards: [], problem: why })
  let text: string
  try {
    text = project.readText(file, FIRM_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof PathRefused) throw error
    if (error instanceof TextNotDecoded) return problem(`${shown}: ${oneLine(error.message)}`)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    if (code === 'EISDIR') return problem(`${shown} is a folder, not a firm's standards file`)
    if (code === 'EFBIG') return problem(`${shown} is larger than ${FIRM_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a firm's standards file`)
    if (code === 'EACCES' || code === 'EPERM') return problem(`${shown} can't be read: permission denied`)
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // The parser's message quotes the text around the fault, and the text holds the firm's words.
    return problem(`${shown} is not JSON`)
  }
  try {
    return { file: relative, standards: parseFirmStandards(raw), problem: null }
  } catch (error) {
    if (error instanceof FirmRefused) return problem(`${shown}: ${error.message}`)
    throw error
  }
}
