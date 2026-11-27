# CNT-52: point assets, a fire and wayfinding set, and tags in the key

## Outcome

An agent drawing a facility manager's asset plan, an evacuation map or a game level places the
things that stand at a point (an extinguisher, a defibrillator, a camera, a spawn point) as items
of the plan, never as notes drawn by hand, and sees them drawn, keyed, counted, listed and
exported:

- Grid holds point kinds of its own: `extinguisher`, `aed`, `call-point`, `first-aid`, `sensor`,
  `desk-point`, `spawn` and `camera`, and a fire and wayfinding set, `you-are-here`, `hose-reel`,
  `fire-door`, `exit`, `refuge` and `assembly-point` (the call point is in both). Each has a plain
  symbol of its own and a size in Grid's library (`extinguisher`, `aed`...), so
  `grid_add_item name=extinguisher x=2 y=3` and `item fe1 extinguisher at 2,3` place one.
- A point is an item of the group `point`: it stands at `at` on its `floor`, takes no floor, and
  none of the checks on where a fixture stands apply to it (in no room, into a wall, past its
  room, standing in another item, in another's clear floor). An assembly point outside or a
  call point on a wall is said nothing of.
- Every item may carry facts of the person's own in `properties`, as walls, openings, rooms and
  floors do: an extinguisher's type and service date, a sensor's id. `grid_add_item` takes them
  as `facts`; `grid_fields`, `grid_find` and `grid_count` ask of them, with `point` as a kind of
  part of its own (`grid_count kind=point by="item kind"`).
- `grid_schedule of=items` lists every item: its kind, label, floor, room, place and facts, and
  the count of each kind.
- A drawing that shows a point keys it: one entry per point kind shown, its symbol as the
  swatch. A tag with words is listed in the key by its number, so a tag reaches the key; the
  notes band keeps the notes.
- The DXF already writes one block per kind, so every point kind has its block; the facts of an
  item go on the facts layer at its middle. The IFC writes an item's facts in Grid's property set.
  The GLB and OBJ raise a point as a small block at its height.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `POINT_KINDS`, added to `ITEM_KINDS` after the
  equipment, and `properties` on an item (Facts). Both widen C6, C9 and C30, which already define
  kinds and facts: no new convention number.
- `packages/floorplan/src/types/facts.ts`: `items.properties` in `FACT_FIELDS`; the sheet's
  coverage places it with the other facts.
- `packages/floorplan/src/geometry/pointKinds.ts` (new): the point kinds' entries of the kinds
  registry, group `point`, symbols in shares of their footprint, a solid at the top of their
  height. `itemKinds.ts` adds the group and `isPointKind`.
- `packages/floorplan/src/geometry/items.ts`: the place checks skip points, and no item is said
  to stand in a point.
- `packages/floorplan/src/library/builtIn.ts`: one entry per point kind, Grid's own plain sizes
  of the symbol on the plan and the height it is shown at.
- `packages/floorplan/src/messages/en.ts`, `es.ts`: each kind's words, `kind.about`, the key's
  entry per point kind and the tag entry; the unknown-kind sentence names the points.
- `packages/floorplan/src/rooms/items.ts`: an item with facts reads back as its raw line, so the
  reading loses nothing.
- Exports: `dxf.ts` writes items' facts; `ifc.ts` notes them for its facts set. The GLB writer
  and its scene are not touched: a point goes in through its solid, as every item does.
- `packages/viewer/src/picture/writing.ts` and `planSvg.ts`: the key's point entries and tag
  entries, drawn from the item's own block; the notes band numbers stay as they were.
- `packages/cli/src/quantities/query.ts`: `point` as a part kind, item facts read;
  `packages/cli/src/mcp/readTools.ts`: `grid_schedule of=items`; `itemTools.ts`: `facts` on
  `grid_add_item` and the point kinds named in its description; `edit/items.ts` writes them.
- Docs: `docs/plan-file.md` and `docs/library.md`.

Decisions: a point is an item, not a new top-level part, so every reader of items (the drawing,
the exports, the counts, the moves and removals) takes it without a new convention. Its `size`
is the size its symbol is drawn at and `height` the height it is mounted at; both come from the
library unless given. A desk position is `desk-point`, as `desk` is the furniture. GLB nodes
with no mesh for a point are left for the GLB writer's own change.

## Done

- `packages/floorplan/src/geometry/__tests__/points.test.ts`: every point kind has a symbol, a
  library entry and its words; a point outside the rooms or on a wall raises no place warning;
  facts on an item parse and reach the DXF and the IFC; the read-back keeps them.
- `packages/viewer/src/picture/__tests__/`: a plan with points and a tag keys both.
- `packages/cli/src/mcp/__tests__/`: `grid_add_item` places an extinguisher with facts;
  `grid_count kind=point` counts it; `grid_schedule of=items` lists it.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders touched,
  `ownWords.test.ts` and the contract test.
