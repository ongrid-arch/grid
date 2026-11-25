# CNT-33: a column comes off every room it stands in

## Outcome
A column standing across a room line (a pier on the line between a nave and its aisle) comes off
each room it stands in, clipped to each, so the two shares add up to the column's floor. The rooms'
net areas add up with no overstatement, and `grid_areas` lists, per room, the columns taking floor
and how much each room loses.

## Design
- `packages/floorplan/src/geometry/columns.ts`, `columnsTaken`: before, a column was cut only to
  the smallest room holding its middle, so a pier on a room line came off one room by half and off
  the other not at all. Now each column is clipped to every room on its floor whose floor it
  overlaps (outline less holes), and each room gets its own clipped share, scaled to the true
  circle for a round column. A zone is still no room of its own (CNT-8).
- `columnRoom` (the one room a column is said to stand in, for describe and the plan facts) is
  unchanged: it names a single room, which is a different question.
- `areas.ts` already lists `columns: { area, ids }` per room from `roomColumnArea`/`roomColumns`, so
  it needs no change.
- Choice: rooms that overlap each other (not a hole, not a zone) each take their clipped share; a
  drawing that overlaps rooms is already reported elsewhere.

## Done
- `columns.test.ts`: a pier across a line between two rooms takes half off each; four piers on the
  line and a crossing of four rooms add up to the columns' own floor; `planAreaFigures` lists the
  share per room.
- `npx vitest run packages/floorplan`, `ownWords` and `tolerances` tests, typecheck, lint, scoreboard.
