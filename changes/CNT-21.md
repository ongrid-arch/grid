# 2026-11-25: items that leave their room, and columns that stand in items or each other (CNT-21)

## For people

- Grid's check now names an item whose floor hangs out of its room, through a doorway, a window
  opening or an open side, and a column standing in an item (a rack, a cupboard, a fixture) or in
  another column. Items standing in each other were already named; the check is now held by tests
  for a unit half over two others, a vanity over a basin and a shower over the bath (CNT-21).

## For agents

- Three new codes in the record, all warnings: `item/leaves-room` (the item and the room, with
  the floor outside it in m²), `plan/column-in-item` and `plan/column-overlap` (both parts, with
  how far one reaches into the other, in `hits`). A new tolerance, `itemLeavesRoom` (0.005 m²). An
  item in a wall's body is still `item/into-wall` only. A column against or in a wall is not named.

## Codes

| `item/leaves-room` | {label} leaves its room | its whole footprint inside the room it stands in, or against its walls |
| `plan/column-in-item` | {label} stands in an item | every column clear of the items on its floor, against them at most |
| `plan/column-overlap` | {label} stands in another column | columns clear of each other, against each other at most |
