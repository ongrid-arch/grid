# CNT-61: many items in one call, and a house furnished in one call

## Outcome

An agent furnishing a plan no longer spends one call per piece of furniture:

- `grid_place_item` takes `items`, a list of entries, each with the same fields one call takes
  (`name`, `x`, `y`, and `turn`, `floor`, `id`, `width`, `depth`, `height`, `clearance`,
  `label`). They are placed in order, each id made unique against the ones before it, and
  written as one change; the answer names the room each landed in and what Grid's checks say of
  them, as for one. An entry that cannot be placed refuses the whole call, naming the entry by
  its place in the list, and nothing is written.
- `grid_furnish_rooms` sets out a typical room's set in each room named, or in every room whose
  use has a usual set and that holds no item yet: a bedroom takes `double-bedroom` (then
  `single-bedroom`), a bathroom `bathroom` (then `shower-room`), a toilet `cloakroom`, a kitchen
  `kitchen`, a living room the new `living-room` and a dining room the new `dining-room`.
  `sets` names another set for a room. Each set is first placed as it is drawn, its back against
  a side of the room (centred on it, then at each end), where Grid's fit checks name nothing; a
  set that fits nowhere as drawn is set out item by item against the room's sides, as
  `grid_add_item` does with a typical room (CNT-48). The answer says, room by room, which set
  went where, what was left out and why. A three-bedroom house is one call.
- The tool server's page says that calls sent together are applied one at a time, each on the
  plan the one before left, so an agent knows parallel calls are safe and that a list is fewer
  calls.

## Design

- `packages/cli/src/edit/place.ts`: `placeItems` takes one request or a list. The list is placed
  one entry after another through `placeFromLibrary`, the ids taken growing with each, and the
  plan is read and checked once with all of them, so the answer and its `placed`, `fits` and
  `worthALook` cover every entry.
- `packages/cli/src/mcp/editTools.ts`: `grid_place_item` gains `items` (an argument of type
  object whose schema is a list; each entry is checked by the same argument specs as the single
  call). `name`, `x` and `y` are needed unless `items` is given; giving both is refused.
- `packages/cli/src/mcp/toolkit.ts` (outside the items area, one line): an object argument whose
  schema is a list takes a list. `packages/cli/src/command/edit.ts` (one line): an object option
  on the command line is read as JSON, so `grid edit place --items '[...]'` works.
- `packages/cli/src/edit/furnish.ts` (new): the furnishing. For each room: the set named or its
  use's, the kinds the room already holds left out of it, then as drawn against each side (the
  longest first) at the centre and the two ends, turned so its back is on that side's inside
  face; the first place where the fit checks (`FIT_CODES` and `item/leaves-room`) name none of
  its items is kept, and the next room is tried with it in the plan. Else the next set of the
  use, and last the set's items one by one through `addFixtureSet` (CNT-48), which gains the
  items already added in the call so its ids and checks see them.
- `packages/cli/src/edit/fixtureSets.ts`: `addFixtureSet` takes the items added before it in the
  same call (optional), for its ids and its checks.
- `packages/cli/src/mcp/itemTools.ts`: the new tool `grid_furnish_rooms`, after
  `grid_remove_item`.
- `packages/floorplan/src/library/builtIn.ts`: two new typical rooms, `living-room` (a
  three-seat sofa, a coffee table, an armchair and a TV unit) and `dining-room` (a table for six
  and its chairs, with floor round it to pull the chairs out). New names, so no plan reads
  differently.
- Docs: `docs/library.md` (lists and furnishing), `docs/tool-server.md` (the table, and calls
  sent together), `AGENTS.md` (the tool count and the file). Fragment `changes/CNT-61.md`.

Decisions: furnishing is a tool of its own rather than another mode of `grid_place_item`, as it
names rooms, not points. A room left out of `rooms` that already holds items is not furnished, so
a second call does not furnish twice; a room named is furnished with the kinds it lacks. No new
tolerance: the set-out reads Grid's existing fit checks.

## Done

- `packages/cli/src/mcp/__tests__/placeList.test.ts`: a list of three items is one change with
  every id, ids made unique along the list; a bad entry refuses naming its place and writes
  nothing; `name` with `items` is refused.
- `packages/cli/src/mcp/__tests__/furnish.test.ts`: a three-bedroom house with a bathroom, a
  kitchen, a living room and a dining room furnished in one call: every room gets its set and
  `grid_check` names no fit problem; a room too small for its set falls back and says so;
  `sets` overrides; a second call furnishes nothing more.
- The built-in typical rooms test holds the two new rooms' items clear of each other.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders touched, the
  tolerances test, `ownWords.test.ts` and `contract.test.ts`.
