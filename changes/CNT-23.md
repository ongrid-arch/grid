# 2026-11-25: use indicators on a plan with thousands of items (CNT-23)

## For people

- Asking Grid for a room's use indicators (the turning circle, doorway widths, the way through and
  the floor round each fixture) on a plan with thousands of items, such as a hall of chairs, now
  answers in seconds instead of running for minutes. A room is measured against the items that
  stand in or against it, and the figures are the same as before (CNT-23).

## For agents

- `grid_measure what=use` answers in about a second of work for a room on a plan with 2,000 items
  elsewhere, and in a few seconds for a room that holds them. Only the fixtures in or against the
  room are measured against; the answer is unchanged. No new code in the record.
