# 2026-11-25: change answers report true areas and counts (WRT-11)

## For people

- After a change, the areas and counts in the answer are the ones `grid areas` gives for the plan
  as it now is. A split names the real new area of both rooms and says a room has no window only
  when it has none; one rename is "1 room renamed"; a change on a tall building counts rooms by
  floor ("92 rooms (2 on each of 46 floors)"); a door that swings the other way is "1 opening
  changed", never "the plan mirrored" (WRT-11).

## For agents

- The `verdict` of every changing tool counts rooms by floor and id, not by name, in the kinds
  renamed, used differently, differ in size, added and taken out ("1 room renamed", "92 rooms (2 on
  each of 46 floors) differ in size"), and counts openings ("1 opening changed", "1 new opening").
  Its net area is `grid_areas`' net, measured the same way before and after, so writing the same
  rooms again is "the same building". `grid_split_room` answers each room's net area as
  `grid_areas` gives it, also on a plan written rooms first, where it used to answer "→ 0.00 m²"
  and "no window now". Only `grid_mirror` and `grid_turn` say a plan is mirrored or turned.
  `grid_compare` and `grid_diff` take their net area from the same rule. No new code in the record.
