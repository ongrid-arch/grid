# 2026-11-26: the whole rooms grammar in the tool texts, and rooms text from a file (CMD-38)

## For people

- `docs/rooms-first.md` has every line rooms text takes, by topic, with an example each: floors with their elevation, copies and rooms through floors, polygons, curved walls, raw parts, outdoor rooms, heights, open sides, roofs and repeated units (CMD-38).

## For agents

- `grid_write_rooms`: its `rooms` argument carries the whole rooms grammar, each topic with an example, and its description names what rooms text writes beyond rectangles. A new argument, `roomsFile`, takes the rooms text from a file in the project in place of `rooms`; passing it with `rooms`, `layout` or `scan` is refused. A new resource, `grid://guide/rooms`, serves the grammar as markdown. No new code in the record.
