# VEW-47: a window through two floors is drawn as one

## Outcome

In an elevation, a wall that rises through floors (C19) is one face from the lowest floor's
bottom to the top floor's top. A window that crosses a slab is one opening with one sill and one
head, and no slab band is drawn across the wall. `facade.openings` lists it once.

## Design

- `packages/floorplan/src/geometry/facade.ts`: `planFacade` cuts each floor's slice, and a wall
  through floors gives one stretch per floor, each with its part of the window. `joinThroughWalls`
  joins the stretches of one wall that cover the same stretch of the outline: the lowest floor's
  bottom corners, the top floor's top corners (so a roof's top profile still shows), the parts of
  an opening joined by id (lowest sill, highest head). A slab band that lies inside a joined face
  is left out. The viewer draws faces and needs no change.
- The section already cuts a wall through floors once, whole (LVL-5), so it is left as it is.
- Decision: only walls that state `through` are joined; two separate walls on two floors are not.

## Done

- `facade.test.ts`, "a window through two floors": one wall face, one opening from 0.5 to 5 m, and
  no slab band across it with a stated slab thickness. Both fail before the change.
- Type check, lint, the floorplan and viewer tests, the scoreboard.
