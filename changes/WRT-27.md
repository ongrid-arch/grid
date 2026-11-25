# 2026-11-25: raw lines on the floor they are written under, and counted (WRT-27)

## For people

- In rooms text a `raw wall` or `raw room` with no `"floor"` is now on the floor of the floor
  line above it, as a room line is, where it used to land on an unstated ground floor and the
  check then found walls on an unknown floor and rooms overlapping the floor below (WRT-27). A
  raw part that names a floor the text does not write, or a raw opening written under one floor
  in a wall of another, is refused with its line.
- The answer to a write counts and measures the parts written raw with the rest: text that is
  all raw lines answers with its floors, rooms and inside area, not "0 floors, 0 rooms; 0.00 m²
  inside", and a line says how many walls, rooms and openings were written raw.

## For agents

- `grid_write_rooms` and `grid write`: a raw wall or room with no `floor`, under a floor
  line, is written with that floor's id. One whose `floor` is no floor of the text is refused
  with `rooms/unknown-floor` and its line ("Line 7: raw wall 'p1' names floor 'roof', which this
  text does not write. Floors written: ground, upper. …"). A raw opening whose wall is on
  another floor than the floor line it is written under (and has no `through`) is refused with
  `rooms/raw` and its line. With no floor line nothing changes: a raw part gets no `floor`.
- The answer's first line counts the floors that hold a room or a wall, every room (raw rooms
  too) and their inside area by Grid's own measure; "walls … worked out" and "openings placed"
  count the ones Grid worked out. When parts were written raw a second line says "Written raw
  and kept as written: walls 4, rooms 1, openings 0. …". In the listing a raw room, wall or
  opening ends "written raw".
- `grid_write_rooms`' structured answer: `rooms` lists raw rooms with their sizes and areas, and
  `walls` and `openings` count the raw ones too. The core's `RoomsResult` gains `raw` (the
  counts), and its room and wall facts a `raw` mark.
- No new code in the record: `rooms/unknown-floor` and `rooms/raw` are rooms-text refusals.
