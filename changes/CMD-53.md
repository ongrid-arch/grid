# 2026-11-27: columns, and items and columns by the room they stand in, in grid_find and grid_count (CMD-53)

## For people

- `grid_find` and `grid_count` now ask about the plan's columns, and about any fixture, piece of
  furniture, point or column by the name or use of the room it stands in: "how many basins in the
  toilets" and "which columns stand in the meeting rooms" are each one question (CMD-53).

## For agents

- `grid_fields`, `grid_find` and `grid_count` take `column` in `kind`, and list the plan's columns
  after its items (a column the drawing's checks leave out is not listed; a column carries no
  facts). A column's fields: `column shape` (`square` or `round`), `width`, `depth`, `height` (how
  high it rises above its own floor), `turn`, `label`, `room`, `rooms` (every room it stands in on
  every floor it stands on) and `floors` (its own floor, then each it rises through). `floor`
  picks a column on every floor it stands on.
- New fields for items and columns: `room name` and `room use`, the name and use of the room
  `room` gives.
- `room` (the argument) now says it picks the items and columns standing in the room, as it did
  for items already. `grid_set_facts` is unchanged: it takes no `column`.
- No new code in the record.
