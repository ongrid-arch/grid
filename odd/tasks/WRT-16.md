# WRT-16: grid write never drops floors the rooms text does not mention

## Outcome

- Rooms text that names fewer floors than the plan file holds is refused, by `grid write` and
  `grid_write_rooms` alike. The refusal names each floor the write would drop and what stands on it
  (rooms, its outline, its homes, its parking), and says what to do: read the whole plan back
  (`grid describe --as rooms`), or add `--replace` to drop them. Nothing is written.
- With `--replace` the floors are dropped as asked, and the answer says which, with what was on
  them, so a person is never told "Problems in the drawing: 0 → 0" about a plan that lost a
  building.
- Rooms text with no rooms is refused, even with `--replace`: it would write an empty plan.

## Design

- One place decides: `writeRoomsIntoProject` in `packages/cli/src/command/write.ts`, which the
  command and the tool both call. The check compares the plan file as read whole (`before`) with the
  plan the text makes, by floor id through `planFloors`. Rooms text in the core is not touched.
- The check lives in `packages/cli/src/command/writeLoss.ts`: `floorsDropped(before, after)` returns
  each dropped floor with its room count, outline, homes and parking; `droppedLine` words them.
- The refusal is a new `RoomsRefused` code `rooms/floors-dropped`; the empty text is
  `rooms/empty`. They are refusals of the write command, like `rooms/plan-changed`, not codes of
  the problem report, so they need no catalogue entry.
- Decision: refuse rather than keep the floors the text does not mention. Keeping them would leave
  floors beside rooms text the person believes is the whole plan, and the stairs, flats and
  patterns that name the dropped floors' parts would point at nothing. Refusing is the same
  contract the other losses (phases, stale text) already follow.
- A floor the plan only derives from its parts (no registry entry) counts too.

## Done

- `packages/cli/src/command/__tests__/write.test.ts`: a plan of three floors with an outline,
  homes and parking, written from one floor's text, is refused naming them and the file is
  unchanged; the same with `--replace` writes and says what was dropped; a whole round trip
  (`describe --as rooms`, write) still writes; empty text is refused with and without `--replace`.
  The tool gives the same refusal.
- `npm run typecheck`, `npm run lint`, `packages/cli` tests, `ownWords`, `contract`, scoreboard.
