# 2026-11-25: moving a side past a wall in line with it (WRT-26)

## For people

- Making a room deeper no longer fails when a wall continues in line with that side past the room; the wall that meets the side follows and the in-line wall stays (WRT-26).

## For agents

- `grid_move_room_side` no longer refuses with "ends on it at an angle" for a wall in line with the side. With no wall across to carry its end, it refuses by naming that wall. No new code in the record.
