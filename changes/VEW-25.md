# 2026-11-25: every wall that faces the viewer in an elevation (VEW-25)

## For people

- An elevation now draws every wall that faces it and that nothing nearer hides, with its doors
  and windows: a porch's front wall and door under the porch's roof, a terrace's parapet, a stair
  enclosure standing on a roof terrace, and the front of a floor set back behind a terrace, with
  its windows and doors. A porch's roof no longer floats, a roof enclosure is no longer a bar in
  the sky, and a stepped block shows its fronts, not only slab edges. A wall or opening hidden
  whole behind a nearer wall is no longer drawn (VEW-25).

## For agents

- A facade (`grid_view` with a facade, `grid draw --facade`) lists among its faces, `walls` and
  `openings` the walls round outdoor space and the building's own walls behind a terrace, each
  once, whole. A wall or opening that nearer faces hide whole is left out of `faces`, `walls` and
  `openings`; the tiers are counted over what is left, so the front is still tier 0. No new code
  in the record.
