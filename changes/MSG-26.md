# 2026-11-25: a curved wall that changed is never the same building (MSG-26)

## For people

- Comparing two versions of a plan now looks at where a curved wall's curve stands, not only at
  its ends (MSG-26). A round room whose radius went from 3 to 4 m used to read as "Same building",
  the whole drawing moved 1 m east; it now reads as grown, with its area before and after and
  "because curved wall "round" went from a radius of 3.00 to 4.00 m". A curved room moved as it
  was still reads as the same building moved, and a curved wall drawn the other way round is still
  the same wall.

## For agents

- `grid_diff` and `grid diff`: two curved walls stand in the same place only when their centres
  do too, once the drawing is moved; the shifted origin is taken from the curves' full extent; a
  curved wall's centre moves with its ends when the earlier plan is laid on the later one, and a
  wall drawn the other way round turns the other way, so it is no change. A room whose floor
  changed names the curved walls on its outline whose radius changed (`walls` in its record), and
  a curved wall's change line says `radius {before} → {after} m` instead of `reshaped`. A curved
  wall is never taken as a piece of a straight one. No new code in the record.
