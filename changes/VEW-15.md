# 2026-11-25: a drawing's notes are the check's notes (VEW-15)

## For people

- A drawing, a picture from an agent and a comparison of two versions no longer mark walls,
  doors and library fixtures as having "a field Grid does not know" for fields Grid wrote
  itself (a height taken from the floor, a named type, a library entry, a wall placed by its
  face). The numbered notes on a drawing are the ones `grid check` lists (VEW-15).

## For agents

- `grid draw`, `grid_view` and `grid_diff` number notes from the same input as `grid check`
  (the plan file as written), so a note on a drawing carries the number `grid check` gives it
  and `grid_diff` no longer opens with `note_added` issues for `unstated`, `typed`, `fromLibrary`
  or `placedBy`. A file that writes one of those fields itself is still told it is not read.
  No new code in the record.
