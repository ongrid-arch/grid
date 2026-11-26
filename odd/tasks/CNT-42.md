# CNT-42: furniture kinds, a starter catalogue, and furniture in 3D

## Outcome

An agent or a person furnishing a plan can place the furniture of an ordinary home, office or
restaurant as items, in the same shape as fixtures (`kind`, `at`, `size`, `height`, `turn`), by
kind or by a library name Grid sizes: a sofa, an armchair, a coffee table and a dining table, a
chair, a stool, a single, double and king bed, a bedside table, a wardrobe, a desk, a rug, a TV
unit and a plant. Each is counted by its own kind (so desks and seats can be counted, and a
wardrobe is never stored as something else), drawn with its own plain symbol in plan, raised as
a simple solid in the 3D view, the stills and eye views, the GLB and the OBJ, written to the DXF
as a block and to the IFC as a furnishing element, and checked as fixtures are: in a room, not in
a wall, not over its room's height, not standing in another item, and its clear floor kept clear.
A rug lies on the floor: furniture may stand on it, and it blocks no one's clear floor or doorway.

## Design

What already exists (CNT-20): the kinds registry (`geometry/itemKinds.ts`) with five furniture
kinds (`bed`, `table`, `chair`, `sofa`, `storage`), their plan symbols, the DXF blocks, the IFC
furnishing elements, the counts and every item check; and a built-in library with single and
double beds, a side table, a desk and dining tables (as `table`), a chair and an armchair (as
`chair`), two sofas, a wardrobe and drawers. What is missing, and built here:

- Five more of Grid's own furniture kinds, each one entry of the registry: `armchair`, `stool`,
  `desk`, `rug` and `plant`, added to `FURNITURE_KINDS` (a list, not a new convention), with their
  words in `messages/en.ts` and `es.ts`. A desk and an armchair are counted apart from tables and
  chairs, because a fit-out counts desks and a lounge counts its armchairs; a stool has no back; a
  rug and a plant are neither a table nor storage. Coffee, dining and bedside tables stay `table`
  and a wardrobe and TV unit stay `storage`, told apart by their library entry and label, so the
  list of kinds stays short.
- The built-in `armchair` and `desk` entries move to their own kinds. Nothing has been released,
  so no plan read by a released version changes.
- New built-in entries, Grid's own sizes: `coffee-table`, `bedside-table`, `stool`, `bar-stool`,
  `king-bed`, `tv-unit`, `desk-1400`, `rug`, `rug-large` and `plant`.
- `underfoot` on a kind (the rug's): it lies flat on the floor, so the overlap check, another
  item's clear floor, a fixture's space (`use.ts`), the doorway check and the doorways a route
  finds closed (`rules/graph.ts`, one filter) pass over it. `grid_measure what=fit` still keeps a
  box clear of it, as of every item in the room.
- `solid` on a kind: the blocks it is raised as in 3D, from its own pen and height; unstated, its
  footprint from the floor to its height. A table and a desk are a top on four legs, a chair a
  seat and a back, an armchair and a sofa a seat with a back and arms, a plant a pot and leaves, a
  shower its tray. `itemSolid` (items.ts) gives an item's blocks.
- `buildScene` gives each sound item on the floor (`SceneItem`), raised from its room's floor;
  `itemMesh` writes it, and the GLB and OBJ name each `item_<id>`; the viewer's `Item3D` draws it
  in its storey (cut at the cutaway's height), so the 3D view and every still and eye view show
  it. The scene memo's key takes the items, so a moved chair redraws.

Decisions a person may want to look at: which things are kinds and which are library entries;
the rug's `underfoot` exemption; the 3D forms are plain blocks, Grid's own way of drawing.

## Done

- `itemKinds.test.ts`: the new kinds in the registry, in order, each drawn inside its footprint
  and raised inside it in 3D, below its height.
- `items.test.ts` / `itemClashes.test.ts`: a sofa on a rug is no overlap; a rug in a clear floor
  blocks nothing; a wardrobe in a bed's clear floor still does; a desk is counted as a desk.
- `library.test.ts`: every card entry is there with its kind, and the typical rooms still fit.
- Scene and exports: a plan with a sofa, a table and a plant gives `SceneItem`s, `item_` objects
  in the OBJ and the GLB; the viewer's storey draws them.
- `npm run typecheck`, `npm run lint`, the floorplan, viewer and cli test folders, the own-words
  and contract tests, and `npm run scoreboard` no worse.
