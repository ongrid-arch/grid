# VEW-58: the 3D cutaway cuts the walls, whatever the number of storeys

## Outcome

- A 3D picture with a floor cut away (the app's floor focus, `grid draw --floor`, a saved view's
  `cut`) draws that floor's walls only up to 1.2 m above its floor (`planCutHeight`), so the rooms
  can be seen into from above. It does so for a one-storey building as well as for several: a hall
  asked for as a cutaway no longer comes out as the same closed drum as the whole building.
- The whole building (no floor cut away) is drawn as before, walls full height.
- A door or window reaching above the cut is drawn up to the cut only; a window wholly above it is
  not drawn. The floors below a cut floor are not touched.

## Design

- `canvas3d/building.ts`: `StoreyLayout` gains `cut`, the height above the storey's floor its
  walls are cut at, or null. It is set for the floor the plan is asked to cut away (`focus`
  names a floor it has) and null for every other storey and for the whole building. `focus: null`
  on a one-storey plan stays the whole building, though that floor is "focused" for the camera.
- `canvas3d/cutWall.ts` (new, pure): `cutElevation(elevation, height)` clips a wall's elevation
  outline to `y <= height` and notches the top where a hole reaches the cut; a hole wholly below
  stays a hole. `cutOpening` clamps an opening's boxes to the cut.
- `useWallGeometries(scene, cut)` and `buildWallGeometry(wall, cut)` take the cut and key the cache
  on it as well as on the wall's revision. `Storey3D` passes `storey.cut` and its openings through
  `cutOpening`.
- The height is `limit('planCutHeight')`, the plan's own cut, so the 3D reads as the plan does.
- Decision: only the cut floor is lowered. Floors below stand under a slab and keep their walls.

## Done

- `canvas3d/__tests__/cutWall.test.ts`: a plain wall is clipped to the height; a door taller than
  the cut becomes a notch; a window below it stays a hole; a wall under the cut is unchanged.
- `building.test.ts`: a one-storey plan with `focus` set has `cut` 1.2 on its storey, with `focus`
  null has none; a cut on several storeys is on the focused one only.
- `still/__tests__/planStill.test.ts`: a one-storey still asked for as a cutaway differs from the
  whole and shows more of the floor.
- Checks: viewer type check, lint, the viewer tests, `ownWords` and `tolerances`.
