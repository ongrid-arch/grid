# WRT-15: room edits on a plan with phases

## Outcome

On a plan that states phases (existing, demolished, new), every room edit (merge, split,
add a room, stretch, move a room's side) writes the work, not a changed building: what stood
before and is taken out or reshaped stays in the plan, to be demolished, and what the edit makes
is new. The edit leaves no fault of its own behind (no demolished wall running across a room
that still stands, no door left on a wall that is no longer in the plan, no existing room round a
new wall), and its answer says, part by part, what was kept to be demolished and what is new.
Comparing the plan by phase then shows the work as it is: a merge is a wall removed and a room
enlarged, not a room removed.

## Design

All in `packages/cli/src/edit/phases.ts` (`phasedPatch`), which already turns an edit's patch into
the work for a plan with phases. The edits themselves stay as they are: each makes its patch on
the building after the work, and `phasedPatch` turns it into the work.

- **A wall whose ends move.** For an existing straight wall the patch gives new ends:
  - made longer along its own line: the wall stays as it stood, existing, and each added stretch
    is a new wall of its own, `<id>-new`, with the wall's thickness, height, kind and floors;
  - made shorter along its own line: the wall takes its new ends and stays existing, and each
    stretch cut off is kept as `<id>-before`, to be demolished;
  - moved off its line (or made longer at one end and shorter at the other): the wall with its
    id is new, at its new ends, and the wall as it stood is kept as `<id>-before`, to be
    demolished, with every door and window it held (each kept as `<opening>-before`, to be
    demolished; a door left on the wall is new, as it goes with its wall).
  A curved wall is never cut by an edit, so it is still changed in place and the answer says so.
- **An opening only re-seated.** An opening whose offset changes only because its wall's start
  moved stays where it was in the building: it is not new work, and no old copy is kept.
- **An opening taken out of a wall the edit cuts or shortens** is kept, to be demolished, on the
  piece of wall that holds it now (it used to stay on the wall id the cut took out of the plan,
  which broke the drawing).
- **A room the edit reshapes.** An existing room whose outline after the edit differs from how it
  stood, or that would stand on a wall that is new: the room with its id is new, with its new
  boundary, and the room as it stood is kept as `<id>-before`, to be demolished, with its old
  boundary on the walls as they stood (`<wall>-before`, or the pieces of a cut wall). Same
  shape on pieces of a cut wall that all stay existing (add a room against it) is not a
  change: the room stays existing. The outlines are measured with the core's `roomPolygon` on the
  plan before and after the patch (`readingAfter`).
- A room boundary that names a wall made longer lists its new stretches beside it, in order
  along the ring (after the work); a boundary as it stood names the stretches cut off.
- Ids: the part keeps its id after the work (so later edits and doors that open into a room keep
  pointing at it); what stood before takes `-before` (`-before-2` and on), as a widened door
  already does. A stretch added takes `-new`.
- Words: the answer's lines stay in `phases.ts` with the other edit receipts (not moved to the
  message files yet); `packages/cli/src/__tests__/ownWords.test.ts` gets the file's new count.
- No new convention, no new message code, nothing in `packages/floorplan`.

## Done

- `packages/cli/src/mcp/__tests__/phasedEdits.test.ts`: a two-room plan with every part stated
  existing; through the tool server, merge, split, add a room (plain, with an opening, with the
  doors in the way taken out), stretch and move a side each write, leave no new problem in the
  drawing (`grid_check` finds no `wall/crosses-room`, `room/phase-wall` or `opening/phase-wall`,
  and the edit's own count of problems in the drawing does not rise), and keep the old parts
  demolished and the new ones new, by id and phase. The merge compared by phase lists the wall
  removed and the room enlarged. The same on a two-storey plan.
- The existing phase tests (`mcp/__tests__/phases.test.ts`, `edit/__tests__/requests.test.ts`)
  still pass; `npm run typecheck`, `npm run lint`, the cli package's tests and the scoreboard.
