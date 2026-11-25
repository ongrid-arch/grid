# 2026-11-25: a split keeps the outdoor marks on both halves (WRT-30)

## For people

- Splitting an outdoor room, such as an open courtyard, now marks the new part outdoor and open
  or roofed like the room, so it no longer counts as floor inside the building (WRT-30).

## For agents

- `grid_split_room` copies `outdoor` and `roofed` from the room to the new room. No new code in
  the record.
