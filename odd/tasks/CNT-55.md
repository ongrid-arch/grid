# CNT-55: sanitary and kitchen kinds, an item's height above the floor, and symbols by height

## Outcome

An agent drawing a bathroom, a kitchen or a restaurant kitchen places what is really there, at
the height it is really at, and sees it drawn, checked and exported as what it is:

- Grid holds sanitary kinds of its own: `bidet`, `urinal`, `vanity` (a basin in a counter),
  `double-basin`, `towel-radiator` and `shower-screen`; and kitchen kinds: `sink`, `hob`, `oven`,
  `fridge` (a fridge-freezer is a tall one), `tall-unit` and `wall-unit`, and commercial kitchen
  pieces: `range`, `fryer`, `prep-table`, `dishwasher` and `hood`. Each has a plain symbol of its
  own and an entry of its own name in Grid's library.
- A kind may be written in plain words, as a room's use may: `WC`, `loo` and `lavatory` are a
  toilet, `tub` a bath, `washbasin` a basin, `fridge-freezer` a fridge, `cooker` an oven, in any
  capitals, in the plan file, in an item line and in `grid_add_item`. A word that is none is
  said with the kind it most likely means (`item/unknown-kind`, "did you mean").
- An item may state `elevation`: metres from the floor to its underside. A wall cabinet is
  `wall-unit` 1.45 m up and 0.72 m tall; a wall-hung WC floats 0.2 m up. Its `height` is then its
  own, underside to top. The 3D view, the stills, the section, the GLB, the OBJ and the IFC raise
  it to that height; the library's `wall-unit`, `hood` and `wall-hung-wc` carry one.
- The checks read it: an item over another stands in it only when their heights meet (a wall unit
  over a kitchen run is not in its way); an item high above the floor (its underside at 1 m or
  more) takes no floor and keeps clear no one's floor; an item is too tall when its top, not its
  height, passes the room's. A sink or a hob is set into a worktop, so it stands in no worktop.
- The drawing shows height: an item above the plan's cut is drawn dashed, with no fill, over what
  stands under it, in the screen's pictures, on paper and in the DXF (a dashed layer of its own,
  `GRID-FIXTURES-ABOVE`). A commercial kitchen piece is drawn with its label inside it, in the
  plan and in the DXF.
- The IFC writes the sanitary kinds (toilet, basin, shower, bath, bidet, urinal, vanity, double
  basin, sink, clinical sink) as flow terminals with a sanitary terminal type, and a towel
  radiator as a flow terminal with a space heater type; every other kind stays a furnishing
  element.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `SANITARY_KINDS` and `KITCHEN_KINDS`, in
  `ITEM_KINDS` after the equipment and before the points; `ITEM_KIND_WORDS` (plain words) read
  by `readItemKind` in the item schema as `readUse` reads a use; `elevation` on an item and a
  library entry, and in `LIBRARY_VALUES`, so an entry fills it. These widen C6 and C30, which
  already define an item's kinds, figures and library: no new convention number.
- `packages/floorplan/src/geometry/fittingKinds.ts` (new): the kinds' entries of the kinds
  registry, symbols and solids in shares of their footprint. `itemKinds.ts` gains `inset` (set
  into a worktop), `labelled` (its label drawn inside it) and `ifc` (the flow terminal type) on a
  kind, and `itemElevation`, `itemTop` and `isRaised`.
- `packages/floorplan/src/geometry/items.ts`: `itemSolid` lifts the blocks by the elevation; the
  checks read the elevation as above; `item/unknown-kind` says the likely kind.
- `packages/floorplan/src/geometry/tolerances.ts` and `docs/tolerances.md`: `itemRaised`, the
  height of an item's underside from which it is above the cut (1 m).
- `packages/floorplan/src/geometry/floorplan.ts`: a drawn item carries `raised` and `labelled`.
- Exports: `dxf.ts` inserts a raised item on the new `fixtures-above` category (dashed) and writes
  a labelled item's label at its middle; `ifc.ts` lifts an item by its elevation and writes the
  sanitary kinds as `IFCFLOWTERMINAL` with their type.
- `packages/viewer/src/picture/scene.ts`: a raised item dashed and unfilled, drawn after the
  others; a labelled item's label.
- `packages/floorplan/src/rooms/items.ts`: `above <m>` in an item line, written back; a plain
  word placed as its kind.
- `packages/floorplan/src/library/builtIn.ts`: one entry per new kind, and `wall-hung-wc`.
- `packages/cli/src/mcp/itemTools.ts`, `edit/items.ts`: `elevation` on `grid_add_item`, the new
  kinds named, the receipt says the height above the floor.
- Messages in `en.ts` and `es.ts`; docs in `docs/library.md`, `docs/plan-file.md`,
  `docs/rooms-first.md`.

Decisions:

- `elevation` and not a new name: it is what an agent reaches for, and a plan that stated it was
  refused before; it means the underside, never the top. `height` stays the item's own height,
  so an item that states no elevation reads exactly as before.
- One height decides "above the cut" for the drawing and for the floor checks (1 m): what is
  drawn dashed is what a person walks under or works under.
- A plain word is read as its kind and written back as the kind, as a use's is; a kind the
  registry holds is never read as another.
- Commercial pieces carry their label in the drawing because their symbols alone do not tell a
  fryer from a range at 1:100.
- Shower screens, sinks and hobs are `inset`: they stand on or in another item by design.

## Done

- `packages/floorplan/src/geometry/__tests__/fittings.test.ts`: every new kind draws and is
  raised in 3D; plain words read as kinds; a wrong word says the likely kind; a wall unit over a
  kitchen run is no overlap and takes no floor, a raised item too tall by its top; a sink in a
  run is no overlap; the solid is lifted.
- Library, DXF (dashed layer, label text), IFC (flow terminal, type, lifted placement) and the
  viewer (dashed raised item, label) tests; rooms text `above` round trip; `grid_add_item` with
  `name=WC` and `elevation`.
- The existing kind lists in tests updated to the new kinds.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the changed folders, the
  tolerances test, `ownWords.test.ts`, `contract.test.ts` and `npm run scoreboard`.
