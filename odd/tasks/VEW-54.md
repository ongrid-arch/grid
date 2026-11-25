# VEW-54: DXF wall outlines joined per run, and dimension chains with no split walls

## Outcome

- Opened in a CAD program, the walls of a plan show no diagonal line across a corner or a
  junction: touching walls on one layer are one outline and one hatch, as a drafter draws them.
  A run that closes round a courtyard is an outline with a hole.
- In the walls chain outside the plan, walls that meet a facade side by side and touch (an
  extension built against an old wall, 0.15 m and 0.15 m) are dimensioned as one 0.3 m wall, not
  as two pieces.

## Design

- `packages/floorplan/src/geometry/export/dxf.ts`, `writeModel`: the straight walls' slices are
  grouped by their layer and fill layer and joined with `cutOutline('union', ...)` (the core's
  one clipping call); each piece is written as one hatch (outline and holes) and one closed
  outline per ring. Curved walls keep their own runs, since their faces are true arcs. A join
  that fails on every grid falls back to the walls' own slices, so nothing is lost.
- `packages/floorplan/src/geometry/dimensions.ts`, `wallMarks`: the faces of the walls that meet
  a facade are taken as intervals along the chain; intervals that touch or overlap are one, so
  only the outer faces are marks. A wall thinner than `chainThinWall` stays a centre-line mark.
- No new tolerance: touching is judged by `chainSliver`, already the chain's own figure.

## Done

- `export/__tests__/joined-walls.test.ts`: the flat's DXF has one wall outline per run, no edge
  of a wall's outline shared with another (no mitre line), the outline areas still sum to the
  flat's wall area, and the file still passes `dxfProblems`.
- `__tests__/dimensions.test.ts` (or the nearest existing file): two touching 0.15 m walls
  against a facade give one 0.3 m wall dimension.
- Golden files that change are regenerated and read to confirm only the joining changed.
- Type check of `packages/floorplan`, lint, the export tests and the dimension tests,
  `ownWords.test.ts` and `tolerances.test.ts`.
