# 2026-11-26: routes, the walk and the description agree with the way-out check (ARE-63)

## For people

- The walk through a plan now reaches every room the way-out check reaches: a carport or the
  bays past a car park's open ramp are walked from their open side, and a wing reached only by
  its own stair from upstairs from that stair. A long room with one curved wall is said by its
  own sides (a 3 m stair is 3 m across, however it is entered). A flat whose front door opens
  onto a landing the plan does not draw is described as entered from the building's common
  parts. A route out of a floor no stair joins to the ground floor says that the check does not
  follow that floor's way out either (ARE-63).

## For agents

- `grid_describe length=walk`: a floor's walk may start `open side` (`describe.walk.start.openSide`)
  when no door leads in but an open side to the outside does; after the doors in, the walk also
  starts from open sides to the outside and from rooms a stair joins to another floor, before
  listing rooms not reached. A room's size from its middle is taken along its own sides: the
  direction its straight sides run for the most length.
- `grid_describe` (line): a door onto the common parts (a separating wall, or `beyond: common`)
  is said as `from the building's common parts, which the plan does not draw, a door leads into …`
  (agent: `from the common parts into …`), no longer as no door in, nor as a door from outside.
- `grid_measure what=route to=outside` from a floor the check's `no_stairs` note names: the
  answer carries `notChecked: { reason: 'no_stairs', floor }`, with `found` true or false, and
  a line saying grid_check does not follow that floor's way out. No new code in the record.
