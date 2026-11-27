# 2026-11-27: openings on curved walls follow the curve, and run on along a smooth run (VEW-77)

## For people

- A window on a curved wall follows it: its gap, its lines in plan and the wall over and under it
  bow with the wall, and in 3D its frame and glass are split into facets inside the wall's faces,
  so a wide window in a bay or a pavilion no longer draws a flat slab across it. A door's leaf
  stays straight between its edges (VEW-77).
- A door or window may run on past the end of its wall onto the next one when the two carry on
  as one smooth run (no corner, no third wall at the joint, the same thickness and height), so a
  0.9 m door fits on an outline of many short curved walls and a window can cross where two arcs
  of an oval meet. On a whole round wall an opening may straddle the point where the circle
  starts (VEW-77).

## For agents

- `opening/out-of-wall` now holds an opening to its smooth run of walls, and to the whole length
  of a closed circle, instead of to its own wall only: past an end of its wall, `offset` and
  `width` are measured on along the next walls (a negative `offset` back past the start), when
  they meet end to end, alone, turning no more than `smoothRunTurn` (5 degrees, a new entry of
  the tolerances table), and are as thick and as high. On a closed circle `offset + width` may
  pass its length and carries on round from the start. `opening/overlap` sees an opening that runs
  onto a wall beside that wall's own. `opening/crosses-wall` and `opening/fills-wall` leave the
  walls of the run alone.
- The plan drawing's `PlanOpening` gains `path` (on a curve or across a joint: the axis points
  from edge to edge, each with its normal and its distance along the run); `from` and `to` are the
  chord across the whole run. A window's symbol follows `path`; a door's stays on the chord.
- The scene (3D view, OBJ, GLB): the lintel and sill over a curved opening follow the curve's
  stations, and a window's boxes come in facets along `path`. The IFC and the DXF still cut and
  draw the opening on its own wall's chord.
- No new code in the record.
