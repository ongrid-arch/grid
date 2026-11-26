# 2026-11-26: a door or window that states all its sizes keeps out of the default type (CNT-39)

## For people

- A door or window that names no type and states every size the default type would give (width,
  height, and the sill for a window) is no longer counted as one of the default type, so a small
  loft window is not listed as a 900 x 1200 window in a schedule (CNT-39).

## For agents

- A door or window with no `doorType` or `windowType` that states every size its default type
  would fill reads with no type and no `typed`; one that leaves a size out still takes the default
  and fills only that size. No new code in the record.
