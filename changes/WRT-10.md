# 2026-11-25: two rooms stacked between two others are written, not refused as a gap (WRT-10)

## For people

- Rooms text writes a row where two small rooms stand one above the other between two larger
  ones, such as a bedroom, a toilet over a store and a living room, or a WC and a cleaner's
  store between two offices. It used to refuse it with `rooms/gap`, reading the end of the wall
  between the two small rooms as a gap as wide as the stack. The same goes for a WC cut out of
  a hall's corner, or a hall written as an L round a WC, with a room along that side of the
  hall. A gap that no wall explains is still refused (WRT-10).

## For agents

- `grid_write_rooms` and `grid write` no longer answer `rooms/gap` for a strip no wider than a
  wall that is the end of the wall between two other rooms; such rows are written. No new code
  in the record.
