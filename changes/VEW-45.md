# 2026-11-25: a door with no swing is said and drawn one way (VEW-45)

## For people

- A door with no swing stated is now described the same way everywhere: the write answer says
  "no swing stated" and what is drawn, the pictures draw it as a dashed line with "?" in every
  look (the working look as well as the technical one), and the check says its swing is not
  decided (VEW-45).

## For agents

- The write answer's note for a door written `no-swing` now reads "no swing stated (Grid draws a
  dashed line and "?" and does not check its sweep)" instead of "swing not decided (Grid draws a
  plain gap)". `grid_draw` and `grid draw` pictures in the working look now carry the undecided
  mark and list those doors, as the technical look already did. No new code in the record.
