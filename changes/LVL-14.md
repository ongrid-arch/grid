# 2026-11-25: a floor above the ground with no stair is a finding (LVL-14)

## For people

- A floor above the ground with no stair is now named (LVL-14). A house drawn on two floors with no
  stair room, no lift room and no stair stated between them used to come back with no findings and
  one line saying its way out was not checked. `grid check` now gives a finding on that floor, with
  the rooms-text line that adds a stair, and `grid write` says it as soon as the plan is written.

## For agents

- New finding `floor/no-stair` (rule `floor-has-exit`), whose thing is the floor: a floor above
  the ground, in a plan that draws a ground floor, with a room that is not a void, where no room is
  used as a `stair` or a `lift` and no stair or ramp in the plan's `stairs` or `ramps` has the
  floor as its `from` or `to`. Its `fix` is the rooms-text line that adds a stair room on the
  ground floor rising `through` the floor, or a stair stated from the ground floor to it; the
  line's `values` carry `floorId` and `belowId`. The core's finding carries `stairFrom`, the ground
  floor's id.
- On such a floor, `floor/not-checked-no-stairs` is no longer listed beside the finding; the
  coverage of "Every room has a route to a way out" still skips its rooms, and `floor-has-exit` now
  counts the floor as looked at. A floor with a stair room that no stair room below lines up with
  keeps its `floor/not-checked-no-stairs` line.
- The answer of `grid write` and `grid_write_rooms` has one more line per such floor, after the
  drawing problems, naming it with `floor/no-stair` and the line that adds a stair.

## Codes

| `floor/no-stair` | "{floor}" stands above the ground, and nothing joins it to the ground floor: no room on it is used as a stair or a lift, and the plan states no stair to it | a stair joining it, through the floors between, to the ground floor |
