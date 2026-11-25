# 2026-11-25: polygon rooms whose sides are a few degrees out of parallel share one wall (WRT-56)

## For people

- Two polygon rooms whose facing sides are up to 5 degrees out of parallel, and no further apart than a wall all along what they share, now get one wall between them, as a phone scan read in does. A surveyed 115 mm partition between two rooms drawn slightly askew is one 115 mm wall along the middle line between them, no longer two outside walls laid over each other, and a curved band of rooms written as facets that do not line up with the band beside it gets walls between its rooms only. The rooms keep their corners as written, and the answer says which rooms' sides are out of parallel and how far a wall's face is off them (WRT-56).

## For agents

- `grid_write_rooms` and `grid write`: faces of polygon rooms that run the opposite way within `roomsFaceTurn` (the sine of 5 degrees) and whose gap stays between nothing and `roomsWallWidest` at both ends of what they share are one wall's two faces. The wall runs along the middle line between them; all its pieces between the same two rooms are one thickness, a thickness the text states (the `wall between` line first, then the walls line and any stated thickness) when the gap passes through it, else the gap on average, which `rooms/wall-from-gap` says as before. A new warning, `rooms/faces-turned`, once a floor and in the rooms writer's own codes, names up to six pairs of rooms, the largest turn in degrees and how far a wall's face is off a room's side in millimetres. Sides within CNT-36's `roomsFaceSkew` write as before. No new code in the record.
