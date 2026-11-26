# 2026-11-26: windows in elevation with frames, lights, sills and heads (VEW-63)

## For people

- A facade now draws each window as it is built instead of one thin rectangle: its frame, a sash
  for each part that opens, its glass in a tone of its own with the bars where two panes meet, a
  sill under it and a head over it. The window's kind decides its panes: a fixed window one, a pair
  two with a bar between, a casement that opens in part beside a fixed pane, a sliding window two
  sashes passing. A kind given by the window's type is drawn too. The sill and head are Grid's own
  drawing sizes (0.05 m and 0.15 m deep): the plan holds none (VEW-63).

## For agents

- Each window on a facade (`planFacade`, so `grid_view` with a facade and `grid draw --facade`)
  carries `window`: its `kind`, the `members` of its frame and sashes farthest first, its `lights`,
  and its `sill` and `head` (null where its wall has no room), each a rectangle in the facade's `u`
  and `z`. They are the parts the 3D view and the exports hold. Doors and doorless openings carry
  none. Two new drawing sizes in the tolerances table: `facadeSillDepth` and `facadeHeadDepth`.
  No new code in the record.
