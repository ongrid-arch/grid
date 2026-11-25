# 2026-11-25: grid diff lists walls whose own figures changed, and names them in the rooms they changed (WRT-19)

## For people

- `grid diff` now lists a wall made thicker or thinner, another height or another kind in a plan
  written rooms first too, with its figure before and after (`Wall "ext-north" thickness 0.34 →
  0.30 m, by "Kitchen", "Hall" and "Bedroom 2"`). Before, a plan written rooms first in both
  versions listed only its rooms and openings, so a wall made thinner showed as rooms that grew,
  and a plan whose outside walls all became thinner read as the same building (WRT-19).
- A room that grew or shrank because a wall on its outline was made thinner or thicker, or (in a
  plan drawn wall by wall) moved, now says so: `"Kitchen" 13.20 m² → 13.29 m² (…), because wall
  "ext-north" went from 0.34 to 0.30 m thick` (WRT-19).

## For agents

- 2026-11-25, WRT-19: `grid_diff` (and `grid diff --json`) on a plan written rooms first lists in
  `changes` every wall whose thickness, height, kind, virtual, curve or floor changed, with the
  wall line `grid_diff` gives a plan drawn wall by wall, and every floor that changed; a wall whose
  only change there is its line is still left to the room lines. The verdict counts them as "wall
  or opening change". Each room in `rooms` has `walls`: the walls, by id, whose face on the room's
  side moved and which its area changed by (a wall another thickness, or in a plan drawn wall by
  wall one that moved), and its `text` ends `, because wall "<id>" went from <a> to <b> m thick`,
  `, because walls "<a>" and "<b>" went from …` or `, because wall "<id>" moved <d> m`. No new
  code in the record.
