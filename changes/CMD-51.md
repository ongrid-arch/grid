# 2026-11-27: the tool server keeps worked-out geometry between calls (CMD-51)

## For people

- The tool server keeps the plan it read, and what it worked out from it, until the plan changes: a second check, a measure or a picture of the same version of a large plan comes back in a fraction of the time, and a call with a floor the plan does not have, or a measure that needs a room without one, is refused at once. Any change to the plan file, its base plan or its trace image, by Grid or anything else, is read afresh. A room written as a polygon whose many corners lie on one circle is answered with how to write it as a circle, so it becomes one curved wall instead of many short ones (CMD-51).

## For agents

- Answers are the same as before; later calls about the same plan revision are faster. A plan version is the plan file's content together with every file its reading looked at (a fit-out's base, the trace image), compared on each call; the last four versions are kept.
- `grid_check` with an unknown `floor` and `grid_measure` with `what` `room`, `use`, `frontage`, `fit` or `route` and no `room` are refused before the plan is validated or surveyed, in the same words as before.
- `grid_write_rooms` adds one line per room of 12 or more straight walls whose corners lie on one circle within 0.02 m: `Room '<id>' is drawn with <n> straight walls whose corners lie on one circle: … To draw it round, write 'circle <across> at <x>,<y>' in its room line in place of the polygon, to the inside faces; keep the polygon if its sides are meant.` New tolerances `polygonOnCircle` and `polygonOnCircleCorners`. No new code in the record.
