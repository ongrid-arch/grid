# WRT-66: a room cut from a corner may span a whole side

## Outcome

A room written `inside <room> corner <c>` may be exactly as wide, or exactly as deep, as the
host's side at that corner: a cupboard as wide as the stair it sits under, a sleeping loft across
the whole width of a cabin. Grid writes it as a strip across the host, with one dividing wall (or
line, `wall 0` or `open`) between them, and the host keeps the rest as a plain rectangle. A size
that, with its wall, comes to the whole side (a 0.75 m cupboard and a 0.10 m wall in a 0.85 m
stair) is read the same way: no wall runs along that side, so the room takes the whole side, and
the answer says so. A cut that does not fit is refused with the sizes that do fit, and a room as
large as its host both ways is refused as filling it. The overlap refusal offers the corner to a
room as wide or as deep as the other, since that now writes.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `placeInside`: each side of the corner is either cut
  short of its end (as before), or spanned: the room's size along it is the side's length, or the
  side's length less the wall. A spanned side is taken whole, the host's corner and the vertex at
  that side's far end are both replaced by the one corner of the strip, which must lie on the
  host's next side. Both sides spanned is refused (`rooms/inside-corner`).
- The refusals and the note move into the message files (`messages/en.ts`, `es.ts`):
  `rooms.inside.noFit` (with the sizes that fit), `rooms.inside.fills` and the guess
  `rooms.inside.wholeSide`. The English count of `compile.ts` in `ownWords.test.ts` drops by the
  one sentence moved.
- The overlap refusal's corner advice (`rooms.overlap.corner`) is offered when the room is no
  larger than the other either way and smaller one way.
- The decision: a size that with its wall comes to the whole side is stretched to the whole side
  rather than refused, because a wall along a side that borders nothing of the host divides
  nothing; the answer names the size it took. The tolerance is the compiler's own `eps()`.

## Done

- `packages/floorplan/src/rooms/__tests__/wholeSideCut.test.ts`: a stair with a cupboard as wide
  as it (0.85 and 0.75 + 0.10), a cabin with a full-width loft (`wall 0`, and 3.53 + 0.07), in
  every corner; the plans validate, the host is a rectangle, one wall divides them; a cut too big
  is refused with the sizes that fit; a room as large as its host is refused; the overlap advice
  offers the corner to a room as wide as the other.
- `tsc` for `packages/floorplan`, lint, the floorplan tests, `ownWords.test.ts`,
  `tolerances.test.ts`.
