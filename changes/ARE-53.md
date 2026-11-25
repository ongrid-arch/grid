# 2026-11-25: a measure between two things says when it runs through a wall (ARE-53)

## For people

- A distance between two walls, doors, windows or rooms is no longer called "clear" when the
  straight line between them goes through another wall: the answer says "overall, through wall …"
  and names the walls (ARE-53).

## For agents

- `grid_measure what=between` adds `clear` (false when the line runs through a wall) and `through`
  (the ids of the solid walls it passes, in order from the first thing) to its answer; its text
  says "overall, through wall …" rather than "clear". The things' own walls, dividing lines and
  walls passed at a door or opening are not listed. No new code in the record.
