# 2026-11-25: rooms laid out from an area get a usable shape (WRT-61)

## For people

- A first layout from the brief (`grid write --layout`, `grid_write_rooms layout=…`) no longer
  draws a room asked for by its area alone as a thin strip beside deep rooms. No side of it is
  under 1.2 m (or its own square's side, for a room smaller than that), and with `sizes` it is at
  most twice as long as it is wide: a half bath of 2.8 m² beside rooms 4 m deep is drawn
  1.2 x 2.33 m, not 0.71 x 3.96 m. With `tidy` such a room is as deep as its row, so it is drawn
  larger than asked and named under "Sizes not kept" (WRT-61).

## For agents

- `grid_write_rooms` with `layout`: a room the brief gives only an area (or `at_least`,
  `at_most`) keeps its row's depth only while that leaves it no side under `layoutNarrowest`
  and, keeping its area, no more than `layoutLongest` times as long as wide (both Grid's own, in
  `docs/tolerances.md`). In a deeper row it is as narrow as that allows: with `sizes` it keeps its
  area and the outline steps; with `tidy` it is as deep as the row and is listed in `notKept`.
  No row is shallower than its area rooms' shortest side. No new code in the record.
