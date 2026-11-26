# 2026-11-26: a room cut from a corner may span a whole side (WRT-66)

## For people

- A room cut from a corner (`inside <room> corner <c>`) may now be exactly as wide or as deep as
  the room it is cut from: a cupboard under a stair as wide as the stair, a sleeping loft across
  the whole width of a cabin. It is written as a strip with one dividing wall, or a dividing line
  with `open`. A size that with its wall comes to the whole side takes the whole side, and the
  answer says so. A cut that does not fit is refused with the sizes that do (WRT-66).

## For agents

- `grid_write_rooms` and `grid write` accept `inside <room> corner <c>` for a room whose width or
  depth equals the host's side there, or does with its wall; the host keeps a rectangle and one
  dividing wall. Such a size, stretched to the whole side, is listed in `guesses`
  ("'<room>' spans the whole <n> m side of '<host>' …"). The `rooms/inside-corner` refusal now
  names the width and depth under which a cut fits and the whole side's width and depth; a room
  as wide and as deep as its host is refused as filling it, and a strip whose host does not go on
  square past the side is refused with the advice to write it as a room of its own. The
  `rooms/overlap` refusal offers `inside <room> corner` to a room as wide or as deep as the other.
  No new code in the record.
