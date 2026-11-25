# 2026-11-25: grid_diff between two versions lists a part whose phase changed (MSG-25)

## For people

- `grid diff` against a marker or the last commit now lists every wall, door, window or room whose
  phase changed, with its phase before and after (`Window "win-bed1" now to be demolished (was
  existing), in "Bedroom 1"`), counts it in the verdict and marks it as changed in the picture.
  Before, a window blocked up since the marker was left out of the comparison (MSG-25).

## For agents

- `grid_diff` with `since` a marker or `git`: a wall, opening or room whose phase (existing,
  demolished, new) changed is a change line, `<part> now <phase> (was <phase>)`, with the part in
  `entities`, and is among the walls, openings or rooms the picture marks as changed. A wall's
  phase is one of its own figures, so a plan written rooms first lists it too. An opening that
  states no phase follows its wall and has no line of its own. `since: "phase"` answers as before.
  No new field and no new code in the record.
