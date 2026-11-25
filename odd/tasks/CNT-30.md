# CNT-30: straight walls join curved walls at the curve's face

## Outcome

- Where a straight wall meets the end of a curved wall at a corner, the two walls' shapes meet
  edge to edge: both end on the same line, through the point where their inside faces cross and
  the point where their outside faces cross. The drawing shows one clean corner with no notch,
  and the 3D model and the exports, which build their walls from the same figures, show the same.
- A partition that runs into a curved wall stops where each of its faces meets the curved
  wall's face, never over the curve, wherever along the curve it lands, the bulge included.
- Corners between straight walls, and a curve that carries a wall on in line with it, are joined
  exactly as before.

## Design

- `packages/floorplan/src/geometry/joints.ts`, with one helper in `arc.ts`.
- Cause of the notch: the joints see a curved wall as the line along its tangent at the joint
  (`Course`, CNT-18). Past the end of a curve that is right, because the curve's face carries on
  straight there (`curveFace` in `wall.ts`). Inside the curve it is not: a face cut back from the
  joint lies on the curve's face, a circle, while the wall it meets was cut against the tangent
  line. The two corners land a few millimetres apart and the two end lines at different angles,
  which leaves a wedge open at the corner. A partition into a curve stops on the tangent line in
  the same way, a little off the face.
- The fix: a ray at a joint that belongs to a curved wall carries its curve. Where two faces
  cross (`meet`), the crossing is first found on the tangent lines as now; when it lies on the
  curved part of a curved face (along the wall from the joint), it is found again on that face's
  circle (a line and a circle, or two circles), the nearest crossing to the first, and the cut is
  given as a length along the curved wall's axis, which is how `wallSlicePolygon` reads a reach.
  A crossing past the curve's end keeps the tangent line, which is the face there. When the
  circle has no crossing near enough, the tangent crossing is kept.
- Cause of the partition drawn over the curve: the joints look for a wall that carries on through
  a joint by a box round its axis, and a curve's box was made of its stations. When a bulge falls
  between two stations, a joint on it is outside the box, so the partition is not joined and runs
  on to the curve's centre line. The box is now made of the stations and the curve's own furthest
  points left, right, up and down that lie on it (`curveExtremes`, `arc.ts`).
- Decisions: no new tolerance, no new message code and no change to the plan file. The 3D model,
  the section and the exports read the same reaches, so they change with the drawing.

## Done

- New tests in `packages/floorplan/src/geometry/__tests__/curvedJoints.test.ts`, failing before:
  - a pavilion, a box with two sides bowed out as curves: at each of its four corners the
    straight wall's corner points are the curved wall's corner points, to a tenth of a millimetre;
  - the inside and outside crossing points lie on the curved wall's faces (on the circle inside,
    on the tangent past the end);
  - a partition ending on the bulge of a curve, at a point between two stations, is joined and
    each of its faces ends on the curve's face;
  - a partition ending on a curve away from the bulge ends on the curve's face too;
  - corners of straight walls and a curve in line with its wall keep their figures.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`, the cli's
  `ownWords.test.ts`, the floorplan's `tolerances.test.ts`, `npm run scoreboard`.
