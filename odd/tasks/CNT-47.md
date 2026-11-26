# CNT-47: equipment items, laid out in rows, with clear floor kept on any side

## Outcome

An agent drawing a data hall, a cinema, a church, a plant room, a lab or a clinic places the
things in it as items, never as walls or rooms, and sees them counted, drawn and checked:

- Grid holds kinds of equipment of its own: a rack, a generator, a pump, a tank, a fixed seat, a
  pew, an altar, a fume cupboard, a lab bench, a safety shower, a kennel, an exam table and a
  clinical sink, each with a plain symbol in 2D, a solid in 3D and a size in Grid's library
  (`rack`, `pew`, `fume-cupboard`...). Any other thing is `equipment`, a plain box given its own
  size, height and label (`item ups "UPS" equipment 1.2 x 0.8 1.9 high at 4,2`).
- Every kind of equipment is a fixture: it takes the floor it stands on from its room's free
  floor, `grid_count` counts it by its kind, and it is exported as an item, never as a wall.
- A `row` line lays one item out many times: `row r rack in hall against north, repeat 20
  every 0.6, 10 rows every 2.4` writes 200 racks, `r-1-1` to `r-10-20`, the first row against the
  north wall, the row centred on it unless placed at or from an end, each further row in front of
  the last (or `behind` it, for a row placed at a point). `grid describe --as rooms` writes such
  a run of items back as its row line, so 1,800 seats are one line, not 1,800.
- `grid_add_item` takes `repeat`, `every`, `rows`, `row_every` and `behind`, so a tool call lays
  out the same rows.
- An item keeps clear floor on any side: `clearance` in front, as before, and now `clearSides`
  behind it and at its left and right (`clear back 0.6`, `clear left 0.9` in an item line,
  `clear_back`, `clear_left`, `clear_right` in the tools). Grid's check says when a wall or
  another item stands in any of them (`item/clearance-blocked`, as for the front).

## Design

- `packages/floorplan/src/types/floorplan.ts`: `EQUIPMENT_KINDS`, added to `ITEM_KINDS` after the
  furniture, and `clearSides` on an item (back, left, right, metres). Both sit under C6 and C30,
  which already define kinds and clear floor: no new convention.
- `packages/floorplan/src/geometry/equipmentKinds.ts` (new): the equipment kinds' entries of the
  kinds registry (symbol, solid, `sides: false` where things stand side by side), spread into
  `ITEM_KIND_DEFINITIONS` by one line in `itemKinds.ts`.
- `packages/floorplan/src/library/builtIn.ts`: one built-in entry per kind but `equipment`, Grid's
  own plain sizes. `equipment` has no entry, so it is always given its size and height.
- `packages/floorplan/src/geometry/items.ts`: `itemClearanceZones` gives each side's zone;
  the clearance check reads all of them, worded by side.
- `packages/floorplan/src/rooms/items.ts`: `clear <side> <m>` in item words, `clearSides` in the
  record, the read-back and the same-place test; `ItemLines` takes an entry that places many
  items (`many`), so a row line is read in order with the item lines and its ids checked with
  theirs.
- `packages/floorplan/src/rooms/rows.ts` (new): the `row` line (`rowOfWords`), its layout
  (`layRow`: the first item placed by `placeItem`, the others stepped along its back and to its
  front), and the read-back (`itemAndRowLines`), which finds runs of items whose ids, places and
  figures are exactly a row's and writes each run as one row line at its first item's point.
- `rooms/compile.ts`, `rooms/read.ts`, `rooms/index.ts`: the hook lines only.
- `packages/cli/src/edit/items.ts` and `mcp/itemTools.ts`: the row and side-clearance arguments of
  `grid_add_item`. No new tool. `mcp/roomsGrammar.ts`: the row line and the new kinds.
- Messages: each new kind's names, counts and what an agent is told, in `en.ts` and `es.ts`; the
  side wordings of `item/clearance-blocked`. No new message code.
- A row is capped at the plan's part limit (`PARTS_MAX`), so no new tolerance.

## Done

- `packages/floorplan/src/rooms/__tests__/rows.test.ts`: a row against a side and at a point,
  several rows, `behind`, refusals (no count, overlapping pitch, too many), ids, and the
  read-back writing a row line that compiles to the same items.
- `packages/floorplan/src/geometry/__tests__/equipment.test.ts`: every equipment kind draws,
  raises a solid, has a library size, takes floor; side clearances are checked.
- `packages/cli/src/mcp/__tests__/itemTools.test.ts`: `grid_add_item` with rows and side
  clearances; `grid_count` counts the racks.
- Existing kinds, library, tools and words tests updated.
- `npm run build`, `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, the
  words and contract tests, and `npm run scoreboard` (no count worse).
