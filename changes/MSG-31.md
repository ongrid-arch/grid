# 2026-11-26: the walk says an item far into a room by where it stands (MSG-31)

## For people

- The walk no longer says a table standing metres into a room is "in the wall you stand in".
  An item against an inner wall that faces back at you, such as a step in the outline, is said
  as standing clear of the walls, with how far ahead and to which side (MSG-31).

## For agents

- `grid_describe length=walk`: an item against a wall that faces behind you but whose near side
  is more than 0.3 m ahead is listed under "Standing clear of the walls" (`F` in the agent form),
  not under "In the wall you stand in" (`B`). No new code in the record.
