# 2026-11-25: a stretch carries the columns, grids, bays and site things beyond its line (WRT-24)

## For people

- Stretching a plan (`grid_stretch`, `grid edit stretch`) now moves everything beyond its line
  with the walls, not the walls alone: columns, parking bays, stairs and ramps beyond it move, a
  structural grid square to the stretch moves its lines beyond it and its spacing across the line
  grows by the distance, the site's fences, paths and trees beyond it move (one across it gets
  longer), and an opening pattern on a wall that grows keeps its doors or windows where they stood,
  at their pitch. Stretching a warehouse one 24 m bay to the east now takes its columns, bays and
  grid with it. What stays behind is named with why: a stair or ramp across the line, a grid
  turned across the stretch or drawn on a floor that was not stretched (its lines no longer reach
  the walls that moved), and the plot's boundary (WRT-24).

## For agents

- `grid_stretch` writes the columns' and bays' `at`, the stairs' and ramps' `run` (a run written
  as `start` and `end` is written as `run`), a grid's `origin` and spacing, the site's things'
  `points` and `at`, and a pattern's `margins.start` (its wall grew at its start) or `spacing`
  (a pattern of a count alone whose wall grew at its end: the pitch it had). Only those fields
  change; the rest of each record stays as the file had it.
- Its `changed` lines gain "{parts} beyond the line moved with it." (counts by kind), one line per
  grid spacing that changed ("Grid "main": lines 3 and 4 are 24 m apart now, 12 m more, so it
  still reaches the walls that moved.") and one per pattern kept at its pitch. `couldNotKeep`
  names a stair or ramp across the line or on a floor that was not stretched, and a grid turned
  across the stretch or drawn on such a floor, saying its lines no longer reach the walls that
  moved; `guessed` says the site's boundary stays where it was. A stretch that would leave two
  grid lines no distance apart is refused.
- The patch in the library's edits (`packages/cli/src/edit/edits.ts`) gains `parts`: fields set in
  the file's own records of the columns, grids, bays, stairs, ramps, patterns and site things.
- No new code in the record.
