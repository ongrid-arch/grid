# 2026-11-25: a wall that faces outdoor space is an outside wall, however the rooms are placed (WRT-31)

## For people

- Rooms text writes the wall between a room and a garden, a terrace, a balcony or a porch as the
  building's outside wall at the outside thickness, also when the outdoor space is placed beside
  a placed or repeated unit of rooms, or cut out of a room's corner, and also when the outdoor
  space gives its own thinner `walls` (its railing or fence). A window from a room onto outdoor
  space is no longer said to be in an inside wall. Rooms placed by hand that leave the inside
  thickness there are said once, with the `wall between` line that keeps it if it is meant
  (WRT-31).

## For agents

- `grid_write_rooms` and `grid write`: a room placed beside outdoor space, or outdoor space
  placed beside a room, a unit's rooms (`place`, `repeat`) or into a room's corner
  (`inside <room> corner`), is set off by the outside thickness unless a `wall between` line or
  the building room's own `walls` states it; an outdoor space's own `walls` no longer sets that
  wall. The wall is `exterior` in the file, its worked-out exposure and the IFC's `IsExternal`.
- `rooms/inside-window` is no longer said for a window between a room and outdoor space.
- `rooms/wall-from-gap` is also said, in its own wording, when rooms placed by hand leave a gap
  between a room and outdoor space that is neither the outside thickness nor one a line states.
  No new code in the record.
