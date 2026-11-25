# 2026-11-25: a room cut out of a corner against a neighbouring room closes it with its own walls (WRT-53)

## For people

- A room cut out of a corner of another (`inside hall corner nw`) closes that corner with its own walls in a corner against a neighbouring room as in one against the outside walls, however small it is. A shelf recess or a duct in a hall's corner beside the living room no longer warns that the hall and the living room leave a gap, or gives them a wall as thick as the recess, and a small one no longer writes a plan whose rooms are not enclosed (WRT-53).

## For agents

- `grid_write_rooms` and `grid write`: a room placed with `inside <room> corner <ne|nw|se|sw>` in a corner the host shares with another room writes with no `rooms/wall-from-gap` warning and no `rooms/gap` refusal naming the host and that room, at any size: the end of the cut-out's wall seen across the corner is read as that wall's end, never as a wall or a gap between the rooms either side of it. Plans that used to get such a warning now get walls of the thicknesses the text states, and pass the drawing's own check where a small cut-out left a room not enclosed or a wall standing in a room. No new code in the record.
