# 2026-11-26: a place written on a polygon room is refused (WRT-63)

## For people

- A room drawn as a polygon in rooms text stands where its points say. `at x,y`, a side or a
  corner written on the same line is refused, where `at` moved the room by that much and a side or
  corner was dropped, both without a word. For `at`, the refusal gives the points moved, ready to
  write (WRT-63).

## For agents

- `grid_write_rooms` and `grid write`: a polygon room line that also holds `at x,y`, `<side> of
  <room>` or `inside <room> corner <c>`, before or after the points and in a unit too, is refused
  as `rooms/syntax`. For `at`, the message holds the polygon with its points moved by the `at`, in
  metres, to write in its place. No new code in the record.
