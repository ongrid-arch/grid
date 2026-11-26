# CMD-47: read and change one building of a site of many

## Outcome

An agent working on a plan that holds many buildings (a housing site of a hundred homes, a resort
of villas round a lake) can read and change one building at a time, without reading or writing
the rest, and every answer stays under the tool server's size limit:

- `grid_describe as=rooms building=<id>` gives that building's rooms text alone: its floors, its
  rooms, walls, openings, stairs, items, bays and notes, and its building line, with a `based on`
  line that is that building's own fingerprint.
- `grid_write_rooms building=<id>` writes rooms text back as that building only. Its floors and
  every part on them are replaced by what the text writes; every other building's parts stay in
  the file exactly as written. Text read from an older version of that building is refused with
  nothing written, as the whole plan's is; text with no `based on` line over a building that has
  parts needs `replace=true`. A text that writes its own building lines writes those buildings in
  place of the one named: one villa becomes three townhouses in one call. A building id the plan
  does not have adds the building. An id the text writes that another building already holds is
  given its floor's id in front, as the compiler gives a later floor's (`living` on floor `t2g`
  becomes `t2g-living`), and the id the building held before is kept when it had it so.
- `grid_add_storey building=<id> [like=<floor>] [id] [name]` adds a storey on top of a building,
  laid out like one of its floors (its top floor when left out): its walls, rooms, openings,
  items, columns, bays and flats copied with new ids; the building's record takes the new floor;
  its cores go up with it (a wall or column that rises through the old top floor rises through
  the new one, a stair that reaches the old top floor has a flight from it to the new one); the
  roof and parapet of the old top floor go to the new top.
- `grid_remove_building id=<id>` takes a building out with its floors and everything on them, the
  stairs, items, bays, ramps, notes and flats included (`grid_set_building remove` still takes out
  only the record and keeps the floors).
- `grid_place_building from=<id> id=<new> (move=[dx,dy] | at=[x,y])` places a copy of a building
  (a house type, a unit) on another lot of the site: every floor and part copied with new ids and
  moved, `at` putting the south-west corner of its walls' box on that point. Its name and pad may
  be given; the answer warns when its walls' box overlaps another building's.

A plan that names no building, and every tool asked as before, answers exactly as before.

## Design

- `packages/cli/src/edit/buildingParts.ts` (new): a building's parts, read from the plan by floor
  (walls, rooms, openings on its walls, opening patterns on its walls, stairs and ramps between its
  floors, items, columns, bays, notes, sketch lines and context shapes on its floors, flats of its
  rooms), the plan of that building alone (with the plan's display, types and library, so the
  read-back writes it as the whole plan's does), the patch that takes them out, and the two id
  maps (a floor's parts given a new floor id, ids that clash given their floor in front). Ids are
  renamed through every field that names one, never through the person's words (names, labels,
  facts) or a fixed word (a use, a kind, a type).
- `packages/cli/src/edit/buildingEdits.ts` (new): the four changes as patches: the building's
  rooms text written back (compiled by `compileRoomsText`, never changed), a storey added, a
  building removed and a building placed. Each goes through `writeChange` as every change does,
  so the plan lock, the change log and `grid_undo` (CMD-44), the drawing check ("would break the
  drawing") and the answer are the same.
- `packages/cli/src/edit/edits.ts`: the patch gains `lists`, ids taken out of and records added
  to the plan's other lists of parts (floors, stairs, columns, bays, ramps, notes, sketch, context
  shapes, patterns, flats, buildings), so the records of the other buildings stay in the file as
  written rather than read and written back.
- `packages/cli/src/mcp/buildingTools.ts`: `grid_add_storey`, `grid_remove_building` and
  `grid_place_building` after `grid_set_building` (one array, so `serveTools.ts` is untouched);
  `readTools.ts` and `writeTools.ts`: the `building` argument of `grid_describe` and
  `grid_write_rooms`.
- Decisions:
  - A storey is added on top only: a storey put in between would move every floor above it, and
    "add a storey" on a site means on top. A floor stated with an elevation is copied without it,
    so it stacks on the old top floor.
  - The copy of a building is moved, never turned: a quarter turn of every part of a house (stairs,
    bays, notes, anchors) is its own change; the answer says so.
  - Notes and sketch lines are not copied with a storey (they are about one floor), but go with a
    building that is placed elsewhere or removed.
  - No new convention in `types/floorplan.ts`, and no message code.

## Done

- Tests that fail before and pass after: `packages/cli/src/mcp/__tests__/oneBuilding.test.ts`, on
  a site of three buildings written as rooms text:
  - the building's rooms text holds its floors only and writes again to the same building;
  - a room added to one building's text changes that building only: the other buildings' records
    in the file are byte for byte as they were;
  - text read before a change to that building is refused, nothing written;
  - a building replaced by text with three building lines; new ids that clash are given their
    floor in front;
  - a storey added like the top floor: new floor in the building's record, stacked on top, its
    rooms copied, the stair core going up and the roof moved up;
  - a building removed with its floors and parts; a building placed with move and with at, its
    ids fresh, the copy moved, the overlap warned;
  - refusals: an unknown building, both move and at, a like floor of another building.
- The tool list test with the new tools in their place and the count raised.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/cli` and
  `packages/floorplan`, `ownWords.test.ts`, `contract.test.ts`, and `npm run scoreboard` no worse
  than `scoreboard/current.json`.
