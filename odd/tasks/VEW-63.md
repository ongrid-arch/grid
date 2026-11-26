# VEW-63: windows in elevation with frames, lights, sills and heads

## Outcome

A facade (`grid draw --facade`, `grid_view`, the sheet's elevations) draws each window as it is
built, not as one hairline rectangle: its frame, a sash for each part that opens, its lights in a
glass tone with the bars where two lights meet, a sill under it and a head over it. A window's
kind (C20) and the part of it that opens, stated on it or filled from its window type (C24), decide
how many lights it has and where its bars stand: a fixed window one light, a single casement one,
or two beside a fixed part, a pair two with a bar between, a sliding window two sashes passing.

## Design

- `packages/floorplan/src/geometry/facade.ts`: each window opening seen on a facade carries
  `window`, worked out once in the core: the boxes `openingParts` already gives the 3D view, the
  OBJ, the GLB and the IFC, projected onto the facade (along the wall to `u`, up to `z`), so the
  elevation, the model and the exports show the same frame, sashes and glass. Its members come
  farthest first, the side of the wall the facade looks at nearest. Its sill and head are
  rectangles: the sill under the hole, past each side by `sillProjection` (the plan drawn in
  detail's figure), `facadeSillDepth` deep; the head over the hole, `facadeHeadDepth` deep, as
  wide as the hole. Both are kept inside the wall's face and left out where there is no room (a
  window from the floor has no sill). A window through two floors (VEW-47) is worked out whole.
- `packages/floorplan/src/geometry/tolerances.ts` and `docs/tolerances.md`: the two new drawing
  sizes, Grid's own, citing nothing. The plan holds no sill or head.
- `packages/viewer/src/picture/facade.ts`: draws the record and works out nothing: the head, the
  hole, the lights in the glass tone, the members in the paper colour with fine lines, the sill
  last, standing in front. Doors and doorless openings are drawn as before.
- `packages/viewer/src/picture/look.ts`: an optional glass tone, so the technical look's glass
  is a pale grey on white paper instead of the paper itself; the screen looks use their window
  colour.
- Doors keep their outline in elevation; a door's leaves and panels are a change of their own.
  The frame's size is the same for every material: the plan's `material` is not read for it.

## Done

- `packages/floorplan/src/geometry/__tests__/facade.test.ts`: a fixed window has one light; a
  pair has two, with a bar between them at its split; a single casement that opens in part has
  two; a sliding window has two sashes, the nearer drawn last; a window that takes its kind from
  its window type is drawn by that kind; the sill sits under the hole and runs past it, the head
  over it, both inside the face; a window from the floor has no sill; a window through two floors
  has one frame from its sill to its head.
- `packages/viewer/src/picture/__tests__/facade.test.ts`: the SVG holds each window's frame,
  lights, sill and head, the lights in the glass tone of each look.
- `tolerances.test.ts`, `ownWords.test.ts`, the type check of floorplan and viewer, lint.
