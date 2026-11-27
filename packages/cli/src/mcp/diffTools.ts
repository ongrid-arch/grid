/**
 * WRT-8: `grid_diff` compares the plan with an earlier version of itself by what stands where,
 * and `grid_mark_start` keeps the version to compare with, so it works without git. Both read
 * and write through `fs/projectFiles.ts`; the marker is kept beside the plan
 * (`versions/markers.ts`), never in it. CMD-44: `since` and `to` name any version Grid keeps
 * (`versions/named.ts`), `show` gives the fields that changed and the change log, and a marker
 * says who set it and why.
 */
import { say } from '@ongrid/floorplan/messages'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { historySay } from '../versions/words'
import { GitUnread } from '../versions/git'
import { DEFAULT_MARKER, MARKER_BY_MAX, MARKER_NAME, MARKER_NOTE_MAX, MARKERS_MAX, MarkerRefused, removeMarker, setMarker } from '../versions/markers'
import { DIFF_SHOWS, diffData, diffSince, diffText, type DiffShow } from '../versions/diff'
import { SEEN_NEW_OUTPUT } from '../edit/seen'
import { toolLanguage } from './answerLanguage'
import { CHANGE_RATES_ARG, ESTIMATE_CHANGE_SCHEMA, estimateChangeAnswer, ratesForTool } from './estimateChangeAnswer'
import { surveyPlan } from '../quantities/survey'
import { displayFor } from '../quantities/units'
import { asRefusal, BOOLEAN, FLOOR_ARG, floorArg, listSchema, NULLABLE_STRING, NUMBER, objectSchema, PLAN_ARG, projectOf, planFileOf, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'

const MARKER_ARG = {
  type: 'string' as const,
  maxLength: 40,
  description: `A marker's name: 1 to 40 letters, digits, dots, dashes or underscores. ${DEFAULT_MARKER} when left out.`,
  examples: [DEFAULT_MARKER, 'before-kitchen'],
}

const refused = (error: unknown): unknown => (error instanceof MarkerRefused || error instanceof GitUnread ? new ToolRefusal(error.message) : asRefusal(error))

/** Diff has already chosen which parts stand before the work. Keep them in the survey. */
function surveyBeforeWork(plan: FloorPlan) {
  const existing = <T extends object>(part: T) => ({ ...part, phase: 'existing' as const })
  return surveyPlan({ ...plan, walls: plan.walls.map(existing), openings: plan.openings.map(existing), rooms: plan.rooms.map(existing) })
}

export const diffTool: GridTool = {
  name: 'grid_diff',
  title: 'What changed since the start',
  hint: 'read',
  description:
    'Use this when you have changed the plan and need to check what the change did, after every save: "what did that change", "did anything else move", "is it the same building", "what changed since we started". '
    + 'It compares the plan with an earlier version of itself by what stands where, not by ids: the start marker set with grid_mark_start, or the version last committed in the project\'s git folder (since: git). For a plan with existing, demolished and new parts, since: phase compares it before its work with after it: what is removed is to be demolished, what is added is new. It reads both itself, so pass no plans. '
    + 'Every change Grid makes keeps the plan it replaced and a line in the plan\'s change log, so since also takes last (the plan before the last change), a revision from planRevision, a date or date and time, git~1 or a commit; to compares two earlier versions with each other. show: facts lists every field that changed, facts of the person\'s own and room numbers included; show: history lists the log\'s entries since then: who changed what, when, with which tool. '
    + 'It answers issues first (a door that now joins other rooms, a wall that now meets an opening, notes of grid_check that came and went), then a short verdict room by room with how many ids were only renamed, then the changes one line each. A plan that is the earlier one mirrored or turned a quarter or half round is said to be so first, with whether every room kept its size, and compared from there. Pass rooms, the rooms you meant to edit, to have every change outside them named. With picture true (the default) it returns one picture: removed in red, added in green, what changed in amber (a wall or opening at its new place with its old place outlined, a room with its old and new area), the rest pale. '
    + say('en', 'tool.estimateChange.diffTool') + ' '
    + 'Do not use to compare options or separate plans side by side (grid_compare), or to check the plan itself (grid_check). Units are metres.',
  args: {
    plan: PLAN_ARG,
    rates: CHANGE_RATES_ARG,
    since: { type: 'string', maxLength: 40, description: `What to compare with: a marker's name, git for the version last committed (git~1 the one before, or a commit by 7 to 40 hex digits), last for the plan before the last change, a revision of 12 hex digits as planRevision gives it, a date (2026-11-26, its start) or date and time (2026-11-26T10:00, UTC unless a zone is given) for the plan as it stood then, or phase for a plan with existing, demolished and new parts as it stands before its work (removed is to be demolished, added is new). The marker ${DEFAULT_MARKER} when the plan has one, else git, when left out.`, examples: [DEFAULT_MARKER, 'git', 'phase', 'last', '2026-11-26'] },
    to: { type: 'string', maxLength: 40, description: 'The later version, named as since is (not phase): to compare two earlier versions with each other. The plan as it is now when left out.', examples: ['after-review', '3f9a0c12be47'] },
    rooms: {
      type: 'array',
      description: 'The rooms you meant to edit, by id, for the scope check: every change outside them is named. Nothing is checked when left out.',
      examples: [['kitchen'], ['bed2', 'bath']],
      items: { id: true },
      minItems: 1,
      maxItems: 50,
    },
    show: { type: 'string', enum: DIFF_SHOWS, description: 'What to answer: all (the default), summary (issues, verdict and rooms), changes (and the change lines), issues alone, facts (every field that changed, part by part: facts, numbers and the rest) or history (the change log\'s entries since then).', examples: ['summary', 'facts', 'history'] },
    picture: { type: 'boolean', description: 'false to leave the picture out. true when left out; nothing is drawn when nothing changed.', examples: [true, false] },
    floor: { ...FLOOR_ARG, description: 'The floor to show: only the changes, rooms and openings on it are answered, and the picture draws it. The issues and the verdict stay whole. Every floor, and for the picture the first floor with a change, else the lowest, when left out.' },
  },
  outputSchema: objectSchema({
    since: objectSchema({ kind: STRING, name: NULLABLE_STRING, at: NULLABLE_STRING, commit: NULLABLE_STRING, revision: NULLABLE_STRING, by: NULLABLE_STRING, note: NULLABLE_STRING }),
    // CMD-44: the later version, null for the plan now; the fields that changed; the log's entries.
    to: { type: ['object', 'null'] },
    fields: listSchema(objectSchema({ path: STRING, kind: STRING, text: STRING })),
    fieldsTotal: NUMBER,
    history: { type: 'array' },
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
    // WRT-86: the types added, removed or changed and the parts that take them, the rooms' finishes, the curves before and after.
    types: listSchema(objectSchema({ list: STRING, type: STRING, name: STRING, status: STRING, fields: { type: 'array' }, parts: { type: 'array' }, text: STRING })),
    finishes: listSchema(objectSchema({ room: STRING, name: STRING, changes: { type: 'array' } })),
    curves: listSchema(objectSchema({ wall: STRING, before: { type: ['object', 'null'] }, after: { type: ['object', 'null'] }, text: STRING })),
    scope: objectSchema({ checked: BOOLEAN, rooms: listSchema(STRING), outside: listSchema(STRING) }),
    floor: NULLABLE_STRING,
    otherFloors: NUMBER,
    picture: { type: ['object', 'null'] },
    // MSG-29: each note set aside as seen that is new again since the earlier version.
    seenNew: SEEN_NEW_OUTPUT,
    estimateChange: ESTIMATE_CHANGE_SCHEMA,
  }, ['since', 'to', 'fields', 'fieldsTotal', 'history', 'verdict', 'sameBuilding', 'turn', 'roomsFirst', 'shift', 'renamed', 'issues', 'rooms', 'changes', 'stayed', 'movedWith', 'massing', 'scope', 'floor', 'otherFloors', 'picture', 'seenNew']),
  async run(args, context) {
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    const rates = args['rates'] === undefined ? null : ratesForTool(project, file, args['rates'])
    const show = (args['show'] as DiffShow | undefined) ?? 'all'
    let run
    try {
      run = diffSince(project, file, args['since'] as string | undefined, args['rooms'] as string[] | undefined, args['to'] as string | undefined)
    } catch (error) {
      throw refused(error)
    }
    // A floor that is not there is refused, picture or not (MS-19).
    const asked = floorArg(run.later.plan, args['floor'])
    // CMD-32: the floor narrows the answer as well as the picture.
    const text = [diffText(run, show, asked)]
    const data = diffData(run, show, asked)
    if (rates !== null) {
      const units = displayFor(undefined, undefined, run.later.plan, toolLanguage(context, run.later.plan))
      const version = (one: typeof run.since): string => {
        if (one.kind === 'marker') return one.name
        if (one.kind === 'git') return one.ref ?? one.commit
        if (one.kind === 'revision') return one.asked
        return one.kind === 'now' ? file : 'phase'
      }
      const earlier = run.since.kind === 'phase' ? surveyBeforeWork(run.earlier.plan) : surveyPlan(run.earlier.plan)
      const priced = estimateChangeAnswer(earlier, surveyPlan(run.later.plan), version(run.since), run.to === null ? file : version(run.to), rates, units, asked)
      text.push(priced.text)
      data['estimateChange'] = priced.data
    }
    const c = run.comparison
    const wanted = args['picture'] !== false
    let image
    let picture = null
    // A plan only mirrored or turned has nothing to mark (WRT-4).
    if (wanted && c.changes.length > 0) {
      const changedFloor = c.diff.changes[0]?.floor
      const floor = asked ?? changedFloor
      const { comparisonView } = await import('../draw/views')
      // MSG-34: the picture's key, its labels and its caption in the call's language, else the plan's.
      const view = await comparisonView(c, run.later.plan, floor, toolLanguage(context, run.later.plan))
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
    + `It copies the plan as it is now under a name, ${DEFAULT_MARKER} unless you name another, into the markers file beside the plan (plan.markers.json beside plan.json), never into the plan, with who set it and a note when given. Setting a name again replaces it; a plan keeps the latest ${MARKERS_MAX} markers, and a new one past that rolls the oldest off. remove=true takes one off. grid_restore puts a marker's version back. `
    + 'Do not use to save or undo the plan (every change already keeps the plan it replaced: grid_undo, grid_restore since=last), or where the person keeps the plan in git and wants the last commit (grid_diff since: git needs no marker).',
  args: {
    plan: PLAN_ARG,
    name: MARKER_ARG,
    remove: { type: 'boolean', description: 'true to take the marker off. false when left out.', examples: [true] },
    who: { type: 'string', maxLength: MARKER_BY_MAX, description: 'Who sets the marker, as you name yourself (an agent\'s role or a person\'s initials, never a full name). Left out, it names no one.', examples: ['reviewer-1'] },
    note: { type: 'string', maxLength: MARKER_NOTE_MAX, description: 'Why the marker is set, in a few words, kept with it and said by grid_diff.', examples: ['before the second review round'] },
  },
  outputSchema: objectSchema({
    written: STRING,
    name: STRING,
    at: NULLABLE_STRING,
    replaced: BOOLEAN,
    removed: BOOLEAN,
    markers: listSchema(STRING),
    // CMD-44: the oldest marker, rolled off to make room; null when none was.
    rolled: NULLABLE_STRING,
  }),
  run(args, context) {
    const name = (args['name'] as string | undefined) ?? DEFAULT_MARKER
    if (!MARKER_NAME.test(name)) throw new ToolRefusal('name is 1 to 40 letters, digits, dots, dashes or underscores, starting with a letter or digit, such as start.')
    try {
      if (args['remove'] === true) {
        const project = projectOf(context)
        const file = planFileOf(project, args['plan'])
        const done = removeMarker(project, file, name)
        return { text: `Took marker ${JSON.stringify(name)} off. Markers kept in ${done.file}: ${done.names.join(', ') || 'none'}.`, data: { written: done.file, name, at: null, replaced: false, removed: true, markers: [...done.names], rolled: null } }
      }
      const { project, file, loaded } = readPlan(context, args['plan'])
      const done = setMarker(project, file, name, loaded.text ?? JSON.stringify(loaded.plan), undefined, { by: args['who'] as string | undefined, note: args['note'] as string | undefined })
      const rolled = done.rolled === null ? [] : [historySay('tool.history.markerRolled', { name: { name: done.rolled.name }, max: MARKERS_MAX })]
      return {
        text: [`${done.replaced ? 'Set marker' : 'Marked'} ${JSON.stringify(name)}: the plan as it is now, kept in ${done.file}${done.replaced ? ' in place of the one before' : ''}. Markers: ${done.names.join(', ')} (at most ${MARKERS_MAX}). After the edit, grid_diff since: ${name} says what changed.`, ...rolled].join('\n'),
        data: { written: done.file, name, at: done.marker.at, replaced: done.replaced, removed: false, markers: [...done.names], rolled: done.rolled?.name ?? null },
      }
    } catch (error) {
      throw refused(error)
    }
  },
}
