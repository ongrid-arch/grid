# 2026-11-25: room size lines keep clear of stairs, doors and labels (VEW-51)

## For people

- A room's width and depth lines are no longer drawn across a stair, a lift, a door's swing or a
  room's name. Where there is no clear line, it is left out (VEW-51).

## For agents

- No new code in the record. The pictures `grid draw` and `grid_draw` give may show fewer room
  size lines; the sizes are still in `grid_measure`.
