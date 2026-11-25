# 2026-11-25: plot coverage leaves open outdoor space out and gives both figures (ARE-24)

## For people

- The plot coverage is now the enclosed building over the plot: open outdoor space, such as a
  terrace, a pool deck, a garden or a balcony, is left out of it, as it is of every area, and a
  roofed one such as a porch still counts. A plan that has open outdoor space also gets the figure
  with it counted, said apart, and each set-back distance is given to the enclosed building with the
  distance to the open outdoor space beside it (ARE-24).

## For agents

- `grid_measure what=site`: `coverage` and each boundary edge's `distance` are to the enclosed building
  (`coverage.openOutdoorLeftOut` says open outdoor space was left out). On a plan with open outdoor
  space, `coverageWithOpenOutdoor` (ratio, percent, covered, plot) and each edge's
  `distanceWithOpenOutdoor` give the figures with it counted; both are null when there is none. The
  text says "With the open outdoor space counted as building" and "(the enclosed building)". The brief's
  `plot_coverage` wish is measured on the enclosed building. No new code in the record.
