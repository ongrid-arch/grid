# 2026-11-25: a split's new room takes the room's use (WRT-49)

## For people

- Splitting a room gives the new room the use of the room it came from, unless you name another, and the answer says so (WRT-49).

## For agents

- `grid_split_room` and `grid edit split`: the new room has the use the room had before the split when `new_use` is left out, and the answer's guessed list says so. A room with no use gives the new room none. No new code in the record.
