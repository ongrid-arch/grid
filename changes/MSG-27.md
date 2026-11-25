# 2026-11-25: walls paired by their line, the massing and the site compared (MSG-27)

## For people

- `grid diff` and its picture read a wall by where it stands. A party wall made longer is the
  wall it was with a new stretch, even when the rewrite gave it a new id or cut it in other
  pieces: the picture draws it pale with only the new stretch in green, and in a plan drawn wall
  by wall the change says `Wall "b" extended 4.00 m`. A wall cut back shows only the stretch it lost in red. A
  wall that no longer stands where it stood, such as the back wall of a kitchen taken 4 m
  further out, is drawn red where it stood and green where it stands, whatever its id. A door or
  window that did not move is no longer drawn as changed (MSG-27).
- Two rooms knocked into one are drawn as one changed room labelled with its sum, `Living room:
  18.48 + 13.20 + 0.44 = 32.12 m²`, and the room taken in is no longer drawn red as lost.
- `grid diff` and `grid_compare` read the massing and the site: each floor's outline, the homes
  and parking spaces it states, the buildings, the plot's boundary and the site's things are
  change lines, and the verdict ends with the figures that differ side by side (gross external
  area, plot coverage, the gross external area to the plot (FAR), homes, parking and each
  boundary edge's distance to the building). An option with two new blocks is no longer called
  the same building, and a tree cut down is a change.

## For agents

- `grid_diff`'s data gains `massing`: `lines` (each change to the massing or the site, also among
  `changes`), `figures` (`grossExternal`, `plot`, `coverage`, `far`, `homes`, `parking`, each
  `{ before, after }`, and `edges`, each `{ edge, name, before, after }`) and `sideBySide` (the
  sentence the verdict ends with, or null). `grid_compare`'s comparisons gain the same `massing`,
  its lines in the verdict.
- In the library, `compareBuildings(...).marks.stretches` lists the stretches a wall in both
  versions gained (`added`, on the later wall) or lost (`removed`, on the aligned earlier wall),
  `{ wall, kind, from, to, thickness }`; such a wall is no longer in `marks.changed.walls` for its
  length alone. A wall whose later centre line left its earlier thickness is in both
  `marks.removed.walls` and `marks.added.walls`. `marks.changed.openings` holds only the openings
  a change line or `movedWith` names. A room merged into another is not in `marks.removed.rooms`,
  and the room it went into is labelled with its sum. `compareBuildings(...).massing` and
  `compareMassing` give the massing and the site. `alignPlans` pairs walls left free along the
  line they share, and cuts several walls of one line as the later version cuts them (listed in
  `redrawn`).
- No new code in the record.
