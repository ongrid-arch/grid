/**
 * WRT-8: `grid diff` and `grid mark`, the command's side of the tools `grid_diff` and
 * `grid_mark_start`, sharing their code (`versions/`).
 *
 * `grid mark [<name>]` keeps the plan as it is now under a name (`start` unless named) in the
 * markers file beside it. `grid diff [<plan.json>] [--since <name>|git]` compares the plan with
 * that version, or with the version last committed in the project's own git folder, by what
 * stands where: issues first, then the verdict room by room, then the changes one line each.
 * `--rooms` names the rooms meant to be edited, `--floor` narrows the lists to one floor (CMD-32)
 * and `--picture` writes the comparison's picture.
 */
import { historySay } from '../versions/words'
import { readPlainId } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import type { Project } from '../fs/projectFiles'
import { DIFF_SHOWS, diffData, diffSince, diffText, type DiffShow } from '../versions/diff'
import { DEFAULT_MARKER, MARKERS_MAX, removeMarker, setMarker, type MarkerWords } from '../versions/markers'
import { floorOption, loadPlan } from './plan'
import { PROJECT_OPTION, UsageError, type OptionSpecs } from './options'

export const DIFF_OPTIONS: OptionSpecs = {
  '--since': { takesValue: true, help: `What to compare with: a marker's name, git for the version last committed in the project's .git, or phase for the plan before its work (CNT-10). The marker ${DEFAULT_MARKER} when the plan has one, else git.` },
  // CMD-44: the later version, named as --since is.
  '--to': { takesValue: true, help: 'The later version, named as --since is (a marker, git~1, last, a revision or a date): compares two earlier versions. The plan as it is now when left out.' },
  '--rooms': { takesValue: true, help: 'The rooms meant to be edited, by id, separated by commas: every change outside them is named.' },
  '--show': { takesValue: true, help: `What to print: ${DIFF_SHOWS.join(', ')}. all when left out.` },
  '--picture': { takesValue: true, help: 'Write the comparison as a PNG to this file: removed in red, added in green, what changed in amber, the rest pale.' },
  '--out': { takesValue: true, help: 'The same as --picture, named as grid draw and grid sheet name their file.' },
  '--floor': { takesValue: true, help: 'The floor to show: only the changes, rooms and openings on it are listed, and --picture draws it. The issues and the verdict stay whole. Every floor, and for --picture the first floor with a change, when left out.' },
  '--json': { takesValue: false, help: 'Print the comparison as JSON.' },
  ...PROJECT_OPTION,
}

export const MARK_OPTIONS: OptionSpecs = {
  '--plan': { takesValue: true, help: 'The plan file to mark, the same as naming it after the marker: grid mark <name> <plan.json>. The project\'s plan.json when left out, in a folder grid init made.' },
  '--remove': { takesValue: false, help: 'Take the marker off.' },
  // CMD-44: who set the marker and why.
  '--who': { takesValue: true, help: 'Who sets the marker, as you name yourself.' },
  '--note': { takesValue: true, help: 'Why the marker is set, kept with it.' },
  ...PROJECT_OPTION,
}

export interface DiffRequest {
  readonly since?: string
  readonly to?: string
  readonly rooms?: string
  readonly show?: string
  readonly picture?: string
  readonly floor?: string
}

/** The options of `grid diff`, checked before anything is read. */
export function checkDiffRequest(request: DiffRequest): { show: DiffShow; rooms: string[] | undefined } {
  if (request.show !== undefined && !(DIFF_SHOWS as readonly string[]).includes(request.show)) throw new UsageError(`--show takes ${DIFF_SHOWS.join(', ')}.`)
  let rooms: string[] | undefined
  if (request.rooms !== undefined) {
    const given = request.rooms.split(',').map((id) => id.trim()).filter((id) => id !== '')
    if (given.length === 0) throw new UsageError('--rooms takes room ids separated by commas, such as kitchen,hall.')
    // CMD-24: the one id rule every tool reads ids by: `baño` is `bano`.
    const plain = given.map(readPlainId)
    if (plain.some((id) => id === null)) throw new UsageError('--rooms takes room ids: letters, digits, dots, dashes and underscores, separated by commas.')
    rooms = plain as string[]
  }
  return { show: (request.show as DiffShow | undefined) ?? 'all', rooms }
}

export interface DiffDone {
  readonly text: string
  readonly json: string
  /** The picture's bytes, when one was asked for and something changed. */
  readonly png: Uint8Array | null
  readonly floor: string | null
}

export async function runDiff(project: Project, planFile: string, request: DiffRequest): Promise<DiffDone> {
  const { show, rooms } = checkDiffRequest(request)
  // CMD-15: the picture's path is checked before the plans are read.
  if (request.picture !== undefined) project.writable(request.picture)
  const run = diffSince(project, planFile, request.since, rooms, request.to)
  // CMD-32: a floor the plan does not have is refused by name, never drawn as another.
  const asked = floorOption(run.later.plan, request.floor)
  const data = diffData(run, show, asked)
  let png: Uint8Array | null = null
  let floor: string | null = null
  const lines = [GENERAL_GUIDANCE_LABEL, diffText(run, show, asked)]
  if (request.picture !== undefined) {
    if (run.comparison.sameBuilding) lines.push('No picture: nothing changed.')
    else {
      const { comparisonView } = await import('../draw/views')
      const view = await comparisonView(run.comparison, run.later.plan, asked ?? run.comparison.diff.changes[0]?.floor)
      png = view.png
      floor = view.floor
    }
  }
  return { text: `${lines.join('\n')}\n`, json: `${JSON.stringify({ label: GENERAL_GUIDANCE_LABEL, ...data }, null, 2)}\n`, png, floor }
}

/** `grid mark [<name>]`: sets, or with `--remove` takes off, a start marker. */
export function runMark(project: Project, planFile: string, name: string | undefined, remove: boolean, words: MarkerWords = {}): string {
  const marker = name ?? DEFAULT_MARKER
  if (remove) {
    const done = removeMarker(project, planFile, marker)
    return `${GENERAL_GUIDANCE_LABEL}\nTook marker ${JSON.stringify(marker)} off. Markers kept in ${done.file}: ${done.names.join(', ') || 'none'}.\n`
  }
  const loaded = loadPlan(project, planFile)
  const done = setMarker(project, planFile, marker, loaded.text ?? JSON.stringify(loaded.plan), undefined, words)
  const rolled = done.rolled === null ? '' : `${historySay('tool.history.markerRolled', { name: { name: done.rolled.name }, max: MARKERS_MAX })}\n`
  return `${GENERAL_GUIDANCE_LABEL}\n${done.replaced ? 'Set marker' : 'Marked'} ${JSON.stringify(marker)}: the plan as it is now, kept in ${done.file}. Markers: ${done.names.join(', ')} (at most ${MARKERS_MAX}). After the edit, grid diff --since ${marker} says what changed.\n${rolled}`
}
