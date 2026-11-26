# CNT-48: fixtures in every 3D picture, section and export, and a room's usual fixtures in one call

## Outcome

Every fixture and piece of furniture the plan holds reaches every 3D picture and every file a
person hands on, or the answer says which did not:

- A section through a kitchen cuts the island it crosses and shows the run beyond it, as plain
  blocks, the same blocks the 3D view, the stills, the eye views, the GLB and the OBJ stand them
  up as (`itemSolid`). A fixture is cut in its own lighter way, never as part of the walls' and
  slabs' solid cut, so it never reads as structure.
- The GLB and the OBJ hold one object per item, named `item_<id>`, on every floor; an item Grid
  cannot draw is counted in the file's `leftOut` and named in its note, so a file never holds
  fewer items than it says without saying which. An item whose kind's blocks come out empty
  (a registered kind whose blocks all stand above the item's height) stands as its plain footprint box instead of vanishing.
- The 3D and eye answers of `grid_view` no longer say the model has no furniture: they say it
  stands fixtures and furniture as plain blocks, so an agent does not stop furnishing because it
  believes nothing reaches the picture or the headset.
- One call sets out a room's usual fixtures: `grid_add_item` with `name` a typical room
  (`kitchen`, `bathroom`, `shower-room`, `cloakroom`, or an office's own) and `room`, with no
  `against` and no `x`/`y`, places each of its items against a side of that room where it fits
  (no wall run into, no other item stood in, no door's swing or way through blocked, no clear
  floor taken), a smaller size of the same thing when the first does not fit, and says each one
  it could not place and why. Fixtures of a kind the room already holds are not added again.

## Design

- `packages/floorplan/src/geometry/section.ts`: `SectionPartKind` and `SectionFaceKind` gain
  `item`; `PlanSection` gains `items`, the items the line cuts, one part per item, each block's
  stretch on the line from its bottom to its top, raised by its room's floor offset and its
  storey's level. Each block's sides beyond the cut are faces of kind `item` in `beyond`, drawn in
  the same far-to-near order as the walls'. Items stay out of `parts` and `cut`, so the cut's
  solid shapes, the earth, `reach` and every figure read from them are unchanged.
- `packages/viewer/src/picture/section.ts`: the cut items over the cut, filled with paper and
  outlined in the light outline pen (`data-part="section-item"`).
- `packages/floorplan/src/geometry/items.ts`: `itemSolid` falls back to the footprint box when a
  kind's blocks are all cut away, so every item that passes the checks has a solid.
- `packages/floorplan/src/export/leftOut.ts`: an item that passes the checks but has no solid
  Grid can write is counted left out (no code), as a broken one is, so the note and `leftOut`
  match what the GLB and the OBJ hold. Tests hold a furnished two-floor house to every item in
  both files and `leftOut` empty, and a broken item to being named and absent.
- `packages/cli/src/mcp/readTools.ts`: the `grid_view` description and the 3D and eye answers say
  fixtures and furniture stand as plain blocks.
- `packages/floorplan/src/library/builtIn.ts`: two typical rooms of Grid's own, `kitchen` (a
  3.0 m kitchen run) and `shower-room` (a shower, a WC and a basin), beside `bathroom` and
  `cloakroom`.
- `packages/cli/src/edit/fixtureSets.ts` (new): `addFixtureSet(survey, library, request)`, a
  patch. For each item of the typical room, in its order: skip it when the room already holds an
  item of its kind; else try its entry, then the smaller entries of the same thing Grid keeps
  (`kitchen-run-3000` then `kitchen-run-2400`, `bath` then `bath-1500` then `shower-900`, and so
  on), against each side of the room, longest side first, in each corner and then centred,
  through `placeItem` (the same reading rooms text and `grid_add_item` use). The first place where
  Grid's fit checks (`FIT_CODES`) name nothing about it is kept, and the next item is tried with
  it in the plan. An item that fits nowhere is said with the note of its best try.
- `packages/cli/src/mcp/itemTools.ts` and `edit/items.ts`: `grid_add_item` sends a typical room's
  name given with `room` and no place to `addFixtureSet`; its answer adds `notPlaced`. No new
  tool, so the tool count stays as it is.

Decisions:
- One call is `grid_add_item` with a typical room, not a new tool: the tool count has a ceiling
  and `grid_add_item` already takes a room and answers with what it placed.
- The fit is Grid's own checks, not a layout rule: the set-out is a first place a person moves
  things from, said as such.

## Done

- `packages/floorplan/src/geometry/__tests__/sectionItems.test.ts`: a section through a kitchen
  cuts its island at the island's height and shows the run beyond; the cut solid is unchanged by
  the items; an item on a raised room's floor is cut from that floor.
- `packages/floorplan/src/export/__tests__/` (items in files): a furnished two-floor plan's GLB
  and OBJ hold `item_<id>` for every item with `leftOut` empty; a broken item is named in
  `leftOut` and absent from both.
- `packages/viewer` section picture test: a cut item is drawn as `section-item`.
- `packages/cli/src/mcp/__tests__/itemTools.test.ts`: `grid_add_item name=bathroom room=...`
  places a bath, a WC and a basin that fit; a small room gets a shower in place of the bath; a
  kitchen gets its run; a fixture the room has is not added again; a room too small says what it
  could not place.
- `grid_view` answers checked for the new words.
- `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan`, `packages/viewer`,
  `packages/cli` (with the excludes), `ownWords.test.ts`, `contract.test.ts`, and
  `npm run scoreboard` no worse.
