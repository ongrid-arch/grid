# WRT-27: raw lines on the floor they are written under, and counted

## Outcome

- A `raw wall` or `raw room` line with no `"floor"` is on the floor of the floor line above it,
  as a `room` line is. Text that writes an upper floor in raw lines puts those parts on that
  floor, not on an unstated ground floor, so the check finds no wall on an unknown floor and no
  overlap with the floor below.
- A raw part that states a floor keeps it, when the text writes that floor. One that names a
  floor the text does not write is refused, naming its line and the floors there are.
- A `raw opening` takes its floor from its wall, as every opening does. One written under a
  floor whose wall is on another floor (and does not rise through it) is refused, naming its
  line, the wall and the wall's floor.
- With no floor line the text has one floor, as before, and a raw part gets no `"floor"`.
- The answer to a write counts and measures every part written, raw or not: the floors that hold
  a part, every room with its inside area by Grid's own measure (a raw room too), and the area
  in all. Text that is all raw lines answers with its floors, rooms and area, not "0 floors,
  0 rooms; 0.00 m² inside". When parts were written raw, one line says how many walls, rooms
  and openings, and that they are kept as written. The tool's structured answer lists raw rooms
  with the others and counts raw walls and openings.

## Design

- `packages/floorplan/src/rooms/compile.ts`
  - `rawPart` keeps each raw part with its line and the floor it was written under. A wall or
    room with no `floor`, under a floor line, takes that floor's id (`explicitFloors`), so the
    file holds it as it holds the rooms the text works out.
  - At the end of the reading (once every floor is known), a stated floor that is no floor of
    the text is refused with `rooms/unknown-floor`, the code a `through` to no floor has.
  - In `emit`, once the walls are known: a raw opening whose wall is in the plan on another
    floor, with no `through`, is refused with `rooms/raw` and its line. A wall the plan does not
    have is still a warning (`rooms/raw-wall-missing`), as before.
  - The facts: each raw room is measured on the plan as read (`safeParseFloorPlan`,
    `tryRoomPolygon`, `roomFloorArea`) and listed in `rooms` marked `raw`; one Grid cannot draw
    is listed with no area and says so. Each raw wall is listed in `walls` marked `raw`, with its
    length (`wallLength`) and the rooms that list it; each raw opening in `openings`.
  - Decided: a raw part's stated floor is the person's own and is kept even when it differs from
    the floor line above it (it is Grid's own JSON). Decided: `copy <floor>` still copies no raw
    part, as before.
- `packages/floorplan/src/rooms/answer.ts`: the floors are those that hold a room or a wall;
  rooms and area count raw rooms; walls "worked out" and openings "placed" count only those Grid
  worked out; a line says what was written raw. Its new words are in the message files.
- `packages/floorplan/src/messages/en.ts`, `es.ts`: the new refusals and answer lines.
- `docs/rooms-first.md`: where a raw part goes, and that it is counted.
- No new convention, no new message code for the record, no new tool.

## Done

- `packages/floorplan/src/rooms/__tests__/raw.test.ts` (new): raw walls and rooms under an upper
  floor are on it, the check finds no unknown floor or overlap; a raw part that states its
  floor keeps it; one that names no floor of the text is refused naming the line; a raw opening
  in a wall of another floor is refused naming the line; text with no floor line gives no
  `floor`; all-raw text answers with its floor, rooms and area, and says how many parts were
  raw. Each fails before the change.
- `npx vitest run packages/floorplan`, `packages/cli/src/__tests__/ownWords.test.ts`,
  `npm run typecheck`, `npm run lint`, `npm run scoreboard` (no count worse).
