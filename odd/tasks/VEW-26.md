# VEW-26: frame 3D stills and long plans to the building

## Outcome

- A 3D still Grid frames itself fills its frame with the building: the camera stands as far as
  the building's box needs, from its bearing, tilt and lens, and no further, and is pointed at
  the middle of what it sees. A tall, narrow building is taken in a portrait frame.
- `fit` (`building` or `room`) on a 3D view says what fills the frame. Named with a room and
  nothing else, the room fills it; otherwise the building (the floors drawn, up to the floor cut
  away). A camera sent back keeps its own distance unless `fit` is named.
- An eye-level view from outside (`eye_height` with no tilt, tilt_by or distance, pointed at no
  room) looks level, so the building's upright lines stay upright, and stands back until the
  building fits.
- A floor far longer than it is wide is no longer a strip only: a plan view of it says so, with
  how many pieces it is drawn in, and `tile` draws one piece at a time at a readable scale.

## Design

- `packages/floorplan/src/geometry/camera.ts`: `fitCamera(plan, setting, box, options)` works out
  the distance and the target for a box from the camera's own frame (right, up, along the line
  of sight), so that every corner lies inside the frame, with a margin, and the picture is
  centred (a few passes, as near and far corners shift the middle). `level` keeps the target's
  height, for the eye-level view. `fitAspect` picks a portrait frame (2 by 3) when it shows the
  box larger than the landscape one (3 by 2) by a clear margin. Pure, with tests.
- `packages/cli/src/draw/cameraAsk.ts`: Grid's own framing uses `fitCamera` in place of 2.2
  times the building's largest side; the box is the plan's outline from the lowest slab to the
  roof, or to the top of the floor cut away; a room's box is its outline over its storey.
- `packages/cli/src/draw/views.ts`: a still is drawn 800 by 1200 when its record's aspect is
  portrait, else 1200 by 800 as before.
- `packages/viewer/src/picture/planSvg.ts`: `pictureTiles` splits a floor whose long side is
  more than 2.5 times its short side and which would be drawn at fewer than 8 pixels a metre into
  pieces along its long side, each overlapping the next a little, each at 8 pixels a metre or
  more. The plan view's `tile` draws one through the existing frame (VEW-6).
- `packages/cli/src/mcp/readTools.ts`: `fit` for 3d, `tile` for plan, and the lines that say so.
  The figures (fill, portrait margin, tile reading scale) are framing choices, not checks, and
  stay beside the code that uses them.
- Decided: no lens shift. Upright lines stay upright by keeping the eye-level camera level;
  a shifted lens would need a field the BCF camera record does not have, and a convention.

## Done

- `camera.test.ts`: a fitted camera has every corner of a box inside its frame and one near an
  edge; a tower gets a portrait frame, a long low building a landscape one; a level fit keeps the
  target's height and its tilt 0.
- `cameraView.test.ts`: the default 3d view of a tall building is portrait and fills its frame;
  `fit=room` stands closer than `fit=building`; an eye-level call outside looks level.
- `planSvg` tests: a long floor gets tiles that cover it, a house none; `tile` is refused on a
  floor that needs none.
- Type check, lint, the floorplan, viewer and cli tests, `ownWords.test.ts`, the scoreboard.
