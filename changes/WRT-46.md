# 2026-11-25: a rewrite from rooms text says which items it kept, and a taken id names its holder (WRT-46)

## For people

- Writing a plan again from rooms text keeps its fixtures and furniture where they stood, as it
  always did, and now says so: how many it kept, each one with the room it stands in now, and,
  at once, any the new walls run into or leave in no room. The count of problems in the drawing
  after the write now counts those items too. A refusal of an id that is taken names the part
  holding it and where it is, such as `bed "bed-1" at (1.90, 1.50) in room "Bedroom"` (WRT-46).

## For agents

- `grid_write_rooms` (and `grid write`) answer a line "Kept the plan's N items where they stood"
  naming each (at most ten, then a count), saying that their ids stay taken and that they are
  changed in the plan file's `items`; then "Worth a look: …" with the check's own sentence for each
  kept item that runs into a wall (`item/into-wall`) or stands in no room (`item/outside-rooms`),
  at most five. Its data has `itemsKept`: each item's `id`, `kind`, `at`, `floor`, `room` (its name,
  or null) and `worthALook`; an empty list for a plan with none and for a scan. `grid write --json`
  has it too.
- `drawingProblems.after` of a rooms-text write counts the plan as written, with the items,
  columns and other parts the file keeps, as `before` always did.
- `grid_place_item` with an `id` a part holds is refused before the library looks, naming the part
  and where it is (an item by its kind, place and room; a room by its name and id; a wall by its
  ends; an opening by its wall; a column by its place). `grid_add_room` and `grid_split_room` name
  the holder of a taken id the same way, and now take an item's or a column's id as taken too.
- No new code in the record.
