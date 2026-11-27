# 2026-11-27: a room's height raises or stops its own walls, and walls of two floors in one space (LVL-26)

## For people

- In rooms text a room's `height` now sets the walls it bounds: a cinema, a nave or a fly tower
  taller than its storey has walls as high as itself, a duct or a low store lower than its storey
  stops its walls at its height, and a wall between two rooms stands as high as the taller. Every
  other wall keeps the storey's height, the storey keeps its own (the floor above is not lifted),
  the flat roof steps up over the taller room and the room has its ceiling at its height. A room
  that would rise into a room of a floor written above it is refused with both lines (LVL-26).
- `walltype 0.05 partition height 2.5` gives every wall of that thickness that height, and a room
  line's `walls 0.05 partition height 2.5` gives the walls that room adds that height: booths and
  low screens in a tall hall (LVL-26).
- `grid describe` says the floor level and height of each room whose height or floor is its own
  (LVL-26).
- `grid check` warns when a wall of one floor rises past a floor above it where a wall of that
  floor stands in the same place, so one wall is counted on two floors (LVL-26).

## For agents

- `grid_write_rooms` and `grid write`: on a room line `height <h>` raises the walls only that room
  bounds to its top (its `floor` offset plus its height) or stops them there, and a wall between two
  rooms takes the taller's; written on the walls only where that is not the storey's. A wall's
  height comes from its wall line first, then its thickness's `walltype <t> <kind> height <h>`, then
  the `walls <t> [kind] height <h>` of the rooms it bounds (`height` straight after a room line's
  `walls` words is now the walls', no longer the room's), then the rooms' heights. Outdoor space,
  dividing lines and railings are unchanged. A text with none of these words writes the same plan.
- New refusal `rooms/height-into-floor`: a room whose height takes it past the level of a floor
  above it, where a room of that floor (not a void) stands over it; names both lines, the floor, the
  level and the area shared. A malformed `walltype` line is refused with `[height <h>]` in its words.
- A floor's clear height, when it states none, is its tallest wall that is not a room's own (a wall
  standing to the top of a room it bounds that states its height), unless all are; so a raised room
  lifts neither its storey nor the floors above it. A flat roof Grid lays has one facet per raised
  room at that room's top (`FloorRoof.facets`), which the 3D scene lays with `rise`.
- `wall/above-storey` and `floor/wall-heights-differ` are no longer said for a wall that stands to
  the top of a room it bounds that states its height.
- `grid_describe`: a room with its own height or floor offset says its floor level and height (the
  person form a sentence after its size, the agent form ` floor@<level> h<height>`).
- New code `wall/same-space` (`worth-a-look`, on the lower wall): a straight wall of one floor rises
  past the floor level of a floor above it, where a wall of that floor lies along it, their bodies
  overlapping, for more than `sameSpaceAlong` (0.05 m, new in the tolerance table). Walls through
  floors are left out. The line names both walls and floors, how far past and the length shared.

## Codes

| `wall/same-space` | {thing} rises into the space of a wall on a floor above it | each wall standing on one floor only |
