# 2026-11-26: more furniture kinds, a starter furniture library and items in 3D (CNT-42)

## For people

- A plan can be furnished: an armchair, a stool, a desk, a rug and a plant are kinds of item now,
  beside the bed, table, chair, sofa and storage, and the library has Grid's own sizes for a
  sofa, an armchair, a coffee, side, bedside and dining table, a chair, a stool and a bar stool,
  single, double and king beds, a wardrobe, drawers, a TV unit, two desks, two rugs and a plant.
  Desks, armchairs and stools are counted as themselves, so a fit-out counts its desks and a
  restaurant its seats.
- Every fixture and piece of furniture now stands in the 3D view, the stills and eye views, the
  OBJ and the GLB as a few plain blocks, on the floor of its room: a table on four legs, a sofa
  with its back and arms, a plant in its pot.
- A rug lies on the floor: a sofa or a table may stand on it, and it closes no doorway, narrows
  no way through and stands in no one's clear floor.

## For agents

- The kinds registry holds `armchair`, `stool`, `desk`, `rug` and `plant`, in that order after
  `storage`; `grid_schedule`'s `fixtureCounts` has a count for each. The built-in `desk` and
  `armchair` entries are of kinds `desk` and `armchair` now, no longer `table` and `chair`. New
  built-in entries: `king-bed`, `bedside-table`, `coffee-table`, `stool`, `bar-stool`, `tv-unit`,
  `desk-1400`, `rug`, `rug-large` and `plant`.
- A rug (`underfoot` on its kind in the registry) is left out of `item/overlap`,
  `item/clearance-blocked`, `item/blocks-doorway`, `item/blocks-window`, the doorways a route
  finds closed, and the obstacles of `grid_measure what=use` and `what=route`.
- The OBJ and the GLB hold one object per item, `item_<id>`, after the columns. A kind's entry in
  the registry may give `solid`, the blocks it is raised as; one that gives none is raised as its
  footprint to its height.
- `item/unknown-kind`'s "needed" names the new kinds. No new code in the record.
