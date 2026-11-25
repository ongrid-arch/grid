# WRT-48: unknown or misplaced raw input is refused by name

## Outcome

Rooms text never drops or misreads what an agent wrote raw, or a word it does not read, in
silence. Each of these is answered by name, with its line and what was expected:

- A `raw wall`, `raw room` or `raw opening` with a field Grid's plan file does not have (`bulge`,
  `spline`, `ellipse` on a wall, `facts` on a room, `inset` on a window) is refused with the field,
  the nearest field Grid knows when there is one, the fields the part has, and a hint for the
  words agents write most: a curve is `"arc": {"centre": [x, y], "sweep": <degrees>}`, facts of
  one's own are `"properties"`. Until now the field was dropped and a straight wall written.
- A `raw floor` line with a field the floor line does not take names that field.
- A `raw floor` line written with no floor line above it applies to the one floor the text has,
  the ground floor, and the plan writes that floor with it (a roof, a parapet). Until now it was
  dropped with no warning.
- `raw door`, `raw stair`, `raw site`, `raw column`, `raw fixture` and any other word after `raw`
  are told that raw takes wall, room, opening or floor, and where that part goes instead (a door
  or window is a raw opening; stairs, columns, fixtures, the site live in the plan file's own
  lists). Until now the refusal listed `raw` among the words a line may start with.
- `plan "<name>"` with more words after the name (`plan north 0`, `plan My house`) is refused
  with the line written right, instead of taking the first word as the plan's name.
- `wall between <room> and <name>` or `wall <name> <side>` where the name is no room written on
  that floor is refused with the name, the nearest room id and the rooms of that floor. Until now
  the line did nothing.

## Design

- `packages/floorplan/src/rooms/compile.ts`, raw-line parsing only, plus the `plan` statement and
  one record per wall line:
  - `rawPart` reads the part's unknown fields with `readingNotes` (`types/reading.ts`), the plan
    reader's own list, read from the schema, so a field added to the format is known at once.
    Each unknown field is a problem (`rooms/raw`), all of a line's at once.
  - `rawFloor` names the fields it does not take.
  - A line starting `raw` that is not one of the four kinds is refused (`rooms/raw`) before the
    general word check.
  - `emit` writes the floors list when the only floor is the implied ground floor and a raw floor
    gave it fields.
  - `stWall` records each wall line's room names; after all lines are read, each name that is no
    room on its floor at that point is refused (`rooms/unknown-room`), all at once.
- The words are in `messages/en.ts` (and `es.ts`, a draft), under `rooms.raw.*`, `rooms.plan.*`
  and `rooms.wall.*`.
- Decisions: an unknown raw field is refused, not warned, because a warning would still write the
  part without it (a straight wall for a curved one); a raw floor with no floor line applies to
  the ground floor rather than being refused, as the text has exactly one floor it can mean; no
  new message code: `rooms/raw`, `rooms/syntax` and `rooms/unknown-room` already say these.

## Done

- `packages/floorplan/src/rooms/__tests__/rawInput.test.ts`: each case above, failing before the
  change and passing after.
- The rooms tests, the read-back tests (`writesBack`, `buildings`), `ownWords`, `tolerances`, the
  type check, lint and the scoreboard pass.
