# 2026-11-26: stairs written in rooms text and through tools (LVL-21)

## For people

- A stair no longer needs the plan file edited by hand. Rooms text writes one in a line of its own, laid in a room (`stair st from ground to first in hall, 1 wide, U, runs north`, or `straight` and `L`, with `then west`, `along east` and `risers 16`) or along its own walking line (`..., 0.9 wide, run 1,1 1,4.5`), and `raw stair {...}` takes the plan file's own JSON. The stair is the plan's own, so the drawing's treads and break line, the sections, the 3D model, the IFC export and the way-out check show it. `grid describe --as rooms` reads every stair back as a line, and `grid write` keeps the file's stairs when the text writes none, and says so (LVL-21).

## For agents

- New tool `grid_add_stair`: `from` and `to` (floors, or rooms that stand for their floors), `width`, then `room`, `shape` (`straight`, `L`, `U`), `runs`, `then` and `along`, or `run` (the walking line, points as `"x,y"`); `risers`, `name` and `id` (`stair-<n>` when left out). Grid lays the walking line in the room, a landing as deep as the stair is wide at each end; an L turns on a square landing in the far corner, a U goes up one side and down the other with a short flight across the well. It answers as every change does, then with the risers, their height, the going, the pitch and the rooms at the stair's ends, and `stair` and `stairs` in the data; a stair that does not fit its room is refused naming the room's size.
- New tool `grid_change_stair`: `id`, then what changes (the same arguments; `risers` 0 leaves the count to Grid), or `remove`. The tool server lists 46 tools; the two come after `grid_set_facts` and before `grid_set_site`.
- Rooms text: the `stair` line and `raw stair`; `rooms/stair` refuses a stair line Grid cannot lay out, with its line, and `rooms/stair-end` says an end of one that lands in no room. `raw` now takes `wall`, `room`, `opening`, `floor` or `stair`. The answer's guesses give each stair's walking line and figures. The rooms grammar has a `stairs` topic. No new code in the record.
