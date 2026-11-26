# VEW-61: a gable drawn whole in elevation

## Outcome

A facade (`planFacade`, `grid draw --facade`, `grid_draw`, the sheet) draws a gable end whole,
from the eaves line up to the verge, on a floor that states a sloped roof (LVL-6), whatever height
its walls state. Before, the wall's face was cut at the lower of its stated height and the roof,
so a loft whose walls state 2.60 m under a steeper gable drew a level line across the gable at
2.60 m, the edge of nothing, and left the triangle above it empty: the facade's silhouette had a
hole there and the sky showed through the gable. A wall round outdoor space alone keeps its own
top, as before, and a wall on a floor with no sloped roof is drawn as before.

## Design

- `packages/floorplan/src/geometry/facade.ts`, `wallPoints`: an outside wall of a floor under a
  sloped roof is the building's skin up to the roof, so its face's top is the roof's underside
  over its line, not its stated height. It reads the core's own cut (`wallTopProfile`) for the
  wall raised to the roof's top (`floorRoofShape(...).top`), the height a wall that states none
  takes on such a floor (LVL-6, `docs/plan-file.md`). A wall already as tall as the roof is read
  as it is. Nothing else changes: the openings, the bottom, the roof's bands and planes.
- A wall round outdoor space alone (VEW-35, `outdoorOnlyWalls`) keeps its stated top: a parapet
  on a terrace under a roof stays a parapet.
- Decision: the stated height still holds everywhere else (the 3D model, the IFC, the quantities,
  the check of openings above the roof), since this change is the elevation's. The facade now
  shows what stands on the gable, as a person standing outside sees it; the 3D model and the
  exports still stop a stated-height gable at that height, a follow-up for whoever owns them.
- The viewer's `picture/facade.ts` draws the faces it is given and is unchanged; a test there
  holds the picture to having no edge at the stated height across the gable.

## Done

- `packages/floorplan/src/geometry/__tests__/facade.test.ts`: a loft whose walls state 2.60 m
  under a gable rising higher draws its gable end as one face from the eaves to the verge, with no
  corner at 2.60 m, and the silhouette has one ring with no hole; a terrace's parapet under the
  same roof keeps its height.
- `packages/viewer/src/picture/__tests__/facade.test.ts`: the gable's path has no point at the
  stated height.
- The packages' tests, the type check of `floorplan` and `viewer`, lint, `ownWords.test.ts` and
  `tolerances.test.ts`.
