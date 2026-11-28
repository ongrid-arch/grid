# 2026-11-28: a route between rooms on different floors (ARE-78)

## For people

- A route from a room on one floor to a room on another now goes up and down the plan's stairs
  and gives the walked length, where it used to be refused. With several stairs it takes the one
  that makes the walk shortest and lists the others; when no stair joins the floors it goes by a
  lift and says so (ARE-78).

## For agents

- `grid_measure what=route` with `room` and `to` on different floors answers instead of refusing
  ("Both rooms of a route must be on the same floor"). It reads the stairs the way out reads (a
  stair the plan states, stair rooms one over the other) and, only when no stair joins them, lift
  rooms one over the other: such a step has `type` `lift` and `width` null, walked middle to
  middle. The answer gains `otherWays` (the ways by the other stairs or lifts off the starting
  floor, shortest first: `via`, `type`, `rooms`, `length`), and the text a line "Other ways between
  the floors: …" and, by a lift, a line saying so. `through` is null on a way up or down, as for
  the way out. A route on one floor and a route to `outside` are unchanged. No new code in the
  record.
