# 2026-11-26: count, total and find rooms by type, tenure and flat (ARE-61)

## For people

- A room's own type ("B2 double bedroom"), its tenure and the flat it is in can now be counted,
  totalled and searched, so "how many of each type" and "how much private floor against common"
  are one question. The areas and the comparison show the net floor by room type and by tenure
  on a plan where a room states one (ARE-61).

## For agents

- `grid_fields`, `grid_find` and `grid_count` take four new fields on a room: `room type`,
  `tenure`, `flat` (the id of the flat that holds it) and `flat type` (the type's name, else its
  id). A room with none is "not stated" in a count. A fact of your own with one of these names is
  asked for as `properties.<name>`. `grid_areas` adds `byRoomType` and `byTenure` (net area, "not
  said" for a room with none) to each floor and to the building, with the state of each on the
  floor's `states`, and each room says its `roomType` and `tenure` where stated; `grid_compare`
  options add the same two totals. They are left out of a plan where no room states one.
  No new code in the record.
