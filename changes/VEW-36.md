# 2026-11-25: a facade draws the straight walls between curved corners (VEW-36)

## For people

- A building with curved corners, such as a tower shaped as a rounded square, now shows on each
  facade the straight wall facing that side, with its doors and windows, between the two corners;
  it no longer shows the corners alone, or a wall and doors from inside the building, such as a
  core's lift doors, in its place. A corner on the far side is never drawn on a side it does not
  face (VEW-36).

## For agents

- `grid_view` with `kind=facade`, `grid draw` facades and every reader of `planFacade`: the straight walls
  between curved walls are listed in a facade's `walls` with their openings, and walls the
  outside wall hides are not. No new code in the record.
