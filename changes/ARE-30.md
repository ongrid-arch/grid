# 2026-11-25: a route ends at the door of the stair room it reaches (ARE-30)

## For people

- A route to a stair or a lift is now walked to its door, not to the middle of the room, so two
  identical stairs measure the same from the same place and the nearest stair no longer flips on
  the room's shape. A route can start at the room's middle, the door it leaves by, its farthest
  corner or a point you give, and the answer says both points.

## For agents

- `grid_measure what=route` takes `start` (`middle`, `door` or `farthest corner`), or `x` and `y`
  for a point on the first room's floor (not together with `start`), and `end` (`middle` or `door`).
  Left out, a route to a room whose use is `stair` or `lift` ends at its door and any other room at
  its middle; to `outside` it ends at the outside face of the door out. The answer has `startPoint`
  and `endPoint`, each `{ point: {x, y}, at }` with `at` one of `middle`, `door`, `farthest corner`,
  `given point` or `outside face of the door` (null when the length cannot be measured), and the
  text says "Walked from x, y (door) to x, y (door).". A point off the floor is refused.
