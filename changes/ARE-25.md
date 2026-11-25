# 2026-11-25: corridor widths measured true to the walls, quickly (ARE-25)

## For people

- A corridor's narrowest point is measured to its walls and fixtures themselves: a corridor
  whose walls stand 1.80 m apart measures 1.80 m, not 1.78 m, and is no longer set under a
  1.80 m figure of yours. A curved corridor measures across its curve, a jog in a side or a
  piece of a curve is never taken for an end, and a long corridor is measured in a fraction of
  a second (ARE-25).

## For agents

- `grid_measure what=access` (`corridors[].narrowest`, `at`), the brief's `corridor_width` line
  and `firm/corridor-width` give the width at the narrowest point measured to the walls and
  fixtures, not on the grid's points, so figures can rise by up to a few centimetres. A curved
  corridor gives its width across the curve where it was a few centimetres or nothing before.
  `corridors[].widest` is never less than `narrowest`. The way through a room
  (`use/passage-width`) is measured the same way, and what it is beside names only what the body
  at its narrowest point touches. Two new rows in the tolerances table: `corridorRasterAcross`
  and `corridorEndTurn`. No new code in the record.
