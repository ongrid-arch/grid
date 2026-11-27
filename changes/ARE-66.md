# 2026-11-27: the brief reports each corridor at its narrowest point (ARE-66)

## For people

- The brief gives each corridor's narrowest width and where it occurs, including corridors
  that meet the requested width (ARE-66).

## For agents

- The brief returns a `corridor_width` line for each measured corridor, with its room in
  `parts` and its width in `drawn`. Its verdict uses the same tolerance as
  `grid_measure what=access`. No new code in the record.
