# CNT-44: fill a room or zone with desks or seats at a pitch in one call

## Outcome

An agent asked "how many desks fit in the hot-desk zone" or "set out the café with tables for
four" answers it in one call, and the same way every time, instead of placing a hundred items one
by one and dividing the area by hand:

- `grid_fill_room` fills a room, or a zone of an open-plan room, with one library entry repeated
  on a lattice: an item (a desk, a chair, a bench seat) or a typical set of items (a table with its
  chairs). The person's figures set it out: the pitch along a row, the aisle between rows, the
  clear distance kept from the walls and in front of every door, the turn of the rows, and rows
  set back to back (bench desking). Each figure left out is Grid's own and the answer says so.
- It writes the modules as one group: their ids are the group's name and a number (`desk-1` …
  `desk-48`; a set's items `cafe-3-1`, `cafe-3-2` …), so the group reads as one in every answer,
  and `replace` fills the room again at another pitch in one call, taking the group's old items out.
- It answers how many fit (and against the number asked for, how many short), how they are set
  out (rows, modules per row, the turn), the floor each module has (room area ÷ count), what is
  left over along the rows and beyond the last row, and how many places were given up to a door,
  a column, an item already there, the room's shape or Grid's own checks.
- `dry_run` gives the count and the set-out only, and writes nothing.
- Grid's library holds two sets for cafés and meeting tables: a table for four and a table for six,
  each with its chairs.

## Design

- `packages/cli/src/edit/fill.ts` (new): `fillRoom(survey, library, request)`, pure. The module's
  footprint is `libraryFootprint` (an item with the clear floor it keeps in front, or a typical
  set's size). In a frame turned by the rows' turn, a lattice is laid over the room's inside
  outline (the survey's polygon and holes, turned into the frame): modules `pitch` apart along a
  row, rows a module deep (two, back to back) plus the aisle apart. A spot is kept when its
  module, grown by the wall clearance, lies inside the outline (`rectInsidePolygon`), and it
  stands clear of each door's keep-clear floor (the doorway's width, out from both faces by the
  door clearance), each column and each item already on the floor with the floor it keeps clear.
  The lattice is tried at the near edge, the middle and the far edge of the slack in both
  directions, and with no turn given at 0°, 90°, 180° and 270° and square to the room's longest
  side; the arrangement that fits most is kept, the first in that order on a tie. Each module is
  placed with `placeFromLibrary`, so its records are the ones `grid_place_item` writes. The plan
  as it will be read is then checked with `validatePlan`, and a module any fit check names (a
  wall, a doorway, a window, the room's height, another item) is taken out, until none is named;
  the answer counts those too.
- `edit/edits.ts`: `removeItems` in the patch, for `replace`, kept out of the file by
  `applyPatch`. The ids of the group must be free; a taken one is refused naming its holder,
  unless `replace` takes it out.
- `packages/cli/src/mcp/editTools.ts`: the tool, after `grid_place_item`, through `writeChange`
  like every change; `dry_run` reads the plan, works out the same fill and writes nothing. Its
  output schema needs only the fill's own fields, so a dry run's answer fits it.
- `packages/floorplan/src/library/builtIn.ts`: two typical sets, `table-4-chairs` and
  `table-6-chairs`, the built-in table and chairs, chairs pulled out from the table's long sides.
  Grid's own set-out, no document's.
- Figures left out, Grid's own and said as such: the pitch is the module's width (modules side by
  side), the aisle 0.9 m (the same 0.9 m Grid uses for a way through), 0 m from the walls and
  1.2 m clear in front of a door.
- No new convention in `types/floorplan.ts`: a group is the ids it gives, not a new field.
- Docs: `docs/tool-server.md`'s table row and `docs/library.md`'s section on filling.

## Done

- `packages/cli/src/edit/__tests__/fill.test.ts`: a 10 × 6 m room filled with desks gives the
  count worked out by hand at the stated pitch and aisle, with back-to-back rows, with a wall
  clearance, turned; a door's keep-clear floor and a column take their places out; a zone is
  filled inside its own outline; a set (table and chairs) is placed as one module; `count` stops
  at the number asked and says how many short; the ids are the group's; every module placed is
  clear of Grid's fit checks.
- `packages/cli/src/mcp/__tests__/fillRoom.test.ts`: through the tool server, a dry run writes
  nothing and gives the count; the fill writes the group; `replace` fills again at another pitch
  and leaves no old item; a taken id is refused with nothing written; the answers fit the output
  schema.
- `tools.test.ts` with the new order and count, `server.test.ts`'s count, the library test's list
  of typical rooms, `ownWords.test.ts`'s counts.
- `npm run typecheck`, `npm run lint`, the cli and floorplan test folders, `npm run scoreboard`
  no worse.
