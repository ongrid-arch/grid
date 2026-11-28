# 2026-11-28: a route from any point, and from a room's or a floor's farthest point (ARE-81)

## For people

- A walking distance can now start from any point you give, without naming its room, and from
  the farthest point of a room or of a whole floor to its nearest way out (or to a room such as a
  stair), weighing every way out from each point, so the longest walk on a floor is measured, not
  worked out by hand as a straight line.

## For agents

- `grid_measure what=route` takes `x` and `y` with no `room`: the room the point stands in is
  found, on `floor` (new, for route only) when rooms on more than one floor are under it; a point
  on no room's floor, or on several floors with no `floor`, is refused. `floor` with a `room` is
  refused.
- `start` takes `farthest point`: the point of the room's outline whose walk by its nearest way is
  the longest (`startPoint.at` is `farthest point`). With no room, every room of `floor` (or of the
  only floor) is measured. The answer adds `farthest` (`[{ room, point: {x, y}, length }]`, longest
  first), and for a floor `floor` and `unreached`; the text starts "The farthest point of ...".
  `farthest corner` answers as before. No new code in the record.
