/**
 * `grid init [<folder>]`: starts a project folder, so every other command knows where things are.
 *
 *   <folder>/grid.json    marks the folder as a Grid project, and holds the project's id
 *   <folder>/plan.json    the plan: a starter two-room flat
 *   <folder>/exports/     where grid export writes
 *   <folder>/.gitignore   keeps exports/ out of version history
 *
 * A folder is a Grid project when it holds `grid.json`. Inside one, `check`, `draw` and
 * `export` read `plan.json` when no plan file is named, and `export` writes into `exports/`.
 *
 * The rules store (`@ongrid/rules/store`) keeps a project's build location and rules sheet on
 * this computer, outside the project folder, so a copy of the project never carries them. It
 * names them by the project's id, which is why `grid.json` holds one. Nothing of the store is
 * written into the folder.
 *
 * `init` never replaces a file. It refuses a folder that already holds `grid.json` or
 * `plan.json`, and writes into any other folder, empty or not, adding only its own files.
 */
import { randomUUID } from 'crypto'
import path from 'path'
import { ensureExportsIgnored, EXPORTS_DIR } from '../export/projectExports'
import { PathRefused, quoted, startProjectFolder, type Project } from '../fs/projectFiles'
import starterPlan from './starter-plan.json'
import { UsageError, type OptionSpecs } from './options'
import { PlanRefused } from './plan'

/** The file that makes a folder a Grid project. */
export const PROJECT_FILE = 'grid.json'
/** The plan of a Grid project, beside `grid.json`. */
export const PROJECT_PLAN = 'plan.json'

export const INIT_OPTIONS: OptionSpecs = {}

/** Why `grid init` did not start the project. The message is one line. */
export class InitRefused extends Error {
  override readonly name = 'InitRefused'
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The folder `init` was given: none (the folder it runs in) or one. */
export function initFolder(positionals: readonly string[]): string | undefined {
  if (positionals.length > 1) {
    throw new UsageError(`init takes one folder, but was given ${positionals.length}: ${positionals.join(', ')}`)
  }
  const folder = positionals[0]
  if (folder === '-') throw new UsageError('init takes a folder name, not standard input: name the folder.')
  return folder
}

/** What `grid init` wrote, each with one line on what it is for. */
export interface InitDone {
  readonly project: Project
  readonly madeFolder: boolean
  readonly written: ReadonlyArray<{ readonly real: string; readonly what: string }>
}

function writeFailed(project: Project, file: string, error: unknown): never {
  if (error instanceof PathRefused) throw error
  const code = (error as NodeJS.ErrnoException).code
  const shown = project.shown(file)
  if (code === 'EEXIST') throw new InitRefused(`${shown} appeared while grid init was running, and Grid won't replace it. Run grid init again.`)
  if (code === 'EACCES' || code === 'EPERM') throw new InitRefused(`Can't write ${shown}: permission denied.`)
  throw new InitRefused(`Can't write ${shown}: ${oneLine((error as Error).message)}`)
}

/**
 * The starter plan as it is written: two spaces, a line break at the end. `projectId`, when
 * given, is stored in the plan after its units (QAR-5): the IFC builds its identities from it.
 */
export function starterPlanText(projectId?: string): string {
  const { version, units, ...parts } = starterPlan
  const plan = projectId === undefined ? starterPlan : { version, units, projectId, ...parts }
  return `${JSON.stringify(plan, null, 2)}\n`
}

export function initProject(folder: string | undefined, cwd: string): InitDone {
  const { project, made } = startProjectFolder(folder, cwd)
  const at = (name: string): string => path.join(project.folder, name)
  const where = quoted(project.shown(project.folder))

  // Every refusal comes before anything is written.
  if (project.exists(at(PROJECT_FILE))) {
    throw new InitRefused(`${where} is already a Grid project: it holds ${PROJECT_FILE}. grid init changed nothing; run grid check there.`)
  }
  if (project.exists(at(PROJECT_PLAN))) {
    throw new InitRefused(`${where} already holds a ${PROJECT_PLAN}, and grid init never replaces a file. It changed nothing; start the project in another folder.`)
  }
  const exportsThere = project.exists(at(EXPORTS_DIR))
  if (exportsThere && project.isLinked(at(EXPORTS_DIR))) {
    throw new InitRefused(`${where} holds an ${EXPORTS_DIR} that is a link: exports go into a plain folder. grid init changed nothing.`)
  }

  const written: Array<{ real: string; what: string }> = []
  // The exports folder first: a file in its place is the last thing that can refuse the folder.
  try {
    const real = project.makeFolder(at(EXPORTS_DIR))
    if (!exportsThere) written.push({ real, what: 'where grid export writes' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      throw new InitRefused(`${where} holds a file named ${EXPORTS_DIR}, where the exports folder goes. grid init changed nothing; move the file, then run it again.`)
    }
    writeFailed(project, at(EXPORTS_DIR), error)
  }

  const create = (name: string, text: string, what: string): void => {
    try {
      written.push({ real: project.createFile(at(name), text), what })
    } catch (error) {
      writeFailed(project, at(name), error)
    }
  }
  // One id for the project, in the plan (for its exports) and in grid.json (for the rules store).
  const projectId = randomUUID()
  create(PROJECT_PLAN, starterPlanText(projectId), 'the plan: a starter two-room flat to change')
  try {
    if (ensureExportsIgnored(project, project.folder)) {
      written.push({ real: at('.gitignore'), what: `keeps ${EXPORTS_DIR}/ out of version history` })
    }
  } catch (error) {
    writeFailed(project, at('.gitignore'), error)
  }
  // Last, so a folder is a project only once everything else is there.
  const marker = { version: '1', projectId }
  create(PROJECT_FILE, `${JSON.stringify(marker, null, 2)}\n`, 'marks the folder as a Grid project, with the id the rules store names it by')
  return { project, madeFolder: made, written }
}

/** A folder name as it can be typed after `cd`. */
function typed(folder: string): string {
  return /^[\w./-]+$/.test(folder) ? folder : JSON.stringify(folder)
}

/** What `grid init` prints. `given` is the folder as it was named, if it was. */
export function initText(done: InitDone, given: string | undefined): string {
  const { project } = done
  const names = done.written.map(({ real }) => {
    const name = project.relative(real)
    return name === EXPORTS_DIR ? `${name}/` : name
  })
  const width = Math.max(...names.map((name) => name.length))
  return [
    `${done.madeFolder ? 'Made' : 'Started'} a Grid project in ${project.shown(project.folder)}:`,
    ...done.written.map(({ what }, i) => `  ${names[i]!.padEnd(width + 2)}${what}`),
    '',
    'The rules store keeps the build location and rules sheet on this computer, outside the',
    `project folder, under the id in ${PROJECT_FILE}.`,
    '',
    given === undefined || /^\.[\\/]*$/.test(given) ? 'Next: grid check' : `Next: cd ${typed(given)} && grid check`,
    '',
  ].join('\n')
}

/**
 * The plan file of the project folder, for a command given none (CMD-18): `plan.json` in the
 * folder, whether or not it holds `grid.json`. `defaultPlanOrigin` says which it was.
 */
export function projectPlanFile(project: Project): string {
  defaultPlanOrigin(project)
  return path.join(project.folder, PROJECT_PLAN)
}

/** `project` when the folder holds `grid.json`, `folder` when the plan is the folder's by default. */
export function defaultPlanOrigin(project: Project): 'project' | 'folder' {
  const marker = path.join(project.folder, PROJECT_FILE)
  try {
    return project.readTextIfThere(marker) === null ? 'folder' : 'project'
  } catch (error) {
    if (error instanceof PathRefused) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EISDIR') return 'folder'
    throw new PlanRefused(`${PROJECT_FILE} can't be read: ${oneLine((error as Error).message)}`)
  }
}

/**
 * The refusal for a read with no plan named when the default plan is not there: it says which
 * folder and file Grid looked in and why, and what to do.
 */
export function missingDefaultPlan(project: Project, file: string): string {
  const shown = quoted(project.shown(project.folder))
  const why = defaultPlanOrigin(project) === 'project'
    ? `the project's plan is ${PROJECT_PLAN}`
    : `it holds no ${PROJECT_FILE}, so the plan is ${PROJECT_PLAN} in it`
  return `No plan was named, and ${shown} holds no ${path.basename(file)} (${why}). Name a plan file, write one here (grid write, grid_write_rooms), or start a project with grid init.`
}
