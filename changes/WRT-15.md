# 2026-11-25: room edits on a plan with phases write the work (WRT-15)

## For people

- On a plan with existing, demolished and new parts, merging, splitting, adding a room,
  stretching and moving a room's side now write the work: what stood before and is taken out or
  reshaped stays in the plan, to be demolished, and what the edit makes is new. A wall made longer
  stays and gets a new stretch; one made shorter keeps the stretch cut off, to be demolished; one
  moved is new, and the wall it was is kept as `<id>-before`, with its doors. A reshaped room is
  new, and the room it was is kept as `<id>-before`. These edits no longer refuse such a plan,
  fail on a door taken out of a wall the edit cuts, or leave a demolished wall across the new room
  (WRT-15).

## For agents

- `grid_merge_rooms`, `grid_split_room`, `grid_add_room`, `grid_stretch` and
  `grid_move_room_side` on a plan with phases: what stood before and the change takes out or
  reshapes is written with `phase: "demolished"` (a moved wall, a reshaped room and their doors as
  a copy with the id `<id>-before`, `-before-2` and on; a stretch cut off a wall as `<id>-before`),
  what it makes with `phase: "new"` (a stretch added to a wall as `<id>-new`); the part after the
  work keeps its id. The answer has two new lines, "Stood before the work and stays in the plan,
  to be demolished: …" and "New work in their place: …", and no longer "Could not keep: … changed
  in place" for these edits (a curved wall moved still says it). A door whose place along its wall
  changes only because the wall's start moved stays as it is, not new work. `doors` lists the
  doors of the building after the work. `grid_diff` with `since: phase` reads a room kept as
  `<id>-before` as the room `<id>` it became, so a merge reads as a room made bigger. No new code
  in the record.
