# 2026-11-26: a gable drawn whole in elevation (VEW-61)

## For people

- A facade (`grid draw --facade`, the sheet) draws a gable end whole, from the eaves up to the
  verge, under a sloped roof a floor states. Before, a loft whose walls state 2.60 m drew a line
  across the gable at 2.60 m, the edge of nothing, and left the triangle above it empty (VEW-61).

## For agents

- `grid_view` with `kind=facade`, and `planFacade`: under a roof the floor states, an outside wall's
  face rises to the roof's underside whatever height the wall states, as a wall that states none
  does, so a gable end's face runs from the eaves to the verge and the facade's `outline` has no
  hole in the gable. A wall round outdoor space alone keeps its own top. The 3D model, the exports
  and the quantities are unchanged. No new code in the record.
