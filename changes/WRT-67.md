# 2026-11-26: a wall from a gap says the floor it takes and how to close it (WRT-67)

## For people

- When rooms placed by hand leave a gap that Grid makes a wall thicker than the walls line's
  inside walls, the answer now says how much thicker it is, how much floor is in the wall rather
  than in a room, and the size of either room that closes the gap. A wall between two indoor
  rooms that is as thick as the outside walls is said too, where it used to pass without a word
  (WRT-67).

## For agents

- `grid_write_rooms` and `grid write`: `rooms/wall-from-gap` between two indoor rooms is also
  said when the gap is the walls line's outside thickness; only the inside thickness or one a
  line states (a room's `walls`, a `wall between` line, a `walltype`, a unit's `gap`) keeps it
  quiet. When the wall is thicker than the one the rooms would be set apart by, the warning adds
  how much thicker, the length the rooms share and the floor in the wall in m², and its fix is
  the `w x d` of either room that closes the gap, or, for rooms with no plain size, how far to
  move one. A thinner wall keeps "move a room". A wall that faces outdoor space keeps its own
  wording. No new code in the record.
