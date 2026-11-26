# 2026-11-26: equipment items laid out in rows, with clear floor on any side (CNT-47)

## For people

- Grid holds equipment as items, never as walls: a rack, a generator, a pump, a tank, a fixed
  seat, a pew, an altar, a fume cupboard, a lab bench, a safety shower, a kennel, an exam table
  and a clinical sink, each drawn in 2D and 3D with a plain size in Grid's library, and
  `equipment` for any other thing, a box of the size and height it is given, called by its label.
  Equipment takes the floor it stands on and is counted by its kind (CNT-47).
- Rooms text lays one item out many times in a `row` line: `row r rack in hall against north,
  repeat 20, 10 rows every 2.4` writes 200 racks, `r-1-1` to `r-10-20`. `grid describe --as
  rooms` writes such a run of items back as one row line (CNT-47).
- An item keeps clear floor behind it and at its sides as well as in front: `clear back 0.6`,
  `clear left 0.9` in an item line, and Grid says when a wall or another item stands in it
  (CNT-47).

## For agents

- `grid_add_item` takes `repeat`, `every`, `rows`, `row_every` and `behind` to lay out rows in
  one call (ids `<id>-<n>`, or `<id>-<row>-<n>`; `placed` lists them all, `item` is the first),
  and `clear_back`, `clear_left` and `clear_right`. Still 53 tools.
- New kinds of item: `rack`, `generator`, `pump`, `tank`, `seat`, `pew`, `altar`,
  `fume-cupboard`, `lab-bench`, `safety-shower`, `kennel`, `exam-table`, `clinical-sink` (each
  also a built-in library entry of that name) and `equipment` (no entry: give width, depth,
  height and label). All are fixtures: `grid_find`, `grid_count` and `grid_schedule` take them as
  `fixture`, by `item kind`.
- Rooms text takes `row` lines and `clear back|left|right <m>` in item lines; a refusal of a row is
  `rooms/item`. The plan file's items may carry `clearSides` (`back`, `left`, `right`, metres).
- `item/clearance-blocked` is also said for the clear floor behind an item or at its left or
  right, in its own wording. No new code in the record.
