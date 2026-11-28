# 2026-11-28: a note, warning, refusal or diff line alike on many parts or floors said once (MSG-36)

## For people

- A note that is the same on many rooms, doors or floors is said once, with the parts or floors
  listed as runs ("the same on 35 floors: "l00", "l04" to "l37""). A mistake repeated along a row
  of units or on copied floors is one problem when rooms text is refused, like changes on many
  floors are one line of `grid diff`, and ids renamed by one pattern are said as that pattern
  (MSG-36).

## For agents

- `grid_check` and `grid check`: at least three lines of one code, kind, kind of thing, cause,
  figures and firm standard whose words and fixes match once the numbers in quoted ids are set
  aside are one line. Its `message` ends "(the same on N floors: ...)" or "(the same for N
  openings: ...)" (with "on M floors" when the parts are on several); `each` holds every part,
  `also` every other id, `held` and `fixes` every entry; `count` and `problems` count it once. A
  line that differs in a figure, and a line about the plan as a whole, stand alone. New limits
  `alikeLines` (3) and `alikeRunsShown` (12) in the tolerance table.
- A refusal of rooms text (`grid write`, `grid_write_rooms`, building edits) and the warnings of a
  write say alike problems once: the first, then "(the same for N more: 'door-102' to
  'door-104')".
- `grid_diff` and `grid diff`: the words say alike issues, change lines and openings that moved
  or stayed once; the data's `changes`, `issues`, `stayed` and `movedWith` keep every line. The
  verdict's renamed ids add the one pattern most share, "40 of them by one pattern, "l01" now
  "l02"" (or "... "f1-" added", "... taken out").
- No new code in the record.
