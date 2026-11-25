# 2026-11-25: gross figures held in order, open courtyards out of both, a building measured apart (ARE-20)

## For people

- Gross external area is never below gross internal, nor gross internal below the net, without a
  word: a figure the drawing puts out of order is marked not proven, with why. A courtyard marked
  as outdoor space inside the walls is now out of the gross internal area too, also behind an open
  arcade, and `grid_areas` can measure one building apart from the one built against it
  (`apart_rooms`) (ARE-20).

## For agents

- `grid_areas`: a gross figure below one it must hold (gross internal below the net, gross external
  below gross internal or the net) is `not-proven`, and its state carries `why`, sentences that say
  which figure is short of which, by how much and why; the same sentences are in `notes`. A state
  with no reason has no `why`. An outdoor space inside the building's walls is out of gross internal
  as it was out of gross external, so a cloister's or a courtyard house's gross internal area is
  smaller than before. New argument `apart_rooms` (room ids) and, only with it, `apart`: `rooms`,
  `net`, `byFloor`, `toPartyWalls` (`grossInternal`, `grossExternal`, to the middle of each wall
  shared with the rest of the plan), `notCounted` and `state`. No new code in the record.
