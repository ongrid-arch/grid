# VEW-66: the ground at ground level in 3D, with the floors below it under it

## Outcome

A 3D view (the app's canvas, `grid draw --3d`, `grid_view kind=3d`, the preview and the sheet's
still) shows a building with basements standing in the ground, not a taller building standing on
the grid:

- the ground grid lies at the ground: the level the site states (`site.ground`), else the ground
  floor's floor level, as the sections and checks take it. A plan whose floors all hang below the
  ground floor's level, or whose ground is stated above its lowest floor, no longer stands its
  lowest floor on the grid;
- the ground is a surface, not only lines: a sheet in the background's own colour, partly see-through,
  at the ground. What lies below it (basement walls, a car park's levels, the slab under a garden)
  shows through it faded, as buried, and what stands above it is drawn as before;
- the ground is cut away over the building where it goes down into the ground (every floor whose
  slab's underside lies below the ground), so a basement shown as a cutaway is seen from above
  through the hole, not through the ground;
- a plan with no basement looks as it did but for the edge of its ground slab, which lies in the
  ground and now shows faded: the ground at the ground floor's floor, its hole under the ground
  floor's slab, where nothing shows through.

## Design

- `packages/floorplan/src/geometry/groundPlane.ts` (new, pure): `sceneGround(plan, reach,
  elevations?)` gives the ground's `level` (`groundLevel`: stated, else 0, in the floors' own
  datum, which is the 3D view's height), whether it is `stated`, the floors that go `into` the
  ground (slab underside below the ground by more than `sameFloorLevel`) and the ground's `pieces`
  on plan: a square reaching `reach` metres past the plan's bounds on every side, less the
  outlines (`planEnvelope`) of the floors that go into the ground. Joined and cut with
  `cutOutline`; never throws (a floor whose outline is not known cuts nothing).
- `packages/viewer/src/canvas3d/building.ts`: `buildingGround(plan, layout, elevations)` gives the
  ground in Three's frame: its `y` (the level, less the one storey's floor level for a one-storey
  plan, which stands at 0 as it always has) and its pieces, reaching `GROUND_REACH` past the
  building.
- `packages/viewer/src/canvas3d/Ground3D.tsx` (new): the pieces as one flat mesh at `y`, unlit, in
  the background's colour, not tone mapped (so where nothing lies under it, it is the background),
  at `GROUND_FILL.opacity`, drawn before every other see-through part (render order -1) and writing
  no depth, so the grid lines over it keep their strength.
- `BuildingScene` draws it when given `ground`; the app's canvas and the still (`stillScene`,
  `planStill`) work it out once per plan and focus and give it; the grid lines (the app's helper
  and the still's own lines) lie at `ground.y + GROUND_GRID.y` instead of `GROUND_GRID.y`.

Decisions:

- Ghosted rather than hidden: an agent asking for a 3D of a basement wants to see it, and a person
  reading the picture must see that it is under the ground. Fading what lies under a background-
  coloured sheet does both and needs no new colour token.
- Cut, not dashed: a dashed outline in 3D needs edges of its own on every part; the hole over the
  dug floors is one polygon and reads as the dig.
- One ground level for the whole site, as the schema has it. A walk-out storey on a slope, or a
  terrace stepping up a street, needs the ground per side or per point, a convention of its own,
  and is not here: such a plan gets one flat ground at its stated level.
- The eye height of a camera record outside every room is still measured from the ground floor's
  floor (the record's `floor`), not from the ground: changing what the record means is not this
  change.

## Done

- `packages/floorplan/src/geometry/__tests__/groundPlane.test.ts`: the ground at 0 with nothing
  stated and at the stated level; a house with two basements: the floors into the ground, the hole
  over their outline, the ground reaching `reach` past the bounds; a floor on a plinth cuts no
  hole; a broken plan gives the whole square.
- `packages/viewer/src/canvas3d/__tests__/building.test.ts`: `buildingGround` at the stated ground,
  and relative to a one-storey plan's floor.
- `packages/viewer/src/still/__tests__/planStill.test.ts`: a still of a house with basements has a
  ground mesh at the ground, with a hole; the basements' pixels under the ground are fainter than
  without it; the background round a plan with no basement stays the background.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on `packages/floorplan`,
  `packages/viewer` and `packages/cli`, `npm run scoreboard`.
