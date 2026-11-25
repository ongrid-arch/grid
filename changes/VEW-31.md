# 2026-11-25: dimension chains, grid bubbles and view marks keep clear of each other (VEW-31)

## For people

- On a plan picture, a structural grid's names in their circles now stand past the outermost
  dimension chain on their side, and the grid's own spacing moves out with them, so a bubble no
  longer sits over a figure and a number is no longer misread. Two chains that lay on one line are
  pushed apart, a side prints its overall size once, and a figure a tick or an extension line
  would cross waits for a zoom in. An elevation mark and the head of a section keep off the
  bubbles and the chains (VEW-31).

## For agents

- Pictures (`grid_draw`, `grid draw`, `grid sheet`) lay out dimension chains, grid bubbles and view
  marks against each other. A thin wall's figure that has no room between its ticks is left out of
  the picture, as a figure with no room already was. The dimensions the tools report are unchanged.
  No new code in the record.
