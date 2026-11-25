# 2026-11-25: one bad taped reading keeps the others (ARE-31)

## For people

- A taped length that cannot be read (a negative or zero length, a side with no wall, one corner
  alone) is left out with its own line, and every other taped length is still set against the
  drawing in the table (ARE-31).

## For agents

- The `taped` rows of `grid_check` and of every change's answer: an entry that cannot be read is
  a `plan/value-left-out` line at `taped[n]…` and has no row; the others keep theirs. A length
  that reaches the measuring without being a number above zero is a row with `state`
  `not-measured` and `missing` `bad-length`, never `differs`. No new code in the record.
