# 2026-11-25: one rule for counting the rooms the net area counts (CNT-27)

## For people

- Counting rooms and adding up their areas now agrees with the area table everywhere. A stair or
  a lift drawn as a room on floor after floor is one shaft, counted once, on the floor it rises
  from, in counts, the room schedule, the brief and comparisons; voids and outdoor spaces are left
  out of counts as they are of the net area. Each tool lists what it left out and why, so a
  schedule's rows add up to its totals and an area sum by department is the net area. Ask for
  stairs counted on each floor when you want them per floor (CNT-27).

## For agents

- `grid_count`: rooms are counted as `grid_areas`' net counts them. A stair or lift room over the
  lowest room of its shaft, a void and an outdoor space are in no group and no total, as a zone
  already was; `notCounted` lists each (`id`, `floor`, `why`: `zone`, `shaft`, `void`, `outdoor`,
  and `with`, the room a shaft room is counted with) and the text names them. A room's `area` sum
  is the net. New argument `stairs`: `once` (the default) or `per floor`, which counts each
  floor's stair and lift rooms with their areas and says the sum then holds them on every floor;
  the answer gives `stairs`. A room's area is found by its floor and id.
- `grid_schedule of=rooms`: a row in no total carries `notCounted` (`why`, and `with` for a shaft
  room), the text says `in no total: …` on it, and the CSV gains a `not in totals` column when a
  row has one. Each floor's and the whole schedule's `rooms` count the rows that count, so the
  rows that count add up to the totals. "1 room", not "1 rooms".
- `grid_areas`: a void says it is in no figure in the text, and its CSV `counted` cell is `void`
  (it was `inside`); a lift room over a lift says `the lift it rises from` and `with the lift
  below`.
- The brief: a count of rooms by name or use counts a stair or lift shaft once, and says so.
- `grid_compare`: an option's `rooms` counts rooms as `grid_count` does. The verdict of every
  change (and `grid_compare` of a plan changed in place) counts a shaft that was added, taken out
  or changed in size once, on the floor it rises from.
- No new code in the record.
