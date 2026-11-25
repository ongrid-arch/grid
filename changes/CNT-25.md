# 2026-11-25: a building with curved walls is checked and drawn much faster (CNT-25)

## For people

- `grid check`, `grid draw`, the 3D view and `grid sheet` of a tall building with curved walls
  are much faster: a curved wall's pieces and each room's outline are worked out once, not once
  for every check that reads them, and drawing or raising one floor no longer works out every
  floor of the building again. Every figure, line and drawing is the same as before (CNT-25).

## For agents

- Every tool that checks, measures or draws a plan answers a plan with curved walls, or with many
  floors, sooner; what it answers is unchanged. No new code in the record.
