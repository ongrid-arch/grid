# 2026-11-25: polygon points read with their unit (WRT-62)

## For people

- A room drawn as a polygon in rooms text takes its points with units, as a size does:
  `polygon 0,0 40ft,0 40ft,25ft 0,25ft`. A point Grid cannot read is refused naming its word,
  where it was refused before as a polygon of fewer than three points (WRT-62).

## For agents

- `grid_write_rooms` and `grid write`: polygon points take `10ft,0ft`, `12'6",4m`, `360cm,0` and the like.
  A point with a length Grid cannot read is refused as `rooms/units` or `rooms/syntax` naming the
  word. A polygon with a unit in any point is taken as meant, so no `rooms/size-question` is asked of
  it; a long polygon reads back (`describe --as rooms`) with `m` on its points. No new code in the
  record.
