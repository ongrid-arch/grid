# 2026-11-26: fixtures in sections, every item in the GLB and OBJ, and a room's usual fixtures in one call (CNT-48)

## For people

- A section now cuts the fixtures and furniture its line crosses and shows those beyond it, as
  the plain blocks the 3D view stands them up as: a kitchen cut through its island shows the
  island, and the run against the far wall behind it. A cut item is drawn in paper with a light
  outline, apart from the walls' solid cut (CNT-48).
- Every fixture and piece of furniture is in the GLB and the OBJ as its own object, `item_<id>`,
  on its own floor, or the file's note names it as left out; an item whose kind's blocks all
  stand above its height stands as its plain box instead of vanishing (CNT-48).
- A room's usual fixtures are one call: `grid_add_item` with `kitchen`, `bathroom`,
  `shower-room` or `cloakroom` and a room sets out each fixture against a side of that room where
  it fits, a smaller one where the usual size does not (a shower for a bath), and says what fits
  nowhere. The library gains the typical rooms `kitchen` and `shower-room` (CNT-48).

## For agents

- `grid_add_item` with `name` a typical room (from `grid_measure what=library`) and `room`, and no
  `against`, `x` or `y`, sets out its items in that room, each where Grid's fit checks name
  nothing about it; `placed` lists the ids, `item` is the first, `fits` is false when any item
  fits nowhere and the new `notPlaced` lists those. A kind the room already holds is not added
  again. Own figures (`width`, `id`, `end` and the like) are refused with a typical room. No new
  tool: still the same count.
- The built-in library adds the typical rooms `shower-room` and `kitchen`; `grid_measure
  what=library` lists them after `bathroom` and `cloakroom`.
- `grid_view` kind=section: the section record (`planSection`) gains `items`, the cut items as
  parts of kind `item`, and `beyond` holds faces of kind `item`; `parts` and `cut` are unchanged.
  The picture draws them as `section-item`.
- `grid_view` kind=3d and kind=eye no longer say the model has no furniture: they say its
  fixtures and furniture stand as plain blocks. The tool's description says so too.
- An export's `leftOut` counts an item with no solid Grid can write as a fixture left out, with
  no code. No new code in the record.
