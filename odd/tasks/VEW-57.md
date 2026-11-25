# VEW-57: walls, slabs and stairs that join in a section draw as one outline

## Outcome
- In a section, a stair whose flight or landing stands within a few centimetres of a wall or slab
  is drawn joined to it: the cut is one outline, with no white sliver between them, no hatch that
  stops short of the wall and no notch at the junction.
- A hole in the joined cut too small to be a room (a hair's width left by two parts that almost
  meet) is not drawn.

## Design
- `geometry/section.ts`: after the stairs are cut, the sides of each stair ring that face a wall
  or slab ring within `stairSnap` are moved onto that ring's edge (`snapToCut`), only along the
  section's width. Walls and slabs are left as they are; only the stair moves, and never by more
  than the limit. The final join (`joined`) then drops holes smaller than `sliverArea`.
- `geometry/tolerances.ts`: `stairSnap` (limit, 0.05 m) and `sliverArea` (arithmetic, 1e-5 m²),
  with their rows in `docs/tolerances.md`.
- Decision: snap the stair, not the wall, because the wall is what the plan states and the stair
  is drawn from a layout worked out from its run.

## Done
- `section.test.ts`: a stair 2 cm and 4 cm from a wall cuts into one outline with the wall; a
  stair 20 cm from it stays apart; no hole of the joined cut is smaller than `sliverArea`.
- Type check of `packages/floorplan`, lint, `tolerances.test.ts`, `ownWords.test.ts`.
