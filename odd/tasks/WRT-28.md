# WRT-28: merge and split keep the flats right

## Outcome

- After `grid_merge_rooms`, no flat lists a room that is gone, and the merged room is in the flat
  its rooms were in. After `grid_split_room`, the new room is in the flat of the room it was split
  from. Both answers say what happened to the flats, in one line each.
- A plan with no flats answers and writes exactly as before.

## Design

- `packages/cli/src/edit/merge.ts`: `flatsAfterMerge` works out the new `flats` list; `mergeRooms`
  sets it in the patch's `plan` field (the list as a whole) and adds a line to `said`.
  - Without zones the second room is gone and the first keeps its id: the second leaves its flat.
    If only the second was in a flat, the merged room takes its place there.
  - With zones the two rooms become zones of a new room: the new room takes the place of both in
    the flat (the first room's flat when they were in two).
  - A room is in one flat at most (C18), so when the two were in different flats the merged room
    stays in the first room's flat and the second leaves its own, said in `notKept`. A flat left
    with no room is taken out and said so, since a flat lists at least one room.
- `packages/cli/src/edit/split.ts`: the new room is added to its parent's flat, after it.
- No new convention: C18 already says a flat is a list of room ids.

## Done

- `packages/cli/src/edit/__tests__/flats.test.ts`: merge (with and without zones, two flats,
  second room alone in its flat), split, and a plan with no flats unchanged.
- ownWords and tolerances tests, typecheck, lint, the cli edit tests, scoreboard.
