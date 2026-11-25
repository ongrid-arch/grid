# 2026-11-25: a straight wall that ends on a curved wall meets it (CNT-28)

## For people

- A straight wall that ends on a curved wall, at the curve's end or along it, is no longer said
  to run past its corner "where it meets no other wall" (CNT-28). The rooms a curved wall bounds
  now have their straight walls checked as other rooms do: one that really runs on past the end
  of a curve is still named, with the curved wall as its corner, and its fix moves only the
  straight wall.

## For agents

- `grid_check`, `grid check` and `grid tidy` no longer give `wall/overrun` for a straight wall
  whose free end lies on a curved wall. The wall faults now trace rooms a sound curved wall
  bounds: a straight wall in them may be given `wall/overrun`, `wall/gap`, `wall/short` (at a
  corner of two straight walls), `wall/crosses-room` or `wall/stands-in-room` as in any room. An
  overrun whose corner is with a curved wall names it among the fault's `walls`, and its fix and
  message never move the curved wall.
- No new code in the record.
