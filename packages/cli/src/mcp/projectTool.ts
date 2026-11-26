/**
 * `grid_project` (CMD-18): what the project folder holds, for the first call of a session: the
 * plan Grid uses when none is named and why, every plan file in the folder, and the files kept
 * beside each plan. It reads the folder's own names and each .json file to tell a plan, writes
 * nothing and walks no folder below.
 */
import path from 'path'
import { defaultPlanOrigin, PROJECT_FILE, projectPlanFile } from '../command/init'
import { BRIEF_SUFFIX } from '../brief/brief'
import { SCAN_SUFFIX } from '../command/scan'
import { OCCUPANCY_SUFFIX } from '../occupancy/occupancy'
import { PREVIEW_SUFFIX } from '../preview/record'
import { SEEN_SUFFIX } from '../seen/marks'
import { MARKERS_SUFFIX } from '../versions/markers'
import { CHECKPOINTS_SUFFIX, HISTORY_SUFFIX } from '../versions/history'
import { PathRefused } from '../fs/projectFiles'
import { BOOLEAN, listSchema, NULLABLE_STRING, objectSchema, projectOf, STRING, ToolRefusal, type GridTool } from './toolkit'

export const PROJECT_TOOL_NAME = 'grid_project'

/** The files kept beside a plan, by the name of the kind and the end of its file name. */
const SIDECARS: ReadonlyArray<readonly [string, string]> = [
  ['brief', BRIEF_SUFFIX],
  ['markers', MARKERS_SUFFIX],
  // CMD-44: the change log and the folder of the plans each change replaced.
  ['history', HISTORY_SUFFIX],
  ['checkpoints', CHECKPOINTS_SUFFIX],
  ['seen', SEEN_SUFFIX],
  ['preview', PREVIEW_SUFFIX],
  ['scan', SCAN_SUFFIX],
  ['occupancy', OCCUPANCY_SUFFIX],
]
const SIDECAR_SUFFIXES = SIDECARS.map(([, suffix]) => suffix)
/** The largest file read to tell whether it is a plan; a larger one is not listed as one. */
const READ_MAX_BYTES = 16 * 1024 * 1024
/** The most plan files listed. */
const PLANS_MAX = 100

function isSidecar(name: string): boolean {
  return SIDECAR_SUFFIXES.some((suffix) => name.endsWith(suffix)) || name === PROJECT_FILE || name === 'firm-standards.json'
}

/** Whether a file reads as a plan: a JSON object with a version and walls or rooms. */
function readsAsPlan(project: ReturnType<typeof projectOf>, name: string): boolean {
  try {
    const text = new TextDecoder().decode(project.readBytes(name, READ_MAX_BYTES))
    const value = JSON.parse(text.replace(/^﻿/, '')) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const o = value as Record<string, unknown>
    return 'version' in o && ('walls' in o || 'rooms' in o || 'floors' in o)
  } catch {
    return false
  }
}

export const projectTool: GridTool = {
  name: PROJECT_TOOL_NAME,
  title: 'List what the project folder holds',
  hint: 'read',
  description:
    'Use this when you start, and do not know which plan to work on or whether the folder has one: it lists the plan files in the project folder, the plan Grid uses when you name none (plan.json in the folder, with or without grid.json) and whether that file is there, and beside each plan the files Grid keeps for it (brief, markers, change log and checkpoints, seen marks, preview record, scan, occupancy). '
    + 'It reads the folder\'s own names only, writes nothing and does not look in folders below it. '
    + 'Do not use to read a plan (grid_describe), to check it (grid_check), or to find files elsewhere on the computer.',
  args: {},
  outputSchema: objectSchema({
    folder: STRING,
    project: BOOLEAN,
    defaultPlan: STRING,
    defaultPlanThere: BOOLEAN,
    plans: listSchema(objectSchema({
      file: STRING,
      default: BOOLEAN,
      beside: listSchema(objectSchema({ kind: STRING, file: STRING })),
    })),
    other: listSchema(objectSchema({ kind: STRING, file: STRING })),
    note: NULLABLE_STRING,
  }),
  run(_args, context) {
    const project = projectOf(context)
    let names: string[]
    try {
      names = project.folderNames('.')
    } catch (error) {
      if (error instanceof PathRefused) throw new ToolRefusal(error.message)
      throw error
    }
    const origin = defaultPlanOrigin(project)
    const defaultPlan = path.basename(projectPlanFile(project))
    const files = names.filter((name) => name.endsWith('.json') && !isSidecar(name))
    const plans = files.filter((name) => name === defaultPlan || readsAsPlan(project, name)).slice(0, PLANS_MAX)
    const planRows = plans.map((file) => {
      const stem = file.slice(0, -'.json'.length)
      const beside = SIDECARS.flatMap(([kind, suffix]) => (names.includes(`${stem}${suffix}`) ? [{ kind, file: `${stem}${suffix}` }] : []))
      return { file, default: file === defaultPlan, beside }
    })
    const other = names.flatMap((name) => (name === PROJECT_FILE ? [{ kind: 'project', file: name }] : name === 'firm-standards.json' ? [{ kind: 'firm-standards', file: name }] : []))
    const there = plans.includes(defaultPlan)
    const shown = project.shown(project.folder)
    const why = origin === 'project' ? `${shown} holds ${PROJECT_FILE}, a Grid project` : `${shown} holds no ${PROJECT_FILE}`
    const note = `${why}: with no plan named, Grid uses ${defaultPlan} there${there ? '' : ', which is not written yet (grid_write_rooms writes it)'}.`
    const lines = [
      note,
      plans.length === 0 ? 'No plan files in the folder.' : `Plans: ${planRows.map((p) => `${p.file}${p.beside.length > 0 ? ` (${p.beside.map((b) => b.file).join(', ')})` : ''}`).join('; ')}.`,
      ...(other.length > 0 ? [`Also: ${other.map((o) => o.file).join(', ')}.`] : []),
    ]
    return { text: lines.join('\n'), data: { folder: shown, project: origin === 'project', defaultPlan, defaultPlanThere: there, plans: planRows, other, note } }
  },
}
