/**
 * What a plan file is (WRT-13). A plan is told by what it holds, never by a missing version: a
 * list of walls, rooms or openings (an empty one is a plan with nothing drawn yet) or the stamp
 * Grid writes when it writes a plan from rooms text. And some files are never a plan whatever
 * they hold: `grid.json`, the files Grid keeps beside a plan and the firm's standards. CMD-45: a
 * change written to another file than the plan read is held to the same rules (`refusePlanTarget`).
 */
import path from 'node:path'
import { say } from '@ongrid/floorplan/messages'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { BRIEF_SUFFIX } from '../brief/brief'
import { PREVIEW_SUFFIX } from '../preview/record'
import { SEEN_SUFFIX } from '../seen/marks'
import { MARKERS_SUFFIX } from '../versions/markers'
import { SCAN_SUFFIX } from './scan'
import { PROJECT_FILE } from './init'
import { PlanRefused } from './plan'
import { PLAN_FILE_MAX_BYTES } from './planText'
import { OCCUPANCY_SUFFIX } from '../occupancy/occupancy'
import { FIRM_FILE } from '../firm/standards'
import type { Project } from '../fs/projectFiles'

/**
 * The end of the name of a plan's sheet words, `SHEET_SUFFIX` in `sheet/sheetFile.ts`, written
 * here so reading a plan does not load the sheet's PDF code; a test holds the two the same.
 */
export const SHEET_WORDS_SUFFIX = '.sheet.json'

/** True when the parsed JSON holds something a plan holds. */
export function holdsAPlan(raw: Readonly<Record<string, unknown>>): boolean {
  if (['walls', 'rooms', 'openings'].some((key) => Array.isArray(raw[key]))) return true
  const written = raw['written']
  return typeof written === 'object' && written !== null && !Array.isArray(written)
}

/** What a file's own name says it is for, in Grid's words, when it is one of Grid's own; null for any other name. */
export function gridFileKind(file: string): string | null {
  const name = path.basename(file).toLowerCase()
  if (name === PROJECT_FILE) return say('en', 'plan.fileKind.project', {})
  if (name === FIRM_FILE) return say('en', 'plan.fileKind.firm', {})
  const beside: ReadonlyArray<readonly [string, 'markers' | 'seen' | 'brief' | 'preview' | 'scan' | 'occupancy' | 'sheet']> = [
    [MARKERS_SUFFIX, 'markers'],
    [SEEN_SUFFIX, 'seen'],
    [BRIEF_SUFFIX, 'brief'],
    [PREVIEW_SUFFIX, 'preview'],
    [SCAN_SUFFIX, 'scan'],
    [OCCUPANCY_SUFFIX, 'occupancy'],
    [SHEET_WORDS_SUFFIX, 'sheet'],
  ]
  const hit = beside.find(([suffix]) => name.endsWith(suffix))
  return hit === undefined ? null : say('en', `plan.fileKind.${hit[1]}`, {})
}

/** Refuses, before anything is written, a plan file whose name is one of Grid's own. */
export function refuseGridFile(shown: string, file: string): void {
  const kind = gridFileKind(file)
  if (kind !== null) throw new PlanRefused(say('en', 'plan.notAPlan.gridFile', { file: shown, kind }))
}

/**
 * CMD-45: refuses, before anything is written, a file a plan is about to be written into that is
 * not a plan: one of Grid's own by its name, or a file there already that is not a JSON object
 * holding a plan, such as `tsconfig.json`. A new file is let through. Read as text, not through
 * `loadPlan`: a plan with a fault in it is still a plan, and may be written over.
 */
export function refusePlanTarget(project: Project, file: string): void {
  const shown = project.shown(project.resolve(file))
  refuseGridFile(shown, file)
  if (!project.exists(file)) return
  let raw: unknown = null
  try {
    raw = JSON.parse(project.readText(file, PLAN_FILE_MAX_BYTES).text)
  } catch {
    // Text that is not JSON, or not text at all, holds no plan either.
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && holdsAPlan(raw as Record<string, unknown>)) return
  throw new PlanRefused(say('en', 'plan.notAPlan.target', { file: shown }))
}

/**
 * CMD-45: true when a plan holds nothing a plan picture draws, so it is refused rather than drawn
 * as a blank page. `lines` are its record's: `plan/empty` says it has no walls, rooms, openings,
 * items or floor outline, and a plot, a column, a bay or a trace image is something to draw too.
 */
export function nothingToDraw(plan: FloorPlan, lines: readonly { readonly code: string }[]): boolean {
  if (!lines.some((line) => line.code === 'plan/empty')) return false
  return plan.site === undefined && plan.referenceImage === undefined && (plan.columns ?? []).length === 0 && (plan.bays ?? []).length === 0
}

/** The files Grid knows by their first bytes and does not read as a plan (CMD-20). */
export type ForeignKind = 'dxf' | 'dwg' | 'ifc' | 'pdf' | 'png' | 'jpeg'

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte)
}

/**
 * What a file is when its first bytes say it is a CAD file, a PDF or a picture, else null. Told
 * by the bytes alone: a DXF named `plan.json` is still a DXF. A DXF's first lines are pairs of a
 * code and a value: comments (999), then `0` and `SECTION`.
 */
export function foreignFileKind(bytes: Uint8Array): ForeignKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  const head = Buffer.from(bytes.subarray(0, 512)).toString('latin1').replace(/^\xEF\xBB\xBF/, '')
  if (head.startsWith('%PDF-')) return 'pdf'
  if (/^AC10\d\d/.test(head)) return 'dwg'
  if (/^\s*ISO-10303-21\s*;/.test(head)) return 'ifc'
  if (head.startsWith('AutoCAD Binary DXF')) return 'dxf'
  if (/^\s*(?:999\r?\n[^\n]*\n\s*)*0\r?\n\s*SECTION\s*(?:\r?\n|$)/.test(head)) return 'dxf'
  return null
}

/** Refuses a plan file that is a CAD file, a PDF or a picture, saying what it is and what to do. */
export function refuseForeignFile(shown: string, bytes: Uint8Array): void {
  const kind = foreignFileKind(bytes)
  if (kind !== null) throw new PlanRefused(say('en', `plan.foreign.${kind}`, { file: shown }))
}
