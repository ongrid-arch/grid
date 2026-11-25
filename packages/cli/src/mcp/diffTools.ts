/**
 * WRT-8: `grid_diff` compares the plan with an earlier version of itself by what stands where,
 * and `grid_mark_start` keeps the version to compare with, so it works without git. Both read
 * and write through `fs/projectFiles.ts`; the marker is kept beside the plan
 * (`versions/markers.ts`), never in it.
 */
import { GitUnread } from '../versions/git'
import { DEFAULT_MARKER, MARKER_NAME, MARKERS_MAX, MarkerRefused, removeMarker, setMarker } from '../versions/markers'
import { DIFF_SHOWS, diffData, diffSince, diffText, type DiffShow } from '../versions/diff'
import { SEEN_NEW_OUTPUT } from '../edit/seen'
import { asRefusal, BOOLEAN, FLOOR_ARG, floorArg, listSchema, NULLABLE_STRING, objectSchema, PLAN_ARG, projectOf, planFileOf, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'

const MARKER_ARG = {
  type: 'string' as const,
  maxLength: 40,
  description: `A marker's name: 1 to 40 letters, digits, dots, dashes or underscores. ${DEFAULT_MARKER} when left out.`,
  examples: [DEFAULT_MARKER, 'before-kitchen'],
}

const refused = (error: unknown): unknown => (error instanceof MarkerRefused || error instanceof GitUnread ? new ToolRefusal(error.message) : asRefusal(error))

export const diffTool: GridTool = {
  name: 'grid_diff',
  title: 'What changed since the start',
  hint: 'read',
  description:
    'Use this when you have changed the plan and need to check what the change did, after every save: "what did that change", "did anything else move", "is it the same building", "what changed since we started". '
    + 'It compares the plan with an earlier version of itself by what stands where, not by ids: the start marker set with grid_mark_start, or the version last committed in the project\'s git folder (since: git). For a plan with existing, demolished and new parts, since: phase compares it before its work with after it: what is removed is to be demolished, what is added is new. It reads both itself, so pass no plans. '
    + 'It answers issues first (a door that now joins other rooms, a wall that now meets an opening, notes of grid_check that came and went), then a short verdict room by room with how many ids were only renamed, then the changes one line each. A plan that is the earlier one mirrored or turned a quarter or half round is said to be so first, with whether every room kept its size, and compared from there. Pass rooms, the rooms you meant to edit, to have every change outside them named. With picture true (the default) it returns one picture: removed in red, added in green, what changed in amber (a wall or opening at its new place with its old place outlined, a room with its old and new area), the rest pale. '
    + 'Do not use to compare options or separate plans side by side (grid_compare), or to check the plan itself (grid_check). Units are metres.',
  args: {
    plan: PLAN_ARG,
    since: { type: 'string', maxLength: 40, description: `What to compare with: a marker's name, git for the version last committed, or phase for a plan with existing, demolished and new parts as it stands before its work (removed is to be demolished, added is new). The marker ${DEFAULT_MARKER} when the plan has one, else git, when left out.`, examples: [DEFAULT_MARKER, 'git', 'phase'] },
    rooms: {
      type: 'array',
      description: 'The rooms you meant to edit, by id, for the scope check: every change outside them is named. Nothing is checked when left out.',
      examples: [['kitchen'], ['bed2', 'bath']],
      items: { id: true },
      minItems: 1,
      maxItems: 50,
    },
    show: { type: 'string', enum: DIFF_SHOWS, description: 'What to answer: all (the default), summary (issues, verdict and rooms), changes (and the change lines) or issues alone.', examples: ['summary', 'issues'] },
    picture: { type: 'boolean', description: 'false to leave the picture out. true when left out; nothing is drawn when nothing changed.', examples: [true, false] },
    floor: { ...FLOOR_ARG, description: 'For the picture: the floor to draw. The first floor with a change, else the lowest, when left out.' },
  },
  outputSchema: objectSchema({
    since: objectSchema({ kind: STRING, name: NULLABLE_STRING, at: NULLABLE_STRING, commit: NULLABLE_STRING }),
    verdict: STRING,
    sameBuilding: BOOLEAN,
    turn: { type: ['object', 'null'] },
    roomsFirst: BOOLEAN,
    shift: { type: 'array' },
    renamed: { type: 'object' },
    issues: listSchema(objectSchema({ code: STRING, message: STRING, entities: { type: 'array' } })),
    rooms: { type: 'array' },
    changes: { type: 'array' },
    stayed: { type: 'array' },
    movedWith: { type: 'array' },
    massing: objectSchema({ lines: listSchema(STRING), figures: { type: 'object' }, sideBySide: NULLABLE_STRING }),
    scope: objectSchema({ checked: BOOLEAN, rooms: listSchema(STRING), outside: listSchema(STRING) }),
    picture: { type: ['object', 'null'] },
    // MSG-29: each note set aside as seen that is new again since the earlier version.
    seenNew: SEEN_NEW_OUTPUT,
  }),
  async run(args, context) {
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    const show = (args['show'] as DiffShow | undefined) ?? 'all'
    let run
    try {
      run = diffSince(project, file, args['since'] as string | undefined, args['rooms'] as string[] | undefined)
    } catch (error) {
      throw refused(error)
    }
    // A floor that is not there is refused, picture or not (MS-19).
    const asked = floorArg(run.later.plan, args['floor'])
    const text = [diffText(run, show)]
    const data = diffData(run, show)
    const c = run.comparison
    const wanted = args['picture'] !== false
    let image
    let picture = null
    // A plan only mirrored or turned has nothing to mark (WRT-4).
    if (wanted && c.changes.length > 0) {
      const changedFloor = c.diff.changes[0]?.floor
      const floor = asked ?? changedFloor
      const { comparisonView } = await import('../draw/views')
      const view = await comparisonView(c, run.later.plan, floor)
      image = { data: view.png, mimeType: 'image/png' as const }
      picture = { floor: view.floor, width: view.width, height: view.height, pxPerMetre: view.pxPerMetre }
      text.push(`The picture: floor ${JSON.stringify(view.floor)}, removed in red, added in green, what changed in amber (a wall or opening at its new place with its old place outlined, a room with its old and new area), the rest pale; ${view.width} × ${view.height} px, 1 m = ${view.pxPerMetre.toFixed(1)} px. Look at it before you describe it.`)
    }
    return { text: text.join('\n'), data: { ...data, picture }, ...(image ? { image } : {}) }
  },
}

export const markStartTool: GridTool = {
  name: 'grid_mark_start',
  title: 'Mark where the work starts',
  hint: 'write-file',
  description:
    'Use this when you are about to change the plan, to keep the version grid_diff compares with afterwards: "remember where we started", "mark this version", or before any edit. '
    + `It copies the plan as it is now under a name, ${DEFAULT_MARKER} unless you name another, into the markers file beside the plan (plan.markers.json beside plan.json), never into the plan. Setting a name again replaces it; a plan keeps at most ${MARKERS_MAX} markers. remove=true takes one off. `
    + 'Do not use to save or undo the plan, or where the person keeps the plan in git and wants the last commit (grid_diff since: git needs no marker).',
  args: {
    plan: PLAN_ARG,
    name: MARKER_ARG,
    remove: { type: 'boolean', description: 'true to take the marker off. false when left out.', examples: [true] },
  },
  outputSchema: objectSchema({
    written: STRING,
    name: STRING,
    at: NULLABLE_STRING,
    replaced: BOOLEAN,
    removed: BOOLEAN,
    markers: listSchema(STRING),
  }),
  run(args, context) {
    const name = (args['name'] as string | undefined) ?? DEFAULT_MARKER
    if (!MARKER_NAME.test(name)) throw new ToolRefusal('name is 1 to 40 letters, digits, dots, dashes or underscores, starting with a letter or digit, such as start.')
    try {
      if (args['remove'] === true) {
        const project = projectOf(context)
        const file = planFileOf(project, args['plan'])
        const done = removeMarker(project, file, name)
        return { text: `Took marker ${JSON.stringify(name)} off. Markers kept in ${done.file}: ${done.names.join(', ') || 'none'}.`, data: { written: done.file, name, at: null, replaced: false, removed: true, markers: [...done.names] } }
      }
      const { project, file, loaded } = readPlan(context, args['plan'])
      const done = setMarker(project, file, name, loaded.text ?? JSON.stringify(loaded.plan))
      return {
        text: `${done.replaced ? 'Set marker' : 'Marked'} ${JSON.stringify(name)}: the plan as it is now, kept in ${done.file}${done.replaced ? ' in place of the one before' : ''}. Markers: ${done.names.join(', ')} (at most ${MARKERS_MAX}). After the edit, grid_diff since: ${name} says what changed.`,
        data: { written: done.file, name, at: done.marker.at, replaced: done.replaced, removed: false, markers: [...done.names] },
      }
    } catch (error) {
      throw refused(error)
    }
  },
}
