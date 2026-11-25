# 2026-11-25: a mirrored plan written rooms first diffs as a mirror (MSG-21)

## For people

- `grid diff` after `grid edit mirror` on a plan written rooms first says only that the plan is
  mirrored and every room keeps its size, with no issues (MSG-21). Before, it listed every door
  as joining "a space that is not drawn" and said the earlier plan's rooms could not be drawn, so
  they were not compared.

## For agents

- `grid_diff` of a plan written rooms first that is the earlier one mirrored answers `issues: []`
  and every room `unchanged`, with the mirror said first. The comparison's mirrored copy of the
  earlier plan now prints each room's boundary again for its new order, as the mirror edit does,
  so no room reads as `room/derived-edited`; a room already edited by hand before the mirror
  still does.
- No new code in the record.
