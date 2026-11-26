# 2026-11-26: a stair or lift through to the roof is entered from the roof terrace (LVL-19)

## For people

- A stair or a lift written once with `through <floor>` up to a roof floor is now entered there: on
  a floor where no door is written into it, it takes up its doors from the floor it is written on,
  in the same place, into the room of that floor its wall is shared with, such as the roof terrace.
  So the terrace and the lift on the roof are no longer said to have no door, and the roof is
  joined to the ground floor by the stair (LVL-19). A floor that writes its own door into the stair
  keeps it and gets none, and a door whose place faces the outside up there is not carried.

## For agents

- `grid_write`'s answer has a new warning, `rooms/door-carried`, naming each door carried up, with
  the floor it is written on, its new id (the floor's id in front) and the room it now leads into.
  The plan file holds the carried door like any other, and reading the plan back writes it as that
  floor's own door line.
- No new code in the record.
