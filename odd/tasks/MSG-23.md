# MSG-23: grid diff pairs rooms by where they stand first, also when the rooms text is rewritten

## Outcome

When Grid compares two versions of a plan (`grid diff`, `grid_diff`, the verdict every change
answers with), a room is the same room only where it stands in the same place:

- In a plan written rooms first, a rewrite that gives a room's id or name to a room somewhere else
  (a ward of beds renumbered, a row moved) no longer pairs the two: the room that went is said to
  be gone and the one that came to be added, or each is paired with the room standing in its place,
  renamed. No line says a room "shrank" from the size of one room to the size of another that
  stands across the building.
- A room reshaped under a new id, as a comparison by phase reads one (an entrance lobby taken
  down and built again a little smaller), is the same room changed, not one room removed and
  another added, as the comparison with a marker already reads it.
- A room whose id or name was kept and that moved a little, or that grew or shrank, is still the
  same room (WRT-32's renamed-and-moved case keeps working).

## Design

`packages/floorplan/src/geometry/diff/place.ts` (`alignPlans`), the room passes only:

- Rooms written rooms first are paired by place first now, as the documentation says, then by
  id, then by the floor they share, then by name (WRT-32). Before, the id came first.
- The id pass and the name pass of a plan written rooms first pair two rooms only when they share
  floor: at least `diffRoomKeptShare` (half) of the smaller of the two. A room under its old id or
  name that shares less than that is another room that took the id or name.
- A new pass after the id pass, in both kinds of plan: two rooms on the same floor, under any ids,
  whose shared floor is at least `diffRoomOverlapShare` (three quarters) of the larger of the two
  are the same room reshaped. Three quarters of the larger keeps two rooms knocked into one a
  merge (WRT-32): neither half is three quarters of the room they became.
- The shared floor is worked out with `cutOutline('intersection', ...)` from `polygons.ts`, for
  pairs whose boxes meet.
- Decision: a plan drawn wall by wall keeps its id pass as it was (no shared-floor test): its rooms
  follow walls whose ids are the author's, and the card is about rooms text rewritten. Easy to
  widen later.
- The two figures go in `src/geometry/tolerances.ts` and `docs/tolerances.md`.
- `docs/commands.md` says the new order in the paragraph on how versions are paired.
- No message code, no convention, no schema change, no new sentence (the words are the existing
  removed, added, renamed and changed lines).

## Done

- `packages/floorplan/src/geometry/__tests__/diff-room-place.test.ts` (new), failing before:
  - rooms first, a bed's id and name given to a bed in the other row: the two are not paired, and
    the room in the old bed's place is paired with it by place;
  - rooms first, a row of beds rewritten narrower and renumbered: no bed is said to shrink from
    one bed's size to that of a bed elsewhere;
  - a room reshaped under a new id (as by phase) is one room changed, not removed and added;
  - two rooms knocked into one under a new id is still a merge.
- WRT-32's tests (`diff-room-changes.test.ts`) and the phase comparison in
  `packages/cli/src/mcp/__tests__/phases.test.ts` keep passing.
- `npx vitest run packages/floorplan`, the CLI's diff and phase tests, `ownWords.test.ts`,
  `tolerances.test.ts`, `npm run typecheck`, `npm run lint`, `npm run scoreboard`.
