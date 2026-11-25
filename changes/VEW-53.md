# 2026-11-25: every room a dividing line borders is named as open to it (VEW-53)

## For people

- `grid describe` names every room a dividing line borders as open to the room on its other side. A row of bays on one line is open to the corridor for each bay, where only the middle one was before (VEW-53).

## For agents

- `grid describe` and `grid_describe`: a dividing line lists one open side per pair of rooms that meet along it (`line v>b1`, `line v>b2`, ...), not the pair at its middle only; a wall line in the walls length lists each pair. No new code in the record.
