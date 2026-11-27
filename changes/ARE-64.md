# 2026-11-27: void openings in areas and take-off (ARE-64)

## For people

- Grid deducts the full opening from gross floor area when a column crosses a void. The
  take-off gives the open edge's guard length in CSV and omits ceiling details for a void
  (ARE-64).

## For agents

- `grid_areas` deducts void openings before column deductions and excludes void rooms
  from the rooms measured to party walls. `grid_takeoff` returns a null ceiling height
  and an empty lowered-ceiling list for a void. Its output schema declares the optional
  `void` and `guard` fields, and its CSV carries a `guard` row per void. No new code in
  the record.
