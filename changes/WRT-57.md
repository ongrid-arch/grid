# 2026-11-25: an entrance door stays leading outside when a room is carved beside it (WRT-57)

## For people

- A store or other room carved in the corner of a hall, beside the front door, no longer ends
  with the door quietly leading into the store. When the door's side is refused for not saying
  which of its walls is meant, Grid no longer offers only the line that would put the door in
  the store's wall: it says the side onto the outside is too short for it. A rooms text written
  over a plan names each door that now joins other rooms, a door that no longer leads outside
  first, and counts what `grid check` will list, routes out and all, beside the drawing
  problems ("To look at: 0 → 2, of them problems in the drawing 0 → 0") (WRT-57).

## For agents

- `grid_write_rooms` and `grid write`: a `rooms/no-side` refusal of a `door` or `opening` line
  written in a side partly onto the outside no longer offers, as its only `fixes`, lines that
  place it in a wall to a room; it then offers none and says that the door would lead into that
  room, not outside, with the side's word for a door meant so. A window is offered as before.
  The answer over an existing plan has `toLookAt` (`before`, `after`: the check's `count`, as
  an edit's answer has it; null for a scan) and `doors` (each door that now joins other rooms,
  as an edit's `doors`, one that no longer leads outside first, starting "No longer leads
  outside:"; empty for a scan). The line "Problems in the drawing: a → b." of a rooms-text write
  is now "To look at: c → d, of them problems in the drawing a → b."; `drawingProblems` is as
  it was. No new code in the record.
