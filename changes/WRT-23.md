# 2026-11-25: door and window marks and room numbers stay put across edits (WRT-23)

## For people

- A door or window keeps its mark: an id that already is a mark (`W3`) is shown as it is, and a
  mark you state (the fact `mark` on the opening) is the one the schedule shows, so taking out
  another window no longer renames it.
- Adding or taking out a room no longer renumbers the others. When a change would move a room's
  number, it writes the numbers the rooms had, so the schedule and the IFC space names hold.

## For agents

- `grid_schedule` (openings): an opening's mark is its stated fact `mark`, else its id when that
  is its type's letter and a number (`D2`, `W3`, `O1`), else the next free count of its letter.
  A mark two openings claim is the first's.
- A change that would move a room's shown number (a room added, split, merged or taken out) now
  writes `number` on every numbered room, with the new room taking the next free whole number.
  A change that moves none writes none.
- No new code in the record.
