# 2026-11-25: the eye view stands on the room's own floor (VEW-30)

## For people

- A picture from inside a room on a raised floor, such as a terrace, now puts the eye at the height asked above that room's own floor, and stands inside the room (VEW-30).

## For agents

- `grid_view` with `kind=eye` measures `eye_height` from the room's own floor: its storey's level plus its floor offset, and its text says so. It takes `stand_at` ({ x, y } in metres) to stand on a point of the room's floor; a point outside the floor is refused. With none it stands on the room's middle line, never in a hole of the room. No new code in the record.
