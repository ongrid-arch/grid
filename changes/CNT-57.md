# 2026-11-27: rooms grouped by room type, tenure and the person's own groups in every tool (CNT-57)

## For people

- Rooms can be counted, listed, coloured, cropped, scheduled and briefed by the group they belong
  to: the firm's room type (asked as `type` too), the tenure, or a household, department or zone
  written as a fact of your own. The room schedule and the sheet give each room's room type and
  tenure, and on a plan read in square feet, a count by area groups and prints in square feet
  (CNT-57).

## For agents

- `grid_count`, `grid_find`, `grid_view colour` and `crop` take `type` for the room type, unless
  a part carries a fact named `type`. `grid_fields` adds `values` and `count` to the `room type`,
  `tenure` and `flat type` fields the rooms state. `grid_count by=area` groups areas at the
  printed precision of the plan's area unit (whole square feet on a plan read in square feet)
  and its text gives them in that unit. `grid_schedule of=rooms` rows carry `roomType` and
  `tenure`, and the CSV their columns, on a plan where a room states one. A brief's `fact` scope
  reads `room type` and `tenure` as well as facts. No new code in the record.
