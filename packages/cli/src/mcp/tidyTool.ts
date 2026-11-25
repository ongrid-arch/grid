/**
 * `grid_tidy` (WRT-36): `grid tidy` on the tool server. With no fault ids it lists the faults
 * where walls meet, each with the fix Grid offers, and writes nothing; with ids, or `all`, it
 * makes those fixes on the plan file, or on `out`. The faults and the fixes are the command's
 * (`command/tidy.ts`), so the command and the tool make the same change; the file is written
 * through the project's files. A fix that would leave a room with no way in is made only when
 * its id is named.
 */
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { PATH_MAX, PathRefused, quoted } from '../fs/projectFiles'
import { tidyFile, tidyList, type TidyFault } from '../command/tidy'
import { asRefusal, BOOLEAN, listSchema, NULLABLE_STRING, objectSchema, PLAN_ARG, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'

export const TIDY_TOOL_NAME = 'grid_tidy'

/** The most fault ids one call takes, and the longest. */
const IDS_MAX = 200
const ID_MAX = 300

const FAULT = objectSchema({ id: STRING, kind: STRING, floor: STRING, walls: listSchema(STRING), rooms: listSchema(STRING), message: STRING, fix: NULLABLE_STRING, seals: listSchema(STRING) })

const line = (fault: TidyFault): string => `- ${quoted(fault.id)}: ${fault.message}${fault.fix === null ? ' (No fix is offered.)' : ''}`

export const tidyTool: GridTool = {
  name: TIDY_TOOL_NAME,
  title: 'Tidy where walls meet',
  hint: 'change-plan',
  description:
    'Use this when grid_check names a fault where walls meet (a wall short of its corner or past it, a gap, a wall drawn twice, a wall across a room that does not list it), or the person asks to tidy the walls: "close the gap at the corner", "tidy the plan". '
    + 'With no apply and all left out it lists the faults, each with its id and the fix Grid offers, and writes nothing. With apply (fault ids as listed) or all=true it makes those fixes and answers with what was made, what was skipped and why, and the faults left. '
    + 'A wall across a corner of a room at an angle, with the room\'s outside walls round it, is taken as the room\'s new face: the corner goes outside and a door on it stays on that face. A fix that would leave a room with no way in says so, and all leaves it: name its id to make it, once the person agrees. '
    + 'Do not use to move a wall (grid_move_room_side) or to split a room on purpose (grid_split_room). It replaces the plan file unless out is given. Lengths in its answers are metres.',
  args: {
    plan: PLAN_ARG,
    apply: {
      type: 'array',
      items: { maxLength: ID_MAX },
      minItems: 1,
      maxItems: IDS_MAX,
      description: 'The faults to fix, by their ids as this tool lists them. Leave apply and all out to list the faults.',
      examples: [['short:n:start'], ['crosses-room:cut:dining', 'gap:a:b']],
    },
    all: { type: 'boolean', description: 'true to make every fix offered that leaves no room without a way in. false when left out.', examples: [true] },
    out: {
      type: 'string',
      maxLength: PATH_MAX,
      description: 'With apply or all: write the tidied plan to this file, inside the project folder, ending in .json, and leave plan as it is. The plan itself is replaced when left out.',
      examples: ['tidied.json'],
    },
  },
  outputSchema: objectSchema({
    label: STRING,
    faults: listSchema(FAULT),
    applied: listSchema(FAULT),
    skipped: listSchema(objectSchema({ id: STRING, why: STRING })),
    left: listSchema(FAULT),
    written: NULLABLE_STRING,
  }),
  run(args, context) {
    const ids = args['apply'] as string[] | undefined
    const all = args['all'] === true
    const out = args['out'] as string | undefined
    if (ids !== undefined && all) throw new ToolRefusal('Pass apply or all=true, not both.')
    if (out !== undefined && ids === undefined && !all) throw new ToolRefusal('out goes with apply or all: without them, grid_tidy only lists the faults and writes nothing.')
    if (out !== undefined && !out.toLowerCase().endsWith('.json')) throw new ToolRefusal('out must name a .json file.')
    // Read whole: tidy writes the file back, and must not drop a part the reader would leave out.
    const { project, file, loaded } = readPlan(context, args['plan'], { whole: true })
    try {
      if (out !== undefined) project.resolve(out)
      if (ids === undefined && !all) {
        const list = tidyList(loaded)
        const fixable = list.faults.filter((f) => f.fix !== null)
        const text = [
          list.label,
          '',
          list.faults.length === 0 ? 'Wall faults: none found where walls meet.' : `Wall faults (${list.faults.length}):`,
          ...list.faults.map(line),
          ...(fixable.length > 0 ? ['', `Make a fix with apply ["${fixable[0]!.id}"], several by their ids, or every fix offered with all=true.`] : []),
        ]
        return { text: `${text.join('\n')}\n`, data: { label: list.label, faults: list.faults, applied: [], skipped: [], left: list.faults, written: null } }
      }
      const done = tidyFile(project, file, all ? 'all' : [...new Set(ids!.map((id) => id.trim()).filter((id) => id !== ''))])
      const written = done.text === null ? null : project.relative(project.writeFile(out ?? file, done.text))
      const text = [
        GENERAL_GUIDANCE_LABEL,
        '',
        `Applied (${done.applied.length}):`,
        ...done.applied.map((f) => `- ${quoted(f.id)}: ${f.fix ?? f.message}`),
        ...(done.skipped.length > 0 ? ['', `Skipped (${done.skipped.length}):`, ...done.skipped.map((s) => `- ${quoted(s.id)}: ${s.why}`)] : []),
        '',
        `Wall faults left: ${done.left.length === 0 ? 'none' : done.left.length}.`,
        written === null ? 'No fix was made, so nothing was written.' : `Wrote ${written}`,
      ]
      return { text: `${text.join('\n')}\n`, data: { label: GENERAL_GUIDANCE_LABEL, faults: [], applied: done.applied, skipped: done.skipped, left: done.left, written } }
    } catch (error) {
      if (error instanceof PathRefused) throw new ToolRefusal(error.message)
      throw asRefusal(error)
    }
  },
}
