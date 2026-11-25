# 2026-11-25: written units believed, and size limits by kind of building (WRT-22)

## For people

- In rooms text a length written with its unit is taken as meant, at any size: a 250 x 160 m
  warehouse written `250m x 160m` or `250000mm x 160000mm` is written, where it used to be
  refused as "millimetres or feet" (WRT-22). Kilometres read too (`0.5km`, in rooms text and in
  every length a tool takes). A room side written as a bare number past a building's is still
  written, in metres, and the answer asks whether it is meant and how to say so; the limit is
  lower in a home and higher where the plan says it is for assembly, sport, industry or a
  warehouse. A side stretched with `*` and a polygon are asked about the same way. Only a bare
  side past 2 km is refused, as most likely millimetres.
- A warehouse, a sports hall or a grandstand with tall walls is no longer asked whether it was
  typed in feet, and its big rooms and tall walls are asked about at a hall's figures.
- Splitting a room, adding one and changing an opening take a door or opening as wide as the wall
  allows: a 15 m door in a new wall, a 30 m dock opening.

## For agents

- `grid_write` (rooms text) answers a bare room side longer than `roomsSideAsked` (200 m; 50 m in
  a home; 1000 m in a hall) with the warning `rooms/size-question` instead of refusing it: "Line
  2: room 'hall' is 250 m in width, written with no unit: is that meant? …". The same warning
  names a side stretched with `*` ("stretches with '*' to … m") and a polygon ("is a polygon … m
  across"). A length written with its unit is never asked about. `rooms/size` still refuses a
  bare side past `roomsSideBare` (2000 m), naming the unit-written form that is taken (`3600m`).
- The plan's kind of building for the plausibility limits (`buildingKind`) is now `hall` when the
  plan, or a floor of it, says `building assembly`, `sport`, `industry` or `warehouse`, before the
  home uses. In a hall `plan/units-question` reads walls up to 30 m high as metres, and
  `wall/size-question` and `room/size-question` ask past 80 m and 500000 m², saying "in a building
  of large halls".
- `readLength` reads `km` and kilometres, so every `length: true` tool argument takes them.
- `grid_split_room` `door_width`, `grid_add_room` `opening_width` and `door_width`,
  `grid_change_opening` `width` and `grid_change_type` `width` take up to `openingWidest`
  (1000 m) in their input schemas, where they stopped at 5, 50, 50, 20 and 20 m; the edit still
  refuses an opening that does not fit its wall or the new room's side.
- New tolerance entries: `roomsSideAsked`, `roomsSideBare` and `openingWidest`; `wallHighest`,
  `roomLargest` and `typicalHeightHighest` gain a hall figure (`docs/tolerances.md`).
- No new code in the record: `rooms/size-question` is a rooms-text warning, as `rooms/size` is a
  rooms-text refusal.
