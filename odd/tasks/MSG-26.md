# MSG-26: a curved wall that changed is never the same building

## Outcome

Two versions of a plan with a curved wall are compared by where the curve stands, not by its
ends alone. A round room whose radius went from 3 to 4 m reads as grown, its area before and
after with the curved wall's radius before and after, and never as "Same building" with the
drawing moved 1 m east. A curved room moved as it was still reads as the same building moved;
a curved wall drawn the other way round is still the same curve.

## Design

All in the comparison's pairing (`packages/floorplan/src/geometry/diff/`):

- `place.ts`, `lowCorner`: the box a wall takes is its curve's, ends and furthest points
  (`curveExtremes`), so the shifted origin is taken from where the building really stands. A
  whole circle's one end said nothing about its size.
- `place.ts`, `wallsByPlace`: two curved walls stand in the same place only when their centres
  do too, once moved, within `diffPlace`. The ends and the centre give the radius, so that is
  the centre and the radius compared. A straight wall and a curved one with the same ends still
  pair: that is one wall made curved, which the change line says.
- `place.ts`, the earlier plan laid on the later one: a curved wall's centre moves with its
  ends, and a wall drawn the other way round turns the other way (its sweep's sign flipped), so
  the id diff compares the same curve.
- `place.ts`, `piecesOf`: a curved wall is never taken as a piece of a straight one, or the
  other way round.
- `causes.ts`: a room that grew or shrank names the curved walls on its outline whose radius
  changed, with the radius before and after (`diff.cause.radius`, in `messages/en.ts` and
  `es.ts`).
- `summary.ts`: a curved wall's change line says its radius before and after when it changed.

No tolerance is added: `diffPlace` and `diffLength` decide, as for straight walls. No message
code and no convention are added.

## Done

- `src/geometry/__tests__/diff-curved.test.ts`: the round room grown and shrunk, moved as it was,
  a curved wall round another centre, the apse room moved, drawn the other way round and grown.
  Each fails before the change.
- The floorplan package's tests, the type check, lint, the own-words and tolerance tests, and the
  scoreboard.
