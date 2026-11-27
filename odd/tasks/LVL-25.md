# LVL-25: rooms numbered per floor, and floors named by their name or level

## Outcome

An agent writing a building of many alike floors (a hotel, student rooms, a block of flats) numbers
each floor's rooms by its level once, and every copy of the floor numbers its own; and it names a
floor the way the person does, by its name or its level, wherever a tool takes a floor:

- `{level}` (or `{floor}`, the same) in rooms text is the floor's level: in a room's name, in a
  unit's room and opening names, in a flat's name and in a placement's label
  (`repeat guest 6 east as {level}01 ...` places 101 to 106 on level 1). A label counts up from its
  digits as before (`as {level}07` goes on from 07, `as A7` from 7).
- A floor copied (`copy`, `floor ... copy`, `repeat floors`) numbers by its own level what was
  numbered by a level: the labels, the ids made from them (`room-201`, `door-201`), the names
  (`Room 201`) and the flats (`Flat 201`). A label written without `{level}` is kept as written.
- A placement's label is not a room id: a unit may be placed as `A` beside a room whose id is `A`;
  `<side> of A` names the room.
- `copy <floor>` and `repeat floors <n> from <floor>` take the floor by its id or its name.
- Every tool that takes a floor (`floor`), and the command's `--floor`, takes the floor's id, its
  name in any case (`Second floor`), its level (`2`, `level 2`, `L2`) or a word of its name or an
  ordinal (`third`, `3rd`, `ground`). A word two floors answer to is refused with both. A floor
  that is not there is refused with the ids of the plan's floors in level order.
- An answer that names a room by its name says its floor beside it whenever another floor has a
  room of that name (`Room 101 (Second floor)`), and `grid_compare` sums the rooms of one name per
  floor, so seven floors of `Room 101` are seven rows, never one.

## Design

- `packages/floorplan/src/rooms/levels.ts` (new, pure): the two marks, a level as a word, a label
  counted up from its digits (moved from `stRepeat`, the same rule) and filled.
- `packages/floorplan/src/rooms/compile.ts` (owned by this change now): a label is counted from what
  was written and then filled with the floor's level, so `{level}01` counts as `{level}02`; each
  floor keeps the labels written with a mark (`FloorDraft.labels`, the label as written, its place
  in the row and its openings' ids), and a room its name as written (`RoomDraft.levelName`). A copy
  renames what was numbered by a level, through one renaming of a floor's rooms and openings, the
  one `rename` used (now `renameOnFloor`). Filled at once, so every line after it names the room as
  the plan will (`east of 101`, `door ... between room-101 and corridor`). A floor is found by its id,
  else its one name.
- `packages/floorplan/src/geometry/floors.ts`: `floorAsked(plan, text)`, the one reading of a floor
  by id, plain id, name, level, a word of its name or an ordinal; ambiguous or none said apart.
- `packages/cli/src/mcp/toolkit.ts`: `floorArg` reads through it; `FLOOR_ARG` takes text, not an id
  pattern, and the tools that wrote their own floor argument spread it. `grid_find` and
  `grid_count` hand the query the floor found, not the word sent. `command/plan.ts` `floorOption` and
  `command/export.ts` `exportFloorId` read through it too.
- `packages/cli/src/describe/facts.ts`: a room whose name a room of another floor has carries its
  floor's name (`RoomFacts.floorName`); `quantities/survey.ts` `roomCalled` says it; `compare.ts`
  sums by name and floor when the name is on several floors.
- No new convention in `types/floorplan.ts`, no new code, no new tolerance.
- Docs: `docs/rooms-first.md` (the marks, copies numbered by level, labels), `docs/tool-server.md`
  (floors by name or level).

Left undone: a flat's floor on the sheet (the sheet's own reading of a flat); a `where floor = ...`
condition of `grid_find` still compares the floor's id.

## Done

- `packages/floorplan/src/rooms/__tests__/levels.test.ts`: `{level}` in labels, names, flats; a
  copy and a repeat of floors renumbered; `as A7`; a label beside a room of the same id; `copy` by
  a floor's name; a literal label kept.
- `packages/floorplan/src/geometry/__tests__/floorAsked.test.ts`: id, name, level, word, ordinal,
  ambiguous and none.
- `packages/cli/src/mcp/__tests__/floorNames.test.ts`: a tool given `Second floor`, `2` and `third`;
  the refusal's floors in level order; `Room 101 (Second floor)` in an answer and compare's rows per
  floor.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerances test, `ownWords.test.ts`, `contract.test.ts`.
