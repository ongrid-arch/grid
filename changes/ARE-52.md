# 2026-11-25: a wrong brief line refuses only itself (ARE-52)

## For people

- A brief with one wrong line (a wish said by the person with no quote, a number out of range)
  now keeps the lines that are right, and says which line was left out and why, instead of
  refusing the whole brief (ARE-52).

## For agents

- `grid_write_brief` reads the brief line by line. A wrong room, touch, open or figure line, or
  a wrong footprint, is left out and returned in `refused` (`where`, `problem` and `line`, the
  line as sent); the other lines are written. Mend the refused line and send the whole brief
  again with `replace: true`. A brief with no line it can read is refused, naming each line; a
  fault in the brief as a whole (not an object, an unknown field, a wrong version) still refuses
  the call. A brief file read from disk is still read whole. No new code in the record.
