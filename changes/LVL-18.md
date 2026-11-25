# 2026-11-25: a storey under 2 m and a stair or lift door under 1.8 m are questioned (LVL-18)

## For people

- A storey too low to stand in is asked about: a floor that states a height under 2 m, or one
  with another floor over it that states none and whose tallest wall is under 2 m. A door
  onto a stair or a lift lower than 1.8 m is asked about too, naming the stair or lift. Both are
  Grid's own sizes, not code figures, and both are questions: the size may be meant. A floor under
  a roof of its own, such as a loft, may still state a low height (LVL-18).
- When a door or window reaches above its walls, Grid now offers raising the walls, or the
  floor's height and the elevation of the floors over it, before lowering the opening; on walls
  under 2 m it says the walls are the likelier fault (LVL-18).

## For agents

- `floor/size-question` is now asked about a floor whose stated `height` is under `storeyLowest`
  (2 m; a floor with a `roof` keeps `wallLowest`), and about a floor with a higher `level` over it,
  no `height` and no `roof`, whose tallest solid wall (outdoor and garden walls left
  out) is under it. Its line's wording is now "{thing} has a height that may not be meant".
- `opening/size-question` is now asked about a door or doorless opening on a wall of a room used
  as a `stair` or a `lift` lower than `stairDoorLowest` (1.8 m); the message names that room.
- The fix of `opening/too-tall` and the refusal `rooms/opening-too-high` say to raise the wall
  (or the floor's height and the elevation of any floor over it) if the storey is taller, before
  lowering the opening; under `storeyLowest` the refusal says the walls are lower than a storey.
- New limits `storeyLowest` and `stairDoorLowest` in the tolerances table. No new code in the record.
