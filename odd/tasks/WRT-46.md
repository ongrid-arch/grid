# WRT-46: say which items a rewrite kept, and name what holds a taken id

## Outcome

Rooms text holds no fixtures or furniture, so writing a plan again from rooms text keeps the
plan's items where they stood, as the file has them. Today it does so without a word, and an
agent can take the beds for cleared, place them again under the same ids and be refused with
"taken by another part of the plan", which names neither the part nor where it is.

When this is done:

- `grid write` and `grid_write_rooms` written over a plan that holds items say so: how many were
  kept, each one by kind and id with the room it now stands in (or that it stands in no room), and
  that rooms text never clears them. The tool's answer carries them as `items`, each with its id,
  kind, place, floor, room and anything worth a look.
- A kept item that now runs into a wall, or stands in no room, because the walls moved under it, is
  named at once with the check's own sentence ("Worth a look: …"), as `grid_place_item` does.
- The count "Problems in the drawing: before → after" counts the plan as written, items and all, so
  a bed the new walls cut through is in the count after as it was in the count before.
- A refusal of a taken id (`grid_place_item`'s `id`, `grid_add_room`'s and `grid_split_room`'s
  new ids) names the part that holds it and where it is: `bed "bed-1" at (1.20, 2.40) in room
  "Bedroom"`, a room by its name and floor, a wall by its ends, an opening by its wall.
- `grid_add_room` and `grid_split_room` take an item's or a column's id as taken too, so they never
  write a room that shares its id with a bed.

## Design

- `packages/cli/src/command/write.ts`: after the file is written, the plan as written is read
  (`safeParseFloorPlan(next)`, which fills each item from its library entry) and checked once. Its
  items, if the plan before held any, are listed (at most ten by name, then a count) with
  `itemRoom`; the item checks `item/into-wall` and `item/outside-rooms` on them become "Worth a
  look" lines. The same checking gives `drawingProblems.after`, which used to leave the file's
  items, columns and other kept parts out. `WriteDone` gains `items`.
- `packages/cli/src/mcp/writeTools.ts`: `grid_write_rooms` answers `items` (an empty list for a
  scan or a plan with none) and its output schema says so.
- `packages/cli/src/edit/holder.ts` (new): `idHolder(plan, id)`, the part that holds an id and
  where, for a refusal. `usedIds` (`edit/merge.ts`) takes items and columns too.
  `edit/place.ts` checks a stated `id` against the plan before the library does and refuses with
  the holder; `edit/addRoom.ts` and `edit/split.ts` name the holder in their refusals.
- The sentences are new keys in `packages/floorplan/src/messages/en.ts` (`write.items.*`,
  `edit.idTaken.*`), with a draft Spanish wording in `es.ts`, as every sentence Grid writes goes
  there. That is the one edit outside the card's area; `rooms/compile.ts` and `rooms/read.ts` are
  untouched.
- No new message code, and no new convention in `types/floorplan.ts`: the schema is unchanged.

## Done

- `packages/cli/src/command/__tests__/writeItems.test.ts`: a plan with three beds written again
  from rooms text says it kept the three, names each with its room, names the one the new walls
  run into with the check's sentence, counts it in the problems after, and the tool answers the
  same in `items`; a plan with no items says nothing of them.
- `packages/cli/src/mcp/__tests__/library.test.ts`: `grid_place_item` with an id a bed holds is
  refused naming the bed, its place and its room; `grid_add_room` with that id is refused naming
  the bed.
- `npm run typecheck`, `npm run lint`, the test folders of `packages/cli` and `packages/floorplan`,
  `ownWords.test.ts`, `tolerances.test.ts` and `npm run scoreboard`, no count worse.
