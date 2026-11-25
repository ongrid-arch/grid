/**
 * What a plan file is (WRT-13). A plan is told by what it holds, never by a missing version: a
 * list of walls, rooms or openings (an empty one is a plan with nothing drawn yet) or the stamp
 * Grid writes when it writes a plan from rooms text. And some files are never a plan whatever
 * they hold: `grid.json` and the files Grid keeps beside a plan.
 */
import path from 'node:path'
import { BRIEF_SUFFIX } from '../brief/brief'
import { PREVIEW_SUFFIX } from '../preview/record'
import { SEEN_SUFFIX } from '../seen/marks'
import { MARKERS_SUFFIX } from '../versions/markers'
import { SCAN_SUFFIX } from './scan'
import { PROJECT_FILE } from './init'
import { PlanRefused } from './plan'

/** True when the parsed JSON holds something a plan holds. */
export function holdsAPlan(raw: Readonly<Record<string, unknown>>): boolean {
  if (['walls', 'rooms', 'openings'].some((key) => Array.isArray(raw[key]))) return true
  const written = raw['written']
  return typeof written === 'object' && written !== null && !Array.isArray(written)
}

/** What a file's own name says it is for, when it is one of Grid's own; null for any other name. */
export function gridFileKind(file: string): string | null {
  const name = path.basename(file).toLowerCase()
  if (name === PROJECT_FILE) return 'the file that marks the folder as a Grid project'
  const beside: ReadonlyArray<readonly [string, string]> = [
    [MARKERS_SUFFIX, 'start markers'],
    [SEEN_SUFFIX, 'the notes set aside as seen'],
    [BRIEF_SUFFIX, 'the brief'],
    [PREVIEW_SUFFIX, 'the preview record'],
    [SCAN_SUFFIX, 'the room scan'],
  ]
  const hit = beside.find(([suffix]) => name.endsWith(suffix))
  return hit === undefined ? null : `a file Grid keeps beside a plan (${hit[1]})`
}

/** Refuses, before anything is written, a plan file whose name is one of Grid's own. */
export function refuseGridFile(shown: string, file: string): void {
  const kind = gridFileKind(file)
  if (kind !== null) throw new PlanRefused(`${shown} is not a plan file: it is ${kind}, and a plan is never written into it. Name another .json file for the plan; replace does not change this.`)
}
