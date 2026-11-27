# The eye camera stands anywhere, with a lens and a tilt

## Outcome

- `grid_view kind=eye` stands where the agent says: `stand_at` a point (as before), or `at` a
  door or opening of the room (in its doorway, just inside the room), an item (in front of it,
  looking the way it faces), or a corner of the room (`north-east`, `south-west`, ...: tucked
  into that corner, clear of its walls).
- It looks where the agent says: `toward` an opening, an item or a direction, or `look_at` a
  point on the plan. Left out, it looks at the room's first window as before, except when Grid
  stands it in a doorway or a corner: then it looks across the room to the far corner.
- `lens` (18 mm, 90 degrees across, when left out) and `tilt` (degrees down, below 0 up; level
  when left out) are taken. The answer says how wide the picture is from the lens it used.
- `perspective`: `two-point` keeps the camera level and looks across a corner of the room, so
  its walls run away to two sides and upright lines stay upright: left with no `toward`, it looks
  at the far corner; with one, it turns just enough to be at least 25 degrees off square to the
  room's walls and says how far it turned. `one-point` keeps it level and squares it on the wall
  it faces. Each refuses a tilt.
- The camera never stands inside a fixture or a piece of furniture: a place Grid picks is moved
  to the nearest clear floor (the answer says from what), and a `stand_at` inside one is refused
  naming it.
- In a small room (under 9 m² of floor) with a door, and nothing said about where to stand, the
  camera stands in the doorway and looks diagonally across to the far corner, instead of backing
  against a wall a metre away.
- `from` on kind=eye is refused with a pointer to `at`.

## Design

- `packages/cli/src/draw/eyePlace.ts` (new): where the eye stands and what it looks at, from the
  room's survey outline, its openings and the plan's items: `eyeStandAt` (doorway, item, corner,
  or the old middle line), `clearOfItems` (the nearest point outside every item footprint on the
  room's floor, searched on rings round the point), `farCorner`, `squareHeading` and
  `twoPointHeading` (from the direction of the room's longest side). Pure geometry over the
  survey; no drawing.
- `packages/cli/src/draw/cameraAsk.ts`: `eyeCamera` takes `lens` and `tilt`; with a tilt the
  target is moved down the line of sight so the camera still stands at the eye. The walk's
  pictures call it unchanged.
- `packages/cli/src/mcp/readTools.ts`: kind=eye takes `at`, `look_at`, `lens`, `tilt` and
  `perspective`; its answer names where it stood and why, the lens and its angle across. The
  VEW-74 crop and floor=all code is untouched.
- Decisions: the point form of `at` stays `stand_at` (the argument kit takes an object or a text,
  not both); a point to look at is `look_at` for the same reason, since `toward` is shared with
  kind=section. The small-room threshold and the clearances are the eye view's own figures in
  `eyePlace.ts`, not drawing tolerances. The default lens stays 18 mm so pictures asked before
  are the same.

## Done

- `packages/cli/src/mcp/__tests__/eyeView.test.ts`: lens and tilt reach the camera record; at a
  door stands in its doorway; at a corner stands in that corner; at an item stands in front of
  it; look_at and toward an item aim there; two-point looks off square, one-point square; a
  tilt with a perspective is refused; a camera Grid places inside a kitchen run is moved out,
  and a stand_at inside it refused; a small room stands in its doorway looking diagonally;
  from is refused naming at.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  sentence counts and the contract test.
