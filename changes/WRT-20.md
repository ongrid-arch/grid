# 2026-11-25: grid diff says a floor added or removed, with its rooms and their area (WRT-20)

## For people

- `grid diff` says a floor that was added or removed in one line, first, with how many rooms
  are on it and their net area: `Floor added: "First floor", 2 rooms, 26.32 m²`. A plan written
  again with a floor above it no longer says every room of the floor it had was moved to the
  ground floor: a room that stated no floor and now states the ground floor stands where it
  stood (WRT-20).

## For agents

- `grid_diff` and `grid diff`: a floor added or removed is the first change line, `Floor added:
  "<name>", <n> rooms, <area> m²` (or `no rooms`), its area the floor's net area as `grid_areas`
  gives it, and the verdict says it first instead of each room on it (they keep their own change
  lines and their entries in `rooms`, status `added` or `removed`); it is no longer counted as a
  "wall or opening change". A room whose floor was unstated and is now `ground`, or the other
  way round, is `unchanged`, not `changed` with "moved to floor "ground"". No new code in the
  record.
