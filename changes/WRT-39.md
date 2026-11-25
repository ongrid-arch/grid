# 2026-11-25: thick outside walls meet at their corners when written rooms first (WRT-39)

## For people

- Rooms text with thick outside walls (masonry of 1.5 m or more, a 3 m front) now gets walls that meet at every corner, as thin walls do. A room open to the next one where the outside turns a corner no longer gets a sliver of wall in its outline, so `grid check` no longer says it does not match its space (WRT-39).

## For agents

- `grid_write_rooms` and `grid write`: a wall end reaches the centre line of the wall it meets however thick the two are, and at the end of a dividing line where the outside turns a corner the outside walls meet each other. The `room/space-mismatch` of about 0.04 m² those corners gave is gone; do not patch them with corner walls. `grid_check`: `wall/gap` no longer names a gap in a room's side that the body of a wall across the side closes, where one of the side's pieces ends in it. No new code in the record.
