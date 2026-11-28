# 2026-11-28: columns in openings and partitions, and columns in every clearance measure (ARE-80)

## For people

- Grid's check now names a column standing in a door or a window, such as a perimeter column
  drawn through the glass, and a partition drawn on through a column (ARE-80).
- The clearance measures keep clear of the columns as they keep clear of the fixtures: a column
  or a boxed riser in a corridor narrows its narrowest point to what is left beside it, and no
  turning circle is centred on it (ARE-80).

## For agents

- Two new codes in the record, both warnings: `plan/column-in-opening` (the column, the opening
  in `hits`, and how far it reaches into the opening's hole) and `plan/column-in-partition` (the
  column, the wall in `hits`, how far the partition reaches into it). A column in an item is still
  `plan/column-in-item`; a column in any other wall, or a partition that stops at or in one, is
  not named.
- `grid_measure what=access` and `what=use`, a wide route, the activity zones and the firm's
  standards measure clear of the columns on the floor: corridor narrowest points, turning space,
  doorway clear widths, ways through a room and the floor beside a fixture can be smaller on a
  plan with a column in a room's free floor. A line naming what a way passes, or what stands in
  front of a doorway, names a column by its id or label.

## Codes

| `plan/column-in-opening` | {label} stands in an opening | every column clear of the doors and windows in its wall, against their jambs at most |
| `plan/column-in-partition` | {label} has a partition drawn through it | a partition stopping at a column, or passing beside it |
