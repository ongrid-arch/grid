# 2026-11-25: tidy cuts a corner as a corner, warns before sealing a space, and is a tool (WRT-36)

## For people

- `grid tidy` reads a wall drawn across a room's corner at an angle (a chamfered corner, a corner entrance) as the room's new face: its fix takes the corner outside, ends the walls it meets on it, keeps the door on it and moves the doors and windows on the corner onto it, instead of making the corner a room of its own (WRT-36).
- A split that would leave a part of the room with no way in says so in its fix (WRT-36).

## For agents

- A new tool, `grid_tidy`, after `grid_place_item`: with no `apply` and no `all` it lists the faults where walls meet (`faults`: `id`, `kind`, `floor`, `walls`, `rooms`, `message`, `fix`, `seals`) and writes nothing; with `apply` (fault ids) or `all=true` it makes those fixes on the plan or `out` and answers `applied`, `skipped` (`id`, `why`), `left` and `written`. The tools are 35.
- `crosses-room`: for a solid wall across a corner of a room at an angle, with the room's own outside walls round the corner, the fix now takes the corner outside ("take the corner beyond it outside: …") in place of the split; the openings on the corner move onto the wall, spaced evenly in the order they stood, with hinge and swing turned when it runs the other way, and a wall wholly beyond it is taken out.
- A split that leaves a part with no way in ends its fix with "Look before making it: it leaves room … with no way in, …", and `grid tidy --json` and `grid_tidy` list those rooms in the fault's `seals` (empty otherwise). `tidy --apply all` and `grid_tidy all=true` still make it.
- The `grid check` fix lines of the wall faults name `grid_tidy` beside `grid tidy`. No new code in the record.
