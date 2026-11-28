# 2026-11-28: room floors in 3D are open over voids, stairs, lift shafts and ramps (LVL-27)

## For people

- A room marked as a void no longer has a floor in the 3D view or in the GLB and OBJ files, so an
  atrium or a double-height hall is open to the floor below, as its slab already was (LVL-27).
- A room's floor in 3D is now cut where its storey's slab is open: over a stair's flights and
  landings, over a stair room or a lift shaft on the floor below, and over a ramp. A stair room
  over the one below has no floor of its own, so nothing covers the stair well (LVL-27).

## For agents

- `grid_export` GLB and OBJ files write no floor node for a void, and a floor node over a stair,
  a stair room, a lift shaft or a ramp is laid round the opening. A plan with no opening in any
  slab is written as before. No new code in the record.
