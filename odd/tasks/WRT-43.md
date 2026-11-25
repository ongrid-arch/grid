# WRT-43: never drop a room silently because it has no name

## Outcome

A room or a zone with no name is still drawn, measured and counted. An agent that takes the names
off a plan's rooms to tidy the drawing finds every one of them in every view, measure and export,
each called by its id, and the check says once per room that the name was missing and the id is
used. Where an answer words a room, a room whose name is blank is written as its id, never as `""`,
so no room is lost among the others. A crop or a view that names a room that is in no view says
why that room was left out, instead of saying the plan has no such room.

## Design

- `packages/floorplan/src/types/readParts.ts`: today a room whose `name` is missing, `null` or not
  text is a part left out (`plan/part-left-out`), and so it is in no view or measure. The reader now
  names such a room by its id and keeps it. The line is the reader's own `plan/value-left-out`, with
  the id as the value used, so no new message code and no new words. A blank name (`""`) is a name
  the format holds and is read as written. A command that writes the plan back still reads it
  whole and refuses it with the line, as it does for every value it would read otherwise, so the
  file is never rewritten with ids in place of the missing names.
- `packages/cli/src/quantities/survey.ts`: one rule for what an answer calls a room, `roomCalled`:
  its name, or its id when the name is blank (`roomCalledById` for an id). It is used where the
  measuring answers word rooms: the door and window schedule's sides, the accessibility
  measurements, the use indicators, the take-off, the finishes, the estimate's rooms left out,
  the room measures, facing and sun, and the tool server's lines that name a room
  (`mcp/readTools.ts`). A room's stated name in the plan facts and in `grid describe` stays as
  the file says: the agent form prints the id beside it, and the person's form keeps its
  numbered "unnamed room", since it never shows an id.
- `packages/viewer/src/picture/scene.ts`: a room with a blank name is labelled with its id (once,
  even with ids shown), and so is a removed room's ghost label.
- `packages/cli/src/mcp/readTools.ts`: `grid_view`'s crop, and its `room` for `kind=eye` and
  `kind=3d`, refuse a room that is in no view by saying why: the reader's fault on it, or the check
  line that keeps it from being drawn. The tool server's answers stay in English by design, so its
  own-words count goes up by the new refusal.
- No new convention in `types/floorplan.ts`: the schema is unchanged.

## Done

- `packages/floorplan/src/types/__tests__/roomWithNoName.test.ts`: a room with no `name`, or a
  `null` one, is read with its id as its name and one `plan/value-left-out` line; it was a part
  left out before.
- `packages/cli/src/mcp/__tests__/roomsWithNoName.test.ts`: on a plan whose rooms have no names
  or blank names, `grid_view` draws each room's id on the plan, `grid_areas` and the take-off count
  every room, the schedule and the accessibility measurements name each by its id with no `""`,
  and a crop or an eye view of a room the reader left out says why.
- `npm run typecheck`, `npm run lint`, the test folders of `floorplan`, `viewer` and `cli`,
  `ownWords.test.ts`, `tolerances.test.ts`, the result contract test and `npm run scoreboard`.
