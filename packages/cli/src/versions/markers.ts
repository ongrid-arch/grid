/**
 * WRT-8: start markers, so a comparison works without git.
 *
 * A marker is a copy of the plan file as it was when the marker was set, kept under a short
 * name in a file of its own beside the plan, `<plan>.markers.json` (`plan.markers.json` beside
 * `plan.json`), read and written only through `fs/projectFiles.ts` and its atomic writer. An
 * agent sets `start` before it edits; `grid diff --since start` compares the plan with it.
 *
 *   {
 *     "version": "1",
 *     "markers": [
 *       { "name": "start", "at": "2026-11-22T10:00:00.000Z", "text": "{\"version\":\"1\", …}" }
 *     ]
 *   }
 *
 * A plan keeps at most `MARKERS_MAX` markers: setting a marker under a name it has replaces
 * that one; CMD-44: a new name past the limit rolls the oldest marker off, and the answer names
 * it. A marker may say who set it (`by`) and why (`note`). `text` is the plan file's own text,
 * read later as the plan file is read. The plan knows nothing of its markers, and no export,
 * sheet or drawing reads them. Every change keeps the plan it replaced as well, without a marker
 * (`history.ts`). CMD-57: a marker keeps the brief beside the plan too (`brief`, the text
 * `briefJson` writes, or null when there was none); a marker without it was set before.
 */
import path from 'path'
import { PathRefused, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { PLAN_FILE_MAX_BYTES } from '../command/planText'
import { BRIEF_FILE_MAX_BYTES } from '../brief/brief'

/** What the file name adds to the plan's name. */
export const MARKERS_SUFFIX = '.markers.json'
/** The most markers a plan keeps. */
export const MARKERS_MAX = 20
/** CMD-44: the longest note and name of who set a marker. */
export const MARKER_NOTE_MAX = 200
export const MARKER_BY_MAX = 60
/** The marker set when none is named, and read when none is named. */
export const DEFAULT_MARKER = 'start'
/** The name that means the last committed version, never a marker's. */
export const GIT_VERSION = 'git'
/** CNT-10: the name that means the plan before its work, compared with it after: never a marker's. */
export const PHASE_VERSION = 'phase'
/** A marker's name: letters, digits, dot, dash and underscore, 1 to 40 of them, starting with a letter or digit. */
export const MARKER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/
/** The largest markers file Grid reads: every marker a whole plan and its brief, their text written as JSON text. */
export const MARKERS_FILE_MAX_BYTES = 2 * MARKERS_MAX * (PLAN_FILE_MAX_BYTES + BRIEF_FILE_MAX_BYTES)

/** Why a marker or the markers file was refused. One line. */
export class MarkerRefused extends Error {
  override readonly name = 'MarkerRefused'
}

export interface Marker {
  readonly name: string
  /** When it was set, as an ISO date and time. */
  readonly at: string
  /** The plan file's text when it was set. */
  readonly text: string
  /** CMD-44: who set it, as they named themselves, and why. */
  readonly by?: string
  readonly note?: string
  /** CMD-57: the brief beside the plan when it was set, null when there was none; left out by a marker set before. */
  readonly brief?: string | null
}

/** The markers file of a plan file: beside it, its name without `.json` and `.markers.json` after. */
export function markersFileOf(planFile: string): string {
  const name = path.basename(planFile)
  const base = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name
  return path.join(path.dirname(planFile), `${base}${MARKERS_SUFFIX}`)
}

/** A marker name, checked: refused by its rule, never repeated back when it is long. */
export function markerName(name: string): string {
  if (name === GIT_VERSION) throw new MarkerRefused(`"${GIT_VERSION}" names the last committed version, not a marker: choose another name, such as start.`)
  if (name === PHASE_VERSION) throw new MarkerRefused(`"${PHASE_VERSION}" names the plan before its work, not a marker: choose another name, such as start.`)
  if (!MARKER_NAME.test(name)) throw new MarkerRefused('A marker name is 1 to 40 letters, digits, dots, dashes or underscores, starting with a letter or digit, such as start or before-kitchen.')
  return name
}

function parseMarkers(raw: unknown, shown: string): Marker[] {
  const bad = (why: string): MarkerRefused => new MarkerRefused(`${shown} is not a markers file: ${why}. Remove it, or set the markers again.`)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw bad('it is not a JSON object')
  const file = raw as Record<string, unknown>
  if (file['version'] !== '1') throw bad('its version is not "1"')
  if (!Array.isArray(file['markers'])) throw bad('it has no list of markers')
  if (file['markers'].length > MARKERS_MAX) throw bad(`it has more than ${MARKERS_MAX} markers`)
  const markers: Marker[] = []
  for (const item of file['markers'] as unknown[]) {
    const m = item as Record<string, unknown>
    if (typeof m !== 'object' || m === null || typeof m['name'] !== 'string' || !MARKER_NAME.test(m['name']) || m['name'] === GIT_VERSION) throw bad('a marker has no name Grid reads')
    if (typeof m['at'] !== 'string' || Number.isNaN(Date.parse(m['at']))) throw bad(`marker ${m['name']} has no time`)
    if (typeof m['text'] !== 'string') throw bad(`marker ${m['name']} holds no plan`)
    const brief = typeof m['brief'] === 'string' || m['brief'] === null ? { brief: m['brief'] } : {}
    if (markers.some((x) => x.name === m['name'])) throw bad(`it names ${m['name']} twice`)
    markers.push({ name: m['name'], at: m['at'], text: m['text'], ...(typeof m['by'] === 'string' ? { by: m['by'] } : {}), ...(typeof m['note'] === 'string' ? { note: m['note'] } : {}), ...brief })
  }
  return markers
}

/** The plan file's markers, oldest first; none when there is no markers file. */
export function readMarkers(project: Project, planFile: string): Marker[] {
  const file = markersFileOf(planFile)
  const shown = path.basename(file)
  let text: string
  try {
    text = project.readText(file, MARKERS_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof PathRefused) throw error
    if (error instanceof TextNotDecoded) throw new MarkerRefused(`${shown} can't be read: ${error.message.replace(/\s+/g, ' ')}`)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    if (code === 'EISDIR') throw new MarkerRefused(`${shown} is a folder, not a markers file.`)
    if (code === 'EFBIG') throw new MarkerRefused(`${shown} is larger than ${MARKERS_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a markers file.`)
    if (code === 'EACCES' || code === 'EPERM') throw new MarkerRefused(`${shown} can't be read: permission denied.`)
    throw error
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new MarkerRefused(`${shown} is not JSON. Remove it, or set the markers again.`)
  }
  return parseMarkers(raw, shown)
}

function writeMarkers(project: Project, planFile: string, markers: readonly Marker[]): string {
  const file = markersFileOf(planFile)
  const real = project.writeFile(file, `${JSON.stringify({ version: '1', markers }, null, 2)}\n`)
  return project.relative(real)
}

export interface MarkerSet {
  /** The markers file, relative to the project folder. */
  readonly file: string
  readonly marker: Marker
  /** Whether a marker of that name was there and was replaced. */
  readonly replaced: boolean
  readonly names: readonly string[]
  /** CMD-44: the oldest marker, rolled off to make room; null when none was. */
  readonly rolled: Marker | null
}

/** Who set a marker and why, both optional. */
export interface MarkerWords {
  readonly by?: string | undefined
  readonly note?: string | undefined
  /** CMD-57: the brief to keep with it; left out, it keeps none. */
  readonly brief?: string | null | undefined
}

/** Sets a marker to the plan file's text now. CMD-44: past `MARKERS_MAX`, the oldest rolls off. */
export function setMarker(project: Project, planFile: string, name: string, text: string, at: string = new Date().toISOString(), words: MarkerWords = {}): MarkerSet {
  markerName(name)
  const markers = readMarkers(project, planFile)
  const replaced = markers.some((m) => m.name === name)
  const rolled = !replaced && markers.length >= MARKERS_MAX ? markers[0]! : null
  const marker: Marker = { name, at, text, ...(words.by === undefined ? {} : { by: words.by.slice(0, MARKER_BY_MAX) }), ...(words.note === undefined ? {} : { note: words.note.slice(0, MARKER_NOTE_MAX) }), ...(words.brief === undefined ? {} : { brief: words.brief }) }
  const kept = rolled === null ? markers : markers.slice(1)
  const next = replaced ? kept.map((m) => (m.name === name ? marker : m)) : [...kept, marker]
  return { file: writeMarkers(project, planFile, next), marker, replaced, names: next.map((m) => m.name), rolled }
}

/** Takes a marker off. Refused when there is none of that name. */
export function removeMarker(project: Project, planFile: string, name: string): { readonly file: string; readonly names: readonly string[] } {
  markerName(name)
  const markers = readMarkers(project, planFile)
  if (!markers.some((m) => m.name === name)) throw new MarkerRefused(noMarker(name, markers))
  const next = markers.filter((m) => m.name !== name)
  return { file: writeMarkers(project, planFile, next), names: next.map((m) => m.name) }
}

function noMarker(name: string, markers: readonly Marker[]): string {
  const there = markers.length === 0 ? 'it has none' : `it has ${markers.map((m) => m.name).join(', ')}`
  return `The plan has no marker ${JSON.stringify(name)}: ${there}. Set one with grid mark ${name} (the tool grid_mark_start) before the edit.`
}

/** The marker of that name. Refused, naming the markers there are, when there is none. */
export function findMarker(project: Project, planFile: string, name: string): Marker {
  markerName(name)
  const markers = readMarkers(project, planFile)
  const found = markers.find((m) => m.name === name)
  if (found === undefined) throw new MarkerRefused(noMarker(name, markers))
  return found
}
