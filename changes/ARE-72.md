# 2026-11-27: questions about homes missing rooms, odd sizes and misnamed uses (ARE-72)

## For people

- A home with no bathroom, no kitchen or no way in is now asked about after the check, and the
  brief offers those rooms as Grid's assumption to confirm with the person (ARE-72).
- A bedroom of half a square metre, a living room one metre wide or a bedroom set to the living
  room use is asked about after the check, with no place or country needed (ARE-72).

## For agents

- `grid_check` and `grid check`: after the report (and the brief's missed figures), brief or
  none, a heading "Worth a look in the homes (N): Grid's own questions, with no place needed, …"
  and at most 12 lines: "No bathroom in the home: …", "No kitchen in home \"Flat B\": …", "No way
  into …: no door, opening or open edge leads from its rooms to the outside or to a room that is
  not the home's.", "\"Bedroom 2\" in the home, used as bedroom, has 0.49 m² of net floor, under
  the 4 m² Grid asks about: is the size meant?", "… is 1.00 m across at its widest circle, under
  the 1.8 m …", "\"Bedroom 1\" in the home is named as bedroom but used as living: which is it?
  …". A home is each flat, or the whole plan when a room is used as a bedroom or living room. The
  check's record, `count` and `lines` are unchanged.
- The brief's lines (`grid_write_brief` and every change's answer): a line `missed (should,
  assumed): a bathroom|a kitchen|a way in in every home, Grid's assumption, missing from …`,
  `source: "assumed"`, `where: null`, for each usual room a home lacks and the brief says nothing
  of; a room wish of that use or name, at any level, ends it. With no brief and such a line, the
  heading is "Against the drawing, with no brief yet: the sizes in room names and the rooms Grid
  assumes every home has." A survey gets none.
- New limits `homeRoomSmallest` (4 m²), `homeRoomNarrowest` (1.8 m), `homeWetRoomSmallest`
  (0.8 m²) and `homeWetRoomNarrowest` (0.6 m) in the tolerances table. No new code in the record.
