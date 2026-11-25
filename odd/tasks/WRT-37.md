# WRT-37: wall ids stay put when a building is added elsewhere

## Outcome

Rooms text names the walls it works out (`ext-south`, `w-x12.5`, `w-angled`) and opening
patterns, kept in the plan file, name their walls by those ids. Today two walls with the same
name on one floor are numbered by place (`ext-south-1`, `ext-south-2`), so adding a detached
building, a pump house beside a shed, renames the shed's south wall, and a pattern on it places
nothing. When this is done:

- Adding a building that shares no wall with the ones already written (a detached room, or a
  group of rooms) leaves every wall id of the other buildings as it was.
- The building whose room comes first in the text keeps the names it has today, so a plan of one
  building writes the very same ids as before.
- Each other building's walls that name no room of their own carry the id of its first room:
  `ext-pump-south`, `w-pump-x12.5`, `w-pump-angled`. Walls that already name a room
  (`w-a-b`, `w-a-south`, `open-a-b`) are as before.
- Reading a plan back as rooms text (`read.ts`) still writes it again with the same ids: it
  states an id only where the writing would give another, as it does now.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `nameWalls`: before naming, group the floor's rooms
  into buildings: two rooms are in one building when one wall (any of its stretches) borders
  both. A building is known by its room that comes first in the text (`fl.rooms` keeps the text's
  order). The building of the floor's first room is unmarked; every other building's mark is its
  first room's id, put after the kind of wall (`ext-`, `w-`) in the names that do not already
  name a room. Numbering of names that are still the same (a stepped front with two south walls)
  stays as it is, now within a building, because the names differ between buildings.
- Why per building and not "the first wall keeps the bare name": the second would rename every
  numbered wall of plans written before (`ext-north-1` would become `ext-north`) and break the
  rooms texts and patterns that name them. Per building changes ids only on floors with more
  than one building, where they were already unstable.
- The header comment of `compile.ts` says how walls are named in the plan file's terms; the docs
  page `docs/rooms-first.md` gets the rule.
- Out of scope: a room added to the same building can still renumber that building's walls of one
  name; a building added before the first one in the text takes the plain names.

## Done

- A test in `packages/floorplan/src/rooms/__tests__/wallIds.test.ts`: a shed alone, then the same
  shed with a detached pump house after it, keeps every one of the shed's wall ids; the pump
  house's walls carry its id; a pattern on the shed's south wall places the same openings in both.
  It fails before the change (the shed's `ext-south` becomes `ext-south-1`).
- The lab's buildings (`buildings.test.ts`) and every rooms test pass unchanged.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `tolerances.test.ts` and `npm run scoreboard`.
