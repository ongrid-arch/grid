# 2026-11-25: a room keeps its written size when a side of it is opened (WRT-41)

## For people

- In rooms text, a `wall between <a> and <b> virtual` line written after the rooms now places them against each other, as `open` on the room line does, so each keeps the inside size written for it and every reading gives the same area as the write answer. This holds for a unit or a repeated row placed beside the room it is opened to, and for a unit's own rooms (WRT-41).

## For agents

- `grid_write_rooms` and `grid write`: a room placed beside another (`east of`, `north of` and the like) that a `wall between ... virtual` line on the same floor opens to it is placed against it with no wall's width between them, wherever the line is written; a unit placed beside a room goes against it when every room on its facing side is opened to that room; a `gap` on the place line still wins. The rooms placed after move by that width. The `rooms/area-differs` note these rooms gave is gone. Rooms placed `at x,y` or as polygons are not moved. No new code in the record.
