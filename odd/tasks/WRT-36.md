# WRT-36: tidy cuts a corner as a corner, warns before sealing a space, and is a tool

## Outcome

- A solid wall drawn across the corner of a room at an angle (a chamfered corner, a corner
  entrance), which the room does not list, is read by `grid tidy` as the room's new face: the
  fix takes the corner beyond it outside. The room lists the wall in place of the corner, the
  two walls it meets end on it, a wall wholly beyond it is taken out, and a door or window on
  the corner it cuts off moves onto it. The door on the cut stays where it is, on the room's
  new outside face. No dead triangle is made as a room of its own.
- That fix is offered only when the corner it cuts off is bounded by the room's own outside
  walls (walls no other room lists), so a wall between two rooms, or a wall square to the walls
  it meets, is still a split of the room, as before.
- A split of a room that would leave a part with no way in (no door or opening on any of its
  walls), or two parts whose only openings are on the wall between them, says so in its fix.
  `grid tidy --apply all` makes no such fix: it lists it as skipped, with why, and the fix is
  made only when its id is named.
- An agent on the tool server has `grid_tidy`: with no fault ids it lists the wall faults and
  their fixes and writes nothing; with ids, or `all`, it makes those fixes on the plan file (or
  `out`) and says what was made, what was skipped and why, and what is left.

## Design

- `packages/floorplan/src/geometry/wallFaults.ts`
  - `splitAlong` also gives the two parts' wall lists (`parts`), so the corner fix and the
    sealing check read the same split.
  - `cornerCut`: the corner fix for a `crosses-room` fault. It holds when the crossing wall is
    solid, meets the walls at its two ends at an angle that is not square (`squareCorner`, the
    table's own figure), and every wall of the smaller part besides it is a solid wall no other
    room lists. Its edits: each wall the crossing wall meets has its end beyond the cut moved to
    where their lines cross; each wall wholly beyond is taken out; an opening beyond the cut
    moves onto the crossing wall, centred, when the crossing wall has room for it and carries
    none; and the room's wall list becomes the larger part's. An opening that straddles the cut
    point, or two that would both move, leave no corner fix, and the split is offered instead.
    The fix is tried as every other (`fixHolds`).
  - `WallFix.seals`: the rooms a fix leaves with no way in. A split part is sealed when no
    opening stands on any of its walls, and both parts are when neither has an opening on a wall
    other than the one between them. The fix's sentence ends with a warning naming them.
  - `tidyPlan` with no ids skips a fix that seals a room and says why; named by its id, it is made.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: the corner fix's sentence, the warning
  and the reason it was skipped, in Grid's own words (MSG-11). The check's fix lines name
  `grid_tidy` beside `grid tidy`.
- `packages/cli/src/mcp/tidyTool.ts`: `grid_tidy`, a change to the plan, placed after the room
  edits (`grid_place_item`) and before the saved views, so the room edits keep their order. It reuses `tidyList` and `tidyFile` of
  `command/tidy.ts`, so the command and the tool make the same fixes; the file is written
  through the project's files. The tool count goes from 34 to 35, a decision noted in the test.
- Docs: `docs/commands.md` (tidy's corner fix and the sealing warning),
  `docs/tool-server.md` (the new tool) and `AGENTS.md` (the tool count and file).
- `command/tidy.ts`: each listed fault carries `seals`, so `--json` shows it too.

## Done

- `wallFaults.test.ts`: the restaurant-like corner entrance (a room with a diagonal wall across
  its corner and the entrance door on it) is a `crosses-room` fault whose fix cuts the corner,
  leaves the door on the cut, ends the outside walls on it and leaves no fault; a door on the
  cut-off corner moves onto the cut; a square wall across a room is still a split; a split that
  leaves a part with no way in warns and is skipped by `tidyPlan` with no ids, made with its id.
- `tidyTool.test.ts` (tool server): `grid_tidy` lists faults and writes nothing, makes the fix
  named and writes it to `out`, and refuses an unknown argument.
- `tools.test.ts`: the order holds `grid_tidy`, with its hint, examples and output schema.
- `ownWords.test.ts`, `tolerances.test.ts`, `npm run typecheck`, `npm run lint`, the test folders
  of `packages/floorplan` and `packages/cli`, and `npm run scoreboard`.
