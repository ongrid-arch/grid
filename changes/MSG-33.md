# 2026-11-27: every error found in one refusal (MSG-33)

## For people

- A call or a rooms text with several mistakes is now refused with all of them at once, so they
  can be put right in one go: rooms text lists every independent line problem (sizes, units,
  unknown rooms, overlaps), a tool lists every missing, unknown or unreadable argument, and the
  brief names every fault of a wish and keeps the rest of the brief when it holds a field it
  does not take (MSG-33).

## For agents

- `grid_write_rooms`, `grid write` and a building's rooms text are refused with every
  independent problem of the text, each with its line and code, in line order; a line that fails
  only because a refused line before it names a room is left out. The codes are as before.
- Every tool's argument check reports all its faults in one refusal: the first line is
  `<tool> was not run: put these <n> right and call it again.`, then one `- ` line per fault, in
  the words each fault had before. A call with one fault is refused as before.
- `grid_write_brief`: a refused line's `problem` names every fault of that wish, joined by `; `.
  A top-level field the brief does not take, a list that is no list and `figures` that is no
  object are now refused lines (`where` the field) and the rest of the brief is written.
- No new code in the record.
