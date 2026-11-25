# WRT-55: rooms-text refusals say what is wrong, and the placement edge cases come out as written

## Outcome

An agent writing rooms text from sample plans gets what the line says, or a refusal that names
what is really wrong and gives a line that writes. In particular:

- A room line that places a room twice (`north of a south of a`, `at` twice, `at` and `east of`)
  or sizes it twice is refused by name, never written by its last words.
- `until <room>` stops at the near face of the room it names, less the wall between, when that
  room stands in the way of the stretch (it ran over it); `until near <room>` says so always.
  `*` on the side a room lies along its neighbour (`* x 1.5 north of a`) takes the neighbour's
  extent, and the answer says so.
- `repeat <unit> <n> <dir> ... w=* fill <length>` works out the setting written `*` so the row
  is that long. A gap between two rooms that is too wide for a wall is refused with how much
  wider either room's size makes it close to a wall.
- A row placed beside a room (its street, a corridor) that runs past that room's end is said
  once (`rooms/row-overrun`), first among the warnings and first among the problems when the text
  is refused, with how much narrower each unit closes it.
- Two rooms sized to their outside faces placed one beside the other add up to the two sizes,
  as two placed `at` already did. A room in a unit sized to centre lines or outside faces and
  placed `at x,y` is placed by the corner its size measures to and keeps the inside wall
  thickness between it and its neighbour (it got a wall as thick as the guess's gap, 0.3 m).
- A repeat label counts from its digits and keeps its leading zeros: `as 001` gives 001, 002,
  003 and `as A01` gives A01, A02.
- A window written `in bed1 north` on a side partly against another room goes in the outside
  stretch of that side, placed along that stretch.
- `opens in` and `opens out` on a door between two rooms are refused (neither room is the
  outside); `opens into <room>` is offered for each.
- A door, window or opening may carry a name after its id (`door front "Front door" in hall
  north, ...`), kept in the opening's own facts as `name`.
- `open` says in the answer which room it opened the room to; `open <room>` names it, also for a
  room placed `at x,y`; on a room cut out of a corner (`inside <room> corner ...`) it opens it to
  the host.
- A room line that names a floor (`floor first`) is told that a room's storey is the floor line
  above it. `outdoor` (or an outdoor kind) in the use slot is refused with the line written with
  `-` and `outdoor <kind>` after the size.
- A `wall between` line makes a wall where the rooms were placed touching (`at`, or `open`),
  on the line they share, instead of refusing them as touching.
- A door's `<m> from <side>` in `between <a> and <b>` is measured along the stretch the two
  rooms share, from its end on that side.
- Advice is given only where it applies: `open` is offered for a touching room only when it was
  placed beside the other; `inside <room> corner` only for a room that fits in the other. A
  wall-line refusal shows a thickness as a bare number, and a name holding a quote mark is
  written with the other quote mark or with `\"`, as `docs/rooms-first.md` says.

## Design

- `packages/floorplan/src/rooms/compile.ts`, in the reading of a room line (`readRoom`), the
  relative box (`relBox`), the derivation of walls (`derive`, `meantBetween`), the repeat
  (`stRepeat`), units (`placeUnit`), and the placement of openings (`resolveOpening`,
  `openingWords`). Only the cases listed; the other workers' polygon faces and carved rooms by an
  entrance stay theirs.
- New sentences go in `packages/floorplan/src/messages/en.ts` and `es.ts` (keys `rooms.wrt55.*`
  style, under `rooms.`), said with `said`, so `compile.ts`'s count of English sentences does not
  grow. New codes are rooms text's own (`rooms/row-overrun`), not record codes.
- `fill`: the setting written `*` is a value the settle rounds work out (as the walls round a
  room sized to its centre lines are): each round places the row, measures it along the repeat's
  direction to the faces its sizes measure to, and the next round moves the value by the secant.
  A row that does not come within a joint's tolerance in the rounds is refused with its length.
- The door's name goes in `properties.name`, which the read-back carries by id (CNT-9), so no
  field is added to the plan file and the read-back stays rooms first.
- A quote: `words.ts` reads `\"` and `\'` inside quotes as the mark itself.

Decisions (easiest to undo): `until` is unchanged when the room named is not in the way; the
door name is a fact, not a new field; `fill` needs one setting written `*`.

## Done

- `packages/floorplan/src/rooms/__tests__/refusalsAndEdges.test.ts`: one test per case above,
  failing before the change.
- The rooms tests, the buildings fixtures and the read-back tests pass unchanged.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the CLI's own-words
  and tolerances tests, and `npm run scoreboard` no worse than `scoreboard/current.json`.
