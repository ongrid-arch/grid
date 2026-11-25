# 2026-11-25: grid diff pairs rooms by where they stand first, also in a rewrite (MSG-23)

## For people

- `grid diff` pairs the rooms of two versions by where they stand first, as its page says, also
  in a plan written rooms first (MSG-23). A rewrite that gives a room's id or name to a room
  somewhere else (a ward of beds renumbered) no longer reads as that room moving across the
  building or shrinking to the size of the other one: each room is paired with the room standing
  in its place, renamed if its name changed, and what has no room in its place is removed or added.
- A room reshaped under a new id, as `grid diff --since phase` reads a room taken down and built
  again a little otherwise, is the same room changed, not one room removed and another added.

## For agents

- `grid_diff` (and the verdict every change answers with) pairs rooms in this order: the same
  walls or the same size in the same place; then the same id; then, under any ids, two rooms on
  one floor that share at least three quarters of the larger one's floor (`diffRoomOverlapShare`),
  read as one room reshaped; and, in two plans written rooms first, the same name last. There, a
  room keeps its id or name only for a room that shares at least half of the smaller one's floor
  (`diffRoomKeptShare`); before, the id came first and was trusted wherever the room stood. A room
  paired by place under another id says it in its line (`"Bed 1" (id "bed1" → "bed3") renamed
  "Bed 3"`), and its `idBefore` is set. No new code in the record, no new field.
