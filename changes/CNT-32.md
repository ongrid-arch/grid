# 2026-11-25: a curved wall placed by its face stays as taped, and a taped corner on a curve is a corner (CNT-32)

## For people

- A curved wall placed by its face (`face` with `arc`) is now written back round its own curve
  (CNT-32). Before, every write of the plan (`grid write`, a change to a plan with named types,
  the rooms text's `raw wall` lines) moved its face square to the line between its ends, so a
  bow-fronted room taped on its inside faces came back with its curve off its ends and its outline
  crossing itself. It now reads as taped however often it is written.
- A length taped to a corner where a straight wall meets a curved one, or two curved walls meet,
  is set against the drawing like any other, where before it was said to be no corner of the
  room. Where the two walls meet at two corners (a half-round bay closed by one straight wall),
  the order the walls are named in, going round the room counter-clockwise, says which.
- A taped side along a curved wall counts only the curve, and is measured when the wall runs
  against the room's direction.

## For agents

- `grid_check`, `grid check` and every change's answer: a taped corner (`from`, `to`) naming a
  curved wall is now measured (`agrees` or `differs`, with `drawn`) instead of `not-measured` with
  `no-corner`, unless the two walls do not meet or meet at two corners the order does not tell
  apart. A wall named twice in a corner (`["c", "c"]`) still makes no corner. A taped side along
  a curved wall (`wall`) counts only the outline round that wall's own stretch of its circle.
- A curved wall placed by its face keeps its `start` and `end` as written through `grid write`,
  `grid_write_rooms`, `describe --as rooms` and the edits that re-read the plan.
- No new code in the record.
