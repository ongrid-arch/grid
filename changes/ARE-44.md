# 2026-11-25: the brief's step line reads every change of level (ARE-44)

## For people

- A brief figure for "step" now looks at every step on the way in, as the access measure does:
  a door's sill, a raised floor between two rooms and, when the plan states the ground, the step
  from the ground up to the entrance floor. Drawing the doors flush no longer closes the line
  while a floor is still raised (ARE-44).

## For agents

- `grid_write_brief` and every change's brief lines: a `step` figure also gives a missed line for
  each floor offset step between rooms (part: the opening, or the higher room along a dividing
  line) and for the entrance's step from `site.ground`. No new code in the record.
