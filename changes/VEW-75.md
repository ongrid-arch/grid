# 2026-11-27: the eye view stands anywhere, with a lens and a tilt (VEW-75)

## For people

- A view from inside a room can now stand in a doorway, in front of a piece of furniture or in a
  corner, look at a fixture or any point, use any lens and tilt up or down, and keep upright
  lines upright in a one-point or two-point perspective. The camera no longer stands inside a
  kitchen run or other fixture, a small room is seen from its doorway looking diagonally across,
  and the room's walls are drawn full height around the eye instead of cut below it (VEW-75).

## For agents

- `grid_view kind=eye` takes `at` (a door or opening of the room, an item id, or a corner:
  `north-east`, `south-east`, `south-west`, `north-west`), `look_at` (`{ x, y }`), `lens`, `tilt`
  and `perspective` (`one-point`, `two-point`); `toward` also takes an item id. `at` is not taken
  with `stand_at`, nor `look_at` with `toward`, nor `tilt` with `perspective`. `from` on kind=eye
  is refused naming `at`. A `stand_at` inside or against an item 0.3 m tall or more is refused;
  a place Grid picks there is moved and the answer says "moved … m clear of …".
- Left out, a room under 9 m² with a door is seen from that doorway, looking at the far corner;
  standing `at` a door or corner looks at the far corner too. The answer's first line now names
  where the eye stands, `looking level` or `looking N° down/up`, and `lens N mm, N° across`
  instead of the fixed "90° across"; a perspective adds its own sentence.
- The camera record of an eye view carries the lens and tilt asked for. A still whose camera
  stands in a room draws the cut floor's walls full height (`buildingLayout`'s `wholeWalls`).
- No new code in the record.
