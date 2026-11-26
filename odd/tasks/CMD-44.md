# CMD-44: undo, restore and a change history beside the plan

## Outcome

An agent, or the person, can take a change back and can find out what changed, who changed it
and when, without reading Grid's files by hand or setting a marker first. Today a marker keeps
the whole plan text but nothing puts it back (agents restored plans with a script, or asked the
person to paste JSON), a plan keeps five markers and refuses a sixth, nothing is kept unless an
agent remembered to set a marker, and a comparison after a change of facts or room numbers says
"Changes: none". After this change:

- Every change Grid makes to a plan, on the tool server or with `grid edit` and `grid write`,
  keeps the plan it replaced as a checkpoint, and adds one line to the plan's change log: when,
  who (`by`, when the agent names itself), which tool, the revisions before and after, and what
  changed, the building's change lines and every field that changed, facts and numbers included.
  The log is only ever added to.
- `grid_undo` puts the plan back as it was before the last change in the log that is not undone
  yet; called again, it goes a change further back. `grid_restore` puts the plan back as it was at
  a marker, a checkpoint's revision, a date and time, `last` or a commit of the project's git. Both
  are refused, with nothing written, when the plan changed outside the changes in the log (by hand
  or by another program): they say so and how to see what changed. `grid_restore` takes `force`
  to restore all the same, keeping the plan it replaces as a checkpoint first, so nothing is lost.
- `grid_diff` compares with any of those versions (`since`), and two earlier versions with each
  other (`to`). `show: facts` lists every field that changed, part by part; `show: history` lists
  the log's entries since that version. A comparison where only facts or numbers changed says so
  instead of "Changes: none".
- Markers carry who set them and a note; a plan keeps twenty, and a new one past that rolls the
  oldest off, saying which, instead of refusing.

## Design

All in `packages/cli/src`.

- `versions/history.ts` (new): the change log, `<plan>.history.jsonl` beside the plan, one JSON
  object per line, written only with the project's `appendText`; and the checkpoints, one file
  per revision in `<plan>.checkpoints/`, holding the replaced plan's text as it was on disk. The
  checkpoints roll: at most `CHECKPOINTS_MAX` (50) are kept, the oldest by the log removed. The log
  is never rewritten, so an entry whose checkpoint has rolled off says so when asked to restore.
  `recordChange` is the one way an entry is written: it compares the text before with the plan
  now and writes nothing when the file did not change (a change written to `out`).
- `versions/fields.ts` (new): every field that differs between two plan files, part by part by
  id (`room kitchen: properties.department "Sales" → "Finance"`), so facts, numbers and any other
  field are seen even where the building comparison sees no change. Lists are paired by id; a
  part added or removed is one line.
- `versions/restore.ts` (new): what `grid_undo` and `grid_restore` put back, and their refusals.
  Undo walks the log from its end: an undo entry names the entry it undid, which is skipped, and
  the plan must be at the revision the log last wrote.
- `versions/diff.ts`: one resolver of a version's name for `since` and `to`: a marker, `git`,
  `git~N`, a commit by at least 7 hex digits (on the first-parent line of `HEAD`, `versions/git.ts`),
  `phase`, `last` (the plan before the last change in the log), a revision of 12 hex digits (a
  checkpoint, or the plan now) or a date and time (`2026-11-26` or `2026-11-26T10:00`: the plan as
  it stood then, from the log). `show` gains `facts` and `history`.
- `versions/markers.ts`: `MARKERS_MAX` 20, rolling the oldest off; a marker's `by` and `note`,
  optional, read back when they are there, so older markers files still read.
- `mcp/revisions.ts`: `guardedRun`, which every change on the tool server already goes through
  with the plan's lock held, reads the plan's text before the tool runs and records the change
  after it; `by`, beside `based_on`, on every tool that changes the plan, taken off the arguments
  as `based_on` is. Undo and restore record their own entries (they name what they undid), so the
  server leaves them out.
- `mcp/versionTools.ts` (new): `grid_undo` and `grid_restore`, placed before the tools that change
  the building (`serveTools.ts`, registration only). `mcp/diffTools.ts`: `grid_diff`'s `to` and new
  shows, `grid_mark_start`'s `by` and `note`.
- `command/edit.ts` and `command/write.ts`: the change recorded, by `grid edit` and `grid write`.
  `command/diff.ts`: `--to`, `grid mark --by --note`. No `grid undo` command line in this change:
  the tools are the ask, and the command line can follow from them.
- `mcp/projectTool.ts`: the log and the checkpoints folder are listed among the files beside a plan.
- Grid's words for the answers and refusals go in `messages/en.ts` (`tool.history.*`) with their
  draft Spanish; tool descriptions stay in the tool files, in English by design.
- Decided: checkpoints are whole texts, not differences, so a person can put one back by copying
  a file; the log holds only revisions and lines, so it stays small. A date names the plan as it
  stood at that moment by the log, never a marker's time. The change lines kept in an entry are
  bounded (40 building lines, 60 field lines) and say how many more there were.

## Done

- `versions/__tests__/history.test.ts`: a change on the tool server adds an entry (who, tool,
  revisions, field lines with a fact and a number) and keeps a checkpoint; a call that changes
  nothing adds none; the checkpoints roll at the limit.
- `mcp/__tests__/versionTools.test.ts`: undo after two changes goes back two steps, then refuses;
  undo is refused after the plan was edited by hand; restore to a marker, a revision, a date and
  `last`; restore refused when changed elsewhere, and done with `force`, keeping a checkpoint.
- `versions/__tests__/diff.test.ts`: a change of a fact and a room number is said, not "none";
  `show: facts`, `show: history`, `to`, `git~1`; markers roll and keep `by` and `note`.
- `tools.test.ts` order and count, `everyPath.e2e.test.ts` slots for the new tools,
  `ownWords.test.ts` counts, `contract.test.ts`.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/cli`, `npm run scoreboard`.
