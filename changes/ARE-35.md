# 2026-11-25: only the floor over an open stair below comes off a level's net area (ARE-35)

## For people

- A stair room that lies only partly over the stair room below it, as the half flights of a
  split-level house step aside level by level, now loses from the net area only the floor that
  lies over that open stair; the rest of it, a landing or its own half flight, counts on the level
  it serves, and the answer says how much was taken off. A level whose 7.22 m² stair room overlaps
  the one below by 1.1 × 3.8 m now loses 4.18 m², not all of it. A stair room wholly over the one
  below is still counted once, on the floor the stair rises from (ARE-35).

## For agents

- `grid_areas`: a stair or lift room only partly over the stair or lift room below it (LVL-3's
  join) no longer has `countedWith` and is in the totals: its `net` is its floor less the part over
  the open stair, and that part is added to its floor's `overStairs`, so the gross figures still
  add up. A note says it, one per room: `"<room>" on "<floor>" lies partly over the open stair
  "<room below>" on "<floor below>": only the <n> m² over it is taken off its net area, and the
  other <n> m² counts on "<floor>", the level it serves; the gross figures still hold it all.`
  ("the lift shaft" for a lift). A room wholly over the one below, to within `areaReported`, keeps
  `countedWith`, now found through rooms wholly over one another only.
- The net rule's sentence (`measures` of `net`) adds: only the part of a stair or lift room that
  lies over the one below is taken off, so a landing, or a half flight of a split level beside the
  stair below, counts on the level it serves.
- In the library, `planAreaFigures(plan).floors[].rooms[].overStair` (`area`, `floor`, `room`) on
  such a room, its `area` less that part.
- No new code in the record.
