# CNT-21: name items that stand in each other, items that leave their room, and columns that clash

## Outcome

- When a unit stands half over two others, a vanity over a basin, or a shower on the bath, `grid
  check` names both items and how far one reaches into the other (`item/overlap`). Items that only
  touch, within the item overlap tolerance, are not named. This already worked for a plain pair
  (CNT-20); this change holds it with tests for those cases and keeps it so.
- An item whose footprint reaches past its room's floor where there is no wall, through a
  doorway, a window opening or an open side, is named with the room and the floor it takes
  outside it (`item/leaves-room`). A footprint that runs into a wall's body is still
  `item/into-wall` only, never both.
- A column standing in an item (a rack, a cupboard, a fixture) or in another column is named with
  both parts and the depth (`plan/column-in-item`, `plan/column-overlap`). A column against an item's
  face, within the same tolerance, is not.

## Design

- `geometry/items.ts`: `itemIssues` gains the leaves-room check. The footprint, less the room's
  floor and less every solid wall slice of its floor, is what is left outside; if its area passes
  the new tolerance `itemLeavesRoom` (0.005 m², Grid's own, in `tolerances.ts` and
  `docs/tolerances.md`), the item is named. Computed with the polygon library already used for
  `itemFloorTaken`, and skipped for an item in no room (`item/outside-rooms` says that already).
- `geometry/columns.ts`: `columnClashIssues(plan, items)` checks each sound column against the
  other sound columns and the sound items on the floors it stands on, with `convexPenetration` and
  `tolerance('itemOverlap')`. It is called from `validatePlan` next to `columnIssues`, after the
  items are checked, so left-out items are skipped.
- Decision: a column against or in a wall is not named. A column in a wall line is ordinary
  building; items against walls are already `item/into-wall`.
- Decision: the leaves-room check covers every item kind, not only fixtures, because a bed through
  a doorway is as wrong as a basin.
- Words: `issue.item/leaves-room`, `issue.plan/column-in-item`, `issue.plan/column-overlap` and their
  `line.*` triples in `messages/en.ts` (source) and `es.ts` (draft); catalogue entries; docs rows
  in `docs/plan-file.md` and `docs/tolerances.md`; fragment `changes/CNT-21.md`.

## Done

- Tests: overlap cases (half over two others, vanity over basin, shower over bath, abutting
  units); leaves-room (through a doorway, flush against a wall is silent, in a wall is
  `item/into-wall` only); column in rack, column in column, column against a rack is silent.
- The tolerances, contract, ownWords and conventions tests pass; typecheck, lint and scoreboard
  hold.
