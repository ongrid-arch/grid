# ARE-25: corridor widths measured true to the walls, quickly

## Outcome

A corridor's narrowest point from end to end (`grid_measure what=access`, the brief's
`corridor_width`, a firm's corridor standard) is the plan's own width:

- A straight corridor whose walls stand w apart measures w, not w less a step of the grid, so a
  1.80 m corridor is never set "under" a 1.80 m figure.
- A corridor that turns (an L) or narrows at a jog measures its narrowest real width, and the
  two ends Grid measures between are the corridor's ends, never a short jog in its side.
- A curved corridor, between two curved walls, measures the width across, centre to outside,
  not the gap between two of the straight pieces its curve is drawn with.
- The widest circle a corridor holds is never said to be narrower than its narrowest point, and
  in a corridor of one width the two are the same figure.
- What the narrowest point is said to be beside names only what touches it: the walls or the
  fixtures the width is measured between, not every fixture within a step of the grid.
- A long corridor is measured in a fraction of a second, so a plan with many corridors answers
  in seconds.

## Design

- `packages/floorplan/src/geometry/use.ts`, `passageWidth`: the grid finds where the way is
  narrowest, as before; then the width there is taken from the plan itself. From the nearest
  thing to that point (a wall face, a hole or a fixture) a line is cast straight across through
  it to the first thing on the other side; the body that fits there is the circle at the middle
  of that line, as wide as its clearance from everything. When that width lies within the
  grid's own error of what the grid found (1.5 steps either way), it is the figure, and its
  middle is where the way is narrowest; otherwise the grid's figure stands, as before. What the
  narrowest point is beside is what the body there touches, within `wallContact`. A new
  optional `step` asks for a coarser grid than `useRaster`, never a finer one.
- `packages/cli/src/quantities/access.ts`, `corridorEnds`:
  - The ends are the sides of the outline, straight runs with collinear pieces joined, that
    turn into the corridor at both their corners by at least `corridorEndTurn` (a convex corner
    at each end). A jog in a side (one corner in, one out) and the straight pieces of a curve
    (which turn by at most `arcStep`) are never ends. Of the ends, the two farthest apart are
    measured between, as before.
  - The grid is set by the corridor's width: `corridorRasterAcross` steps across its widest
    circle, never finer than `useRaster`. The width is taken from the plan (above), so a coarser
    grid only finds where the corridor is narrowest, and a 60 m corridor takes some thousands
    of points instead of a quarter of a million.
  - The widest circle is never narrower than the narrowest point: the body measured there is a
    circle the corridor holds, and the widest circle is found only to a thousandth of the room's
    length (`poleOfInaccessibility`), the way to the walls. (Built: first tried holding the
    narrowest to the widest, which put a 1.80 m corridor with a recess at 1.7996 m.)
  - The outline beside a side is read a quarter of the side's length from its corner, so the
    sliver where a straight wall's face meets a curved one does not hide the corner. Where the
    line across from the narrowest point runs into a recess, the points of the grid beside it
    are tried. (Built: reading the outline as far as the side is long kept a recess's back from
    being an end, but also dropped the wide end of a hall, which the brief's tests rightly hold
    to be an end; the old choice, the two ends farthest apart, stays.)
- Two new rows in `tolerances.ts` and `docs/tolerances.md`: `corridorEndTurn` (radian) and
  `corridorRasterAcross` (count). No new convention, no new message code, no change to the
  record's fields.
- Decision: "never a width narrower than the room's own widest circle" is read as "a corridor of
  one width measures its widest circle, and the two figures agree", since a corridor that
  narrows is rightly narrower than the widest circle it holds somewhere else.
- Known limit: a recess or a stub whose back lies farther out than the corridor's true end
  still reads as an end, and the width measured from it is no more than the recess's own.

## Done

- `packages/floorplan/src/geometry/__tests__/passageTrue.test.ts`: a rectangle w wide measures
  w to 1 mm at several widths, and a way past a fixture measures the gap and names only it.
- `packages/cli/src/quantities/__tests__/corridorWidth.test.ts`: a straight 1.80 m corridor
  measures 1.80 m and is not under a 1.80 m figure; an L and a corridor with a jog measure their
  narrowest real width between their true ends; a curved corridor measures its radial width to
  a few millimetres; a 60 m corridor is measured in under a second.
- The existing access, brief, firm and use tests pass, the type check, the lint and the
  scoreboard.
