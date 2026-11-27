# 2026-11-27: every floor side by side, and a crop of several rooms, a flat, a group or a box (VEW-74)

## For people

- Ask to see every floor and you get one picture: each floor side by side, the lowest on the left, at one scale, under its name, and lined up on the same part of the plan (VEW-74).
- A cropped plan can now frame several rooms at once, a whole flat, a group of rooms that share a fact (such as one household of a care home) or a box of the floor, with some space round it, so a room is no longer drawn edge to edge. A crop of rooms upstairs draws that floor without naming it (VEW-74).

## For agents

- `grid_view kind=plan` takes `floor: "all"` (unless a floor's id is `all`): every floor side by side in one PNG at one scale, each named and framed to the same part of the plan. It takes `look` and `dimensions` only; its answer has `floor: null`, `floors` (the ids, lowest first), the one `pxPerMetre` and no `boxes`, and no svg is made. Any other kind refuses it.
- `crop` takes an id (now an item's too), a room's name, a flat's id or name, a condition as `grid_find`'s `where` writes one (`household = Rose`; the rooms on the floor that meet it), or several of these joined by commas. With no `floor`, it draws the first floor holding them all. The answer says what was framed (`cropped to 2 parts together: room "a", room "b"`, `cropped to flat "f1" (3 rooms on this floor)`, `cropped to the 4 rooms where household = Rose`) and the margin.
- New `crop_box` (`{ "from": [x, y], "to": [x, y] }` in metres) frames a box, and `margin` (metres) sets the space round a crop or box: 0.5 round a crop and none round a box when left out. A single-part crop now keeps 0.5 m round the part, so its pixels per metre come out a little lower than before. No new code in the record.
