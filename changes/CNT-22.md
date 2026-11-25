# 2026-11-25: curved walls no longer break the gross internal area or the room edits (CNT-22)

## For people

- A floor with curved outside walls, such as a tower plate with round corners, gets its gross
  internal area, and so does the building: before, about one such floor in five had none, and the
  building none at all. When Grid cannot cut the walls from a floor, it says so in its own words,
  and no answer or sheet cover prints a polygon library's error. Merging two rooms that share a
  straight wall works when either room, or a room nearby, has a curved wall; the curve is left as
  it was (CNT-22).

## For agents

- `grid_areas`, `grid_sheet` and every answer that gives a gross internal area: a floor whose
  outside walls are curved gets its gross internal area where it was often `null` before. A floor
  whose walls cannot be cut or joined says why as "the outer walls could not be cut from the floor:
  their shapes are too close to tell apart" or "the walls could not be joined: their shapes are too
  close to tell apart" (`issue.part.notJoined` has no `{error}` any more), never with the polygon
  library's message.
- `grid_merge_rooms` is refused for a curved wall only when it is the wall the two rooms share; a
  curved wall round either room, or elsewhere on the floor, is kept as it is, and the merge no
  longer fails with "something went wrong inside Grid". The edits that seat openings again
  (`grid_move_room_side`, `grid_stretch`, `grid_square_scan`) leave an opening on a curved wall they
  do not change where it is, also one kept from a room's face. No new code in the record.
