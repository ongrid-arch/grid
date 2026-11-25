# 2026-11-25: a column on a room line comes off every room it stands in (CNT-33)

## For people

- A column standing across a line between two rooms, such as a pier between a nave and its aisle, now comes off each room by the part of it that stands in that room. Before, it came off only the room holding its middle, so the rooms' net areas could be overstated by the floor the piers cover.

## For agents

- `grid_areas`, `grid_describe`, `grid_check`: a column is clipped to every room on its floor it overlaps, and each of those rooms lists it under `columns` with its own share. The shares add up to the column's floor inside the rooms. A column wholly inside one room measures as before.
- No new code in the record.
