# 2026-11-25: a lift shaft is counted once in net area, as a stair is (ARE-22)

## For people

- A lift shaft drawn as a room on floor after floor, one over the other, now counts once in net
  area, on the floor it rises from, as a stair does. A tall building's net area and net to gross
  figure no longer hold the shaft on every floor (ARE-22).

## For agents

- `grid_areas`: lift rooms that lie one over the other on neighbouring floors (they share at least
  half of the smaller) are one shaft. The rooms over the lowest carry `countedWith`, are in no net
  figure, no area by use and no circulation figure, and count in `overStairs`; a note says so,
  calling the shaft a lift. Lift rooms that do not line up are counted on every floor, as before.
  No new code in the record.
