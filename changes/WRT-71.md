# 2026-11-26: the write answer says when the rooms were written raw (WRT-71)

## For people

- Writing rooms text made of `raw` lines (such as the read-back of a plan rooms text cannot give
  back) answers with the floors, rooms and inside area written, and says on the count that the
  rooms were written raw: "2 floors, 5 rooms (all written raw); …", or "(1 written raw)" when some
  were. An earlier build answered "0 floors, 0 rooms" for such a text (WRT-71).

## For agents

- `grid_write_rooms` and `grid write`: the first line of the answer adds "(all written raw)" after
  the room count when every room was written raw, and "(<n> written raw)" when some were; a text
  with no raw room reads as before. No new code in the record.
