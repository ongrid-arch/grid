/**
 * The tools that set phases (WRT-73, C16): `grid_start_works` marks the plan as it stands
 * existing, `grid_set_phase` marks parts by id or by room, and `grid_phase_from` writes one plan
 * with phases from two plans, the building before and after. The first two change the plan
 * through `writeChange`, as every edit does; the third reads two plans and writes a third.
 */
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { planInMetres } from '@ongrid/floorplan/types/units'
import { PlanRefused } from '../command/plan'
import { PHASES, phasedPlanFrom, setPhase, startWorks } from '../edit/phaseMarks'
import { EditRefused } from '../edit/refused'
import { PATH_MAX, PathRefused } from '../fs/projectFiles'
import { listSchema, NUMBER, objectSchema, PLAN_ARG, projectOf, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

const START_WORKS_TOOL: GridTool = {
  name: 'grid_start_works',
  title: 'Mark the plan as it stands as existing',
  hint: 'change-plan',
  description:
    'Use this when the person is about to renovate, extend or demolish and the plan drawn so far is the building as it stands: "this is the survey, now knock through to the garden", "mark everything existing". '
    + 'It marks every wall, door, window and room that states no phase as existing, so the plan is the building before the work and every change you make after it is the work: what it adds is new, and what it takes out of what stands stays in the plan, to be demolished. A part that already states a phase keeps it. '
    + 'A plan that is already marked is left as it is and the answer says so. Do not use to mark some parts demolished or new (grid_set_phase), to write a plan from a before and an after (grid_phase_from), or to fix a measurement of the survey: pass correction to that edit instead. It replaces the plan file unless out is given. Areas in the answer are in square metres.',
  args: {
    plan: PLAN_ARG,
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    // The plan as stated, every phase in it: a survey reads only the building after the work.
    const { loaded } = readPlan(context, args['plan'], { whole: true, leftOutKept: true })
    return writeChange(context, args, () => startWorks(loaded.plan))
  },
}

const SET_PHASE_TOOL: GridTool = {
  name: 'grid_set_phase',
  title: 'Mark parts existing, demolished or new',
  hint: 'change-plan',
  description:
    'Use this when the person says what stands, what goes and what is built: "the wall between the kitchen and the hall is coming out", "the old garage is demolished", "the conservatory is new work". '
    + 'phase is existing (stands before and after the work), demolished (stands before, gone after) or new (built by the work). parts names walls, doors, windows and rooms by id; rooms names rooms, and each takes the walls only it uses and the doors and windows in them. A wall another room still stands against is left as it is and the answer names it. A wall named in parts and marked demolished or new takes the doors and windows on it that state a phase of their own. '
    + 'The answer says what was marked. A mark that would leave a door standing in a wall that is gone, or a room round a wall that is not there, is refused with nothing written. Do not use to mark a whole survey existing (grid_start_works), to make a change (the edit tools make it work themselves once the plan has phases), or on stairs, columns and fixtures, which state no phase. It replaces the plan file unless out is given. Areas in the answer are in square metres.',
  args: {
    plan: PLAN_ARG,
    phase: { type: 'string', enum: PHASES, required: true, description: 'existing, demolished or new.', examples: ['demolished', 'new'] },
    parts: { type: 'array', description: 'Walls, doors, windows or rooms, by id, to mark.', examples: [['w-hall-kitchen'], ['door-garage', 'garage']], items: { id: true }, minItems: 1, maxItems: 500 },
    rooms: { type: 'array', description: 'Rooms, by id, to mark with the walls only they use and the doors and windows in those walls.', examples: [['garage']], items: { id: true }, minItems: 1, maxItems: 100 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    const { loaded } = readPlan(context, args['plan'], { whole: true, leftOutKept: true })
    return writeChange(context, args, () =>
      setPhase(loaded.plan, {
        phase: args['phase'] as (typeof PHASES)[number],
        ...(args['parts'] === undefined ? {} : { parts: args['parts'] as string[] }),
        ...(args['rooms'] === undefined ? {} : { rooms: args['rooms'] as string[] }),
      })
    )
  },
}

const PHASE_FROM_OUTPUT = objectSchema({
  written: STRING,
  changed: listSchema(STRING),
  counts: objectSchema({
    existing: objectSchema({ walls: NUMBER, openings: NUMBER, rooms: NUMBER }),
    demolished: objectSchema({ walls: NUMBER, openings: NUMBER, rooms: NUMBER }),
    new: objectSchema({ walls: NUMBER, openings: NUMBER, rooms: NUMBER }),
  }),
  kept: { type: 'object' },
  drawingProblems: NUMBER,
})

const PHASE_FROM_TOOL: GridTool = {
  name: 'grid_phase_from',
  title: 'Write one plan with phases from a before and an after',
  hint: 'write-file',
  description:
    'Use this when there are two plans of one building, as it stands and as it will be, and the person wants the work between them: "here is the survey and here is the proposal, show what is demolished and what is new". '
    + 'It writes one plan, the second\'s, with a phase on every wall, door, window and room, paired by id: only in the first is demolished, only in the second is new, the same in both is existing. A part in both that changed (a wall moved, a door widened), or that stands on a wall that changed, is new with its id, and its old self is kept beside it as "<id>-before", demolished. '
    + 'Floors, fixtures, stairs and the plan\'s own fields are the second plan\'s. Both plans must state no phase; the plans are not changed. The answer counts each phase and names what was kept. '
    + 'Do not use on one plan (grid_start_works, then the edits), or to compare two plans (grid_compare). Plans in other units are read in metres.',
  args: {
    before: { type: 'string', required: true, maxLength: PATH_MAX, description: 'The building as it stands: a plan file inside the project folder.', examples: ['survey.json'] },
    after: { type: 'string', required: true, maxLength: PATH_MAX, description: 'The building after the work: a plan file inside the project folder.', examples: ['proposal.json'] },
    out: { ...OUT_ARG, description: 'The plan with phases is written to this file, inside the project folder, ending in .json. Neither plan is changed.', examples: ['works.json'], required: true },
  },
  outputSchema: PHASE_FROM_OUTPUT,
  run(args, context) {
    const project = projectOf(context)
    const out = args['out'] as string
    if (!out.toLowerCase().endsWith('.json')) throw new ToolRefusal('out must name a .json file.')
    const read = (arg: 'before' | 'after'): Record<string, unknown> => {
      const file = args[arg] as string
      // Read as every plan is first, so its limits and its refusals are the same as anywhere else.
      readPlan(context, file, { whole: true, leftOutKept: true })
      try {
        if (project.resolve(out) === project.resolve(file)) throw new ToolRefusal(`out is the ${arg} plan, which is not changed: name another file. Nothing was written.`)
        const raw = JSON.parse(project.readText(file).text) as unknown
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ToolRefusal(`${arg} ${JSON.stringify(file)} is not a Grid plan: it must be a JSON object with walls, rooms and openings.`)
        return planInMetres(raw as Record<string, unknown>).raw
      } catch (error) {
        if (error instanceof PathRefused || error instanceof PlanRefused) throw new ToolRefusal(error.message)
        if (error instanceof SyntaxError) throw new ToolRefusal(`${arg} ${JSON.stringify(file)} is not JSON.`)
        throw error
      }
    }
    const before = read('before')
    const after = read('after')
    let made
    try {
      made = phasedPlanFrom(before, after)
    } catch (error) {
      if (error instanceof EditRefused) throw new ToolRefusal(`${error.message} Nothing was written.`)
      throw error
    }
    const parsed = FloorPlanSchema.safeParse(made.plan)
    if (!parsed.success) throw new ToolRefusal(`The two plans do not make one plan: ${parsed.error.issues[0]?.message ?? 'invalid'}. Nothing was written.`)
    const problems = validatePlan(parsed.data).issues.filter((issue) => issue.severity === 'error')
    if (problems.length > 0) {
      throw new ToolRefusal(`The two plans make a plan with ${problems.length === 1 ? 'a problem' : `${problems.length} problems`} in the drawing: ${JSON.stringify(problems[0]!.id)}: ${problems[0]!.message} Nothing was written.`)
    }
    let written: string
    try {
      written = project.relative(project.writeFile(out, `${JSON.stringify(made.plan, null, 2)}\n`))
    } catch (error) {
      if (error instanceof PathRefused) throw new ToolRefusal(error.message)
      throw error
    }
    return { text: [...made.said, `Wrote ${JSON.stringify(written)}.`].join('\n'), data: { written, changed: made.said, counts: made.counts, kept: made.kept, drawingProblems: problems.length } }
  },
}

export const PHASE_TOOLS: readonly GridTool[] = [SET_PHASE_TOOL, START_WORKS_TOOL, PHASE_FROM_TOOL]
