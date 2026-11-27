# 2026-11-27: openings cut through walls that stay are priced as the work they are (ARE-71)

## For people

- The cost of a plan's work prices a new door, window or doorless opening in a wall that stays
  as the work of cutting it: the hole taken out, by the wall's kind and thickness, the reveals
  round it (a knock-through's too) and a lintel over it, marked assumed. A 2.4 m knock-through
  in a 300 mm wall is no longer one "new opening" line (ARE-71).

## For agents

- `grid_takeoff` with `for: "change"`: for each new opening in an existing solid wall, a
  `demolish` line `demolish:cut:<kind>:<thickness>` (m², its hole less what an opening to be
  demolished in the same wall leaves open) and a `new` line `new:lintel:<kind>:<thickness>` (m,
  its width and `lintelBearing`, 0.15 m, at each end, `assumed: true`) when its head is below the
  wall's top; `make_good:reveals` now counts doorless openings too. A line of a change may now be
  `assumed: true`. New tolerance-table entry `lintelBearing`. No new code in the record.
