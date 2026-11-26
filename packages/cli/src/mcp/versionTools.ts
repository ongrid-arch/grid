/**
 * CMD-44: `grid_undo` takes the last change back and `grid_restore` puts back any earlier
 * version, from what Grid keeps beside the plan: the checkpoint every change leaves, a marker or
 * a commit. Both write the plan file through `versions/restore.ts`, which records them in the
 * change log like any other change, so each can itself be taken back.
 */
import { historySay } from '../versions/words'
import path from 'path'
import { GitUnread } from '../versions/git'
import { MarkerRefused } from '../versions/markers'
import { BY_MAX, type HistoryEntry } from '../versions/history'
import { RESTORE_TOOL_NAME, restoreTo, UNDO_TOOL_NAME, undoLast, type PutBack } from '../versions/restore'
import { sinceWords, timeWords } from '../versions/diff'
import type { NamedVersion } from '../versions/named'
import { asRefusal, BOOLEAN, listSchema, NULLABLE_STRING, NUMBER, objectSchema, PLAN_ARG, planFileOf, projectOf, STRING, ToolRefusal, type ArgSpec, type GridTool } from './toolkit'
import { VIA_SERVER } from './revisions'

const WHO: ArgSpec = {
  type: 'string',
  maxLength: BY_MAX,
  description: 'Who is asking, as you name yourself (an agent\'s role or a person\'s initials, never a full name): kept in the plan\'s change log. Left out, the entry names no one.',
  examples: ['reviewer-2'],
}

const refused = (error: unknown): unknown => (error instanceof MarkerRefused || error instanceof GitUnread ? new ToolRefusal(error.message) : asRefusal(error))

const ENTRY = objectSchema({ seq: NUMBER, at: STRING, by: NULLABLE_STRING, tool: STRING, before: NULLABLE_STRING, after: STRING })

const entryData = (entry: HistoryEntry): Record<string, unknown> => ({ seq: entry.seq, at: entry.at, by: entry.by, tool: entry.tool, before: entry.before, after: entry.after })

/** What changed back, from the log's entry of the change just made. */
function backLines(done: PutBack): { text: string[]; data: Record<string, unknown> } {
  const entry = done.entry
  const verdict = entry?.verdict ?? null
  return {
    text: verdict === null ? [] : [historySay('tool.history.backWhat', { verdict })],
    data: { verdict, changes: entry === null ? [] : [...entry.lines], fields: entry === null ? [] : [...entry.fields] },
  }
}

function versionWords(version: NamedVersion): string {
  switch (version.kind) {
    case 'marker': return sinceWords({ kind: 'marker', name: version.name, at: version.at, by: version.by, note: version.note })
    case 'git': return sinceWords({ kind: 'git', commit: version.commit, branch: version.branch, ref: version.ref })
    case 'revision': return sinceWords({ kind: 'revision', revision: version.revision, asked: version.asked, at: version.at })
    case 'now': return sinceWords({ kind: 'now', revision: version.revision })
  }
}

export const undoTool: GridTool = {
  name: UNDO_TOOL_NAME,
  title: 'Undo the last change',
  hint: 'change-plan',
  description:
    'Use this when the person, or you, want the last change to the plan taken back: "undo that", "put it back", "go back one step", "that broke it, revert". '
    + 'Every change Grid makes keeps the plan it replaced as a checkpoint beside the plan and a line in its change log (plan.history.jsonl), so no marker is needed. It writes the plan back exactly as it was before the last change not undone yet; called again, it goes one change further back. It answers what was undone, by whom and when, and what changed back. '
    + 'It is refused, with nothing written, when the plan changed outside the log (by hand or by another program): grid_diff since=last says what, and grid_restore with force=true puts a version back all the same. '
    + 'Do not use to go back to a marker, a date, a revision or a commit (grid_restore), or to see what changed (grid_diff). Units are metres in what it says changed.',
  args: {
    plan: PLAN_ARG,
    who: WHO,
  },
  outputSchema: objectSchema({
    written: STRING,
    undid: ENTRY,
    from: STRING,
    revision: STRING,
    left: NUMBER,
    verdict: NULLABLE_STRING,
    changes: listSchema(STRING),
    fields: listSchema(STRING),
  }),
  run(args, context) {
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    try {
      const done = undoLast(project, file, { via: VIA_SERVER, by: args['who'] as string | undefined })
      const back = backLines(done)
      const by = done.undid.by === null ? '' : historySay('tool.history.words.by', { by: { name: done.undid.by } })
      return {
        text: [
          historySay('tool.history.undone', { seq: done.undid.seq, tool: done.undid.tool, by, at: timeWords(done.undid.at), file: { name: path.basename(file) }, revision: done.to }),
          ...back.text,
          done.left === 0 ? historySay('tool.history.undoNoneLeft') : historySay('tool.history.undoLeft', { count: done.left }),
        ].join('\n'),
        data: { written: done.written, undid: entryData(done.undid), from: done.from, revision: done.to, left: done.left, ...back.data },
      }
    } catch (error) {
      throw refused(error)
    }
  },
}

export const restoreTool: GridTool = {
  name: RESTORE_TOOL_NAME,
  title: 'Put back an earlier version',
  hint: 'change-plan',
  description:
    'Use this when the plan should go back to an earlier version of itself: "go back to where we started", "restore this morning\'s plan", "put back the version before the review", or to recover a plan after a crash or a bad edit. '
    + 'since names the version: a marker\'s name (grid_mark_start), last (the plan before the last change), a revision as answers give it in planRevision (every change keeps the plan it replaced as a checkpoint), a date or date and time (the plan as it stood then, by its change log), git, git~1 or a commit by its first 7 hex digits. It writes that version back exactly as it was, keeps the plan it replaces as a checkpoint and logs the change, so grid_undo takes it back. '
    + 'It is refused, with nothing written, when the plan changed outside its log (by hand or by another program), unless force is true. '
    + 'Do not use to take back just the last change (grid_undo), or to compare versions without changing the plan (grid_diff with since and to). Units are metres in what it says changed.',
  args: {
    plan: PLAN_ARG,
    since: { type: 'string', maxLength: 40, required: true, description: 'The version to put back: a marker\'s name, last, a revision of 12 hex digits, a date (2026-11-26, its start) or a date and time (2026-11-26T10:00, UTC unless a zone is given), git, git~N or a commit by 7 to 40 hex digits.', examples: ['start', 'last', '3f9a0c12be47', '2026-11-26T09:00', 'git~1'] },
    force: { type: 'boolean', description: 'true to restore even when the plan changed outside its change log; the plan as it is now is kept as a checkpoint first. false when left out.', examples: [true] },
    who: WHO,
  },
  outputSchema: objectSchema({
    written: STRING,
    since: STRING,
    version: objectSchema({ kind: STRING, name: NULLABLE_STRING, at: NULLABLE_STRING, commit: NULLABLE_STRING, revision: NULLABLE_STRING }),
    from: NULLABLE_STRING,
    revision: STRING,
    forced: BOOLEAN,
    verdict: NULLABLE_STRING,
    changes: listSchema(STRING),
    fields: listSchema(STRING),
  }),
  run(args, context) {
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    const since = args['since'] as string
    try {
      const done = restoreTo(project, file, since, { via: VIA_SERVER, by: args['who'] as string | undefined, force: args['force'] === true })
      const back = backLines(done)
      const v = done.version
      const version = {
        kind: v.kind,
        name: v.kind === 'marker' ? v.name : v.kind === 'git' ? v.ref : v.kind === 'revision' ? v.asked : null,
        at: v.kind === 'marker' ? v.at : v.kind === 'revision' ? v.at : null,
        commit: v.kind === 'git' ? v.commit : null,
        revision: v.kind === 'revision' || v.kind === 'now' ? v.revision : null,
      }
      return {
        text: [
          historySay('tool.history.restored', { file: { name: path.basename(file) }, version: versionWords(v), revision: done.to }),
          ...(done.from === null ? [] : [historySay('tool.history.keptFrom', { from: done.from })]),
          ...(done.forced ? [historySay('tool.history.forced')] : []),
          ...back.text,
        ].join('\n'),
        data: { written: done.written, since, version, from: done.from, revision: done.to, forced: done.forced, ...back.data },
      }
    } catch (error) {
      throw refused(error)
    }
  },
}

/** The two, in their order: undo first, the more common request. */
export const VERSION_TOOLS: readonly GridTool[] = [undoTool, restoreTool]
