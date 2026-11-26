# CNT-43: child-size fixtures and cots, and an item placed at its own size

## Outcome

An agent fitting out a nursery, a vet's practice or a coworking floor can place what it needs in
one call each. Grid's library holds child-size things by name: a child's WC and a low basin, a
cot and a low nap cot, a changing table, and a coat rail at adult and at child height, each at
Grid's own plain size. `grid_place_item` (`grid edit place`) also takes the item's own `width`,
`depth`, `height`, `clearance` and `label`, so a 1.40 × 0.70 m desk or a WC at 0.35 m high is
placed from the nearest entry with its own figures, and a thing the library has no entry for (a
1.2 × 0.9 m kennel, an exam table) is placed by its kind with its size. Nobody has to write a
library file to place an odd size.

## Design

- `packages/floorplan/src/library/builtIn.ts`: new entries, each a new name, so no released
  name changes size: `wc-child` (toilet), `basin-low` (basin), `cot` and `nap-cot` (bed),
  `changing-table` (table), `coat-rail` and `coat-rail-low` (storage). No new kind: a cot is a
  bed and a coat rail storage, told apart by name and label, as CNT-42 did for tables.
- `packages/floorplan/src/library/index.ts`: `placeFromLibrary` takes `own` figures (size,
  height, clearance, label) and writes them on the item beside its `library` name. The item's
  own values are kept by `withLibrary` already (C30), so the entry fills only the rest and no
  new convention is needed. When the name is no library entry but is a kind Grid holds, the item
  is placed by its kind, and its width, depth and height are then required. A typical room takes
  no own figures (it is many items): refused, naming why.
- `packages/cli/src/edit/place.ts`: the answer says "at the size given" in place of the entry's
  source when the item's own figures were given, and names the kind for one placed by kind.
- `packages/cli/src/mcp/editTools.ts`: the five arguments on `grid_place_item`, lengths as the
  other lengths are; the description says a kind may be named with a size. `grid edit place`
  takes them as options from the tool's own arguments.
- `docs/library.md` lists the new entries and the own figures.

## Done

- `packages/floorplan/src/library/__tests__/library.test.ts`: the new sizes are held in the
  released-sizes table; placing with own figures writes them and the reading keeps them; placing
  a kind needs a size; a typical room with own figures is refused.
- `packages/cli/src/mcp/__tests__/library.test.ts`: through the tool server, a desk at
  1.40 × 0.70 m from `desk`, a child's WC by name, and a kennel placed as `storage` with its size.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, the own-words test and
  `npm run scoreboard`.
