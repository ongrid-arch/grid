# WRT-49: a split gives the new room the use of the room it came from

## Outcome
When a room is split, the new room has the same use as the room it came from, unless the call
names another use for it. The answer says so, so the person can change it. Splitting an 8-person
office gives a second office, not a room with no use.

## Design
- `packages/cli/src/edit/split.ts`: the new room's `use` is `request.newRoom.use`, else the use
  the room had before the split (the room's own `use`, whatever new use the call gives the room
  itself). When it is taken from the room, one line goes into `guessed`.
- A room that states no use gives the new room none and no line.
- Tests in `packages/cli/src/edit/__tests__/splitUse.test.ts`.
- Choice: the new room takes the use the room had, not the one the call gives the room, since
  "came from" is the room as it was; a caller who wants both changed names the new room's use.

## Done
- The new test fails before the change and passes after it.
- `packages/cli` tests, `ownWords.test.ts`, typecheck, lint and scoreboard pass.
