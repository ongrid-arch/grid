# 2026-11-25: garden and boundary walls read as landscape, not building (CNT-26)

## For people

- A wall standing apart from the building, with no room on either side, is read as a garden or
  boundary wall. It is no longer part of a floor's outline, slab, roof, gross area, outside wall
  metres or storey height, and a wall round the plot no longer turns the plot into the ground
  floor: a house drawn with its boundary wall measures as the house alone. The drawing draws it
  lighter than an outside wall and keys it "Garden or boundary wall", and the take-off lists it
  on a line of its own (CNT-26).

## For agents

- On a floor that has rooms, a wall no room lists, with no room just past either face, standing
  in no outdoor space and rising through no other floor, is loose; loose walls that touch are one
  group, and a group is landscape when it touches no wall of the building, touches it at one place
  and closes no ring of its own, or closes a ring round rooms. Walls that close a space against
  the building at two places or more stay the building's (floor no room claims). A landscape wall
  is left out of the
  spaces the walls enclose, so `grid_areas` (net, gross internal, gross external, unclaimed
  floor), the slabs and roofs in `grid_takeoff` and the exports, the outline, the section and
  the storey heights no longer count it, and a ring of such walls encloses no floor
  (`floor/unclaimed` no longer names a plot inside one). Its exposure is `detached` whatever kind
  it states, so it is no outside wall in the drawing, the 3D view, the DXF and the IFC. The
  drawing's walls carry `landscape: true` and the key "Garden or boundary wall". `grid_takeoff`'s
  `walls` has a run of kind `garden` for these walls, and they are in no other run. A floor with
  no rooms reads as before. No new code in the record.
