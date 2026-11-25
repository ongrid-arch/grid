# 2026-11-25: a section through a sunken room is one solid (VEW-24)

## For people

- In a section, the walls round a room set below its floor now run down to its lowered slab, and
  that slab is joined to the floor's by a step, so a sunken room no longer shows a floating slab or
  a gap at the foot of a wall (VEW-24).

## For agents

- `grid_draw` sections and `planSection`: for a room with a negative `floorOffset`, the cut parts
  include the walls carried down to its slab and a step of slab at each end of it, so `cut` is one
  piece with the floor's. No new code in the record.
