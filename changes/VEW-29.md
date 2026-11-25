# 2026-11-25: slab edge bands only where the floor states its slab (VEW-29)

## For people

- A facade or a section no longer draws a band at every floor on a house whose slab thickness the
  plan does not state, so brick and render read as one wall. State `slab` on a floor to see its
  band (VEW-29).

## For agents

- `grid_draw` facades and sections: a floor's slab edge is a face of its own only when the floor
  states `slab`; otherwise its walls stand down over the edge. `planFacade` has no `slab` face for
  such a floor, and the section's beyond faces none. No new code in the record.
