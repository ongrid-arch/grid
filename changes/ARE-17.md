# 2026-11-25: the brief's corridor width is read at the corridor's narrowest point (ARE-17)

## For people

- A brief's `corridor_width` is now judged at each corridor's narrowest point from end to end, the
  same figure the accessibility measure gives, so a corridor that is narrow along most of its
  length is no longer met because one end is wide (ARE-17).

## For agents

- `grid_write_brief` and every change's brief lines: a `corridor_width` line reads the corridor's
  narrowest point, clear of fixtures, as `grid_measure what=access` does, and says "at its
  narrowest, at (x, y)". When Grid finds no two ends it falls back to the widest circle and says
  so. No new code in the record.
