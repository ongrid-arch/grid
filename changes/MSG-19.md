# 2026-11-25: every seen mark Grid writes is read back (MSG-19)

## For people

- A note about a flat or an opening pattern can be set aside as seen, and the mark is read on
  the next check. Before, such a mark made the whole marks file unreadable, so every note came
  back as new (MSG-19).
- One mark that cannot be read no longer takes the others with it: the rest still count as
  seen, and the check says how many marks it could not read. "Marked" is said only when the
  mark can be read back from the file.

## For agents

- `grid_check` and `grid check`: `marksProblem` and the line "The seen marks were not all read"
  now also appear when only some marks were unreadable; the readable marks still set their
  notes as seen. `grid_mark_seen` refuses, as before, to write over a file with marks Grid
  cannot read, and refuses to answer "Marked" for a mark it cannot read back.
- No new code in the record.
