# 2026-11-25: outdoor spaces no door reaches, and every room fails the route when nothing leads out (ARE-40)

## For people

- A yard, courtyard or terrace that no door, opening or open side reaches is now said to have no
  door, as a room is (ARE-40).
- A floor with no way out now says so for each room that has a door, not only for the floor: none
  of them has a route out (ARE-40).

## For agents

- `room/no-door` now also reports an outdoor space (`outdoor` set) that nothing leads into; before
  it was left out. On a floor with no way out (`floor/no-exit`), each room that has some door gets a
  `room/no-route-out` line too (a room with no door keeps `room/no-door` only; outdoor spaces and
  voids get none). No new code in the record.
