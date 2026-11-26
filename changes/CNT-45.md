# 2026-11-26: fixtures and furniture written, placed, moved and taken out (CNT-45)

## For people

- Rooms text writes fixtures and furniture in `item` lines: `item tub "Bath 1700" bath 1.7 x 0.7 in
  bathroom against north, at west` stands the bath against the north wall in the west corner,
  turned to face into the room; `full width` makes a built-in wardrobe the length of a wall, and
  `at x,y turn 90` places an item by its middle. `grid describe --as rooms` writes them back, and
  `raw item` takes Grid's own JSON (CNT-45).
- The tool server adds `grid_add_item`, `grid_move_item` and `grid_remove_item`, so an agent can
  put, move, turn and take out a fixture or a sofa without editing the plan file (CNT-45).
- A fixture or a piece of furniture against a wall now moves with that wall when a room side is
  moved, a wall is made thicker or the plan is written again from rooms text (CNT-45).
- `grid_find` and `grid_count` find and count fixtures and furniture, `grid_view` lists the items
  it draws with their boxes, and `grid_schedule of=fixtures` lists them; a phone scan brings in its
  furniture and appliances, and keeps whether each door was seen open (CNT-45).

## For agents

- New tools `grid_add_item` (name, room, against, end, from with distance, full_width, or x, y,
  turn; width, depth, height, clearance, label), `grid_move_item` (id, then a new place, turn, or
  dx and dy) and `grid_remove_item` (ids, or room). Each answers with `item`, `fits` and
  `worthALook` (`removed` for the last); 50 tools in all.
- Rooms text takes `item` lines and `raw item` (also `raw fixture`, `raw furniture`); a refusal
  of one is `rooms/item`. `grid_write_rooms` with item lines replaces the file's items, and says
  so in place of the items kept.
- Every change's answer says when an item standing against a wall that moved moved with it, and
  `drawingProblems` gains `items`: the notes on fixtures and furniture before and after, also said
  in the "To look at" line when either is not 0.
- `grid_fields`, `grid_find` and `grid_count` take `kind` `fixture` and `furniture`, with the
  fields `item kind`, `label`, `library`, `room`, `depth`, `turn` and `clearance`, and `width`,
  `height` and `rooms` for items too. `grid_set_facts` still takes the six kinds that carry facts.
- `grid_view` kind=plan lists the items drawn and gives their `boxes` (kind `fixture` or
  `furniture`). `grid_schedule` takes `of=fixtures`.
- A scan's sink, bed, table, sofa, chair, storage and appliances become items (an appliance is
  `storage`, labelled with what the scan calls it); a door the capture saw open or closed carries
  `properties.scannedOpen`. No new code in the record.
