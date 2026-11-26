# CNT-45: write, place, move and remove fixtures and furniture through rooms text and tools

## Outcome

An agent can put the plan's fixtures and furniture where a person asks, change them and take
them out, without editing `plan.json` by hand, and sees them wherever it looks:

- Rooms text takes an item in a line of its own, against a side of a room with its turn worked
  out: `item bath "Bath 1700" bath 1.7 x 0.7 in fam against north, at west`, or at a point:
  `item t1 dining-table-4 at 3.2,4 turn 90`. The word after the id (and label) is a library entry
  (the plan's own, else Grid's) or a kind. `full width` makes a built-in wardrobe or cupboard the
  length of that side of the room. `raw item {...}` (also `raw fixture`, `raw furniture`) takes
  Grid's own JSON for an item.
- `grid describe --as rooms` writes every item back as an item line (against its side when the
  words give back its own place, at its point otherwise, raw when neither can), so writing the
  text again keeps it; the text's item lines replace the file's, and a text that writes none
  keeps the file's, as before.
- `grid_add_item`, `grid_move_item` and `grid_remove_item` add one by the same words, move or turn
  one (against another side, into another room, to a point, or by a distance), and take items
  out by id. Each answer names the room it stands in and what Grid's checks say of it.
- An item against a wall moves with that wall: a room side moved, a wall made thicker, a plan
  stretched, or the plan written again from rooms text, so the fixtures stay against their walls.
- Every change's answer counts the notes on fixtures and furniture before and after, so an answer
  never says problems went down because an item was left behind.
- Fixtures and furniture are a kind in `grid_fields`, `grid_find` and `grid_count`; `grid_view`
  lists each item with its box; `grid_schedule of=fixtures` gives one row per kind and size.
- A phone scan brings in its sofa, table, bed, storage and appliances as items (obstacles), not
  only the toilet and the bath, and records whether each scanned door was seen open.

## Design

- `packages/floorplan/src/rooms/items.ts` (new): the one reading of an item's words, for rooms
  text and the tools alike. `itemOfWords` reads the line; `placeItem(plan, words)` finds the
  room and the side (the edge of the room's inside outline whose outward normal is nearest the
  side named, the furthest out of those), lays the item's back on it, works out its turn
  (unturned, an item's back faces -y: against south 0, east 90, north 180, west 270), and places
  it along the side (centred, `at <end>`, `<n> from <end>`, or `full width`). A library name or a
  kind with no size is the library entry; a kind with a size and no height takes the height of
  Grid's first entry of that kind, said as a guess. `itemLines(plan)` writes the read-back and
  checks each line by placing it again. `ItemLines` reads the lines as they come and places them
  once the rooms are drawn, as the stairs do. `itemsFollowWalls(before, after)` moves each item
  whose back (and side, in a corner) stands against a wall's face by as far as that face moved.
- `rooms/compile.ts`, `rooms/read.ts`, `rooms/index.ts`: the hook lines only (the line word, the
  raw kinds, one emit call, the read-back lines, the export).
- `packages/cli/src/edit/items.ts` (new): `addItem`, `moveItem`, `removeItems`, each a `Patch`
  (`addItems`, `items` and a new `removeItems` set in `edits.ts`'s patch and `applyPatch`).
- `packages/cli/src/mcp/itemTools.ts` (new): the three tools through `writeChange`, registered in
  `serveTools.ts` by one line after the stair tools.
- `mcp/writeTools.ts` (`writeChange`): every patch gets its items moved with their walls
  (`itemsFollowWalls`) for the items it does not move itself, said in the answer, and the
  answer counts the item notes before and after. `command/write.ts`: kept items follow their
  walls by id, and the text's item lines replace the file's.
- `quantities/query.ts` (`item` kind), `draw/views.ts` or the view tool (each item's box),
  `quantities/schedule.ts` and the schedule tool (`of=fixtures`).
- `scan/toPlan.ts`: more scan categories become items (`SCAN_FIXTURES`), labelled with what the
  scan called them; a scanned door's open state is kept as a fact (`properties.scannedOpen`).
- No new convention and no new message code: the rooms codes are the compiler's own
  (`rooms/item`). Sentences are counted in `ownWords.test.ts`.

## Done

- `packages/floorplan/src/rooms/__tests__/items.test.ts`: item lines against each side, at an
  end, from an end, full width, at a point, by kind and by library name; refusals; `raw item`;
  the read-back writes every item again unchanged; items follow a moved wall.
- `packages/cli/src/mcp/__tests__/itemTools.test.ts`: add, move and remove, refusals with
  nothing written, a room side moved carries its bath, `grid_write_rooms` with item lines.
- Query, view, schedule and scan tests for the kinds, boxes, rows and objects.
- `tools.test.ts`, `server.test.ts`, `everyPath.e2e.test.ts`, `ownWords.test.ts`,
  `tolerances.test.ts` updated.
- `npm run build`, `npm run typecheck`, `npm run lint`, the floorplan and cli test folders and
  `npm run scoreboard` (no count worse).
