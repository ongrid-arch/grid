# 2026-11-25: walls placed by a face stay true through edits, and one wall's thickness (WRT-38)

## For people

- A survey drawn by the faces the tape ran along stays as taped through Grid's changes: moving a
  side of a room carries every wall that ends on it, so none is left short, and a change's answer
  (areas, taped lengths, the brief) is what `grid check` gives on the written file. `grid edit
  wall --wall <id> --thickness <m>` sets one wall's thickness; a wall placed by its face keeps that
  face (WRT-38).

## For agents

- New tool `grid_change_wall` (after `grid_change_opening`; the server lists 36): `wall` and
  `thickness` set that wall's own thickness. A wall placed by its face keeps the face and grows or
  shrinks on its other side; any other wall keeps its centre line. Walls that ended in it and
  would end short of the thinner wall are carried to its new centre line; the answer names them.
  It refuses a dividing line, a curved wall and the thickness the wall already has.
- `grid_move_room_side` now carries the walls placed by their faces that end on the moved side
  (`changed` names them among the walls that followed); before, they were left where they were.
- Every change's answer (`verdict`, `taped`, `brief`, the refusal for new drawing problems) is
  measured on the plan as the written file reads: a wall placed by its face that takes a type's
  thickness keeps its face in the answer as in the file. No new code in the record.
