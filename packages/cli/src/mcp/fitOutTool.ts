/**
 * WRT-75 (C16): `grid_start_fit_out` starts a fit-out on a base plan: a new plan that names the
 * base and has the base's rooms as its own, on the base's walls (`edit/fitOut.ts`). Rooms text
 * writes a fit-out too, with its `base` line (`grid_write_rooms`); the edits change one and keep
 * the base read-only.
 */
import { inspectPlan } from '@ongrid/rules'
import { loadBase, PlanRefused } from '../command/plan'
import { refusePlanTarget } from '../command/planFile'
import { nothingToLose } from '../command/write'
import { startFitOut } from '../edit/fitOut'
import { EditRefused } from '../edit/refused'
import { PATH_MAX, PathRefused } from '../fs/projectFiles'
import { listSchema, NUMBER, objectSchema, planFileOf, projectOf, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'

const START_FIT_OUT_OUTPUT = objectSchema({
  written: STRING,
  base: STRING,
  rooms: listSchema(STRING),
  changed: listSchema(STRING),
  toLookAt: NUMBER,
})

const START_FIT_OUT_TOOL: GridTool = {
  name: 'grid_start_fit_out',
  title: 'Start a fit-out on a base plan',
  hint: 'write-file',
  description:
    'Use this when the person fits out a shell that is drawn already, and the shell stays as it is: "fit out unit 4 as a vet clinic", "an office fit-out in the shell we drew", "lay out the interior of this unit". '
    + 'It writes a new plan that names the base plan and has the base\'s rooms, with their ids and names, as its own rooms on the base\'s walls. The base\'s walls, doors and windows are read in as existing, drawn, measured and checked with the fit-out, and never written into it: a change that would move, cut or take out one of them, or put a door in one, is refused. Then split, merge and add rooms with the edit tools, or read it back with grid_describe as=rooms and write it with grid_write_rooms, whose rooms text starts with the line base <plan file> and rests each room on the base wall its face lies on. '
    + 'The base plan must stand on its own (it names no base) and is never changed. A plan that already holds parts is refused unless replace is true. Do not use for a renovation of one plan (grid_start_works), or to copy a plan (write a new one). Lengths are metres, as the base plan holds them.',
  args: {
    base: { type: 'string', required: true, maxLength: PATH_MAX, description: 'The base plan, the shell the fit-out is in: a plan file inside the project folder.', examples: ['shell.json', 'base/unit-4.json'] },
    plan: { type: 'string', maxLength: PATH_MAX, description: 'The fit-out plan to write, inside the project folder, ending in .json. The project\'s own plan.json when left out.', examples: ['fit-out.json'] },
    name: { type: 'string', maxLength: 200, description: 'The fit-out plan\'s name.', examples: ['Vet clinic fit-out'] },
    replace: { type: 'boolean', description: 'true to write over a plan that already holds parts. Refused when left out.', examples: [true] },
  },
  outputSchema: START_FIT_OUT_OUTPUT,
  run(args, context) {
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    const named = args['base'] as string
    if (!file.toLowerCase().endsWith('.json')) throw new ToolRefusal('plan must name a .json file.')
    try {
      if (project.resolve(named, 'project') === project.resolve(file)) throw new ToolRefusal('plan is the base plan, which is never changed: name another file for the fit-out. Nothing was written.')
      // CMD-45: replace or not, never one of Grid's own files, nor a file there already that holds no plan.
      try {
        refusePlanTarget(project, file)
      } catch (error) {
        // Its words say nothing was written already.
        if (error instanceof PlanRefused) throw new ToolRefusal(error.message)
        throw error
      }
      if (args['replace'] !== true && project.exists(file)) {
        const { loaded } = readPlan(context, file, { whole: true, leftOutKept: true })
        if (!nothingToLose(loaded.base === undefined ? loaded.plan : { ...loaded.plan, walls: [], openings: [] })) throw new ToolRefusal(`${JSON.stringify(file)} holds a plan already: pass replace=true to write the fit-out over it, or name another file. Nothing was written.`)
      }
      const base = loadBase(project, named, file)
      const made = startFitOut(base.plan, named, args['name'] === undefined ? {} : { name: args['name'] as string })
      const written = project.relative(project.writeFile(file, `${JSON.stringify(made.file, null, 2)}\n`))
      const toLookAt = inspectPlan(made.file, { base: base.plan }).count
      return { text: [...made.said, `Wrote ${JSON.stringify(written)}.`].join('\n'), data: { written, base: named, rooms: [...made.rooms], changed: [...made.said], toLookAt } }
    } catch (error) {
      if (error instanceof PathRefused || error instanceof PlanRefused) throw new ToolRefusal(`${error.message} Nothing was written.`)
      if (error instanceof EditRefused) throw new ToolRefusal(`${error.message} Nothing was written.`)
      throw error
    }
  },
}

export const FIT_OUT_TOOLS: readonly GridTool[] = [START_FIT_OUT_TOOL]
